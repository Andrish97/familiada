// tests/e2e/helpers/e2e-lease-client.js -- E25: klient wypożyczania tożsamości
// testowych przez Worker (/_e2e_api/lease*). familijna-server/docs/konta-testowe-plan.md.
// Funkcje wołane przez obiekt modułu (client.lease), żeby lokalne zaplecze
// (scripts/agent-tools/local-e2e/preload.cjs) mogło je podmienić.
const crypto = require("crypto");
const { generateE2EToken } = require("./e2e-token");

const API_BASE = "https://www.familijna.app/_e2e_api";

// Jeden identyfikator na cały przebieg (wszystkie workery Playwrighta).
const RUN_ID = process.env.E2E_RUN_ID
  || (process.env.GITHUB_RUN_ID ? `gh-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || 1}` : `local-${crypto.randomUUID().slice(0, 12)}`);
process.env.E2E_RUN_ID = RUN_ID; // workery dziedziczą ten sam

function headers(extra = {}) {
  const secret = process.env.E2E_BYPASS_SECRET;
  if (!secret) throw new Error("Brak E2E_BYPASS_SECRET");
  return { "X-E2E-Token": generateE2EToken(secret), "X-E2E-Run": RUN_ID, "Content-Type": "application/json", ...extra };
}

async function post(path, body) {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

const client = {
  RUN_ID,
  headers,
  // { ok, identities } | { ok:false, error:"busy", holders } | rzuca przy błędzie technicznym
  async lease({ worker, needs, label, ttl = 1200 }) {
    const password = process.env.TEST_PASSWORD;
    if (!password) throw new Error("Brak TEST_PASSWORD");
    for (let attempt = 1; ; attempt++) {
      const { status, data } = await post("/lease", { run_id: RUN_ID, worker, needs, label, ttl, password });
      if (status === 200 || status === 409) return data;
      // Dwa równoległe wypożyczenia wybrały to samo konto: baza wycofała całe
      // drugie wywołanie (e2e_leases_pkey), więc ponowienie jest bezpieczne.
      if (attempt < 3 && /e2e_leases_pkey/.test(data?.details || "")) {
        console.log(`[e2e-lease] jednoczesne wypożyczenie tego samego konta, ponawiam (${attempt})`);
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500));
        continue;
      }
      throw new Error(`lease ${status}: ${JSON.stringify(data)}`);
    }
  },
  async renew(ttl = 1200) {
    return (await post("/lease/renew", { run_id: RUN_ID, ttl })).data;
  },
  async release(worker) {
    return (await post("/lease/release", { run_id: RUN_ID, worker })).data;
  },
};

module.exports = client;
