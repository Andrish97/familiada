import { initMobileTopbarAutohide } from './topbar-autohide.js';

const path = location.pathname.toLowerCase();
const file = path.split('/').pop() || '';

const isExcluded =
  path.includes('/base-explorer/') ||
  path.includes('/logo-editor/') ||
  path.includes('/control/') ||
  file === 'base-explorer.html' ||
  file === 'logo-editor.html' ||
  file === 'control.html';

function initDesktopTopbarSections() {
  if (window.matchMedia('(max-width: 900px)').matches) return;

  const topbar = document.querySelector('.topbar');
  const left = topbar?.querySelector('.topbar-left');
  const right = topbar?.querySelector('.topbar-right');
  if (!topbar || !left || !right) return;
  if (topbar.dataset.desktopSectionsReady === '1') return;

  topbar.dataset.desktopSectionsReady = '1';
  topbar.classList.add('topbar-desktop-sections');

  const center = document.createElement('div');
  center.className = 'topbar-center-grid';

  const rail = document.createElement('div');
  rail.className = 'topbar-right-rail';

  const helpStack = document.createElement('div');
  helpStack.className = 'topbar-stack topbar-stack-help';

  const userStack = document.createElement('div');
  userStack.className = 'topbar-stack topbar-stack-user';

  const nodes = [...right.children];
  for (const node of nodes) {
    const id = node.id || '';
    const cls = node.classList;

    if (id === 'who' || cls.contains('who')) {
      userStack.appendChild(node);
      continue;
    }
    if (id === 'btnLogout') {
      userStack.appendChild(node);
      continue;
    }
    if (id === 'btnManual' || cls.contains('lang-switcher') || cls.contains('lang-floating')) {
      helpStack.appendChild(node);
      continue;
    }
    center.appendChild(node);
  }

  rail.appendChild(helpStack);
  rail.appendChild(userStack);

  topbar.insertBefore(center, right);
  topbar.insertBefore(rail, right);
  right.style.display = 'none';
}

function initMobileTopbarOverlay() {
  if (window.matchMedia('(min-width: 901px)').matches) return;

  const topbar = document.querySelector('.topbar');
  const left = topbar?.querySelector('.topbar-left');
  const right = topbar?.querySelector('.topbar-right');
  if (!topbar || !left || !right) return;
  if (topbar.dataset.mobileCompactReady === '1') return;

  topbar.dataset.mobileCompactReady = '1';

  const overlay = document.createElement('div');
  overlay.className = 'topbar-mobile-overlay';

  const panel = document.createElement('div');
  panel.className = 'topbar-mobile-panel';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn topbar-mobile-close';
  closeBtn.textContent = '✕';

  const mount = document.createElement('div');
  mount.className = 'topbar-mobile-mount';

  panel.appendChild(closeBtn);
  panel.appendChild(mount);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn topbar-menu-toggle';
  toggleBtn.textContent = '☰';
  left.appendChild(toggleBtn);

  const close = () => {
    overlay.classList.remove('is-open');
    document.body.classList.remove('topbar-mobile-lock');
  };

  const open = () => {
    overlay.classList.add('is-open');
    document.body.classList.add('topbar-mobile-lock');
  };

  toggleBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  while (right.firstChild) mount.appendChild(right.firstChild);
  right.style.display = 'none';

  const backBtn = left.querySelector('#btnBack,#btnBackToBuilder,[data-mobile-back],.btn-back,.btn.back');
  if (backBtn) backBtn.classList.add('mobile-primary-back');
}

if (!isExcluded) {
  initMobileTopbarAutohide({ disabledIfHasSelector: '' });
  window.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia('(max-width: 900px)').matches) initMobileTopbarOverlay();
    else initDesktopTopbarSections();
  });
}
