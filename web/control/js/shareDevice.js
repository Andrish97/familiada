// control/js/shareDevice.js
// Sesyjne udostępnianie urządzeń z tokenem przypisanym do pojedynczego grantu.

import { sb, SUPABASE_URL } from "../../shared/js/core/supabase.js?v=v2026-10-11T10464";
import { t } from "../../shared/translation/translation.js?v=v2026-10-11T10464";
import { toast, TOAST_DEFAULT_MS } from "../../shared/js/core/toast.js?v=v2026-10-11T10464";
import { createCooldownTicker, formatCooldownRemaining, mailCooldownCheck } from "../../shared/js/core/cooldown.js?v=v2026-10-11T10464";
import { shareRowEl, shareCooldownEl } from "../../shared/js/core/share-sections.js?v=v2026-10-11T10464";

const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;

function deviceTypeLabel(type) {
  if (type === "host") return t("control.shareDeviceModal.typeHost") || "Prowadzący";
  if (type === "buzzer") return t("control.shareDeviceModal.typeBuzzer") || "Przycisk do pojedynku";
  if (type === "display") return t("control.shareDeviceModal.typeDisplay") || "Wyświetlacz";
  return type;
}

async function resolveToUserId(login) {
  const v = String(login || "").trim();
  if (!v) return null;
  const email = v.includes("@") ? v.toLowerCase() : String((await sb().rpc("profile_login_to_email", { p_login: v })).data || "").toLowerCase();
  if (!email) return null;
  const { data } = await sb().from("profiles").select("id,email,username").eq("email", email).maybeSingle();
  return data || null;
}

function escapeMail(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function buildMailHtml({ title, body, actionLabel, actionUrl }) {
  const inner = `
<div style="margin:0;padding:0;background:#050914;color:#ffffff;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;background:#050914;">
    <div style="padding:14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
    </div>
    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${escapeMail(title)}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${escapeMail(body)}</div>
      <div style="margin:16px 0;">
        <a href="${escapeMail(actionUrl)}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;text-transform:uppercase;">
          ${escapeMail(actionLabel)}
        </a>
      </div>
      <div style="margin-top:10px;font-size:12px;opacity:.75;word-break:break-all;">${escapeMail(actionUrl)}</div>
    </div>
  </div>
</div>`.trim();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><style>:root{color-scheme:dark;}</style></head><body style="margin:0;padding:0;background:#050914;color:#fff;">${inner}</body></html>`;
}

async function sendShareEmail({ to, ownerLabel, deviceType, gameId, gameName, shareKey, cooldownTargetKey }) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return;
  const typeLabel = deviceTypeLabel(deviceType);
  const subject = t("control.shareDeviceModal.mailSubject", { type: typeLabel }) || `Udostępniono urządzenie: ${typeLabel}`;
  const body = t("control.shareDeviceModal.mailBody", { owner: ownerLabel, type: typeLabel, game: gameName || "—" }) ||
    `${ownerLabel} udostępnił(a) Ci urządzenie: ${typeLabel}${gameName ? ` (gra: ${gameName})` : ""}.`;

  const actionUrl = new URL(`/go/?d=${deviceType}&id=${gameId}&key=${shareKey}`, location.origin).href;

  const html = buildMailHtml({
    title: subject,
    body,
    actionLabel: t("control.shareDeviceModal.openDevice") || `Otwórz: ${typeLabel}`,
    actionUrl,
  });
  // Serwerowy RPC udostępnienia zarezerwował cooldown przed kolejką.
  await fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html, cooldownActionKey: "device:share", cooldownTargetKey }),
  }).catch(() => {});
}

export function createShareDevice({ currentUser, game, onBadgesChanged }) {
  const isGuest = !currentUser || currentUser?.is_guest === true ||
    currentUser?.user_metadata?.is_guest === true || currentUser?.app_metadata?.is_guest === true;

  const overlay = document.getElementById("shareDeviceOverlay");
  const titleEl = document.getElementById("shareDeviceTitle");
  const emailInp = document.getElementById("shareDeviceEmail");
  const subsList = document.getElementById("shareDeviceSubsList");
  const btnShareFriends = document.getElementById("btnShareDeviceFriends");
  const btnAdd = document.getElementById("btnShareDeviceAdd");
  const btnClose = document.getElementById("btnShareDeviceClose");
  const msgEl = document.getElementById("shareDeviceMsg");
  const currentWrap = document.getElementById("shareDeviceCurrentWrap");
  const currentCont = document.getElementById("shareDeviceCurrentContent");

  if (!overlay || isGuest) {
    return { open: () => {}, isGuest, refreshBadges: async () => ({}) };
  }

  let _deviceType = null;
  let renderVersion = 0;
  let preflightVersion = 0;
  let messageTimer = null;
  let messageVersion = 0;
  const cooldownTicker = createCooldownTicker();
  cooldownTicker.start();

  function clearMessage() {
    messageVersion++;
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = null;
    if (msgEl) {
      msgEl.classList.remove("show");
      msgEl.hidden = true;
      msgEl.textContent = "";
    }
  }

  function showMessage(message, { duration = TOAST_DEFAULT_MS, state = "info" } = {}) {
    clearMessage();
    if (!msgEl || !message) return;
    const version = messageVersion;
    msgEl.classList.toggle("error", state === "error");
    msgEl.textContent = message;
    msgEl.hidden = false;
    requestAnimationFrame(() => { if (version === messageVersion) msgEl.classList.add("show"); });
    if (duration > 0) {
      messageTimer = setTimeout(() => {
        if (version !== messageVersion) return;
        msgEl.classList.remove("show");
        messageTimer = setTimeout(() => {
          if (version !== messageVersion) return;
          msgEl.hidden = true;
          msgEl.textContent = "";
          messageTimer = null;
        }, 220);
      }, duration);
    }
  }

  // Target cooldownu ma taką samą granularność jak RPC serwerowy:
  // nadawca, odbiorca, typ urządzenia i gra.
  function deviceCooldownTarget(recipientUserId) {
    return `pair:${currentUser.id}:${recipientUserId}:device:${_deviceType}:game:${game?.id || "none"}`;
  }

  function closeModal() {
    overlay.style.display = "none";
    renderVersion++;
    preflightVersion++;
    clearMessage();
  }
  btnClose?.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  async function renderModal() {
    const version = ++renderVersion;
    preflightVersion++;
    const deviceType = _deviceType;
    clearMessage();
    cooldownTicker.resetBindings();

    const { data: shares, error: sharesError } = await sb().rpc("control_device_shares_list", {
      p_game_id: game.id, p_device_type: deviceType,
    });
    if (version !== renderVersion) return;
    if (sharesError) {
      showMessage(t("control.shareDeviceModal.failed"), { state: "error" });
      return;
    }
    const current = shares || [];

    if (currentWrap && currentCont) {
      currentWrap.hidden = false;
      currentCont.replaceChildren();
      if (!current.length) {
        const empty = document.createElement("div");
        empty.className = "share-empty-state";
        empty.textContent = t("control.shareDeviceModal.noneCurrent");
        currentCont.appendChild(empty);
      }
      for (const share of current) {
        const revoke = async () => {
          const { data, error } = await sb().rpc("control_device_share_revoke", { p_share_id: share.share_id });
          if (error || !data?.ok) { showMessage(error?.message || data?.error || "Błąd.", { state: "error" }); return; }
          await renderModal();
          await refreshBadges();
        };
        const recipientKind = share.recipient_kind === "friend" ? "friend" : share.recipient_kind === "account" ? "account" : "mail";
        const kind = t(`control.shareDeviceModal.recipientKind.${recipientKind}`);
        const row = shareRowEl({
          label: share.recipient_username || share.recipient_email || "—",
          tags: [{ text: kind, cls: "tag--muted" }],
          actions: [{ key: "revoke", icon: "trash", title: t("bases.share.remove") || "Cofnij udostępnienie", onClick: revoke }],
        });
        row.classList.add("shareDeviceRecipientRow", "shareRow--compact");
        const { element: cooldown, labelEl: countdown } = shareCooldownEl();
        row.querySelector(".shareRowActions")?.prepend(cooldown);
        if (share.cooldown_until && Date.parse(share.cooldown_until) > Date.now()) {
          cooldownTicker.bind({ key: `shared:${share.share_id}`, labelEl: countdown, disableEls: [], onTick: (_, active) => { cooldown.hidden = !active; } });
          cooldownTicker.setEndMs(`shared:${share.share_id}`, Date.parse(share.cooldown_until));
        }
        currentCont.appendChild(row);
      }
    }

    if (!subsList) return;
    const { data: friends, error: friendsError } = await sb().rpc("friends_list");
    if (version !== renderVersion) return;
    if (friendsError) {
      subsList.replaceChildren();
      if (btnShareFriends) btnShareFriends.disabled = true;
      showMessage(t("control.shareDeviceModal.failed"), { state: "error" });
      return;
    }
    const already = new Set(current.filter((s) => s.recipient_id).map((s) => s.recipient_id));
    const activeFriends = (friends || []).filter((f) => f.status === "active" && f.direction === "friend" && !already.has(f.user_id));
    subsList.replaceChildren();
    if (!activeFriends.length) {
      const empty = document.createElement("div");
      empty.className = "share-empty-state";
      empty.textContent = t("control.shareDeviceModal.noFriends") || "Nie ma znajomych do udostępnienia.";
      subsList.appendChild(empty);
    }
    for (const friend of activeFriends) {
      const row = document.createElement("label");
      row.className = "shareRow shareDeviceFriendRow";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = friend.user_id;
      checkbox.dataset.email = friend.email || "";
      checkbox.addEventListener("change", updateSelection);
      const name = document.createElement("span");
      name.className = "shareEmail";
      name.textContent = friend.label || friend.email || "—";
      const { element: cooldown, labelEl: countdown } = shareCooldownEl();
      const main = document.createElement("div");
      main.className = "shareMain";
      main.append(name);
      row.append(checkbox, main, cooldown);
      subsList.appendChild(row);
      const { ok, nextAllowedAtMs } = await mailCooldownCheck("device:share", deviceCooldownTarget(friend.user_id)).catch(() => ({ ok: true }));
      if (version !== renderVersion) return;
      if (!ok && nextAllowedAtMs) {
        cooldownTicker.bind({ key: `device:${friend.user_id}`, labelEl: countdown, disableEls: [], onTick: (_, active) => {
          cooldown.hidden = !active;
          row.classList.toggle("is-cooling-down", active);
        } });
        cooldownTicker.setEndMs(`device:${friend.user_id}`, nextAllowedAtMs);
      }
    }
    if (btnShareFriends) {
      updateSelection();
      btnShareFriends.onclick = async () => {
        const selected = [...subsList.querySelectorAll('input[type="checkbox"]:checked')];
        if (!selected.length) return;
        btnShareFriends.disabled = true;
        try {
          let cooldown = false;
          let disabled = false;
          for (const item of selected) {
            const result = await doShare(item.value, item.dataset.email);
            cooldown ||= result === false;
            disabled ||= result === "disabled";
          }
          await renderModal();
          await refreshBadges();
          showMessage(cooldown ? (t("control.shareDeviceModal.friendMailCooldown") || "Udostępniono. E-mail będzie dostępny po zakończeniu cooldownu.") :
            disabled ? (t("control.shareDeviceModal.friendMailDisabled") || "Udostępniono. Odbiorca ma wyłączone powiadomienia e-mail.") : t("control.shareDeviceModal.mailSent"));
        } catch (error) {
          showMessage(error?.message || "Błąd.", { state: "error" });
          updateSelection();
        }
      };
    }
  }

  function updateSelection() {
    if (btnShareFriends) btnShareFriends.disabled = !subsList?.querySelector('input[type="checkbox"]:checked');
  }

  // Dostęp powstaje niezależnie od e-maila; stan zwrotny rozróżnia wysłanie,
  // cooldown, wyłączone powiadomienia i istniejący już grant.
  async function doShare(userId, email) {
    const { data, error } = await sb().rpc("control_device_share_create", {
      p_recipient_user_id: userId || null,
      p_recipient_email: userId ? null : email,
      p_device_type: _deviceType,
      p_game_id: game.id,
    });
    const res = data;
    if (error || !res?.ok) throw new Error(res?.error || "Błąd.");

    // Grant jest unikalny dla odbiorcy, urządzenia i sesji Control.
    if (!res?.created) return "already";
    if (!res?.mail_allowed) {
      if (res?.cooldown_until) cooldownTicker.setEndMs(`device:${userId || email}`, Date.parse(res.cooldown_until) || 0);
      return res?.mail_disabled ? "disabled" : false;
    }

    await sendShareEmail({
      to: email,
      ownerLabel: currentUser?.username || currentUser?.email || "—",
      deviceType: _deviceType,
      gameId: game.id,
      gameName: game.name,
      shareKey: res.token,
      cooldownTargetKey: res.cooldown_target_key,
    });
    return true;
  }

  btnAdd?.addEventListener("click", async () => {
    clearMessage();
    const raw = String(emailInp?.value || "").trim();
    if (!raw) return;
    const profile = await resolveToUserId(raw);
    const email = profile?.email || (raw.includes("@") ? raw.toLowerCase() : null);
    if (!profile && !email) { showMessage(t("bases.share.userNotFound") || "Nie znaleziono użytkownika.", { state: "error" }); return; }
    try {
      const mailSent = await doShare(profile?.id || null, email);
      if (emailInp) emailInp.value = "";
      await renderModal();
      await refreshBadges();
      if (mailSent === false) {
        showMessage(t("control.shareDeviceModal.friendMailCooldown") || "Udostępniono. E-mail będzie dostępny po zakończeniu cooldownu.");
      }
      if (mailSent === "already") showMessage(t("control.shareDeviceModal.alreadyShared") || "Tej osobie już udostępniono to urządzenie w tej sesji gry.");
      if (mailSent === "disabled") showMessage(t("control.shareDeviceModal.friendMailDisabled") || "Udostępniono. Odbiorca ma wyłączone powiadomienia e-mail.");
      else if (mailSent !== false && mailSent !== "already") toast(t("control.shareDeviceModal.mailSent"));
    } catch (e) {
      showMessage(e?.message || "Błąd.", { state: "error" });
    }
  });
  emailInp?.addEventListener("input", () => {
    const version = ++preflightVersion;
    const raw = String(emailInp.value || "").trim();
    clearMessage();
    if (btnAdd) btnAdd.disabled = false;
    if (!raw) return;
    setTimeout(async () => {
      if (version !== preflightVersion || raw !== String(emailInp.value || "").trim()) return;
      const profile = await resolveToUserId(raw);
      if (version !== preflightVersion) return;
      const email = profile?.email || (raw.includes("@") ? raw.toLowerCase() : null);
      if (!email) return;
      const { data, error } = await sb().rpc("control_device_share_preflight", {
        p_game_id: game.id, p_device_type: _deviceType,
        p_recipient_user_id: profile?.id || null, p_recipient_email: profile ? null : email,
      });
      if (version !== preflightVersion || error || !data?.ok) return;
      if (data.already_shared) {
        showMessage(t("control.shareDeviceModal.alreadyShared") || "Tej osobie już udostępniono to urządzenie w tej sesji gry.");
        if (btnAdd) btnAdd.disabled = true;
      } else if (data.mail_disabled) {
        showMessage(t("control.shareDeviceModal.recipientDisabled") || "Udostępnienie będzie widoczne na koncie, ale powiadomienia e-mail są wyłączone.");
      } else if (data.mail_allowed === false && data.cooldown_until) {
        const until = Date.parse(data.cooldown_until) || 0;
        const remaining = Math.max(0, until - Date.now());
        const time = formatCooldownRemaining(remaining);
        showMessage(t("control.shareDeviceModal.mailCooldownRemaining", { time }) || `E-mail będzie można wysłać za ${time}.`);
      }
    }, 300);
  });
  emailInp?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); btnAdd?.click(); } });

  const deviceKinds = ["display", "host", "buzzer"];

  async function open(kind) {
    if (!deviceKinds.includes(kind)) return;
    _deviceType = kind;
    if (titleEl) titleEl.textContent = `${t("control.shareDeviceModal.title") || "Udostępnij"} — ${deviceTypeLabel(kind)}`;
    if (emailInp) emailInp.value = "";
    if (btnAdd) btnAdd.disabled = false;
    overlay.style.display = "grid";
    await renderModal();
  }

  async function refreshBadges() {
    try {
      const badges = {};
      for (const kind of deviceKinds) {
        const { data } = await sb().rpc("control_device_shares_list", { p_game_id: game.id, p_device_type: kind });
        badges[kind] = (data || []).length;
      }
      onBadgesChanged?.(badges);
      return badges;
    } catch {
      return {};
    }
  }

  return { open, isGuest, refreshBadges };
}
