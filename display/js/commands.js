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

const parseAnim = (tokens, startIdx) => {
  const type = (tokens[startIdx] ?? "").toLowerCase();
  const dirOrAxis = (tokens[startIdx + 1] ?? "").toLowerCase();
  const ms = parseInt(tokens[startIdx + 2] ?? "10", 10);

  if (type === "edge")   return { type:"edge", dir: dirOrAxis || "left", ms: isFinite(ms) ? ms : 10 };
  if (type === "matrix") return { type:"matrix", axis: dirOrAxis || "down", ms: isFinite(ms) ? ms : 18 };
  return null;
};

export const createCommandHandler = (app) => {
  const { scene, qr } = app;

  return async (line) => {
    const raw = (line ?? "").toString().trim();
    if (!raw) return;

    const tokens = tokenize(raw);
    const head = (tokens[0] ?? "").toUpperCase();

    // GLOBAL MODE
    if (head === "APP") {
      // APP MODE QR / APP MODE GRA
      const op = (tokens[1] ?? "").toUpperCase();
      if (op === "MODE") {
        app.setMode(tokens[2] ?? "GRA");
        return;
      }
    }

    // shortcut: MODE QR / MODE GRA (globalne)
    if (head === "MODE") {
      const m = (tokens[1] ?? "").toUpperCase();
      if (m === "QR" || m === "GRA") { app.setMode(m); return; }
      // inaczej: to jest tryb dużego wyświetlacza w grze
      return scene.handleCommand(raw); // jeśli chcesz zachować stary handler w scenie
    }

    // QR: QR HOST "<url>" BUZZER "<url>"
    if (head === "QR") {
      const hostIdx = tokens.findIndex(t => t.toUpperCase() === "HOST");
      const buzIdx  = tokens.findIndex(t => t.toUpperCase() === "BUZZER");

      if (hostIdx >= 0) qr.setHost(unquote(tokens[hostIdx + 1] ?? ""));
      if (buzIdx  >= 0) qr.setBuzzer(unquote(tokens[buzIdx + 1] ?? ""));

      // auto przełącz na QR jeśli są linki
      app.setMode("QR");
      return;
    }

    // Reszta: przekazujemy do sceny (GRA)
    return scene.handleCommand(raw);
  };
};
