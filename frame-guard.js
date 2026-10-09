// Clickjacking protection. GitHub Pages cannot send the "do not embed me" header, so the page checks for itself:
// if it is being shown inside another website's frame, it tries to break out and, failing that, hides itself.
(function () {
  if (window.top === window.self) return;
  try { window.top.location.replace(window.self.location.href); } catch (e) { /* the browser may refuse */ }
  document.documentElement.style.display = 'none';
})();