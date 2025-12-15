// js/pages/control.js (module)
import { sb } from "../core/supabase.js";
import { requireAuth } from "../core/auth.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("game");

let displayWin = null;
let cachedLinks = { hostUrl: "", buzzerUrl: "" };

const el = (s) => document.querySelector(s);

const ui = {
  gameName: el(".ctl-game-name"),
  login: el(".ctl-login"),
  live: el(".ctl-live"),

  hostPill: el(".ctl-host-pill"),
  buzzerPill: el(".ctl-buzzer-pill"),
  displayPill: el(".ctl-display-pill"),

  hostLink: el(".ctl-host-link"),
  buzzerLink: el(".ctl-buzzer-link"),

  btnOpenDisplay: el(".ctl-open-display"),
  btnCopyHost: el(".ctl-copy-host"),
  btnCopyBuzzer: el(".ctl-copy-buzzer"),
  btnShowSetup: el(".ctl-show-setup"),
  btnHideSetup: el(".ctl-hide-setup"),
  btnStartGame: el(".ctl-start-game"),

  err: el(".ctl-error"),
};

function setError(msg) {
  ui.err.textContent = msg || "";
}

function pillSet(pillEl, ok, text) {
  pillEl.classList.remove("ok", "bad");
  pillEl.classList.add(ok ? "ok" : "bad");
  pillEl.textContent = text;
}

function buildLink(file, params) {
  const base = new URL(file, location.href);
  Object.entries(params).forEach(([k, v]) => base.searchParams.set(k, String(v)));
  return base.toString();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function renderQR(holderId, text) {
  const holder = document.getElementById(holderId);
  holder.innerHTML = "";
  new QRCode(holder, { text, width: 132, height: 132, correctLevel: QRCode.CorrectLevel.M });
}

function postToDisplay(msg) {
  if (!displayWin || displayWin.closed) {
    pillSet(ui.displayPill, false, "Rzutnik nieotwarty");
    return false;
  }
  displayWin.postMessage(msg, location.origin);
  pillSet(ui.displayPill, true, "Rzutnik otwarty");
  return true;
}

async function ensureLiveState(client) {
  const { data, error } = await client
    .from("live_state")
    .select("game_id")
    .eq("game_id", gameId)
    .maybeSingle();

  if (!error && data?.game_id) return;

  const ins = await client.from("live_state").insert({ game_id: gameId });
  if (ins.error) throw ins.error;
}

async function loadGame(client) {
  const { data, error } = await client
    .from("games")
    .select("id,name,share_key_display,share_key_remote,share_key_buzzer")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  return data;
}

async function readLive(client) {
  const { data, error } = await client
    .from("live_state")
    .select("*")
    .eq("game_id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function updateLive(client, patch) {
  const { error } = await client.from("live_state").update(patch).eq("game_id", gameId);
  if (error) throw error;
}

function subscribeLive(client, onChange) {
  const channel = client
    .channel(`live_state:${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      (payload) => onChange(payload.new)
    )
    .subscribe();

  return () => client.removeChannel(channel);
}

function refreshStatus(ls) {
  ui.live.textContent = ls?.updated_at
    ? `Live: ${new Date(ls.updated_at).toLocaleTimeString()}`
    : "Live: —";

  const hostOk = !!ls?.host_ready;
  const buzOk = !!ls?.buzzer_ready;

  pillSet(ui.hostPill, hostOk, hostOk ? "HOST: OK" : "HOST: BRAK");
  pillSet(ui.buzzerPill, buzOk, buzOk ? "BUZZER: OK" : "BUZZER: BRAK");

  ui.btnStartGame.disabled = !(hostOk && buzOk);
}

async function main() {
  if (!gameId) {
    setError("Brak parametru ?game=... w URL.");
    return;
  }

  // operator musi być zalogowany
  await requireAuth("index.html");
  ui.login.textContent = "Zalogowany";

  const client = sb();

  await ensureLiveState(client);
  const g = await loadGame(client);

  ui.gameName.textContent = `Gra: ${g.name}`;

  const hostUrl = buildLink("host.html", { game: g.id, kind: "remote", key: g.share_key_remote });
  const buzzerUrl = buildLink("buzzer.html", { game: g.id, kind: "buzzer", key: g.share_key_buzzer });
  const displayUrl = buildLink("display.html", { game: g.id, kind: "display", key: g.share_key_display });

  cachedLinks = { hostUrl, buzzerUrl };

  ui.hostLink.value = hostUrl;
  ui.buzzerLink.value = buzzerUrl;

  renderQR("qr-host", hostUrl);
  renderQR("qr-buzzer", buzzerUrl);

  ui.btnCopyHost.addEventListener("click", async () => {
    const ok = await copyToClipboard(hostUrl);
    setError(ok ? "Skopiowano link HOST." : "Nie udało się skopiować linku HOST.");
    setTimeout(() => setError(""), 1200);
  });

  ui.btnCopyBuzzer.addEventListener("click", async () => {
    const ok = await copyToClipboard(buzzerUrl);
    setError(ok ? "Skopiowano link BUZZER." : "Nie udało się skopiować linku BUZZER.");
    setTimeout(() => setError(""), 1200);
  });

  ui.btnOpenDisplay.addEventListener("click", () => {
    displayWin = window.open(displayUrl, "familiada_display", "noopener,noreferrer");
    pillSet(ui.displayPill, true, "Rzutnik otwarty");

    setTimeout(() => {
      postToDisplay({ type: "SETUP_LINKS", payload: cachedLinks });
    }, 300);
  });

  ui.btnShowSetup.addEventListener("click", () => {
    if (!postToDisplay({ type: "SHOW_SETUP_QR" })) setError("Najpierw otwórz ekran rzutnika.");
  });

  ui.btnHideSetup.addEventListener("click", () => {
    if (!postToDisplay({ type: "HIDE_SETUP_QR" })) setError("Najpierw otwórz ekran rzutnika.");
  });

  ui.btnStartGame.addEventListener("click", async () => {
    try {
      setError("");
      const ls = await readLive(client);
      if (!ls.host_ready || !ls.buzzer_ready) {
        setError("Nie można wystartować: HOST i BUZZER muszą być odpalone.");
        return;
      }

      await updateLive(client, {
        phase: "idle",
        round_no: 1,
        multiplier: 1,
        team_a_score: 0,
        team_b_score: 0,
        round_points: 0,
        round_sum: 0,
        strikes: 0,
        active_question_id: null,
        revealed_answer_ids: "[]",
        buzzer_locked: false,
        buzzer_winner: null,
        buzzer_at: null,
        timer_kind: "none",
        timer_seconds_left: 0,
        timer_running: false,
        timer_updated_at: null,
      });

      setError("Gra gotowa. Następny krok: start rundy (dodamy zaraz).");
      setTimeout(() => setError(""), 1600);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd startu gry.");
    }
  });

  refreshStatus(await readLive(client));
  subscribeLive(client, refreshStatus);
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    setError(e?.message || "Błąd krytyczny.");
  });
});
