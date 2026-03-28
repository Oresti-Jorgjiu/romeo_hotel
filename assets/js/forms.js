/**
 * RomeoForms – multi-step booking wizard for Romeo Hotel.
 * Steps: 1) Dates + Room  2) Guest details  3) Review + Submit
 * Saves progress to localStorage. Checks availability via Firebase.
 * 
 */
(function (global) {
  'use strict';

  const LS_KEY = 'romeo_booking_draft';

  const _lang = (document.documentElement.lang || 'en').slice(0, 2);
  const T = {
    en: {
      step1: 'Dates & Room', step2: 'Guest Details', step3: 'Review & Book',
      chooseTitle: 'Choose Your Dates & Room',
      checkin: 'Check-in', checkout: 'Check-out', roomType: 'Room type',
      selectRoom: '— Select a room —', perNight: '/night', guests: 'Guests',
      cont: 'Continue →', back: '← Back', review: 'Review →',
      yourDetails: 'Your Details', fullName: 'Full name', email: 'Email',
      phone: 'Phone', specialReqs: 'Special requests', optional: '(optional)',
      reviewTitle: 'Review & Confirm',
      stayDetails: 'Stay details', room: 'Room', nights: 'Nights',
      guestInfo: 'Guest info', name: 'Name', requests: 'Requests',
      priceBreakdown: 'Price breakdown', night: 'night', nightPlural: 'nights',
      taxesFees: 'Taxes & fees', included: 'Included', total: 'Total',
      note: 'Note:', noteText: 'Your booking request will be sent directly to Romeo Hotel. The owner will confirm availability and contact you via email or phone.',
      sendBooking: 'Send Booking Request', checkingAvail: 'Checking availability…',
      bookingSent: 'Booking Request Sent!', refNumber: 'Your reference number is',
      bookingReceived: 'Your booking request has been received. The hotel will confirm via email or phone within a few hours.',
      backHome: 'Back to Home', systemUnavailable: 'Booking system is currently unavailable. Please try again later.',
      selectRoomErr: 'Please select a room type.', selectCheckinErr: 'Please select a check-in date.',
      selectCheckoutErr: 'Please select a check-out date.', checkoutAfter: 'Check-out must be after check-in.',
      enterName: 'Please enter your full name.', enterPhone: 'Please enter your phone number.',
      sending: 'Sending...', submitRequest: 'Submit Request',
      reqFieldsErr: 'Please complete all required fields.',
      bookingSentLegacy: 'Booking sent. The hotel will confirm via email or phone.',
      loadingPayment: 'Loading secure payment...',
      paymentError: 'Payment could not be completed. The pending booking will be kept, please try again or contact the hotel.',
      payNow: 'Pay and Book Now'
    },
    sq: {
      step1: 'Datat & Dhoma', step2: 'Detajet e Mysafirit', step3: 'Rishiko & Rezervo',
      chooseTitle: 'Zgjidhni Datat & Dhomën',
      checkin: 'Check-in', checkout: 'Check-out', roomType: 'Lloji i dhomës',
      selectRoom: '— Zgjidhni një dhomë —', perNight: '/natë', guests: 'Mysafirë',
      cont: 'Vazhdo →', back: '← Kthehu', review: 'Rishiko →',
      yourDetails: 'Detajet Tuaja', fullName: 'Emri i plotë', email: 'Email',
      phone: 'Telefon', specialReqs: 'Kërkesa speciale', optional: '(opsionale)',
      reviewTitle: 'Rishiko & Konfirmo',
      stayDetails: 'Detajet e qëndrimit', room: 'Dhoma', nights: 'Netë',
      guestInfo: 'Info mysafiri', name: 'Emri', requests: 'Kërkesat',
      priceBreakdown: 'Detajet e çmimit', night: 'natë', nightPlural: 'netë',
      taxesFees: 'Taksa & tarifa', included: 'Të përfshira', total: 'Totali',
      note: 'Shënim:', noteText: 'Kërkesa juaj do të dërgohet direkt në Hotel Romeo. Pronari do të konfirmojë disponueshmërinë dhe do t\'ju kontaktojë me email ose telefon.',
      sendBooking: 'Dërgo Kërkesën për Rezervim', checkingAvail: 'Duke kontrolluar disponueshmërinë…',
      bookingSent: 'Kërkesa për Rezervim u Dërgua!', refNumber: 'Numri juaj i referencës është',
      bookingReceived: 'Kërkesa juaj është marrë. Hoteli do t\'ju konfirmojë me email ose telefon brenda disa orëve.',
      backHome: 'Kthehu në Kreu', systemUnavailable: 'Sistemi i rezervimeve nuk është i disponueshëm. Provoni përsëri më vonë.',
      selectRoomErr: 'Ju lutem zgjidhni llojin e dhomës.', selectCheckinErr: 'Ju lutem zgjidhni datën e check-in.',
      selectCheckoutErr: 'Ju lutem zgjidhni datën e check-out.', checkoutAfter: 'Check-out duhet të jetë pas check-in.',
      enterName: 'Ju lutem vendosni emrin tuaj të plotë.', enterPhone: 'Ju lutem vendosni numrin e telefonit.',
      sending: 'Duke dërguar...', submitRequest: 'Dërgo Kërkesën',
      reqFieldsErr: 'Ju lutem plotësoni të gjitha fushat e detyrueshme.',
      bookingSentLegacy: 'Kërkesa u dërgua. Hoteli do t\'ju konfirmojë me email ose telefon.',
      loadingPayment: 'Duke ngarkuar pagesën e sigurt...',
      paymentError: 'Pagesa nuk u krye me sukses. Rezervimi në pritje do të ruhet, ju lutem provoni përsëri ose kontaktoni hotelin.',
      payNow: 'Paguaj dhe Rezervo'
    }
  };
  const t = T[_lang] || T.en;

  function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  class RomeoForms {
    constructor() {
      this._container = null;
      this._step = 1;
      this._calendar = null;
      this._data = {
        checkIn: null, checkOut: null, nights: 0, roomKey: null, roomName: '',
        guests: 2, name: '', email: '', phone: '', message: '', price: 0, currency: 'EUR'
      };
    }

    init(container) {
      if (typeof container === 'string') container = document.querySelector(container);
      if (!container) { console.warn('RomeoForms: container not found'); return this; }
      this._container = container;
      this._restoreDraft();
      this._loadLivePrices();
      this._render();
      return this;
    }

    /* ── restore / save draft ─────────────────────────────── */

    _saveDraft() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this._data)); } catch (e) { /* ignore */ }
    }

    _restoreDraft() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          // Only restore non-expired drafts (24 hours)
          if (saved && saved._savedAt && (Date.now() - saved._savedAt) < 86400000) {
            Object.assign(this._data, saved);
          }
        }
      } catch (e) { /* ignore */ }

      // Pre-fill from URL params (?room=...)
      try {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room && window.ROMEO_CONFIG && window.ROMEO_CONFIG.roomPrices) {
          const entry = Object.entries(window.ROMEO_CONFIG.roomPrices)
            .find(([, v]) => v.name === room);
          if (entry) {
            this._data.roomKey = entry[0];
            this._data.roomName = entry[1].name;
            this._data.price = entry[1].price;
            this._data.currency = entry[1].currency;
          }
        }
      } catch (e) { /* ignore */ }
    }

    _clearDraft() {
      try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
    }

    _loadLivePrices() {
      try {
        const cfg = window.ROMEO_CONFIG;
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && cfg && cfg.firebase && cfg.firebase.databaseURL) {
          const db = firebase.database();
          const ref = db.ref('rooms');
          ref.on('value', (snap) => {
            const data = snap.val();
            if (data && cfg.roomPrices) {
              let updated = false;
              Object.entries(data).forEach(([key, val]) => {
                if (cfg.roomPrices[key]) {
                  if (val.price !== undefined && cfg.roomPrices[key].price !== val.price) {
                    cfg.roomPrices[key].price = val.price;
                    updated = true;
                  }
                  if (val.available !== undefined && cfg.roomPrices[key].available !== val.available) {
                    cfg.roomPrices[key].available = val.available;
                    updated = true;
                  }
                }
              });

              if (updated) {
                 // Always keep the internal data in sync with live prices
                 if (this._data.roomKey && cfg.roomPrices[this._data.roomKey]) {
                   this._data.price = cfg.roomPrices[this._data.roomKey].price;
                   if (this._calendar) {
                     this._calendar.options.price = this._data.price;
                     this._calendar.render();
                   }
                 }

                 // If currently on step 1, visibly update the dropdown
                 if (this._step === 1 && this._container) {
                   const select = this._container.querySelector('#w-room');
                   if (select) {
                     const oldVal = select.value;
                     select.innerHTML = Object.entries(cfg.roomPrices)
                       .filter(([, r]) => r.available !== false)
                       .map(([key, r]) => `<option value="${key}">${r.name} – €${r.price}${t.perNight}</option>`)
                       .join('');
                     select.value = oldVal;
                   }
                 }
                 
                 // If currently on step 3, visibly update the price breakdown
                 if (this._step === 3 && this._container) {
                   this._render(); // Re-render step 3 to show the new price total
                 }
              }
            }
          });
          // Note: purposefully not off-ing the listener because we want the price to stay updated
          // if the user lingers on the checkout form.
        }
      } catch (e) {
        console.warn('RomeoForms: Failed to load live prices', e);
      }
    }

    /* ── main render ──────────────────────────────────────── */

    _render() {
      const steps = [t.step1, t.step2, t.step3];
      const progressHTML = `
        <div class="wizard-progress">
          ${steps.map((s, i) => `
            <div class="wizard-step-indicator ${i + 1 === this._step ? 'active' : ''} ${i + 1 < this._step ? 'done' : ''}">
              <span class="wsi-num">${i + 1 < this._step ? '✓' : i + 1}</span>
              <span class="wsi-label">${s}</span>
            </div>
            ${i < steps.length - 1 ? '<div class="wsi-connector"></div>' : ''}
          `).join('')}
        </div>`;

      let bodyHTML = '';
      if (this._step === 1) bodyHTML = this._renderStep1();
      else if (this._step === 2) bodyHTML = this._renderStep2();
      else bodyHTML = this._renderStep3();

      this._container.innerHTML = `
        <div class="booking-wizard">
          ${progressHTML}
          <div class="wizard-body">
            ${bodyHTML}
          </div>
        </div>`;

      this._bindStep();

      // Mount calendar on step 1
      if (this._step === 1) this._mountCalendar();
    }

    /* ── step 1: dates + room ─────────────────────────────── */

    _renderStep1() {
      const cfg = window.ROMEO_CONFIG || {};
      const roomOptions = cfg.roomPrices
        ? Object.entries(cfg.roomPrices)
            .filter(([, r]) => r.available !== false)
            .map(([key, r]) =>
              `<option value="${key}" ${this._data.roomKey === key ? 'selected' : ''}>${r.name} – €${r.price}${t.perNight}</option>`
            ).join('')
        : '';

      return `
        <h2 class="wizard-title">${t.chooseTitle}</h2>
        <div id="wizard-calendar-mount"></div>
        <div class="form-grid" style="margin-top:16px">
          <div class="field">
            <label for="w-checkin">${t.checkin} *</label>
            <input id="w-checkin" name="checkin" type="date" value="${this._data.checkIn || ''}" required>
          </div>
          <div class="field">
            <label for="w-checkout">${t.checkout} *</label>
            <input id="w-checkout" name="checkout" type="date" value="${this._data.checkOut || ''}" required>
          </div>
        </div>
        <div class="field" style="margin-top:14px">
          <label for="w-room">${t.roomType} *</label>
          <select id="w-room" name="room" required>
            <option value="">${t.selectRoom}</option>
            ${roomOptions}
          </select>
        </div>
        <div class="field" style="margin-top:14px">
          <label>${t.guests}</label>
          <div class="guest-counter">
            <button class="gc-btn" type="button" data-gc="-">−</button>
            <span class="gc-count">${this._data.guests}</span>
            <button class="gc-btn" type="button" data-gc="+">+</button>
          </div>
        </div>
        <div class="wizard-nav">
          <span></span>
          <button class="btn primary wizard-next" type="button">${t.cont}</button>
        </div>`;
    }

    _mountCalendar() {
      const mount = this._container.querySelector('#wizard-calendar-mount');
      if (!mount) return;

      const calOptions = {
        roomKey: this._data.roomKey || null,
        price: this._data.price || null,
        showPriceSummary: true,
        onSelect: (detail) => {
          this._data.checkIn = detail.checkIn;
          this._data.checkOut = detail.checkOut;
          this._data.nights = detail.nights;
          this._data.price = detail.price;
          // Sync to date inputs
          const ci = this._container.querySelector('#w-checkin');
          const co = this._container.querySelector('#w-checkout');
          if (ci && detail.checkIn) ci.value = detail.checkIn;
          if (co && detail.checkOut) co.value = detail.checkOut;
          this._saveDraft();
        }
      };

      if (typeof global.RomeoCalendar === 'function') {
        this._calendar = new global.RomeoCalendar(calOptions);
        this._calendar.init(mount);
      }
    }

    /* ── step 2: guest details ────────────────────────────── */

    _renderStep2() {
      return `
        <h2 class="wizard-title">${t.yourDetails}</h2>
        <div class="form-grid">
          <div class="field">
            <label for="w-name">${t.fullName} *</label>
            <input id="w-name" name="name" type="text" value="${this._esc(this._data.name)}" required>
          </div>
          <div class="field">
            <label for="w-email">${t.email}</label>
            <input id="w-email" name="email" type="email" value="${this._esc(this._data.email)}">
          </div>
          <div class="field">
            <label for="w-phone">${t.phone} *</label>
            <input id="w-phone" name="phone" type="tel" value="${this._esc(this._data.phone)}" required>
          </div>
        </div>
        <div class="field" style="margin-top:14px">
          <label for="w-message">${t.specialReqs} <span class="field-hint">${t.optional}</span></label>
          <textarea id="w-message" name="message" maxlength="500">${this._esc(this._data.message)}</textarea>
          <span class="char-counter"><span id="w-msg-count">${(this._data.message||'').length}</span>/500</span>
        </div>
        <div class="wizard-nav">
          <button class="btn secondary wizard-back" type="button">${t.back}</button>
          <button class="btn primary wizard-next" type="button">${t.review}</button>
        </div>`;
    }

    /* ── step 3: review ───────────────────────────────────── */

    _renderStep3() {
      const { checkIn, checkOut, nights, roomName, guests, name, email, phone, message, price, currency } = this._data;
      const symbol = currency === 'EUR' ? '€' : currency;
      const total = price && nights ? price * nights : 0;

      const nightLabel = nights !== 1 ? t.nightPlural : t.night;

      return `
        <h2 class="wizard-title">${t.reviewTitle}</h2>
        <div class="review-grid">
          <div class="review-section">
            <h3>${t.stayDetails}</h3>
            <dl class="review-dl">
              <dt>${t.room}</dt><dd>${roomName || '—'}</dd>
              <dt>${t.checkin}</dt><dd>${checkIn || '—'}</dd>
              <dt>${t.checkout}</dt><dd>${checkOut || '—'}</dd>
              <dt>${t.nights}</dt><dd>${nights || '—'}</dd>
              <dt>${t.guests}</dt><dd>${guests}</dd>
            </dl>
          </div>
          <div class="review-section">
            <h3>${t.guestInfo}</h3>
            <dl class="review-dl">
              <dt>${t.name}</dt><dd>${this._esc(name) || '—'}</dd>
              <dt>${t.email}</dt><dd>${this._esc(email) || '—'}</dd>
              <dt>${t.phone}</dt><dd>${this._esc(phone) || '—'}</dd>
              ${message ? `<dt>${t.requests}</dt><dd>${this._esc(message)}</dd>` : ''}
            </dl>
          </div>
          ${price ? `
          <div class="review-section price-breakdown">
            <h3>${t.priceBreakdown}</h3>
            <dl class="review-dl">
              <dt>${symbol}${price} × ${nights} ${nightLabel}</dt><dd>${symbol}${total}</dd>
              <dt>${t.taxesFees}</dt><dd>${t.included}</dd>
              <dt class="total-label">${t.total}</dt><dd class="total-value">${symbol}${total}</dd>
            </dl>
          </div>` : ''}
        </div>
        <div class="review-note">
          <strong>${t.note}</strong> ${t.noteText}
        </div>
        <div id="wizard-availability-status"></div>
        <div class="wizard-nav">
          <button class="btn secondary wizard-back" type="button">${t.back}</button>
          <button class="btn primary wizard-submit" type="button" id="wizard-submit-btn">
            ${t.sendBooking}
          </button>
        </div>`;
    }

    /* ── binding ─────────────────────────────────────────── */

    _bindStep() {
      const c = this._container;

      // Back button
      c.querySelector('.wizard-back')?.addEventListener('click', () => {
        this._step--;
        this._render();
      });

      // Next button (steps 1 & 2)
      c.querySelector('.wizard-next')?.addEventListener('click', () => {
        if (!this._validateStep()) return;
        this._gatherStep();
        this._step++;
        this._render();
      });

      // Submit button (step 3)
      c.querySelector('.wizard-submit')?.addEventListener('click', () => this._submit());

      // Guest counter
      c.querySelectorAll('.gc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const delta = btn.dataset.gc === '+' ? 1 : -1;
          this._data.guests = Math.max(1, Math.min(8, (this._data.guests || 2) + delta));
          const display = c.querySelector('.gc-count');
          if (display) display.textContent = this._data.guests;
        });
      });

      // Date inputs sync
      c.querySelector('#w-checkin')?.addEventListener('change', (e) => {
        this._data.checkIn = e.target.value;
        this._saveDraft();
      });
      c.querySelector('#w-checkout')?.addEventListener('change', (e) => {
        this._data.checkOut = e.target.value;
        if (this._data.checkIn && this._data.checkOut) {
          this._data.nights = daysBetween(this._data.checkIn, this._data.checkOut);
        }
        this._saveDraft();
      });

      // Room select
      c.querySelector('#w-room')?.addEventListener('change', (e) => {
        const key = e.target.value;
        this._data.roomKey = key;
        const cfg = window.ROMEO_CONFIG;
        if (key && cfg && cfg.roomPrices && cfg.roomPrices[key]) {
          this._data.roomName = cfg.roomPrices[key].name;
          this._data.price = cfg.roomPrices[key].price;
          this._data.currency = cfg.roomPrices[key].currency;
        }
        // Reinit calendar with new room key
        if (this._calendar) {
          this._calendar.options.roomKey = key;
          this._calendar.options.price = this._data.price;
          this._calendar._loadBlockedDates();
          this._calendar.render();
        }
        this._saveDraft();
      });

      // Textarea char counter
      const textarea = c.querySelector('#w-message');
      const counter = c.querySelector('#w-msg-count');
      if (textarea && counter) {
        textarea.addEventListener('input', () => {
          counter.textContent = textarea.value.length;
        });
      }

      // Real-time validation on inputs
      c.querySelectorAll('input[required], select[required]').forEach(input => {
        input.addEventListener('blur', () => this._validateField(input));
      });
    }

    _validateField(input) {
      if (!input.value.trim()) {
        input.classList.add('invalid');
        return false;
      }
      input.classList.remove('invalid');
      return true;
    }

    _validateStep() {
      const c = this._container;
      if (this._step === 1) {
        const room = c.querySelector('#w-room')?.value;
        const ci = c.querySelector('#w-checkin')?.value || this._data.checkIn;
        const co = c.querySelector('#w-checkout')?.value || this._data.checkOut;

        if (!room) { window.romeoToast && window.romeoToast(t.selectRoomErr, 'error'); return false; }
        if (!ci)   { window.romeoToast && window.romeoToast(t.selectCheckinErr, 'error'); return false; }
        if (!co)   { window.romeoToast && window.romeoToast(t.selectCheckoutErr, 'error'); return false; }
        if (co <= ci) { window.romeoToast && window.romeoToast(t.checkoutAfter, 'error'); return false; }
        return true;
      }

      if (this._step === 2) {
        const name  = c.querySelector('#w-name')?.value.trim();
        const phone = c.querySelector('#w-phone')?.value.trim();
        if (!name)  { window.romeoToast && window.romeoToast(t.enterName, 'error'); return false; }
        if (!phone) { window.romeoToast && window.romeoToast(t.enterPhone, 'error'); return false; }
        return true;
      }

      return true;
    }

    _gatherStep() {
      const c = this._container;
      if (this._step === 1) {
        const roomKey = c.querySelector('#w-room')?.value;
        this._data.roomKey = roomKey;
        this._data.checkIn = c.querySelector('#w-checkin')?.value || this._data.checkIn;
        this._data.checkOut = c.querySelector('#w-checkout')?.value || this._data.checkOut;
        if (this._data.checkIn && this._data.checkOut) {
          this._data.nights = daysBetween(this._data.checkIn, this._data.checkOut);
        }
        const cfg = window.ROMEO_CONFIG;
        if (roomKey && cfg && cfg.roomPrices && cfg.roomPrices[roomKey]) {
          this._data.roomName = cfg.roomPrices[roomKey].name;
          this._data.price    = cfg.roomPrices[roomKey].price;
          this._data.currency = cfg.roomPrices[roomKey].currency;
        }
      }
      if (this._step === 2) {
        this._data.name    = c.querySelector('#w-name')?.value.trim() || '';
        this._data.email   = c.querySelector('#w-email')?.value.trim() || '';
        this._data.phone   = c.querySelector('#w-phone')?.value.trim() || '';
        this._data.message = c.querySelector('#w-message')?.value.trim() || '';
      }
      this._data._savedAt = Date.now();
      this._saveDraft();
    }

    /* ── submission ──────────────────────────────────────── */

    async _submit() {
      const btn = this._container.querySelector('#wizard-submit-btn');
      const statusEl = this._container.querySelector('#wizard-availability-status');
      if (btn) { btn.disabled = true; btn.textContent = t.checkingAvail; }
      if (statusEl) statusEl.innerHTML = `<div class="wizard-checking"><span class="spinner"></span> ${t.checkingAvail}</div>`;

      const d = this._data;
      const bookingId = genId();
      const cfg = window.ROMEO_CONFIG;

      // 1. Create a pending booking block in Firebase
      const firebaseOk = await this._tryFirebaseBooking(bookingId, statusEl);

      if (firebaseOk) {
        if (cfg && cfg.paypalClientId) {
          // 2. Render PayPal
          if (btn) btn.style.display = 'none'; // hide normal submit
          this._renderPayPal(bookingId, cfg.paypalClientId, statusEl);
        } else {
          // Original fallback: no Paypal configured, immediately show succcess
          this._clearDraft();
          this._showConfirmation(bookingId);
        }
      } else {
        if (statusEl) statusEl.innerHTML = `<div class="wizard-error">${t.systemUnavailable}</div>`;
        if (btn) { btn.disabled = false; btn.textContent = t.sendBooking; }
      }
    }

    _loadPayPalSDK(clientId, currency) {
      return new Promise((resolve, reject) => {
        if (window.paypal) return resolve();
        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&intent=capture`;
        script.setAttribute('data-namespace', 'paypal');
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    async _renderPayPal(bookingId, clientId, statusEl) {
      if (statusEl) statusEl.innerHTML = `<div class="wizard-checking"><span class="spinner"></span> ${t.loadingPayment}</div>`;
      try {
        await this._loadPayPalSDK(clientId, this._data.currency || 'EUR');
        if (statusEl) statusEl.innerHTML = `<div id="paypal-button-container" style="margin-top:20px;width:100%;max-width:400px;margin-left:auto;margin-right:auto;"></div>`;
        
        const d = this._data;
        const totalValue = (d.price * d.nights).toString();

        window.paypal.Buttons({
          createOrder: (data, actions) => {
            return actions.order.create({
              purchase_units: [{
                amount: { 
                    value: totalValue,
                    currency_code: d.currency || 'EUR'
                },
                description: `Romeo Hotel: ${d.roomName} (${d.checkIn} to ${d.checkOut})`
              }]
            });
          },
          onApprove: async (data, actions) => {
            if (statusEl) statusEl.innerHTML = `<div class="wizard-checking"><span class="spinner"></span> Processing...</div>`;
            try {
              const order = await actions.order.capture();
              // Update Firebase status to paid
              await firebase.database().ref(`bookings/${bookingId}`).update({
                status: 'paid',
                paypalOrderId: order.id,
                paidAt: Date.now()
              });
              this._clearDraft();
              this._showConfirmation(bookingId);
            } catch (err) {
              console.error("PayPal Capture Error", err);
              if (statusEl) statusEl.innerHTML = `<div class="wizard-error">${t.paymentError}</div>`;
            }
          },
          onError: (err) => {
            console.error("PayPal Flow Error:", err);
            if (statusEl) statusEl.innerHTML = `<div class="wizard-error">${t.paymentError}</div>`;
          }
        }).render('#paypal-button-container');

      } catch (e) {
        console.error("Failed to load PayPal SDK", e);
        if (statusEl) statusEl.innerHTML = `<div class="wizard-error">${t.systemUnavailable}</div>`;
      }
    }

    async _tryFirebaseBooking(bookingId, statusEl) {
      try {
        const cfg = window.ROMEO_CONFIG;
        if (
          typeof firebase === 'undefined' ||
          !firebase.apps || !firebase.apps.length ||
          !cfg || !cfg.firebase || !cfg.firebase.databaseURL
        ) {
          return false; // Firebase not configured
        }

        const db = firebase.database();
        const d = this._data;

        // Check availability and acquire locks via ConflictDetector
        if (typeof ConflictDetector === 'function') {
          const detector = new ConflictDetector(db);
          const check = await detector.checkAvailability(d.roomKey, d.checkIn, d.checkOut);
          if (!check.available) {
            const blockedMsg = (T[_lang] || T.en).rangeBlocked || 'Selected dates are unavailable. Please choose different dates.';
            if (statusEl) statusEl.innerHTML = `<div class="wizard-error">${blockedMsg}</div>`;
            return false;
          }
          // Acquire atomic locks before writing
          try {
            await detector.lockRoom(d.roomKey, d.checkIn, d.checkOut, bookingId);
          } catch (lockErr) {
            const blockedMsg = (T[_lang] || T.en).rangeBlocked || 'Selected dates are unavailable. Please choose different dates.';
            if (statusEl) statusEl.innerHTML = `<div class="wizard-error">${blockedMsg}</div>`;
            return false;
          }
        }

        // Write booking record
        const booking = {
          roomKey: d.roomKey,
          roomName: d.roomName,
          checkIn: d.checkIn,
          checkOut: d.checkOut,
          guestName: d.name,
          guestEmail: d.email,
          guestPhone: d.phone,
          guests: d.guests,
          totalPrice: d.price * d.nights,
          currency: d.currency,
          source: 'website',
          status: 'pending',
          createdAt: Date.now(),
          notes: d.message || ''
        };

        await db.ref(`bookings/${bookingId}`).set(booking);

        // Block dates
        const dateUpdates = {};
        const cur = new Date(d.checkIn);
        while (toYMD(cur) < d.checkOut) {
          dateUpdates[`blocked-dates/${d.roomKey}/${toYMD(cur)}`] = {
            reason: 'booking', bookingId, source: 'website'
          };
          cur.setDate(cur.getDate() + 1);
        }
        if (Object.keys(dateUpdates).length) {
          await db.ref().update(dateUpdates);
        }

        return true;
      } catch (e) {
        console.warn('RomeoForms: Firebase booking failed', e);
        return false;
      }
    }

    _showConfirmation(bookingId) {
      if (!this._container) return;
      this._container.innerHTML = `
        <div class="booking-confirmation">
          <div class="confirmation-icon">✓</div>
          <h2>${t.bookingSent}</h2>
          <p>${t.refNumber} <strong>${bookingId}</strong>.</p>
          <p>${t.bookingReceived}</p>
          <a class="btn primary" href="index.html">${t.backHome}</a>
        </div>`;
    }

    /* ── utils ───────────────────────────────────────────── */

    _esc(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
    }
  }

  /* ── global toast helper ──────────────────────────────── */
  global.romeoToast = function (msg, type = 'info') {
    let container = document.getElementById('romeo-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'romeo-toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  };

  global.RomeoForms = RomeoForms;
})(window);
