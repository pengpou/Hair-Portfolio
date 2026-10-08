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

  // Arrow hover bands take their colors from the photo edge they touch.
  const prevBtn = lightbox.querySelector('.lb-prev');
  const nextBtn = lightbox.querySelector('.lb-next');
  const bandCanvas = document.createElement('canvas');
  const BAND_W = 100, BAND_H = 32;
  const SHADE = 0.55;   // darken the sampled color so the band stays a darker tint of the photo
  const ALPHA = 0.7;

  function edgeGradient(ctx, side) {
    const px = ctx.getImageData(side === 'left' ? 0 : BAND_W - 2, 0, 2, BAND_H).data;
    const stops = [];
    for (let y = 0; y < BAND_H; y++) {
      let r = 0, g = 0, b = 0;
      for (let x = 0; x < 2; x++) {
        const i = (y * 2 + x) * 4;
        r += px[i]; g += px[i + 1]; b += px[i + 2];
      }
      const c = [r, g, b].map((v) => Math.round((v / 2) * SHADE));
      stops.push('rgba(' + c.join(',') + ',' + ALPHA + ') ' + (y / (BAND_H - 1) * 100).toFixed(1) + '%');
    }
    return 'linear-gradient(to bottom, ' + stops.join(', ') + ')';
  }

  function updateBands() {
    try {
      bandCanvas.width = BAND_W; bandCanvas.height = BAND_H;
      const ctx = bandCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(lbImg, 0, 0, BAND_W, BAND_H);
      prevBtn.style.setProperty('--band', edgeGradient(ctx, 'left'));
      nextBtn.style.setProperty('--band', edgeGradient(ctx, 'right'));
    } catch (e) {
      // canvas unavailable (e.g. opened from file://): fall back to the plain dark band
      prevBtn.style.removeProperty('--band');
      nextBtn.style.removeProperty('--band');
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
