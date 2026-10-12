// Wspólny dokument maila. Nagłówki i linki są zwykłym tekstem.
// Treść ma osobne wejścia dla tekstu i jawnego HTML edytora.
export function escapeMailText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function mailHref(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid mail link protocol');
  return url.href;
}
function renderDocument({ lang, title, subtitle = '', actionLabel = '', actionUrl = '',
  ignoreNote = '', linkHint = '', autoNote = '', footerText = '', footerLinks = [], source = '' }, bodyMarkup) {
  if (!['pl', 'en', 'uk'].includes(lang)) throw new Error('Unsupported mail language');
  if (!!actionLabel !== !!actionUrl) throw new Error('Mail action requires both a label and URL');
  const href = actionUrl ? mailHref(actionUrl) : '', esc = escapeMailText;
  const text = value => esc(value).replace(/\r?\n/g, '<br>');
  const links = footerLinks.map(link => `<a href="${esc(mailHref(link.url))}" style="color:#ffeaa6;text-decoration:underline;">${esc(link.label)}</a>`).join(' &nbsp;·&nbsp; ');
  return `<!doctype html>
<html lang="${lang}"><head>
<meta charset="utf-8">${source ? `\n<meta name="familiada-i18n" content="${esc(source)}">` : ''}
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>:root{color-scheme:dark}</style>
</head><body style="margin:0;padding:0;background:#050914;color:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#ffffff;overflow-wrap:anywhere;word-break:break-word;">
 <div style="padding:14px;background:#0b1020;border:1px solid #293044;border-radius:18px;">
  <div style="font-weight:800;letter-spacing:.18em;color:#ffeaa6;">FAMILIADA</div>
  ${subtitle ? `<div style="margin-top:6px;font-size:12px;color:#bbc2d1;">${esc(subtitle)}</div>` : ''}
 </div>
 <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid #303747;background:#111827;">
  <h1 style="font-weight:800;font-size:18px;color:#ffeaa6;margin:0 0 10px;">${esc(title)}</h1>
  <div style="font-size:14px;line-height:1.5;margin:0 0 14px;">${bodyMarkup}</div>
  ${href ? `<div style="margin:16px 0;"><a href="${esc(href)}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid #817447;background:#2a2b1a;color:#ffeaa6;text-decoration:none;font-weight:800;">${esc(actionLabel)}</a></div>` : ''}
  ${ignoreNote ? `<div style="margin-top:14px;font-size:12px;color:#bbc2d1;line-height:1.5;">${text(ignoreNote)}</div>` : ''}
  ${href ? `<div style="margin-top:14px;font-size:12px;color:#bbc2d1;line-height:1.5;">
   ${esc(linkHint)}<div style="margin-top:6px;padding:10px 12px;border-radius:14px;border:1px solid #303747;background:#0a0f1e;word-break:break-all;">${esc(href)}</div>
  </div>` : ''}
 </div>
 ${autoNote ? `<div style="margin-top:14px;font-size:12px;color:#a6adbc;text-align:center;">${text(autoNote)}</div>` : ''}
 ${footerText || links ? `<div style="margin-top:10px;font-size:11px;line-height:1.5;color:#a6adbc;text-align:center;">${text(footerText)}${footerText && links ? '<br>' : ''}${links}</div>` : ''}
</div></body></html>`;
}

export function renderMailDocument(options) {
  return renderDocument(options, escapeMailText(options.body).replace(/\r?\n/g, '<br>'));
}
// HTML wytworzony przez edytor wiadomości lub escapowane bloki cytatów.
// Pozostałe pola (tytuł, podpisy, linki) są nadal zwykłym tekstem.
export function renderRichMailDocument(options) {
  return renderDocument(options, String(options.bodyHtml || ''));
}
