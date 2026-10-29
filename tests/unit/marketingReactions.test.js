import test from "node:test";
import assert from "node:assert/strict";

// Lead Finder 2: reakcje odbiorców maili marketingowych (poczta przychodząca).
import { marketingReactions, recordMarketingReactions } from "../../cloudflare/maintenance-worker/src/lib/email/marketing-reactions.js";

test("zwykła odpowiedź -> replied dla nadawcy", () => {
  assert.deepEqual(
    marketingReactions({ from: "DJ.Marek@Gmail.com", subject: "Re: familiada.online", body: "Dzień dobry, poproszę o ofertę." }),
    [{ email: "dj.marek@gmail.com", reaction: "replied" }],
  );
});

test("rezygnacja -> declined; cytat naszego maila nie wywołuje odmowy", () => {
  for (const body of ["Nie jesteśmy zainteresowani, pozdrawiam", "Proszę nie pisać więcej.", "Please unsubscribe me"]) {
    assert.equal(marketingReactions({ from: "a@b.pl", subject: "Re: x", body })[0].reaction, "declined", body);
  }
  const quoted = "Chętnie porozmawiam!\n\nW dniu 20.10.2026 kontakt@familiada.online napisał:\n> Jeśli nie jesteś zainteresowany, wypisz mnie";
  assert.equal(marketingReactions({ from: "a@b.pl", subject: "Re: x", body: quoted })[0].reaction, "replied");
});

test("zwrotka -> bounced dla adresata z raportu, nie dla nadawcy", () => {
  const body = "This is the mail system.\nFinal-Recipient: rfc822; biuro@djmax.pl\nAction: failed\nFrom: kontakt@familiada.online";
  assert.deepEqual(
    marketingReactions({ from: "MAILER-DAEMON@mx.wp.pl", subject: "Undelivered Mail Returned to Sender", body }),
    [{ email: "biuro@djmax.pl", reaction: "bounced" }],
  );
  assert.deepEqual(
    marketingReactions({ from: "postmaster@x.pl", subject: "Niedostarczona wiadomość", body: "Adres nie@istnieje.pl nie istnieje. kontakt@familiada.online" }),
    [{ email: "nie@istnieje.pl", reaction: "bounced" }],
  );
});

test("własne adresy familiada.online pomijane", () => {
  assert.deepEqual(marketingReactions({ from: "kontakt@familiada.online", subject: "x", body: "y" }), []);
  assert.deepEqual(marketingReactions({ from: "", subject: "x", body: "y" }), []);
});

test("zapis przez RPC; true tylko gdy adres był kontaktem", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const hit = JSON.parse(init.body).p_email === "dj@max.pl";
    return new Response(JSON.stringify(hit ? 1 : 0), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const env = { SUPABASE_URL: "https://api.test", SUPABASE_SERVICE_ROLE_KEY: "k" };
    assert.equal(await recordMarketingReactions(env, { from: "dj@max.pl", subject: "Re", body: "ok" }), true);
    assert.equal(await recordMarketingReactions(env, { from: "obcy@x.pl", subject: "Re", body: "ok" }), false);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(calls.every((c) => c.url.endsWith("/rest/v1/rpc/marketing_mark_reaction")));
  assert.deepEqual(calls[0].body, { p_email: "dj@max.pl", p_reaction: "replied" });
});
