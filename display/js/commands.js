// commands.js
import { sb } from "../../js/core/supabase.js";

const tokenize = (raw) => {
  const tokens = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === " ") { i++; continue; }
    if (raw[i] === '"') {
      let j = i + 1;
      while (j < raw.length && raw[j] !== '"') j++;
      tokens.push(raw.slice(i, j + 1));
      i = j + 1;
    } else {
      let j = i;
      while (j < raw.length && raw[j] !== " ") j++;
      tokens.push(raw.slice(i, j));
      i = j;
    }
  }
  return tokens;
};

const unquote = (s) => {
  const t = (s ?? "").trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
};

// Normalizacja trybów globalnych APP
// Docelowe wartości: "GAME", "QR", "BLACK_SCREEN"
const normalizeAppMode = (m) => {
  const mm = (m ?? "").toString().trim().toUpperCase();
  if (mm === "BLACK")        return "BLACK_SCREEN";
  if (mm === "BLACK_SCREEN") return "BLACK_SCREEN";
  if (mm === "GRA")          return "GAME";         // alias wstecznie kompatybilny
  if (mm === "GAME")         return "GAME";
  if (mm === "QR")           return "QR";
  return mm;
};

// na razie nie używamy, ale zostawiam jako pomocniczy
const isSceneBigMode = (m) => {
  const mm = (m ?? "").toString().trim().toUpperCase();
  return (
    mm === "LOGO"   ||
    mm === "ROUNDS" ||
    mm === "FINAL"  ||
    mm === "WIN"    ||
    mm === "BLANK"
  );
};

const debounce = (fn, ms) => {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export const createCommandHandler = (app) => {
  const { scene, qr } = app;

  const u   = new URL(location.href);
  const key = u.searchParams.get("key") || "";

  const saveSnapshot = debounce(async (lastCmd) => {
    if (!app?.gameId || !key) return;

    const qrState = app.qr?.get?.() ?? {};

    const patch = {
      app_mode: app.mode,                               // GAME / QR / BLACK_SCREEN
      scene:    app.scene?.api?.mode?.get?.() ?? null,  // LOGO / ROUNDS / FINAL / WIN / BLANK
      last_cmd: String(lastCmd ?? ""),
      screen:   app.scene?.api?.snapshotAll?.() ?? null,
      qr: {
        hostUrl:   qrState.hostUrl   ?? "",
        buzzerUrl: qrState.buzzerUrl ?? "",
      },
      ts: Date.now(),
    };

    try {
      await sb().rpc("device_state_set_public", {
        p_game_id: app.gameId,
        p_device_type: "display",
        p_key: key,
        p_patch: patch,
      });
    } catch (e) {
      console.warn("[display] snapshot save failed", e);
    }
  }, 350);

  // Wszystkie komendy sceny zakładamy w trybie GAME
  const ensureGameMode = () => {
    if (app.mode !== "GAME") app.setMode("GAME");
  };

  // ===== KOLEJKA KOMEND =====
  let commandChain = Promise.resolve();

  const runInChain = (fn, raw) => {
    commandChain = commandChain
      .catch(() => {})       // jak poprzednia padła, nie blokujemy kolejki
      .then(() => fn(raw));  // wykonaj kolejną
    return commandChain;
  };

  // ===== GŁÓWNY HANDLER TEKSTU =====
  return (line) => runInChain(async (raw) => {
    raw = (raw ?? "").toString().trim();
    if (!raw) return;

    const tokens = tokenize(raw);
    const head   = (tokens[0] ?? "").toUpperCase();

    // ------------------------------------------------------------------
    // 1) APP ...  → WYŁĄCZNIE tryb globalny: APP GAME / APP QR / APP BLACK(_SCREEN)
    // ------------------------------------------------------------------
    if (head === "APP") {
      const modeArg = (tokens[1] ?? "").toUpperCase();

      // APP MODE ... jest niepoprawne zgodnie z nową specyfikacją
      if (modeArg === "MODE") {
        console.warn("[commands] Niepoprawna komenda: APP MODE ...  (użyj APP GAME / APP QR / APP BLACK)");
        return;
      }

      if (!modeArg) {
        console.warn("[commands] APP bez trybu (użyj: APP GAME / APP QR / APP BLACK)");
        return;
      }

      const m = normalizeAppMode(modeArg);
      if (m !== "GAME" && m !== "QR" && m !== "BLACK_SCREEN") {
        console.warn("[commands] Nieznany APP tryb:", raw);
        return;
      }

      app.setMode(m);
      saveSnapshot(raw);
      return;
    }

    // ------------------------------------------------------------------
    // 2) QR ...  → ustawienie linków + pozostanie / przejście w APP=QR
    //    (można wołać i z APP=QR, i z innego – zawsze skończy się w QR)
    // ------------------------------------------------------------------
    if (head === "QR") {
      const hostIdx = tokens.findIndex(t => t.toUpperCase() === "HOST");
      const buzIdx  = tokens.findIndex(t => t.toUpperCase() === "BUZZER");

      if (hostIdx >= 0) qr.setHost(unquote(tokens[hostIdx + 1] ?? ""));
      if (buzIdx  >= 0) qr.setBuzzer(unquote(tokens[buzIdx + 1] ?? ""));

      app.setMode("QR");
      saveSnapshot(raw);
      return;
    }

    // ------------------------------------------------------------------
    // 3) Wszystko inne → komendy SCENY, ale tylko w APP=GAME
    //    (tu wpada: MODE LOGO/ROUNDS/FINAL/BLANK/WIN,
    //     RTXT, RPTS, RBATCH, FL, FB, FSUMA, WIN, LOGO, INDICATOR, itp.)
    // ------------------------------------------------------------------
    ensureGameMode();
    await scene.handleCommand(raw);
    saveSnapshot(raw);
  }, line);
};
