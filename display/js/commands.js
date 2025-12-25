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

const normalizeAppMode = (m) => {
  const mm = (m ?? "").toString().trim().toUpperCase();
  if (mm === "BLACK") return "BLACK_SCREEN";
  if (mm === "BLACK_SCREEN") return "BLACK_SCREEN";
  if (mm === "GAME" || mm === "GAME") return "GAME";
  if (mm === "QR") return "QR";
  return mm;
};

// ⬇️ TU DODAŁEM BLANK
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

  const u = new URL(location.href);
  const key = u.searchParams.get("key") || "";

  const saveSnapshot = debounce(async (lastCmd) => {
    if (!app?.gameId || !key) return;
  
    const qrState = app.qr?.get?.() ?? {};
  
    const patch = {
      app_mode: app.mode, // BLACK_SCREEN/QR/GAME
      scene: app.scene?.api?.mode?.get?.() ?? null,
      last_cmd: String(lastCmd ?? ""),
      screen: app.scene?.api?.snapshotAll?.() ?? null,
      qr: {
        hostUrl: qrState.hostUrl ?? "",
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

  const ensureGameMode = () => {
    if (app.mode !== "GAME") app.setMode("GAME");
  };

  let commandChain = Promise.resolve();

  const runInChain = (fn, raw) => {
    // jeśli poprzednia komenda rzuciła, nie zatrzymujemy kolejki
    commandChain = commandChain
      .catch(() => {})
      .then(() => fn(raw));
    return commandChain;
  };

    return (line) => runInChain(async (raw) => {
      raw = (raw ?? "").toString().trim();
      if (!raw) return;
  
      const tokens = tokenize(raw);
      const head = (tokens[0] ?? "").toUpperCase();
  
      // APP MODE ...
      if (head === "APP" && (tokens[1] ?? "").toUpperCase() === "MODE") {
        app.setMode(normalizeAppMode(tokens[2] ?? "BLACK_SCREEN"));
        saveSnapshot(raw);
        return;
      }
  
      // MODE ...
      if (head === "MODE") {
        const arg = tokens[1] ?? "";
        const mGlobal = normalizeAppMode(arg);
  
        // global: GRA / QR / BLACK_SCREEN
        if (mGlobal === "QR" || mGlobal === "GRA" || mGlobal === "BLACK_SCREEN") {
          app.setMode(mGlobal);
          saveSnapshot(raw);
          return;
        }
  
        // scena: LOGO / ROUNDS / FINAL / WIN / BLANK
        if (isSceneBigMode(arg)) {
          ensureGameMode();
          await scene.handleCommand(raw);
          saveSnapshot(raw);
          return;
        }
  
        console.warn("[commands] Nieznany MODE:", raw);
        return;
      }
  
      // QR HOST/BUZZER ...
      if (head === "QR") {
        const hostIdx = tokens.findIndex(t => t.toUpperCase() === "HOST");
        const buzIdx  = tokens.findIndex(t => t.toUpperCase() === "BUZZER");
  
        if (hostIdx >= 0) qr.setHost(unquote(tokens[hostIdx + 1] ?? ""));
        if (buzIdx  >= 0) qr.setBuzzer(unquote(tokens[buzIdx + 1] ?? ""));
  
        app.setMode("QR");
        saveSnapshot(raw);
        return;
      }
  
      // wszystko inne → scena (GRA)
      ensureGameMode();
      await scene.handleCommand(raw);
      saveSnapshot(raw);
    }, line);
  };
};
