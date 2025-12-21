import { sb } from "../js/core/supabase.js";

const $ = (id) => document.getElementById(id);

const ui = {
  authPill: $("authPill"),
  btnReload: $("btnReload"),

  inGameId: $("inGameId"),
  inKey: $("inKey"),
  btnConnect: $("btnConnect"),
  connectMsg: $("connectMsg"),

  gameCard: $("gameCard"),
  gName: $("gName"),
  gId: $("gId"),
  gType: $("gType"),
  gStatus: $("gStatus"),
  gameDump: $("gameDump"),

  devicesCard: $("devicesCard"),
  dDisplay: $("dDisplay"),
  dHost: $("dHost"),
  dBuzzer: $("dBuzzer"),
  sDisplay: $("sDisplay"),
  sHost: $("sHost"),
  sBuzzer: $("sBuzzer"),
  liveMsg: $("liveMsg"),

  cmdDisplay: $("cmdDisplay"),
  cmdHost: $("cmdHost"),
  cmdBuzzer: $("cmdBuzzer"),
  sendDisplay: $("sendDisplay"),
  sendHost: $("sendHost"),
  sendBuzzer: $("sendBuzzer"),

  buzOn: $("buzOn"),
  buzOff: $("buzOff"),
  buzReset: $("buzReset"),

  logCard: $("logCard"),
  log: $("log"),
};

const st = {
  gameId: "",
  key: "",
  game: null,
  pollTimer: null,
  channels: {
    display: null,
    host: null,
    buzzer: null,
    control: null, // do BUZZER_EVT (opcjonalnie)
  },
};

function log(line) {
  ui.logCard.hidden = false;
  ui.log.textContent += `${new Date().toLocaleTimeString()}  ${line}\n`;
  ui.log.scrollTop = ui.log.scrollHeight;
}

function setPill(pillEl, status, extra = "") {
  // status: ok | bad | warn | idle
  const map = {
    ok: "● OK",
    bad: "● OFF",
    warn: "● ???",
    idle: "● …",
  };
  pillEl.textContent = `${map[status] ?? "● …"}${extra ? "  " + extra : ""}`;
}

/* ---------- URL helpers ---------- */

function readUrlParams() {
  const qs = new URLSearchParams(location.search);
  const id = qs.get("id") || "";
  const key = qs.get("key") || "";
  return { id, key };
}

function writeUrlParams(id, key) {
  const u = new URL(location.href);
  if (id) u.searchParams.set("id", id); else u.searchParams.delete("id");
  if (key) u.searchParams.set("key", key); else u.searchParams.delete("key");
  history.replaceState({}, "", u.toString());
}

/* ---------- auth indicator (tylko info) ---------- */

async function refreshAuthPill() {
  try {
    const { data } = await sb().auth.getSession();
    const has = !!data?.session?.user?.id;
    ui.authPill.textContent = has ? "auth: zalogowany" : "auth: niezalogowany";
  } catch {
    ui.authPill.textContent = "auth: ?";
  }
}

/* ---------- read game ---------- */

/**
 * Minimalnie: używamy RPC get_game_by_key(p_key).
 * To działa nawet bez logowania, bo w Twojej bazie to RPC nie sprawdza auth.uid.
 */
async function loadGameByKey({ key, idHint = "" }) {
  // 1) po kluczu
  const { data, error } = await sb().rpc("get_game_by_key", { p_key: key });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Zły key (control) albo gra nie istnieje.");

  // 2) jeśli ktoś podał id w URL i nie pasuje – pokaż ostrzeżenie, ale i tak jedź na row.id
  if (idHint && idHint !== row.id) {
    log(`Uwaga: URL id != gra z klucza. Używam id z klucza: ${row.id}`);
  }

  return row; // {id,name,type,status}
}

/**
 * Próba pobrania pytań/odpowiedzi przez SELECT.
 * Jeśli RLS zablokuje (bo control nie jest ownerem / nie jest zalogowany),
 * pokażemy tylko “game meta” i komunikat.
 */
async function tryLoadContent(gameId) {
  try {
    const { data, error } = await sb()
      .from("questions")
      .select("id,ord,text,answers(id,ord,text,fixed_points)")
      .eq("game_id", gameId)
      .order("ord", { ascending: true });

    if (error) throw error;

    // sort answers
    const fixed = (data || []).map((q) => ({
      ...q,
      answers: (q.answers || []).slice().sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0)),
    }));

    return { ok: true, data: fixed };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function renderGame(game, content) {
  ui.gameCard.hidden = false;
  ui.devicesCard.hidden = false;

  ui.gName.textContent = game.name ?? "-";
  ui.gId.textContent = game.id ?? "-";
  ui.gType.textContent = game.type ?? "-";
  ui.gStatus.textContent = game.status ?? "-";

  const dump = { game, content };
  ui.gameDump.textContent = JSON.stringify(dump, null, 2);
}

/* ---------- realtime: send commands ---------- */

function ensureChannels(gameId) {
  // display
  if (!st.channels.display) {
    st.channels.display = sb()
      .channel(`familiada-display:${gameId}`)
      .subscribe();
  }

  // host
  if (!st.channels.host) {
    st.channels.host = sb()
      .channel(`familiada-host:${gameId}`)
      .subscribe();
  }

  // buzzer
  if (!st.channels.buzzer) {
    st.channels.buzzer = sb()
      .channel(`familiada-buzzer:${gameId}`)
      .subscribe();
  }

  // control (opcjonalnie: nasłuch BUZZER_EVT)
  if (!st.channels.control) {
    st.channels.control = sb()
      .channel(`familiada-control:${gameId}`)
      .on("broadcast", { event: "BUZZER_EVT" }, (msg) => {
        const line = String(msg?.payload?.line ?? "");
        if (!line) return;
        log(`[BUZZER_EVT] ${line}`);
      })
      .subscribe();
  }
}

async function broadcast(ch, event, line) {
  await ch.send({
    type: "broadcast",
    event,
    payload: { line: String(line) },
  });
}

async function sendDisplayCmd(line) {
  ensureChannels(st.gameId);
  await broadcast(st.channels.display, "DISPLAY_CMD", line);
  log(`[DISPLAY_CMD] ${line}`);
}

async function sendHostCmd(line) {
  ensureChannels(st.gameId);
  await broadcast(st.channels.host, "HOST_CMD", line);
  log(`[HOST_CMD] ${line}`);
}

async function sendBuzzerCmd(line) {
  ensureChannels(st.gameId);
  await broadcast(st.channels.buzzer, "BUZZER_CMD", line);
  log(`[BUZZER_CMD] ${line}`);
}

/* ---------- device snapshots ---------- */

async function getDeviceSnapshot(kind) {
  const { data, error } = await sb().rpc("device_state_get", {
    p_game_id: st.gameId,
    p_kind: kind,
    p_key: st.key,
  });
  if (error) throw error;
  return data || {};
}

async function refreshDeviceSnapshots() {
  if (!st.gameId || !st.key) return;

  try {
    const [d, h, b] = await Promise.all([
      getDeviceSnapshot("display"),
      getDeviceSnapshot("host"),
      getDeviceSnapshot("buzzer"),
    ]);

    ui.sDisplay.textContent = JSON.stringify(d, null, 2);
    ui.sHost.textContent = JSON.stringify(h, null, 2);
    ui.sBuzzer.textContent = JSON.stringify(b, null, 2);

    // prosta heurystyka “czy żyje”: jeśli snapshot ma last_seen_at albo podobne pola – pokaż
    // (w migracji zrobimy spójne pola; tu tylko wstępnie)
    setPill(ui.dDisplay, "ok", "");
    setPill(ui.dHost, "ok", "");
    setPill(ui.dBuzzer, "ok", "");

    ui.liveMsg.textContent = `snapshot: ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    setPill(ui.dDisplay, "warn");
    setPill(ui.dHost, "warn");
    setPill(ui.dBuzzer, "warn");
    ui.liveMsg.textContent = `snapshot error: ${e?.message || e}`;
  }
}

/* ---------- connect flow ---------- */

async function connect() {
  const idHint = ui.inGameId.value.trim();
  const key = ui.inKey.value.trim();

  ui.connectMsg.textContent = "";
  if (!key) {
    ui.connectMsg.textContent = "Wpisz key control.";
    return;
  }

  st.key = key;

  ui.btnConnect.disabled = true;
  try {
    // 1) load game meta by key
    const game = await loadGameByKey({ key, idHint });
    st.game = game;
    st.gameId = game.id;

    // 2) try load questions/answers
    const content = await tryLoadContent(st.gameId);

    renderGame(game, content.ok ? content.data : { rls: "blocked", error: String(content.error?.message || content.error) });

    // 3) channels
    ensureChannels(st.gameId);

    // 4) snapshots polling
    if (st.pollTimer) clearInterval(st.pollTimer);
    await refreshDeviceSnapshots();
    st.pollTimer = setInterval(refreshDeviceSnapshots, 2500);

    // 5) persist URL
    writeUrlParams(st.gameId, st.key);

    ui.connectMsg.textContent = "Połączono.";
    log(`Połączono z grą: ${game.name} (${game.id})`);
    if (!content.ok) {
      log(`RLS zablokował pytania/odpowiedzi — na razie pokazuję tylko meta gry.`);
    }
  } catch (e) {
    ui.connectMsg.textContent = e?.message || String(e);
    log(`Błąd connect: ${e?.message || e}`);
  } finally {
    ui.btnConnect.disabled = false;
  }
}

/* ---------- UI events ---------- */

ui.btnConnect.addEventListener("click", connect);
ui.btnReload.addEventListener("click", async () => {
  await refreshAuthPill();
  if (st.key) connect();
});

ui.sendDisplay.addEventListener("click", () => sendDisplayCmd(ui.cmdDisplay.value));
ui.sendHost.addEventListener("click", () => sendHostCmd(ui.cmdHost.value));
ui.sendBuzzer.addEventListener("click", () => sendBuzzerCmd(ui.cmdBuzzer.value));

ui.buzOn.addEventListener("click", () => sendBuzzerCmd("ON"));
ui.buzOff.addEventListener("click", () => sendBuzzerCmd("OFF"));
ui.buzReset.addEventListener("click", () => sendBuzzerCmd("RESET"));

/* ---------- boot ---------- */

window.addEventListener("DOMContentLoaded", async () => {
  await refreshAuthPill();

  const { id, key } = readUrlParams();
  if (id) ui.inGameId.value = id;
  if (key) ui.inKey.value = key;

  if (key) connect();
});

// debug
window.__control = { st, connect, refreshDeviceSnapshots, sendDisplayCmd, sendHostCmd, sendBuzzerCmd };
