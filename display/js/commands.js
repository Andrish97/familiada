// commands.js
// Router komend tekstowych: GLOBAL (APP) + SCENA (GRA)
// Zasada: komendy globalne mają pierwszeństwo i nie trafiają do sceny.
// Komendy sceny wykonują się tylko gdy app.mode === "GRA".

const tokenize = (raw) => {
  const tokens = [];
  let i = 0;

  while (i < raw.length) {
    if (raw[i] === " ") { i++; continue; }

    if (raw[i] === '"') {
      let j = i + 1;
      while (j < raw.length && raw[j] !== '"') j++;
      tokens.push(raw.slice(i, Math.min(j + 1, raw.length)));
      i = Math.min(j + 1, raw.length);
      continue;
    }

    let j = i;
    while (j < raw.length && raw[j] !== " ") j++;
    tokens.push(raw.slice(i, j));
    i = j;
  }

  return tokens;
};

const unquote = (s) => {
  const t = (s ?? "").trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
};

export const createCommandHandler = (app) => {
  const getSceneHandler = () => {
    const sc = app?.scene;
    const fn = sc?.handleCommand;
    if (typeof fn === "function") return fn.bind(sc);
    return null;
  };

  const toGlobalMode = (mRaw) => {
    const m = (mRaw ?? "").toString().toUpperCase();

    if (m === "BLACK") return "BLACK_SCREEN";
    if (m === "BLACK_SCREEN") return "BLACK_SCREEN";
    if (m === "QR") return "QR";
    if (m === "GRA") return "GRA";

    return null;
  };

  const setModeSafe = (mode) => {
    if (!mode) return;
    app.setMode(mode);
  };

  return async (line) => {
    const raw = (line ?? "").toString().trim();
    if (!raw) return;

    const tokens = tokenize(raw);
    const head = (tokens[0] ?? "").toUpperCase();

    // 1) GLOBALNE: APP MODE ...
    if (head === "APP") {
      const op = (tokens[1] ?? "").toUpperCase();
      if (op === "MODE") {
        const gm = toGlobalMode(tokens[2]);
        if (!gm) throw new Error("APP MODE wymaga: BLACK / BLACK_SCREEN / GRA / QR");
        setModeSafe(gm);
        return;
      }
    }

    // 2) MODE: albo globalny, albo lokalny (scena)
    if (head === "MODE") {
      const gm = toGlobalMode(tokens[1]);
      if (gm) {
        setModeSafe(gm);
        return;
      }

      // nie-globalny MODE -> lokalny dla sceny, ale tylko w GRA
      if (app.mode !== "GRA") return;

      const sceneHandle = getSceneHandler();
      if (!sceneHandle) throw new Error("Brak scene.handleCommand (scena niegotowa?)");
      return sceneHandle(raw);
    }

    // 3) GLOBALNE: QR HOST ... BUZZER ...
    if (head === "QR") {
      const hostIdx = tokens.findIndex(t => t.toUpperCase() === "HOST");
      const buzIdx  = tokens.findIndex(t => t.toUpperCase() === "BUZZER");

      if (hostIdx >= 0) app.qr.setHost(unquote(tokens[hostIdx + 1] ?? ""));
      if (buzIdx  >= 0) app.qr.setBuzzer(unquote(tokens[buzIdx + 1] ?? ""));

      setModeSafe("QR");
      return;
    }

    // 4) RESZTA: tylko do sceny i tylko w GRA
    if (app.mode !== "GRA") return;

    const sceneHandle = getSceneHandler();
    if (!sceneHandle) throw new Error("Brak scene.handleCommand (scena niegotowa?)");
    return sceneHandle(raw);
  };
};
