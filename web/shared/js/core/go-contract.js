// Go validates the URL before resolving a token or delegating to another page.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const primary = ['p', 'd', 't', 's', 'f', 'b', 'u', 'm'];
export function parseGoLink(params) {
  const markers = primary.filter(key => params.has(key));
  if (!markers.length) return { kind: 'missing' };
  if (markers.length !== 1 || [...params.keys()].some(key => params.getAll(key).length !== 1)) return { kind: 'invalid' };
  const marker = markers[0], value = params.get(marker);
  if (!value || (params.has('lang') && !['pl', 'en', 'uk'].includes(params.get('lang')))) return { kind: 'invalid' };
  const allowed = new Set([marker, 'lang']);
  if (marker === 'p' || marker === 'd') {
    allowed.add('id'); allowed.add('key');
    if (!uuid.test(params.get('id') || '') || !params.get('key')) return { kind: 'invalid' };
    if (marker === 'p' && value !== 'anon') return { kind: 'invalid' };
    if (marker === 'd' && !['display', 'host', 'buzzer', 'qr'].includes(value)) return { kind: 'invalid' };
    if (marker === 'd' && value !== 'qr' && !uuid.test(params.get('key'))) return { kind: 'invalid' };
  } else if (marker === 'm') {
    if (!/^[0-9a-f]{64}$/i.test(value)) return { kind: 'invalid' };
  } else if (!uuid.test(value)) return { kind: 'invalid' };
  if (marker === 's' && params.has('action')) {
    allowed.add('action'); if (params.get('action') !== 'unsub') return { kind: 'invalid' };
  }
  if ([...params.keys()].some(key => !allowed.has(key))) return { kind: 'invalid' };
  return { kind: marker, token: value };
}
export function goKindMatches(marker, kind) {
  return ({ t: ['task'], s: ['sub', 'friend'], f: ['friend'], b: ['base'], u: ['unsub'] })[marker]?.includes(kind) || false;
}
export function goErrorKey(error) {
  return ({ poll_stopped: 'pollStopped', poll_closed: 'pollEnded', expired: 'inviteExpired', invalid_token: 'inviteExpired', revoked: 'accessUnavailable' })[error] || 'invalidLinkTitle';
}
export function baseStateKey(status) {
  return ({ done: 'baseInviteAccepted', declined: 'inviteDeclinedShort', cancelled: 'accessRevoked' })[status] || 'inviteExpired';
}
export function matchesGoRecipient(user, expectedUserId, expectedEmail) {
  if (!user) return false;
  if (expectedUserId) return user.id === expectedUserId;
  const normalize = value => String(value || '').trim().toLowerCase();
  return Boolean(normalize(user.email) && normalize(expectedEmail) && normalize(user.email) === normalize(expectedEmail));
}
