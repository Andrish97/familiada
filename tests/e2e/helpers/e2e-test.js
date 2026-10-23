// tests/e2e/helpers/e2e-test.js -- E25: test Playwrighta z wypożyczanymi kontami.
// Spec deklaruje potrzeby, worker wypożycza komplet na wyłączność, po
// zakończeniu workera komplet wraca do puli (przy awarii -- po TTL).
//
//   const { test, expect } = require("./helpers/e2e-test");
//   test.use({ needs: { standard: 2, noaccount: 1, resources: ["mail"] } }); // na górze pliku
//   (opcja workera: jedna deklaracja na plik -- suma potrzeb jego testów)
//   test("...", async ({ page, context, accounts, loginAs, mailbox }) => {
//     const [owner, recipient] = accounts.standard;
//     await loginAs(page, context, owner);
//   });
//
// Role: standard, noaccount, disposable, dedicated ("<purpose>"); zasoby: mail,
// heavy. Zasady: tests/README.md "Test accounts"; plan: docs/konta-testowe-plan.md.
const base = require("@playwright/test");
const client = require("./e2e-lease-client");
const { loginAsTestUser } = require("./login");
const { ensureApiOriginRouting } = require("./branch-code");
const mailboxApi = require("./mailbox");

const WAIT_MS = 30 * 60_000; // długie spece pocztowe trzymają zasób mail kilkanaście minut
const POLL_MS = 15_000;
const RENEW_MS = 5 * 60_000;

function normalizeNeeds(needs) {
  const out = {};
  for (const role of ["standard", "noaccount", "disposable"]) {
    if (needs[role] != null) out[role] = Number(needs[role]);
  }
  if (needs.dedicated) out.dedicated = [].concat(needs.dedicated);
  if (needs.resources) out.resources = [].concat(needs.resources);
  return out;
}

function group(identities) {
  const accounts = { standard: [], noaccount: [], disposable: [], dedicated: [], resources: [] };
  for (const identity of identities) {
    const item = { ...identity, username: identity.role === "noaccount" ? null : identity.name };
    if (identity.role === "resource") accounts.resources.push(item);
    else accounts[identity.role].push(item);
  }
  return accounts;
}

const test = base.test.extend({
  // Próba generalna przeprowadzki (E2E_API_ORIGIN): każdy kontekst — także
  // otwierany w teście przez browser.newContext() bez logowania (głosujący,
  // ekran QR) — mówi z API próby. Bez E2E_API_ORIGIN nic nie zmienia.
  context: async ({ context }, use) => {
    await ensureApiOriginRouting(context);
    await use(context);
  },
  browser: [async ({ browser }, use) => {
    if (process.env.E2E_API_ORIGIN) {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...args) => {
        const created = await newContext(...args);
        await ensureApiOriginRouting(created);
        return created;
      };
    }
    await use(browser);
  }, { scope: "worker" }],
  // Deklaracja potrzeb speca (opcja na poziomie workera).
  needs: [{}, { option: true, scope: "worker" }],

  accounts: [async ({ needs }, use, workerInfo) => {
    const normalized = normalizeNeeds(needs || {});
    if (!Object.keys(normalized).length) {
      await use(group([]));
      return;
    }
    const worker = String(workerInfo.workerIndex);
    const label = `${workerInfo.project.name || "e2e"} w${worker}`;
    const deadline = Date.now() + WAIT_MS;
    let result;
    for (;;) {
      result = await client.lease({ worker, needs: normalized, label });
      if (result?.ok) break;
      if (result?.error !== "busy" || Date.now() > deadline) {
        throw new Error(`[e2e-lease] nie udało się wypożyczyć ${JSON.stringify(normalized)}: ${JSON.stringify(result)}`);
      }
      console.log(`[e2e-lease] zajęte (${result.role || result.resource || result.purpose}), czekam; posiadacze: ${JSON.stringify(result.holders)}`);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    console.log(`[e2e-lease] w${worker}: ${result.identities.map((i) => i.name).join(", ")}`);
    const timer = setInterval(() => { client.renew().catch(() => {}); }, RENEW_MS);
    timer.unref?.();
    try {
      await use(group(result.identities));
    } finally {
      clearInterval(timer);
      await client.release(worker).catch((error) => console.log("[e2e-lease] release:", error.message));
    }
  }, { scope: "worker", timeout: WAIT_MS + 120_000 }],

  // Logowanie wypożyczonym kontem (formularz /login z obejściem Turnstile).
  loginAs: async ({}, use) => {
    await use(async (page, context, identity, opts = {}) => {
      if (!identity?.email || identity.role === "noaccount") {
        throw new Error(`loginAs: ${identity?.name || "?"} nie jest kontem do logowania`);
      }
      return loginAsTestUser(page, context, { ...opts, username: identity.email });
    });
  },

  // Poczta wyłącznie na wypożyczonych tożsamościach (Worker sprawdza lease).
  mailbox: async ({}, use) => {
    await use({
      clear: (identity) => mailboxApi.clearMailbox(identity.email),
      waitFor: (identity, opts = {}) => mailboxApi.waitForEmail({ ...opts, recipient: identity.email }),
      links: mailboxApi.extractHttpLinks,
    });
  },
});

module.exports = { test, expect: base.expect };
