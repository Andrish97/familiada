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

function classifyNode(node) {
  const id = node.id || '';
  const cls = node.classList;

  if (id === 'btnManual' || cls.contains('lang-switcher') || cls.contains('lang-floating')) return 'help';
  if (id === 'who' || cls.contains('who') || id === 'btnLogout') return 'user';
  return 'actions';
}

function initDesktopTopbarSections() {
  if (window.matchMedia('(max-width: 900px)').matches) return;

  const topbar = document.querySelector('.topbar');
  const left = topbar?.querySelector('.topbar-left');
  const right = topbar?.querySelector('.topbar-right');
  if (!topbar || !left || !right) return;
  if (topbar.dataset.desktopSectionsReady === '1') return;

  topbar.dataset.desktopSectionsReady = '1';
  topbar.classList.add('topbar-desktop-sections');

  const section1 = document.createElement('div');
  section1.className = 'topbar-section topbar-section-brand';

  const section2 = document.createElement('div');
  section2.className = 'topbar-section topbar-section-actions-a';

  const section3 = document.createElement('div');
  section3.className = 'topbar-section topbar-section-actions-b';

  const section4 = document.createElement('div');
  section4.className = 'topbar-section topbar-section-right';

  const helpStack = document.createElement('div');
  helpStack.className = 'topbar-stack topbar-stack-help';

  const userStack = document.createElement('div');
  userStack.className = 'topbar-stack topbar-stack-user';

  // sekcja 1: brand + back
  const leftNodes = [...left.children];
  const brand = leftNodes.find((n) => n.classList?.contains('brand')) || null;
  const back = leftNodes.find((n) => (n.id || '').startsWith('btnBack') || n.classList?.contains('btn-back') || n.classList?.contains('back')) || null;
  if (brand) section1.appendChild(brand);
  if (back) section1.appendChild(back);

  const actionNodes = [];
  for (const node of [...right.children]) {
    const bucket = classifyNode(node);
    if (bucket === 'help') helpStack.appendChild(node);
    else if (bucket === 'user') userStack.appendChild(node);
    else actionNodes.push(node);
  }

  const half = Math.ceil(actionNodes.length / 2);
  actionNodes.slice(0, half).forEach((n) => section2.appendChild(n));
  actionNodes.slice(half).forEach((n) => section3.appendChild(n));

  section4.appendChild(helpStack);
  section4.appendChild(userStack);

  topbar.appendChild(section1);
  topbar.appendChild(section2);
  topbar.appendChild(section3);
  topbar.appendChild(section4);

  left.style.display = 'none';
  right.style.display = 'none';
}

function createFallbackBackButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn mobile-primary-back mobile-back-fallback';
  btn.textContent = '←';
  btn.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else location.href = 'builder.html';
  });
  return btn;
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

  const sectionActions = document.createElement('div');
  sectionActions.className = 'topbar-mobile-section topbar-mobile-actions';

  const sectionHelp = document.createElement('div');
  sectionHelp.className = 'topbar-mobile-section topbar-mobile-help';

  const sectionUser = document.createElement('div');
  sectionUser.className = 'topbar-mobile-section topbar-mobile-user';

  mount.appendChild(sectionActions);
  mount.appendChild(sectionHelp);
  mount.appendChild(sectionUser);

  panel.appendChild(closeBtn);
  panel.appendChild(mount);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn topbar-menu-toggle';
  toggleBtn.textContent = '☰';

  const backBtn = left.querySelector('#btnBack,#btnBackToBuilder,[data-mobile-back],.btn-back,.btn.back') || createFallbackBackButton();
  if (!backBtn.parentElement) left.appendChild(backBtn);
  backBtn.classList.add('mobile-primary-back');

  // mobile: bez logo
  const brand = left.querySelector('.brand');
  if (brand) brand.style.display = 'none';

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

  while (right.firstChild) {
    const n = right.firstChild;
    const bucket = classifyNode(n);
    if (bucket === 'help') sectionHelp.appendChild(n);
    else if (bucket === 'user') sectionUser.appendChild(n);
    else sectionActions.appendChild(n);
  }
  right.style.display = 'none';
}

if (!isExcluded) {
  initMobileTopbarAutohide({ disabledIfHasSelector: '' });
  window.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia('(max-width: 900px)').matches) initMobileTopbarOverlay();
    else initDesktopTopbarSections();
  });
}
