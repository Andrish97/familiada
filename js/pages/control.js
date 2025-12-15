// js/pages/control.js
// Panel sterowania (operator) – linki/QR dla HOST i BUZZER + otwieranie RZUTNIKA
// Wymaga: window.supabaseClient (z Twojego auth.js) + QRCode (qrcodejs)

(function () {
  const qs = new URLSearchParams(location.search);
  const gameId = qs.get("game");

  let sb = null;
  let displayWin = null;

  const el = (s) => document.querySelector(s);

  const ui = {
    gameName: null,
    login: null,
    live: null,

    hostPill: null,
    buzzerPill: null,
    displayPill: null,

    hostLink: null,
    buzzerLink: null,

    btnOpenDisplay: null,
    btnCopyHost: null,
    btnCopyBuzzer: null,
    btnShowSetup: null,
    btnHideSetup: null,
    btnStartGame: null,

    err: null,
  };

  function setError(msg) {
    if (ui.err) ui.err.textContent = msg || "";
  }

  function pillSet(pillEl, ok, text) {
    if (!pillEl) return;
    pillEl.classList.remove("ok", "bad");
    pillEl.classList.add(ok ? "ok" : "bad");
    pillEl.textContent = text || (ok ? "OK" : "BRAK");
  }

  function buildLink(path, params) {
    const u = new URL(path, location.origin + location.pathname.replace(/\/[^/]*$/, "/"));
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    return u.toString();
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  function renderQR(holderId, text) {
    const holder = document.getElementById(holderId);
    if (!holder) return;
    holder.innerHTML = "";
    // qrcodejs
    new QRCode(holder, {
      text,
      width: 132,
      height: 132,
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  async function requireAuth() {
    // jeśli masz ArcadeAuth, sprawdzamy sesję
    if (window.ArcadeAuth?.getUser) {
      const user = await window.ArcadeAuth.getUser();
      if (!user) {
        location.href = "index.html";
        return null;
      }
      return user;
    }
    // jeśli nie ma ArcadeAuth – nie blokujemy, ale ostrzegamy
    return { email: "?" };
  }

  async function loadGame() {
    if (!gameId) throw new Error("Brak parametru ?game=... w URL panelu sterowania.");
    if (!sb) throw new Error("Brak supabaseClient (window.supabaseClient).");

    const { data, error } = await sb
      .from("games")
      .select("id,name,share_key_display,share_key_remote,share_key_buzzer")
      .eq("id", gameId)
      .single();

    if (error) throw error;
    return data;
  }

  async function ensureLiveState() {
    // live_state ma PK game_id; jeśli nie ma wiersza, tworzymy
    const { data, error } = await sb
      .from("live_state")
      .select("game_id")
      .eq("game_id", gameId)
      .maybeSingle();

    if (!error && data?.game_id) return true;

    const ins = await sb.from("live_state").insert({ game_id: gameId });
    if (ins.error) throw ins.error;
    return true;
  }

  async function readLiveState() {
    const { data, error } = await sb
      .from("live_state")
      .select("*")
      .eq("game_id", gameId)
      .single();

    if (error) throw error;
    return data;
  }

  async function updateLive(patch) {
    const { error } = await sb
      .from("live_state")
      .update(patch)
      .eq("game_id", gameId);

    if (error) throw error;
  }

  function subscribeLive(onChange) {
    // Realtime musi mieć włączoną replikację dla live_state w panelu Supabase
    const channel = sb
      .channel(`live_state:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
        (payload) => {
          try {
            onChange(payload.new);
          } catch (e) {
            console.error("[control] onChange error:", e);
          }
        }
      )
      .subscribe();

    return () => {
      try { sb.removeChannel(channel); } catch {}
    };
  }

  function postToDisplay(message) {
    if (!displayWin || displayWin.closed) {
      pillSet(ui.displayPill, false, "Rzutnik nieotwarty");
      return false;
    }
    displayWin.postMessage(message, location.origin);
    pillSet(ui.displayPill, true, "Rzutnik otwarty");
    return true;
  }

  function initUI() {
    ui.gameName = el(".ctl-game-name");
    ui.login = el(".ctl-login");
    ui.live = el(".ctl-live");

    ui.hostPill = el(".ctl-host-pill");
    ui.buzzerPill = el(".ctl-buzzer-pill");
    ui.displayPill = el(".ctl-display-pill");

    ui.hostLink = el(".ctl-host-link");
    ui.buzzerLink = el(".ctl-buzzer-link");

    ui.btnOpenDisplay = el(".ctl-open-display");
    ui.btnCopyHost = el(".ctl-copy-host");
    ui.btnCopyBuzzer = el(".ctl-copy-buzzer");
    ui.btnShowSetup = el(".ctl-show-setup");
    ui.btnHideSetup = el(".ctl-hide-setup");
    ui.btnStartGame = el(".ctl-start-game");

    ui.err = el(".ctl-error");
  }

  async function main() {
    initUI();
    setError("");

    const user = await requireAuth();
    if (!user) return;

    if (!window.supabaseClient) {
      setError("Brak window.supabaseClient. Sprawdź, czy auth.js go wystawia.");
      return;
    }
    sb = window.supabaseClient;

    ui.login.textContent = "Zalogowany";

    await ensureLiveState();

    const g = await loadGame();
    ui.gameName.textContent = `Gra: ${g.name}`;

    // linki
    const hostUrl = buildLink("host.html", {
      game: g.id,
      kind: "remote",
      key: g.share_key_remote,
    });

    const buzzerUrl = buildLink("buzzer.html", {
      game: g.id,
      kind: "buzzer",
      key: g.share_key_buzzer,
    });

    const displayUrl = buildLink("display.html", {
      game: g.id,
      kind: "display",
      key: g.share_key_display,
    });

    ui.hostLink.value = hostUrl;
    ui.buzzerLink.value = buzzerUrl;

    renderQR("qr-host", hostUrl);
    renderQR("qr-buzzer", buzzerUrl);

    ui.btnCopyHost.addEventListener("click", async () => {
      const ok = await copyToClipboard(hostUrl);
      setError(ok ? "Skopiowano link HOST." : "Nie udało się skopiować linku HOST.");
      setTimeout(() => setError(""), 1500);
    });

    ui.btnCopyBuzzer.addEventListener("click", async () => {
      const ok = await copyToClipboard(buzzerUrl);
      setError(ok ? "Skopiowano link BUZZER." : "Nie udało się skopiować linku BUZZER.");
      setTimeout(() => setError(""), 1500);
    });

    ui.btnOpenDisplay.addEventListener("click", () => {
      // otwieramy na tym samym komputerze
      displayWin = window.open(displayUrl, "familiada_display", "noopener,noreferrer");
      pillSet(ui.displayPill, true, "Rzutnik otwarty");
      // od razu wyślij mu setup dane (żeby mógł pokazać QR, jeśli chcesz)
      setTimeout(() => {
        postToDisplay({
          type: "SETUP_LINKS",
          payload: { hostUrl, buzzerUrl },
        });
      }, 300);
    });

    ui.btnShowSetup.addEventListener("click", () => {
      const ok = postToDisplay({ type: "SHOW_SETUP_QR" });
      if (!ok) setError("Najpierw otwórz ekran rzutnika.");
    });

    ui.btnHideSetup.addEventListener("click", () => {
      const ok = postToDisplay({ type: "HIDE_SETUP_QR" });
      if (!ok) setError("Najpierw otwórz ekran rzutnika.");
    });

    // odśwież statusy host/buzzer + blokada startu
    function refreshFromLive(ls) {
      if (!ls) return;

      ui.live.textContent = `Live: ${new Date(ls.updated_at).toLocaleTimeString()}`;

      const hostOk = !!ls.host_ready;
      const buzOk = !!ls.buzzer_ready;

      pillSet(ui.hostPill, hostOk, hostOk ? "HOST: OK" : "HOST: BRAK");
      pillSet(ui.buzzerPill, buzOk, buzOk ? "BUZZER: OK" : "BUZZER: BRAK");

      // start gry tylko gdy oba odpalone
      ui.btnStartGame.disabled = !(hostOk && buzOk);
    }

    // start gry (na razie tylko ustawia phase=idle i resetuje wyniki)
    ui.btnStartGame.addEventListener("click", async () => {
      try {
        setError("");
        const ls = await readLiveState();
        if (!ls.host_ready || !ls.buzzer_ready) {
          setError("Nie można wystartować: HOST i BUZZER muszą być odpalone.");
          return;
        }

        await updateLive({
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

        setError("Gra zresetowana i gotowa. Dalej zrobimy start rundy w kolejnym kroku.");
        setTimeout(() => setError(""), 2200);
      } catch (e) {
        console.error(e);
        setError(e?.message || "Błąd startu gry.");
      }
    });

    // stan początkowy
    refreshFromLive(await readLiveState());
    subscribeLive(refreshFromLive);
  }

  document.addEventListener("DOMContentLoaded", () => {
    main().catch((e) => {
      console.error(e);
      const box = document.querySelector(".ctl-error");
      if (box) box.textContent = e?.message || "Błąd krytyczny.";
    });
  });
})();
