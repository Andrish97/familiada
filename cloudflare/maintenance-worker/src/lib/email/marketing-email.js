// src/lib/marketing-email.js -- marketing email templates (pure).

export const IMG_BASE = "https://familiada.online/img/pl";

export function buildMarketingEmail(templateId, opts = {}) {
  const { customBody, customSubject } = opts;
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const nl2br = (s) => esc(s).replace(/\n/g, "<br>");

  // ── shared shell ──────────────────────────────────────────────────────────
  const shell = (bodyContent) => `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="dark light"/>
  <title>Familiada Online</title>
</head>
<body style="margin:0;padding:0;background:#050914;-webkit-text-size-adjust:100%">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050914">
<tr><td align="center" style="padding:24px 12px 32px">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;font-size:14px;color:#ffffff">
  <!-- brand bar -->
  <tr><td style="padding:14px 16px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);border-radius:16px;margin-bottom:14px" bgcolor="#000">
    <a href="https://familiada.online" style="text-decoration:none">
      <div style="font-weight:900;font-size:16px;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6">FAMILIADA</div>
      <div style="margin-top:3px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.05em">familiada.online</div>
    </a>
  </td></tr>
  <tr><td height="12"></td></tr>
  <!-- main card -->
  <tr><td style="padding:24px 22px 22px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)">
    ${bodyContent}
    <!-- footer -->
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.35);text-align:center;line-height:1.6">
      Familiada Online &mdash; bezpłatny system na <a href="https://familiada.online" style="color:rgba(255,234,166,.5);text-decoration:none">familiada.online</a><br>
      Wysłano z no-reply@familiada.online
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  // ── reusable pieces ───────────────────────────────────────────────────────
  const cta = (href, label) =>
    `<div style="margin-top:24px;text-align:center">
      <a href="${esc(href)}" style="display:inline-block;padding:13px 30px;background:#ffeaa6;color:#050914;font-weight:800;font-size:13px;letter-spacing:.09em;text-transform:uppercase;border-radius:10px;text-decoration:none">${esc(label)}</a>
    </div>`;

  const featureTile = (imgSrc, heading, desc) =>
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
      <tr>
        <td style="padding:0 0 8px">
          <img src="${esc(imgSrc)}" width="516" alt="${esc(heading)}"
               style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">${esc(heading)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">${esc(desc)}</td>
      </tr>
    </table>`;

  const divider = () =>
    `<div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div>`;

  // ── INVITATION ────────────────────────────────────────────────────────────
  if (templateId === "invitation") {
    const subject = customSubject || "familiada.online — profesjonalny system do organizacji wydarzeń";
    const body = `
      <p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.9)">Witam,</p>

      <p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">
        Piszę w sprawie narzędzia, które ułatwia organizację wydarzeń i może realnie wesprzeć realizowane projekty.
      </p>

      <p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">
        <strong style="color:#fff">familiada.online</strong> to profesjonalna platforma do prowadzenia teleturnieju na żywo. To kompletny system: od zbierania odpowiedzi od gości (kod QR), przez panel operatora, aż po animowaną tablicę wyników z dźwiękami prosto z telewizyjnego studia.
      </p>

      ${divider()}

      ${featureTile(
        `${IMG_BASE}/landing-polls.webp`,
        "Ankieta QR — goście odpowiadają na żywo",
        "Uczestnicy odpowiadają z własnych telefonów. System automatycznie normalizuje wyniki do 100 punktów."
      )}
      ${featureTile(
        `${IMG_BASE}/landing-control.webp`,
        "Panel operatora — pełna kontrola",
        "Intuicyjne sterowanie rundami, punktami i błędami (X) w czasie rzeczywistym."
      )}
      ${featureTile(
        `${IMG_BASE}/landing-display.webp`,
        "Tablica wyników na TV lub rzutnik",
        "Animowana tablica z zakrytymi odpowiedziami, bankiem punktów i błędami X — z dźwiękami prosto z telewizyjnego studia."
      )}
      ${featureTile(
        `${IMG_BASE}/landing-host.webp`,
        "Niezależny widok prowadzącego",
        "Osobny podgląd pytań dla prowadzącego na tablecie lub telefonie — dla pełnej swobody na scenie."
      )}

      ${divider()}

      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);padding:14px;border-radius:12px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#ffeaa6">Gotowe gry w Grach Społeczności</p>
        <p style="margin:0;font-size:12px;color:rgba(255,255,255,.65);line-height:1.5">
          Gotowe zestawy pytań udostępnione przez innych użytkowników — bez konieczności tworzenia gry od zera.
        </p>
      </div>

      ${divider()}

      <p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">
        System jest dostępny całkowicie bezpłatnie i nie wymaga instalacji żadnych aplikacji. Będę wdzięczny za opinię, czy taki format mógłby wzbogacić dotychczasową ofertę.
      </p>

      <p style="margin:0 0 18px;font-size:14px;color:rgba(255,255,255,.88)">Pozdrawiam,<br>Twórca familiada.online</p>

      ${cta("https://familiada.online", "Poznaj system familiada.online")}

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.4);line-height:1.6">
        Wiadomość ma charakter informacyjny i została wysłana jednorazowo do osób związanych z branżą eventową. 
        W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną.
      </div>`;

    return { subject, html: shell(body) };
  }

  // ── NEWSLETTER ────────────────────────────────────────────────────────────
  if (templateId === "newsletter") {
    const subject = customSubject || "Nowości w Familiada Online";
    const rawBody = customBody || "";
    const body = `
      <p style="margin:0 0 6px;font-size:20px;font-weight:800;color:#ffeaa6">${esc(subject)}</p>
      ${divider()}
      <div style="font-size:14px;line-height:1.8;color:rgba(255,255,255,.88);white-space:pre-wrap">${nl2br(rawBody)}</div>
      <br>
      ${cta("https://familiada.online", "familiada.online")}`;
    return { subject, html: shell(body) };
  }

  // ── CUSTOM ────────────────────────────────────────────────────────────────
  const subject = customSubject || "Wiadomość od Familiada";
  const rawBody = customBody || "";
  const body = `<div style="font-size:14px;line-height:1.8;color:rgba(255,255,255,.88);white-space:pre-wrap">${nl2br(rawBody)}</div>`;
  return { subject, html: shell(body) };
}
