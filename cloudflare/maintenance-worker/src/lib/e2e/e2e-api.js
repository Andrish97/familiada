// src/lib/e2e-api.js -- /_e2e_api/* test-only endpoints + /login captcha bypass.
// See tests/README.md for the full mechanism description.
import { json } from "../core/http.js";
import { readJson } from "../admin/admin-auth.js";
import { supabaseRequest, supabaseRpc } from "../core/supabase.js";
import { fetchFromOrigin } from "../origin/origin.js";

export const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA"; // oficjalny, zawsze-przechodzący testowy sitekey Cloudflare
const E2E_TOKEN_MAX_AGE_MS = 5 * 60 * 1000; // 5 minut
const E2E_NONCE_TTL_SECONDS = 10 * 60; // 10 minut w KV, żeby pokryć zegar-skew
const E2E_EMAIL_RE = /^test([1-9]|1[0-5]|17)@familiada\.online$/;

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

  if (url.pathname === "/_e2e_api/mail-trigger" && request.method === "POST") {
    let body;
    try { body = await readJson(request); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
    const recipient = normalizeE2ERecipient(body?.recipient), after = Date.parse(body?.after);
    if (!recipient || /^test(?:9|10)@/.test(recipient) || !Number.isFinite(after) || after < Date.now() - 900000 || after > Date.now() + 5000) {
      return json({ ok: false, error: "invalid_mail_fixture" }, 400);
    }
    // Select recent pending test mail only. Never reset flags, budgets, delays,
    // leases or failures; the normal worker rechecks the actual source/provider.
    const selected = await supabaseRequest(env, "/rest/v1/mail_queue?select=id&to_email=eq." + encodeURIComponent(recipient)
      + "&status=eq.pending&created_at=gte." + encodeURIComponent(new Date(after).toISOString())
      + "&not_before=lte." + encodeURIComponent(new Date().toISOString()) + "&order=created_at.asc&limit=25", { method: "GET" });
    if (!selected.ok || !Array.isArray(selected.data)) return json({ ok: false, error: "mail_fixture_selection_failed" }, 502);
    const ids = selected.data.map(row => row.id);
    if (!ids.length) return json({ ok: true, selected: 0 });
    const invoked = await supabaseRpc(env, "invoke_mail_worker_ids", { p_ids: ids, p_limit: ids.length });
    return json({ ok: invoked.ok, selected: ids.length }, invoked.ok ? 200 : 502);
  }

  if (url.pathname === "/_e2e_api/mail-center-preference" && request.method === "POST") {
    let body;
    try { body = await readJson(request); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
    const stamp = body?.suppressed_at;
    if (stamp !== null && (typeof stamp !== "string" || stamp.length > 40 || !Number.isFinite(Date.parse(stamp)))) {
      return json({ ok: false, error: "invalid_preference_fixture" }, 400);
    }
    // Restore precisely the prior test14 flag; no source resurrection/budget reset.
    const result = await supabaseRequest(env, "/rest/v1/email_unsub_tokens?email=eq.test14%40familiada.online", {
      method: "PATCH", body: { suppressed_at: stamp },
    });
    return json({ ok: result.ok }, result.ok ? 200 : 502);
  }

  if (url.pathname === "/_e2e_api/mail-center-capabilities" && request.method === "DELETE") {
    // Only the anonymous test mailbox; never touch preferences or source budgets.
    const result = await supabaseRequest(env, "/rest/v1/mail_center_links?email=eq.test14%40familiada.online", { method: "DELETE" });
    return json({ ok: result.ok }, result.ok ? 200 : 502);
  }

  // Template SMTP fixtures are private test traffic. They use the ordinary
  // preference-checked service route, never a forged contact/resource source.
  if (url.pathname === "/_e2e_api/mail-template-fixtures" && request.method === "POST") {
    let body;
    try { body = await readJson(request); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
    if (body?.recipient !== "test14@familiada.online" || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 15) {
      return json({ ok: false, error: "invalid_fixture_batch" }, 400);
    }
    const validSubject = /^E2E-PKT6-\d{10,16}-(?:(?:pl|en|uk)-(?:confirmation|reply|compose|manual)|marketing-(?:invitation|newsletter|custom))$/;
    if (body.items.some(item => !item || typeof item.subject !== "string" || !validSubject.test(item.subject)
      || typeof item.html !== "string" || !item.html || item.html.length > 64000)) {
      return json({ ok: false, error: "invalid_fixture_document" }, 400);
    }
    const rows = body.items.map(item => ({ created_by: null, to_email: "test14@familiada.online",
      subject: item.subject, html: item.html, status: "pending", not_before: new Date().toISOString(), attempts: 0,
      cooldown_action_key: "admin:marketing", cooldown_target_key: "e2e-template:test14",
      meta: { e2e_template_fixture: true } }));
    const result = await supabaseRequest(env, "/rest/v1/mail_queue?select=id", {
      method: "POST", headers: { Prefer: "return=representation" }, body: rows,
    });
    if (!result.ok) return json({ ok: false, error: "fixture_queue_failed" }, 502);
    return json({ ok: true, queued: Array.isArray(result.data) ? result.data.length : 0 });
  }

  if (url.pathname === "/_e2e_api/mark-test-guest" && request.method === "POST") {
    const token = request.headers.get("Authorization") || "";
    if (!token.startsWith("Bearer ")) return json({ok:false,error:"guest_token_required"},401);
    const user = await supabaseRequest(env,"/auth/v1/user",{headers:{Authorization:token}});
    if (!user.ok || !user.data?.id) return json({ok:false,error:"invalid_guest"},401);
    const profile = await supabaseRequest(env,`/rest/v1/profiles?id=eq.${encodeURIComponent(user.data.id)}&select=is_guest`);
    if (!profile.ok || profile.data?.[0]?.is_guest !== true) return json({ok:false,error:"not_guest"},403);
    const result = await supabaseRequest(env,`/auth/v1/admin/users/${encodeURIComponent(user.data.id)}`,{
      method:"PUT",body:{app_metadata:{...user.data.app_metadata,is_test_guest:true}}
    });
    return json({ok:result.ok},result.ok?200:502);
  }

  if (url.pathname === "/_e2e_api/mail-delivery" && request.method === "GET") {
    const recipient = normalizeE2ERecipient(url.searchParams.get("recipient"));
    const afterMs = Date.parse(url.searchParams.get("after") || "");
    if (!recipient || !Number.isFinite(afterMs) || afterMs < Date.now() - 25 * 60 * 60 * 1000 || afterMs > Date.now() + 60_000) {
      return json({ ok: false, error: "invalid_query" }, 400);
    }
    const after = encodeURIComponent(new Date(afterMs).toISOString());
    const results = await Promise.all([
      supabaseRequest(env, `/rest/v1/mail_queue?select=id,created_at,status,attempts,not_before,last_attempt_at,provider_used,last_error&to_email=eq.${encodeURIComponent(recipient)}&created_at=gte.${after}&order=created_at.asc&limit=30`),
      supabaseRequest(env, `/rest/v1/mail_function_logs?select=created_at,function_name,event,status,provider,queue_id,error&recipient_email=eq.${encodeURIComponent(recipient)}&created_at=gte.${after}&order=created_at.asc&limit=60`),
    ]);
    if (results.some((res) => !res.ok)) return json({ ok: false, error: "delivery_read_failed" }, 500);
    return json({ ok: true, queue: results[0].data || [], events: results[1].data || [] });
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
    ? { targetEmail: "test11@familiada.online", candidates: ["test11@familiada.online"], username: null, allowCreate: true }
    : account === "test12"
      ? { targetEmail: "test12@familiada.online", candidates: ["test12@familiada.online", "test13@familiada.online"], username: "test12", allowCreate: true }
      : account === "test15"
        ? { targetEmail: "test15@familiada.online", candidates: ["test15@familiada.online"], username: "test15", allowCreate: true }
        : account === "test17"
          ? { targetEmail: "test17@familiada.online", candidates: ["test17@familiada.online"], username: "test17", allowCreate: true }
        : null;
  if (!config || password.length < 8 || password.length > 200) {
    return json({ ok: false, error: "invalid_restore_request" }, 400);
  }

  const usersRes = await supabaseRequest(env, "/auth/v1/admin/users?page=1&per_page=1000");
  if (!usersRes.ok) return json({ ok: false, error: "users_read_failed" }, usersRes.status || 500);
  const users = Array.isArray(usersRes.data?.users) ? usersRes.data.users : [];
  const matches = users.filter((user) => config.candidates.includes(String(user?.email || "").toLowerCase()));
  let user = matches[0];
  let created = false;
  if (matches.length === 0 && config.allowCreate) {
    const createRes = await supabaseRequest(env, "/auth/v1/admin/users", {
      method: "POST",
      body: { email: config.targetEmail, password, email_confirm: true, user_metadata: { username: config.username || account, is_guest: false } },
    });
    if (!createRes.ok) return json({ ok: false, error: "account_create_failed" }, createRes.status || 500);
    user = createRes.data?.user || createRes.data;
    if (!user?.id || String(user.email || "").toLowerCase() !== config.targetEmail) {
      return json({ ok: false, error: "created_account_invalid" }, 502);
    }
    created = true;
  } else if (matches.length !== 1) {
    return json({ ok: false, error: "test_account_not_unique", matches: matches.length }, 409);
  }

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
  // jest hashowany po adresie w osobnej tabeli email_cooldowns. Migracja
  // 293 przeniosła auth:reset_password na nowy, wspólny mechanizm
  // (mail_cooldowns) -- login.js go faktycznie czyta, więc czyszczenie
  // samego starego email_cooldowns nie wystarczy (zgłoszone: run
  // 37146230051, "Nie otrzymano maila" dla test11 -- cooldown z
  // wcześniejszego przebiegu tego samego dnia zostawał aktywny, login.js
  // pokazywał "Wysłano" bez realnego wysłania).
  if (account === "test11") {
    const emailCooldownRes = await supabaseRpc(env, "cooldown_email_release", {
      p_email: config.targetEmail,
      p_action_key: "auth:reset_password",
      p_max_age_seconds: 172800,
    });
    if (!emailCooldownRes.ok) {
      return json({ ok: false, error: "email_cooldown_cleanup_failed" }, emailCooldownRes.status || 500);
    }
    const mailCooldownRes = await supabaseRpc(env, "mail_cooldown_email_release", {
      p_email: config.targetEmail,
      p_action_key: "auth:reset_password",
      p_max_age_seconds: 172800,
    });
    if (!mailCooldownRes.ok) {
      return json({ ok: false, error: "mail_cooldown_cleanup_failed" }, mailCooldownRes.status || 500);
    }
  }

  let adminExcluded;
  if (account === "test15") {
    const excluded = await supabaseRequest(env, `/rest/v1/stats_exclusions_effective?user_id=eq.${encodeURIComponent(user.id)}&select=reason`);
    adminExcluded = excluded.ok && Array.isArray(excluded.data) && excluded.data.some(row => row.reason === "test_account" || row.reason === "manual");
    if (!adminExcluded) return json({ ok: false, error: "admin_exclusion_missing" }, 502);
  }
  return json({ ok: true, account, user_id: user.id, email: config.targetEmail, ...(config.allowCreate ? { created } : {}), ...(account === "test15" ? { admin_excluded: adminExcluded } : {}) });
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
