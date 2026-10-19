<<<<<<< HEAD
import { renderMailDocument, renderRichMailDocument } from "./mail-document.js?v=v2026-10-19T08495";
=======
import { renderMailDocument, renderRichMailDocument } from "./mail-document.js?v=v2026-10-19T08495";
>>>>>>> 50dbdcc0b9 (fix(admin): keep install button visible in toolbar)

// Wysłany pełny dokument wyświetlamy dokładnie tak, jak został zapisany.
// Fragment HTML i zwykły tekst mają jawne, osobne wejścia.
export function buildStoredMailHtml(message) {
  const html = String(message.body_html || '');
  if (html && /<!doctype\s+html|<html(?:\s|>)/i.test(html)) return html;
  const options = {
    lang: ['pl','en','uk'].includes(message.lang) ? message.lang : 'pl',
    title: String(message.subject || ''), subtitle: 'familiada.online',
  };
  return html ? renderRichMailDocument({ ...options, bodyHtml: html })
    : renderMailDocument({ ...options, body: String(message.body || '') });
}
