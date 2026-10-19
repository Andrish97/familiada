import { renderRichMailDocument, escapeMailText } from "./mail-document.js?v=v2026-10-19T08580";


// Podgląd i wysyłka korzystają z tego samego dokumentu oraz podpisu.
export function buildComposeMailHtml({ lang, subject, bodyHtml, quote = '', greeting = '', farewell = '' }) {
  const text = value => escapeMailText(value).replace(/\r?\n/g, '<br>');
  const quoteHtml = quote ? `<blockquote style="margin:20px 0;padding:12px 16px;border-left:3px solid #817447;background:#0a0f1e;border-radius:0 8px 8px 0;color:#bbc2d1;font-size:13px;">${text(quote)}</blockquote>` : '';
  const body = String(bodyHtml || '').replace(/#quote/g, () => quoteHtml);
  const salutation = greeting ? `${greeting}${greeting.trim().endsWith(',') ? '' : ','}` : '';
  return renderRichMailDocument({ lang, title: subject, subtitle: 'familiada.online', bodyHtml: `
${salutation ? `<p style="margin:0 0 18px;">${text(salutation)}</p>` : ''}
${body}
${farewell ? `<p style="margin:24px 0 0;">${text(farewell)}</p>` : ''}` });
}
