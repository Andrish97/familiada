// control/js/shareDevice.js
// Sesyjne udostępnianie urządzeń z tokenem przypisanym do pojedynczego grantu.

import { sb, SUPABASE_URL } from "../../shared/js/core/supabase.js?v=v2026-10-11T09355";
import { t } from "../../shared/translation/translation.js?v=v2026-10-11T09355";
import { icon } from "../../shared/js/core/icons.js?v=v2026-10-11T09355";
import { toast } from "../../shared/js/core/toast.js?v=v2026-10-11T09355";
import { createCooldownTicker, mailCooldownCheck } from "../../shared/js/core/cooldown.js?v=v2026-10-11T09355";

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
  let emailCountdownTimer = null;
  const cooldownTicker = createCooldownTicker();
  cooldownTicker.start();

  // Target cooldownu ma taką samą granularność jak RPC serwerowy:
  // nadawca, odbiorca, typ urządzenia i gra.
  function deviceCooldownTarget(recipientUserId) {
    return `pair:${currentUser.id}:${recipientUserId}:device:${_deviceType}:game:${game?.id || "none"}`;
  }

  function closeModal() {
    overlay.style.display = "none";
    preflightVersion++;
    if (emailCountdownTimer) clearInterval(emailCountdownTimer);
    emailCountdownTimer = null;
  }
  btnClose?.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  async function renderModal() {
    const version = ++renderVersion;
    preflightVersion++;
    const deviceType = _deviceType;
    if (msgEl) msgEl.textContent = "";
    if (emailCountdownTimer) clearInterval(emailCountdownTimer);
    emailCountdownTimer = null;
    cooldownTicker.resetBindings();

    const { data: shares } = await sb().rpc("control_device_shares_list", {
      p_game_id: game.id, p_device_type: deviceType,
    });
    if (version !== renderVersion) return;
    const current = shares || [];

    if (currentWrap && currentCont) {
      currentWrap.style.display = "";
      currentCont.replaceChildren();
      if (!current.length) {
        const empty = document.createElement("div");
        empty.className = "share-empty-state";
        empty.textContent = t("control.shareDeviceModal.noneCurrent");
        currentCont.appendChild(empty);
      }
      for (const share of current) {
        const row = document.createElement("div");
        row.className = "shareRow";
        const who = document.createElement("span");
        who.className = "shareRowLabel";
        who.textContent = share.recipient_username || share.recipient_email || "—";
        const kind = document.createElement("small");
        kind.className = "shareRowMeta";
        kind.textContent = share.recipient_kind === "friend" ? "znajomy" : share.recipient_kind === "account" ? "konto" : "mail";
        const cooldown = document.createElement("small");
        cooldown.className = "shareCooldownHint";
        cooldown.hidden = true;
        if (share.cooldown_until && Date.parse(share.cooldown_until) > Date.now()) {
          cooldownTicker.bind({ key: `shared:${share.share_id}`, labelEl: cooldown, disableEls: [] });
          cooldownTicker.setEndMs(`shared:${share.share_id}`, Date.parse(share.cooldown_until));
        }
        const revoke = document.createElement("button");
        revoke.type = "button";
        revoke.className = "btn sm danger";
        revoke.title = t("bases.share.remove") || "Cofnij udostępnienie";
        revoke.setAttribute("aria-label", revoke.title);
        revoke.innerHTML = icon("trash");
        revoke.addEventListener("click", async () => {
          const { data, error } = await sb().rpc("control_device_share_revoke", { p_share_id: share.share_id });
          if (error || !data?.ok) { if (msgEl) msgEl.textContent = error?.message || data?.error || "Błąd."; return; }
          await renderModal();
          await refreshBadges();
        });
        row.append(who, kind, cooldown, revoke);
        currentCont.appendChild(row);
      }
    }

    if (!subsList) return;
    const { data: friends } = await sb().rpc("friends_list");
    if (version !== renderVersion) return;
    const already = new Set(current.filter((s) => s.recipient_id).map((s) => s.recipient_id));
    const activeFriends = (friends || []).filter((f) => f.status === "active" && f.direction === "friend" && !already.has(f.user_id));
    subsList.replaceChildren();
    if (!activeFriends.length) {
      const empty = document.createElement("div");
      empty.className = "share-empty-state";
      empty.textContent = "Nie ma znajomych do udostępnienia.";
      subsList.appendChild(empty);
    }
    for (const friend of activeFriends) {
      const row = document.createElement("label");
      row.className = "shareRow shareDeviceFriendRow";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = friend.user_id;
      checkbox.dataset.email = friend.email || "";
      const name = document.createElement("span");
      name.className = "shareRowLabel";
      name.textContent = friend.label || friend.email || "—";
      const cooldown = document.createElement("span");
      cooldown.className = "shareCooldownHint";
      cooldown.hidden = true;
      row.append(checkbox, name, cooldown);
      subsList.appendChild(row);
      const { ok, nextAllowedAtMs } = await mailCooldownCheck("device:share", deviceCooldownTarget(friend.user_id)).catch(() => ({ ok: true }));
      if (!ok && nextAllowedAtMs) {
        cooldownTicker.bind({ key: `device:${friend.user_id}`, labelEl: cooldown, disableEls: [] });
        cooldownTicker.setEndMs(`device:${friend.user_id}`, nextAllowedAtMs);
      }
    }
    if (btnShareFriends) {
      btnShareFriends.disabled = !activeFriends.length;
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
          if (msgEl) msgEl.textContent = cooldown ? "Udostępniono. E-mail będzie dostępny po zakończeniu cooldownu." :
            disabled ? "Udostępniono. Odbiorca ma wyłączone powiadomienia e-mail." : "Udostępniono znajomym.";
        } catch (error) {
          if (msgEl) msgEl.textContent = error?.message || "Błąd.";
          btnShareFriends.disabled = false;
        }
      };
    }
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
    if (msgEl) msgEl.textContent = "";
    const raw = String(emailInp?.value || "").trim();
    if (!raw) return;
    const profile = await resolveToUserId(raw);
    const email = profile?.email || (raw.includes("@") ? raw.toLowerCase() : null);
    if (!profile && !email) { if (msgEl) msgEl.textContent = t("bases.share.userNotFound") || "Nie znaleziono użytkownika."; return; }
    try {
      const mailSent = await doShare(profile?.id || null, email);
      if (emailInp) emailInp.value = "";
      await renderModal();
      await refreshBadges();
      if (mailSent === false) {
        msgEl && (msgEl.textContent = t("control.shareDeviceModal.mailCooldown") || "Udostępniono, ale e-mail nie poszedł -- niedawno już wysłaliśmy powiadomienie dla tej gry.");
      }
      if (mailSent === "already") msgEl && (msgEl.textContent = "Tej osobie już udostępniono to urządzenie w tej sesji gry.");
      if (mailSent === "disabled") msgEl && (msgEl.textContent = "Udostępniono. Odbiorca ma wyłączone powiadomienia e-mail.");
      else if (mailSent !== false && mailSent !== "already") toast(t("control.shareDeviceModal.mailSent"));
    } catch (e) {
      if (msgEl) msgEl.textContent = e?.message || "Błąd.";
    }
  });
  emailInp?.addEventListener("input", () => {
    const version = ++preflightVersion;
    const raw = String(emailInp.value || "").trim();
    if (emailCountdownTimer) clearInterval(emailCountdownTimer);
    emailCountdownTimer = null;
    if (msgEl) msgEl.textContent = "";
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
        if (msgEl) msgEl.textContent = "Tej osobie już udostępniono to urządzenie w tej sesji gry.";
        if (btnAdd) btnAdd.disabled = true;
      } else if (data.mail_disabled) {
        if (msgEl) msgEl.textContent = "Udostępnienie będzie widoczne na koncie, ale powiadomienia e-mail są wyłączone.";
      } else if (data.mail_allowed === false && data.cooldown_until) {
        const until = Date.parse(data.cooldown_until) || 0;
        const updateCountdown = () => {
          const remaining = Math.max(0, until - Date.now());
          if (!remaining) {
            if (emailCountdownTimer) clearInterval(emailCountdownTimer);
            emailCountdownTimer = null;
            if (msgEl) msgEl.textContent = "";
            return;
          }
          if (msgEl) msgEl.textContent = `E-mail będzie można wysłać za ${Math.ceil(remaining / 60000)} min.`;
        };
        updateCountdown();
        emailCountdownTimer = setInterval(updateCountdown, 1000);
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
    overlay.style.display = "";
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
