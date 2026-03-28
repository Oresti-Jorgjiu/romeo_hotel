/**
 * admin.js – Main admin panel controller for Romeo Hotel.
 * Handles Firebase Auth, real-time data, tabs, CRUD, CSV export.
 */
(function () {
  'use strict';

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  let db = null;
  let auth = null;
  let detector = null;
  let currentTab = 'dashboard';
  let allBookings = {};    // { id: bookingData }
  let allRooms = {};       // { key: roomData }
  let availCalendarDate = new Date();
  availCalendarDate.setDate(1);
  let availSelectedRoom = null;
  let availSelectedDates = new Set();
  let blockedDates = {};   // { date: { reason, source, bookingId? } }

  /* ══════════════════════════════════════════════════
     Bootstrap
     ══════════════════════════════════════════════════ */

  function boot() {
    const config = window.ROMEO_CONFIG && window.ROMEO_CONFIG.firebase;

    if (!config || !config.apiKey) {
      document.body.innerHTML = `
        <div style="padding:40px;text-align:center;font-family:sans-serif;color:#1e293b;">
          <h2>Configuration Missing</h2>
          <p>The admin panel requires the Firebase configuration to be set in <code>assets/js/config.js</code>.</p>
          <p>Please add your Firebase keys there first.</p>
        </div>`;
      return;
    }

    initFirebase(config);
  }

  function initFirebase(config) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      db   = firebase.database();
      auth = firebase.auth();
    } catch (err) {
      showToast('Firebase init failed: ' + err.message, 'error');
      console.error(err);
      return;
    }

    // Listen for auth state
    auth.onAuthStateChanged((user) => {
      if (user) {
        showApp(user);
      } else {
        showScreen('login-screen');
        bindLoginForm();
      }
    });
  }

  /* ══════════════════════════════════════════════════
     Screen management
     ══════════════════════════════════════════════════ */

  function showScreen(id) {
    ['login-screen','app'].forEach(s => {
      const el = document.getElementById(s);
      if (el) el.style.display = (s === id) ? '' : 'none';
    });
  }

  function showApp(user) {
    showScreen('app');
    const emailEl = document.getElementById('admin-user-email');
    if (emailEl) emailEl.textContent = user.email || '';

    // Init modules
    detector = new ConflictDetector(db);

    // Clean expired locks periodically
    detector.cleanExpiredLocks();
    setInterval(() => detector.cleanExpiredLocks(), 5 * 60 * 1000);

    // Bind UI
    bindSidebar();
    bindLogout();
    bindModals();
    bindOneTimeListeners();

    // Load initial data
    loadRooms();
    loadBookings();

    // Load settings into form
    prefillSettingsForms();

    // Start on dashboard
    switchTab('dashboard');
  }

  /* ══════════════════════════════════════════════════
     Login
     ══════════════════════════════════════════════════ */

  function bindLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pwd   = document.getElementById('login-password').value;
      const remem = document.getElementById('login-remember').checked;
      const btn   = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');

      btn.disabled = true; btn.textContent = 'Signing in…';
      errEl.style.display = 'none';

      try {
        const persistence = remem
          ? firebase.auth.Auth.Persistence.LOCAL
          : firebase.auth.Auth.Persistence.SESSION;
        await auth.setPersistence(persistence);
        await auth.signInWithEmailAndPassword(email, pwd);
      } catch (err) {
        errEl.textContent = friendlyAuthError(err.code);
        errEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    };
  }

  function friendlyAuthError(code) {
    const map = {
      'auth/user-not-found': 'No account found with that email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection.'
    };
    return map[code] || 'Sign-in failed. Please try again.';
  }

  function bindLogout() {
    const btn = document.getElementById('logout-btn');
    if (btn) btn.onclick = () => auth.signOut();
  }

  /* Setup form completely removed. */

  /* ══════════════════════════════════════════════════
     Sidebar / tabs
     ══════════════════════════════════════════════════ */

  function bindSidebar() {
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(link.dataset.tab);
        // Close mobile sidebar
        document.getElementById('admin-sidebar')?.classList.remove('open');
      });
    });

    const toggle = document.getElementById('sidebar-toggle');
    if (toggle) {
      toggle.onclick = () => document.getElementById('admin-sidebar')?.classList.toggle('open');
    }

    // Close sidebar when clicking outside (mobile)
    document.addEventListener('click', (e) => {
      const sidebar = document.getElementById('admin-sidebar');
      const toggleBtn = document.getElementById('sidebar-toggle');
      if (sidebar && !sidebar.contains(e.target) && e.target !== toggleBtn) {
        sidebar.classList.remove('open');
      }
    });
  }

  /** Bind event listeners that should only be attached once */
  function bindOneTimeListeners() {
    document.getElementById('refresh-dashboard')?.addEventListener('click', renderDashboard);
    document.getElementById('res-filter-source')?.addEventListener('change', renderReservations);
    document.getElementById('res-filter-status')?.addEventListener('change', renderReservations);
    document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);
  }

  function switchTab(tab) {
    currentTab = tab;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
      link.classList.toggle('active', link.dataset.tab === tab);
    });

    // Show/hide panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tab}`);
    });

    // Tab-specific init
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'rooms') renderRoomsTable();
    if (tab === 'availability') renderAvailabilityTab();
    if (tab === 'reservations') renderReservations();
    if (tab === 'settings') { /* already pre-filled */ }
  }

  /* ══════════════════════════════════════════════════
     Data loading (real-time)
     ══════════════════════════════════════════════════ */

  function loadRooms() {
    // Seed from window.ROMEO_CONFIG first
    const cfg = window.ROMEO_CONFIG;
    if (cfg && cfg.roomPrices) {
      Object.entries(cfg.roomPrices).forEach(([key, r]) => {
        allRooms[key] = Object.assign({ key, available: true }, r);
      });
    }

    // Override with Firebase live data
    db.ref('rooms').on('value', (snap) => {
      const data = snap.val() || {};
      Object.entries(data).forEach(([key, val]) => {
        allRooms[key] = Object.assign(allRooms[key] || { key }, val);
      });
      if (currentTab === 'rooms') renderRoomsTable();
    });
  }

  function loadBookings() {
    db.ref('bookings').on('value', (snap) => {
      allBookings = snap.val() || {};
      if (currentTab === 'dashboard') renderDashboard();
      if (currentTab === 'reservations') renderReservations();
    });
  }



  /* ══════════════════════════════════════════════════
     Dashboard
     ══════════════════════════════════════════════════ */

  function renderDashboard() {
    const bookings = Object.values(allBookings);
    const pending   = bookings.filter(b => b.status === 'pending').length;
    const confirmed = bookings.filter(b => b.status === 'confirmed').length;
    const revenue   = bookings
      .filter(b => b.status !== 'cancelled')
      .reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    setText('stat-bookings', bookings.length);
    setText('stat-pending',   pending);
    setText('stat-confirmed', confirmed);
    setText('stat-revenue',   '€' + revenue.toLocaleString());

    renderRecentBookings();
  }

  function renderRecentBookings() {
    const list = document.getElementById('recent-bookings-list');
    if (!list) return;
    const recent = Object.entries(allBookings)
      .sort(([,a],[,b]) => (b.createdAt||0) - (a.createdAt||0))
      .slice(0, 8);

    if (!recent.length) { list.innerHTML = '<div class="empty-state">No bookings yet.</div>'; return; }

    list.innerHTML = recent.map(([id, b]) => `
      <div class="recent-booking-row">
        <div>
          <div class="rbr-name">${esc(b.guestName || '—')}</div>
          <div class="rbr-room">${esc(b.roomName || '—')}</div>
          <div class="rbr-dates">${b.checkIn||'?'} → ${b.checkOut||'?'}</div>
        </div>
        <span class="badge ${b.status||''}">${b.status||'—'}</span>
        <span class="badge ${b.source?.replace('.','') || ''}">${b.source||'—'}</span>
        <button class="admin-btn secondary sm" data-view-booking="${id}">View</button>
      </div>`).join('');

    list.querySelectorAll('[data-view-booking]').forEach(btn => {
      btn.onclick = () => showBookingDetail(btn.dataset.viewBooking);
    });
  }



  /* ══════════════════════════════════════════════════
     Rooms & Prices
     ══════════════════════════════════════════════════ */

  function renderRoomsTable() {
    const tbody = document.getElementById('rooms-table-body');
    if (!tbody) return;

    const rooms = Object.entries(allRooms);
    if (!rooms.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No rooms configured.</td></tr>'; return; }

    tbody.innerHTML = rooms.map(([key, r]) => `
      <tr data-room-key="${key}">
        <td><strong>${esc(r.name || key)}</strong></td>
        <td><input type="number" class="room-price-input" data-key="${key}" value="${r.price||0}" min="0" step="1" style="width:90px"></td>
        <td>${r.size || '—'}</td>
        <td>${r.maxGuests || '—'}</td>
        <td>
          <label class="admin-toggle">
            <input type="checkbox" class="room-avail-toggle" data-key="${key}" ${r.available !== false ? 'checked' : ''}>
            ${r.available !== false ? 'Yes' : 'No'}
          </label>
        </td>
      </tr>`).join('');

    document.getElementById('save-prices-btn')?.removeEventListener('click', savePrices);
    document.getElementById('save-prices-btn')?.addEventListener('click', savePrices);

    tbody.querySelectorAll('.room-avail-toggle').forEach(cb => {
      cb.onchange = () => {
        cb.nextSibling.textContent = cb.checked ? ' Yes' : ' No';
      };
    });
  }

  async function savePrices() {
    const updates = {};
    document.querySelectorAll('.room-price-input').forEach(input => {
      const key = input.dataset.key;
      updates[`rooms/${key}/price`] = parseFloat(input.value) || 0;
    });
    document.querySelectorAll('.room-avail-toggle').forEach(cb => {
      const key = cb.dataset.key;
      updates[`rooms/${key}/available`] = cb.checked;
      if (!updates[`rooms/${key}/name`]) {
        updates[`rooms/${key}/name`] = allRooms[key]?.name || key;
      }
    });

    try {
      await db.ref().update(updates);
      showToast('Prices saved successfully.', 'success');
    } catch (err) {
      showToast('Failed to save prices: ' + err.message, 'error');
    }
  }

  /* ══════════════════════════════════════════════════
     Availability Calendar (admin)
     ══════════════════════════════════════════════════ */

  function renderAvailabilityTab() {
    // Populate room select
    const sel = document.getElementById('avail-room-select');
    if (sel && sel.options.length <= 1) {
      Object.entries(allRooms).forEach(([key, r]) => {
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = r.name || key;
        sel.appendChild(opt);
      });
      sel.onchange = () => {
        availSelectedRoom = sel.value;
        availSelectedDates.clear();
        loadAvailabilityForRoom(availSelectedRoom);
      };
      if (availSelectedRoom) sel.value = availSelectedRoom;
    }

    document.getElementById('apply-block-btn')?.removeEventListener('click', applyBlock);
    document.getElementById('apply-block-btn')?.addEventListener('click', applyBlock);

    renderAdminCalendar();
  }

  function loadAvailabilityForRoom(roomKey) {
    if (!roomKey) return;
    db.ref(`blocked-dates/${roomKey}`).on('value', (snap) => {
      blockedDates = snap.val() || {};
      renderAdminCalendar();
    });
  }

  function renderAdminCalendar() {
    const container = document.getElementById('avail-calendar-container');
    if (!container) return;

    if (!availSelectedRoom) {
      container.innerHTML = '<div class="empty-state">Select a room to view availability.</div>';
      return;
    }

    const today = toYMD(new Date());
    let html = '<div class="admin-cal-months">';

    for (let mi = 0; mi < 3; mi++) {
      const d = addMonths(availCalendarDate, mi);
      const year = d.getFullYear(), month = d.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      html += `<div class="admin-cal-month">
        <div class="admin-cal-title">${MONTH_NAMES[month]} ${year}</div>
        <div class="admin-cal-grid">
          ${DAY_NAMES.map(n => `<div class="admin-cal-weekday">${n}</div>`).join('')}
          ${Array(firstDay).fill('<div></div>').join('')}`;

      for (let day = 1; day <= daysInMonth; day++) {
        const ymd = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const bd = blockedDates[ymd];
        const src = bd ? bd.source || 'website' : null;
        const classes = [
          'admin-cal-day',
          ymd < today ? 'past' : '',
          ymd === today ? 'today' : '',
          bd ? `blocked-${src === 'booking.com' ? 'bookingcom' : src === 'maintenance' ? 'maintenance' : 'website'}` : '',
          availSelectedDates.has(ymd) ? 'selected' : ''
        ].filter(Boolean).join(' ');

        html += `<button class="${classes}" data-date="${ymd}" type="button" title="${bd ? (bd.reason || 'blocked') + ' (' + (bd.source||'') + ')' : 'Available'}">${day}</button>`;
      }

      html += '</div></div>';
    }

    html += `</div>
      <div style="display:flex;gap:10px;padding:10px 0">
        <button class="admin-btn secondary sm" id="avail-prev">← Prev</button>
        <button class="admin-btn secondary sm" id="avail-next">Next →</button>
      </div>`;

    container.innerHTML = html;

    // Bind day clicks for selection
    container.querySelectorAll('.admin-cal-day:not(.past)').forEach(btn => {
      btn.onclick = () => {
        const date = btn.dataset.date;
        if (availSelectedDates.has(date)) {
          availSelectedDates.delete(date);
          btn.classList.remove('selected');
        } else {
          availSelectedDates.add(date);
          btn.classList.add('selected');
        }
      };
    });

    container.querySelector('#avail-prev')?.addEventListener('click', () => {
      availCalendarDate = addMonths(availCalendarDate, -1);
      renderAdminCalendar();
    });
    container.querySelector('#avail-next')?.addEventListener('click', () => {
      availCalendarDate = addMonths(availCalendarDate, 1);
      renderAdminCalendar();
    });

    // Bind block/unblock buttons
    document.getElementById('block-dates-btn')?.addEventListener('click', () => applyBlockSelected('maintenance'));
    document.getElementById('unblock-dates-btn')?.addEventListener('click', unblockSelected);
  }

  async function applyBlockSelected(reason) {
    if (!availSelectedRoom || !availSelectedDates.size) {
      showToast('Select a room and at least one date first.', 'error'); return;
    }
    const updates = {};
    availSelectedDates.forEach(date => {
      updates[`blocked-dates/${availSelectedRoom}/${date}`] = { reason, source: 'admin' };
    });
    try {
      await db.ref().update(updates);
      availSelectedDates.clear();
      showToast(`${Object.keys(updates).length} date(s) blocked.`, 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  async function unblockSelected() {
    if (!availSelectedRoom || !availSelectedDates.size) {
      showToast('Select a room and at least one date first.', 'error'); return;
    }
    const updates = {};
    availSelectedDates.forEach(date => { updates[`blocked-dates/${availSelectedRoom}/${date}`] = null; });
    try {
      await db.ref().update(updates);
      availSelectedDates.clear();
      showToast(`${Object.keys(updates).length} date(s) unblocked.`, 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  async function applyBlock() {
    const from   = document.getElementById('block-from')?.value;
    const to     = document.getElementById('block-to')?.value;
    const reason = document.getElementById('block-reason')?.value || 'maintenance';
    const roomKey = document.getElementById('avail-room-select')?.value;

    if (!roomKey) { showToast('Select a room first.', 'error'); return; }
    if (!from || !to) { showToast('Please select a date range.', 'error'); return; }
    if (from >= to)  { showToast('End date must be after start date.', 'error'); return; }

    const dates = dateRange(from, to);
    const updates = {};
    dates.forEach(d => { updates[`blocked-dates/${roomKey}/${d}`] = { reason, source: 'admin' }; });

    try {
      await db.ref().update(updates);
      showToast(`${dates.length} date(s) blocked.`, 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  /* ══════════════════════════════════════════════════
     Reservations
     ══════════════════════════════════════════════════ */

  function renderReservations() {
    const tbody = document.getElementById('reservations-body');
    if (!tbody) return;

    const sourceFilter = document.getElementById('res-filter-source')?.value || '';
    const statusFilter = document.getElementById('res-filter-status')?.value || '';

    let entries = Object.entries(allBookings);
    if (sourceFilter) entries = entries.filter(([,b]) => b.source === sourceFilter);
    if (statusFilter) entries = entries.filter(([,b]) => b.status === statusFilter);
    entries.sort(([,a],[,b]) => (b.createdAt||0) - (a.createdAt||0));

    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No reservations found.</td></tr>';
      return;
    }

    tbody.innerHTML = entries.map(([id, b]) => `
      <tr>
        <td><code style="font-size:.78rem">${id.slice(0,8)}…</code></td>
        <td>${esc(b.guestName||'—')}</td>
        <td>${esc(b.roomName||'—')}</td>
        <td>${b.checkIn||'—'}</td>
        <td>${b.checkOut||'—'}</td>
        <td>${b.guests||'—'}</td>
        <td>€${b.totalPrice||0}</td>
        <td><span class="badge ${(b.source||'').replace('.','')}">${b.source||'—'}</span></td>
        <td><span class="badge ${b.status||''}">${b.status||'—'}</span></td>
        <td>
          <button class="admin-btn secondary sm" data-view-booking="${id}">View</button>
          ${b.status !== 'confirmed' ? `<button class="admin-btn primary sm" data-confirm-booking="${id}">✓</button>` : ''}
          ${b.status !== 'cancelled' ? `<button class="admin-btn danger sm" data-cancel-booking="${id}">✕</button>` : ''}
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-view-booking]').forEach(btn => {
      btn.onclick = () => showBookingDetail(btn.dataset.viewBooking);
    });
    tbody.querySelectorAll('[data-confirm-booking]').forEach(btn => {
      btn.onclick = () => updateBookingStatus(btn.dataset.confirmBooking, 'confirmed');
    });
    tbody.querySelectorAll('[data-cancel-booking]').forEach(btn => {
      btn.onclick = () => {
        confirmDialog('Cancel Booking', 'Are you sure you want to cancel this booking?', () => {
          updateBookingStatus(btn.dataset.cancelBooking, 'cancelled');
        });
      };
    });
  }

  async function updateBookingStatus(bookingId, status) {
    try {
      await db.ref(`bookings/${bookingId}/status`).set(status);
      showToast(`Booking ${status}.`, 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  function showBookingDetail(bookingId) {
    const b = allBookings[bookingId];
    if (!b) return;

    const content = document.getElementById('booking-detail-content');
    if (content) {
      content.innerHTML = `
        <dl class="booking-detail-dl">
          <dt>Booking ID</dt><dd><code>${bookingId}</code></dd>
          <dt>Room</dt><dd>${esc(b.roomName||'—')}</dd>
          <dt>Check-in</dt><dd>${b.checkIn||'—'}</dd>
          <dt>Check-out</dt><dd>${b.checkOut||'—'}</dd>
          <dt>Nights</dt><dd>${b.checkIn && b.checkOut ? Math.round((new Date(b.checkOut)-new Date(b.checkIn))/86400000) : '—'}</dd>
          <dt>Guests</dt><dd>${b.guests||'—'}</dd>
          <dt>Total</dt><dd>€${b.totalPrice||0}</dd>
          <dt>Guest name</dt><dd>${esc(b.guestName||'—')}</dd>
          <dt>Email</dt><dd>${esc(b.guestEmail||'—')}</dd>
          <dt>Phone</dt><dd>${esc(b.guestPhone||'—')}</dd>
          <dt>Source</dt><dd><span class="badge ${(b.source||'').replace('.','')}">${b.source||'—'}</span></dd>
          <dt>Status</dt><dd><span class="badge ${b.status||''}">${b.status||'—'}</span></dd>
          ${b.notes ? `<dt>Notes</dt><dd>${esc(b.notes)}</dd>` : ''}
          <dt>Created</dt><dd>${b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'}</dd>
          ${b.bookingComId ? `<dt>Booking.com ID</dt><dd>${esc(b.bookingComId)}</dd>` : ''}
        </dl>`;
    }

    const actions = document.getElementById('booking-detail-actions');
    if (actions) {
      actions.innerHTML = `
        ${b.status !== 'confirmed' ? `<button class="admin-btn primary" data-action-confirm="${bookingId}">Confirm</button>` : ''}
        ${b.status !== 'cancelled' ? `<button class="admin-btn danger" data-action-cancel="${bookingId}">Cancel</button>` : ''}
        <button class="admin-btn secondary" data-close-modal>Close</button>`;

      actions.querySelector(`[data-action-confirm="${bookingId}"]`)?.addEventListener('click', () => {
        updateBookingStatus(bookingId, 'confirmed');
        closeAllModals();
      });
      actions.querySelector(`[data-action-cancel="${bookingId}"]`)?.addEventListener('click', () => {
        closeAllModals();
        confirmDialog('Cancel Booking', 'Cancel this booking?', () => updateBookingStatus(bookingId, 'cancelled'));
      });
    }

    openModal('booking-detail-modal');
  }



  /* ══════════════════════════════════════════════════
     Settings
     ══════════════════════════════════════════════════ */

  function prefillSettingsForms() {
    const settings = loadSettings() || {};
    const notif = settings.notifications || {};
    setValue('s-ownerEmail', notif.ownerEmail);

    const syncAlertsEl = document.getElementById('s-syncAlerts');
    const conflictAlertsEl = document.getElementById('s-conflictAlerts');
    if (syncAlertsEl) syncAlertsEl.checked = notif.syncAlerts !== false;
    if (conflictAlertsEl) conflictAlertsEl.checked = notif.conflictAlerts !== false;

    bindSettingsButtons();
  }

  function bindSettingsButtons() {
    document.getElementById('save-notif-btn')?.addEventListener('click', saveNotifSettings);
  }

  async function saveNotifSettings() {
    const settings = loadSettings() || {};
    settings.notifications = {
      ownerEmail:      document.getElementById('s-ownerEmail').value.trim(),
      syncAlerts:      document.getElementById('s-syncAlerts').checked,
      conflictAlerts:  document.getElementById('s-conflictAlerts').checked
    };
    saveSettings(settings);
    try {
      await db.ref('settings/notifications').set(settings.notifications);
    } catch (e) { /* ignore */ }
    showToast('Notification settings saved.', 'success');
  }

  /* ══════════════════════════════════════════════════
     Modals
     ══════════════════════════════════════════════════ */

  function bindModals() {
    document.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-close-modal') || e.target.classList.contains('admin-modal')) {
        closeAllModals();
      }
    });
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = '';
  }

  function closeAllModals() {
    document.querySelectorAll('.admin-modal').forEach(m => m.style.display = 'none');
  }

  let _confirmCallback = null;
  function confirmDialog(title, msg, onOk) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = msg;
    _confirmCallback = onOk;
    openModal('confirm-modal');
    document.getElementById('confirm-ok').onclick = () => {
      closeAllModals();
      if (_confirmCallback) _confirmCallback();
    };
  }

  /* ══════════════════════════════════════════════════
     CSV export
     ══════════════════════════════════════════════════ */

  function exportCSV() {
    const headers = ['ID','Guest','Email','Phone','Room','Check-in','Check-out','Nights','Guests','Total','Currency','Source','Status','Created'];
    const rows = Object.entries(allBookings).map(([id, b]) => [
      id, b.guestName||'', b.guestEmail||'', b.guestPhone||'', b.roomName||'',
      b.checkIn||'', b.checkOut||'',
      (b.checkIn && b.checkOut) ? Math.round((new Date(b.checkOut)-new Date(b.checkIn))/86400000) : '',
      b.guests||'', b.totalPrice||0, b.currency||'EUR', b.source||'', b.status||'',
      b.createdAt ? new Date(b.createdAt).toISOString() : ''
    ]);

    const csvContent = [headers, ...rows].map(row =>
      row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `romeo-bookings-${toYMD(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported.', 'success');
  }

  /* ══════════════════════════════════════════════════
     Toasts
     ══════════════════════════════════════════════════ */

  function showToast(msg, type = 'info') {
    const container = document.getElementById('admin-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  /* ══════════════════════════════════════════════════
     localStorage helpers
     ══════════════════════════════════════════════════ */

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem('romeo_admin_settings')); } catch (e) { return {}; }
  }
  function saveSettings(s) {
    try { localStorage.setItem('romeo_admin_settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  /* ══════════════════════════════════════════════════
     Utility helpers
     ══════════════════════════════════════════════════ */

  function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addMonths(date, n) {
    const d = new Date(date);
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    return d;
  }

  function dateRange(from, to) {
    const dates = [];
    const cur = new Date(from);
    while (toYMD(cur) < to) {
      dates.push(toYMD(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  }

  /* ══════════════════════════════════════════════════
     Start
     ══════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
