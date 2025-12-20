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
  el.style.display = on ? "" : "none";
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
  // "zwykłe pole": pozwól wpisać cokolwiek, ale do DB idzie int albo fallback
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

    // textarea: Enter = nowa linia
    if (el.tagName === "TEXTAREA") return;

    // input/select: Enter = blur
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
  // answers -> question
  const { error: aErr } = await sb().from("answers").delete().eq("question_id", qId);
  if (aErr) throw aErr;

  const { error: qErr } = await sb().from("questions").delete().eq("id", qId);
  if (qErr) throw qErr;
}

async function createAnswer(questionId, ord, text, fixed_points) {
  // answers_text_len constraint: max 17 i niepuste
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

/**
 * READY -> reset do szkicu:
 * - status=draft
 * - poll_* = null
 * - answers.fixed_points = 0
 */
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
  // ord ma być zawsze 1..N bez dziur
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
  // usuń answers wszystkich pytań, potem pytania
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
  // po renumeracji wystarczy length+1, ale zostawiamy bezpiecznie:
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
  // prepared
  return {
    type,
    title: "Edytor — Preparowany",
    hintTop: `Podpowiedź: zalecamy nie mniej niż ${QN_MIN} pytań. W pytaniu wymagane ${AN_MIN}–${AN_MAX} odpowiedzi.`,
    hintBottom: `W tym trybie ustawiasz punkty ręcznie. Suma w pytaniu powinna wynosić ${SUM_PREPARED}.`,
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
  const diff = SUM_PREPARED - sum;

  const el = document.createElement("div");
  el.className = "remainBox";
  el.style.marginBottom = "10px";

  if (diff === 0) el.classList.add("ok");
  else if (diff < 0) el.classList.add("over");

  if (diff === 0) el.innerHTML = `<span>OK</span><b>${SUM_PREPARED}</b>`;
  else if (diff > 0) el.innerHTML = `<span>ZOSTAŁO</span><b>${diff}</b>`;
  else el.innerHTML = `<span>ZA DUŻO</span><b>${-diff}</b>`;

  return el;
}

function updateRemainBox(container) {
  const box = container.querySelector(".remainBox");
  if (!box) return;

  const sum = sumPointsFromDom(container);
  const diff = SUM_PREPARED - sum;

  box.classList.remove("ok", "over");
  if (diff === 0) box.classList.add("ok");
  else if (diff < 0) box.classList.add("over");

  if (diff === 0) box.innerHTML = `<span>OK</span><b>${SUM_PREPARED}</b>`;
  else if (diff > 0) box.innerHTML = `<span>ZOSTAŁO</span><b>${diff}</b>`;
  else box.innerHTML = `<span>ZA DUŻO</span><b>${-diff}</b>`;
}

/* ================= Boot ================= */
async function boot() {
  /* ---------- auth/topbar ---------- */
  const user = await requireAuth("index.html");
  const who = $("who");
  if (who) who.textContent = user?.email || "—";

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

  // twarde sprawdzenie edycji
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

  const hintTop = $("hintTop");
  if (hintTop) hintTop.textContent = cfg.hintTop;

  const hintBottom = $("hintBottom");
  if (hintBottom) hintBottom.textContent = cfg.hintBottom;

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
  let questions = await renumberQuestions(gameId); // od razu porządek 1..N
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

  async function refreshCounts() {
    if (!cfg.allowAnswers) {
      questions = await listQuestions(gameId);
      return;
    }
    const qs = await listQuestions(gameId);
    for (const q of qs) {
      const as = await listAnswers(q.id);
      q.__answerCount = as.length;
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

      questions = await renumberQuestions(gameId); // zawsze po dodaniu porządek
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
      if (!cfg.allowAnswers) meta.textContent = "Tylko pytania";
      else meta.textContent = `${q.__answerCount ?? 0}/${AN_MAX} odpowiedzi`;

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
      // na start licznik z aktualnych danych
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

      // TEXT: debounce + blur
      const saveTextNow = async () => {
        try {
          const t = clip17(iText.value);
          const safe = (t || "").trim() ? t : `ODP ${a.ord}`; // nie zapisujemy pustego (constraint)
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

      // PTS (prepared): input tylko licznik, blur zapis
      const savePtsNow = async () => {
        if (!cfg.allowPoints || !iPts) return;
        try {
          const val = nonNegativeInt(iPts.value, 0);
          await updateAnswer(a.id, { fixed_points: val });

          // odśwież dane i render (żeby licznik był pewny)
          answers = await listAnswers(activeQId);
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

      iPts?.addEventListener("input", () => {
        updateRemainBox(aList);
      });
      iPts?.addEventListener("blur", savePtsNow);

      bDel.addEventListener("click", () => removeAnswer(a.id));

      aList.appendChild(row);
    }

    // add tile
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

  btnTxtClose?.addEventListener("click", () => openOverlay("txtImportOverlay", false));

  async function readFileAsText(file) {
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("Nie udało się wczytać pliku."));
      r.readAsText(file);
    });
  }

  btnTxtLoadFile?.addEventListener("click", async () => {
    try {
      const f = txtFile?.files?.[0];
      if (!f) {
        setTxtMsg("Wybierz plik TXT albo wklej treść poniżej.");
        return;
      }
      const txt = await readFileAsText(f);
      if (txtTa) txtTa.value = txt;
      setTxtMsg("Wczytano. Kliknij Importuj.");
    } catch (e) {
      console.error(e);
      setTxtMsg("Błąd wczytywania pliku.");
    }
  });

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

      setTxtMsg("Importuję…");

      // @Nazwa gry (jeśli parseQaText zwraca parsed.name)
      if (parsed.name && gameName) {
        gameName.value = parsed.name;
        await saveNameIfChanged();
      }

      // 1) usuń starą zawartość
      await wipeGameContent(gameId);

      // 2) wgraj od zera (ord 1..N)
      let qOrd = 1;

      for (const item of parsed.items) {
        const q = await createQuestion(gameId, qOrd);
        await updateQuestion(q.id, { text: normQ(item.qText) });

        if (cfg.allowAnswers) {
          let aOrd = 1;
          for (const a of item.answers || []) {
            if (aOrd > AN_MAX) break;

            const text = clip17(a.text);

            // punkty: bierzemy tylko w prepared, a i tak tylko >=0 (bez limitu górnego)
            const pts =
              cfg.allowPoints && !cfg.ignoreImportPoints
                ? nonNegativeInt(a.points, 0)
                : 0;

            await createAnswer(q.id, aOrd, text || `ODP ${aOrd}`, pts);
            aOrd++;
          }
        }

        qOrd++;
      }

      // 3) renumeruj i odśwież UI
      questions = await renumberQuestions(gameId);
      await refreshCounts();

      activeQId = questions[0]?.id || null;
      await loadAnswersForActive();

      renderQuestions();
      renderEditor();

      setTxtMsg("Zaimportowano (zastąpiono zawartość).");
      setMsg("Import zakończony.");
    } catch (e) {
      console.error(e);
      setTxtMsg("Błąd importu (konsola).");
    }
  });

  /* ---------- init ---------- */
  await refreshCounts();
  questions = await renumberQuestions(gameId);
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
