/* Lorena & Youssef — page behaviour. Each block only runs on the page that has its elements. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ───────── Celebration: highlight the day you're reading ───────── */
  const dayLinks = $$('.days a');
  if (dayLinks.length && 'IntersectionObserver' in window) {
    const set = id => dayLinks.forEach(a => a.classList.toggle('on', a.hash === '#' + id));
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && set(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' });
    $$('.day').forEach(s => io.observe(s));
  }

  /* ───────── Stay: map + neighbourhoods ───────── */
  const mapEl = $('#staymap');
  if (mapEl) {
    const VENUE = [31.656891, -7.970057];
    const AREAS = [
      { n: 'The Palmeraie', here: true, label: [31.68, -7.938], c: [31.664, -7.954], r: 2000, col: '#E9D9A0',
        d: 'Where the venue is. Quiet palm groves, big gardens and pools. Les Deux Tours and Les Palmiers are here.' },
      { n: 'The Medina', c: [31.63, -7.987], r: 1100, col: '#EBBB62',
        d: 'Traditional riads around Jemaa el-Fna. The most atmospheric stay — courtyards rather than gardens, and little outdoor space.' },
      { n: 'Hivernage', c: [31.622, -8.009], r: 650, col: '#C98674',
        d: 'The smart centre: five-star hotels, restaurants and nightlife, 15–20 minutes’ walk from Jemaa el-Fna.' },
      { n: 'Amelkis', c: [31.6127, -7.9356], r: 1200, col: '#A9D6BE',
        d: 'Villas and houses around the Amelkis golf course, many with private pools. Ideal if you’re sharing a house with friends. Villa Eme is here.' }
    ];
    const PINS = [[1, 'Domaine des Remparts', [31.633925, -7.938491]], [2, 'Les Deux Tours', [31.6723757, -7.9558772]], [3, 'Les Palmiers', [31.649957, -7.942263]]];
    const km = (a, b) => { const t = x => x * Math.PI / 180, dl = t(b[0] - a[0]), dn = t(b[1] - a[1]);
      const s = Math.sin(dl / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dn / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(s)); };
    const dist = c => { const k = km(VENUE, c); return (k < 10 ? k.toFixed(1) : Math.round(k)) + ' km'; };
    const where = a => a.here ? 'Around the venue' : '≈ ' + dist(a.c) + ' from Jnane Rumi';

    // neighbourhood cards (built with DOM APIs; content is static)
    const list = $('#areas');
    AREAS.forEach((a, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'area'; b.dataset.i = i;
      const km = document.createElement('span'); km.className = 'km';
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = a.col;
      km.append(sw, where(a));
      const h = document.createElement('h3'); h.textContent = a.n;
      const p = document.createElement('p'); p.textContent = a.d;
      b.append(km, h, p); list.append(b);
    });

    const init = () => {
      if (!window.L) { mapEl.textContent = 'The map could not load — check your connection.'; return; }
      const map = L.map(mapEl, { scrollWheelZoom: false });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
      const popup = (title, text) => { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = title; d.append(b, text); return d; };
      const circles = AREAS.map(a => {
        const c = L.circle(a.c, { radius: a.r, color: a.col, weight: 2, fillColor: a.col, fillOpacity: .38 }).addTo(map)
          .bindPopup(popup(a.n, where(a) + '. ' + a.d));
        L.marker(a.label || a.c, { icon: L.divIcon({ className: '', html: `<div class="mlabel">${a.n}</div>`, iconSize: [0, 0] }), interactive: false }).addTo(map);
        return c;
      });
      PINS.forEach(([n, t, c]) => L.marker(c, { title: t, icon: L.divIcon({ className: '', html: `<div class="mpin">${n}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .addTo(map).bindPopup(popup(t, '≈ ' + dist(c) + ' from Jnane Rumi')));
      L.marker(VENUE, { title: 'Jnane Rumi', zIndexOffset: 1000, icon: L.divIcon({ className: '', html: '<div class="mvenue"></div><div class="mlabel v">Jnane Rumi · Venue</div>', iconSize: [22, 22], iconAnchor: [11, 26] }) })
        .addTo(map).bindPopup(popup('Jnane Rumi', 'The venue · Palmeraie'));
      map.fitBounds(L.latLngBounds(AREAS.map(a => a.c).concat([VENUE])).pad(.18));
      $$('.area', list).forEach(el => el.addEventListener('click', () => {
        const i = +el.dataset.i;
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        map.flyTo(AREAS[i].c, 14, { duration: .8 }); circles[i].openPopup();
      }));
    };
    // Load Leaflet (~150 KB) only when the map is about to scroll into view.
    const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet';
    const loadLeaflet = () => {
      const css = document.createElement('link');
      Object.assign(css, { rel: 'stylesheet', href: LEAFLET + '.css', integrity: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H', crossOrigin: 'anonymous' });
      const js = document.createElement('script');
      Object.assign(js, { src: LEAFLET + '.js', integrity: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH', crossOrigin: 'anonymous' });
      js.onload = init; js.onerror = init; // init shows a message if L is missing
      document.head.append(css, js);
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); loadLeaflet(); } }, { rootMargin: '600px 0px' });
      io.observe(mapEl);
    } else loadLeaflet();
  }

  /* ───────── RSVP ───────── */
  const form = $('#rsvp-form');
  if (form) {
    const DAYS = [['thursday', 'Thursday 6 · Marrakech day'], ['friday', 'Friday 7 · Welcome drinks'], ['saturday', 'Saturday 8 · The wedding']];
    const KEY = 'ly-rsvp';
    const endpoint = (window.RSVP_ENDPOINT || '').trim();
    const ask = $('#ask'), done = $('#done'), msg = $('#msg'), send = $('#send');
    const store = {
      get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
      set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }
    };
    if (!endpoint) $('#not-ready').hidden = false;

    const tidy = s => s.trim().replace(/\s+/g, ' ');
    const cap = s => s.replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    const say = (t, ok) => { msg.textContent = t; msg.classList.toggle('ok', !!ok); };

    const post = async body => {
      // text/plain body = a "simple" request, so the browser skips the CORS preflight Apps Script can't answer
      const res = await fetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
      return res.json();
    };

    const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

    /* Extra guests: only people with "Yes" or a number in the sheet's Guests tab see this. The script re-checks on submit. */
    const extrasBox = $('#extras'), extrasOpts = $('#extras-opts'), extrasNames = $('#extras-names');
    let allowed = 0, lookedUp = '';
    const typed = []; // guest names typed so far, kept if the count changes
    const chosen = () => { const c = form.querySelector('input[name=extras]:checked'); return c ? +c.value : null; };
    const renderNames = () => {
      $$('input', extrasNames).forEach((inp, i) => { typed[i] = inp.value; });
      extrasNames.replaceChildren();
      for (let i = 0; i < (chosen() || 0); i++) {
        const label = allowed === 1 ? 'Your plus-one’s full name' : 'Guest ' + (i + 1) + ' · full name';
        extrasNames.append(el('div', { className: 'field' },
          el('label', { htmlFor: 'guest' + i, textContent: label }),
          el('input', { id: 'guest' + i, autocomplete: 'off', maxLength: 160, value: typed[i] || '' })));
      }
    };
    const setAllowed = (n, pick) => {
      allowed = n; extrasBox.hidden = !n; extrasOpts.replaceChildren();
      if (!n) return renderNames();
      $('#extras-q').textContent = n === 1 ? 'Bringing your plus-one?' : 'How many guests are you bringing?';
      $('#extras-note').textContent = (n === 1 ? 'Your invitation includes a guest' : 'Your invitation includes up to ' + n + ' guests') +
        ' — they’ll join you on the days you said yes to.';
      const opts = n === 1 ? [[1, 'Yes'], [0, 'No']] : [[0, 'None']].concat(Array.from({ length: n }, (_, i) => [i + 1, String(i + 1)]));
      opts.forEach(([v, t]) => extrasOpts.append(el('label', {},
        el('input', { type: 'radio', name: 'extras', value: v, checked: pick === v }), ' ' + t)));
      renderNames();
    };
    extrasOpts.addEventListener('change', renderNames);

    const lookup = async () => {
      const first = tidy(form.elements.first.value), last = tidy(form.elements.last.value);
      const key = (first + '|' + last).toLowerCase();
      if (!endpoint || !first || !last || key === lookedUp) return;
      lookedUp = key;
      try {
        const out = await post({ action: 'lookup', first, last });
        if (key !== lookedUp) return; // name changed while we were asking
        const n = out.extras != null ? out.extras : (out.plusOne ? 1 : 0);
        if (n !== allowed) setAllowed(n, chosen());
      } catch { /* lookup is a nicety — the form still works without it */ }
    };
    // A different name means a different invitation: drop the previous person's guest answers.
    const forget = () => { typed.length = 0; extrasNames.replaceChildren(); $$('input', extrasOpts).forEach(i => { i.checked = false; }); };
    ['first', 'last'].forEach(k => form.elements[k].addEventListener('change', () => { forget(); lookup(); }));

    /* Find your name: suggestions from the Guests tab once 3+ letters are typed. */
    const find = $('#find'), picks = $('#find-results');
    let seq = 0, timer;
    const showPicks = (matches, note) => {
      picks.replaceChildren(...matches.map(p => el('li', {}, el('button', {
        type: 'button', textContent: p.first + ' ' + p.last, onclick: () => choose(p) }))));
      if (note) picks.append(el('li', { className: 'none', textContent: note }));
      picks.hidden = !matches.length && !note;
    };
    const choose = p => {
      form.elements.first.value = p.first; form.elements.last.value = p.last;
      find.value = p.first + ' ' + p.last; seq++; showPicks([]);
      forget(); lookup(); form.querySelector('input[name=thursday]').focus();
    };
    find.addEventListener('input', () => {
      clearTimeout(timer);
      const q = tidy(find.value), my = ++seq;
      if (!endpoint || q.replace(/\s/g, '').length < 3) return showPicks([]);
      timer = setTimeout(async () => {
        showPicks([], 'Searching…');
        try {
          const out = await post({ action: 'search', q });
          if (my !== seq) return; // they kept typing
          const m = out.matches || [];
          showPicks(m, m.length ? '' : 'No match — just type your name below.');
        } catch { if (my === seq) showPicks([]); }
      }, 300);
    });
    find.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); picks.querySelector('button')?.click(); } // don't submit the form
      if (e.key === 'Escape') showPicks([]);
    });

    const fill = r => {
      ['first', 'last', 'email', 'party', 'dietary', 'thursdayNotes'].forEach(k => { form.elements[k].value = r[k] || ''; });
      DAYS.forEach(([k]) => { const c = form.querySelector(`input[name=${k}][value="${r[k]}"]`); if (c) c.checked = true; });
      typed.length = 0; (r.guestNames || []).forEach((n, i) => { typed[i] = n; });
      extrasNames.replaceChildren(); setAllowed(r.extrasAllowed || 0, r.extras != null ? r.extras : null);
    };
    const showDone = (r, emailed) => {
      $('#thanks').textContent = 'Thank you, ' + r.first + '.';
      $('#done-sub').textContent = emailed ? 'Your reply has been saved — a copy is on its way to ' + r.email + '.' : 'Your reply has been saved.';
      const plans = $('#plans'); plans.replaceChildren();
      const rows = DAYS.map(([k, label]) => [label, r[k]]);
      if (r.extrasAllowed === 1) rows.push(['Plus-one', r.extras ? r.guestNames[0] : 'Not bringing one']);
      else if (r.extrasAllowed) rows.push(['Guests with you', r.extras ? r.guestNames.join(', ') : 'None']);
      rows.forEach(([label, val]) => {
        const row = document.createElement('div'); row.className = 'row';
        const h = document.createElement('p'); h.className = 'item'; h.textContent = label;
        const v = document.createElement('p'); v.className = 'note'; v.textContent = val;
        row.append(h, v); plans.append(row);
      });
      ask.hidden = true; done.hidden = false; scrollTo(0, 0); done.focus({ preventScroll: true });
    };

    const saved = store.get();
    if (saved && saved.first) showDone(saved, false);

    $('#edit').addEventListener('click', () => { const r = store.get() || {}; fill(r); lookedUp = ''; lookup(); done.hidden = true; ask.hidden = false; say(''); $('#first').focus(); });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = form.elements;
      const r = {
        first: cap(tidy(f.first.value)), last: cap(tidy(f.last.value)), email: tidy(f.email.value).toLowerCase(),
        party: tidy(f.party.value), dietary: f.dietary.value.trim(), thursdayNotes: f.thursdayNotes.value.trim(),
        website: f.website.value // honeypot
      };
      DAYS.forEach(([k]) => { const c = form.querySelector(`input[name=${k}]:checked`); r[k] = c ? c.value : ''; });

      const bad = (el, t) => { say(t); el.focus(); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); };
      if (!r.first) return bad(f.first, 'Please enter your first name.');
      if (!r.last) return bad(f.last, 'Please enter your last name.');
      const missing = DAYS.find(([k]) => !r[k]);
      if (missing) return bad(form.querySelector(`input[name=${missing[0]}]`), 'Please answer yes or no for ' + missing[1].split(' ·')[0] + '.');
      await lookup(); // in case they typed their name and hit send without leaving the field
      if (allowed) {
        r.extras = chosen();
        if (r.extras === null) return bad(extrasOpts.querySelector('input'),
          allowed === 1 ? 'Please tell us whether you’re bringing your plus-one.' : 'Please tell us how many guests you’re bringing.');
        const inputs = $$('input', extrasNames), empty = inputs.find(i => !tidy(i.value));
        if (empty) return bad(empty, allowed === 1 ? 'Please add your plus-one’s name.' : 'Please add a name for each guest.');
        r.guestNames = inputs.map(i => cap(tidy(i.value)));
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return bad(f.email, 'Please add a valid email address.');
      if (!endpoint) return say('RSVPs aren’t connected yet, so this reply can’t be sent. Please message us on WhatsApp instead.');

      send.disabled = true; send.textContent = 'Sending…'; say('');
      try {
        const out = await post(r);
        if (!out.ok) throw new Error(out.error || 'rejected');
        delete r.website;
        r.extrasAllowed = out.extrasAllowed || 0; // the sheet is the source of truth
        if (!r.extrasAllowed) { delete r.extras; delete r.guestNames; }
        store.set(r);
        showDone(r, !!out.emailed);
      } catch (err) {
        say('Sorry — your reply didn’t go through. Please try again, or message us on WhatsApp.');
      } finally {
        send.disabled = false; send.textContent = 'Send my reply';
      }
    });
  }
})();
