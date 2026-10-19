// js/core/topbar-controller.js
// Zarządza całym topbarem:
//  - Desktop: overflow nav ("Więcej") w section-2, dropdown .account-wrap w section-4
//  - Mobile (do 760 px): panel boczny z section-2 i section-4 płasko (bez dropdown, bez overflow)
//
// Eksportuje: setTopbarNavPriority, setTopbarAccount (alias: initTopbarAccountDropdown), autoInitTopbarAuthButton

import { signOut } from './auth.js?v=v2026-10-19T11560';
import { isGuestUser } from './guest-mode.js?v=v2026-10-19T11560';
import { t, withLangParam } from '../../translation/translation.js?v=v2026-10-19T11560';
import { icon } from './icons.js?v=v2026-10-19T11560';


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

// ── Liczniki powiadomień (.badge) ─────────────────────────────────────────────
// Wspólny zapis/odczyt licznika .badge: pusty tekst gdy 0 (CSS chowa pusty
// .badge), „99+” powyżej 99. Używane przez „Więcej” i hamburger.
function parseBadgeNumber(raw) {
  const m = String(raw || '').trim().match(/\d+/);
  const n = m ? Number(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}

function readBadgeCount(btn) {
  return parseBadgeNumber(btn?.querySelector('.badge')?.textContent);
}

function setBadgeCount(badgeEl, n) {
  if (badgeEl) badgeEl.textContent = n > 99 ? '99+' : (n > 0 ? String(n) : '');
}

// ── Overflow nav (section-2) ──────────────────────────────────────────────────
/**
 * Rejestruje overflow nav dla section-2 (używane tylko na stronie gier).
 * Desktop: ResizeObserver → chowa mniej ważne przyciski do "Więcej ▾".
 * Mobile: kontroler wywołuje expandAll() → wszystkie przyciski widoczne płasko.
 *
 * @param {Function} getButtons  fn() → HTMLElement[] od najważniejszego do najmniej ważnego
 * @param {{ moreEl: HTMLElement, moreDropdownEl: HTMLElement }} config
 * @returns {{ recalc: Function }}
 */
export function setTopbarNavPriority({ moreEl, moreDropdownEl } = {}) {
  if (!moreEl || !moreDropdownEl) return { recalc: () => {} };

  const section2 = document.querySelector('.topbar-section-2');
  if (!section2) return { recalc: () => {} };

  function getButtons() {
    return Array.from(section2.querySelectorAll(':scope > .btn'));
  }

  const moreBadge = moreEl.querySelector('.badge');
  const btnMore = document.getElementById('btnMore') || moreEl.querySelector('button');

  document.body.appendChild(moreDropdownEl);
  moreDropdownEl.className = 'nav-more-dropdown';
  moreDropdownEl.hidden = true;

  let _hiddenBtns = [];

  function updateMoreBadge(hiddenBtns) {
    const hasActiveHiddenButton = hiddenBtns.some(btn => btn.classList.contains('active'));
    btnMore?.classList.toggle('active', hasActiveHiddenButton);
    btnMore?.classList.toggle('tab-btn', hasActiveHiddenButton);
    if (!moreBadge) return;
    const sum = hiddenBtns.reduce((acc, btn) => acc + readBadgeCount(btn), 0);
    setBadgeCount(moreBadge, sum);
  }

  // Zmiana licznika na którymś przycisku: odśwież sumę na „Więcej” ORAZ
  // klony w rozwijanym menu (to kopie z chwili recalc(), same się nie
  // aktualizują — bez tego dropdown pokazywał nieaktualne liczby).
  const badgeObserver = new MutationObserver(() => {
    if (_mobileActive) return;
    if (_hiddenBtns.length) recalc();
    else updateMoreBadge([]);
  });
  getButtons().forEach(btn => {
    if (btn) badgeObserver.observe(btn, {
      subtree: true,
      characterData: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  function getVisibleBtns() {
    return getButtons().filter(btn => {
      if (!btn || btn.dataset.navHidden === 'true') return false;
      const computed = getComputedStyle(btn);
      // Nie licz przycisków wyłączonych przez breakpoint (np. „Gry
      // Producenta”). Nadal uwzględniaj elementy schowane przez poprzedni
      // pomiar overflow — ich display:none jest ustawione inline.
      if (btn.classList.contains('hidden-on-mobile') && computed.display === 'none') return false;
      return computed.display !== 'none' || _hiddenBtns.includes(btn);
    });
  }

  function recalc() {
    if (_mobileActive) return;

    const section2Width = section2.getBoundingClientRect().width;
    // Topbar Ustawień jest początkowo display:none pod ekranem logowania.
    // Pomiar zerowej szerokości błędnie uruchamiał hamburger i zostawiał go
    // po późniejszym odblokowaniu panelu.
    if (!section2.isConnected || section2Width <= 0) return;

    const btns = getVisibleBtns();
    btns.forEach(btn => { btn.style.display = ''; });
    _hiddenBtns = [];
    moreEl.style.display = 'none';
    moreDropdownEl.innerHTML = '';

    const gap = Number.parseFloat(getComputedStyle(section2).columnGap) || 0;
    const btnWidths = btns.map(btn => btn.getBoundingClientRect().width);
    const totalWidth = btnWidths.reduce((sum, width, i) => sum + width + (i > 0 ? gap : 0), 0);
    const buttonSet = new Set(btns);
    const fixedItems = Array.from(section2.children).filter(el => {
      if (buttonSet.has(el) || el === moreEl || el.hidden) return false;
      return getComputedStyle(el).display !== 'none';
    });
    const fixedWidth = fixedItems.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
    // Stałe elementy sekcji (np. selektor Narzędzi w panelu admina) nie
    // trafiają do menu Więcej, ale muszą zmniejszać miejsce dla przycisków.
    const availableWidth = Math.max(0, section2Width - fixedWidth - fixedItems.length * gap);

    moreEl.style.display = '';
    const moreWidth = moreEl.getBoundingClientRect().width;
    moreEl.style.display = 'none';

    // Jeśli nawet najważniejszy przycisk razem z „Więcej” nie mieszczą się,
    // przełącz cały pasek na hamburger. Nie używamy stałego progu viewportu:
    // decyzję podejmujemy z faktycznych szerokości elementów i dostępnej sekcji.
    const primaryButtonWidth = btnWidths[0] || 0;
    const needsHamburger = totalWidth > availableWidth && btns.length > 0 &&
      primaryButtonWidth + moreWidth + gap > availableWidth;
    window.dispatchEvent(new CustomEvent('topbar:mobile-required', {
      detail: { required: needsHamburger },
    }));
    if (needsHamburger) {
      _hiddenBtns = btns;
      updateMoreBadge(btns);
      return;
    }

    if (totalWidth <= availableWidth) {
      _hiddenBtns = [];
      updateMoreBadge([]);
      return;
    }

    const hidden = [];
    let remaining = totalWidth;
    for (let i = btns.length - 1; i >= 0; i--) {
      if (remaining + moreWidth + gap <= availableWidth) break;
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

  btnMore?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (_mobileActive) return;
    if (moreDropdownEl.hidden) {
      // Najpierw oblicz pozycję, gdy dropdown jest niewidoczny. Odsłonięcie
      // przed pomiarem potrafiło pokazać go na moment w lewym górnym rogu.
      repositionDropdown(moreEl, moreDropdownEl);
      moreDropdownEl.hidden = false;
    } else {
      moreDropdownEl.hidden = true;
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (!moreEl.contains(e.target) && !moreDropdownEl.contains(e.target)) {
      moreDropdownEl.hidden = true;
    }
  });

  window.addEventListener('resize', () => {
    if (!moreDropdownEl.hidden) repositionDropdown(moreEl, moreDropdownEl);
    if (!_mobileActive) recalc();
  }, { passive: true });
  window.addEventListener('nav:visibilitychange', () => {
    if (!_mobileActive) recalc();
  });

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { if (!_mobileActive) recalc(); }).observe(section2);
  }

  function expandAll() {
    getButtons().forEach(btn => { if (btn) btn.style.display = ''; });
    // Na mobile „Więcej” jest schowane — jego licznik nie może zostać,
    // bo hamburger sumuje widoczne liczniki i liczyłby je podwójnie.
    _hiddenBtns = [];
    updateMoreBadge([]);
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
 * @param {string}  [opts.loginHref='/login/']
 * @param {string}  [opts.accountHref='/account/']
 * @param {boolean} [opts.withAccountSettings=true]  pokaż ustawienia konta w menu nazwy
 * @param {boolean} [opts.showAuthEntry=true]  false → ukryj dla niezalogowanego
 * @param {function} [opts.onLogout]  callback przed wylogowaniem (może zwrócić Promise)
 * @returns {{ guestMode: boolean }}
 */
export function setTopbarAccount(user, {
  loginHref = '/login/',
  accountHref = '/account/',
  withAccountSettings = true,
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
  chevron.innerHTML = icon('caret-down');
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

  if (withAccountSettings) {
    const btnSettings = document.createElement('button');
    btnSettings.className = 'btn account-menu-item';
    btnSettings.type = 'button';
    btnSettings.textContent = t('games.nav.account') || 'Ustawienia konta';
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
  whoEl.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (_mobileActive) return;
    menu.hidden = !menu.hidden;
    if (!menu.hidden) repositionDropdown(whoEl, menu);
  });

  document.addEventListener('pointerdown', (e) => {
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
  const { getUser } = await import('./auth.js?v=v2026-10-19T11560');

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

  const hasOverflowNav = !!document.getElementById('navMore');
  if (hasOverflowNav) topbar.classList.add('topbar-has-overflow-nav');
  const mobileMq = window.matchMedia('(max-width: 760px)');
  const useMediaMobileMode = () => mobileMq.matches && !hasOverflowNav;
  const section2Placeholder = document.createComment('topbar-section-2-restore');
  const section4Placeholder = document.createComment('topbar-section-4-restore');
  const tabsPlaceholder = document.createComment('topbar-tabs-restore');
  const simpleTabs = document.querySelector('.simple-tabs');
  const menuContentSelector =
    'button, a, [role="button"], [role="tab"], .btn, .user-btn, .lang-switcher, .top-status';

  let overlay, panel, closeBtn, mount, tabGroup, group2, group4, sep, toggleBtn, toggleBadge, badgeObserver;
  let isMobileMounted = false;
  let navRequiresMobile = false;

  // Suma liczników przycisków WIDOCZNYCH w panelu (schowane, np. „Więcej”
  // albo przycisk ukryty dla gościa, nie mogą podbijać licznika hamburgera).
  // Panel bywa zamknięty (display:none na overlayu), więc nie getClientRects —
  // sprawdzamy własny display elementu i jego przodków do korzenia panelu.
  const isHiddenWithin = (el, root) => {
    for (let n = el; n && n !== root; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') return true;
    }
    return false;
  };

  const computeMenuBadgeSum = () =>
    [...(mount || document).querySelectorAll('.badge')]
      .filter((b) => !isHiddenWithin(b, mount))
      .reduce((sum, b) => sum + parseBadgeNumber(b.textContent), 0);

  const updateMenuBadge = () => {
    if (!toggleBtn || !toggleBadge) return;
    setBadgeCount(toggleBadge, computeMenuBadgeSum());
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
    topbar.classList.add('topbar-mobile-forced');

    overlay = document.createElement('div');
    overlay.className = 'topbar-mobile-overlay';
    if (!useMediaMobileMode()) overlay.classList.add('topbar-mobile-forced');

    panel = document.createElement('div');
    panel.className = 'topbar-mobile-panel';

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn topbar-mobile-close';
    closeBtn.innerHTML = icon('close');
    closeBtn.setAttribute('aria-label', t('common.modal.closeLabel'));

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

    // Płaskie menu: overflow nav i account dropdown nieaktywne. MUSI się
    // wykonać PRZED przeniesieniem przycisków niżej — expandAll() liczy
    // swoją listę przycisków przez section2.querySelectorAll(...), więc
    // gdyby section2 było już puste (przyciski przeniesione do group2),
    // nie miałoby czego odkryć i przyciski ukryte wcześniej przez desktopowy
    // "More ▾" (recalc(), display:none) zostawałyby niewidoczne również w
    // panelu mobilnym.
    _overflowState?.expandAll();
    _accountState?.expand();
    _mobileActive = true;

    // Tytuł strony (.topbar-title) zostaje w topbarze — na telefonie pokazuje
    // go klasa body.topbar-title-mobile; do menu trafiają tylko przyciski.
    section2.querySelectorAll(':scope > .topbar-title').forEach((el) => {
      section2.insertBefore(el, section2Placeholder);
    });
    while (section2Placeholder.nextSibling) group2.appendChild(section2Placeholder.nextSibling);
    while (section4Placeholder.nextSibling) group4.appendChild(section4Placeholder.nextSibling);

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
    toggleBtn.innerHTML = `<span class="topbar-menu-icon" aria-hidden="true">${icon('hamburger')}</span><span class="badge" aria-hidden="true"></span>`;
    toggleBadge = toggleBtn.querySelector('.badge');
    section3.append(toggleBtn);

    // Hide the old panel before a navigation handler starts loading a page.
    panel.addEventListener('click', (event) => {
      const action = event.target.closest('[data-nav-href],a[href]');
      if (!action || action.disabled || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (action.tagName === 'A' && (action.target === '_blank' || action.hasAttribute('download'))) return;
      action.blur();
      close();
    }, true);
    toggleBtn.addEventListener('pointerdown', open);
    closeBtn.addEventListener('pointerdown', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    if (!section2.querySelector(':scope > .topbar-title')) section2.style.display = 'none';
    section4.style.display = 'none';

    const backBtn = section1.querySelector('#btnBack,#btnBackToGames');
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
    topbar.classList.remove('topbar-mobile-forced');
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
    if (useMediaMobileMode() || navRequiresMobile) mountMobile();
    else unmountMobile();
  };

  window.addEventListener('topbar:mobile-required', (event) => {
    navRequiresMobile = !!event.detail?.required;
    syncMode();
  });

  syncMode();

  if (typeof mobileMq.addEventListener === 'function') {
    mobileMq.addEventListener('change', syncMode);
  } else {
    mobileMq.addListener?.(syncMode);
  }

  // Na części tabletów obrót ekranu nie zawsze odpala matchMedia "change"
  // niezawodnie — przyciski zostają wtedy zablokowane w nieaktualnym stanie
  // (schowane, a hamburger też już niewidoczny wg CSS) aż do przeładowania.
  // orientationchange jako dodatkowy, redundantny trigger; opóźnienie, bo
  // niektóre przeglądarki chwilę raportują stare wymiary tuż po evencie.
  window.addEventListener('orientationchange', () => {
    syncMode();
    setTimeout(syncMode, 300);
  });

  // Gdy hamburger włączono z powodu braku miejsca, po zmianie rozmiaru
  // przywróć na chwilę układ zwykły i ponownie zmierz rzeczywiste szerokości.
  let resizeTimer;
  window.addEventListener('resize', () => {
    if (!navRequiresMobile || useMediaMobileMode()) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      navRequiresMobile = false;
      unmountMobile();
      requestAnimationFrame(() => _overflowState?.recalc());
    }, 120);
  }, { passive: true });
}

function updateTopbarHeight() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  // `--topbar-h` opisuje wyłącznie wysokość paska, nigdy jego położenie.
  // Body używa jej do paddingu i wysokości mobilnych arkuszy.
  const height = Math.ceil(topbar.getBoundingClientRect().height);
  document.body.style.setProperty('--topbar-h', `${height}px`);
}

window.addEventListener('DOMContentLoaded', () => {
  initTopbarController();
  void autoInitTopbarAuthButton();
  requestAnimationFrame(updateTopbarHeight);
});

window.addEventListener('load', updateTopbarHeight);
window.addEventListener('resize', updateTopbarHeight);
window.visualViewport?.addEventListener('resize', updateTopbarHeight, { passive: true });
window.addEventListener('DOMContentLoaded', () => {
  const topbar = document.querySelector('.topbar');
  if (topbar && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateTopbarHeight).observe(topbar);
  }
}, { once: true });
