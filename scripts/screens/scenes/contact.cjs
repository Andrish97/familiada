// Okno kontaktu (web/shared/js/core/contact-modal.js) — wszystkie stany:
// puste, z załącznikami, z błędem, z widocznym wyzwaniem Turnstile i po wysłaniu.
// Okno otwiera stopka „Kontakt” na stronie Moje gry.
const C = "Okno kontaktu";
const SOURCES = ["web/shared/js/core/contact-modal.js", "web/shared/js/core/contact-dialog.js", "web/shared/js/core/turnstile.js", "web/shared/style/", "web/shared/js/core/modal-sheet.js"];
const READY = "#grid .card";

// Atrapy Cloudflare Turnstile: od razu token albo widoczne wyzwanie (pole jak
// prawdziwy widżet: size "flexible" = cała szerokość, min. 300 px, wysokość 65;
// "normal" = 300 × 65), bez tokenu — okno czeka na rozwiązanie.
const TURNSTILE_OK = `window.turnstile = {
  render(el, o) { setTimeout(() => { try { o && o.callback && o.callback("screens-captcha-token"); } catch (e) {} }, 30); return "screens-widget"; },
  remove() {}, reset() {}, execute() {}, getResponse() { return "screens-captcha-token"; }
};`;
const TURNSTILE_CHALLENGE = `window.turnstile = {
  render(el, o) {
    const box = document.createElement("div");
    const width = o && o.size === "flexible" ? "width:100%;min-width:300px" : "width:300px";
    box.style.cssText = width + ";height:65px;box-sizing:border-box;border:1px solid #3a3a3a;border-radius:4px;background:#222;display:flex;align-items:center;gap:12px;padding:0 14px;font:14px system-ui;color:#ddd";
    setTimeout(() => { try { o && o["before-interactive-callback"] && o["before-interactive-callback"](); } catch (e) {} }, 300);
    box.innerHTML = '<span style="width:24px;height:24px;border:2px solid #888;border-radius:3px;background:#111"></span><span>Verify you are human</span>';
    el.append(box);
    return "screens-widget";
  },
  remove() {}, reset() {}, execute() {}, getResponse() { return ""; }
};`;

const open = async (view) => {
  await view.locator("[data-contact-modal]").first().click();
  await view.locator("#contactModalOverlay").waitFor({ state: "visible", timeout: 5000 });
  await view.waitForTimeout(400);
};
const fillForm = async (view) => {
  await view.locator("#cModalEmail").fill("ola.nowak@example.test");
  await view.locator("#cModalSubject").fill("Problem z wyświetlaczem");
  await view.locator("#cModalMessage").fill("Po podłączeniu wyświetlacza przez kod QR obraz nie odświeża się po zmianie pytania. Proszę o pomoc.");
};
const attach = async (view) => {
  await view.locator("#cModalAttachments").setInputFiles([
    { name: "zrzut-ekranu-wyswietlacz.png", mimeType: "image/png", buffer: Buffer.from("png") },
    { name: "log-przegladarki.txt", mimeType: "text/plain", buffer: Buffer.from("log") },
    { name: "nagranie-z-telefonu.mp4", mimeType: "video/mp4", buffer: Buffer.from("mp4") },
  ]);
  await view.waitForTimeout(200);
};
const turnstile = (body) => async (view, { page }) => {
  await page.route(/^https:\/\/challenges\.cloudflare\.com\//, (route) => route.fulfill({ contentType: "text/javascript", body }));
};

module.exports = [
  { id: "contact-modal", category: C, title: "Okno kontaktu — puste", path: "/games/", sources: SOURCES, ready: READY, steps: [open] },
  { id: "contact-modal-attachments", category: C, title: "Okno kontaktu — wypełnione, z listą załączników", path: "/games/", sources: SOURCES, ready: READY,
    steps: [open, fillForm, attach] },
  { id: "contact-modal-error", category: C, title: "Okno kontaktu — komunikat błędu (za krótka wiadomość)", path: "/games/", sources: SOURCES, ready: READY,
    steps: [open, async (view) => {
      await view.locator("#cModalEmail").fill("ola.nowak@example.test");
      await view.locator("#cModalMessage").fill("abc");
      await view.locator("#cModalSubmit").click();
      await view.locator("#cModalError").waitFor({ state: "visible" });
      await view.waitForTimeout(200);
    }] },
  { id: "contact-modal-captcha", category: C, title: "Okno kontaktu — widoczne wyzwanie Turnstile", path: "/games/", sources: SOURCES, ready: READY,
    steps: [turnstile(TURNSTILE_CHALLENGE), open, fillForm, attach, async (view) => {
      await view.locator("#cModalSubmit").click();
      await view.locator('#cModalCaptcha[data-turnstile="visible"]').waitFor({ timeout: 5000 });
      await view.waitForTimeout(700);
    }] },
  { id: "contact-modal-success", category: C, title: "Okno kontaktu — wysłano (numer zgłoszenia)", path: "/games/", sources: SOURCES, ready: READY,
    steps: [turnstile(TURNSTILE_OK), async (view, { page }) => {
      await page.route("**/_api/contact", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, ticket_number: "2026-0042" }) }));
    }, open, fillForm, async (view) => {
      await view.locator("#cModalSubmit").click();
      await view.locator("#cModalSuccess").waitFor({ state: "visible", timeout: 5000 });
      await view.waitForTimeout(300);
    }] },
];
