import { isKnownPagePath } from "./origin.js";

export function isTvUserAgent(value = "") {
  return /Smart[- ]?TV|HbbTV|NetCast|Web[O0]S|Tizen|Android[ /_-]?TV|Google[ /_-]?TV|BRAVIA|Viera|AFT\w+|AppleTV|CrKey|Roku|TV Safari/i.test(value);
}

export function tvRedirect(request, url) {
  if (!isTvUserAgent(request.headers.get("user-agent") || "")) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (request.headers.get("sec-fetch-dest") !== "document" && !(request.headers.get("accept") || "").includes("text/html")) return null;
  const path = url.pathname.replace(/\/index\.html$/, "/").replace(/\/$/, "") || "/";
  // Strona 404 i Maintenance są wyjątkami; nieznane ścieżki muszą dojść do
  // normalnej obsługi 404 zamiast trafiać na ekran podłączenia TV.
  if (["/404", "/404.html", "/maintenance"].includes(path)) return null;
  if (!isKnownPagePath(url.pathname)) return null;
  if (path === "/connect" && url.searchParams.get("tv") === "1") return null;
  if (["/control/display", "/polls/vote/qr"].includes(path) && url.searchParams.get("id") && url.searchParams.get("key") && !url.searchParams.has("preview")) return null;
  if (path === "/go" && ["display", "qr"].includes(url.searchParams.get("d")) && url.searchParams.get("id") && url.searchParams.get("key") && !url.searchParams.has("preview")) return null;
  const target = new URL("https://www.familiada.online/connect/?tv=1");
  const lang = url.searchParams.get("lang");
  if (lang && lang !== "pl") target.searchParams.set("lang", lang);
  return new Response(null, { status: 302, headers: { Location: target.href, "Cache-Control": "no-store", Vary: "User-Agent, Accept, Sec-Fetch-Dest" } });
}
