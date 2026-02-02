// js/pages/editor.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { parseQaText, clip as clipN } from "../core/text-import.js";
import { canEnterEdit, RULES as GV_RULES, TYPES } from "../core/game-validate.js";

/* ================= Rules (z game-validate) ================= */
const QN_MIN = GV_RULES.QN_MIN; // 10
const AN_MIN = GV_RULES.AN_MIN; // 3
const AN_MAX = GV_RULES.AN_MAX; // 6
const SUM_PREPARED = GV_RULES.SUM_PREPARED ?? 100;

/* ================= DOM helpers ================= */
const $ = (id) => document.getElementById(id);

function setMsg(t) {
  const el = $("msg");
  if (el) el.textContent = t || "";
}

function openOverlay(id, on) {
  const el = $(id);
  if (!el) return;
  el.style.display = on ? "grid" : "none";
}

function debounce(fn, ms = 350) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function getIdFromQuery() {
  return new URLSearchParams(location.search).get("id");
}

/* ================= Normalizers ================= */
const clip17 = (s) => clipN(String(s ?? ""), 17);
const normQ = (s) => String(s ?? "").trim().slice(0, 200);
const normName = (s) => (String(s ?? "Nowa Familiada").trim() || "Nowa Familiada").slice(0, 80);

function normalizeIntLoose(v, fallback = 0) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}
function nonNegativeInt(v, fallback = 0) {
  const n = normalizeIntLoose(v, fallback);
  return Math.max(0, n);
}

/* ================= Enter = blur (global) ================= */
function wireEnterAsBlur() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    const el = e.target;
    if (!(el instanceof HTMLElement)) return;

    if (el.tagName === "TEXTAREA") return;

    if (el.tagName === "INPUT" || el.tagName === "SELECT") {
      e.preventDefault();
      el.blur();
    }
  });
}

/* ================= DB ================= */
async function loadGame(gameId) {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,poll_opened_at,poll_closed_at")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function saveGameName(gameId, name) {
  const { error } = await sb().from("games").update({ name: normName(name) }).eq("id", gameId);
  if (error) throw error;
}

async function listQuestions(gameId) {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listAnswers(questionId) {
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", questionId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function createQuestion(gameId, ord) {
  const { data, error } = await sb()
    .from("questions")
    .insert({ game_id: gameId, ord, text: `Pytanie ${ord}` })
    .select("id,ord,text")
    .single();
  if (error) throw error;
  return data;
}

async function updateQuestion(qId, patch) {
  const { error } = await sb().from("questions").update(patch).eq("id", qId);
  if (error) throw error;
}

async function deleteQuestionDeep(qId) {
  const { error: aErr } = await sb().from("answers").delete().eq("question_id", qId);
  if (aErr) throw aErr;

  const { error: qErr } = await sb().from("questions").delete().eq("id", qId);
  if (qErr) throw qErr;
}

async function createAnswer(questionId, ord, text, fixed_points) {
  const safeText = (clip17(text || `ODP ${ord}`) || `ODP ${ord}`).trim() || `ODP ${ord}`;
  const safePts = nonNegativeInt(fixed_points, 0);

  const { data, error } = await sb()
    .from("answers")
    .insert({ question_id: questionId, ord, text: safeText, fixed_points: safePts })
    .select("id,ord,text,fixed_points")
    .single();
  if (error) throw error;
  return data;
}

async function updateAnswer(aId, patch) {
  const { error } = await sb().from("answers").update(patch).eq("id", aId);
  if (error) throw error;
}

async function deleteAnswer(aId) {
  const { error } = await sb().from("answers").delete().eq("id", aId);
  if (error) throw error;
}

async function resetPollForEditing(gameId) {
  const { error: gErr } = await sb()
    .from("games")
    .update({ status: "draft", poll_opened_at: null, poll_closed_at: null })
    .eq("id", gameId);
  if (gErr) throw gErr;

  const { data: qs, error: qErr } = await sb().from("questions").select("id").eq("game_id", gameId);
  if (qErr) throw qErr;

  const qIds = (qs || []).map((x) => x.id);
  if (!qIds.length) return;

  const { error: aErr } = await sb().from("answers").update({ fixed_points: 0 }).in("question_id", qIds);
  if (aErr) throw aErr;
}

/* ================= Renumber / wipe ================= */
async function renumberQuestions(gameId) {
  const qs = await listQuestions(gameId);
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const want = i + 1;
    if (Number(q.ord) === want) continue;
    await updateQuestion(q.id, { ord: want });
  }
  return await listQuestions(gameId);
}

async function wipeGameContent(gameId) {
  const qs = await listQuestions(gameId);
  const qIds = qs.map((q) => q.id);

  if (qIds.length) {
    const { error: aErr } = await sb().from("answers").delete().in("question_id", qIds);
    if (aErr) throw aErr;

    const { error: qErr } = await sb().from("questions").delete().eq("game_id", gameId);
    if (qErr) throw qErr;
  }
}

/* ================= ord helpers ================= */
function nextQuestionOrd(questions) {
  let max = 0;
  for (const q of questions || []) max = Math.max(max, Number(q.ord) || 0);
  return max + 1;
}

function nextAnswerOrd(answers) {
  const used = new Set((answers || []).map((a) => a.ord));
  for (let i = 1; i <= AN_MAX; i++) if (!used.has(i)) return i;
  return null;
}

/* ================= UI config by type ================= */
function cfgFromGameType(type) {
  if (type === TYPES.POLL_TEXT) {
    return {
      type,
      title: "Edytor — Typowy sondaż",
      hintTop: `Podpowiedź: zalecamy nie mniej niż ${QN_MIN} pytań.`,
      hintBottom: "W tym trybie edytujesz tylko pytania. Odpowiedzi wpiszą uczestnicy sondażu.",
      allowAnswers: false,
      allowPoints: false,
      ignoreImportPoints: true,
    };
  }
  if (type === TYPES.POLL_POINTS) {
    return {
      type,
      title: "Edytor — Punktacja odpowiedzi",
      hintTop: `Podpowiedź: zalecamy nie mniej niż ${QN_MIN} pytań. W pytaniu zalecane ${AN_MIN}–${AN_MAX} odpowiedzi.`,
      hintBottom: "Punkty policzą się po zamknięciu sondażu. W edytorze nie ustawiasz punktów.",
      allowAnswers: true,
      allowPoints: false,
      ignoreImportPoints: true,
    };
  }
  return {
    type,
    title: "Edytor — Preparowany",
    hintTop: `Podpowiedź: zalecamy nie mniej niż ${QN_MIN} pytań. W pytaniu wymagane ${AN_MIN}–${AN_MAX} odpowiedzi.`,
    hintBottom: `W tym trybie ustawiasz punkty ręcznie. Suma w pytaniu nie może przekroczyć ${SUM_PREPARED}.`,
    allowAnswers: true,
    allowPoints: true,
    ignoreImportPoints: false,
  };
}

/* ================= Points UI (prepared) ================= */
function sumPointsFromDom(container) {
  const inputs = container.querySelectorAll("input.aPts");
  let sum = 0;
  inputs.forEach((inp) => (sum += nonNegativeInt(inp.value, 0)));
  return sum;
}

function makeRemainBox(sum) {
  const el = document.createElement("div");
  el.className = "remainBox";
  el.style.marginBottom = "10px";

  // 0–100: neutralny wygląd (bez klasy)
  // >100: ostrzeżenie (czerwone, klasa "over")
  if (sum > SUM_PREPARED) el.classList.add("over");

  el.innerHTML = `<span>SUMA</span><b>${sum}/${SUM_PREPARED}</b>`;

  return el;
}

function updateRemainBox(container) {
  const box = container.querySelector(".remainBox");
  if (!box) return;

  const sum = sumPointsFromDom(container);

  box.classList.remove("ok", "over");
  if (sum > SUM_PREPARED) box.classList.add("over");

  box.innerHTML = `<span>SUMA</span><b>${sum}/${SUM_PREPARED}</b>`;
}

/* ================= TXT Import Progress (TEN SAM MODAL) ================= */
function ensureTxtImportProgressInPlace() {
  const ov = document.getElementById("txtImportOverlay");
  if (!ov) return null;

  const modal = ov.querySelector(".modal");
  if (!modal) return null;

  // 1) Wrapper na "normalną" zawartość modala (wszystko poza .mTitle i pierwszym .mSub)
  let formWrap = modal.querySelector("#txtImportFormWrap");
  if (!formWrap) {
    formWrap = document.createElement("div");
    formWrap.id = "txtImportFormWrap";

    const title = modal.querySelector(".mTitle");
    const sub = modal.querySelector(".mSub"); // pierwszy .mSub (opis formatu)

    const keep = new Set();
    if (title) keep.add(title);
    if (sub) keep.add(sub);

    const toMove = [];
    for (const child of Array.from(modal.children)) {
      if (keep.has(child)) continue;
      if (child.id === "txtImportFormWrap") continue;
      if (child.id === "txtImportProgressWrap") continue;
      toMove.push(child);
    }
    toMove.forEach((el) => formWrap.appendChild(el));

    // wstaw po sub (jeśli jest), w przeciwnym razie na koniec
    if (sub && sub.nextSibling) modal.insertBefore(formWrap, sub.nextSibling);
    else modal.appendChild(formWrap);
  }

  // 2) Wrapper progressu (ukryty domyślnie)
  let progWrap = modal.querySelector("#txtImportProgressWrap");
  if (!progWrap) {
    progWrap = document.createElement("div");
    progWrap.id = "txtImportProgressWrap";
    progWrap.style.display = "none";
    progWrap.style.marginTop = "12px";

    progWrap.innerHTML = `
      <div style="display:grid;gap:10px">
        <div class="importRow" style="align-items:center">
          <div id="txtImportProgStep" style="font-weight:800;letter-spacing:.04em">—</div>
          <div id="txtImportProgCount" style="margin-left:auto;opacity:.8">0/0</div>
        </div>

        <div style="height:10px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden">
          <div id="txtImportProgBar" style="height:100%;width:0%;background:rgba(255,255,255,.85)"></div>
        </div>

        <div class="importMsg" id="txtImportProgMsg" style="min-height:18px"></div>

        <div class="importRow" style="justify-content:flex-end;gap:10px">
          <button class="btn sm" id="txtImportProgClose" type="button" style="display:none">Zamknij</button>
        </div>
      </div>
    `;

    modal.appendChild(progWrap);

    // Close pokazujemy tylko przy błędzie (albo jak chcesz też po sukcesie)
    progWrap.querySelector("#txtImportProgClose")?.addEventListener("click", () => {
      showTxtImportProgress(false);
      openOverlay("txtImportOverlay", false);
    });
  }

  // 3) blokada klików w overlay (żeby nie dało się "kliknąć obok" w czasie importu)
  if (!ov.__txtImportBlockClicks) {
    ov.addEventListener("click", (e) => {
      // klik w tło overlay może zamykać TYLKO gdy nie importujemy
      if (e.target?.id === "txtImportOverlay" && !ov.__txtImportRunning) {
        openOverlay("txtImportOverlay", false);
      }
    });
    ov.__txtImportBlockClicks = true;
  }

  return { ov, modal, formWrap, progWrap };
}

function showTxtImportProgress(on) {
  const ref = ensureTxtImportProgressInPlace();
  if (!ref) return;

  const { ov, formWrap, progWrap } = ref;

  ov.__txtImportRunning = !!on;

  if (formWrap) formWrap.style.display = on ? "none" : "";
  if (progWrap) progWrap.style.display = on ? "" : "none";

  // podczas importu chowamy standardowy komunikat txtMsg (bo i tak pokazujemy prog msg)
  const txtMsg = document.getElementById("txtMsg");
  if (txtMsg) txtMsg.style.display = on ? "none" : "";

  // twarda blokada przycisków formy (na wszelki wypadek)
  const btnClose = document.getElementById("btnTxtClose");
  const btnImport = document.getElementById("btnTxtImport");
  const btnLoad = document.getElementById("btnTxtLoadFile");
  const file = document.getElementById("txtFile");
  const ta = document.getElementById("txtTa");

  const dis = !!on;
  if (btnClose) btnClose.disabled = dis;
  if (btnImport) btnImport.disabled = dis;
  if (btnLoad) btnLoad.disabled = dis;
  if (file) file.disabled = dis;
  if (ta) ta.disabled = dis;
}

function setTxtImportProgress({ step, i, n, msg, isError } = {}) {
  const stepEl = document.getElementById("txtImportProgStep");
  const countEl = document.getElementById("txtImportProgCount");
  const barEl = document.getElementById("txtImportProgBar");
  const msgEl = document.getElementById("txtImportProgMsg");
  const closeEl = document.getElementById("txtImportProgClose");

  if (stepEl && step != null) stepEl.textContent = String(step);
  if (countEl) countEl.textContent = `${i || 0}/${n || 0}`;

  const nn = Number(n) || 0;
  const ii = Number(i) || 0;
  const pct = nn > 0 ? Math.round((ii / nn) * 100) : 0;
  if (barEl) barEl.style.width = `${pct}%`;

  if (msgEl) {
    msgEl.textContent = msg || "";
    msgEl.style.opacity = isError ? "1" : ".85";
  }

  // przy błędzie pokazujemy "Zamknij"
  if (closeEl) closeEl.style.display = isError ? "" : "none";
}

/* ================= Boot ================= */
async function boot() {
  /* ---------- auth/topbar ---------- */
  const user = await requireAuth("index.html");
  const who = $("who");
  if (who) who.textContent = user?.username || user?.email || "—";

  $("btnLogout")?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  $("btnBack")?.addEventListener("click", () => {
    location.href = "builder.html";
  });

  wireEnterAsBlur();

  /* ---------- game ---------- */
  const gameId = getIdFromQuery();
  if (!gameId) {
    alert("Brak parametru id.");
    location.href = "builder.html";
    return;
  }

  let game = await loadGame(gameId);
  const cfg = cfgFromGameType(game.type);

  const editInfo = canEnterEdit(game);
  if (!editInfo?.ok) {
    alert(editInfo?.reason || "Nie możesz edytować tej gry w tym momencie.");
    location.href = "builder.html";
    return;
  }

  if (editInfo.needsResetWarning) {
    const ok = confirm(
      "Edycja po sondażu:\n\nDane sondażowe zostaną usunięte, a gra wróci do stanu SZKIC.\n\nKontynuować?"
    );
    if (!ok) {
      location.href = "builder.html";
      return;
    }
    await resetPollForEditing(gameId);
    game = await loadGame(gameId);
  }

  /* ---------- UI header ---------- */
  const titleEl = $("pageTitle");
  if (titleEl) titleEl.textContent = cfg.title;
  $("hintTop") && ($("hintTop").textContent = cfg.hintTop);
  $("hintBottom") && ($("hintBottom").textContent = cfg.hintBottom);

  const typeBadge = $("typeBadge");
  if (typeBadge) {
    typeBadge.textContent =
      cfg.type === TYPES.PREPARED ? "Preparowany" :
      cfg.type === TYPES.POLL_POINTS ? "Punktacja odpowiedzi" :
      "Typowy sondaż";
  }

  document.body.classList.toggle("only-questions", !cfg.allowAnswers);
  document.body.classList.toggle("no-points", !cfg.allowPoints);

  /* ---------- name autosave ---------- */
  const gameName = $("gameName");
  if (gameName) gameName.value = game.name || "";

  let lastSavedName = normName(game.name || "");
  let savingName = false;

  async function saveNameIfChanged() {
    if (!gameName) return;
    const cur = normName(gameName.value || "");
    if (cur === lastSavedName) return;
    if (savingName) return;

    savingName = true;
    try {
      await saveGameName(gameId, cur);
      lastSavedName = cur;
      setMsg("Zapisano nazwę.");
    } catch (e) {
      console.error(e);
      setMsg("Błąd zapisu nazwy (konsola).");
    } finally {
      savingName = false;
    }
  }

  gameName?.addEventListener("blur", saveNameIfChanged);

  /* ---------- state ---------- */
  let questions = await renumberQuestions(gameId);
  let activeQId = questions[0]?.id || null;
  let answers = activeQId && cfg.allowAnswers ? await listAnswers(activeQId) : [];

  /* ---------- refs ---------- */
  const qList = $("qList");
  const qText = $("qText");
  const aList = $("aList");
  const rightPanel = document.querySelector(".rightPanel");

  function setHasQ(on) {
    rightPanel?.classList.toggle("hasQ", !!on);
  }

  // KLUCZ: liczymy count + (prepared) sumę punktów -> do kafelków i kolorów
  async function refreshCounts() {
    const qs = await listQuestions(gameId);

    if (!cfg.allowAnswers) {
      questions = qs;
      return;
    }

    for (const q of qs) {
      const as = await listAnswers(q.id);
      q.__answerCount = as.length;

      if (cfg.allowPoints) {
        let sum = 0;
        for (const a of as) {
          const n = Number(a.fixed_points);
          if (Number.isFinite(n)) sum += n;
        }
        q.__sumPoints = sum;
      } else {
        q.__sumPoints = null;
      }
    }

    questions = qs;
  }

  async function loadAnswersForActive() {
    if (!cfg.allowAnswers || !activeQId) {
      answers = [];
      return;
    }
    answers = await listAnswers(activeQId);
  }

  /* ---------- Questions UI ---------- */
  function mkXButton() {
    const x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.textContent = "✕";
    x.title = "Usuń";
    return x;
  }

  async function addQuestion() {
    try {
      const ord = nextQuestionOrd(questions);
      const q = await createQuestion(gameId, ord);

      questions = await renumberQuestions(gameId);
      activeQId = q.id;

      await loadAnswersForActive();
      await refreshCounts();

      renderQuestions();
      renderEditor();
      setMsg("Dodano pytanie.");
    } catch (e) {
      console.error(e);
      const msg = String(e?.message || "");
      if (e?.code === "23514" || msg.includes("violates check constraint")) {
        setMsg("Nie można dodać pytania — ograniczenie bazy (constraint na questions.ord).");
      } else {
        setMsg("Błąd dodawania pytania (konsola).");
      }
    }
  }

  async function deleteQuestion(qId) {
    const ok = confirm("Usunąć to pytanie i wszystkie jego odpowiedzi?");
    if (!ok) return;

    try {
      await deleteQuestionDeep(qId);

      questions = await renumberQuestions(gameId);
      await refreshCounts();

      if (activeQId === qId) {
        activeQId = questions[0]?.id || null;
        await loadAnswersForActive();
      }

      renderQuestions();
      renderEditor();
      setMsg("Usunięto pytanie.");
    } catch (e) {
      console.error(e);
      setMsg("Błąd usuwania pytania (konsola).");
    }
  }

  function applyCardStatusClass(card, q) {
    // kolorowanie kafelków wg Twoich zasad
    if (cfg.type === TYPES.PREPARED) {
      const cnt = Number(q.__answerCount ?? 0);
      const sum = Number(q.__sumPoints ?? 0);
      const good = cnt >= AN_MIN && sum <= SUM_PREPARED;
      card.classList.add(good ? "good" : "bad");
      return;
    }
    if (cfg.type === TYPES.POLL_POINTS) {
      const cnt = Number(q.__answerCount ?? 0);
      const good = cnt >= AN_MIN;
      card.classList.add(good ? "good" : "bad");
      return;
    }
    // poll_text: bez kolorów
  }

  function renderQuestions() {
    if (!qList) return;
    qList.innerHTML = "";

    const qCount = questions.length;
    const meetsMin = qCount >= QN_MIN;

    const addQ = document.createElement("button");
    addQ.type = "button";
    addQ.className = "qcard addTile";
    addQ.innerHTML = `
      <div class="plus">+</div>
      <div>
        <div class="txt">Dodaj pytanie</div>
        <div class="sub">${meetsMin ? "Minimum spełnione" : `Wymagane minimum: ${QN_MIN} (masz ${qCount})`}</div>
      </div>
    `;
    addQ.addEventListener("click", addQuestion);
    qList.appendChild(addQ);

    for (const q of questions) {
      const card = document.createElement("div");
      card.className = "qcard";
      if (q.id === activeQId) card.classList.add("active");

      applyCardStatusClass(card, q);

      const x = mkXButton();
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteQuestion(q.id);
      });

      card.innerHTML = `
        <div class="qord">Pytanie ${q.ord}</div>
        <div class="qprev"></div>
        <div class="qmeta"></div>
      `;
      card.appendChild(x);

      card.querySelector(".qprev").textContent = (q.text || "").trim() || `Pytanie ${q.ord}`;

      const meta = card.querySelector(".qmeta");
      if (!cfg.allowAnswers) {
        meta.textContent = "Tylko pytania";
      } else if (cfg.type === TYPES.PREPARED) {
        meta.textContent = `${q.__answerCount ?? 0}/${AN_MAX} odpowiedzi • suma ${q.__sumPoints ?? 0}/${SUM_PREPARED}`;
      } else {
        meta.textContent = `${q.__answerCount ?? 0}/${AN_MAX} odpowiedzi`;
      }

      card.addEventListener("click", async () => {
        activeQId = q.id;
        await loadAnswersForActive();
        renderQuestions();
        renderEditor();
      });

      qList.appendChild(card);
    }
  }

  /* ---------- Answers UI ---------- */
  async function addAnswer() {
    if (!activeQId) return;

    const ord = nextAnswerOrd(answers);
    if (!ord) {
      setMsg(`Limit odpowiedzi: ${AN_MAX}.`);
      return;
    }

    try {
      await createAnswer(activeQId, ord, `ODP ${ord}`, 0);

      answers = await listAnswers(activeQId);
      await refreshCounts();

      renderQuestions();
      renderAnswers();
      setMsg("Dodano odpowiedź.");
    } catch (e) {
      console.error(e);
      setMsg("Błąd dodawania odpowiedzi (konsola).");
    }
  }

  async function removeAnswer(aId) {
    const ok = confirm("Usunąć tę odpowiedź?");
    if (!ok) return;

    try {
      await deleteAnswer(aId);
      answers = await listAnswers(activeQId);
      await refreshCounts();
      renderQuestions();
      renderAnswers();
      setMsg("Usunięto odpowiedź.");
    } catch (e) {
      console.error(e);
      setMsg("Błąd usuwania odpowiedzi (konsola).");
    }
  }

  function renderAnswers() {
    if (!cfg.allowAnswers || !aList) return;

    aList.innerHTML = "";

    if (cfg.allowPoints) {
      const sum = answers.reduce((acc, a) => acc + nonNegativeInt(a.fixed_points, 0), 0);
      aList.appendChild(makeRemainBox(sum));
    }

    for (const a of answers) {
      const row = document.createElement("div");
      row.className = "arow";

      if (cfg.allowPoints) {
        row.innerHTML = `
          <input class="aText" type="text" maxlength="17" placeholder="ODP ${a.ord}">
          <input class="aPts" type="number" step="1" inputmode="numeric">
          <button class="aDel" type="button" title="Usuń">✕</button>
        `;
      } else {
        row.innerHTML = `
          <input class="aText" type="text" maxlength="17" placeholder="ODP ${a.ord}">
          <button class="aDel" type="button" title="Usuń">✕</button>
        `;
      }

      const iText = row.querySelector(".aText");
      const iPts = cfg.allowPoints ? row.querySelector(".aPts") : null;
      const bDel = row.querySelector(".aDel");

      iText.value = a.text || "";
      if (iPts) iPts.value = String(nonNegativeInt(a.fixed_points, 0));

      const saveTextNow = async () => {
        try {
          const t = clip17(iText.value);
          const safe = (t || "").trim() ? t : `ODP ${a.ord}`;
          await updateAnswer(a.id, { text: safe });
          setMsg("Zapisano.");
        } catch (e) {
          console.error(e);
          setMsg("Błąd zapisu (konsola).");
        }
      };
      const saveTextDebounced = debounce(saveTextNow, 350);

      iText.addEventListener("input", () => {
        if (iText.value.length > 17) iText.value = iText.value.slice(0, 17);
        setMsg("Piszesz…");
        saveTextDebounced();
      });
      iText.addEventListener("blur", saveTextNow);

      const savePtsNow = async () => {
        if (!cfg.allowPoints || !iPts) return;
        try {
          const val = nonNegativeInt(iPts.value, 0);
          await updateAnswer(a.id, { fixed_points: val });

          answers = await listAnswers(activeQId);
          await refreshCounts(); // ważne dla kafelków w lewo
          renderQuestions();
          renderAnswers();
          setMsg("Zapisano.");
        } catch (e) {
          console.error(e);
          const msg = String(e?.message || "");
          if (e?.code === "23514" || msg.includes("violates check constraint")) {
            setMsg("Błąd: punkty odrzucone przez bazę (constraint).");
          } else {
            setMsg("Błąd zapisu punktów (konsola).");
          }
        }
      };

      iPts?.addEventListener("input", () => updateRemainBox(aList));
      iPts?.addEventListener("blur", savePtsNow);

      bDel.addEventListener("click", () => removeAnswer(a.id));

      aList.appendChild(row);
    }

    const canAdd = answers.length < AN_MAX;
    const addA = document.createElement("button");
    addA.type = "button";
    addA.className = "arow addTile";
    addA.disabled = !canAdd;
    addA.style.cursor = canAdd ? "pointer" : "not-allowed";
    addA.style.opacity = canAdd ? "1" : ".55";
    addA.innerHTML = `
      <div style="font-weight:1000;">
        ${canAdd ? "+ Dodaj odpowiedź" : "Limit odpowiedzi osiągnięty"}
      </div>
      <div style="margin-left:auto; text-align:right; font-weight:900; opacity:.8;">
        ${answers.length}/${AN_MAX}
      </div>
    `;
    addA.addEventListener("click", () => {
      if (!canAdd) return;
      addAnswer();
    });
    aList.appendChild(addA);

    if (cfg.allowPoints) updateRemainBox(aList);
  }

  function renderEditor() {
    setHasQ(!!activeQId);

    if (!activeQId) {
      if (qText) qText.value = "";
      if (aList) aList.innerHTML = "";
      return;
    }

    const q = questions.find((x) => x.id === activeQId);
    if (qText) qText.value = q?.text || "";

    renderAnswers();
  }

  /* ---------- question text save ---------- */
  const saveQuestionNow = async () => {
    if (!activeQId) return;

    try {
      const t = normQ(qText?.value || "");
      await updateQuestion(activeQId, { text: t });

      const q = questions.find((x) => x.id === activeQId);
      if (q) q.text = t;

      renderQuestions();
      setMsg("Zapisano.");
    } catch (e) {
      console.error(e);
      setMsg("Błąd zapisu pytania (konsola).");
    }
  };
  const saveQuestionDebounced = debounce(saveQuestionNow, 350);

  qText?.addEventListener("input", () => {
    if (!activeQId) return;
    setMsg("Piszesz…");
    saveQuestionDebounced();
  });
  qText?.addEventListener("blur", saveQuestionNow);

  /* ---------- Import modal ---------- */
  const btnImportTxt = $("btnImportTxt");
  const txtFile = $("txtFile");
  const btnTxtLoadFile = $("btnTxtLoadFile");
  const txtTa = $("txtTa");
  const txtMsg = $("txtMsg");
  const btnTxtImport = $("btnTxtImport");
  const btnTxtClose = $("btnTxtClose");

  const setTxtMsg = (t) => {
    if (txtMsg) txtMsg.textContent = t || "";
  };

  btnImportTxt?.addEventListener("click", () => {
    if (txtTa) txtTa.value = "";
    if (txtFile) txtFile.value = "";
    setTxtMsg("");
    openOverlay("txtImportOverlay", true);
  });

  btnTxtClose?.addEventListener("click", () => {
    const ov = document.getElementById("txtImportOverlay");
    if (ov?.__txtImportRunning) return; // blokuj w trakcie importu
    openOverlay("txtImportOverlay", false);
  });
  
  async function readFileAsText(file) {
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("Nie udało się wczytać pliku."));
      r.readAsText(file);
    });
  }

  btnTxtImport?.addEventListener("click", async () => {
    try {
      const raw = String(txtTa?.value || "");
      if (!raw.trim()) {
        setTxtMsg("Wklej treść albo wczytaj plik.");
        return;
      }
  
      const parsed = parseQaText(raw);
      if (!parsed.ok) {
        setTxtMsg(parsed.error || "Błąd formatu.");
        return;
      }
  
      const ok = confirm(
        "Import TXT ZASTĄPI zawartość gry:\n\n" +
          "- usunie wszystkie dotychczasowe pytania i odpowiedzi\n" +
          "- wgra dane z tekstu\n\n" +
          "Kontynuować?"
      );
      if (!ok) {
        setTxtMsg("Anulowano.");
        return;
      }
  
      // przełącz TEN SAM modal w tryb progress
      ensureTxtImportProgressInPlace();
      showTxtImportProgress(true);
  
      // policz pracę (wipe=1, każde pytanie=1, każda odpowiedź=1 jeśli allowAnswers)
      const items = parsed.items || [];
      let total = 1; // wipe
      for (const it of items) {
        total += 1; // pytanie
        if (cfg.allowAnswers) total += Math.min((it.answers || []).length, AN_MAX); // odpowiedzi
      }
      total += 3; // post-processing: renumber + refreshCounts + render/finish
  
      let done = 0;
      setTxtImportProgress({ step: "Start…", i: done, n: total, msg: "" });
  
      if (parsed.name && gameName) {
        gameName.value = parsed.name;
        await saveNameIfChanged();
      }
  
      // 1) wipe
      setTxtImportProgress({ step: "Czyszczenie gry", i: done, n: total, msg: "" });
      await wipeGameContent(gameId);
      done += 1;
      setTxtImportProgress({ step: "Czyszczenie gry", i: done, n: total, msg: "OK" });
  
      // 2) import q/a
      let qOrd = 1;
      for (const item of items) {
        setTxtImportProgress({
          step: `Pytanie ${qOrd}/${items.length}`,
          i: done,
          n: total,
          msg: "Tworzę pytanie…",
        });
  
        const q = await createQuestion(gameId, qOrd);
        await updateQuestion(q.id, { text: normQ(item.qText) });
  
        done += 1;
        setTxtImportProgress({
          step: `Pytanie ${qOrd}/${items.length}`,
          i: done,
          n: total,
          msg: "OK",
        });
  
        if (cfg.allowAnswers) {
          let aOrd = 1;
          const ans = item.answers || [];
          for (const a of ans) {
            if (aOrd > AN_MAX) break;
  
            setTxtImportProgress({
              step: `Pytanie ${qOrd}/${items.length}`,
              i: done,
              n: total,
              msg: `Odpowiedź ${aOrd}…`,
            });
  
            const text = clip17(a.text);
            const pts =
              cfg.allowPoints && !cfg.ignoreImportPoints
                ? nonNegativeInt(a.points, 0)
                : 0;
  
            await createAnswer(q.id, aOrd, text || `ODP ${aOrd}`, pts);
  
            done += 1;
            setTxtImportProgress({
              step: `Pytanie ${qOrd}/${items.length}`,
              i: done,
              n: total,
              msg: `Odpowiedź ${aOrd} OK`,
            });
  
            aOrd++;
          }
        }
  
        qOrd++;
      }
  
      // 3) refresh
      setTxtImportProgress({ step: "Porządkuję numerację", i: done, n: total, msg: "" });
      questions = await renumberQuestions(gameId);
      done += 1;
      setTxtImportProgress({ step: "Porządkuję numerację", i: done, n: total, msg: "OK" });
      
      setTxtImportProgress({ step: "Liczenie statusów", i: done, n: total, msg: "" });
      await refreshCounts();
      done += 1;
      setTxtImportProgress({ step: "Liczenie statusów", i: done, n: total, msg: "OK" });
      
      setTxtImportProgress({ step: "Rysuję widok", i: done, n: total, msg: "" });
      activeQId = questions[0]?.id || null;
      await loadAnswersForActive();
      renderQuestions();
      renderEditor();
      done += 1;
      setTxtImportProgress({ step: "Rysuję widok", i: done, n: total, msg: "OK" });
  
      setTxtImportProgress({
        step: "Gotowe ✅",
        i: total,
        n: total,
        msg: "Import zakończony.",
      });
  
      setMsg("Import zakończony.");
      setTxtMsg("Zaimportowano (zastąpiono zawartość).");
  
      // wróć do normalnego widoku modala i zamknij po chwili
      setTimeout(() => {
        showTxtImportProgress(false);
        openOverlay("txtImportOverlay", false);
      }, 700);
    } catch (e) {
      console.error(e);
  
      setTxtImportProgress({
        step: "Błąd ❌",
        i: 0,
        n: 0,
        msg: `Błąd: ${e?.message || String(e)}`,
        isError: true,
      });
  
      // zostaw modal otwarty w trybie progress, z przyciskiem "Zamknij"
    }
  });

  /* ---------- init ---------- */
  questions = await renumberQuestions(gameId);
  await refreshCounts();
  activeQId = questions[0]?.id || null;
  await loadAnswersForActive();

  renderQuestions();
  renderEditor();
  setMsg("");
}

document.addEventListener("DOMContentLoaded", () => {
  boot().catch((e) => {
    console.error(e);
    alert("Błąd edytora (konsola).");
  });
});
