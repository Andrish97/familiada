// js/pages/editor-engine.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { parseQaText, clip as clipN } from "../core/text-import.js";
import { canEnterEdit } from "../core/game-validate.js";

const RULES = { QN: 10, AN: 6 };

const $ = (id) => document.getElementById(id);

const clip17 = (s) => clipN(String(s ?? ""), 17);
const normQ = (s) => String(s ?? "").trim().slice(0, 200);
const normName = (s) => (String(s ?? "Nowa Familiada").trim() || "Nowa Familiada").slice(0, 80);

const isNum = (v) => Number.isFinite(Number(v));
const clampPts = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
};

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

function setMsg(t) {
  const el = $("msg");
  if (el) el.textContent = t || "";
}

function openOverlay(id, on) {
  const el = $(id);
  if (!el) return;
  el.style.display = on ? "" : "none";
}

/**
 * READY -> edycja wymaga resetu do szkicu:
 * - games.status = draft
 * - poll_opened_at / poll_closed_at = null
 * - answers.fixed_points = 0 (bo to Twoje “dane sondażowe” dla poll_points)
 *
 * Jeśli kiedyś dopniesz osobne tabele wyników sondażu, to tu też je czyścisz.
 */
async function resetPollForEditing(gameId) {
  const { error: gErr } = await sb()
    .from("games")
    .update({ status: "draft", poll_opened_at: null, poll_closed_at: null })
    .eq("id", gameId);
  if (gErr) throw gErr;

  // answers.fixed_points => 0 (dla wszystkich pytań w grze)
  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id")
    .eq("game_id", gameId);
  if (qErr) throw qErr;

  const qIds = (qs || []).map((x) => x.id);
  if (!qIds.length) return;

  const { error: aErr } = await sb()
    .from("answers")
    .update({ fixed_points: 0 })
    .in("question_id", qIds);
  if (aErr) throw aErr;
}

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
    .insert({
      game_id: gameId,
      ord,
      text: `Pytanie ${ord}`,
    })
    .select("id,ord,text")
    .single();
  if (error) throw error;
  return data;
}

async function updateQuestion(qId, patch) {
  const { error } = await sb().from("questions").update(patch).eq("id", qId);
  if (error) throw error;
}

async function createAnswer(questionId, ord, text, fixed_points) {
  const { data, error } = await sb()
    .from("answers")
    .insert({
      question_id: questionId,
      ord,
      text,
      fixed_points,
    })
    .select("id,ord,text,fixed_points")
    .single();
  if (error) throw error;
  return data;
}

async function updateAnswer(aId, patch) {
  const { error } = await sb().from("answers").update(patch).eq("id", aId);
  if (error) throw error;
}

function nextOrd(items, limit) {
  const used = new Set(items.map((x) => x.ord));
  for (let i = 1; i <= limit; i++) if (!used.has(i)) return i;
  return null;
}

/**
 * cfg:
 * {
 *   type: "poll_text" | "poll_points" | "prepared",
 *   allowAnswers: boolean,
 *   allowPoints: boolean,        // tylko prepared
 *   ignoreImportPoints: boolean, // poll_points + poll_text
 * }
 */
export async function bootEditor(cfg) {
  // ===== auth / topbar =====
  const user = await requireAuth("index.html");
  const who = $("who");
  if (who) who.textContent = user?.email || "—";

  const btnLogout = $("btnLogout");
  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  const btnBack = $("btnBack");
  btnBack?.addEventListener("click", () => {
    location.href = "builder.html";
  });

  // ===== id =====
  const gameId = getIdFromQuery();
  if (!gameId) {
    alert("Brak parametru id.");
    location.href = "builder.html";
    return;
  }

  let game = await loadGame(gameId);

  // jeśli ktoś wszedł w zły edytor – przerzut
  if (game.type !== cfg.type) {
    if (game.type === "prepared") location.href = `editor-prepared.html?id=${encodeURIComponent(gameId)}`;
    if (game.type === "poll_text") location.href = `editor-poll-text.html?id=${encodeURIComponent(gameId)}`;
    if (game.type === "poll_points") location.href = `editor-poll-points.html?id=${encodeURIComponent(gameId)}`;
    return;
  }

  // twarde sprawdzenie edycji przy wejściu URL-em
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

  // ===== badge =====
  const badge = $("kindBadge") || $("typeBadge");
  if (badge) {
    badge.textContent =
      cfg.type === "prepared" ? "Preparowany" :
      cfg.type === "poll_points" ? "Punktacja odpowiedzi" :
      "Typowy sondaż";
  }

  const lockBadge = $("lockBadge");
  if (lockBadge) lockBadge.style.display = "none";

  // ===== name autosave =====
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
  gameName?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      gameName.blur();
    }
  });

  // na wypadek “ucieczki” bez blura (np. klik back / zamknięcie karty)
  window.addEventListener("beforeunload", () => {
    // fire-and-forget: przeglądarka może to uciąć, ale często zapisze
    saveNameIfChanged();
  });

  // ===== state =====
  let questions = await listQuestions(gameId);
  let activeQId = questions[0]?.id || null;
  let answers = activeQId && cfg.allowAnswers ? await listAnswers(activeQId) : [];

  // ===== UI refs =====
  const qList = $("qList");
  const qText = $("qText");
  const aList = $("aList");
  const rightPanel = document.querySelector(".rightPanel");

  async function refreshCounts() {
    if (!cfg.allowAnswers) {
      questions = await listQuestions(gameId);
      return;
    }
    const qs = await listQuestions(gameId);
    for (const q of qs) {
      const as = await listAnswers(q.id);
      q.__answerCount = as.filter((a) => (a.text || "").trim()).length;
    }
    questions = qs;
  }

  async function loadAnswersForActive() {
    if (!cfg.allowAnswers) {
      answers = [];
      return;
    }
    if (!activeQId) {
      answers = [];
      return;
    }
    answers = await listAnswers(activeQId);
  }

  function setHasQ(on) {
    if (!rightPanel) return;
    rightPanel.classList.toggle("hasQ", !!on);
  }

  // ===== render questions =====
  function renderQuestions() {
    if (!qList) return;
    qList.innerHTML = "";

    // kafelek dodawania (zawsze na górze)
    const canAddQ = questions.length < RULES.QN;
    const addQBtn = document.createElement("button");
    addQBtn.type = "button";
    addQBtn.className = "qcard";
    addQBtn.disabled = !canAddQ;
    addQBtn.innerHTML = `
      <div class="qprev">${canAddQ ? "+ Dodaj pytanie" : "Limit pytań osiągnięty"}</div>
      <div class="qmeta">${questions.length}/${RULES.QN}</div>
    `;
    addQBtn.addEventListener("click", async () => {
      if (!canAddQ) return;
      try {
        const ord = nextOrd(questions, RULES.QN);
        if (!ord) return;

        const q = await createQuestion(gameId, ord);
        questions = await listQuestions(gameId);
        activeQId = q.id;

        await loadAnswersForActive();
        await refreshCounts();

        renderQuestions();
        renderEditor();
        setMsg("Dodano pytanie.");
      } catch (e) {
        console.error(e);
        setMsg("Błąd dodawania pytania (konsola).");
      }
    });
    qList.appendChild(addQBtn);

    // lista pytań
    for (const q of questions) {
      const el = document.createElement("div");
      el.className = "qcard";
      if (q.id === activeQId) el.classList.add("active");

      el.innerHTML = `
        <div class="qord">Pytanie ${q.ord}</div>
        <div class="qprev"></div>
        <div class="qmeta"></div>
      `;
      el.querySelector(".qprev").textContent = (q.text || "").trim() || `Pytanie ${q.ord}`;

      const meta = el.querySelector(".qmeta");
      if (cfg.allowAnswers) {
        const cnt = q.__answerCount ?? 0;
        meta.textContent = `${cnt}/${RULES.AN} odpowiedzi`;
      } else {
        meta.textContent = `Tylko pytania`;
      }

      el.addEventListener("click", async () => {
        activeQId = q.id;
        renderQuestions();
        await loadAnswersForActive();
        renderEditor();
      });

      qList.appendChild(el);
    }
  }

  // ===== render answers =====
  function renderAnswers() {
    if (!cfg.allowAnswers) return;
    if (!aList) return;

    aList.innerHTML = "";

    // existing answers rows
    for (const a of answers) {
      const row = document.createElement("div");
      row.className = "arow";

      if (cfg.allowPoints) {
        row.innerHTML = `
          <input class="aText" type="text" maxlength="17" placeholder="ODP ${a.ord}">
          <input class="aPts" type="number" min="0" max="100" step="1" inputmode="numeric">
          <button class="aDel" type="button" title="Wyczyść">✕</button>
        `;
      } else {
        row.innerHTML = `
          <input class="aText" type="text" maxlength="17" placeholder="ODP ${a.ord}">
          <button class="aDel" type="button" title="Wyczyść">✕</button>
        `;
      }

      const iText = row.querySelector(".aText");
      iText.value = a.text || "";

      const iPts = cfg.allowPoints ? row.querySelector(".aPts") : null;
      if (iPts) iPts.value = Number(a.fixed_points) || 0;

      const bDel = row.querySelector(".aDel");

      const saveNow = async () => {
        try {
          const patch = { text: clip17(iText.value) };
          if (cfg.allowPoints) patch.fixed_points = clampPts(iPts.value);
          else patch.fixed_points = 0;

          await updateAnswer(a.id, patch);
          setMsg("Zapisano.");
        } catch (e) {
          console.error(e);
          setMsg("Błąd zapisu (konsola).");
        }
      };

      const save = debounce(saveNow, 350);

      iText.addEventListener("input", () => {
        if (iText.value.length > 17) iText.value = iText.value.slice(0, 17);
        setMsg("Piszesz…");
        save();
      });

      iPts?.addEventListener("input", () => {
        const v = Number(iPts.value);
        iPts.classList.toggle("tooMuch", isNum(v) && v > 100);
        setMsg("Piszesz…");
        save();
      });

      bDel.addEventListener("click", async () => {
        iText.value = "";
        if (iPts) iPts.value = "0";
        await saveNow();
      });

      aList.appendChild(row);
    }

    // add-tile (zawsze na dole)
    const canAddA = answers.length < RULES.AN;
    const addABtn = document.createElement("button");
    addABtn.type = "button";
    addABtn.className = "arow addTile";
    addABtn.disabled = !canAddA;

    // Dwie kolumny “ładnie” niezależnie od trybu points/no-points:
    // - tekst po lewej
    // - licznik po prawej
    addABtn.style.cursor = canAddA ? "pointer" : "not-allowed";
    addABtn.style.opacity = canAddA ? "1" : ".55";
    addABtn.innerHTML = `
      <div style="font-weight:1000;">
        ${canAddA ? "+ Dodaj odpowiedź" : "Limit odpowiedzi osiągnięty"}
      </div>
      <div style="margin-left:auto; text-align:right; font-weight:900; opacity:.8;">
        ${answers.length}/${RULES.AN}
      </div>
    `;

    addABtn.addEventListener("click", async () => {
      if (!canAddA || !activeQId) return;
      try {
        const ord = nextOrd(answers, RULES.AN);
        if (!ord) return;

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
    });

    aList.appendChild(addABtn);
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

  // ===== debounced save question =====
  const saveQuestionDebounced = debounce(async () => {
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
  }, 350);

  qText?.addEventListener("input", () => {
    if (!activeQId) return;
    setMsg("Piszesz…");
    saveQuestionDebounced();
  });

  // ===== Import TXT =====
  const btnImportTxt = $("btnImportTxt");
  const btnHowTxt = $("btnHowTxt");
  const btnHowClose = $("btnHowClose");

  const txtLoadFile = $("btnTxtLoadFile");
  const txtFile = $("txtFile");
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

  btnHowTxt?.addEventListener("click", () => openOverlay("howOverlay", true));
  btnHowClose?.addEventListener("click", () => openOverlay("howOverlay", false));

  async function readFileAsText(file) {
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("Nie udało się wczytać pliku."));
      r.readAsText(file);
    });
  }

  txtLoadFile?.addEventListener("click", async () => {
    try {
      const f = txtFile?.files?.[0];
      if (!f) {
        setTxtMsg("Wybierz plik TXT.");
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

      setTxtMsg("Importuję…");

      await refreshCounts();

      let qOrd = nextOrd(questions, RULES.QN);
      if (!qOrd) {
        setTxtMsg(`Brak miejsca — limit pytań ${RULES.QN}.`);
        return;
      }

      for (const item of parsed.items) {
        if (!qOrd) break;

        const q = await createQuestion(gameId, qOrd);
        await updateQuestion(q.id, { text: normQ(item.qText) });

        // poll_text: tylko pytania (cfg.allowAnswers=false)
        // poll_points: pytania + odpowiedzi, punkty ignorujemy
        // prepared: pytania + odpowiedzi + punkty
        if (cfg.allowAnswers) {
          let aOrd = 1;
          for (const a of item.answers || []) {
            if (aOrd > RULES.AN) break;

            const text = clip17(a.text);
            const pts =
              cfg.allowPoints && !cfg.ignoreImportPoints
                ? clampPts(a.points)
                : 0;

            await createAnswer(q.id, aOrd, text || `ODP ${aOrd}`, pts);
            aOrd++;
          }
        }

        // następny wolny ord (na świeżo z DB, bo ktoś mógł mieć dziury)
        const latestQs = await listQuestions(gameId);
        qOrd = nextOrd(latestQs, RULES.QN);
      }

      await refreshCounts();
      questions = await listQuestions(gameId);
      activeQId = questions[0]?.id || null;
      await loadAnswersForActive();

      renderQuestions();
      renderEditor();

      setTxtMsg("Zaimportowano.");
      setMsg("Import zakończony.");
    } catch (e) {
      console.error(e);
      setTxtMsg("Błąd importu (konsola).");
    }
  });

  // ===== init =====
  await refreshCounts();
  questions = await listQuestions(gameId);
  activeQId = questions[0]?.id || null;
  await loadAnswersForActive();

  renderQuestions();
  renderEditor();
  setMsg("");
}
