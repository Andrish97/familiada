import { timingSafeEqual } from "../_shared/internal-auth.ts";
import { createMailTransport, type MailAttachment } from "../_shared/mail-providers.ts";

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { prepareMailDelivery } from "../_shared/mail-center-footer.js";

type ProviderType = "brevo" | "mailgun" | "sendpulse" | "zeptomail";
type LogLevel = "debug" | "info" | "warn" | "error";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const WORKER_SECRET = (Deno.env.get("MAIL_WORKER_SECRET") || "").trim();



const mailTransport = createMailTransport();

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function scrubEmail(email: string) {
  const e = String(email || "").trim();
  const at = e.indexOf("@");
  if (at <= 1) return e ? "***" : "";
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}
function clampError(message: unknown, max = 2000) {
  return String(message ?? "").slice(0, max);
}

interface EmailProvider {
  id: string;
  name: string;
  type: ProviderType;
  label: string;
  priority: number;
  rem_worker: number;
}

function parseQueueIds(raw: string | null): string[] {
  if (!raw) return [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uniq = new Set<string>();
  String(raw)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .forEach((id) => {
      if (uuidRe.test(id)) uniq.add(id);
    });
  return [...uniq].slice(0, 200);
}

async function loadProviders(): Promise<EmailProvider[]> {
  const { data, error } = await sbAdmin
    .from("email_providers")
    .select("id, name, label, priority, daily_limit, rem_worker, rem_immediate, is_active")
    .eq("is_active", true) // Rygorystyczne filtrowanie po is_active
    .order("priority", { ascending: true });

  if (error) {
    console.error("[mail-worker] loadProviders DB error:", error);
    return [];
  }

  return (data || []).map(p => ({
    ...p,
    type: (p.name.split('_')[0]) as ProviderType
  }));
}


async function decrementWorkerLimit(providerId: string) {
  const { error } = await sbAdmin.rpc("decrement_provider_worker", { p_id: providerId });
  if (error) console.error("[mail-worker] decrement failed", error);
}

async function loadSettings() {
  const { data } = await sbAdmin
    .from("mail_settings")
    .select("delay_ms,worker_limit")
    .eq("id", 1)
    .maybeSingle();
  return {
    delay_ms: Number.isFinite(Number(data?.delay_ms)) ? Number(data?.delay_ms) : 250,
    worker_limit: Number.isFinite(Number(data?.worker_limit)) ? Number(data?.worker_limit) : 25,
  };
}

async function writeLog(entry: {
  requestId: string;
  level?: LogLevel;
  event: string;
  status?: string;
  queueId?: string | null;
  recipientEmail?: string | null;
  provider?: string | null;
  error?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const { error } = await sbAdmin.from("mail_function_logs").insert({
      function_name: "mail-worker",
      level: entry.level || "info",
      event: entry.event,
      request_id: entry.requestId,
      queue_id: entry.queueId || null,
      recipient_email: entry.recipientEmail || null,
      provider: entry.provider || null,
      status: entry.status || null,
      error: entry.error ? clampError(entry.error) : null,
      meta: entry.meta || {},
    });
    if (error) {
      console.warn("[mail-worker] log:insert_failed", { error });
    }
  } catch (err) {
    console.warn("[mail-worker] log:insert_failed", { error: String(err) });
  }
}

type Attachment = MailAttachment;

async function loadAttachmentsFromStorage(attachments: Array<{ filename: string; storage_path: string; mime_type?: string }>): Promise<Attachment[]> {
  const result: Attachment[] = [];
  for (const att of attachments) {
    try {
      const storageBucketPath = att.storage_path.replace(/^message-attachments\//, "");
      const { data, error } = await sbAdmin.storage.from("message-attachments").download(storageBucketPath);
      if (!error && data) {
        const buf = await data.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        result.push({ filename: att.filename, content: b64, contentType: att.mime_type || "application/octet-stream" });
      }
    } catch (err) {
      console.error("[mail-worker] attachment_load_failed:", att.filename, err);
    }
  }
  return result;
}

async function sendWithFallbacks(queueId: string, providers: EmailProvider[], fromEmail?: string, attachments?: Attachment[], metaAttachments?: Array<{ filename: string; storage_path: string }>) {
  const available = providers.filter(p => p.rem_worker > 0);
  if (available.length === 0) throw new Error("no_available_worker_limits");

  console.log("[mail-worker] available providers:", available.map(p => p.name));
  console.log("[mail-worker] trying first:", available[0]?.name);

  const errs: string[] = [];
  for (const p of available) {
    // Repeat before every provider attempt, including a fallback after failure.
    // A backend failure cannot turn into sending an unchecked notification.
    const delivery = await prepareMailDelivery((name: string, args: Record<string, unknown>) => sbAdmin.rpc(name, args), queueId);
    if (!delivery.allowed) return { skipped: delivery.reason, provider: "" };
    const { to, subject, html, text } = delivery;
    try {
      console.log("[mail-worker] trying provider:", p.name, "type:", p.type);
      
      // Zmniejszamy limit za każdą podjętą próbę (zgodnie z prośbą użytkownika)
      await decrementWorkerLimit(p.id);

      await mailTransport.send(p.type, {
        to, subject, html, fromEmail, attachments, plainText: text,
        attachmentsMeta: metaAttachments, mode: "worker",
      });
      
      console.log("[mail-worker] SUCCESS via:", p.name);
      return { provider: p.name, skipped: "" };
    } catch (e) {
const errMsg = String((e as any)?.message || e);
      errs.push(`${p.name}:${errMsg}`);
      console.log("[mail-worker] FAILED provider:", p.name, "error:", errMsg);
      await writeLog({
        requestId: crypto.randomUUID(),
        level: "warn",
        event: "provider_failed",
        provider: p.name,
        error: errMsg,
      });
    }
  }
  
  console.log("[mail-worker] ALL providers failed:", errs);
  throw new Error(errs.join("|"));
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "POST" && req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
  await writeLog({
    requestId,
    event: "request_start",
    status: "started",
    // Bez pełnego adresu (zapytanie mogło kiedyś nieść sekret).
    meta: { method: req.method, path: new URL(req.url).pathname },
  });

  const url = new URL(req.url);

  // Tylko nagłówek x-mail-worker-secret (wysyła go invoke_mail_worker*
  // z Vault). Brak MAIL_WORKER_SECRET w env = odmowa (bez trybu otwartego).
  const fromHeader = req.headers.get("x-mail-worker-secret") || "";
  if (!WORKER_SECRET || !timingSafeEqual(fromHeader, WORKER_SECRET)) {
    const reason = WORKER_SECRET ? "request_forbidden_bad_secret" : "request_forbidden_no_secret_configured";
    console.warn(`[mail-worker] ${reason}`);
    await writeLog({
      requestId,
      level: "warn",
      event: reason,
      status: "failed",
    });
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const settings = await loadSettings();
  const providers = await loadProviders();
  const delayMs = Math.max(0, Math.min(5000, Number(settings.delay_ms || 0)));
  const defaultLimit = Math.max(1, Math.min(200, Number(settings.worker_limit || 25)));
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || String(defaultLimit))));
  const selectedIds = parseQueueIds(url.searchParams.get("ids"));
  const pickFn = selectedIds.length ? "mail_queue_pick_selected" : "mail_queue_pick";
  const pickPayload = selectedIds.length
    ? { p_ids: selectedIds, p_limit: limit }
    : { p_limit: limit };
  
  await writeLog({
    requestId,
    event: "request_settings_loaded",
    status: "ok",
    meta: { providersCount: providers.length, delayMs, limit, defaultLimit, selectedIds: selectedIds.length },
  });

  // pick batch
  const { data: rows, error } = await sbAdmin.rpc(pickFn, pickPayload);
  if (error) {
    console.error("[mail-worker] queue:pick_failed", { error });
    await writeLog({
      requestId,
      level: "error",
      event: "queue_pick_failed",
      status: "failed",
      error: String(error.message || error),
      meta: { pickFn, selectedIds: selectedIds.length },
    });
    return json({ ok: false, error: "pick_failed" }, 500);
  }
  await writeLog({
    requestId,
    event: "queue_picked",
    status: "ok",
    meta: { count: (rows || []).length, limit, pickFn, selectedIds: selectedIds.length },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i];
    
    // Sprawdź czy nadal mamy jakieś limity
    const anyLimits = providers.some(p => p.rem_worker > 0);
    if (!anyLimits) {
      console.warn("[mail-worker] all worker limits exhausted, stopping batch");
      await writeLog({
        requestId,
        level: "warn",
        event: "worker_limits_exhausted_stopping",
        status: "partial",
        meta: { processed: i, total: rows.length },
      });
      break;
    }

    try {

      // Load attachments from storage if any
      const metaAttachments = (r.meta?.attachments || []) as Array<{filename: string, mime_type: string, storage_path: string}>;
      const emailAttachments = metaAttachments.length ? await loadAttachmentsFromStorage(metaAttachments) : [];

      const result = await sendWithFallbacks(r.id, providers, r.from_email || undefined, emailAttachments.length ? emailAttachments : undefined, metaAttachments);
      if (result.skipped) {
        const { error: skipError } = await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: true, p_provider: result.skipped, p_error: "" });
        if (skipError) throw new Error("mail_queue_skip_failed");
        await writeLog({
          requestId,
          event: "email_skipped",
          status: "skipped",
          level: "info",
          queueId: r.id,
          recipientEmail: r.to_email,
          provider: result.skipped,
        });
        skipped++;
        continue;
      }

      const provider = result.provider;
      const { error: markOkError } = await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: true, p_provider: provider, p_error: "" });
      if (markOkError) {
        console.error("[mail-worker] queue:mark_sent_failed", { id: r.id, error: markOkError });
        await writeLog({
          requestId,
          level: "error",
          event: "queue_mark_sent_failed",
          status: "failed",
          queueId: r.id,
          recipientEmail: r.to_email,
          error: String(markOkError.message || markOkError),
          meta: { provider },
        });
      }
      await writeLog({
        requestId,
        event: "queue_item_sent",
        status: "sent",
        queueId: r.id,
        recipientEmail: r.to_email,
        provider,
      });
      sent++;
    } catch (e) {
      const errMsg = String((e as any)?.message || e);
      const { error: markErr } = await sbAdmin.rpc("mail_queue_mark", { p_id: r.id, p_ok: false, p_provider: "", p_error: errMsg });
      if (markErr) {
        console.error("[mail-worker] queue:mark_failed_failed", { id: r.id, error: markErr });
        await writeLog({
          requestId,
          level: "error",
          event: "queue_mark_failed_failed",
          status: "failed",
          queueId: r.id,
          recipientEmail: r.to_email,
          error: String(markErr.message || markErr),
          meta: { originalError: clampError(errMsg) },
        });
      }
      console.error("[mail-worker] queue:item_failed", { id: r.id, to: scrubEmail(r.to_email), error: errMsg });
      await writeLog({
        requestId,
        level: "error",
        event: "queue_item_failed",
        status: "failed",
        queueId: r.id,
        recipientEmail: r.to_email,
        error: errMsg,
      });
      failed++;
    }
    if (delayMs && i < (rows || []).length - 1) await sleep(delayMs);
  }

  await writeLog({
    requestId,
    level: failed ? "warn" : "info",
    event: "request_done",
    status: failed ? "partial_failed" : "ok",
    meta: { picked: (rows || []).length, sent, failed, skipped },
  });
  return json({ ok: true, picked: (rows || []).length, sent, failed, skipped });
});
