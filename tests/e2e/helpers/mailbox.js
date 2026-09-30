const { generateE2EToken } = require("./e2e-token");

const API_BASE = "https://www.familiada.online/_e2e_api";

function authHeaders(extra = {}) {
  const secret = process.env.E2E_BYPASS_SECRET;
  if (!secret) throw new Error("Brak E2E_BYPASS_SECRET");
  return { "X-E2E-Token": generateE2EToken(secret), ...extra };
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders(options.headers),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`E2E mailbox ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function clearMailbox(recipient) {
  await api(`/emails?recipient=${encodeURIComponent(recipient)}`, { method: "DELETE" });
}

async function waitForEmail({ recipient, after, subject, timeout = 90_000 }) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const data = await api(`/emails?recipient=${encodeURIComponent(recipient)}&after=${encodeURIComponent(after)}`);
    const email = (data.emails || []).find((row) => !subject || subject.test(row.subject || ""));
    if (email) return email;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Nie otrzymano maila dla ${recipient} w ${timeout} ms`);
}

function extractHttpLinks(email) {
  const source = `${email?.body_html || ""}\n${email?.body || ""}`.replace(/&amp;/g, "&");
  return [...new Set(source.match(/https?:\/\/[^\s"'<>]+/g) || [])];
}

async function restoreTestAccount(account) {
  const password = process.env.TEST_PASSWORD;
  if (!password) throw new Error("Brak TEST_PASSWORD");
  return api("/accounts/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, password }),
  });
}

module.exports = { clearMailbox, waitForEmail, extractHttpLinks, restoreTestAccount };
