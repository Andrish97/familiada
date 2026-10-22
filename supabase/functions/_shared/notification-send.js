// Przygotowanie wiersza mail_queue dla maila powiadomienia (send-mail).
// Klient podaje tylko: akcję, token powiadomienia (ten z linku /go/),
// wariant przypomnienia i język. Odbiorca, nazwy i linki pochodzą z bazy:
// z przydziału (mail_notification_allocations), który wcześniej utworzył RPC
// sprawdzający uprawnienia i limity -- bez przydziału nie ma maila.
import { buildNotificationMail, NOTIFICATION_ACTIONS, MAIL_LANGS } from './notification-mail.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Walidacja jednego elementu żądania: { action, token, reminder? }.
export function parseNotificationItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const action = typeof raw.action === 'string' ? raw.action : '';
  const token = typeof raw.token === 'string' ? raw.token.trim().toLowerCase() : '';
  if (!Object.hasOwn(NOTIFICATION_ACTIONS, action) || !UUID.test(token)) return null;
  if (raw.reminder !== undefined && typeof raw.reminder !== 'boolean') return null;
  return { action, token, reminder: raw.reminder === true };
}

export function parseMailLang(value) {
  return MAIL_LANGS.includes(value) ? value : null;
}

function htmlToText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

const norm = (value) => String(value || '').trim().toLowerCase();

// db: { allocation(uid, kind, token), ownerLabel(uid), baseName(id), gameName(id),
//       copyOffer(id), unsubToken(email), pollUnsubInfo(uid, email), md5Hex(text) }
// Zwraca { row } albo { skip: powód }.
export async function prepareNotificationRow({ uid, lang, item, db }) {
  const kind = NOTIFICATION_ACTIONS[item.action];
  const allocation = await db.allocation(uid, kind, item.token);
  // Brak przydziału: powiadomienia wyłączone u odbiorcy, cooldown albo token
  // spoza uprawnień -- nic nie trafia do kolejki.
  if (!allocation) return { skip: 'notifications_disabled' };
  const to = norm(allocation.to_email);
  const resource = allocation.snapshot?.resource || {};
  const recipientId = allocation.recipient_id || null;
  const ownerLabel = await db.ownerLabel(uid);
  const data = { ownerLabel, token: item.token };
  let targetKey = `email:${to}`;
  const reference = { kind, token: item.token };

  if (kind === 'subscription') data.unsubToken = await db.unsubToken(to);
  if (kind === 'poll') {
    const info = await db.pollUnsubInfo(uid, to);
    Object.assign(data, { pollName: await db.gameName(resource.game_id), subToken: info?.sub_token || null,
      unsubToken: info?.unsub_token || null, isRegistered: !info });
  }
  if (kind === 'base') {
    Object.assign(data, { baseName: await db.baseName(resource.base_id), role: resource.role });
    targetKey = `pair:${uid}:${recipientId}:base:${resource.base_id}`;
  }
  if (kind === 'device') {
    Object.assign(data, { deviceType: resource.device_type, gameId: resource.game_id,
      gameName: await db.gameName(resource.game_id), isRegistered: !!recipientId });
    targetKey = `pair:${uid}:${recipientId || await db.md5Hex(to)}:device:${resource.device_type}:game:${resource.game_id}`;
    reference.device_type = resource.device_type;
    reference.game_id = resource.game_id;
  }
  if (kind === 'copy') {
    const offer = await db.copyOffer(allocation.copy_offer_id);
    if (!offer) return { skip: 'notifications_disabled' };
    Object.assign(data, { name: offer.name, resourceKind: offer.resource_kind });
    targetKey = `pair:${uid}:${recipientId}:copy:${offer.resource_kind}:${offer.source_id}`;
  }

  const { subject, html } = buildNotificationMail({ action: item.action, lang, reminder: item.reminder, data });
  return { row: {
    created_by: uid, to_email: to, subject, html, text: htmlToText(html),
    status: 'pending', not_before: new Date().toISOString(), attempts: 0,
    cooldown_action_key: item.action, cooldown_target_key: targetKey,
    notification_source_kind: kind, notification_source_token: item.token,
    meta: { notification_reference: reference },
  } };
}
