
(function(){
  const cfg = window.ROMEO_CONFIG || {};
  document.querySelectorAll('[data-phone]').forEach(el=>el.textContent=cfg.phoneDisplay||'');
  document.querySelectorAll('a[data-email]').forEach(el=>{el.textContent=cfg.email||''; el.href='mailto:'+(cfg.email||'');});
  document.querySelectorAll('[data-address]').forEach(el=>el.textContent=cfg.address||'');
  document.querySelectorAll('[data-map]').forEach(el=>{if(cfg.mapEmbed) el.src=cfg.mapEmbed;});

  const menuBtn = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  if(menuBtn && nav){
    menuBtn.addEventListener('click', ()=>{
      nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true':'false');
    });
  }

  // Legacy form handler (used by translated pages with data-booking-form)
  const form = document.querySelector('[data-booking-form]');
  if(form){
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      const required = ['name','phone','checkin','checkout','room'];
      const missing = required.some(k => !data[k]);
      const status = document.querySelector('[data-status]');
      const btn = form.querySelector('button[type="submit"]');
      if(missing){
        if(status){ status.className='status error'; status.textContent=status.dataset.required||'Please complete all required fields.'; }
        return;
      }
      if(btn){ btn.disabled=true; btn.textContent='Sending...'; }
      if(status){ status.className='status info'; status.textContent='Checking availability...'; }
      try{
        if(typeof firebase==='undefined'||!firebase.apps||!firebase.apps.length) throw new Error('down');
        const db=firebase.database();
        const bookingId=Date.now().toString(36)+Math.random().toString(36).slice(2,7).toUpperCase();
        await db.ref(`bookings/${bookingId}`).set({
          roomName:data.room, checkIn:data.checkin, checkOut:data.checkout,
          guestName:data.name, guestEmail:data.email||'', guestPhone:data.phone,
          guests:parseInt(data.guests)||2, source:'website', status:'pending',
          createdAt:Date.now(), notes:data.message||''
        });
        if(status){ status.className='status success'; status.textContent=status.dataset.sent||'Booking sent. The hotel will confirm via email or phone.'; }
        form.reset();
      }catch(err){
        if(status){ status.className='status error'; status.textContent='Booking system is currently unavailable.'; }
        if(btn){ btn.disabled=false; btn.textContent='Submit Request'; }
      }
    });
  }

  // Interactivity Enhancements

  // 1. Header scroll state
  const header = document.querySelector('.site-header');
  if(header) {
    window.addEventListener('scroll', () => {
      if(window.scrollY > 20) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    }, { passive: true });
    // Init state
    if(window.scrollY > 20) header.classList.add('scrolled');
  }

  // 2. Intersection Observer for Scroll Reveals
  const revealElements = document.querySelectorAll('[data-reveal]');
  if(revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if(entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target); // Reveal only once
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    
    revealElements.forEach(el => revealObserver.observe(el));
  }

  // 3. Stat Counters Animation
  const animateValue = (obj, start, end, duration, decimals = 0) => {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress); // Ease out
      const current = start + (end - start) * easeProgress;
      obj.textContent = decimals > 0 ? current.toFixed(decimals) : Math.floor(current);
      if (progress < 1) window.requestAnimationFrame(step);
      else obj.textContent = end + (obj.dataset.suffix || '');
    };
    window.requestAnimationFrame(step);
  };

  const statCounters = document.querySelectorAll('[data-count]');
  if(statCounters.length > 0) {
    const statObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if(entry.isIntersecting) {
          const el = entry.target;
          const endVal = parseFloat(el.getAttribute('data-count'));
          const decimals = endVal % 1 !== 0 ? 1 : 0;
          if(!isNaN(endVal)) {
            el.textContent = '0';
            animateValue(el, 0, endVal, 2000, decimals);
          }
          obs.unobserve(el);
        }
      });
    }, { rootMargin: '0px 0px -5% 0px', threshold: 0.5 });
    
    statCounters.forEach(el => statObserver.observe(el));
  }

  // 4. Parallax effect for hero image
  const heroImg = document.querySelector('.hero-card img');
  if(heroImg) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      if(scrollY < window.innerHeight) {
        heroImg.style.transform = `translateY(${scrollY * 0.1}px) scale(1.03)`;
      }
    }, { passive: true });
  }

  const lightbox = document.querySelector('.lightbox');
  const lightboxImg = lightbox ? lightbox.querySelector('img') : null;
  document.querySelectorAll('[data-lightbox]').forEach(a=>{
    a.addEventListener('click', function(e){
      e.preventDefault();
      if(!lightbox || !lightboxImg) return;
      lightboxImg.src = this.getAttribute('href');
      lightbox.classList.add('show');
    });
  });
  document.querySelectorAll('[data-close-lightbox]').forEach(btn=>{
    btn.addEventListener('click', ()=> lightbox && lightbox.classList.remove('show'));
  });
  if(lightbox){
    lightbox.addEventListener('click', (e)=>{ if(e.target === lightbox) lightbox.classList.remove('show'); });
  }

  document.querySelectorAll('[data-year]').forEach(el=>el.textContent = new Date().getFullYear());

  // Inject WhatsApp Floating Button based on config phone number
  if (window.ROMEO_CONFIG && window.ROMEO_CONFIG.phoneDisplay) {
    const waPhone = window.ROMEO_CONFIG.phoneDisplay.replace(/[^0-9]/g, '');
    if (waPhone) {
      const waLink = document.createElement('a');
      waLink.className = 'floating-wa';
      waLink.href = `https://wa.me/${waPhone}`;
      waLink.target = '_blank';
      waLink.rel = 'noopener noreferrer';
      waLink.setAttribute('aria-label', 'WhatsApp');
      waLink.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12.031 0C5.394 0 0 5.394 0 12.031c0 2.126.55 4.195 1.597 6.014L.012 24l6.105-1.602a11.96 11.96 0 005.914 1.558h.005c6.634 0 12.031-5.396 12.031-12.032C24.067 5.395 18.67 0 12.031 0zm0 21.996h-.004c-1.796 0-3.555-.483-5.094-1.396l-.365-.216-3.784.992.999-3.69-.237-.377A9.993 9.993 0 012.036 12.03c0-5.523 4.494-10.016 10.019-10.016 5.522 0 10.014 4.493 10.014 10.016 0 5.525-4.492 10.016-10.038 10.016zm5.495-7.512c-.301-.151-1.786-.883-2.064-.984-.277-.101-.48-.151-.681.151-.202.302-.781.984-.957 1.185-.176.202-.353.227-.654.076-1.354-.683-2.454-1.849-3.085-3.238-.119-.202-.013-.312.138-.462.135-.135.302-.353.453-.529.151-.176.202-.302.302-.503.1-.202.05-.378-.025-.529-.076-.151-.681-1.643-.933-2.25-.246-.593-.497-.512-.681-.521h-.58c-.202 0-.529.076-.806.378-.277.302-1.058 1.034-1.058 2.52s1.083 2.924 1.234 3.125c.151.202 2.133 3.255 5.166 4.562 2.306.994 3.284.912 3.888.761.688-.172 1.786-.731 2.038-1.437.252-.706.252-1.311.176-1.437-.076-.126-.277-.202-.578-.353z"/></svg>`;
      document.body.appendChild(waLink);
    }
  }

  // Dynamic room price injection from config
  if (cfg && cfg.roomPrices) {
    document.querySelectorAll('.room-price-row[data-room-key]').forEach(el => {
      const key = el.getAttribute('data-room-key');
      const room = cfg.roomPrices[key];
      if (room) {
        const strong = el.querySelector('strong');
        if (strong) {
          const symbol = room.currency === 'EUR' ? '€' : room.currency;
          strong.textContent = `${symbol}${room.price}`;
        }
      }
    });
  }

  // Fix og:image to absolute URL for social sharing
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) {
    const content = ogImage.getAttribute('content');
    if (content && !content.startsWith('http')) {
      const base = window.location.origin + window.location.pathname.replace(/[^\/]*$/, '');
      ogImage.setAttribute('content', base + content.replace(/^\.\.\//, ''));
    }
  }

})();
