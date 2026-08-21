// tests/e2e/helpers/e2e-token.js
// Generuje jednorazowy, krótkożyjący token do ominięcia captchy Turnstile
// na stronie logowania — wyłącznie do testów E2E. Weryfikowany po stronie
// Cloudflare Workera (cloudflare/maintenance-worker/src/index.js,
// handleE2ELoginBypass). Zob. tests/README.md dla pełnego opisu mechanizmu.

const crypto = require("crypto");

/**
 * @param {string} secret - E2E_BYPASS_SECRET, ten sam co ustawiony w Cloudflare Workerze
 * @returns {string} token w formacie base64(payload).hex(hmac)
 */
function generateE2EToken(secret) {
  if (!secret) {
    throw new Error("generateE2EToken: brak sekretu (E2E_BYPASS_SECRET)");
  }
  const payload = { iat: Date.now(), nonce: crypto.randomUUID() };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

module.exports = { generateE2EToken };
