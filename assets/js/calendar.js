/**
 * RomeoCalendar – date-range picker for Romeo Hotel
 * No external dependencies. Loads blocked dates from Firebase when available.
 * Fires custom event 'dateRangeSelected' on the container element.
 */
(function (global) {
  'use strict';

  const _calLang = (document.documentElement.lang || 'en').slice(0, 2);

  const MONTH_NAMES_I18N = {
    en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    sq: ['Janar','Shkurt','Mars','Prill','Maj','Qershor','Korrik','Gusht','Shtator','Tetor','N\u00ebntor','Dhjetor']
  };
  const DAY_NAMES_I18N = {
    en: ['Su','Mo','Tu','We','Th','Fr','Sa'],
    sq: ['Di','H\u00ebn','Mar','M\u00ebr','Enj','Pre','Sht']
  };
  const CAL_T = {
    en: {
      selectCheckin: 'Select check-in date',
      selectCheckout: 'Select check-out date',
      checkinLabel: 'check-in',
      night: 'night', nights: 'nights',
      perNight: '/night', total: 'Total',
      clear: '\u2715 Clear',
      rangeBlocked: 'Selected range includes unavailable dates. Please choose different dates.',
      minStay: 'Minimum stay is %d night(s).',
      maxStay: 'Maximum stay is %d nights.',
      prevMonth: 'Previous month', nextMonth: 'Next month'
    },
    sq: {
      selectCheckin: 'Zgjidhni dat\u00ebn e check-in',
      selectCheckout: 'Zgjidhni dat\u00ebn e check-out',
      checkinLabel: 'check-in',
      night: 'nat\u00eb', nights: 'net\u00eb',
      perNight: '/nat\u00eb', total: 'Totali',
      clear: '\u2715 Pastro',
      rangeBlocked: 'Periudha e zgjedhur p\u00ebrfshin data t\u00eb padisponueshme. Zgjidhni data t\u00eb tjera.',
      minStay: 'Q\u00ebndrimi minimal \u00ebsht\u00eb %d nat\u00eb.',
      maxStay: 'Q\u00ebndrimi maksimal \u00ebsht\u00eb %d net\u00eb.',
      prevMonth: 'Muaji i m\u00ebparsh\u00ebm', nextMonth: 'Muaji i ardhsh\u00ebm'
    }
  };
  const MONTH_NAMES = MONTH_NAMES_I18N[_calLang] || MONTH_NAMES_I18N.en;
  const DAY_NAMES = DAY_NAMES_I18N[_calLang] || DAY_NAMES_I18N.en;
  const ct = CAL_T[_calLang] || CAL_T.en;

  /* ── helpers ──────────────────────────────────────────────── */
  function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function fromYMD(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addMonths(date, n) {
    const d = new Date(date);
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    return d;
  }

  function sameDay(a, b) {
    return a && b && toYMD(a) === toYMD(b);
  }

  function isBefore(a, b) {
    return toYMD(a) < toYMD(b);
  }

  function daysBetween(a, b) {
    const ms = b - a;
    return Math.round(ms / 86400000);
  }

  /* ── class ────────────────────────────────────────────────── */
  class RomeoCalendar {
    constructor(options = {}) {
      this.options = Object.assign({
        roomKey: null,
        minNights: 1,
        maxNights: 30,
        currency: 'EUR',
        price: null,
        showPriceSummary: true,
        onSelect: null
      }, options);

      this._container = null;
      this._viewDate = new Date();
      this._viewDate.setDate(1);
      this._checkIn = null;
      this._checkOut = null;
      this._hoverDate = null;
      this._blockedDates = new Set();
      this._selecting = false; // true = waiting for check-out click
      this._unsubFirebase = null;
    }

    /* public API */

    init(container, options = {}) {
      if (typeof container === 'string') {
        container = document.querySelector(container);
      }
      if (!container) { console.warn('RomeoCalendar: container not found'); return this; }
      Object.assign(this.options, options);
      this._container = container;
      this._container.classList.add('romeo-calendar');

      // Sync price from global config if not provided
      if (!this.options.price && this.options.roomKey) {
        const cfg = window.ROMEO_CONFIG;
        if (cfg && cfg.roomPrices && cfg.roomPrices[this.options.roomKey]) {
          const r = cfg.roomPrices[this.options.roomKey];
          this.options.price = r.price;
          this.options.currency = r.currency;
        }
      }

      this._loadBlockedDates();
      this.render();
      return this;
    }

    render() {
      if (!this._container) return this;
      const isMobile = window.innerWidth < 700;
      const monthCount = isMobile ? 1 : 2;

      let html = '<div class="rc-months">';
      for (let i = 0; i < monthCount; i++) {
        html += this._renderMonth(addMonths(this._viewDate, i));
      }
      html += '</div>';
      html += this._renderNav();
      if (this.options.showPriceSummary) {
        html += this._renderSummary();
      }

      this._container.innerHTML = html;
      this._bindEvents();
      return this;
    }

    setBlockedDates(dateArray) {
      this._blockedDates = new Set(Array.isArray(dateArray) ? dateArray : []);
      this.render();
    }

    getSelection() {
      return {
        checkIn: this._checkIn ? toYMD(this._checkIn) : null,
        checkOut: this._checkOut ? toYMD(this._checkOut) : null,
        nights: (this._checkIn && this._checkOut)
          ? daysBetween(this._checkIn, this._checkOut)
          : 0
      };
    }

    destroy() {
      if (this._unsubFirebase) { this._unsubFirebase(); }
      if (this._container) { this._container.innerHTML = ''; this._container.classList.remove('romeo-calendar'); }
      this._container = null;
    }

    /* private */

    _renderMonth(date) {
      const year = date.getFullYear();
      const month = date.getMonth();
      const today = toYMD(new Date());

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      let html = `<div class="rc-month">`;
      html += `<div class="rc-month-title">${MONTH_NAMES[month]} ${year}</div>`;
      html += `<div class="rc-weekdays">`;
      DAY_NAMES.forEach(d => { html += `<span>${d}</span>`; });
      html += `</div><div class="rc-days">`;

      // empty cells before first day
      for (let i = 0; i < firstDay; i++) {
        html += `<span class="rc-day empty"></span>`;
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const ymd = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayDate = new Date(year, month, d);
        const classes = this._dayClasses(ymd, dayDate, today);
        const disabled = classes.includes('unavailable') || classes.includes('past');
        html += `<button class="rc-day ${classes}" data-date="${ymd}" ${disabled ? 'disabled' : ''} type="button" aria-label="${ymd}">${d}</button>`;
      }

      html += `</div></div>`;
      return html;
    }

    _dayClasses(ymd, dayDate, today) {
      const classes = [];
      const ciYMD = this._checkIn ? toYMD(this._checkIn) : null;
      const coYMD = this._checkOut ? toYMD(this._checkOut) : null;
      const hvYMD = this._hoverDate ? toYMD(this._hoverDate) : null;

      if (ymd < today) {
        classes.push('past');
      } else if (this._blockedDates.has(ymd)) {
        classes.push('unavailable');
      } else {
        classes.push('available');
      }

      if (ymd === today) classes.push('today');

      if (ciYMD && ymd === ciYMD) classes.push('selected', 'check-in');
      if (coYMD && ymd === coYMD) classes.push('selected', 'check-out');

      // in-range highlighting
      const rangeEnd = coYMD || (this._selecting && hvYMD ? hvYMD : null);
      if (ciYMD && rangeEnd && ymd > ciYMD && ymd < rangeEnd) {
        classes.push('in-range');
      }

      return classes.join(' ');
    }

    _renderNav() {
      return `<div class="rc-nav">
        <button class="rc-nav-btn rc-prev" type="button" aria-label="${ct.prevMonth}">&#8249;</button>
        <button class="rc-nav-btn rc-next" type="button" aria-label="${ct.nextMonth}">&#8250;</button>
      </div>`;
    }

    _renderSummary() {
      const { checkIn, checkOut, nights } = this.getSelection();
      const price = this.options.price;
      const currency = this.options.currency || 'EUR';
      const symbol = currency === 'EUR' ? '€' : currency;

      let content = '';
      if (!checkIn) {
        content = `<span class="rc-hint">${ct.selectCheckin}</span>`;
      } else if (!checkOut) {
        content = `<span class="rc-hint">${ct.selectCheckout} <em>(${ct.checkinLabel}: ${checkIn})</em></span>`;
      } else {
        const total = price ? price * nights : null;
        const nightLabel = nights !== 1 ? ct.nights : ct.night;
        content = `
          <span class="rc-summary-dates">
            <strong>${checkIn}</strong> → <strong>${checkOut}</strong>
            &nbsp;·&nbsp; <em>${nights} ${nightLabel}</em>
          </span>
          ${price ? `<span class="rc-summary-price">${symbol}${price}${ct.perNight} &nbsp;·&nbsp; <strong>${ct.total}: ${symbol}${total}</strong></span>` : ''}
          <button class="rc-clear-btn" type="button">${ct.clear}</button>
        `;
      }

      return `<div class="rc-summary">${content}</div>`;
    }

    _bindEvents() {
      if (!this._container) return;

      this._container.querySelector('.rc-prev')?.addEventListener('click', () => {
        this._viewDate = addMonths(this._viewDate, -1);
        this.render();
      });

      this._container.querySelector('.rc-next')?.addEventListener('click', () => {
        this._viewDate = addMonths(this._viewDate, 1);
        this.render();
      });

      this._container.querySelectorAll('.rc-day.available').forEach(btn => {
        btn.addEventListener('click', (e) => this._onDayClick(e.currentTarget.dataset.date));
        btn.addEventListener('mouseenter', (e) => {
          if (this._selecting) {
            this._hoverDate = fromYMD(e.currentTarget.dataset.date);
            this._refreshDayStates();
          }
        });
      });

      this._container.querySelector('.rc-clear-btn')?.addEventListener('click', () => {
        this._checkIn = null;
        this._checkOut = null;
        this._selecting = false;
        this._hoverDate = null;
        this.render();
      });
    }

    _onDayClick(ymd) {
      const date = fromYMD(ymd);

      if (!this._selecting || !this._checkIn) {
        // Start selection
        this._checkIn = date;
        this._checkOut = null;
        this._selecting = true;
        this.render();
        return;
      }

      // Check-out selection
      if (isBefore(date, this._checkIn) || sameDay(date, this._checkIn)) {
        // Clicked before or on check-in → restart
        this._checkIn = date;
        this._checkOut = null;
        this.render();
        return;
      }

      // Check if range crosses any blocked date
      if (this._rangeHasBlocked(this._checkIn, date)) {
        this._showToast(ct.rangeBlocked, 'error');
        return;
      }

      const nights = daysBetween(this._checkIn, date);
      if (nights < this.options.minNights) {
        this._showToast(ct.minStay.replace('%d', this.options.minNights), 'error');
        return;
      }
      if (nights > this.options.maxNights) {
        this._showToast(ct.maxStay.replace('%d', this.options.maxNights), 'error');
        return;
      }

      this._checkOut = date;
      this._selecting = false;
      this._hoverDate = null;
      this.render();
      this._fireEvent();
    }

    _rangeHasBlocked(from, to) {
      const cur = new Date(from);
      cur.setDate(cur.getDate() + 1);
      while (toYMD(cur) < toYMD(to)) {
        if (this._blockedDates.has(toYMD(cur))) return true;
        cur.setDate(cur.getDate() + 1);
      }
      return false;
    }

    _refreshDayStates() {
      if (!this._container) return;
      const today = toYMD(new Date());
      this._container.querySelectorAll('.rc-day[data-date]').forEach(btn => {
        const ymd = btn.dataset.date;
        const dayDate = fromYMD(ymd);
        btn.className = 'rc-day ' + this._dayClasses(ymd, dayDate, today);
      });
    }

    _fireEvent() {
      const detail = {
        checkIn: this._checkIn ? toYMD(this._checkIn) : null,
        checkOut: this._checkOut ? toYMD(this._checkOut) : null,
        nights: (this._checkIn && this._checkOut) ? daysBetween(this._checkIn, this._checkOut) : 0,
        roomKey: this.options.roomKey,
        price: this.options.price,
        currency: this.options.currency,
        total: (this._checkIn && this._checkOut && this.options.price)
          ? this.options.price * daysBetween(this._checkIn, this._checkOut)
          : null
      };

      const evt = new CustomEvent('dateRangeSelected', { detail, bubbles: true });
      this._container.dispatchEvent(evt);

      if (typeof this.options.onSelect === 'function') {
        this.options.onSelect(detail);
      }
    }

    _loadBlockedDates() {
      const roomKey = this.options.roomKey;
      if (!roomKey) return;

      // Try Firebase if initialised
      try {
        const cfg = window.ROMEO_CONFIG;
        // Check if Firebase is available and configured
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && cfg && cfg.firebase && cfg.firebase.databaseURL) {
          const db = firebase.database();
          const ref = db.ref(`blocked-dates/${roomKey}`);
          ref.on('value', (snap) => {
            const data = snap.val() || {};
            this.setBlockedDates(Object.keys(data));
          });
          this._unsubFirebase = () => ref.off('value');
        }
      } catch (e) {
        // Firebase not available – continue with empty blocked dates
      }

      // Also try loading from localStorage cache
      try {
        const cached = localStorage.getItem(`romeo_blocked_${roomKey}`);
        if (cached) {
          const arr = JSON.parse(cached);
          if (Array.isArray(arr)) this._blockedDates = new Set(arr);
        }
      } catch (e) { /* ignore */ }
    }

    _showToast(msg, type = 'info') {
      // Use global toast if available, else alert
      if (typeof window.romeoToast === 'function') {
        window.romeoToast(msg, type);
      } else {
        const el = this._container ? this._container.querySelector('.rc-toast') : null;
        if (el) {
          el.textContent = msg;
          el.className = `rc-toast show ${type}`;
          setTimeout(() => el.className = 'rc-toast', 3000);
        }
      }
    }
  }

  global.RomeoCalendar = RomeoCalendar;
})(window);
