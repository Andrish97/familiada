import { test } from "node:test";
import assert from "node:assert/strict";
import { isTvUserAgent, tvRedirect } from "../../cloudflare/maintenance-worker/src/lib/origin/tv.js";
const ua = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 TV Safari/537.36";
function redirect(path, headers = {}, method = "GET") {
  const url = new URL(path, "https://www.familiada.online");
  return tvRedirect(new Request(url, { method, headers: { "user-agent": ua, accept: "text/html", ...headers } }), url);
}
test("TV routes every website page to code entry, including other device links", () => {
  for (const path of ["/", "/login/", "/control/", "/control/", "/games/", "/host/?id=a&key=b", "/buzzer/?id=a&key=b", "/display/?preview=1", "/missing.html"]) {
    assert.equal(redirect(path)?.headers.get("location"), "https://www.familiada.online/connect-device/?tv=1");
  }
});
test("TV accepts Display and code page without loops but redirects missing credentials", () => {
  for (const path of ["/connect-device/?tv=1", "/connect-device/index.html?tv=1", "/display/?id=a&key=b", "/display/index.html?id=a&key=b", "/polls/vote/qr/?id=a&key=b"]) assert.equal(redirect(path), null);
  assert.equal(redirect("/display/" )?.status, 302);
  assert.equal(redirect("/polls/vote/qr/")?.status, 302);
  assert.equal(redirect("/polls/vote/qr/?id=a&key=b&preview=1")?.status, 302);
});
test("TV leaves assets, API requests and normal desktop/mobile navigation unchanged", () => {
  assert.equal(redirect("/assets/audio/show_outro/classic.mp3", { accept: "*/*", "sec-fetch-dest": "audio" }), null);
  assert.equal(redirect("/_api/contact", {}, "POST"), null);
  for (const value of ["Mozilla/5.0 (Windows NT 10.0)", "Mozilla/5.0 (Linux; Android 14; Pixel 8)", "Mozilla/5.0 (iPhone)"]) assert.equal(isTvUserAgent(value), false);
  for (const value of [ua, "Android TV", "webOS", "BRAVIA", "AFTMM", "HbbTV/1.5.1"]) assert.equal(isTvUserAgent(value), true);
});
