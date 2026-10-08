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
  const MAX_FILES = 3;
  const MAX_TOTAL = 9 * 1024 * 1024;   // FormSubmit allows 10 MB in total; leave room for the text fields
  const picker = document.getElementById('photo-picker');
  const fileList = document.getElementById('file-list');
  const errorBox = document.getElementById('form-error');
  const servicesField = document.getElementById('services-field');
  const submitBtn = document.getElementById('form-submit');
  const slots = requestForm.querySelectorAll('input[type="file"][name^="Photo"]');
  const totalSize = (files) => files.reduce((sum, f) => sum + f.size, 0);

  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = !msg; }
  function resetButton() { submitBtn.disabled = false; submitBtn.textContent = 'Send request'; }

  picker.addEventListener('change', () => {
    const files = [...picker.files];
    fileList.textContent = '';
    files.slice(0, MAX_FILES).forEach((f) => {
      const li = document.createElement('li');
      li.textContent = f.name;
      fileList.appendChild(li);
    });
    showError(files.length > MAX_FILES ? 'Only the first ' + MAX_FILES + ' photos will be sent.' : '');
  });

  requestForm.addEventListener('submit', async (e) => {
    e.preventDefault();   // the form is sent below, after the photos are prepared
    showError('');
    const chosen = [...requestForm.querySelectorAll('input.service-opt:checked')].map((i) => i.value);
    if (!chosen.length) { showError('Please choose at least one service.'); return; }
    servicesField.value = chosen.join(', ');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending\u2026';
    const files = [...picker.files].slice(0, MAX_FILES);
    let ready = await Promise.all(files.map((f) => (f.size > 1.5e6 ? compressImage(f, 1800, 0.85) : f)));
    if (totalSize(ready) > MAX_TOTAL) ready = await Promise.all(files.map((f) => compressImage(f, 1200, 0.7)));
    if (totalSize(ready) > MAX_TOTAL) {
      showError('Those photos are too large to send. Please choose smaller photos or fewer of them.');
      resetButton();
      return;
    }
    slots.forEach((slot, i) => {
      if (ready[i]) {
        const dt = new DataTransfer();
        dt.items.add(ready[i]);
        slot.files = dt.files;
        slot.disabled = false;
      } else {
        slot.disabled = true;   // nothing chosen for this slot
      }
    });
    requestForm.submit();
  });

  window.addEventListener('pageshow', resetButton);   // Back button after sending

  if (new URLSearchParams(location.search).get('sent') === '1') {
    document.getElementById('form-sent').hidden = false;
    requestForm.hidden = true;
  }
}
