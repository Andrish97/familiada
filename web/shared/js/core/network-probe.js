// Pomiar łącza urządzeń w trakcie gry (migracja 466, decyzja użytkownika
// 2026-10-22). Dwa czasy z tego samego urządzenia w tej samej chwili:
//   edge — GET api.familijna.app/_ping, odpowiada Worker Cloudflare bez serwera,
//   db   — RPC control2_net_ping: Cloudflare + nasz serwer + baza.
// Wolny edge = łącze urządzenia; szybki edge i wolny db = po stronie systemu.
// Zapisywane tylko: pomiar na starcie gry, początek spowolnienia i powrót do
// normy. Pomiar nigdy nie blokuje gry; karta w tle nie mierzy (przeglądarka
// dławi wtedy timery i wyniki byłyby fałszywe).
//
// Logika (classifyProbe, createNetworkMonitor) bez importów przeglądarkowych —
// testowalna w gołym Node; measureNetwork dostaje fetch i rpc z zewnątrz.

export const EDGE_SLOW_MS = 1000;
export const SERVER_SLOW_MS = 1000;
const PROBE_TIMEOUT_MS = 5000;

/** Werdykt pojedynczego pomiaru: "ok" | "device_network" | "server". */
export function classifyProbe({ edgeMs, dbMs, edgeFailed = false, dbFailed = false }) {
  // Oba nieudane: urządzenie nie dociera nawet do Cloudflare.
  if (edgeFailed && dbFailed) return "device_network";
  if (!edgeFailed && edgeMs >= EDGE_SLOW_MS) return "device_network";
  if (dbFailed) return edgeFailed ? "device_network" : "server";
  // Sam edge nieudany przy działającej bazie — przypadkowa usterka pingu.
  if (edgeFailed) return "ok";
  return dbMs - edgeMs >= SERVER_SLOW_MS ? "server" : "ok";
}

/** Informacje przeglądarki o sieci (Chrome/Android), gdy dostępne. */
export function connectionInfo(nav = globalThis.navigator) {
  const c = nav?.connection;
  if (!c) return {};
  const out = {};
  if (typeof c.effectiveType === "string") out.effective_type = c.effectiveType;
  if (typeof c.type === "string") out.connection_type = c.type;
  if (Number.isFinite(c.rtt)) out.browser_rtt_ms = c.rtt;
  if (Number.isFinite(c.downlink)) out.downlink_mbps = c.downlink;
  return out;
}

/**
 * Jeden pomiar: najpierw edge, potem db (po kolei, żeby nie konkurowały
 * o łącze). Zwraca null, gdy karta jest w tle.
 */
export async function measureNetwork({ pingUrl, rpc, fetchImpl = globalThis.fetch, now = () => performance.now(), doc = globalThis.document, nav = globalThis.navigator }) {
  if (doc?.visibilityState === "hidden") return null;
  const timed = async (run) => {
    const started = now();
    try {
      await run();
      return { ms: Math.round(now() - started), failed: false };
    } catch {
      return { ms: Math.round(now() - started), failed: true };
    }
  };
  const edge = await timed(async () => {
    const res = await fetchImpl(`${pingUrl}?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
  const db = await timed(async () => {
    const { error } = await rpc(AbortSignal.timeout(PROBE_TIMEOUT_MS));
    if (error) throw error;
  });
  return {
    edgeMs: edge.ms, dbMs: db.ms, edgeFailed: edge.failed, dbFailed: db.failed,
    online: nav?.onLine !== false, ...connectionInfo(nav),
  };
}

/**
 * Cykl pomiarów w trakcie gry.
 * @param {object} o
 * @param {() => Promise<object|null>} o.probe pomiar (measureNetwork)
 * @param {(phase: string, data: object) => void} o.send zapis zdarzenia
 * @param {number} [o.intervalMs] odstęp przy sprawnym łączu
 * @param {number} [o.incidentIntervalMs] odstęp w trakcie spowolnienia
 */
export function createNetworkMonitor({ probe, send, intervalMs = 30_000, incidentIntervalMs = 5_000, firstDelayMs = 3_000, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let running = false;
  let timer = null;
  let inFlight = false;
  let baselineSent = false;
  let incident = null;
  let okStreak = 0;
  let lastProbeAt = 0;

  const sampleData = (s, verdict) => ({
    verdict, edge_ms: s.edgeMs, db_ms: s.dbMs, edge_failed: s.edgeFailed, db_failed: s.dbFailed,
    online: s.online, effective_type: s.effective_type, connection_type: s.connection_type,
    browser_rtt_ms: s.browser_rtt_ms, downlink_mbps: s.downlink_mbps,
  });

  function schedule(ms) {
    if (!running) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => { timer = null; void tick(); }, ms);
  }

  function handle(sample) {
    const verdict = classifyProbe(sample);
    if (!baselineSent) {
      baselineSent = true;
      send("baseline", sampleData(sample, verdict));
    }
    if (verdict !== "ok") {
      okStreak = 0;
      if (!incident) {
        incident = { startedAt: now(), maxEdge: 0, maxDb: 0, samples: 0, device_network: 0, server: 0 };
        send("slow", sampleData(sample, verdict));
      }
      incident.samples += 1;
      incident[verdict] += 1;
      incident.maxEdge = Math.max(incident.maxEdge, sample.edgeMs);
      incident.maxDb = Math.max(incident.maxDb, sample.dbMs);
      return;
    }
    if (!incident) return;
    okStreak += 1;
    // Dwa kolejne dobre pomiary zamykają spowolnienie.
    if (okStreak < 2) return;
    send("recovered", {
      verdict: incident.server > incident.device_network ? "server" : "device_network",
      duration_ms: now() - incident.startedAt, samples: incident.samples,
      device_network_samples: incident.device_network, server_samples: incident.server,
      max_edge_ms: incident.maxEdge, max_db_ms: incident.maxDb,
      edge_ms: sample.edgeMs, db_ms: sample.dbMs,
    });
    incident = null;
    okStreak = 0;
  }

  async function tick() {
    if (!running || inFlight) return;
    inFlight = true;
    lastProbeAt = now();
    try {
      const sample = await probe();
      if (running && sample) handle(sample);
    } catch { /* Pomiar nigdy nie przerywa gry. */ }
    inFlight = false;
    schedule(incident ? incidentIntervalMs : intervalMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      schedule(firstDelayMs);
    },
    stop() {
      running = false;
      if (timer) clearTimer(timer);
      timer = null;
      incident = null;
      okStreak = 0;
      baselineSent = false;
    },
    // Natychmiastowy pomiar przy objawie (błąd odczytu, timeout); najwyżej
    // raz na 5 s.
    probeNow() {
      if (!running || inFlight || now() - lastProbeAt < 5_000) return;
      if (timer) clearTimer(timer);
      timer = null;
      void tick();
    },
    get incidentOpen() { return !!incident; },
  };
}
