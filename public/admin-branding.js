(async function () {
  try {
    const response = await fetch('/branding.json', { cache: 'no-store' });
    if (!response.ok) return;
    const logos = await response.json();
    document.querySelectorAll('[data-panel-logo]').forEach(img => {
      const paths = logos[img.dataset.panelLogo];
      if (!paths) return;
      const fallback = img.parentElement.querySelector('[data-panel-fallback]');
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => { img.hidden = false; if (fallback) fallback.hidden = true; });
      img.addEventListener('error', () => { if (img.getAttribute('src') === paths.local) img.src = paths.remote; });
      img.src = paths.local;
    });
  } catch (_) { /* The STØRM wordmark remains readable when images are unavailable. */ }
})();
