// js/core/guest-info-modal.js
// Jednorazowy modal informacyjny dla konta gościa.

import { alertModal } from './modal.js?v=v2026-07-15T18390';
import { t } from '../../translation/translation.js?v=v2026-07-15T18390';

const GUEST_INFO_SHOWN_PREFIX = 'fam:guest:info_shown:';

function buildGuestInfoBody() {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:grid;gap:12px;font-size:.9rem;line-height:1.55;margin-top:6px';

  [
    { iconKey: 'guestInfo.icon1', htmlKey: 'guestInfo.warning1' },
    { iconKey: 'guestInfo.icon2', htmlKey: 'guestInfo.warning2' },
  ].forEach(({ iconKey, htmlKey }) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;align-items:flex-start';

    const ic = document.createElement('span');
    ic.textContent = t(iconKey);
    ic.style.cssText = 'flex-shrink:0;font-size:1.15rem;margin-top:1px';

    const txt = document.createElement('span');
    txt.innerHTML = t(htmlKey);

    row.append(ic, txt);
    wrap.appendChild(row);
  });

  const sep = document.createElement('hr');
  sep.style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,.15);margin:2px 0';
  wrap.appendChild(sep);

  const migrateTitle = document.createElement('div');
  migrateTitle.style.cssText = 'font-weight:700;letter-spacing:.03em';
  migrateTitle.textContent = t('guestInfo.migrateTitle');
  wrap.appendChild(migrateTitle);

  const steps = document.createElement('ol');
  steps.style.cssText = 'margin:6px 0 0 0;padding-left:20px;display:grid;gap:5px';

  ['step1', 'step2', 'step3', 'step4'].forEach((key) => {
    const li = document.createElement('li');
    li.innerHTML = t(`guestInfo.${key}`);
    steps.appendChild(li);
  });

  wrap.appendChild(steps);
  return wrap;
}

/**
 * Pokazuje modal informacyjny dla gościa jednorazowo (per konto).
 * Wywołaj zaraz po requireAuth() gdy user.is_guest === true.
 *
 * @param {object} user - enriched user z requireAuth() / getUser()
 */
export async function maybeShowGuestInfoModal(user) {
  if (!user?.is_guest) return;

  const key = GUEST_INFO_SHOWN_PREFIX + (user.id || 'unknown');
  try {
    if (localStorage.getItem(key) === '1') return;
  } catch { /* storage niedostępny — pokaż mimo to */ }

  const body = buildGuestInfoBody();

  await alertModal({
    title: t('guestInfo.title'),
    text: t('guestInfo.subtitle'),
    okText: t('guestInfo.ok'),
    onReady: ({ overlay }) => {
      const sub = overlay?.querySelector('.mSub');
      if (sub) sub.after(body);
    },
  });

  try { localStorage.setItem(key, '1'); } catch {}
}