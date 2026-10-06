// Operational presence only. Device pages are intentionally excluded.
const PAGES = new Set(['home','games','control','control2','editor','game-settings','game-settings2','bases','base-explorer','logo-editor','polls','polls-hub','subscriptions','account','marketplace','manual','connect-device']);
export function startActivity(client) {
  const page = location.pathname.split('/').filter(Boolean)[0] || 'home';
  if (!PAGES.has(page)) return;
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
