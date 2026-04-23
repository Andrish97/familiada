// js/core/topbar-controller.js
// Zarządza całym topbarem:
//  - Desktop: overflow nav ("Więcej") w section-2, dropdown .account-wrap w section-4
//  - Mobile: panel boczny z section-2 i section-4 płasko (bez dropdown, bez overflow)
//
// Eksportuje: setTopbarNavPriority, setTopbarAccount (alias: initTopbarAccountDropdown), autoInitTopbarAuthButton

import { signOut } from './auth.js?v=v2026-04-23T22255';
import { isGuestUser } from './guest-mode.js?v=v2026-04-23T22255';
import { t, withLangParam } from '../../translation/translation.js?v=v2026-04-23T22255';

// ── Narzędzie: pozycjonowanie fixed dropdown ──────────────────────────────────
function repositionDropdown(anchorEl, dropdownEl) {
  if (!anchorEl || !dropdownEl) return;

  const wasHidden = dropdownEl.hidden;
  if (wasHidden) {
    dropdownEl.hidden = false;
    dropdownEl.style.visibility = 'hidden';
    dropdownEl.style.pointerEvents = 'none';
  }

  dropdownEl.style.position = 'fixed';

  const cRect = anchorEl.getBoundingClientRect();
  const mRect = dropdownEl.getBoundingClientRect();
  const padding = 8;

  let left = cRect.right - mRect.width;
  left = Math.min(left, window.innerWidth - mRect.width - padding);
  left = Math.max(left, padding);

  let top = cRect.bottom + 8;
  if (top + mRect.height > window.innerHeight - padding) {
    top = cRect.top - mRect.height - 8;
  }
  top = Math.min(top, window.innerHeight - mRect.height - padding);
  top = Math.max(top, padding);

  dropdownEl.style.left = `${left}px`;
  dropdownEl.style.top = `${top}px`;
  dropdownEl.style.right = 'auto';
  dropdownEl.style.transform = '';

  if (wasHidden) {
    dropdownEl.style.visibility = '';
    dropdownEl.style.pointerEvents = '';
    dropdownEl.hidden = true;
  }
}

// ── Stan modułu ───────────────────────────────────────────────────────────────
let _overflowState = null; // { expandAll, collapseAll, recalc }
let _accountState = null;  // { expand, collapse }
let _mobileActive = false;

// ── Overflow nav (section-2) ──────────────────────────────────────────────────
/**
 * Rejestruje overflow nav dla section-2 (używane tylko przez builder).
 * Desktop: ResizeObserver → chowa mniej ważne przyciski do "Więcej ▾".
 * Mobile: kontroler wywołuje expandAll() → wszystkie przyciski widoczne płasko.
 *
 * @param {Function} getButtons  fn() → HTMLElement[] od najważniejszego do najmniej ważnego
 * @param {{ moreEl: HTMLElement, moreDropdownEl: HTMLElement }} config
 * @returns {{ recalc: Function }}
 */
export function setTopbarNavPriority(getButtons, { moreEl, moreDropdownEl } = {}) {
  if (!moreEl || !moreDropdownEl) return { recalc: () => {} };

  const section2 = document.querySelector('.topbar-section-2');
  if (!section2) return { recalc: () => {} };

  const moreBadge = moreEl.querySelector('.badge');
  const btnMore = document.getElementById('btnMore') || moreEl.querySelector('button');

  document.body.appendChild(moreDropdownEl);
  moreDropdownEl.className = 'nav-more-dropdown';
  moreDropdownEl.hidden = true;

  let _hiddenBtns = [];

  function updateMoreBadge(hiddenBtns) {
    if (!moreBadge) return;
    const sum = hiddenBtns.reduce((acc, btn) => {
      const b = btn?.querySelector('.badge');
      return acc + (b ? (parseInt(b.textContent) || 0) : 0);
    }, 0);
    moreBadge.textContent = sum > 99 ? '99+' : sum > 0 ? String(sum) : '';
    btnMore?.classList.toggle('has-badge', sum > 0);
  }

  const badgeObserver = new MutationObserver(() => updateMoreBadge(_hiddenBtns));
  getButtons().forEach(btn => {
    if (btn) badgeObserver.observe(btn, { subtree: true, characterData: true, childList: true });
  });

  function getVisibleBtns() {
    return getButtons().filter(btn => btn && btn.dataset.navHidden !== 'true');
  }

  function recalc() {
    if (_mobileActive) return;

    const btns = getVisibleBtns();
    btns.forEach(btn => { btn.style.display = ''; });
    moreEl.style.display = 'none';
    moreDropdownEl.innerHTML = '';

    const section2Width = section2.getBoundingClientRect().width;
    const gap = 8;
    const btnWidths = btns.map(btn => btn.getBoundingClientRect().width);

    moreEl.style.display = '';
    const moreWidth = moreEl.getBoundingClientRect().width;
    moreEl.style.display = 'none';

    let totalWidth = 0;
    for (let i = 0; i < btnWidths.length; i++) {
      totalWidth += btnWidths[i] + (i > 0 ? gap : 0);
    }

    if (totalWidth <= section2Width) {
      _hiddenBtns = [];
      updateMoreBadge([]);
      return;
    }

    const hidden = [];
    let remaining = totalWidth;
    for (let i = btns.length - 1; i >= 0; i--) {
      if (remaining + moreWidth + gap <= section2Width) break;
      btns[i].style.display = 'none';
      hidden.unshift(btns[i]);
      remaining -= btnWidths[i] + gap;
    }

    if (!hidden.length) return;

    _hiddenBtns = hidden;
    updateMoreBadge(hidden);
    moreEl.style.display = '';
    hidden.forEach(btn => {
      const clone = btn.cloneNode(true);
      clone.style.display = '';
      clone.addEventListener('click', () => btn.click());
      moreDropdownEl.appendChild(clone);
    });
  }

  btnMore?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_mobileActive) return;
    moreDropdownEl.hidden = !moreDropdownEl.hidden;
    if (!moreDropdownEl.hidden) repositionDropdown(moreEl, moreDropdownEl);
  });

  document.addEventListener('click', (e) => {
    if (!moreEl.contains(e.target) && !moreDropdownEl.contains(e.target)) {
      moreDropdownEl.hidden = true;
    }
  });

  window.addEventListener('resize', () => {
    if (!moreDropdownEl.hidden) repositionDropdown(moreEl, moreDropdownEl);
    if (!_mobileActive) recalc();
  }, { passive: true });

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { if (!_mobileActive) recalc(); }).observe(section2);
  }

  function expandAll() {
    getButtons().forEach(btn => { if (btn) btn.style.display = ''; });
    moreEl.style.display = 'none';
    moreDropdownEl.hidden = true;
    moreDropdownEl.innerHTML = '';
  }

  function collapseAll() {
    requestAnimationFrame(() => recalc());
  }

  _overflowState = { expandAll, collapseAll, recalc };
  if (_mobileActive) expandAll();

  requestAnimationFrame(() => recalc());
  return { recalc };
}

// ── Account slot (section-4) ──────────────────────────────────────────────────
/**
 * Używa istniejącego #who/#whoStatic jako triggera dropdown.
 * Desktop: klik na #who → dropdown z opcjami.
 * Mobile: #who jako label + opcje płasko poniżej.
 *
 * @param {object|null} user
 * @param {object}  [opts]
 * @param {string}  [opts.loginHref='login']
 * @param {string}  [opts.accountHref='account']
 * @param {boolean} [opts.withAccountSettings=false]  tylko builder
 * @param {boolean} [opts.showAuthEntry=true]  false → ukryj dla niezalogowanego
 * @param {function} [opts.onLogout]  callback przed wylogowaniem (może zwrócić Promise)
 * @returns {{ guestMode: boolean }}
 */
export function setTopbarAccount(user, {
  loginHref = 'login',
  accountHref = 'account',
  withAccountSettings = false,
  showAuthEntry = true,
  onLogout = null,
} = {}) {
  const section4 = document.querySelector('.topbar-section-4');
  if (!section4) return { guestMode: true };

  // Przywróć poprzedni stan (obsługa ponownego wywołania)
  // Szukaj w całym dokumencie — elementy mogą być przeniesione do mobile panelu
  const prevMenu = document.getElementById('topbarAccountMenu');
  if (prevMenu) prevMenu.remove();
  const prevWho = document.querySelector('#who, #whoStatic');
  if (prevWho) {
    prevWho.innerHTML = '—';
    prevWho.className = prevWho.className.replace(/\baccount-btn\b|\baccount-btn--mobile-label\b/g, '').trim();
    prevWho.style.cursor = '';
    prevWho.removeAttribute('tabindex');
    prevWho.onclick = null;
  }
  _accountState = null;

  const whoEl = document.querySelector('#who, #whoStatic');
  const btnLoginEl = document.getElementById('btnLogout');

  if (!user) {
    if (whoEl) whoEl.style.display = 'none';
    if (btnLoginEl) {
      if (showAuthEntry) {
        btnLoginEl.style.display = '';
        btnLoginEl.textContent = t('common.authEntry') || 'Zaloguj / Załóż konto';
        btnLoginEl.dataset.i18n = 'common.authEntry';
        btnLoginEl.onclick = () => { location.href = withLangParam(loginHref); };
      } else {
        btnLoginEl.style.display = 'none';
      }
    }
    return { guestMode: true };
  }

  const guestMode = isGuestUser(user);
  const username = user.username || user.email || '—';

  if (btnLoginEl) btnLoginEl.style.display = 'none';

  if (!whoEl) return { guestMode };

  // Przekształć #who w trigger
  whoEl.style.display = '';
  whoEl.innerHTML = '';
  const whoSpan = document.createElement('span');
  whoSpan.className = 'account-who';
  whoSpan.textContent = username;
  const chevron = document.createElement('span');
  chevron.className = 'account-chevron';
  chevron.textContent = '▾';
  whoEl.append(whoSpan, chevron);
  whoEl.classList.add('account-btn', 'btn');
  if (!whoEl.matches('button')) {
    whoEl.style.cursor = 'pointer';
    whoEl.tabIndex = 0;
  }

  // Menu — wstawiamy za #who w DOM, position:fixed na desktop
  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.id = 'topbarAccountMenu';
  menu.hidden = true;
  whoEl.after(menu);

  if (!guestMode && withAccountSettings) {
    const btnSettings = document.createElement('button');
    btnSettings.className = 'btn account-menu-item';
    btnSettings.type = 'button';
    btnSettings.textContent = t('builder.nav.account') || 'Ustawienia konta';
    btnSettings.addEventListener('click', () => {
      menu.hidden = true;
      location.href = withLangParam(accountHref);
    });
    menu.appendChild(btnSettings);
  }

  const btnAction = document.createElement('button');
  btnAction.className = 'btn account-menu-item';
  btnAction.type = 'button';
  if (guestMode && showAuthEntry) {
    btnAction.textContent = t('common.authEntry') || 'Zaloguj / Załóż konto';
    btnAction.addEventListener('click', () => {
      menu.hidden = true;
      location.href = withLangParam(loginHref);
    });
  } else {
    btnAction.textContent = t('common.logout') || 'Wyloguj';
    btnAction.addEventListener('click', async () => {
      menu.hidden = true;
      if (onLogout) {
        try { await onLogout(); } catch(e) { console.warn('logout callback error:', e); }
      }
      await signOut();
      location.href = withLangParam(loginHref);
    });
  }
  menu.appendChild(btnAction);

  // Desktop: dropdown
  whoEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_mobileActive) return;
    menu.hidden = !menu.hidden;
    if (!menu.hidden) repositionDropdown(whoEl, menu);
  });

  document.addEventListener('click', (e) => {
    if (!whoEl.contains(e.target) && !menu.contains(e.target)) menu.hidden = true;
  });

  window.addEventListener('resize', () => {
    if (!menu.hidden && !_mobileActive) repositionDropdown(whoEl, menu);
  }, { passive: true });

  // Mobile API
  function expand() {
    menu.hidden = false;
    menu.classList.add('account-menu--inline');
    whoEl.classList.add('account-btn--mobile-label');
  }

  function collapse() {
    menu.classList.remove('account-menu--inline');
    menu.hidden = true;
    whoEl.classList.remove('account-btn--mobile-label');
  }

  _accountState = { expand, collapse };
  if (_mobileActive) expand();

  return { guestMode };
}

// ── Auto init (strony bez własnego auth flow) ─────────────────────────────────
// Alias dla kompatybilności z istniejącymi importami
export { setTopbarAccount as initTopbarAccountDropdown };

export async function autoInitTopbarAuthButton(btn = document.getElementById('btnLogout')) {
  if (!btn) return;
  if (btn.dataset.topbarAuthReady === '1') return;
  const { getUser } = await import('./auth.js?v=v2026-04-23T22255');
  if (btn.dataset.topbarAuthReady === '1') return;
  const user = await getUser();
  if (btn.dataset.topbarAuthReady === '1') return;
  setTopbarAccount(user);
  btn.dataset.topbarAuthReady = '1';
}

// ── Kontroler mobilny ─────────────────────────────────────────────────────────
function initTopbarController() {
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
  const menuContentSelector =
    'button, a, [role="button"], [role="tab"], .btn, .user-btn, .lang-switcher, .top-status';

  let overlay, panel, closeBtn, mount, tabGroup, group2, group4, sep, toggleBtn, toggleBadge, badgeObserver;
  let isMobileMounted = false;

  const parseBadgeNumber = (raw) => {
    const m = String(raw || '').trim().match(/\d+/);
    const n = m ? Number(m[0]) : 0;
    return Number.isFinite(n) ? n : 0;
  };

  const computeMenuBadgeSum = () =>
    [...(mount || document).querySelectorAll('.has-badge .badge')]
      .reduce((sum, b) => sum + parseBadgeNumber(b.textContent), 0);

  const updateMenuBadge = () => {
    if (!toggleBtn || !toggleBadge) return;
    const sum = computeMenuBadgeSum();
    toggleBadge.textContent = sum > 99 ? '99+' : (sum > 0 ? String(sum) : '');
    toggleBtn.classList.toggle('has-badge', sum > 0);
  };

  const isVisible = (el) => {
    if (!el) return false;
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  };

  const hasVisibleMenuItems = () => {
    if (!isMobileMounted || !mount) return false;
    return (tabGroup?.childElementCount || 0) > 0 ||
      [...mount.querySelectorAll(menuContentSelector)].some(isVisible);
  };

  const hasMenuContent = () => {
    const hasTabs = !!simpleTabs?.querySelector('.tab, button, [role="tab"]');
    const sel = 'button, a, .btn, [role="button"], [role="tab"], .user-btn, .lang-switcher, .top-status';
    return hasTabs ||
      [...section2.querySelectorAll(sel)].some(isVisible) ||
      [...section4.querySelectorAll(sel)].some(isVisible);
  };

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
    if (!hasMenuContent()) return;
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

    while (section2Placeholder.nextSibling) group2.appendChild(section2Placeholder.nextSibling);
    while (section4Placeholder.nextSibling) group4.appendChild(section4Placeholder.nextSibling);

    // Płaskie menu: overflow nav i account dropdown nieaktywne
    _overflowState?.expandAll();
    _accountState?.expand();
    _mobileActive = true;

    sep = document.createElement('div');
    sep.className = 'topbar-mobile-sep';
    mount.append(group2, sep, group4);

    const visibleItems = (root) => [...root.querySelectorAll(menuContentSelector)].filter(isVisible);
    const hasAnything =
      (tabGroup?.childElementCount || 0) > 0 ||
      visibleItems(group2).length > 0 ||
      visibleItems(group4).length > 0;

    if (!hasAnything) { unmountMobile(); return; }

    panel.append(closeBtn, mount);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn topbar-menu-toggle';
    toggleBtn.innerHTML = `<span class="topbar-menu-icon" aria-hidden="true">☰</span><span class="badge" aria-hidden="true"></span>`;
    toggleBadge = toggleBtn.querySelector('.badge');
    section3.append(toggleBtn);

    toggleBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    section2.style.display = 'none';
    section4.style.display = 'none';

    const backBtn = section1.querySelector('#btnBack,#btnBackToBuilder,[data-mobile-back],.btn-back,.btn.back');
    if (backBtn) backBtn.classList.add('mobile-primary-back');

    badgeObserver = new MutationObserver(() => {
      updateMenuBadge();
      if (!hasVisibleMenuItems()) unmountMobile();
    });
    badgeObserver.observe(mount, { subtree: true, childList: true, characterData: true, attributes: true });
    updateMenuBadge();
  };

  const unmountMobile = () => {
    if (!isMobileMounted) return;
    isMobileMounted = false;
    close();

    // Przywróć account slot i overflow przed przeniesieniem elementów
    _accountState?.collapse();
    _mobileActive = false;

    while (group2?.firstChild) section2.insertBefore(group2.firstChild, section2Placeholder);
    while (group4?.firstChild) section4.insertBefore(group4.firstChild, section4Placeholder);

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

    try { badgeObserver?.disconnect(); } catch {}
    badgeObserver = toggleBadge = null;
    overlay = panel = closeBtn = mount = tabGroup = group2 = group4 = sep = toggleBtn = null;

    // Przelicz overflow po przywróceniu section-2
    _overflowState?.collapseAll();
  };

  const syncMode = () => {
    if (mobileMq.matches) mountMobile();
    else unmountMobile();
  };

  syncMode();

  if (typeof mobileMq.addEventListener === 'function') {
    mobileMq.addEventListener('change', syncMode);
  } else {
    mobileMq.addListener?.(syncMode);
  }
}

function updateTopbarHeight() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  const h = Math.ceil(topbar.getBoundingClientRect().height);
  document.body.style.setProperty('--topbar-h', `${h}px`);
  // Ustawiamy --topbar-h na body (inline style bije CSS).
  // CSS: body:has(.topbar) { padding-top: var(--topbar-h) } aktualizuje się automatycznie.
  document.body.style.setProperty('--topbar-h', `${h}px`);
}

window.addEventListener('DOMContentLoaded', () => {
  initTopbarController();
  void autoInitTopbarAuthButton();
  requestAnimationFrame(updateTopbarHeight);
});

window.addEventListener('load', updateTopbarHeight);
window.addEventListener('resize', updateTopbarHeight);
