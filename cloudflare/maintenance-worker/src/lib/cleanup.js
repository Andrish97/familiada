// src/lib/cleanup.js -- scheduled (cron) + on-demand cleanup jobs.
import { getSupabaseConfig, supabaseRequest, supabaseRpc, summarizeSupabaseError } from "./supabase.js";

export async function cleanupExpiredAttachments(env) {
  try {
    const listRes = await supabaseRpc(env, "get_expired_attachments", {});
    if (!listRes.ok || !Array.isArray(listRes.data) || !listRes.data.length) return;
    const cfg = getSupabaseConfig(env);
    for (const att of listRes.data) {
      if (att.storage_path) {
        try {
          const storageUrl = `${cfg.baseUrl}/storage/v1/object/message-attachments/${encodeURIComponent(att.storage_path)}`;
          await fetch(storageUrl, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${cfg.serviceRoleKey}`, apikey: cfg.serviceRoleKey },
          });
        } catch (err) {
          console.error("[cron] storage delete failed:", att.storage_path, err);
        }
      }
      await supabaseRpc(env, "mark_attachment_expired", { p_id: att.id });
    }
    console.log(`[cron] expired ${listRes.data.length} attachments`);
  } catch (err) {
    console.error("[cron] cleanupExpiredAttachments failed:", err);
  }
}

export async function cleanupExpiredE2EEmails(env) {
  try {
    const before = encodeURIComponent(new Date().toISOString());
    const res = await supabaseRequest(env, `/rest/v1/e2e_emails?expires_at=lt.${before}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    if (!res.ok) console.error("[cron] e2e email cleanup failed:", summarizeSupabaseError(res));
  } catch (err) {
    console.error("[cron] cleanupExpiredE2EEmails failed:", err);
  }
}

export async function deleteAttachmentStorageFiles(env, attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return;
  const cfg = getSupabaseConfig(env);
  if (!cfg) return;
  for (const att of attachments) {
    if (!att?.storage_path) continue;
    try {
      const storageUrl = `${cfg.baseUrl}/storage/v1/object/message-attachments/${encodeURIComponent(att.storage_path)}`;
      await fetch(storageUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${cfg.serviceRoleKey}`, apikey: cfg.serviceRoleKey },
      });
    } catch (err) {
      console.error("[messages] storage delete failed:", att.storage_path, err);
    }
  }
}
