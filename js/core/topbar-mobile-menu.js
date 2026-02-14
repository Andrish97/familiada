function initMobileTopbarMenu() {
  if (!window.matchMedia('(max-width: 900px)').matches) return;

  const topbar = document.querySelector('.topbar.topbar-layout-4');
  if (!topbar || topbar.classList.contains('topbar-mobile-hidden')) return;
  if (topbar.dataset.mobileMenuReady === '1') return;

  const section1 = topbar.querySelector('.topbar-section-1');
  const section2 = topbar.querySelector('.topbar-section-2');
  const section3 = topbar.querySelector('.topbar-section-3');
  const section4 = topbar.querySelector('.topbar-section-4');
  if (!section1 || !section2 || !section3 || !section4) return;

  topbar.dataset.mobileMenuReady = '1';

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

  const tabGroup = document.createElement('div');
  tabGroup.className = 'topbar-mobile-tab-group';

  const group2 = document.createElement('div');
  group2.className = 'topbar-mobile-group topbar-mobile-group-2';

  const group4 = document.createElement('div');
  group4.className = 'topbar-mobile-group topbar-mobile-group-4';

  const legalBtn = document.getElementById('btnLegal');
  const simpleTabs = document.querySelector('.simple-tabs');

  if (simpleTabs) tabGroup.appendChild(simpleTabs);
  if (legalBtn) tabGroup.appendChild(legalBtn);

  if (tabGroup.childElementCount > 0) mount.append(tabGroup);
  mount.append(group2, group4);
  panel.append(closeBtn, mount);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn topbar-menu-toggle';
  toggleBtn.textContent = '☰';
  section3.appendChild(toggleBtn);

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

  while (section2.firstChild) group2.appendChild(section2.firstChild);
  while (section4.firstChild) group4.appendChild(section4.firstChild);

  section2.style.display = 'none';
  section4.style.display = 'none';

  const backBtn = section1.querySelector('#btnBack,#btnBackToBuilder,[data-mobile-back],.btn-back,.btn.back');
  if (backBtn) backBtn.classList.add('mobile-primary-back');
}

window.addEventListener('DOMContentLoaded', initMobileTopbarMenu);
