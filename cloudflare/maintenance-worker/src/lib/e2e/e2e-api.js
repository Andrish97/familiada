// src/lib/e2e-api.js -- /_e2e_api/* test-only endpoints + /login captcha bypass.
// See tests/README.md for the full mechanism description.
import { json } from "../core/http.js";
import { readJson } from "../admin/admin-auth.js";
import { supabaseRequest, supabaseRpc } from "../core/supabase.js";
import { fetchFromOrigin } from "../origin/origin.js";

export const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA"; // oficjalny, zawsze-przechodzący testowy sitekey Cloudflare
const E2E_TOKEN_MAX_AGE_MS = 5 * 60 * 1000; // 5 minut
const E2E_NONCE_TTL_SECONDS = 10 * 60; // 10 minut w KV, żeby pokryć zegar-skew
const E2E_EMAIL_RE = /^test([1-9]|1[0-3])@familiada\.online$/;

export function normalizeE2ERecipient(value) {
  const recipient = String(value || "").trim().toLowerCase();
  return E2E_EMAIL_RE.test(recipient) ? recipient : null;
}

export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function verifyE2EToken(token, secret) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigHex] = parts;

  let payload;
  try {
    payload = JSON.parse(atob(payloadB64));
  } catch {
    return null;
  }
  if (!payload || typeof payload.iat !== "number" || typeof payload.nonce !== "string" || !payload.nonce) {
    return null;
  }

  let key;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
  } catch {
    return null;
  }

  let sigBytes;
  try {
    sigBytes = hexToBytes(sigHex);
  } catch {
    return null;
  }

  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payloadB64));
  if (!ok) return null;

  const age = Date.now() - payload.iat;
  if (age < 0 || age > E2E_TOKEN_MAX_AGE_MS) return null;

  return payload;
}

export async function authorizeE2EApi(request, env) {
  const secret = String(env.E2E_BYPASS_SECRET || "");
  if (!secret) return false;
  const token = request.headers.get("X-E2E-Token");
  return !!(await verifyE2EToken(token, secret));
}

export async function handleE2EApi(request, env, url) {
  if (!(await authorizeE2EApi(request, env))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (url.pathname === "/_e2e_api/emails" && request.method === "GET") {
    const recipient = normalizeE2ERecipient(url.searchParams.get("recipient"));
    const afterRaw = String(url.searchParams.get("after") || "");
    const afterMs = Date.parse(afterRaw);
    if (!recipient || !Number.isFinite(afterMs)) {
      return json({ ok: false, error: "invalid_query" }, 400);
    }
    // Test nie powinien moc wylistowac calej historii skrzynki po wycieku
    // pojedynczego tokenu. Maksymalne okno odpowiada TTL tabeli.
    if (afterMs < Date.now() - 25 * 60 * 60 * 1000 || afterMs > Date.now() + 60_000) {
      return json({ ok: false, error: "invalid_after" }, 400);
    }

    const path = "/rest/v1/e2e_emails" +
      `?select=id,recipient,from_email,subject,body,body_html,received_at` +
      `&recipient=eq.${encodeURIComponent(recipient)}` +
      `&received_at=gte.${encodeURIComponent(new Date(afterMs).toISOString())}` +
      `&order=received_at.asc&limit=20`;
    const res = await supabaseRequest(env, path);
    if (!res.ok) return json({ ok: false, error: "mailbox_read_failed" }, res.status || 500);
    return json({ ok: true, emails: Array.isArray(res.data) ? res.data : [] });
  }

  if (url.pathname === "/_e2e_api/emails" && request.method === "DELETE") {
    const recipient = normalizeE2ERecipient(url.searchParams.get("recipient"));
    if (!recipient) return json({ ok: false, error: "invalid_recipient" }, 400);
    const res = await supabaseRequest(
      env,
      `/rest/v1/e2e_emails?recipient=eq.${encodeURIComponent(recipient)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    );
    if (!res.ok) return json({ ok: false, error: "mailbox_clear_failed" }, res.status || 500);
    return json({ ok: true });
  }

  if (url.pathname === "/_e2e_api/accounts/restore" && request.method === "POST") {
    return restoreE2EAccount(request, env);
  }

  return json({ ok: false, error: "not_found" }, 404);
}

export async function restoreE2EAccount(request, env) {
  const body = await readJson(request);
  const account = String(body?.account || "").toLowerCase();
  const password = String(body?.password || "");
  const config = account === "test11"
    ? { targetEmail: "test11@familiada.online", candidates: ["test11@familiada.online"], username: null }
    : account === "test12"
      ? { targetEmail: "test12@familiada.online", candidates: ["test12@familiada.online", "test13@familiada.online"], username: "test12" }
      : null;
  if (!config || password.length < 8 || password.length > 200) {
    return json({ ok: false, error: "invalid_restore_request" }, 400);
  }

  const usersRes = await supabaseRequest(env, "/auth/v1/admin/users?page=1&per_page=1000");
  if (!usersRes.ok) return json({ ok: false, error: "users_read_failed" }, usersRes.status || 500);
  const users = Array.isArray(usersRes.data?.users) ? usersRes.data.users : [];
  const matches = users.filter((user) => config.candidates.includes(String(user?.email || "").toLowerCase()));
  if (matches.length !== 1) {
    return json({ ok: false, error: "test_account_not_unique", matches: matches.length }, 409);
  }

  const user = matches[0];
  // Admin updateUser nie zawsze zeruje pola secure email change w auth.users.
  // Uzywamy tej samej funkcji, ktora zasila przycisk "Anuluj zmiane" w UI,
  // zanim ustawimy bazowy adres i metadane konta testowego.
  const clearEmailChangeRes = await supabaseRpc(env, "auth_clear_email_change", { p_user_id: user.id });
  if (!clearEmailChangeRes.ok) {
    return json({ ok: false, error: "email_change_cleanup_failed" }, clearEmailChangeRes.status || 500);
  }
  const currentMeta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const userMeta = {
    ...currentMeta,
    familiada_email_change_pending: "",
    familiada_email_change_intent: "",
  };
  if (config.username) userMeta.username = config.username;

  const updateRes = await supabaseRequest(env, `/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: {
      email: config.targetEmail,
      password,
      email_confirm: true,
      user_metadata: userMeta,
    },
  });
  if (!updateRes.ok) return json({ ok: false, error: "auth_restore_failed" }, updateRes.status || 500);

  const profilePatch = { email: config.targetEmail };
  if (config.username) profilePatch.username = config.username;
  const profileRes = await supabaseRequest(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: profilePatch,
  });
  if (!profileRes.ok) return json({ ok: false, error: "profile_restore_failed" }, profileRes.status || 500);

  const cooldownRes = await supabaseRequest(env, `/rest/v1/user_cooldowns?user_id=eq.${encodeURIComponent(user.id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  if (!cooldownRes.ok) return json({ ok: false, error: "cooldown_cleanup_failed" }, cooldownRes.status || 500);

  // Reset hasla jest uruchamiany przed zalogowaniem, dlatego jego cooldown
  // jest hashowany po adresie w osobnej tabeli email_cooldowns.
  if (account === "test11") {
    const emailCooldownRes = await supabaseRpc(env, "cooldown_email_release", {
      p_email: config.targetEmail,
      p_action_key: "auth:reset_password",
      p_max_age_seconds: 172800,
    });
    if (!emailCooldownRes.ok) {
      return json({ ok: false, error: "email_cooldown_cleanup_failed" }, emailCooldownRes.status || 500);
    }
  }

  return json({ ok: true, account, user_id: user.id, email: config.targetEmail });
}

export async function handleE2ELoginBypass(request, env, url, originBase, originHost, resolveOverride) {
  const secret = env.E2E_BYPASS_SECRET;
  if (!secret) return null;

  const token = request.headers.get("X-E2E-Token");
  if (!token) return null;

  const payload = await verifyE2EToken(token, secret);
  if (!payload) return null;

  // Jednorazowość: odrzuć jeśli nonce już użyty
  const nonceKey = `e2e_nonce:${payload.nonce}`;
  const alreadyUsed = await env.MAINT_KV.get(nonceKey);
  if (alreadyUsed) return null;
  await env.MAINT_KV.put(nonceKey, "1", { expirationTtl: E2E_NONCE_TTL_SECONDS });

  console.log("[e2e] bypass captcha for /login, nonce:", payload.nonce);

  const res = await fetchFromOrigin(request, url, originBase, originHost, resolveOverride);
  if (res.status !== 200) return res;

  const rewriter = new HTMLRewriter().on("body", {
    element(el) {
      el.setAttribute("data-captcha-site-key", TURNSTILE_TEST_SITEKEY);
    },
  });
  const rewritten = rewriter.transform(res);

  return new Response(rewritten.body, {
    status: rewritten.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "text/html",
      "Cache-Control": "no-store",
    },
  });
}
