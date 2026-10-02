// src/lib/email/html-escape.js -- escaping for email body TEXT content (not
// attributes -- doesn't escape quotes, unlike core/utils.js's escapeHtml
// which is used for HTML attribute values in SSR pages). Was duplicated
// identically inside buildContactEmail() and buildMarketingEmail() in the
// original single-file worker; extracted here once both ended up in the
// same directory and the duplication became obvious.
export function escEmailText(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function nl2br(s) {
  return escEmailText(s).replace(/\n/g, "<br>");
}
