// Applies the saved theme (Settings > Appearance) before the page paints, so dark mode never flashes light.
// "system" (or nothing saved) leaves it to the browser's light/dark setting.
(function () {
  var t = 'system';
  try { t = localStorage.getItem('theme') || 'system'; } catch (e) { /* storage blocked: follow the system */ }
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
})();
