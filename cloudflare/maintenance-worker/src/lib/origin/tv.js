export function isTvUserAgent(value = "") {
  return /Smart[- ]?TV|HbbTV|NetCast|Web[O0]S|Tizen|Android[ /_-]?TV|Google[ /_-]?TV|BRAVIA|Viera|AFT\w+|AppleTV|CrKey|Roku|TV Safari/i.test(value);
}

export function tvRedirect(request, url) {
  if (!isTvUserAgent(request.headers.get("user-agent") || "")) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (request.headers.get("sec-fetch-dest") !== "document" && !(request.headers.get("accept") || "").includes("text/html")) return null;
  const path = url.pathname.replace(/\/index\.html$/, "/").replace(/\/$/, "");
  if (path === "/connect-device" && url.searchParams.get("tv") === "1") return null;
  if (["/display", "/display2", "/poll-qr"].includes(path) && url.searchParams.get("id") && url.searchParams.get("key") && !url.searchParams.has("preview")) return null;
  const target = new URL("https://www.familiada.online/connect-device/?tv=1");
  const lang = url.searchParams.get("lang");
  if (lang && lang !== "pl") target.searchParams.set("lang", lang);
  return new Response(null, { status: 302, headers: { Location: target.href, "Cache-Control": "no-store", Vary: "User-Agent, Accept, Sec-Fetch-Dest" } });
}
