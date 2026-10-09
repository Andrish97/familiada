// control/js/shareDevice.js
// Modal "Udostępnij urządzenie" — logika 1:1 skopiowana z
// control/js/share-device.js (RPC-e/e-mail/subskrybenci to osobny,
// niezwiązany z game_state podsystem — zero powodu do przepisywania go od
// zera, ryzykowałoby to tylko subtelny dryf zachowania). JEDYNA różnica:
// stary moduł sam wiąże `addEventListener` na przyciskach-wyzwalaczach
// (btnShareDisplay/btnShareHost/btnShareBuzzer) raz, przy starcie strony —
// tu te przyciski żyją w #app, przebudowywanym przy każdym renderDevicesStep(),
// więc taki jednorazowy listener zostałby osierocony po pierwszym re-renderze.
// Zamiast tego: control/js/ui.js emituje "devices.shareOpen" przy kliknięciu
// (zwykły wzorzec tego pliku), a ten moduł wystawia open(kind) do wywołania
// z control/js/app.js's handle(). Znaczki (badge) też nie są aktualizowane
// bezpośrednio w DOM (te węzły znikają przy każdym re-renderze) — zamiast
// tego refreshBadges() zwraca zwykły obiekt {display,host,buzzer: liczba},
// który app.js dokłada do ctx.shareBadges na kolejny ui.render().

import { sb, SUPABASE_URL } from "../../shared/js/core/supabase.js?v=v2026-10-09T02365";
import { t } from "../../shared/translation/translation.js?v=v2026-10-09T02365";
import { icon } from "../../shared/js/core/icons.js?v=v2026-10-09T02365";
import { createCooldownTicker, mailCooldownCheck } from "../../shared/js/core/cooldown.js?v=v2026-10-09T02365";

const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;
const SHARE_TTL_MS = 4 * 60 * 60 * 1000;

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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

  const page = deviceType;
  const actionUrl = new URL(`/${page}?id=${gameId}&key=${shareKey}`, location.origin).href;

  const html = buildMailHtml({
    title: subject,
    body,
    actionLabel: t("control.shareDeviceModal.openDevice") || `Otwórz: ${typeLabel}`,
    actionUrl,
  });
  // cooldownActionKey/cooldownTargetKey wymagane przez trigger na mail_queue
  // (ujednolicenie cooldownów, migracja 289) -- per-akcyjny cooldown
  // (device:share) już zarezerwowało share_device (migracja 290) tuż
  // przed tym wywołaniem.
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
  const btnAdd = document.getElementById("btnShareDeviceAdd");
  const btnClose = document.getElementById("btnShareDeviceClose");
  const msgEl = document.getElementById("shareDeviceMsg");
  const currentWrap = document.getElementById("shareDeviceCurrentWrap");
  const currentCont = document.getElementById("shareDeviceCurrentContent");

  if (!overlay || isGuest) {
    return { open: () => {}, isGuest, refreshBadges: async () => ({}), expireShares: async () => {} };
  }

  let _deviceType = null;
  let renderVersion = 0;
  const cooldownTicker = createCooldownTicker();
  cooldownTicker.start();

  // target_key MUSI dokładnie odtwarzać to, co share_device (migracja 290)
  // liczy po stronie bazy -- per (owner,recipient,device_type,game), nie
  // tylko per (owner,recipient,device_type), bo inna gra = inny, potrzebny
  // link, więc NIE ma być throttlowana tym samym cooldownem.
  function deviceCooldownTarget(recipientUserId) {
    return `pair:${currentUser.id}:${recipientUserId}:device:${_deviceType}:game:${game?.id || "none"}`;
  }

  btnClose?.addEventListener("click", () => { overlay.style.display = "none"; });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });

  async function renderModal() {
    const version = ++renderVersion;
    const deviceType = _deviceType;
    if (msgEl) msgEl.textContent = "";
    cooldownTicker.resetBindings();

    const { data: shares } = await sb().rpc("list_my_device_shares");
    if (version !== renderVersion) return;
    const current = (shares || []).find((s) => s.device_type === deviceType);

    if (currentWrap && currentCont) {
      if (current) {
        currentWrap.style.display = "";
        const label = current.recipient_username || current.recipient_email || "—";
        currentCont.innerHTML = `
          <div class="shareRow">
            <div class="shareEmail">${esc(label)}</div>
            <div class="shareRowActions">
              <button class="btn xsm gold" id="btnRevokeDevice" type="button" aria-label="${esc(t("bases.share.remove"))}" title="${esc(t("bases.share.remove"))}">${icon("trash")}</button>
            </div>
          </div>`;
        document.getElementById("btnRevokeDevice")?.addEventListener("click", async () => {
          await sb().rpc("unshare_device", { p_recipient_user_id: current.recipient_id, p_device_type: _deviceType });
          await renderModal();
          await refreshBadges();
        });
        if (emailInp) emailInp.disabled = true;
        if (btnAdd) btnAdd.disabled = true;
      } else {
        currentWrap.style.display = "";
        currentCont.replaceChildren();
        const empty = document.createElement("div");
        empty.className = "share-empty-state";
        empty.textContent = t("control.shareDeviceModal.noneCurrent");
        currentCont.appendChild(empty);
        if (emailInp) emailInp.disabled = false;
        if (btnAdd) btnAdd.disabled = false;
      }
    }

    if (!subsList) return;
    const { data: subs } = await sb().rpc("polls_hub_list_my_subscribers");
    if (version !== renderVersion) return;
    const activeSubs = (subs || []).filter((r) => r.status === "active" && r.subscriber_user_id);

    if (!activeSubs.length) {
      subsList.innerHTML = `<div style="opacity:.55;font-size:.85rem;">${t("control.shareDeviceModal.noSubs") || "Brak subskrybentów."}</div>`;
    } else {
      // Podgląd cooldownu per wiersz -- bez tego operator klikałby "Dodaj"
      // nie wiedząc, że mail i tak nie poleci (dostęp i tak zostanie
      // udostępniony natychmiast, patrz doShare -- to tylko podgląd,
      // realne wymuszenie jest w samym RPC).
      const cooldownUntilBySub = new Map();
      await Promise.all(activeSubs.map(async (sub) => {
        try {
          const { ok, nextAllowedAtMs } = await mailCooldownCheck("device:share", deviceCooldownTarget(sub.subscriber_user_id));
          if (!ok && nextAllowedAtMs) cooldownUntilBySub.set(sub.subscriber_user_id, nextAllowedAtMs);
        } catch { /* nieblokujące */ }
      }));

      subsList.innerHTML = "";
      for (const sub of activeSubs) {
        const label = sub.subscriber_label || sub.subscriber_email || "—";
        const row = document.createElement("div");
        row.className = "shareRow";
        row.style.marginBottom = "8px";
        row.innerHTML = `
          <div class="shareEmail" title="${esc(sub.subscriber_email || label)}">${esc(label)}</div>
          <div class="shareRowActions">
            <span class="shareCooldownHint" style="font-size:.75rem;opacity:.7;" hidden></span>
            <button class="btn xsm" data-uid="${esc(sub.subscriber_user_id)}" data-email="${esc(sub.subscriber_email || "")}" type="button" ${current ? "disabled" : ""}>
              ${t("bases.shareModal.add") || "Dodaj"}
            </button>
          </div>`;

        const btn = row.querySelector("button");
        const hintEl = row.querySelector(".shareCooldownHint");
        if (!current) {
          cooldownTicker.bind({ key: `device:${sub.subscriber_user_id}`, labelEl: hintEl, disableEls: [btn] });
          cooldownTicker.setEndMs(`device:${sub.subscriber_user_id}`, cooldownUntilBySub.get(sub.subscriber_user_id) || 0);
        }

        btn?.addEventListener("click", async () => {
          if (msgEl) msgEl.textContent = "";
          try {
            const mailSent = await doShare(sub.subscriber_user_id, sub.subscriber_email);
            await renderModal();
            await refreshBadges();
            if (mailSent === false) {
              msgEl && (msgEl.textContent = t("control.shareDeviceModal.mailCooldown") || "Udostępniono, ale e-mail nie poszedł -- niedawno już wysłaliśmy powiadomienie dla tej gry.");
            }
          } catch (e) {
            if (msgEl) msgEl.textContent = e?.message || "Błąd.";
          }
        });
        subsList.appendChild(row);
      }
    }
  }

  // Zwraca true (mail wysłany), false (udostępnione, ale mail wstrzymany
  // cooldownem -- dostęp i tak działa natychmiast), albo undefined (nic do
  // wysłania -- np. share już istniał dla tej samej gry).
  async function doShare(userId, email) {
    const expiresAt = new Date(Date.now() + SHARE_TTL_MS).toISOString();
    const { data, error } = await sb().rpc("share_device", {
      p_recipient_user_id: userId,
      p_device_type: _deviceType,
      p_game_id: game?.id || null,
      p_game_name: game?.name || null,
      p_expires_at: expiresAt,
    });
    const res = Array.isArray(data) ? data[0] : data;
    if (error || !res?.ok) throw new Error(res?.err || "Błąd.");

    // created: nowa kombinacja (owner,recipient,device_type,GAME) -- inna
    // gra dla tego samego odbiorcy/urządzenia to ZAWSZE "created" (potrzebny
    // nowy link), patrz migracja 290. mail_allowed: to samo, ALE jeszcze
    // przefiltrowane przez cooldown device:share -- dostęp (powyższy RPC)
    // już się stał, niezależnie od tego pola.
    if (!email || !res?.created) return undefined;
    if (!res?.mail_allowed) {
      cooldownTicker.setEndMs(`device:${userId}`, Date.parse(res?.cooldown_until) || 0);
      return false;
    }

    const { data: flags } = await sb().from("user_flags").select("email_notifications").eq("user_id", userId).maybeSingle();
    if (flags?.email_notifications === false) return undefined;

    const shareKey = _deviceType === "host" ? game.share_key_host
      : _deviceType === "buzzer" ? game.share_key_buzzer
        : game.share_key_display;

    await sendShareEmail({
      to: email,
      ownerLabel: currentUser?.username || currentUser?.email || "—",
      deviceType: _deviceType,
      gameId: game.id,
      gameName: game.name,
      shareKey,
      cooldownTargetKey: deviceCooldownTarget(userId),
    });
    return true;
  }

  btnAdd?.addEventListener("click", async () => {
    if (msgEl) msgEl.textContent = "";
    const raw = String(emailInp?.value || "").trim();
    if (!raw) return;
    const profile = await resolveToUserId(raw);
    if (!profile) { if (msgEl) msgEl.textContent = t("bases.share.userNotFound") || "Nie znaleziono użytkownika."; return; }
    try {
      const mailSent = await doShare(profile.id, profile.email);
      if (emailInp) emailInp.value = "";
      await renderModal();
      await refreshBadges();
      if (mailSent === false) {
        msgEl && (msgEl.textContent = t("control.shareDeviceModal.mailCooldown") || "Udostępniono, ale e-mail nie poszedł -- niedawno już wysłaliśmy powiadomienie dla tej gry.");
      }
    } catch (e) {
      if (msgEl) msgEl.textContent = e?.message || "Błąd.";
    }
  });
  emailInp?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); btnAdd?.click(); } });

  const deviceKinds = ["display", "host", "buzzer"];

  async function open(kind) {
    if (!deviceKinds.includes(kind)) return;
    _deviceType = kind;
    if (titleEl) titleEl.textContent = `${t("control.shareDeviceModal.title") || "Udostępnij"} — ${deviceTypeLabel(kind)}`;
    if (emailInp) emailInp.value = "";
    overlay.style.display = "";
    await renderModal();
  }

  async function refreshBadges() {
    try {
      const { data } = await sb().rpc("list_my_device_shares");
      const shares = data || [];
      const badges = {};
      for (const kind of deviceKinds) badges[kind] = shares.filter((s) => s.device_type === kind).length;
      onBadgesChanged?.(badges);
      return badges;
    } catch {
      return {};
    }
  }

  async function expireShares() {
    try {
      await sb().from("shared_devices").delete().eq("owner_id", (await sb().auth.getUser()).data.user?.id);
    } catch {}
  }

  return { open, isGuest, refreshBadges, expireShares };
}
