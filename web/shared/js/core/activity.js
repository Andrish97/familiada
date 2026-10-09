// Operational presence only. Device pages are intentionally excluded.
const PAGES = new Set(['home','games','control','editor','game-settings','bases','base-explorer','logo','polls','subscriptions','account','marketplace','manual','connect-device']);
// Klucz strony w statystykach to pierwszy segment adresu, z wyjątkami dla
// podfolderów, które mają się liczyć osobno (lista rośnie z przenosinami
// adresów) i dla stron głosowania uczestnika z zewnątrz (nie są częścią obecności).
const EXCLUDED_PREFIXES = ['polls/vote'];
const SUBPAGES = {};
export function activityPage(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const joined = segments.join('/');
  if (EXCLUDED_PREFIXES.some((prefix) => joined === prefix || joined.startsWith(prefix + '/'))) return null;
  const two = segments.slice(0, 2).join('/');
  return SUBPAGES[two] || segments[0] || 'home';
}
export function startActivity(client) {
  const page = activityPage(location.pathname);
  if (!page || !PAGES.has(page)) return;
  const tabId = crypto.randomUUID();
  const rawId = new URL(location.href).searchParams.get('id');
  const gameId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId || '') ? rawId : null;
  let pending = false;
  async function ping() {
    if (pending) return;
    pending = true;
    try {
      const { data } = await client.auth.getSession();
      if (data?.session) await client.rpc('site_activity_ping', { p_tab_id:tabId,p_page:page,p_game_id:gameId,p_visible:!document.hidden });
    } catch { /* Activity must never interrupt gameplay or editing. */ }
    finally { pending = false; }
  }
  let timer = setInterval(ping,30000);
  document.addEventListener('visibilitychange',ping);
  window.addEventListener('pageshow',() => { if (!timer) timer=setInterval(ping,30000);void ping(); });
  window.addEventListener('pagehide',() => {clearInterval(timer);timer=null;});
  void ping();
}
