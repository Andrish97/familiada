import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";
import { toast } from "../core/toast.js";
import { exportGameConfig, downloadJSON } from "../core/export-import.js";
import { buildUrl, copyToClipboard, showQR } from "../core/share.js";

guardDesktopOnly({ message: "Edytor Familiady jest dostępny tylko na komputerze." });

const $ = (s) => document.querySelector(s);

function qsParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

const gameId = qsParam("id");

const back = $("#back");
const logoutBtn = $("#logout");
const gameName = $("#gameName");
const sub = $("#sub");
const exportBtn = $("#export");

const qgrid = $("#qgrid");
const addQ = $("#addQ");

const liveInfo = $("#liveInfo");
const activeQ = $("#activeQ");
const setActive = $("#setActive");

const roundPoints = $("#roundPoints");
const strikes = $("#strikes");
const pMinus = $("#pMinus");
const pPlus = $("#pPlus");
const pReset = $("#pReset");
const sMinus = $("#sMinus");
const sPlus = $("#sPlus");
const sReset = $("#sReset");
const revealNext = $("#revealNext");
const hideAll = $("#hideAll");
const answersBox = $("#answers");

const linkDisplay = $("#linkDisplay");
const linkRemote = $("#linkRemote");
const linkPoll = $("#linkPoll");

const copyDisplay = $("#copyDisplay");
const copyRemote = $("#copyRemote");
const copyPoll = $("#copyPoll");

const qrDisplay = $("#qrDisplay");
const qrRemote = $("#qrRemote");
const qrPoll = $("#qrPoll");

const openDisplay = $("#openDisplay");
const openRemote = $("#openRemote");
const openPoll = $("#openPoll");

let game = null;
let questions = [];
let answersByQ = new Map();
let live = null;

async function loadAll() {
  const { data: g, error: gErr } = await sb()
    .from("games")
    .select("id,name,created_at,share_key_display,share_key_remote,share_key_poll")
    .eq("id", gameId)
    .single();
  if (gErr) throw gErr;
  game = g;

  const { data: q, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (qErr) throw qErr;
  questions = q || [];

  answersByQ = new Map();
  if (questions.length) {
    const qIds = questions.map((x) => x.id);
    const { data: a, error: aErr } = await sb()
      .from("answers")
      .select("id,question_id,ord,text,fixed_points")
      .in("question_id", qIds)
      .order("question_id", { ascending: true })
      .order("ord", { ascending: true });
    if (aErr) throw aErr;

    for (const row of a || []) {
      if (!answersByQ.has(row.question_id)) answersByQ.set(row.question_id, []);
      answersByQ.get(row.question_id).push(row);
    }
  }

  // live_state (upewnij że istnieje)
  const { data: ls, error: lsErr } = await sb()
    .from("live_state")
    .select("*")
    .eq("game_id", gameId)
    .single();
  if (lsErr) {
    const { error: insErr } = await sb().from("live_state").insert({ game_id: gameId });
    if (insErr) throw insErr;
    const { data: ls2, error: ls2Err } = await sb()
      .from("live_state")
      .select("*")
      .eq("game_id", gameId)
      .single();
    if (ls2Err) throw ls2Err;
    live = ls2;
  } else {
    live = ls;
  }
}

function renderLinks() {
  const d = buildUrl("display.html", { id: game.id, key: game.share_key_display });
  const r = buildUrl("remote.html", { id: game.id, key: game.share_key_remote });
  const p = buildUrl("poll.html", { id: game.id, key: game.share_key_poll });

  linkDisplay.value = d;
  linkRemote.value = r;
  linkPoll.value = p;

  openDisplay.href = d;
  openRemote.href = r;
  openPoll.href = p;
}

function renderQuestions() {
  qgrid.innerHTML = "";

  for (const q of questions) {
    const ans = answersByQ.get(q.id) || [];
    const preview = ans
      .slice(0, 3)
      .map((a) => `${a.text}${q.mode === "fixed" ? ` (${a.fixed_points ?? 0})` : ""}`)
      .join(" • ");

    const el = document.createElement("div");
    el.className = "q";
    el.innerHTML = `
      <div class="x" title="Usuń">✕</div>
      <div class="qt"></div>
      <div class="qm"></div>
    `;
    el.querySelector(".qt").textContent = q.text;
    el.querySelector(".qm").textContent = `${q.mode === "fixed" ? "PODANE" : "SONDAŻ"} • ${preview || "brak odpowiedzi"}`;

    el.addEventListener("click", () => openQuestionModal(q));
    el.querySelector(".x").addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmModal({
        title: "Usuń pytanie",
        text: `Na pewno usunąć pytanie: "${q.text}"?`,
        okText: "Usuń",
        cancelText: "Anuluj",
      });
      if (!ok) return;
      await sb().from("questions").delete().eq("id", q.id);
      toast("Usunięto pytanie.");
      await refresh();
    });

    qgrid.appendChild(el);
  }
}

function renderActiveSelect() {
  activeQ.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— brak —";
  activeQ.appendChild(opt0);

  for (const q of questions) {
    const opt = document.createElement("option");
    opt.value = q.id;
    opt.textContent = q.text;
    if (String(live?.active_question_id || "") === String(q.id)) opt.selected = true;
    activeQ.appendChild(opt);
  }
}

function renderLive() {
  liveInfo.textContent = `Live: ${live?.updated_at ? new Date(live.updated_at).toLocaleTimeString() : "—"}`;
  roundPoints.textContent = String(live?.round_points ?? 0);
  strikes.textContent = String(live?.strikes ?? 0);

  const qId = live?.active_question_id || null;
  const ans = qId ? (answersByQ.get(qId) || []) : [];
  const revealed = new Set((live?.revealed_answer_ids || []).map(String));

  answersBox.innerHTML = "";
  ans.forEach((a, idx) => {
    const isOn = revealed.has(String(a.id));
    const el = document.createElement("div");
    el.className = "a" + (isOn ? " revealed" : "");
    el.innerHTML = `
      <div class="t">${idx + 1}. ${a.text} ${a.fixed_points != null ? `(${a.fixed_points})` : ""}</div>
      <button class="pill" type="button">${isOn ? "Ukryj" : "Odkryj"}</button>
    `;
    el.querySelector(".pill").addEventListener("click", async () => {
      const next = new Set(revealed);
      if (isOn) next.delete(String(a.id));
      else next.add(String(a.id));
      await updateLive({ revealed_answer_ids: Array.from(next) });
    });
    answersBox.appendChild(el);
  });
}

async function updateGameName(name) {
  const { error } = await sb().from("games").update({ name }).eq("id", gameId);
  if (error) throw error;
}

async function updateLive(patch) {
  const { error } = await sb().from("live_state").update(patch).eq("game_id", gameId);
  if (error) throw error;
  const { data, error: rErr } = await sb().from("live_state").select("*").eq("game_id", gameId).single();
  if (rErr) throw rErr;
  live = data;
  renderActiveSelect();
  renderLive();
}

function firstHiddenAnswerId() {
  const qId = live?.active_question_id || null;
  if (!qId) return null;
  const ans = answersByQ.get(qId) || [];
  const revealed = new Set((live?.revealed_answer_ids || []).map(String));
  return ans.map(a => String(a.id)).find(id => !revealed.has(id)) || null;
}

async function refresh() {
  await loadAll();
  gameName.value = game.name;
  sub.textContent = `ID: ${game.id}`;
  renderLinks();
  renderQuestions();
  renderActiveSelect();
  renderLive();
}

function openQuestionModal(q) {
  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.inset = "0";
  wrap.style.background = "rgba(0,0,0,.75)";
  wrap.style.display = "grid";
  wrap.style.placeItems = "center";
  wrap.style.zIndex = "9999";

  const ans = answersByQ.get(q.id) || [];

  wrap.innerHTML = `
    <div style="width:min(820px,94vw);max-height:86vh;overflow:auto;background:#0b1226;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="font-weight:1000;letter-spacing:.12em;text-transform:uppercase;color:#ffeaa6">Edycja pytania</div>
        <button data-x style="border:none;background:transparent;color:#fff;font-size:18px;cursor:pointer">✕</button>
      </div>

      <div style="display:grid;gap:10px;margin-top:10px">
        <input data-qtext value="${escapeHtml(q.text)}" style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff;font-weight:900"/>

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="opacity:.8;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Tryb</div>
          <select data-mode style="padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff">
            <option value="fixed" ${q.mode === "fixed" ? "selected" : ""}>PODANE</option>
            <option value="poll" ${q.mode === "poll" ? "selected" : ""}>SONDAŻ</option>
          </select>
          <button data-save class="btn" style="padding:10px 12px">Zapisz</button>
          <button data-add class="btn" style="padding:10px 12px">+ Odpowiedź</button>
        </div>

        <div data-answers style="display:grid;gap:10px"></div>
      </div>
    </div>
  `;

  function close(){ wrap.remove(); }

  const box = wrap.querySelector("[data-answers]");
  const qText = wrap.querySelector("[data-qtext]");
  const modeSel = wrap.querySelector("[data-mode]");

  function renderAnswers() {
    box.innerHTML = "";
    const mode = modeSel.value;

    (answersByQ.get(q.id) || []).forEach((a) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = mode === "fixed" ? "1fr 120px 90px" : "1fr 90px";
      row.style.gap = "10px";
      row.innerHTML = `
        <input data-t value="${escapeHtml(a.text)}" style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff"/>
        ${mode === "fixed" ? `<input data-p type="number" value="${a.fixed_points ?? 0}" min="0" style="padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff"/>` : ""}
        <button data-del class="btn danger" style="padding:10px 12px">Usuń</button>
      `;

      row.querySelector("[data-del]").addEventListener("click", async () => {
        const ok = await confirmModal({ title:"Usuń odpowiedź", text:`Usunąć "${a.text}"?`, okText:"Usuń", cancelText:"Anuluj" });
        if (!ok) return;
        await sb().from("answers").delete().eq("id", a.id);
        toast("Usunięto odpowiedź.");
        await refresh();
        renderAnswers();
      });

      row.querySelector("[data-t]").addEventListener("change", (e) => { a.text = e.target.value; });
      if (mode === "fixed") {
        row.querySelector("[data-p]").addEventListener("change", (e) => { a.fixed_points = parseInt(e.target.value || "0", 10); });
      }
      box.appendChild(row);
    });
  }

  modeSel.addEventListener("change", renderAnswers);

  wrap.querySelector("[data-add]").addEventListener("click", async () => {
    const list = answersByQ.get(q.id) || [];
    const nextOrd = list.length ? Math.max(...list.map(x => x.ord)) + 1 : 0;
    const { error } = await sb().from("answers").insert({
      question_id: q.id,
      ord: nextOrd,
      text: "Nowa odpowiedź",
      fixed_points: q.mode === "fixed" ? 0 : null,
    });
    if (error) throw error;
    toast("Dodano odpowiedź.");
    await refresh();
    renderAnswers();
  });

  wrap.querySelector("[data-save]").addEventListener("click", async () => {
    const newText = qText.value.trim();
    const newMode = modeSel.value;

    if (!newText) return toast("Treść pytania nie może być pusta.");

    // zapisz pytanie
    const { error: qErr } = await sb().from("questions").update({ text: newText, mode: newMode }).eq("id", q.id);
    if (qErr) throw qErr;

    // zapisz odpowiedzi (tekst + punkty jeśli fixed)
    const list = answersByQ.get(q.id) || [];
    for (const a of list) {
      const patch = { text: a.text };
      patch.fixed_points = newMode === "fixed" ? (a.fixed_points ?? 0) : null;
      const { error: aErr } = await sb().from("answers").update(patch).eq("id", a.id);
      if (aErr) throw aErr;
    }

    toast("Zapisano.");
    await refresh();
    close();
  });

  wrap.querySelector("[data-x]").addEventListener("click", close);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });

  document.body.appendChild(wrap);
  renderAnswers();
}

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!gameId) { location.href = "builder.html"; return; }

  const u = await requireAuth("index.html");
  back.addEventListener("click", () => (location.href = "builder.html"));
  logoutBtn.addEventListener("click", async () => { await signOut(); location.href = "index.html"; });

  // autosave nazwy (debounce)
  let t = null;
  gameName.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      try {
        await updateGameName(gameName.value.trim() || "Familiada");
        toast("Nazwa zapisana.");
      } catch (e) {
        console.error(e);
        toast("Nie udało się zapisać nazwy.");
      }
    }, 450);
  });

  exportBtn.addEventListener("click", async () => {
    try {
      const cfg = await exportGameConfig(gameId);
      downloadJSON(cfg, `${(game?.name || "familiada").replaceAll(" ","_")}.json`);
      toast("Pobrano plik konfiguracji.");
    } catch (e) {
      console.error(e);
      toast("Błąd eksportu.");
    }
  });

  copyDisplay.addEventListener("click", async () => { await copyToClipboard(linkDisplay.value); toast("Skopiowano."); });
  copyRemote.addEventListener("click", async () => { await copyToClipboard(linkRemote.value); toast("Skopiowano."); });
  copyPoll.addEventListener("click", async () => { await copyToClipboard(linkPoll.value); toast("Skopiowano."); });

  qrDisplay.addEventListener("click", () => showQR({ title:"QR — Rzutnik", url: linkDisplay.value }));
  qrRemote.addEventListener("click", () => showQR({ title:"QR — Pilot", url: linkRemote.value }));
  qrPoll.addEventListener("click", () => showQR({ title:"QR — Sondaż", url: linkPoll.value }));

  addQ.addEventListener("click", async () => {
    const ord = questions.length ? Math.max(...questions.map(x => x.ord)) + 1 : 0;
    const { data: q, error } = await sb()
      .from("questions")
      .insert({ game_id: gameId, ord, text: "Nowe pytanie", mode: "fixed" })
      .select("*")
      .single();
    if (error) throw error;

    // dodaj 2 bazowe odpowiedzi
    await sb().from("answers").insert([
      { question_id: q.id, ord: 0, text: "Odpowiedź 1", fixed_points: 0 },
      { question_id: q.id, ord: 1, text: "Odpowiedź 2", fixed_points: 0 },
    ]);

    toast("Dodano pytanie.");
    await refresh();
  });

  setActive.addEventListener("click", async () => {
    const id = activeQ.value || null;
    await updateLive({ active_question_id: id, revealed_answer_ids: [], strikes: 0, round_points: 0 });
    toast("Ustawiono aktywne pytanie.");
  });

  pMinus.addEventListener("click", async () => {
    const v = (live?.round_points ?? 0) - 10;
    await updateLive({ round_points: Math.max(0, v) });
  });
  pPlus.addEventListener("click", async () => {
    const v = (live?.round_points ?? 0) + 10;
    await updateLive({ round_points: v });
  });
  pReset.addEventListener("click", async () => { await updateLive({ round_points: 0 }); });

  sMinus.addEventListener("click", async () => {
    const v = (live?.strikes ?? 0) - 1;
    await updateLive({ strikes: Math.max(0, v) });
  });
  sPlus.addEventListener("click", async () => {
    const v = (live?.strikes ?? 0) + 1;
    await updateLive({ strikes: Math.min(3, v) });
  });
  sReset.addEventListener("click", async () => { await updateLive({ strikes: 0 }); });

  revealNext.addEventListener("click", async () => {
    const id = firstHiddenAnswerId();
    if (!id) return toast("Wszystko odkryte.");
    const set = new Set((live?.revealed_answer_ids || []).map(String));
    set.add(String(id));
    await updateLive({ revealed_answer_ids: Array.from(set) });
  });
  hideAll.addEventListener("click", async () => { await updateLive({ revealed_answer_ids: [] }); });

  await refresh();
});

