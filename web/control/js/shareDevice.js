// control/js/shareDevice.js
// Sesyjne udostępnianie urządzeń z tokenem przypisanym do pojedynczego grantu.

import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-23T15341";
import { t } from "../../shared/translation/translation.js?v=v2026-10-23T15341";
import { toast, hideToast } from "../../shared/js/core/toast.js?v=v2026-10-23T15341";
import { createCooldownTicker, formatCooldownRemaining } from "../../shared/js/core/cooldown.js?v=v2026-10-23T15341";
import { shareRowEl, shareCooldownEl, shareBulkActionsEl, attachListTools } from "../../shared/js/core/share-sections.js?v=v2026-10-23T15341";
import { enterModalSheet, exitModalSheet, isSheetViewport } from "../../shared/js/core/modal-sheet.js?v=v2026-10-23T15341";

import { sendNotificationMail } from "../../shared/js/core/notify-mail.js?v=v2026-10-23T15341";


function deviceTypeLabel(type) {
  if (type === "host") return t("control.shareDeviceModal.typeHost") || "Prowadzący";
  if (type === "buzzer") return t("control.shareDeviceModal.typeBuzzer") || "Przycisk do pojedynku";
  if (type === "display") return t("control.shareDeviceModal.typeDisplay") || "Wyświetlacz";
  return type;
}

function shareErrorMessage(code) {
  const keys = {
    not_friend: "notFriend", unknown_user: "unknownUser", invalid_email: "invalidEmail",
    recipient_not_found: "unknownUser", recipient_changed: "recipientChanged",
    notifications_disabled: "recipientResigned",
    self_share: "selfShare", session_expired: "sessionExpired", gone: "sessionExpired",
  };
  return t(`control.shareDeviceModal.${keys[code] || "failed"}`);
}

// Mail z udostępnieniem urządzenia: treść i odbiorcę buduje send-mail z bazy
// (przydział powiadomienia z RPC); tu tylko token udostępnienia.
async function sendShareEmail(token) {
  return sendNotificationMail({ action: "device:share", token });
}

export function createShareDevice({ currentUser, game, onBadgesChanged }) {
  const isGuest = !currentUser || currentUser?.is_guest === true ||
    currentUser?.user_metadata?.is_guest === true || currentUser?.app_metadata?.is_guest === true;

  const overlay = document.getElementById("shareDeviceOverlay");
  const titleEl = document.getElementById("shareDeviceTitle");
  const emailInp = document.getElementById("shareDeviceEmail");
  const subsList = document.getElementById("shareDeviceSubsList");
  const bulkHost = document.getElementById("shareDeviceBulkActions");
  const btnShareFriends = document.getElementById("btnShareDeviceFriends");
  const btnAdd = document.getElementById("btnShareDeviceAdd");
  const btnClose = document.getElementById("btnShareDeviceClose");
  const btnCancel = document.getElementById("btnShareDeviceCancel");
  const friendsLabel = document.getElementById("shareDeviceFriendsLabel");
  const friendsShort = document.getElementById("shareDeviceFriendsShort");
  const currentWrap = document.getElementById("shareDeviceCurrentWrap");
  const currentCont = document.getElementById("shareDeviceCurrentContent");
  const backBtn = document.getElementById("btnBack");

  if (!overlay || isGuest) {
    return { open: () => {}, isGuest, refreshBadges: async () => ({}) };
  }
  attachListTools(bulkHost?.parentElement, subsList, "device-share-friends");
  attachListTools(currentCont?.previousElementSibling, currentCont, "device-share-shared");

  let _deviceType = null;
  let renderVersion = 0;
  let preflightVersion = 0;
  let bulkActions = null;
  const cooldownTicker = createCooldownTicker();
  cooldownTicker.start();

  function clearMessage() {
    hideToast();
  }

  function showMessage(message, { state = "info" } = {}) {
    if (message) toast(message, { kind: state });
  }

  function closeModal() {
    overlay.style.display = "none";
    exitModalSheet(overlay);
    renderVersion++;
    preflightVersion++;
    clearMessage();
  }
  btnClose?.addEventListener("click", closeModal);
  btnCancel?.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && !(overlay.classList.contains("modal--sheet") && isSheetViewport())) closeModal();
  });

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
        empty.className = "empty-state";
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
    bulkHost?.replaceChildren();
    bulkActions = shareBulkActionsEl({
      onSelectAll: () => {
        subsList.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach((input) => { input.checked = true; });
        updateSelection();
      },
      onDeselectAll: () => {
        subsList.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
        updateSelection();
      },
    });
    bulkHost?.replaceChildren(bulkActions.element);
    if (!activeFriends.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = t("control.shareDeviceModal.noFriends") || "Nie ma znajomych do udostępnienia.";
      subsList.appendChild(empty);
    }
    for (const friend of activeFriends) {
      const row = document.createElement("label");
      row.className = "shareRow shareRow--compact shareDeviceFriendRow";
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
      const { data: preflight } = await sb().rpc("control_device_share_preflight", {
        p_game_id: game.id, p_device_type: deviceType, p_recipient_user_id: friend.user_id,
      });
      const nextAllowedAtMs = preflight?.mail_disabled ? 0 : Date.parse(preflight?.cooldown_until) || 0;
      const ok = preflight?.mail_allowed !== false || preflight?.mail_disabled;
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
            const result = await doShare({ friendId: item.value });
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
    const inputs = subsList?.querySelectorAll('input[type="checkbox"]') || [];
    const selected = subsList?.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)').length || 0;
    if (btnShareFriends) btnShareFriends.disabled = !selected;
    if (friendsLabel) friendsLabel.textContent = t("control.shareDeviceModal.shareSelectedN", { n: selected });
    if (friendsShort) friendsShort.textContent = t("control.shareDeviceModal.shareSelectedShortN", { n: selected });
    bulkActions?.update(inputs);
  }

  // Dostęp powstaje niezależnie od e-maila; stan zwrotny rozróżnia wysłanie,
  // cooldown, wyłączone powiadomienia i istniejący już grant.
  async function doShare({ friendId, lookup }) {
    const { data, error } = await sb().rpc(friendId ? "control_device_share_to_friend" : "control_device_share_create_by_lookup", {
      ...(friendId ? { p_friend_id: friendId } : { p_lookup: lookup }),
      p_device_type: _deviceType,
      p_game_id: game.id,
    });
    const res = data;
    if (error || !res?.ok) throw new Error(shareErrorMessage(res?.error));

    // Grant jest unikalny dla odbiorcy, urządzenia i sesji Control.
    if (!res?.created) return "already";
    if (!res?.mail_allowed) {
      if (res?.cooldown_until) cooldownTicker.setEndMs(`device:${friendId || lookup}`, Date.parse(res.cooldown_until) || 0);
      return res?.mail_disabled ? "disabled" : false;
    }

    const queued = await sendShareEmail(res.token);
    return queued ? true : "disabled";
  }

  btnAdd?.addEventListener("click", async () => {
    clearMessage();
    const raw = String(emailInp?.value || "").trim();
    if (!raw) return;
    try {
      const mailSent = await doShare({ lookup: raw });
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
      const { data, error } = await sb().rpc("control_device_share_preflight_by_lookup", {
        p_game_id: game.id, p_device_type: _deviceType, p_lookup: raw,
      });
      if (version !== preflightVersion || error) return;
      if (!data?.ok) {
        if (data?.error === "notifications_disabled") {
          showMessage(shareErrorMessage(data.error), { state: "error" });
          if (btnAdd) btnAdd.disabled = true;
        }
        return;
      }
      if (data.already_shared) {
        showMessage(t("control.shareDeviceModal.alreadyShared") || "Tej osobie już udostępniono to urządzenie w tej sesji gry.");
        if (btnAdd) btnAdd.disabled = true;
      } else if (data.mail_disabled) {
        showMessage(t("control.shareDeviceModal.recipientDisabled") || "Odbiorca ma wyłączone powiadomienia e-mail. Dostęp zostanie nadany bez maila.");
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
    enterModalSheet(overlay, { backBtn, onClose: closeModal });
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
