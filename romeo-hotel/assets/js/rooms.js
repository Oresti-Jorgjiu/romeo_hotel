/**
 * RomeoRooms – room filtering, sorting, and comparison widget for Romeo Hotel.
 * No external dependencies. Reads prices from Firebase (falls back to config).
 */
(function (global) {
  'use strict';

  const ROOM_AMENITIES = {
    en: {
      'deluxe-double':    ['Wi-Fi', 'Air conditioning', 'Private bathroom', 'Breakfast', 'City view'],
      'deluxe-twin':      ['Wi-Fi', 'Air conditioning', 'Soundproofing', 'Private bathroom', 'Flat-screen TV'],
      'deluxe-triple':    ['Wi-Fi', 'Air conditioning', 'Breakfast', 'Private bathroom', 'Mountain or city view'],
      'family-room':      ['Wi-Fi', 'Air conditioning', 'Work desk', 'Private bathroom', 'City view'],
      'deluxe-suite':     ['Wi-Fi', 'Air conditioning', 'Sofa / sitting area', 'Premium bathroom', 'Tea or coffee setup'],
      'deluxe-quadruple': ['Wi-Fi', 'Air conditioning', 'Breakfast', 'Multiple large beds', 'City view']
    },
    sq: {
      'deluxe-double':    ['Wi-Fi', 'Klimë', 'Banjë private', 'Mëngjes', 'Pamje qyteti'],
      'deluxe-twin':      ['Wi-Fi', 'Klimë', 'Izolim akustik', 'Banjë private', 'TV ekran i sheshtë'],
      'deluxe-triple':    ['Wi-Fi', 'Klimë', 'Mëngjes', 'Banjë private', 'Pamje mali ose qyteti'],
      'family-room':      ['Wi-Fi', 'Klimë', 'Tavolinë pune', 'Banjë private', 'Pamje qyteti'],
      'deluxe-suite':     ['Wi-Fi', 'Klimë', 'Zonë ndenjeje', 'Banjë premium', 'Çaj ose kafe'],
      'deluxe-quadruple': ['Wi-Fi', 'Klimë', 'Mëngjes', 'Shtretër të mëdhenj', 'Pamje qyteti']
    }
  };

  const ROOM_IMAGES = {
    'deluxe-double':    'assets/img/thumb/13.jpg',
    'deluxe-twin':      'assets/img/thumb/22.jpg',
    'deluxe-triple':    'assets/img/thumb/02.jpg',
    'family-room':      'assets/img/thumb/19.jpg',
    'deluxe-suite':     'assets/img/thumb/21.jpg',
    'deluxe-quadruple': 'assets/img/thumb/03.jpg'
  };

  const ROOM_LINKS = {
    'deluxe-double':    'room-deluxe-double.html',
    'deluxe-twin':      'room-deluxe-twin.html',
    'deluxe-triple':    'room-deluxe-triple.html',
    'family-room':      'room-family-room.html',
    'deluxe-suite':     'room-deluxe-suite.html',
    'deluxe-quadruple': 'room-deluxe-quadruple.html'
  };

  const ROOM_DESCRIPTIONS = {
    en: {
      'deluxe-double':    '1 queen bed · balcony in some options · breakfast included',
      'deluxe-twin':      '2 single beds · breakfast included',
      'deluxe-triple':    '1 single bed + 1 king bed · balcony in some listings',
      'family-room':      '2 single beds + 1 king bed · practical for families',
      'deluxe-suite':     '1 king bed · sitting area · premium amenities',
      'deluxe-quadruple': 'Spacious layout for larger groups'
    },
    sq: {
      'deluxe-double':    '1 shtrat dopio · ballkon në disa opsione · mëngjes i përfshirë',
      'deluxe-twin':      '2 shtretër njëpersonalë · mëngjes i përfshirë',
      'deluxe-triple':    '1 shtrat njëpersonale + 1 king · ballkon në disa lista',
      'family-room':      '2 shtretër njëpersonalë + 1 king · praktike për familje',
      'deluxe-suite':     '1 shtrat king · zonë ndenjeje · pajisje premium',
      'deluxe-quadruple': 'Hapësirë e gjerë për grupe të mëdha'
    }
  };

  const ROOM_NAMES = {
    sq: {
      'deluxe-double':    'Dhomë Deluxe Dyshe',
      'deluxe-twin':      'Dhomë Deluxe Twin',
      'deluxe-triple':    'Dhomë Deluxe Treshe',
      'family-room':      'Dhomë Familjare',
      'deluxe-suite':     'Suite Deluxe',
      'deluxe-quadruple': 'Dhomë Deluxe Katërshe'
    }
  };

  const I18N = {
    en: {
      bookNow: 'Book Now', details: 'Details', compare: '⊕ Compare', comparing: '✓ Comparing',
      noMatch: 'No rooms match your filters.', unavailable: 'Unavailable',
      upTo: 'Up to', guests: 'guests', perNight: '/night',
      searchPlaceholder: 'Search rooms…', anyGuests: 'Any guests',
      anyPrice: 'Any price', sortName: 'Sort: Name',
      priceLowHigh: 'Price: Low to High', priceHighLow: 'Price: High to Low',
      largestFirst: 'Largest first',
      comparingLabel: 'Comparing:', compareRooms: 'Compare rooms', clear: '✕ Clear',
      roomComparison: 'Room Comparison', pricePerNight: 'Price/night',
      size: 'Size', maxGuests: 'Max guests', amenities: 'Amenities', book: 'Book',
      compareLimit: 'You can compare up to 3 rooms at once.'
    },
    sq: {
      bookNow: 'Rezervo Tani', details: 'Detaje', compare: '⊕ Krahaso', comparing: '✓ Krahasuar',
      noMatch: 'Asnjë dhomë nuk përputhet me filtrat.', unavailable: 'E padisponueshme',
      upTo: 'Deri në', guests: 'mysafirë', perNight: '/natë',
      searchPlaceholder: 'Kërko dhoma…', anyGuests: 'Çdo numër mysafirësh',
      anyPrice: 'Çdo çmim', sortName: 'Rendit: Emri',
      priceLowHigh: 'Çmimi: Ulët në Lartë', priceHighLow: 'Çmimi: Lartë në Ulët',
      largestFirst: 'Më e madhja e para',
      comparingLabel: 'Duke krahasuar:', compareRooms: 'Krahaso dhomat', clear: '✕ Pastro',
      roomComparison: 'Krahasimi i Dhomave', pricePerNight: 'Çmimi/natë',
      size: 'Madhësia', maxGuests: 'Maks. mysafirë', amenities: 'Pajisjet', book: 'Rezervo',
      compareLimit: 'Mund të krahasoni deri në 3 dhoma njëherësh.'
    }
  };

  class RomeoRooms {
    constructor() {
      this._rooms = {};
      this._filtered = [];
      this._compared = new Set();
      this._container = null;
      this._filterBar = null;
      this._compareBar = null;
      this._compareModal = null;
      this._filters = { search: '', maxGuests: 0, maxPrice: 999, sortBy: 'name' };
      this._unsubFirebase = null;
      this._lang = (document.documentElement.lang || 'en').slice(0, 2);
      if (!I18N[this._lang]) this._lang = 'en';
      this._t = I18N[this._lang];
    }

    init(container) {
      if (typeof container === 'string') container = document.querySelector(container);
      if (!container) { console.warn('RomeoRooms: container not found'); return this; }
      this._container = container;
      this._loadRooms();
      return this;
    }

    destroy() {
      if (this._unsubFirebase) this._unsubFirebase();
      if (this._container) this._container.innerHTML = '';
      if (this._compareBar) this._compareBar.remove();
      if (this._compareModal) this._compareModal.remove();
    }

    /* ── data loading ──────────────────────────────────────── */

    _loadRooms() {
      // Start from config
      const cfg = window.ROMEO_CONFIG;
      if (cfg && cfg.roomPrices) {
        Object.entries(cfg.roomPrices).forEach(([key, data]) => {
          this._rooms[key] = Object.assign({}, data, {
            key,
            amenities: (ROOM_AMENITIES[this._lang] || ROOM_AMENITIES.en)[key] || [],
            image: ROOM_IMAGES[key] || '',
            link: ROOM_LINKS[key] || 'contact.html',
            description: (ROOM_DESCRIPTIONS[this._lang] || ROOM_DESCRIPTIONS.en)[key] || '',
            displayName: (ROOM_NAMES[this._lang] || {})[key] || data.name
          });
        });
      }

      // Try to get live prices from Firebase
      try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
          const db = firebase.database();
          const ref = db.ref('rooms');
          ref.on('value', (snap) => {
            const data = snap.val();
            if (data) {
              Object.entries(data).forEach(([key, val]) => {
                if (this._rooms[key]) {
                  this._rooms[key].price = val.price || this._rooms[key].price;
                  this._rooms[key].available = val.available !== false;
                }
              });
            }
            this._applyFilters();
          });
          this._unsubFirebase = () => ref.off('value');
        }
      } catch (e) { /* Firebase not available */ }

      this._applyFilters();
    }

    /* ── filtering / sorting ───────────────────────────────── */

    _applyFilters() {
      const { search, maxGuests, maxPrice, sortBy } = this._filters;
      let keys = Object.keys(this._rooms);

      if (search) {
        const s = search.toLowerCase();
        keys = keys.filter(k => this._rooms[k].name.toLowerCase().includes(s));
      }
      if (maxGuests > 0) {
        keys = keys.filter(k => this._rooms[k].maxGuests >= maxGuests);
      }
      keys = keys.filter(k => this._rooms[k].price <= maxPrice);

      keys.sort((a, b) => {
        const ra = this._rooms[a], rb = this._rooms[b];
        if (sortBy === 'price-asc') return ra.price - rb.price;
        if (sortBy === 'price-desc') return rb.price - ra.price;
        if (sortBy === 'size') return rb.size - ra.size;
        return ra.name.localeCompare(rb.name);
      });

      this._filtered = keys;
      this._renderRooms();
    }

    /* ── rendering ─────────────────────────────────────────── */

    _renderRooms() {
      if (!this._container) return;

      if (this._filtered.length === 0) {
        this._container.innerHTML = `<p class="rooms-empty">${this._t.noMatch}</p>`;
        return;
      }

      this._container.innerHTML = this._filtered.map(k => this._renderCard(k)).join('');
      this._bindCardEvents();
    }

    _renderCard(key) {
      const r = this._rooms[key];
      const t = this._t;
      const symbol = r.currency === 'EUR' ? '€' : r.currency;
      const compareClass = this._compared.has(key) ? 'active' : '';
      const name = r.displayName || r.name;
      const availBadge = r.available === false
        ? `<span class="room-unavail-badge">${t.unavailable}</span>`
        : '';

      return `
      <article class="card room-card" data-room-key="${key}">
        ${availBadge}
        <img src="${r.image}" alt="${name}" loading="lazy">
        <div class="room-card-body">
          <h3>${name}</h3>
          <p>${r.description}</p>
          <div class="facts">
            <span class="tag">${r.size} m²</span>
            <span class="tag">${t.upTo} ${r.maxGuests} ${t.guests}</span>
            ${r.amenities.slice(0, 2).map(a => `<span class="tag">${a}</span>`).join('')}
          </div>
          <div class="room-price-row">
            <span class="room-price"><strong>${symbol}${r.price}</strong><small>${t.perNight}</small></span>
          </div>
          <div class="actions">
            <a class="btn primary" href="contact.html?room=${encodeURIComponent(r.name)}">${t.bookNow}</a>
            <a class="btn secondary" href="${r.link}">${t.details}</a>
            <button class="btn secondary compare-btn ${compareClass}" type="button" data-key="${key}">
              ${this._compared.has(key) ? t.comparing : t.compare}
            </button>
          </div>
        </div>
      </article>`;
    }

    _bindCardEvents() {
      if (!this._container) return;
      this._container.querySelectorAll('.compare-btn').forEach(btn => {
        btn.addEventListener('click', () => this._toggleCompare(btn.dataset.key));
      });
    }

    /* ── compare ───────────────────────────────────────────── */

    _toggleCompare(key) {
      if (this._compared.has(key)) {
        this._compared.delete(key);
      } else {
        if (this._compared.size >= 3) {
          window.romeoToast && window.romeoToast(this._t.compareLimit, 'error');
          return;
        }
        this._compared.add(key);
      }
      this._renderRooms();
      this._renderCompareBar();
    }

    _renderCompareBar() {
      if (!this._compareBar) {
        this._compareBar = document.createElement('div');
        this._compareBar.className = 'compare-bar';
        document.body.appendChild(this._compareBar);
      }

      if (this._compared.size === 0) {
        this._compareBar.classList.remove('visible');
        return;
      }

      const names = [...this._compared].map(k => (this._rooms[k]?.displayName || this._rooms[k]?.name || k)).join(', ');
      const t = this._t;
      this._compareBar.innerHTML = `
        <span>${t.comparingLabel} <strong>${names}</strong></span>
        <button class="btn primary" type="button" id="rc-compare-open">${t.compareRooms}</button>
        <button class="btn secondary" type="button" id="rc-compare-clear">${t.clear}</button>
      `;
      this._compareBar.classList.add('visible');

      this._compareBar.querySelector('#rc-compare-open').addEventListener('click', () => this._openCompareModal());
      this._compareBar.querySelector('#rc-compare-clear').addEventListener('click', () => {
        this._compared.clear();
        this._renderRooms();
        this._renderCompareBar();
      });
    }

    _openCompareModal() {
      const keys = [...this._compared];
      const symbol = key => {
        const r = this._rooms[key];
        return r && r.currency === 'EUR' ? '€' : (r ? r.currency : '€');
      };

      const t = this._t;
      const headers = keys.map(k => `<th>${this._rooms[k]?.displayName || this._rooms[k]?.name || k}</th>`).join('');
      const rows = [
        [t.pricePerNight, k => `${symbol(k)}${this._rooms[k]?.price}`],
        [t.size,          k => `${this._rooms[k]?.size} m²`],
        [t.maxGuests,     k => this._rooms[k]?.maxGuests],
        [t.amenities,     k => (this._rooms[k]?.amenities || []).join(', ')]
      ].map(([label, fn]) =>
        `<tr><td><strong>${label}</strong></td>${keys.map(k => `<td>${fn(k)}</td>`).join('')}</tr>`
      ).join('');

      const bookLinks = keys.map(k =>
        `<td><a class="btn primary" href="contact.html?room=${encodeURIComponent(this._rooms[k]?.name || '')}">${t.book}</a></td>`
      ).join('');

      if (!this._compareModal) {
        this._compareModal = document.createElement('div');
        this._compareModal.className = 'compare-modal';
        document.body.appendChild(this._compareModal);
      }

      this._compareModal.innerHTML = `
        <div class="compare-modal-inner">
          <button class="compare-modal-close" type="button" aria-label="Close">×</button>
          <h2>${t.roomComparison}</h2>
          <div class="compare-table-wrap">
            <table class="compare-table">
              <thead><tr><th></th>${headers}</tr></thead>
              <tbody>${rows}<tr><td></td>${bookLinks}</tr></tbody>
            </table>
          </div>
        </div>`;

      this._compareModal.classList.add('open');
      this._compareModal.querySelector('.compare-modal-close').addEventListener('click', () => {
        this._compareModal.classList.remove('open');
      });
      this._compareModal.addEventListener('click', (e) => {
        if (e.target === this._compareModal) this._compareModal.classList.remove('open');
      });
    }

    /* ── filter bar setup ──────────────────────────────────── */

    initFilterBar(container) {
      if (typeof container === 'string') container = document.querySelector(container);
      if (!container) return this;
      this._filterBar = container;

      const t = this._t;
      container.innerHTML = `
        <div class="filter-bar">
          <input class="filter-search" type="search" placeholder="${t.searchPlaceholder}" aria-label="${t.searchPlaceholder}">
          <select class="filter-guests" aria-label="${t.guests}">
            <option value="0">${t.anyGuests}</option>
            <option value="1">1+ ${t.guests}</option>
            <option value="2">2+ ${t.guests}</option>
            <option value="3">3+ ${t.guests}</option>
            <option value="4">4+ ${t.guests}</option>
          </select>
          <select class="filter-price" aria-label="${t.anyPrice}">
            <option value="999">${t.anyPrice}</option>
            <option value="70">${t.upTo} €70${t.perNight}</option>
            <option value="90">${t.upTo} €90${t.perNight}</option>
            <option value="110">${t.upTo} €110${t.perNight}</option>
            <option value="130">${t.upTo} €130${t.perNight}</option>
          </select>
          <select class="filter-sort" aria-label="${t.sortName}">
            <option value="name">${t.sortName}</option>
            <option value="price-asc">${t.priceLowHigh}</option>
            <option value="price-desc">${t.priceHighLow}</option>
            <option value="size">${t.largestFirst}</option>
          </select>
        </div>`;

      container.querySelector('.filter-search').addEventListener('input', (e) => {
        this._filters.search = e.target.value.trim();
        this._applyFilters();
      });
      container.querySelector('.filter-guests').addEventListener('change', (e) => {
        this._filters.maxGuests = parseInt(e.target.value, 10);
        this._applyFilters();
      });
      container.querySelector('.filter-price').addEventListener('change', (e) => {
        this._filters.maxPrice = parseInt(e.target.value, 10);
        this._applyFilters();
      });
      container.querySelector('.filter-sort').addEventListener('change', (e) => {
        this._filters.sortBy = e.target.value;
        this._applyFilters();
      });

      return this;
    }
  }

  global.RomeoRooms = RomeoRooms;
})(window);
