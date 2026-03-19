// control/js/share-device.js
// Modal udostępniania urządzeń (host/buzzer/display) subskrybentom.
// Respektuje flagę email_notifications odbiorcy.

import { sb, SUPABASE_URL } from "../../js/core/supabase.js";
import { t } from "../../translation/translation.js";

const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;
// Czas wygaśnięcia udostępnienia po zamknięciu sesji control (ms)
const SHARE_TTL_MS = 4 * 60 * 60 * 1000; // 4h

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function deviceTypeLabel(type) {
  if (type === "host") return t("control.shareDeviceModal.typeHost") || "Prowadzący";
  if (type === "buzzer") return t("control.shareDeviceModal.typeBuzzer") || "Buzzer";
  if (type === "display") return t("control.shareDeviceModal.typeDisplay") || "Wyświetlacz";
  return type;
}

async function getRecipientEmailNotifications(userId) {
  try {
    const { data } = await sb()
      .from("user_flags")
      .select("email_notifications")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.email_notifications !== false;
  } catch { return true; }
}

async function sendDeviceShareEmail({ to, ownerLabel, deviceType, gameName }) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return;

  const builderUrl = new URL("/connect-device", location.origin).href;
  const typeLabel = deviceTypeLabel(deviceType);
  const subject = t("control.shareDeviceModal.mailSubject", { type: typeLabel }) ||
    `Udostępniono urządzenie: ${typeLabel}`;
  const body = t("control.shareDeviceModal.mailBody", { owner: ownerLabel, type: typeLabel, game: gameName || "—" }) ||
    `${ownerLabel} udostępnił(a) Ci urządzenie: ${typeLabel}${gameName ? ` (gra: ${gameName})` : ""}. Otwórz stronę "Podłącz urządzenie", żeby je zobaczyć.`;

  const html = `<!doctype html><html><body style="background:#050914;color:#fff;font-family:system-ui,sans-serif;padding:24px;">
<div style="max-width:520px;margin:0 auto;">
  <div style="font-weight:900;letter-spacing:.12em;color:#ffeaa6;">FAMILIADA</div>
  <div style="margin-top:16px;padding:18px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);">
    <div style="font-size:18px;font-weight:800;color:#ffeaa6;margin-bottom:10px;">${escapeHtml(subject)}</div>
    <div style="opacity:.9;line-height:1.5;">${escapeHtml(body)}</div>
    <div style="margin-top:16px;">
      <a href="${escapeHtml(builderUrl)}" style="display:block;text-align:center;padding:12px;border-radius:12px;background:rgba(255,234,166,.1);border:1px solid rgba(255,234,166,.3);color:#ffeaa6;text-decoration:none;font-weight:800;">
        Podłącz urządzenie
      </a>
    </div>
  </div>
</div>
</body></html>`;

  await fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html }),
  }).catch(() => {});
}

export function initShareDevice({ currentUser, game }) {
  const overlay = document.getElementById("shareDeviceOverlay");
  const subsList = document.getElementById("shareDeviceSubsList");
  const btnClose = document.getElementById("btnShareDeviceClose");
  const msgEl = document.getElementById("shareDeviceMsg");
  const btnShare = document.getElementById("btnShareDevice");
  const badge = document.getElementById("shareDeviceBadge");

  if (!overlay || !btnShare) return { refreshBadge: async () => {}, expireShares: async () => {} };

  function setMsg(text) { if (msgEl) msgEl.textContent = text || ""; }

  async function refreshBadge() {
    try {
      const { data } = await sb().rpc("list_my_device_shares");
      const n = (data || []).length;
      if (badge) {
        badge.textContent = n > 0 ? (n > 99 ? "99+" : String(n)) : "";
        btnShare.classList.toggle("has-badge", n > 0);
      }
    } catch {}
  }

  // Ustaw expires_at na wszystkich aktywnych udostępnieniach tej sesji
  async function expireShares() {
    try {
      await sb().rpc("expire_my_device_shares");
    } catch {}
  }

  const DEVICE_TYPES = ["host", "buzzer", "display"];

  async function renderModal() {
    if (!subsList) return;
    subsList.innerHTML = `<div style="opacity:.6;font-size:.88rem;">${t("control.shareDeviceModal.loading") || "Ładowanie…"}</div>`;

    const [subsRes, sharesRes] = await Promise.all([
      sb().rpc("polls_hub_list_my_subscribers"),
      sb().rpc("list_my_device_shares"),
    ]);

    const subs = (subsRes.data || []).filter(r => r.status === "active" && r.subscriber_user_id);
    const shares = sharesRes.data || [];

    // Map: userId -> Set of device_types
    const sharedByUser = new Map();
    for (const s of shares) {
      if (!sharedByUser.has(s.recipient_id)) sharedByUser.set(s.recipient_id, new Set());
      sharedByUser.get(s.recipient_id).add(s.device_type);
    }

    if (!subs.length) {
      subsList.innerHTML = `<div style="opacity:.6;font-size:.88rem;">${t("control.shareDeviceModal.noSubs") || "Brak subskrybentów."}</div>`;
      return;
    }

    subsList.innerHTML = "";
    for (const sub of subs) {
      const userId = sub.subscriber_user_id;
      const label = sub.subscriber_label || sub.subscriber_email || "—";
      const sharedTypes = sharedByUser.get(userId) || new Set();

      const row = document.createElement("div");
      row.style.cssText = "display:grid;gap:6px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.1);";

      const checkboxes = DEVICE_TYPES.map(type => `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.85rem;">
          <input type="checkbox" data-type="${type}" ${sharedTypes.has(type) ? "checked" : ""}/>
          ${escapeHtml(deviceTypeLabel(type))}
        </label>
      `).join("");

      row.innerHTML = `
        <div style="font-size:.88rem;font-weight:600;">${escapeHtml(label)}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">${checkboxes}</div>
      `;

      for (const cb of row.querySelectorAll("input[type=checkbox]")) {
        cb.addEventListener("change", async () => {
          const deviceType = cb.dataset.type;
          setMsg("");
          try {
            if (cb.checked) {
              const expiresAt = new Date(Date.now() + SHARE_TTL_MS).toISOString();
              const { data, error } = await sb().rpc("share_device", {
                p_recipient_user_id: userId,
                p_device_type: deviceType,
                p_game_id: game?.id || null,
                p_game_name: game?.name || null,
                p_expires_at: expiresAt,
              });
              const res = Array.isArray(data) ? data[0] : data;
              if (error || !res?.ok) {
                cb.checked = false;
                setMsg(t("control.shareDeviceModal.failed") || "Błąd udostępniania.");
                return;
              }
              // Wyślij email tylko jeśli odbiorca ma włączone powiadomienia
              const wantsEmail = await getRecipientEmailNotifications(userId);
              if (wantsEmail && sub.subscriber_email) {
                await sendDeviceShareEmail({
                  to: sub.subscriber_email,
                  ownerLabel: currentUser?.username || currentUser?.email || "—",
                  deviceType,
                  gameName: game?.name || null,
                });
              }
            } else {
              await sb().rpc("unshare_device", {
                p_recipient_user_id: userId,
                p_device_type: deviceType,
              });
            }
            await refreshBadge();
          } catch (e) {
            cb.checked = !cb.checked;
            setMsg(e?.message || t("control.shareDeviceModal.failed") || "Błąd.");
          }
        });
      }

      subsList.appendChild(row);
    }
  }

  btnShare.addEventListener("click", async () => {
    setMsg("");
    overlay.style.display = "";
    await renderModal();
  });

  btnClose?.addEventListener("click", () => { overlay.style.display = "none"; });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });

  return { refreshBadge, expireShares };
}
