function initMobileTopbarMenu() {
  const topbar = document.querySelector('.topbar.topbar-layout-4');
  if (!topbar || topbar.classList.contains('topbar-mobile-hidden')) return;
  if (topbar.dataset.mobileMenuControllerReady === '1') return;

  const section1 = topbar.querySelector('.topbar-section-1');
  const section2 = topbar.querySelector('.topbar-section-2');
  const section3 = topbar.querySelector('.topbar-section-3');
  const section4 = topbar.querySelector('.topbar-section-4');
  if (!section1 || !section2 || !section3 || !section4) return;

  topbar.dataset.mobileMenuControllerReady = '1';

  const mobileMq = window.matchMedia('(max-width: 900px)');
  const section2Placeholder = document.createComment('topbar-section-2-restore');
  const section4Placeholder = document.createComment('topbar-section-4-restore');
  const tabsPlaceholder = document.createComment('topbar-tabs-restore');
  const simpleTabs = document.querySelector('.simple-tabs');

  let overlay;
  let panel;
  let closeBtn;
  let mount;
  let tabGroup;
  let group2;
  let group4;
  let toggleBtn;
  let isMobileMounted = false;

  const close = () => {
    overlay?.classList.remove('is-open');
    document.body.classList.remove('topbar-mobile-lock');
  };

  const open = () => {
    overlay?.classList.add('is-open');
    document.body.classList.add('topbar-mobile-lock');
  };

  const mountMobile = () => {
    if (isMobileMounted) return;
    isMobileMounted = true;

    overlay = document.createElement('div');
    overlay.className = 'topbar-mobile-overlay';

    panel = document.createElement('div');
    panel.className = 'topbar-mobile-panel';

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn topbar-mobile-close';
    closeBtn.textContent = '✕';

    mount = document.createElement('div');
    mount.className = 'topbar-mobile-mount';

    tabGroup = document.createElement('div');
    tabGroup.className = 'topbar-mobile-tab-group';

    group2 = document.createElement('div');
    group2.className = 'topbar-mobile-group topbar-mobile-group-2';

    group4 = document.createElement('div');
    group4.className = 'topbar-mobile-group topbar-mobile-group-4';

    if (simpleTabs?.parentNode) {
      simpleTabs.parentNode.insertBefore(tabsPlaceholder, simpleTabs);
      tabGroup.appendChild(simpleTabs);
    }

    if (tabGroup.childElementCount > 0) mount.append(tabGroup);

    if (section2.firstChild) section2.insertBefore(section2Placeholder, section2.firstChild);
    else section2.appendChild(section2Placeholder);

    if (section4.firstChild) section4.insertBefore(section4Placeholder, section4.firstChild);
    else section4.appendChild(section4Placeholder);

    while (section2Placeholder.nextSibling) {
      group2.appendChild(section2Placeholder.nextSibling);
    }

    while (section4Placeholder.nextSibling) {
      group4.appendChild(section4Placeholder.nextSibling);
    }

    mount.append(group2, group4);
    panel.append(closeBtn, mount);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn topbar-menu-toggle';
    toggleBtn.textContent = '☰';
    section3.prepend(toggleBtn);

    toggleBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    section2.style.display = 'none';
    section4.style.display = 'none';

    const backBtn = section1.querySelector('#btnBack,#btnBackToBuilder,[data-mobile-back],.btn-back,.btn.back');
    if (backBtn) backBtn.classList.add('mobile-primary-back');
  };

  const unmountMobile = () => {
    if (!isMobileMounted) return;
    isMobileMounted = false;
    close();

    while (group2?.firstChild) {
      section2.insertBefore(group2.firstChild, section2Placeholder);
    }
    while (group4?.firstChild) {
      section4.insertBefore(group4.firstChild, section4Placeholder);
    }

    if (simpleTabs && tabsPlaceholder.parentNode) {
      tabsPlaceholder.parentNode.insertBefore(simpleTabs, tabsPlaceholder);
      tabsPlaceholder.remove();
    }

    section2Placeholder.remove();
    section4Placeholder.remove();

    section2.style.display = '';
    section4.style.display = '';

    toggleBtn?.remove();
    overlay?.remove();

    overlay = null;
    panel = null;
    closeBtn = null;
    mount = null;
    tabGroup = null;
    group2 = null;
    group4 = null;
    toggleBtn = null;
  };

  const syncMode = () => {
    if (mobileMq.matches) mountMobile();
    else unmountMobile();
  };

  syncMode();

  if (typeof mobileMq.addEventListener === 'function') {
    mobileMq.addEventListener('change', syncMode);
  } else if (typeof mobileMq.addListener === 'function') {
    mobileMq.addListener(syncMode);
  }
}

window.addEventListener('DOMContentLoaded', initMobileTopbarMenu);
