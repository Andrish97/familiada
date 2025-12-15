// js/pages/host.js
// Tablet prowadzącego: tylko pytanie + timer + ukryj/pokaż.
// Publiczny dostęp przez RPC get_public_snapshot(kind='remote', key=share_key_remote)
// + heartbeat przez RPC host_hello (jeśli dodałeś KROK 1.1)

(function () {
  const qs = new URLSearchParams(location.search);
  const gameId = qs.get("game");
  const kind = qs.get("kind"); // oczekujemy "remote"
  const key = qs.get("key");

  const $ = (s) => document.querySelector(s);

  const ui = {
    btnToggle: null,
    game: null,
    phase: null,
    q: null,
    live: null,
    err: null,
    timerVal: null,
  };

  let sb = null;
  let hidden = false;
  let pollTimer = null;
  let helloTimer = null;

  function setError(msg) {
    if (ui.err) ui.err.textContent = msg || "";
  }

  async function callRpc(name, params) {
    const { data, error } = await sb.rpc(name, params);
    if (error) throw error;
    return data;
  }

  function fmtPhase(phase) {
    if (!phase) return "—";
    if (phase === "idle") return "Gotowość";
    if (phase === "round") return "Runda";
    if (phase === "final") return "Finał";
    if (phase === "ended") return "Koniec";
    return phase;
  }

  function applySnapshot(snap) {
    const g = snap?.game;
    const ls = snap?.live;
    const q = snap?.question;

    ui.game.textContent = `Gra: ${g?.name || "—"}`;
    ui.phase.textContent = `Stan: ${fmtPhase(ls?.phase)}`;
    ui.q.textContent = q?.text || "Czekam na start…";

    // timer: operator/finał – w live_state mamy timer_seconds_left
    const t = ls?.timer_running ? ls?.timer_seconds_left : ls?.timer_seconds_left;
    ui.timerVal.textContent = typeof t === "number" ? `${t}s` : "—";

    if (ls?.updated_at) {
      ui.live.textContent = `Aktualizacja: ${new Date(ls.updated_at).toLocaleTimeString()}`;
    } else {
      ui.live.textContent = "";
    }
  }

  async function poll() {
    if (!gameId || !key) return;
    try {
      const snap = await callRpc("get_public_snapshot", {
        p_game_id: gameId,
        p_kind: kind || "remote",
        p_key: key,
      });
      applySnapshot(snap);
      setError("");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd połączenia.");
    }
  }

  async function hello() {
    // opcjonalne – jeśli RPC nie istnieje, pokażemy komunikat, ale host nadal może działać (poll snapshot)
    try {
      await callRpc("host_hello", { p_game_id: gameId, p_key: key });
    } catch (e) {
      // nie spamujemy errorami, tylko raz delikatnie
      // (to jest “must-have” dla blokady startu, więc warto widzieć)
      setError("Brak RPC host_hello (dodaj w SQL KROK 1.1).");
      console.warn("[host] host_hello not available:", e?.message || e);
    }
  }

  function setHidden(on) {
    hidden = !!on;
    document.body.classList.toggle("host-hidden-mode", hidden);
    ui.btnToggle.textContent = hidden ? "POKAŻ" : "UKRYJ";
  }

  async function main() {
    ui.btnToggle = $(".host-toggle");
    ui.game = $(".host-game");
    ui.phase = $(".host-phase");
    ui.q = $(".host-question");
    ui.live = $(".host-live");
    ui.err = $(".host-error");
    ui.timerVal = $(".host-timer-val");

    if (!gameId || !key) {
      setError("Brak parametrów URL (game/key).");
      return;
    }

    if (!window.supabaseClient) {
      setError("Brak window.supabaseClient (sprawdź auth.js).");
      return;
    }
    sb = window.supabaseClient;

    ui.btnToggle.addEventListener("click", () => setHidden(!hidden));

    // od razu ping + snapshot
    await hello();
    await poll();

    // poll snapshot co 600ms (uproszczone, stabilne)
    pollTimer = setInterval(poll, 600);

    // hello co 15s (dla blokady startu)
    helloTimer = setInterval(hello, 15000);
  }

  document.addEventListener("DOMContentLoaded", () => {
    main().catch((e) => {
      console.error(e);
      const err = document.querySelector(".host-error");
      if (err) err.textContent = e?.message || "Błąd krytyczny.";
    });
  });

  window.addEventListener("beforeunload", () => {
    if (pollTimer) clearInterval(pollTimer);
    if (helloTimer) clearInterval(helloTimer);
  });
})();
