// js/pages/buzzer.js
// Przycisk A/B: wywołuje RPC buzzer_press(gameId, key, team)
// + heartbeat buzzer_hello (KROK 1.1)
// Uwaga: w tej wersji uproszczonej buzzer odblokuje się po odświeżeniu strony
// (pełne odblokowanie zrobimy w kolejnym kroku przez RPC snapshot dla buzzera).

(function () {
  const qs = new URLSearchParams(location.search);
  const gameId = qs.get("game");
  const key = qs.get("key");

  const $ = (s) => document.querySelector(s);

  const ui = {
    status: null,
    btnA: null,
    btnB: null,
    live: null,
    err: null,
  };

  let sb = null;
  let locked = false;

  function setError(msg) {
    if (ui.err) ui.err.textContent = msg || "";
  }

  function setStatus(msg) {
    if (ui.status) ui.status.textContent = msg || "";
  }

  function setLocked(on, winner) {
    locked = !!on;
    ui.btnA.disabled = locked;
    ui.btnB.disabled = locked;

    if (locked) {
      setStatus(winner ? `Zablokowane – pierwszy: ${winner}` : "Zablokowane");
    } else {
      setStatus("Gotowe – naciśnij A lub B");
    }
  }

  async function callRpc(name, params) {
    const { data, error } = await sb.rpc(name, params);
    if (error) throw error;
    return data;
  }

  async function hello() {
    try {
      await callRpc("buzzer_hello", { p_game_id: gameId, p_key: key });
    } catch (e) {
      // tu też tylko informacyjnie
      console.warn("[buzzer] buzzer_hello not available:", e?.message || e);
    }
  }

  async function press(team) {
    if (locked) return;
    try {
      setError("");
      setStatus("Wysyłam…");

      const res = await callRpc("buzzer_press", {
        p_game_id: gameId,
        p_key: key,
        p_team: team,
      });

      // res: {accepted, winner, locked}
      if (res?.accepted) {
        setLocked(true, res?.winner || team);
      } else {
        // ktoś był pierwszy
        setLocked(true, res?.winner || "?");
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd buzzera.");
      setStatus("Błąd");
    }
  }

  async function main() {
    ui.status = $(".bz-status");
    ui.btnA = $(".bz-a");
    ui.btnB = $(".bz-b");
    ui.live = $(".bz-live");
    ui.err = $(".bz-error");

    if (!gameId || !key) {
      setError("Brak parametrów URL (game/key).");
      setStatus("Błąd");
      return;
    }

    if (!window.supabaseClient) {
      setError("Brak window.supabaseClient (sprawdź auth.js).");
      setStatus("Błąd");
      return;
    }
    sb = window.supabaseClient;

    ui.btnA.addEventListener("click", () => press("A"));
    ui.btnB.addEventListener("click", () => press("B"));

    setLocked(false);
    await hello();
    setInterval(hello, 15000);

    ui.live.textContent = "Połączono";
  }

  document.addEventListener("DOMContentLoaded", () => {
    main().catch((e) => {
      console.error(e);
      const err = document.querySelector(".bz-error");
      if (err) err.textContent = e?.message || "Błąd krytyczny.";
    });
  });
})();
