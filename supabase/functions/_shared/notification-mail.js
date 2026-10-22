// Maile powiadomień budowane po stronie serwera (audyt E24, wysyłka bez HTML
// od klienta). Szablony odpowiadają dawnym budowniczym z przeglądarki
// (invite-mail.js, poll-mail.js, bases.js, shareDevice.js) -- ten sam
// dokument, te same teksty i linki; dane pochodzą wyłącznie z bazy.
import { renderMailDocument } from './mail-document.js';
import { NOTIFICATION_MAIL_TEXTS } from './notification-mail-texts.js';

export const SITE_ORIGIN = 'https://www.familiada.online';
export const MAIL_LANGS = ['pl', 'en', 'uk'];

// Akcja maila -> rodzaj źródła powiadomienia (jak w notification-reference.js).
export const NOTIFICATION_ACTIONS = {
  'friend:invite': 'friend', 'friend:resend': 'friend', 'poll:resend': 'subscription',
  'poll:share': 'poll', 'base:share': 'base', 'device:share': 'device', 'copy:send': 'copy',
};

export function mailText(lang, key, vars = {}) {
  const value = NOTIFICATION_MAIL_TEXTS[lang]?.[key];
  if (typeof value !== 'string') throw new Error(`missing_mail_text:${key}`);
  return value.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function mailLink(path, lang) {
  const url = new URL(path, SITE_ORIGIN);
  url.searchParams.set('lang', lang);
  return url.href;
}

function inviteDocument(T, lang, { title, subtitle, body, actionLabel, actionUrl, unsubToken, isRegistered }) {
  const footerLinks = isRegistered
    ? [{ url: mailLink('/account/', lang), label: T('pollGo.mailAccountSettingsLink') }]
    : unsubToken ? [{ url: mailLink(`/go/?u=${encodeURIComponent(unsubToken)}`, lang), label: T('pollGo.mailUnsubGlobal') }] : [];
  return renderMailDocument({ lang, title, subtitle, body, actionLabel, actionUrl,
    ignoreNote: T('pollsHubSubscriptions.mail.ignoreNote'),
    linkHint: T('pollsHubSubscriptions.mail.linkHint'), autoNote: T('pollsHubSubscriptions.mail.autoNote'),
    footerText: isRegistered ? T('pollGo.mailAccountSettings') : '', footerLinks });
}

function contactMail(T, lang, { friend, reminder, ownerLabel, token, unsubToken }) {
  const owner = ownerLabel || 'Familiada';
  const subject = reminder
    ? T(friend ? 'sharingMail.friendReminderSubject' : 'sharingMail.subscriberReminderSubject', { owner })
    : friend ? T('contacts.mail.friendTitle', { owner }) : T('pollsHubSubscriptions.mail.subscriptionTitle', { owner });
  const body = reminder
    ? T(friend ? 'sharingMail.friendReminderBody' : 'sharingMail.subscriberReminderBody', { owner })
    : friend ? T('contacts.mail.friendBody', { owner }) : T('pollsHubSubscriptions.mail.subscriptionBody', { owner });
  const html = inviteDocument(T, lang, { title: subject, subtitle: T('pollsHubSubscriptions.mail.subtitle'), body,
    actionLabel: friend ? T('contacts.mail.friendAction') : T('pollsHubSubscriptions.mail.subscriptionAction'),
    actionUrl: mailLink(`/go/?${friend ? 'f' : 's'}=${token}`, lang),
    unsubToken: friend ? null : unsubToken, isRegistered: friend });
  return { subject, html };
}

function copyMail(T, lang, { ownerLabel, token, name, resourceKind }) {
  const owner = ownerLabel || 'Familiada';
  const label = resourceKind === 'logo' ? T('resourceSend.logo') : T('resourceSend.game');
  const subject = T('sharingMail.copySubject', { owner });
  const html = inviteDocument(T, lang, { title: subject, subtitle: T('pollsHubSubscriptions.mail.subtitle'),
    body: T('resourceSend.mailBody', { owner, name: name || '', kind: label }),
    actionLabel: T('resourceSend.mailAction'), actionUrl: mailLink(`/go/?c=${encodeURIComponent(token)}`, lang),
    unsubToken: null, isRegistered: true });
  return { subject, html };
}

function pollMail(T, lang, { reminder, ownerLabel, token, pollName, subToken, unsubToken, isRegistered }) {
  const owner = ownerLabel || T('pollsHubPolls.ownerFallback');
  const name = pollName || T('pollsHubPolls.pollFallback');
  const safeName = pollName ? T('pollsHubPolls.pollNameLabel', { name: pollName }) : T('pollsHubPolls.pollFallback');
  const footerLinks = [];
  if (isRegistered) footerLinks.push({ url: mailLink('/account/', lang), label: T('pollGo.mailAccountSettingsLink') });
  else {
    if (subToken) footerLinks.push({ url: mailLink(`/go/?s=${encodeURIComponent(subToken)}&action=unsub`, lang), label: T('pollGo.mailUnsubOwner', { owner }) });
    if (unsubToken) footerLinks.push({ url: mailLink(`/go/?u=${encodeURIComponent(unsubToken)}`, lang), label: T('pollGo.mailUnsubGlobal') });
  }
  const subject = reminder ? T('polls.share.mailReminderSubject', { name }) : T('pollsHubPolls.mail.taskSubject', { name });
  const html = renderMailDocument({ lang,
    title: reminder ? T('polls.share.mailReminderTitle') : T('pollsHubPolls.mail.taskTitle'),
    subtitle: T('pollsHubPolls.mail.subtitle'),
    body: T(reminder ? 'sharingMail.pollReminderBody' : 'pollsHubPolls.mail.taskBody', { owner, name: safeName }),
    actionLabel: T('pollsHubPolls.mail.taskAction'), actionUrl: mailLink(`/go/?t=${token}`, lang),
    ignoreNote: T('pollsHubPolls.mail.ignoreNote'), linkHint: T('pollsHubPolls.mail.linkHint'),
    autoNote: T('pollsHubPolls.mail.autoNote'),
    footerText: isRegistered ? T('pollGo.mailAccountSettings') : '', footerLinks });
  return { subject, html };
}

function baseMail(T, lang, { reminder, ownerLabel, token, baseName, role }) {
  const base = baseName || '—';
  const subject = T(reminder ? 'sharingMail.baseReminderSubject' : 'bases.mail.subject', { base });
  const html = renderMailDocument({ lang,
    title: T(reminder ? 'sharingMail.baseReminderTitle' : 'bases.mail.title'),
    body: T(reminder ? 'sharingMail.baseReminderBody' : 'sharingMail.baseBody',
      { owner: ownerLabel || '—', base, role: T(`sharingMail.${role === 'editor' ? 'editor' : 'viewer'}`) }),
    actionLabel: T('sharingMail.baseAction'), actionUrl: mailLink(`/go/?b=${token}`, lang),
    subtitle: T('bases.mail.subtitle'), ignoreNote: T('bases.mail.footer'), linkHint: T('bases.mail.linkLabel'),
    autoNote: T('pollsHubSubscriptions.mail.autoNote'), footerText: T('pollGo.mailAccountSettings'),
    footerLinks: [{ url: mailLink('/account/', lang), label: T('pollGo.mailAccountSettingsLink') }] });
  return { subject, html };
}

const DEVICE_TYPE_KEYS = { host: 'typeHost', buzzer: 'typeBuzzer', display: 'typeDisplay' };

function deviceMail(T, lang, { ownerLabel, token, deviceType, gameId, gameName, isRegistered }) {
  const typeKey = DEVICE_TYPE_KEYS[deviceType];
  if (!typeKey) throw new Error('invalid_device_type');
  const type = T(`control.shareDeviceModal.${typeKey}`);
  const subject = T('control.shareDeviceModal.mailSubject', { type });
  const html = renderMailDocument({ lang, title: subject,
    body: T('control.shareDeviceModal.mailBody', { owner: ownerLabel || '—', type, game: gameName || '—' }),
    actionLabel: T('control.shareDeviceModal.openDevice', { type }),
    actionUrl: mailLink(`/go/?d=${deviceType}&id=${gameId}&key=${token}`, lang),
    subtitle: T('sharingMail.deviceSubtitle'),
    linkHint: T('pollsHubSubscriptions.mail.linkHint'), autoNote: T('pollsHubSubscriptions.mail.autoNote'),
    footerText: isRegistered ? T('pollGo.mailAccountSettings') : '',
    footerLinks: isRegistered ? [{ url: mailLink('/account/', lang), label: T('pollGo.mailAccountSettingsLink') }] : [] });
  return { subject, html };
}

// { action, lang, reminder, data } -> { subject, html }. Dane (nazwy, tokeny,
// odbiorca) przygotowuje notification-send.js z bazy; klient podaje tylko
// akcję, token powiadomienia, wariant przypomnienia i język.
export function buildNotificationMail({ action, lang, reminder = false, data }) {
  if (!MAIL_LANGS.includes(lang)) throw new Error('invalid_mail_lang');
  const T = (key, vars) => mailText(lang, key, vars);
  switch (NOTIFICATION_ACTIONS[action]) {
    case 'friend': return contactMail(T, lang, { ...data, friend: true, reminder: action === 'friend:resend' });
    case 'subscription': return contactMail(T, lang, { ...data, friend: false, reminder: !!reminder });
    case 'copy': return copyMail(T, lang, data);
    case 'poll': return pollMail(T, lang, { ...data, reminder: !!reminder });
    case 'base': return baseMail(T, lang, { ...data, reminder: !!reminder });
    case 'device': return deviceMail(T, lang, data);
    default: throw new Error('invalid_notification_action');
  }
}
