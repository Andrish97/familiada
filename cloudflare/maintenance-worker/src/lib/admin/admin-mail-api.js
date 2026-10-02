// src/lib/admin-mail-api.js -- /_admin_api/mail/* (settings, queue, logs).
import { json } from "../core/http.js";
import { readJson } from "./admin-auth.js";
import { clampInt } from "../core/utils.js";
import { supabaseRequest, supabaseRpc, summarizeSupabaseError, normalizeRpcValue, extractScalarNumber } from "../core/supabase.js";

export const MAIL_PROVIDERS = ["brevo", "mailgun", "sendpulse", "zeptomail"];
const DEFAULT_MAIL_SETTINGS = {
  delay_ms: 250,
  batch_max: 100,
  worker_limit: 25,
};

export async function handleAdminMailApi(request, env, url) {
  if (url.pathname === "/_admin_api/mail/settings") {
    if (request.method === "GET") {
      const loaded = await loadMailSettings(env);
      if (!loaded.ok) return json({ ok: false, error: loaded.error || "mail_settings_load_failed" }, loaded.status || 500);

      const cron = await loadMailCronStatus(env);
      return json({
        ok: true,
        settings: loaded.settings,
        providers: loaded.providers,
        cron: cron.ok ? cron.data : { supported: false, configured: false, error: cron.error || "cron_status_failed" },
      });
    }

    if (request.method === "POST") {
      const body = await readJson(request);
      if (!body || typeof body !== "object") {
        return json({ ok: false, error: "Invalid JSON" }, 400);
      }

      const loaded = await loadMailSettings(env);
      if (!loaded.ok) return json({ ok: false, error: loaded.error || "mail_settings_load_failed" }, loaded.status || 500);
      const current = loaded.settings;

      // Aktualizuj dostawców jeśli przesłano nową listę
      if (Array.isArray(body.providers)) {
        for (let i = 0; i < body.providers.length; i++) {
          const p = body.providers[i];
          if (!p.id) continue;
          await supabaseRequest(env, `/rest/v1/email_providers?id=eq.${encodeURIComponent(p.id)}`, {
            method: "PATCH",
            body: { 
              daily_limit: clampInt(p.daily_limit, 0, 1000000, 1000),
              priority: i + 1,
              is_active: p.is_active !== false
            }
          });
        }
      }

      const next = {
        id: 1,
        queue_enabled:
          typeof body.queue_enabled === "boolean"
            ? body.queue_enabled
            : typeof body.queueEnabled === "boolean"
              ? body.queueEnabled
              : current.queue_enabled,
        delay_ms: clampInt(
          body.delay_ms ?? body.delayMs ?? current.delay_ms,
          0,
          5000,
          current.delay_ms
        ),
        batch_max: clampInt(
          body.batch_max ?? body.batchMax ?? current.batch_max,
          1,
          500,
          current.batch_max
        ),
        worker_limit: clampInt(
          body.worker_limit ?? body.workerLimit ?? current.worker_limit,
          1,
          200,
          current.worker_limit
        ),
        updated_at: new Date().toISOString(),
      };

      const upsert = await supabaseRequest(env, "/rest/v1/mail_settings?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: [next],
      });
      if (!upsert.ok) {
        return json({ ok: false, error: "mail_settings_update_failed", details: summarizeSupabaseError(upsert) }, upsert.status || 500);
      }

      let cronResult = null;
      const hasCronSchedule = typeof body.cron_schedule === "string" || typeof body.cronSchedule === "string";
      const hasCronActive = typeof body.cron_active === "boolean" || typeof body.cronActive === "boolean";
      if (hasCronSchedule || hasCronActive) {
        const cronStatus = await loadMailCronStatus(env);
        const scheduleInput = String(body.cron_schedule ?? body.cronSchedule ?? "").trim();
        const schedule = scheduleInput || (cronStatus.ok ? String(cronStatus.data?.schedule || "") : "");
        if (!schedule) {
          return json({ ok: false, error: "Missing cron schedule" }, 400);
        }
        const active =
          typeof body.cron_active === "boolean"
            ? body.cron_active
            : typeof body.cronActive === "boolean"
              ? body.cronActive
              : Boolean(cronStatus.ok ? cronStatus.data?.active : true);
        const cronSet = await supabaseRpc(env, "mail_cron_set", {
          p_schedule: schedule,
          p_active: active,
          p_limit: next.worker_limit,
          p_job_name: "familiada_mail_worker",
        });
        if (!cronSet.ok) {
          return json({ ok: false, error: "mail_cron_set_failed", details: summarizeSupabaseError(cronSet) }, cronSet.status || 500);
        }
        cronResult = cronSet.data;
      }

      const refreshed = await loadMailSettings(env);
      const cron = await loadMailCronStatus(env);
      return json({
        ok: true,
        settings: refreshed.ok ? refreshed.settings : next,
        providers: refreshed.ok ? refreshed.providers : [],
        cron: cron.ok ? cron.data : cronResult || { supported: false, configured: false, error: "cron_status_failed" },
      });
    }

    return new Response("Method Not Allowed", { status: 405 });
  }

  // GET /_admin_api/mail/queue/item?id=xxx — full row with html
  if (url.pathname === "/_admin_api/mail/queue/item") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "Missing id" }, 400);
    const res = await supabaseRequest(env,
      `/rest/v1/mail_queue?id=eq.${encodeURIComponent(id)}&select=id,created_at,to_email,subject,html,status,provider_used,meta&limit=1`,
      { method: "GET" });
    if (!res.ok) return json({ ok: false, error: "not_found" }, 404);
    const rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, item: rows[0] });
  }

  if (url.pathname === "/_admin_api/mail/queue") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 150);
    const status = String(url.searchParams.get("status") || "all").toLowerCase();
    const allowedStatuses = new Set(["all", "pending", "sending", "failed", "sent"]);
    if (!allowedStatuses.has(status)) {
      return json({ ok: false, error: "Invalid status filter" }, 400);
    }

    let qs =
      "select=id,created_at,created_by,to_email,subject,status,not_before,attempts,last_error,provider_used,provider_order,meta,picked_at,last_attempt_at";
    qs += `&order=created_at.desc&limit=${limit}`;
    if (status !== "all") qs += `&status=eq.${encodeURIComponent(status)}`;

    const list = await supabaseRequest(env, `/rest/v1/mail_queue?${qs}`, { method: "GET" });
    if (!list.ok) {
      return json({ ok: false, error: "mail_queue_load_failed", details: summarizeSupabaseError(list) }, list.status || 500);
    }

    return json({
      ok: true,
      rows: Array.isArray(list.data) ? list.data : [],
      filter: { status, limit },
    });
  }

  if (url.pathname === "/_admin_api/mail/queue/run") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const body = await readJson(request);
    const limit = clampInt(body?.limit, 1, 200, 25);
    const requeueFailed = Boolean(body?.requeue_failed ?? body?.requeueFailed);
    const ids = Array.isArray(body?.ids)
      ? body.ids
          .map((v) => String(v || "").trim())
          .filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))
      : [];

    let requeued = 0;
    if (ids.length || requeueFailed) {
      const rq = await supabaseRpc(env, "mail_queue_requeue", {
        p_ids: ids.length ? ids : null,
        p_only_failed: !ids.length,
      });
      if (!rq.ok) {
        return json({ ok: false, error: "mail_queue_requeue_failed", details: summarizeSupabaseError(rq) }, rq.status || 500);
      }
      requeued = extractScalarNumber(rq.data, 0);
    }

    const run = ids.length
      ? await supabaseRpc(env, "invoke_mail_worker_ids", { p_ids: ids, p_limit: limit })
      : await supabaseRpc(env, "invoke_mail_worker", { p_limit: limit });
    if (!run.ok) {
      return json({ ok: false, error: "mail_worker_invoke_failed", details: summarizeSupabaseError(run) }, run.status || 500);
    }

    return json({
      ok: true,
      invoked: true,
      targeted: ids.length > 0,
      targeted_count: ids.length,
      limit,
      requeued,
    });
  }

  if (url.pathname === "/_admin_api/mail/logs") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const perPage = clampInt(url.searchParams.get("per_page"), 10, 200, 50);
    const page = clampInt(url.searchParams.get("page"), 1, 9999, 1);
    const fn = String(url.searchParams.get("fn") || "all").toLowerCase();
    const level = String(url.searchParams.get("level") || "all").toLowerCase();
    const fnAllowed = new Set(["all", "send-mail", "send-email", "mail-worker"]);
    const levelAllowed = new Set(["all", "debug", "info", "warn", "error"]);
    if (!fnAllowed.has(fn)) return json({ ok: false, error: "Invalid function filter" }, 400);
    if (!levelAllowed.has(level)) return json({ ok: false, error: "Invalid level filter" }, 400);

    let filters = "";
    if (fn !== "all") filters += `&function_name=eq.${encodeURIComponent(fn)}`;
    if (level !== "all") filters += `&level=eq.${encodeURIComponent(level)}`;

    // Count query
    const countResult = await supabaseRequest(env, `/rest/v1/mail_function_logs?select=count${filters}`, { method: "GET" });
    const total = Array.isArray(countResult.data) && countResult.data[0]?.count != null
      ? Number(countResult.data[0].count)
      : 0;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * perPage;

    let qs =
      "select=id,created_at,function_name,level,event,request_id,queue_id,actor_user_id,recipient_email,provider,status,error,meta";
    qs += `&order=created_at.desc&limit=${perPage}&offset=${offset}${filters}`;

    const list = await supabaseRequest(env, `/rest/v1/mail_function_logs?${qs}`, { method: "GET" });
    if (!list.ok) {
      return json({ ok: false, error: "mail_logs_load_failed", details: summarizeSupabaseError(list) }, list.status || 500);
    }

    return json({
      ok: true,
      rows: Array.isArray(list.data) ? list.data : [],
      total,
      page: safePage,
      per_page: perPage,
      pages,
      filter: { fn, level },
    });
  }

  return new Response("Not Found", { status: 404 });
}

export async function loadMailSettings(env) {
  const q = "select=id,delay_ms,batch_max,worker_limit,updated_at&id=eq.1&limit=1";
  const res = await supabaseRequest(env, `/rest/v1/mail_settings?${q}`, { method: "GET" });
  if (!res.ok) {
    return { ok: false, status: res.status, error: "mail_settings_load_failed", details: summarizeSupabaseError(res) };
  }
  
  const providersRes = await supabaseRequest(env, "/rest/v1/email_providers?select=id,name,label,priority,daily_limit,rem_worker,rem_immediate,is_active&order=priority.asc", { method: "GET" });
  const providers = Array.isArray(providersRes.data) ? providersRes.data : [];

  const row = Array.isArray(res.data) && res.data.length ? res.data[0] : null;
  if (!row) {
    return {
      ok: true,
      settings: { id: 1, ...DEFAULT_MAIL_SETTINGS, updated_at: null },
      providers: providers
    };
  }

  return {
    ok: true,
    settings: {
      id: 1,
      delay_ms: clampInt(row.delay_ms, 0, 5000, DEFAULT_MAIL_SETTINGS.delay_ms),
      batch_max: clampInt(row.batch_max, 1, 500, DEFAULT_MAIL_SETTINGS.batch_max),
      worker_limit: clampInt(row.worker_limit, 1, 200, DEFAULT_MAIL_SETTINGS.worker_limit),
      updated_at: row.updated_at || null,
    },
    providers: providers
  };
}

export async function loadMailCronStatus(env) {
  const res = await supabaseRpc(env, "mail_cron_status", {});
  if (!res.ok) {
    return { ok: false, status: res.status, error: "mail_cron_status_failed", details: summarizeSupabaseError(res) };
  }
  return { ok: true, data: normalizeRpcValue(res.data) || {} };
}

export function parseProviderOrderInput(raw) {
  const source = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

  const uniq = [];
  for (const provider of source) {
    if (!MAIL_PROVIDERS.includes(provider)) continue;
    if (uniq.includes(provider)) continue;
    uniq.push(provider);
  }
  for (const provider of MAIL_PROVIDERS) {
    if (!uniq.includes(provider)) uniq.push(provider);
  }
  return uniq;
}
