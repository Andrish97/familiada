import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pl from "../../translation/pl.js";
import en from "../../translation/en.js";
import uk from "../../translation/uk.js";

// Teksty używane poza stroną: edge function send-email (sekcja authEmail)
// i Cloudflare Worker (contactEmail, marketplaceSsr). Obie strony pobierają
// translation/<lang>.js z originu w trakcie działania, więc brak klucza
// w którymś języku wychodzi dopiero na produkcji — stąd ten test.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const DICTS = { pl, en, uk };
const LANGS = Object.keys(DICTS);
const WORKER = "cloudflare/maintenance-worker/src";

const translations = await import(`../../${WORKER}/lib/core/translations.js`);
const { extractSection, formatText } = translations;

function usedTrKeys(files) {
  const keys = new Set();
  for (const file of files) {
    for (const m of read(file).matchAll(/\btr\.(\w+)/g)) keys.add(m[1]);
  }
  return [...keys].sort();
}

function placeholders(s) {
  return [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

// ── klucze ──────────────────────────────────────────────────────────────────

test("worker: każdy klucz contactEmail użyty w kodzie istnieje w PL/EN/UK", () => {
  const keys = usedTrKeys([`${WORKER}/lib/email/contact-email.js`]);
  assert.ok(keys.length >= 7, `za mało kluczy: ${keys}`);
  for (const lang of LANGS) {
    const missing = keys.filter((k) => typeof DICTS[lang].contactEmail?.[k] !== "string" || !DICTS[lang].contactEmail[k]);
    assert.deepEqual(missing, [], lang);
  }
});

test("worker: każdy klucz marketplaceSsr użyty w kodzie istnieje w PL/EN/UK", () => {
  const keys = usedTrKeys([`${WORKER}/lib/ssr/ssr.js`]);
  assert.ok(keys.length >= 9, `za mało kluczy: ${keys}`);
  for (const lang of LANGS) {
    const missing = keys.filter((k) => typeof DICTS[lang].marketplaceSsr?.[k] !== "string" || !DICTS[lang].marketplaceSsr[k]);
    assert.deepEqual(missing, [], lang);
  }
});

test("send-email: każdy typ maila ma komplet pól authEmail w PL/EN/UK", () => {
  const src = read("supabase/functions/send-email/email-templates.ts");
  const typeKeys = [...src.slice(src.indexOf("TYPE_KEYS"), src.indexOf("};", src.indexOf("TYPE_KEYS")))
    .matchAll(/:\s*"(\w+)"/g)].map((m) => m[1]);
  const required = [...src.slice(src.indexOf("REQUIRED_FIELDS"), src.indexOf("];", src.indexOf("REQUIRED_FIELDS")))
    .matchAll(/"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(typeKeys, ["signup", "guestMigrate", "recovery", "emailChange"]);
  assert.ok(required.includes("subject") && required.includes("btn"), `REQUIRED_FIELDS: ${required}`);

  for (const lang of LANGS) {
    const missing = [];
    for (const type of typeKeys) {
      for (const field of required) {
        const v = DICTS[lang].authEmail?.[type]?.[field];
        if (typeof v !== "string" || !v) missing.push(`${type}.${field}`);
      }
    }
    assert.deepEqual(missing, [], lang);
  }
});

test("sekcje serwerowe mają te same klucze i placeholdery we wszystkich językach", () => {
  for (const section of ["authEmail", "contactEmail", "marketplaceSsr"]) {
    const flat = (obj, prefix = "", out = {}) => {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") flat(v, key, out);
        else out[key] = v;
      }
      return out;
    };
    const base = flat(pl[section]);
    for (const lang of ["en", "uk"]) {
      const other = flat(DICTS[lang][section]);
      assert.deepEqual(Object.keys(other).sort(), Object.keys(base).sort(), `${lang}.${section}: inne klucze niż pl`);
      for (const key of Object.keys(base)) {
        assert.deepEqual(placeholders(other[key]), placeholders(base[key]), `${lang}.${section}.${key}: inne placeholdery`);
      }
    }
  }
});

test("ukraińskie teksty serwerowe nie mieszają cyrylicy z łacinką w jednym słowie", () => {
  // Łapie błędy typu "облікового zapisu" / "Спільнota".
  const bad = [];
  const walk = (obj, key) => {
    if (typeof obj === "string") {
      for (const word of obj.split(/[^\p{L}]+/u)) {
        if (/\p{Script=Cyrillic}/u.test(word) && /\p{Script=Latin}/u.test(word)) bad.push(`${key}: ${word}`);
      }
    } else if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) walk(v, `${key}.${k}`);
    }
  };
  for (const section of ["authEmail", "contactEmail", "marketplaceSsr"]) walk(uk[section], section);
  assert.deepEqual(bad, []);
});

// ── parser workera (Workers nie mają eval) ─────────────────────────────────

test("parser workera czyta sekcje identycznie jak prawdziwy import, w PL/EN/UK", () => {
  for (const lang of LANGS) {
    const code = read(`translation/${lang}.js`);
    for (const section of ["contactEmail", "marketplaceSsr", "authEmail"]) {
      assert.deepEqual(extractSection(code, section), DICTS[lang][section], `${lang}.${section}`);
    }
  }
});

test("parser workera odrzuca funkcje w sekcji i brak sekcji", () => {
  const withFn = 'const x = {\n  contactEmail: {\n    greeting: (v) => `Hi ${v}`,\n  },\n};\nexport default x;';
  assert.throws(() => extractSection(withFn, "contactEmail"), /only strings and objects/);
  assert.throws(() => extractSection("const x = {};\nexport default x;", "contactEmail"), /no "contactEmail" section/);
});

test("formatText podstawia placeholdery jak t() na stronie", () => {
  assert.equal(formatText("Re: [{ticket}] {subject}", { ticket: "A-1", subject: "Hej" }), "Re: [A-1] Hej");
  assert.equal(formatText("{ticket} {missing}", { ticket: "1" }), "1 {missing}");
  // wartość nie jest ponownie interpretowana jako szablon
  assert.equal(formatText("{subject}", { subject: "{ticket}", ticket: "X" }), "{ticket}");
});

// ── działanie z podmienionym fetch ──────────────────────────────────────────

function mockFetch(t, { originDown = false, game = null } = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url instanceof Request ? url.url : url);
    calls.push(u);
    const m = u.match(/\/translation\/(\w+)\.js/);
    if (m) {
      if (originDown) throw new TypeError("network down");
      return new Response(read(`translation/${m[1]}.js`), { status: 200, headers: { "Content-Type": "application/javascript" } });
    }
    if (u.includes("/rest/v1/rpc/")) {
      return new Response(JSON.stringify(game ? [game] : []), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  return calls;
}

test("buildContactEmail: każdy typ maila w PL/EN/UK używa tekstów z tłumaczeń", async (t) => {
  mockFetch(t);
  const { buildContactEmail } = await import(`../../${WORKER}/lib/email/contact-email.js`);
  for (const lang of LANGS) {
    const tr = DICTS[lang].contactEmail;
    const vars = { ticket: "T-7", subject: "Temat <x>" };

    const conf = await buildContactEmail({ type: "confirmation", lang, ...vars, message: "treść" });
    assert.equal(conf.subject, formatText(tr.confirmationSubject, vars), `${lang} confirmation subject`);
    assert.ok(conf.html.includes(tr.greeting), `${lang} greeting`);
    assert.ok(conf.html.includes("Temat &lt;x&gt;"), `${lang} subject escaped in body`);
    for (const line of tr.closing.split("\n")) assert.ok(conf.html.includes(line), `${lang} closing`);

    const reply = await buildContactEmail({ type: "reply", lang, ...vars, replyMessage: "odp", originalMessage: "orig" });
    assert.equal(reply.subject, formatText(tr.replySubject, vars), `${lang} reply subject`);
    assert.ok(reply.html.includes(formatText(tr.replyQuoteLabel, vars)), `${lang} quote label`);

    const compose = await buildContactEmail({ type: "compose", lang, subject: "", message: "msg" });
    assert.equal(compose.subject, tr.composeSubject, `${lang} compose default subject`);
  }
});

test("SSR strony gry: etykiety w języku gry dla PL/EN/UK", async (t) => {
  const { serveGameDetailSsr } = await import(`../../${WORKER}/lib/ssr/ssr.js`);
  const env = { SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "k" };
  for (const lang of LANGS) {
    for (const origin of ["producer", "community"]) {
      const game = {
        id: "g1", slug: "gra", status: "published", title: "Gra", description: "", lang, origin,
        author_username: "ala", payload: { questions: [{ text: "Q?", answers: [{ text: "A", fixed_points: 40 }] }] },
      };
      await t.test(`${lang} ${origin}`, async (st) => {
        mockFetch(st, { game });
        const req = new Request("https://www.familiada.online/marketplace/game/gra");
        const res = await serveGameDetailSsr(req, env, new URL(req.url), "https://familiada.online", "familiada.online", "x");
        assert.equal(res.status, 200);
        const html = await res.text();
        const tr = DICTS[lang].marketplaceSsr;
        for (const label of [tr.back, tr.topAnswers, tr.by, tr.play, tr.questions.toLowerCase()]) {
          assert.ok(html.includes(label), `${lang}: brak "${label}"`);
        }
        assert.ok(html.includes(origin === "producer" ? tr.originProducer : tr.originCommunity));
      });
    }
  }
});

test("worker: tłumaczenia są cache'owane — jeden fetch na język", async (t) => {
  const fresh = await import(`../../${WORKER}/lib/core/translations.js?cache-test`);
  const calls = mockFetch(t);
  for (let i = 0; i < 3; i++) {
    for (const lang of LANGS) await fresh.getTranslationSection(lang, "contactEmail");
  }
  assert.equal(calls.filter((u) => u.includes("/translation/")).length, LANGS.length);
});

test("worker: origin niedostępny i pusty cache → czytelny błąd", async (t) => {
  const fresh = await import(`../../${WORKER}/lib/core/translations.js?origin-down`);
  mockFetch(t, { originDown: true });
  await assert.rejects(fresh.getTranslationSection("en", "contactEmail"), /Cannot load translations/);
});
