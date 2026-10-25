// src/lib/e2e/e2e-lease.js -- E25: wypożyczanie tożsamości testowych (lease),
// zakładanie i odtwarzanie kont według roli, kontrola wykluczenia w statystykach.
// Plan: docs/konta-testowe-plan.md. Wołane tylko z handleE2EApi (po tokenie E2E).
import { json } from "../core/http.js";
import { readJson } from "../core/http.js";
import { supabaseRequest, supabaseRpc } from "../core/supabase.js";

const ACCOUNT_ROLES = new Set(["standard", "disposable", "dedicated"]);
const E2E_PLUS_RE = /^e2e\+[a-z]+[0-9]{2}(\.new)?@familiada\.online$/;
const RUN_ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;

export function isE2EPlusAddress(value) {
  return E2E_PLUS_RE.test(String(value || "").trim().toLowerCase());
}

// Adres e2e+ wolno czytać/czyścić tylko przebiegowi, który go wypożyczył.
export async function e2eRunOwns(env, request, email) {
  const runId = String(request.headers.get("X-E2E-Run") || "");
  if (!RUN_ID_RE.test(runId)) return false;
  const res = await supabaseRpc(env, "e2e_lease_owns", { p_run_id: runId, p_email: email });
  return res.ok && res.data === true;
}

// Inbound: czy adres e2e+ należy do znanej tożsamości (inne odrzucamy).
export async function e2eIdentityName(env, email) {
  const res = await supabaseRpc(env, "e2e_identity", { p_email: email });
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return res.ok && row && row.name ? row.name : null;
}

export async function handleE2ELease(request, env, url) {
  if (url.pathname === "/_e2e_api/lease" && request.method === "POST") return lease(request, env);
  if (url.pathname === "/_e2e_api/lease/renew" && request.method === "POST") {
    const body = await readJson(request).catch(() => null);
    if (!RUN_ID_RE.test(String(body?.run_id || ""))) return json({ ok: false, error: "invalid_run_id" }, 400);
    const res = await supabaseRpc(env, "e2e_lease_renew", { p_run_id: body.run_id, p_ttl_seconds: ttl(body.ttl) });
    return json({ ok: res.ok, renewed: res.ok ? res.data : 0 }, res.ok ? 200 : 502);
  }
  if (url.pathname === "/_e2e_api/lease/release" && request.method === "POST") {
    const body = await readJson(request).catch(() => null);
    if (!RUN_ID_RE.test(String(body?.run_id || ""))) return json({ ok: false, error: "invalid_run_id" }, 400);
    const worker = body.worker == null ? null : String(body.worker).slice(0, 100);
    const res = await supabaseRpc(env, "e2e_lease_release", { p_run_id: body.run_id, p_worker: worker });
    return json({ ok: res.ok, released: res.ok ? res.data : 0 }, res.ok ? 200 : 502);
  }
  if (url.pathname === "/_e2e_api/lease/holders" && request.method === "GET") {
    const res = await supabaseRpc(env, "e2e_lease_holders", {});
    return json({ ok: res.ok, holders: res.ok ? res.data : [] }, res.ok ? 200 : 502);
  }
  if (url.pathname === "/_e2e_api/quarantine/retry" && request.method === "POST") {
    const body = await readJson(request).catch(() => null);
    const name = String(body?.name || "");
    if (!/^e2e\.[a-z]+[0-9]{2}$/.test(name)) return json({ ok: false, error: "invalid_name" }, 400);
    const res = await supabaseRpc(env, "e2e_quarantine_retry", { p_name: name });
    return json(res.ok ? res.data : { ok: false, error: "retry_failed" }, res.ok ? 200 : 502);
  }
  return null;
}

function ttl(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 60 && n <= 7200 ? n : 1200;
}

async function lease(request, env) {
  let body;
  try { body = await readJson(request); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
  const runId = String(body?.run_id || "");
  const worker = String(body?.worker ?? "").slice(0, 100);
  const password = String(body?.password || "");
  if (!RUN_ID_RE.test(runId)) return json({ ok: false, error: "invalid_run_id" }, 400);
  if (!body?.needs || typeof body.needs !== "object" || Array.isArray(body.needs)) {
    return json({ ok: false, error: "invalid_needs" }, 400);
  }
  if (password.length < 8 || password.length > 200) return json({ ok: false, error: "invalid_password" }, 400);

  const res = await supabaseRpc(env, "e2e_lease", {
    p_run_id: runId, p_worker: worker, p_needs: body.needs,
    p_ttl_seconds: ttl(body.ttl), p_label: body.label ? String(body.label).slice(0, 200) : null,
  });
  if (!res.ok) return json({ ok: false, error: "lease_failed", details: res.error }, 502);
  if (res.data?.ok !== true) return json(res.data || { ok: false, error: "lease_failed" }, 409);

  const identities = Array.isArray(res.data.identities) ? res.data.identities : [];
  try {
    for (const identity of identities) {
      if (ACCOUNT_ROLES.has(identity.role)) {
        identity.user_id = await provisionAccount(env, identity, password);
      }
    }
    const accounts = identities.filter((i) => ACCOUNT_ROLES.has(i.role));
    if (accounts.length) await assertExcluded(env, accounts);
  } catch (err) {
    await supabaseRpc(env, "e2e_lease_release", { p_run_id: runId, p_worker: worker });
    return json({ ok: false, error: "provision_failed", details: String(err?.message || err) }, 502);
  }
  return json({ ok: true, identities: identities.map(({ name, role, email, user_id, purpose }) => ({ name, role, email, user_id, purpose })) });
}

// Konto Auth istnieje, ma potwierdzony adres tożsamości, hasło TEST_PASSWORD,
// nazwę = name, app_metadata.e2e_role = rola (pewne źródło wykluczenia).
async function provisionAccount(env, identity, password) {
  const { name, role, email } = identity;
  let userId = identity.user_id;
  if (!userId) {
    const created = await supabaseRequest(env, "/auth/v1/admin/users", {
      method: "POST",
      body: {
        email, password, email_confirm: true,
        user_metadata: { username: name, is_guest: false },
        app_metadata: { e2e_role: role },
      },
    });
    const user = created.data?.user || created.data;
    if (created.ok && user?.id) {
      userId = user.id;
    } else {
      userId = await findUserIdByEmail(env, email);
      if (!userId) throw new Error(`create ${name}: ${created.status} ${created.error || ""}`);
    }
    const bind = await supabaseRpc(env, "e2e_identity_bind", { p_name: name, p_user_id: userId });
    if (!bind.ok) throw new Error(`bind ${name}: ${bind.error || bind.status}`);
  }

  // Odtworzenie stanu konta przy każdym lease (także po zmianie e-maila/hasła
  // w teście disposable). Najpierw anulowana zmiana adresu w toku.
  const clear = await supabaseRpc(env, "auth_clear_email_change", { p_user_id: userId });
  if (!clear.ok) throw new Error(`clear email change ${name}`);
  const update = await supabaseRequest(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: {
      email, password, email_confirm: true,
      user_metadata: { username: name, is_guest: false, familiada_email_change_pending: "", familiada_email_change_intent: "" },
      app_metadata: { e2e_role: role },
    },
  });
  if (!update.ok) throw new Error(`auth restore ${name}: ${update.status}`);
  const profile = await supabaseRequest(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: { email, username: name },
  });
  if (!profile.ok || !Array.isArray(profile.data) || profile.data.length !== 1) {
    throw new Error(`profile restore ${name}: ${profile.status}`);
  }
  return userId;
}

async function findUserIdByEmail(env, email) {
  for (let page = 1; page <= 10; page++) {
    const res = await supabaseRequest(env, `/auth/v1/admin/users?page=${page}&per_page=1000`);
    const users = Array.isArray(res.data?.users) ? res.data.users : [];
    const match = users.find((u) => String(u?.email || "").toLowerCase() === email);
    if (match) return match.id;
    if (!res.ok || users.length < 1000) return null;
  }
  return null;
}

async function assertExcluded(env, accounts) {
  const ids = accounts.map((a) => a.user_id).join(",");
  const res = await supabaseRequest(env, `/rest/v1/stats_exclusions_effective?user_id=in.(${ids})&select=user_id,reason`);
  const excluded = new Set((Array.isArray(res.data) ? res.data : [])
    .filter((row) => String(row.reason || "").startsWith("test:")).map((row) => row.user_id));
  const missing = accounts.filter((a) => !excluded.has(a.user_id)).map((a) => a.name);
  if (!res.ok || missing.length) throw new Error(`admin_exclusion_missing: ${missing.join(",") || res.status}`);
}
