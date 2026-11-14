(function () {
  try {
    var pref = localStorage.getItem('animforge:theme');
    if (pref !== 'dark' && pref !== 'light' && pref !== 'system') {
      pref = 'dark';
    }
    var systemDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute('content', pref === 'system' ? 'light dark' : pref);
    }
    document.documentElement.dataset.themePref = pref;
    document.documentElement.dataset.resolvedTheme = resolved;
  } catch (_) {
    document.documentElement.dataset.themePref = 'dark';
    document.documentElement.dataset.resolvedTheme = 'dark';
  }
})();
