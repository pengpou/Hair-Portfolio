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

// Service tabs: one open at a time
const tabButtons = document.querySelectorAll('.tab-btn');

function setTab(btn, open) {
  btn.setAttribute('aria-expanded', open);
  document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const willOpen = btn.getAttribute('aria-expanded') !== 'true';
    tabButtons.forEach((b) => setTab(b, false));
    setTab(btn, willOpen);
  });
});

// Open a tab when linked to by id (nav links, direct URL)
function openFromHash() {
  const tab = document.querySelector('.tab' + location.hash);
  if (!tab) return;
  tabButtons.forEach((b) => setTab(b, false));
  setTab(tab.querySelector('.tab-btn'), true);
}
window.addEventListener('hashchange', openFromHash);
if (location.hash) openFromHash();

// Subtabs inside Chemical Services
document.querySelectorAll('.subtab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtab').forEach((b) => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
      document.getElementById(b.dataset.target).hidden = !active;
    });
  });
});
