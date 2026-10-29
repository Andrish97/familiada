// Worker starej domeny familiada.online — przeprowadzka na familijna.app
// (plan: familijna-server/docs/rebranding-familijna-plan.md, „Przekierowania”).
// Fazy według dat z wrangler.toml, bez ręcznych kroków:
//   do LEGACY_HANDOFF_UNTIL — przenosiny: przeglądarka dostaje małą stronę, która
//     przenosi localStorage (sesję gościa/konta, język, dźwięki) w części `#`
//     adresu na nową domenę (odbiór: web/shared/js/core/legacy-handoff.js);
//     roboty i żądania inne niż strona HTML — 301;
//   do LEGACY_REDIRECT_UNTIL — 301 na tę samą ścieżkę pod nową domeną;
//   potem — 410 ze stroną „Serwis działa pod adresem familijna.app”.
// Daty są włącznie (cały dzień UTC).

const DAY_MS = 86_400_000;
const PAGE_HOSTS = new Set(["familiada.online", "www.familiada.online"]);
const SERVICE_HOSTS = new Set(["api.familiada.online", "supabase.familiada.online"]);
const BOT_RE = /bot|google|bing|crawl|spider|slurp|facebookexternalhit|embedly|preview|whatsapp|telegram|discord|skype/i;

function endOfDay(date) {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? t + DAY_MS : 0;
}

export function phase(env, now = Date.now()) {
  if (now < endOfDay(env.LEGACY_HANDOFF_UNTIL)) return "handoff";
  if (now < endOfDay(env.LEGACY_REDIRECT_UNTIL)) return "redirect";
  return "gone";
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
};

// Strona przenosin. Bez localStorage od razu przejście; po przeniesieniu znacznik
// `fam:handoff:done`, żeby kolejne wejście (np. po wylogowaniu na nowej domenie)
// nie przenosiło starej sesji drugi raz. Duża paczka → tylko najważniejsze klucze.
export function handoffPage(origin, target) {
  const script = `(function(){var O=${JSON.stringify(origin)},T=O+location.pathname+location.search;
try{var s=localStorage;if(s.getItem("fam:handoff:done")!=="1"){var it={},n=0;
for(var i=0;i<s.length;i++){var k=s.key(i);if(!k||k.indexOf("familiada:")===0||k.indexOf("supabase.gotrue")===0)continue;it[k]=s.getItem(k);n++;}
if(n){var j=JSON.stringify({v:1,items:it,h:location.hash});
if(j.length>30000){var p={};["sb-api-auth-token","uiLang","fam:guest:session_seen","auth:guest_upgrade_pending"].forEach(function(k){if(it[k]!=null)p[k]=it[k];});j=JSON.stringify({v:1,items:p,h:location.hash});}
var b=btoa(unescape(encodeURIComponent(j))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
s.setItem("fam:handoff:done","1");location.replace(T+"#fam-handoff="+b);return;}}}catch(e){}
location.replace(T+location.hash);})();`;
  const href = escapeHtml(target);
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Familijna</title><noscript><meta http-equiv="refresh" content="0;url=${href}"></noscript>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#fff;font:16px system-ui,sans-serif}a{color:#ffeaa6}</style></head>
<body><p><a href="${href}">familijna.app</a></p><script>${script}</script></body></html>`;
}

export function gonePage(origin) {
  const href = escapeHtml(origin + "/");
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Familijna</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#fff;font:18px/1.6 system-ui,sans-serif;text-align:center}a{color:#ffeaa6}p{margin:.4em 16px}</style></head>
<body><main><p>Serwis działa pod adresem <a href="${href}">familijna.app</a>.</p>
<p lang="en">The service has moved to <a href="${href}">familijna.app</a>.</p>
<p lang="uk">Сервіс працює за адресою <a href="${href}">familijna.app</a>.</p></main></body></html>`;
}

function wantsHtmlPage(request) {
  if (!["GET", "HEAD"].includes(request.method)) return false;
  const mode = request.headers.get("Sec-Fetch-Mode");
  if (mode && mode !== "navigate") return false;
  return (request.headers.get("Accept") || "").includes("text/html");
}

export async function handle(request, env, now = Date.now(), upstream = fetch) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const origin = env.NEW_ORIGIN || "https://www.familijna.app";
  const current = phase(env, now);

  if (SERVICE_HOSTS.has(host)) {
    // Stare adresy API obsługuje Worker `familiada` (trasy tego Workera to tylko
    // apex i www); tu na wypadek błędnej trasy — przejście do końca przekierowań.
    return current === "gone" ? new Response("Gone", { status: 410 }) : upstream(request);
  }
  if (!PAGE_HOSTS.has(host)) return new Response("Not Found", { status: 404 });

  if (current === "gone") return new Response(gonePage(origin), { status: 410, headers: HTML_HEADERS });

  const target = origin + url.pathname + url.search;
  // Strona przenosin tylko dla przeglądarki po https (GET): localStorage z http to
  // inna pamięć, a narzędzia Google (zmiana adresu w Search Console) muszą
  // zobaczyć 301 także pod http:// i przy HEAD.
  if (current === "handoff" && url.protocol === "https:" && request.method === "GET"
    && wantsHtmlPage(request) && !BOT_RE.test(request.headers.get("User-Agent") || "")) {
    return new Response(handoffPage(origin, target), { status: 200, headers: HTML_HEADERS });
  }
  return new Response(null, { status: 301, headers: { Location: target, "Cache-Control": "public, max-age=3600" } });
}

export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
