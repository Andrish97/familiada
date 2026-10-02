// src/lib/email/html-to-text.js -- HTML to plaintext preview for mail clients
// (e.g. Apple Mail) that show the "text" part of a multipart email. Was
// duplicated ~5x across admin API handlers with inconsistent entity
// decoding; this is the most complete variant (decodes &lt;/&gt;/&quot;/&#39;
// in addition to &nbsp;/&amp;), now the single shared implementation.
export function htmlToPlainTextPreview(html, maxLen = 500) {
  return String(html || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // Remove <style> blocks FIRST
    .replace(/<[^>]*>/g, ' ')                           // Remove all HTML tags
    .replace(/:[^;]+;/g, ' ')                           // Remove CSS properties like :root{...}
    .replace(/&nbsp;/g, ' ')                            // Replace &nbsp;
    .replace(/&amp;/g, '&')                             // Replace &amp;
    .replace(/&lt;/g, '<')                              // Replace &lt;
    .replace(/&gt;/g, '>')                              // Replace &gt;
    .replace(/&quot;/g, '"')                            // Replace &quot;
    .replace(/&#39;/g, "'")                             // Replace &#39;
    .replace(/\s+/g, ' ')                              // Collapse whitespace
    .trim()
    .slice(0, maxLen);                                  // Limit length for preview
}
