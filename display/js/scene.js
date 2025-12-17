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
  if (mm === "GRA" || mm === "GAME") return "GRA";
  if (mm === "QR") return "QR";
  return mm;
};

export const createCommandHandler = (app) => {
  const { scene, qr } = app;

  return async (line) => {
    const raw = (line ?? "").toString().trim();
    if (!raw) return;

    const tokens = tokenize(raw);
    const head = (tokens[0] ?? "").toUpperCase();

    // GLOBAL MODE (zalecane)
    // APP MODE BLACK_SCREEN | APP MODE BLACK | APP MODE GRA | APP MODE QR
    if (head === "APP") {
      const op = (tokens[1] ?? "").toUpperCase();
      if (op === "MODE") {
        app.setMode(normalizeAppMode(tokens[2] ?? "BLACK_SCREEN"));
        return;
      }
    }

    // shortcut: MODE QR / MODE GRA / MODE BLACK
    // UWAGA: MODE LOGO/ROUNDS/FINAL/WIN to nie global, tylko do sceny.
    if (head === "MODE") {
      const m = normalizeAppMode(tokens[1] ?? "");
      if (m === "QR" || m === "GRA" || m === "BLACK_SCREEN") {
        app.setMode(m);
        return;
      }
      // inaczej: to jest komenda do dużego wyświetlacza (tylko w GRA)
      if (app.mode !== "GRA") return; // nie ruszamy sceny, gdy nie w GRA
      return scene.handleCommand(raw);
    }

    // QR: QR HOST "<url>" BUZZER "<url>"
    if (head === "QR") {
      const hostIdx = tokens.findIndex(t => t.toUpperCase() === "HOST");
      const buzIdx  = tokens.findIndex(t => t.toUpperCase() === "BUZZER");

      if (hostIdx >= 0) qr.setHost(unquote(tokens[hostIdx + 1] ?? ""));
      if (buzIdx  >= 0) qr.setBuzzer(unquote(tokens[buzIdx + 1] ?? ""));

      app.setMode("QR");
      return;
    }

    // Reszta: przekazujemy do sceny (tylko gdy GRA)
    if (app.mode !== "GRA") return;
    return scene.handleCommand(raw);
  };
};
