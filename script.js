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


// Decorative pig windmills --------------------------------------------------------------
// Any element with data-mills="type:corner:colors:seconds,..." gets spinning pig toys in its corners.
// type: tower (windmill with a pig at the hub) or carousel (pigs riding round, staying upright)
(function addPigMills() {
  const INK = '#3b2a22';
  const PIG =
    '<path d="M13 21 L9 6 Q9 3.5 11.5 4.8 L27 13 Z" fill="#e79aa4" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"/>' +
    '<path d="M51 21 L55 6 Q55 3.5 52.5 4.8 L37 13 Z" fill="#e79aa4" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"/>' +
    '<circle cx="32" cy="34" r="22" fill="#f7bcc2" stroke="' + INK + '" stroke-width="2.6"/>' +
    '<circle cx="17.5" cy="38" r="3.4" fill="#ef8f9c" opacity=".65"/><circle cx="46.5" cy="38" r="3.4" fill="#ef8f9c" opacity=".65"/>' +
    '<ellipse cx="32" cy="41.5" rx="10" ry="7.5" fill="#f19aa8" stroke="' + INK + '" stroke-width="2.4"/>' +
    '<ellipse cx="28.4" cy="41.5" rx="1.8" ry="2.7" fill="' + INK + '"/><ellipse cx="35.6" cy="41.5" rx="1.8" ry="2.7" fill="' + INK + '"/>' +
    '<circle cx="23" cy="30" r="2.7" fill="' + INK + '"/><circle cx="41" cy="30" r="2.7" fill="' + INK + '"/>' +
    '<circle cx="22.1" cy="29.1" r=".95" fill="#fff"/><circle cx="40.1" cy="29.1" r=".95" fill="#fff"/>';

  const open = '<svg viewBox="0 0 120 190" aria-hidden="true" focusable="false">';
  const TOWER =
    open +
    '<ellipse cx="60" cy="187" rx="30" ry="3.5" fill="rgba(59,42,34,.18)"/>' +
    '<path d="M42 186 L52 76 L68 76 L78 186 Z" fill="#fffaf0" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M54 186 V170 Q60 160 66 170 V186 Z" fill="' + INK + '"/>' +
    '<rect x="55" y="104" width="10" height="12" rx="2" fill="#f5c8ae" stroke="' + INK + '" stroke-width="2"/>' +
    '<g class="blades">' +
    [0, 90, 180, 270].map((a, i) =>
      '<path class="b' + (i + 1) + '" d="M60 60 L60 8 L96 34 Z" transform="rotate(' + a + ' 60 60)" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>'
    ).join('') +
    '</g>' +
    '<circle cx="60" cy="60" r="9" fill="' + INK + '"/>' +
    '<g transform="translate(60 60) scale(.9) translate(-32 -34)">' + PIG + '</g>' +
    '</svg>';

  const TIPS = [[60, 16], [98.6, 82], [21.4, 82]];
  const CAROUSEL =
    open +
    '<ellipse cx="60" cy="187" rx="28" ry="3.5" fill="rgba(59,42,34,.18)"/>' +
    '<rect x="56" y="64" width="8" height="122" rx="3" fill="#fffaf0" stroke="' + INK + '" stroke-width="2.6"/>' +
    '<path class="b2" d="M38 188 Q60 174 82 188 Z" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"/>' +
    '<g class="spin">' +
    TIPS.map(([x, y]) => '<line x1="60" y1="60" x2="' + x + '" y2="' + y + '" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>').join('') +
    TIPS.map(([x, y], i) =>
      '<g transform="translate(' + x + ' ' + y + ')"><g class="unspin">' +
      '<circle r="20" class="b' + (i + 1) + '" stroke="' + INK + '" stroke-width="2.5"/>' +
      '<g transform="scale(.62) translate(-32 -34)">' + PIG + '</g>' +
      '</g></g>'
    ).join('') +
    '</g>' +
    '<circle cx="60" cy="60" r="7" fill="' + INK + '"/>' +
    '</svg>';

  document.querySelectorAll('[data-mills]').forEach((host) => {
    host.dataset.mills.split(',').forEach((spec) => {
      const [type, corner, variant, seconds] = spec.split(':');
      const el = document.createElement('span');
      el.className = 'mill mill-' + corner + ' v' + (variant || 1);
      el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('--dur', (seconds || 10) + 's');
      el.innerHTML = type === 'carousel' ? CAROUSEL : TOWER;   // trusted constant markup
      host.appendChild(el);
    });
  });
})();
