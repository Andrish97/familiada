export function initMobileTopbarAutohide({
  selector = '.topbar',
  disabledIfHasSelector = '#btnControl,#btnLogoEditor,#btnBases,.btn-control,.btn-logo-editor,.btn-base-explorer',
} = {}) {
  const topbar = document.querySelector(selector);
  if (!topbar) return () => {};

  if (disabledIfHasSelector && topbar.querySelector(disabledIfHasSelector)) return () => {};
  if (window.matchMedia('(min-width: 901px)').matches) return () => {};

  let lastY = window.scrollY || 0;
  let ticking = false;
  const MIN_DELTA = 8;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || 0;
      const delta = y - lastY;
      if (Math.abs(delta) >= MIN_DELTA) {
        if (delta > 0 && y > 40) topbar.classList.add('is-hidden-mobile');
        else topbar.classList.remove('is-hidden-mobile');
        lastY = y;
      }
      ticking = false;
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}
