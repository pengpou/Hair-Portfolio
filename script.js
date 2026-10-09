const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('site-nav');

toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
});

nav.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
});

document.getElementById('year').textContent = new Date().getFullYear();

// Before/after popup: click a .photo-open to view its set, arrows move between photos
const lightbox = document.getElementById('lightbox');
if (lightbox) {
  const lbImg = lightbox.querySelector('.lb-img');
  const lbLabel = lightbox.querySelector('.lb-label');
  const lbCount = lightbox.querySelector('.lb-count');
  let slides = [];
  let index = 0;

  // Arrow hover glow: a soft, mirrored copy of the photo's edge, so the photo appears to bleed outward.
  const prevBtn = lightbox.querySelector('.lb-prev');
  const nextBtn = lightbox.querySelector('.lb-next');
  const glowCanvas = document.createElement('canvas');
  const GLOW_W = 24, GLOW_H = 48;
  const GLOW_STRIP = 0.22;   // fraction of the photo's width that gets mirrored outward
  const GLOW_DIM = 0.8;      // glow is applied slightly darker than the photo (see .lb-arrow::before)

  function glowFor(side) {
    glowCanvas.width = GLOW_W; glowCanvas.height = GLOW_H;
    const ctx = glowCanvas.getContext('2d', { willReadFrequently: true });
    const iw = lbImg.naturalWidth, ih = lbImg.naturalHeight;
    const sw = iw * GLOW_STRIP;
    ctx.save();
    ctx.translate(GLOW_W, 0);
    ctx.scale(-1, 1);   // mirror, so the photo's edge pixels sit right against the photo
    ctx.drawImage(lbImg, side === 'left' ? 0 : iw - sw, 0, sw, ih, 0, 0, GLOW_W, GLOW_H);
    ctx.restore();
    const px = ctx.getImageData(0, 0, GLOW_W, GLOW_H).data;
    let lum = 0;
    for (let i = 0; i < px.length; i += 4) lum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    lum = (lum / (px.length / 4)) * GLOW_DIM;
    return { url: 'url(' + glowCanvas.toDataURL() + ')', tone: lum > 135 ? 'dark' : 'light' };
  }

  function updateBands() {
    try {
      [[prevBtn, 'left'], [nextBtn, 'right']].forEach(([btn, side]) => {
        const g = glowFor(side);
        btn.style.setProperty('--glow', g.url);
        btn.dataset.tone = g.tone;   // dark arrow on light glow, white arrow on dark glow
      });
    } catch (e) {
      // pixels unreadable (e.g. opened from file://): fall back to the plain dark band
      [prevBtn, nextBtn].forEach((btn) => { btn.style.removeProperty('--glow'); delete btn.dataset.tone; });
    }
  }
  lbImg.addEventListener('load', updateBands);

  function show(i) {
    index = (i + slides.length) % slides.length;
    const s = slides[index];
    lbImg.src = s.dataset.src;
    lbImg.alt = s.alt;
    lbLabel.textContent = s.dataset.label;
    lbCount.textContent = (index + 1) + ' / ' + slides.length;
  }

  document.querySelectorAll('.photo-open').forEach((btn) => {
    const open = () => {
      slides = [...document.getElementById(btn.dataset.set).querySelectorAll('img')];
      show(0);
      lightbox.showModal();
    };
    btn.addEventListener('click', open);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  lightbox.querySelector('.lb-prev').addEventListener('click', () => show(index - 1));
  lightbox.querySelector('.lb-next').addEventListener('click', () => show(index + 1));
  lightbox.querySelector('.lb-close').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
  // close when clicking the dark area around the photo
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
}

// Appointment request form -------------------------------------------------------------
// Shrinks a photo to a JPEG so the whole request stays under the form service's 10 MB limit.
// Formats the browser can't decode (e.g. HEIC outside Safari) are sent unchanged.
function compressImage(file, maxDim, quality) {
  return createImageBitmap(file).then((bmp) => {
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';   // transparent PNGs would otherwise turn black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file);
      }, 'image/jpeg', quality);
    });
  }).catch(() => file);
}

const requestForm = document.getElementById('request-form');
if (requestForm) {
  // The request goes to a small Google Apps Script (see apps-script/Code.gs) that emails it, photos attached.
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzxj36hYnT6i8_6XyJb0hHU7kMxY4GHO-j-WGSixISecOY5zZi00znNvo8U6tsGgvxa/exec';
  const TOKEN = '4cgC1yxaESuFSrsadQgqTZLp';
  const MAX_FILES = 3;
  const MAX_TOTAL = 12 * 1024 * 1024;   // total photo size before sending
  const picker = document.getElementById('photo-picker');
  const fileList = document.getElementById('file-list');
  const errorBox = document.getElementById('form-error');
  const submitBtn = document.getElementById('form-submit');
  const totalSize = (files) => files.reduce((sum, f) => sum + f.size, 0);
  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const requestIntro = document.querySelector('.request-sub');
  const sentBox = document.getElementById('form-sent');

  // "Submit another form" brings the empty form (and its intro text) back.
  document.getElementById('another-request').addEventListener('click', () => {
    sentBox.hidden = true;
    requestForm.hidden = false;
    requestIntro.hidden = false;
    showError('');
    resetButton();
    document.getElementById('request').scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestForm.elements['First Name'].focus({ preventScroll: true });
  });
  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = !msg; }
  function resetButton() { submitBtn.disabled = false; submitBtn.textContent = 'Send request'; }

  // The photos chosen so far. Each pick adds to this list instead of replacing it, and each one can be removed.
  let selected = [];
  const pickerBox = picker.closest('.upload-box');
  const pickerLabel = pickerBox.querySelector('span');

  function renderFiles() {
    fileList.textContent = '';
    selected.forEach((f, i) => {
      const li = document.createElement('li');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'file-row';
      row.setAttribute('aria-label', 'Remove ' + f.name);
      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = f.name;
      const x = document.createElement('span');
      x.className = 'file-x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '\u00d7';
      row.append(name, x);
      row.addEventListener('click', () => { selected.splice(i, 1); showError(''); renderFiles(); });
      li.appendChild(row);
      fileList.appendChild(li);
    });
    const full = selected.length >= MAX_FILES;
    picker.disabled = full;
    pickerBox.classList.toggle('disabled', full);
    pickerLabel.textContent = full ? 'Maximum ' + MAX_FILES + ' photos' : (selected.length ? 'Add another photo' : 'Choose photos');
  }

  picker.addEventListener('change', () => {
    const incoming = [...picker.files];
    picker.value = '';   // so picking the same photo again still counts as a change
    let skipped = 0;
    incoming.forEach((f) => {
      const same = selected.some((s) => s.name === f.name && s.size === f.size && s.lastModified === f.lastModified);
      if (same) return;
      if (selected.length >= MAX_FILES) { skipped++; return; }
      selected.push(f);
    });
    showError(skipped ? 'You can attach up to ' + MAX_FILES + ' photos. Remove one to add another.' : '');
    renderFiles();
  });
  requestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const chosen = [...requestForm.querySelectorAll('input.service-opt:checked')].map((i) => i.value);
    if (!chosen.length) { showError('Please choose at least one service.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending\u2026';
    try {
      const files = selected.slice();
      let ready = await Promise.all(files.map((f) => (f.size > 1.5e6 ? compressImage(f, 1800, 0.85) : f)));
      if (totalSize(ready) > MAX_TOTAL) ready = await Promise.all(files.map((f) => compressImage(f, 1200, 0.7)));
      if (totalSize(ready) > MAX_TOTAL) {
        showError('Those photos are too large to send. Please choose smaller photos or fewer of them.');
        resetButton();
        return;
      }
      const photos = await Promise.all(ready.map(async (f) => ({ name: f.name, type: f.type, data: await toBase64(f) })));
      const field = (name) => requestForm.elements[name].value;
      const payload = {
        token: TOKEN,
        website: field('website'),   // hidden spam trap
        firstName: field('First Name'),
        lastName: field('Last Name'),
        email: field('email'),
        phone: field('Phone'),
        services: chosen.join(', '),
        info: field('Additional Information'),
        photos: photos,
      };
      // text/plain keeps this a "simple" request, which Apps Script accepts without a CORS preflight
      const res = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(payload) });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'not sent');

      requestForm.reset();
      selected = [];
      renderFiles();
      requestForm.hidden = true;
      requestIntro.hidden = true;
      sentBox.hidden = false;
      sentBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      showError(err && err.message && err.message !== 'not sent' && err.message !== 'Could not send the request.' && err.message !== 'forbidden' && !/fetch|JSON|network/i.test(err.message)
        ? err.message
        : 'Sorry, your request could not be sent. Please email mattheworoupeng@gmail.com or call +1 (832)-682-9841.');
      resetButton();
    }
  });
}
// Silver theme motion ------------------------------------------------------------------
// Header: transparent over the hero, solid once the page is scrolled.
const siteHeader = document.querySelector('.site-header');
if (siteHeader) {
  const updateHeader = () => siteHeader.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
}

// Sections and photos fade up gently as they scroll into view (skipped for reduced-motion and old browsers).
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const targets = document.querySelectorAll(
    '.section-title, .price-group, .price-note, .photo-grid, .service-card, .contact > *, .request-sub, .request-form, .collection .scroller'
  );
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); seen.unobserve(entry.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  targets.forEach((el, i) => {
    el.classList.add('reveal');
    if (el.matches('.price-group, .service-card')) el.style.transitionDelay = ((i % 4) * 0.12) + 's';
    seen.observe(el);
  });
}


// Decorative pigs climbing out of tears in the "wall" (the page) ---------------------------
// Any element with data-mills="type:corner:colors:seconds,..." gets pig toys in its corners.
// type: tower = pig wearing a spinning pinwheel beanie; carousel = pig holding a spinning pinwheel on a stick.
// Each pig sits in a ragged hole: torn white paper edge, dark hollow, the pig's body fading back into it.
(function addPigMills() {
  const INK = '#3b2a22';
  const EDGE = 'rgba(59,42,34,.6)';

  // Shared gradients and a blur, defined once and referenced by every pig
  document.body.insertAdjacentHTML('afterbegin',
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
    '<radialGradient id="pigHead" cx=".38" cy=".28" r=".85"><stop offset="0" stop-color="#ffdadc"/><stop offset=".55" stop-color="#f7b5bd"/><stop offset="1" stop-color="#e48e9c"/></radialGradient>' +
    '<radialGradient id="pigSnout" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#f6a9b5"/><stop offset="1" stop-color="#d9788a"/></radialGradient>' +
    '<radialGradient id="pigSnoutIn" cx=".4" cy=".28" r=".85"><stop offset="0" stop-color="#fabdc5"/><stop offset="1" stop-color="#e88fa0"/></radialGradient>' +
    '<linearGradient id="pigEar" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0a3ad"/><stop offset="1" stop-color="#d4798a"/></linearGradient>' +
    '<linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d98f9c"/><stop offset=".6" stop-color="#7a4a52"/><stop offset="1" stop-color="#2a1a1b"/></linearGradient>' +
    '<linearGradient id="stickGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#d6c2a0"/></linearGradient>' +
    '<linearGradient id="bladeShade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#3b2a22" stop-opacity=".3"/></linearGradient>' +
    '<radialGradient id="holeLight" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#0e0806"/><stop offset=".7" stop-color="#2c1d16"/><stop offset="1" stop-color="#4d372c"/></radialGradient>' +
    '<radialGradient id="holeDark" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#050302"/><stop offset="1" stop-color="#1c120d"/></radialGradient>' +
    '<filter id="softBlur" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="2.6"/></filter>' +
    '</defs></svg>');

  // A pig head and ears, front view, drawn in a 100 x 96 box. Ears are mirrored by x -> 100 - x.
  const PIG =
    '<path d="M24 22 C10 14 -2 26 2 44 C5 58 20 58 30 44 C35 36 33 26 24 22 Z" fill="url(#pigEar)" stroke="' + EDGE + '" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M23 28 C15 25 9 33 11 43 C13 50 20 50 26 42 C29 36 28 31 23 28 Z" fill="#dd7f90" opacity=".75"/>' +
    '<path d="M76 22 C90 14 102 26 98 44 C95 58 80 58 70 44 C65 36 67 26 76 22 Z" fill="url(#pigEar)" stroke="' + EDGE + '" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M77 28 C85 25 91 33 89 43 C87 50 80 50 74 42 C71 36 72 31 77 28 Z" fill="#dd7f90" opacity=".75"/>' +
    '<path d="M50 6 C75 6 91 24 91 47 C91 70 74 88 50 88 C26 88 9 70 9 47 C9 24 25 6 50 6 Z" fill="url(#pigHead)" stroke="' + EDGE + '" stroke-width="1.7"/>' +
    '<ellipse cx="38" cy="19" rx="13" ry="5.5" transform="rotate(-20 38 19)" fill="#fff" opacity=".3"/>' +
    '<path d="M30 25 Q50 18 70 25" fill="none" stroke="#d9808f" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>' +
    '<path d="M35 31 Q50 26 65 31" fill="none" stroke="#d9808f" stroke-width="1.1" opacity=".4" stroke-linecap="round"/>' +
    '<circle cx="23" cy="59" r="7.5" fill="#ef8f9c" opacity=".35"/><circle cx="77" cy="59" r="7.5" fill="#ef8f9c" opacity=".35"/>' +
    '<ellipse cx="34" cy="44" rx="3.4" ry="3.8" fill="' + INK + '"/><ellipse cx="66" cy="44" rx="3.4" ry="3.8" fill="' + INK + '"/>' +
    '<circle cx="33" cy="42.6" r="1.2" fill="#fff"/><circle cx="65" cy="42.6" r="1.2" fill="#fff"/>' +
    '<path d="M28.5 40 Q34 35.5 39.5 40" fill="none" stroke="#c9707f" stroke-width="1.5" stroke-linecap="round"/><path d="M60.5 40 Q66 35.5 71.5 40" fill="none" stroke="#c9707f" stroke-width="1.5" stroke-linecap="round"/>' +
    '<ellipse cx="50" cy="78" rx="17" ry="3.6" fill="#7a3b48" opacity=".32" filter="url(#softBlur)"/>' +
    '<ellipse cx="50" cy="62" rx="21" ry="15" fill="url(#pigSnout)" stroke="' + EDGE + '" stroke-width="1.5"/>' +
    '<ellipse cx="50" cy="60.5" rx="17" ry="11.5" fill="url(#pigSnoutIn)"/>' +
    '<ellipse cx="43.5" cy="61" rx="2.8" ry="4.4" fill="#5c3036"/><ellipse cx="56.5" cy="61" rx="2.8" ry="4.4" fill="#5c3036"/>' +
    '<ellipse cx="42.6" cy="59.2" rx=".9" ry="1.2" fill="#fff" opacity=".5"/><ellipse cx="55.6" cy="59.2" rx=".9" ry="1.2" fill="#fff" opacity=".5"/>' +
    '<path d="M38 79 Q50 84 62 79" fill="none" stroke="#c9707f" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>' +
    '<path d="M50 7 Q46 0 53 1.5" fill="none" stroke="#d8828f" stroke-width="1.3" stroke-linecap="round"/>';

  // A pinwheel drawn around (0,0) so it can spin about its own centre
  const PINWHEEL =
    '<g class="pin">' +
    [0, 90, 180, 270].map((a, i) =>
      '<g transform="rotate(' + a + ')"><path class="b' + (i + 1) + '" d="M0 0 L0 -27 L25 -9 Z" stroke="' + EDGE + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M0 0 L0 -27 L25 -9 Z" fill="url(#bladeShade)"/></g>'
    ).join('') +
    '</g><circle r="3.4" fill="' + INK + '"/>';

  const TROTTER =
    '<rect x="-8" y="-8" width="16" height="22" rx="7" fill="url(#pigHead)" stroke="' + EDGE + '" stroke-width="1.5"/>' +
    '<ellipse cx="-3.2" cy="11" rx="3" ry="2.6" fill="#5c3a3f"/><ellipse cx="3.2" cy="11" rx="3" ry="2.6" fill="#5c3a3f"/>';

  // A seeded random generator, so every tear has its own ragged shape but looks the same on every visit
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  function ragged(seed, cx, cy, rx, ry, jitter, n) {
    const r = rng(seed), pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.2;
      const k = 1 + (r() - 0.5) * jitter;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
  }
  const closed = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' Z';

  let count = 0;
  function build(kind, dark) {
    const id = ++count, seed = id * 7919 + 13;
    const hole = ragged(seed, 80, 86, 56, 50, 0.34, 32);
    const rim = ragged(seed + 11, 80, 86, 63.5, 57, 0.46, 36);
    const mid = ragged(seed + 5, 80, 86, 60, 53.5, 0.4, 34);
    const tilt = (id % 2 ? -1 : 1) * (4 + (id % 3) * 2);   // each pig leans a little differently

    // pig wearing a beanie topped with a spinning pinwheel (drawn inside the head's coordinates so it leans with the head)
    const beanie =
      '<path d="M26 14 Q50 -14 74 14 Z" fill="var(--c1)" stroke="' + EDGE + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<rect x="25" y="11" width="50" height="7" rx="3.5" fill="var(--c2)" stroke="' + EDGE + '" stroke-width="1.3"/>' +
      '<rect x="47.9" y="-30" width="4.2" height="33" fill="url(#stickGrad)" stroke="' + EDGE + '" stroke-width="1.2"/>' +
      '<g transform="translate(50 -32) scale(1.15)">' + PINWHEEL + '</g>';
    const head = '<g transform="translate(80 84) rotate(' + tilt + ') scale(.88) translate(-50 -48)">' + PIG + (kind === 'carousel' ? '' : beanie) + '</g>';

    // pig holding a pinwheel on a stick: the stick is drawn behind the head, the hoof in front
    const stick = kind === 'carousel'
      ? '<line x1="108" y1="132" x2="130" y2="16" stroke="' + EDGE + '" stroke-width="5.6" stroke-linecap="round"/><line x1="108" y1="132" x2="130" y2="16" stroke="url(#stickGrad)" stroke-width="3.6" stroke-linecap="round"/>'
      : '';
    const pinwheel = kind === 'carousel' ? '<g transform="translate(128 14) scale(1.15)">' + PINWHEEL + '</g>' : '';
    const trotters =
      '<g transform="translate(60 130)">' + TROTTER + '</g>' +
      '<g transform="translate(' + (kind === 'carousel' ? 108 : 100) + ' 130)">' + TROTTER + '</g>';

    return '<svg viewBox="0 -34 160 194" aria-hidden="true" focusable="false">' +
      '<defs><clipPath id="tear' + id + '"><path d="' + closed(hole) + '"/></clipPath></defs>' +
      '<path d="' + closed(rim) + '" fill="#fffaf0" stroke="rgba(59,42,34,.3)" stroke-width=".8" stroke-linejoin="round"/>' +
      '<path d="' + closed(mid) + '" fill="#e9ddc4" stroke="rgba(59,42,34,.18)" stroke-width=".6" stroke-linejoin="round"/>' +
      '<path d="' + closed(hole) + '" fill="url(#' + (dark ? 'holeDark' : 'holeLight') + ')"/>' +
      // the pig's body is inside the hole, so it is clipped to it and fades into the dark
      '<g clip-path="url(#tear' + id + ')"><ellipse cx="80" cy="128" rx="42" ry="32" fill="url(#bodyGrad)"/>' +
      '<ellipse cx="80" cy="118" rx="36" ry="13" fill="#000" opacity=".45" filter="url(#softBlur)"/></g>' +
      stick + head + trotters + pinwheel +
      '</svg>';
  }

  document.querySelectorAll('[data-mills]').forEach((host) => {
    const dark = host.classList.contains('contact');
    host.dataset.mills.split(',').forEach((spec) => {
      const [type, corner, variant, seconds] = spec.split(':');
      const el = document.createElement('span');
      el.className = 'mill mill-' + corner + ' v' + (variant || 1);
      el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('--dur', (seconds || 10) + 's');
      el.innerHTML = build(type, dark);   // trusted constant markup
      host.appendChild(el);
    });
  });
})();