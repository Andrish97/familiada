// js/pages/editor.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { parseQaText, clip as clipN } from "../core/text-import.js";
import { canEnterEdit, RULES as GV_RULES, TYPES } from "../core/game-validate.js";

const QN_MIN = GV_RULES.QN_MIN; // 10
const AN_MIN = GV_RULES.AN_MIN; // 3
const AN_MAX = GV_RULES.AN_MAX; // 6
const SUM_PREPARED = GV_RULES.SUM_PREPARED ?? 100;

const $ = (id) => document.getElementById(id);

const clip17 = (s) => clipN(String(s ?? ""), 17);
const normQ = (s) => String(s ?? "").trim().slice(0, 200);
const normName = (s) => (String(s ?? "Nowa Familiada").trim() || "Nowa Familiada").slice(0, 80);

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

function calcQuestionPoints(ans) {
  let sum = 0;
  for (const a of ans) sum += clampPts(a.fixed_points);
  return sum;
}

// ====== DB ======

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
  // usuń odpowiedzi -> usuń pytanie
  const { error: aErr } = await sb().from("answers").delete().eq("question_id", qId);
  if (aErr) throw aErr;

  const { error: qErr } = await sb().from("questions").delete().eq("id", qId);
  if (qErr) throw qErr;
}

async function createAnswer(questionId, ord, text, fixed_points) {
  const safeText = clip17(text || `ODP ${ord}`) || `ODP ${ord}`;
  const safePts = clampPts(fixed_points);

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
 * READY -> edycja wymaga resetu:
 * - games.status = draft
 * - poll_opened_at / poll_closed_at = null
 * - answers.fixed_points = 0 (bo to “dane sondażowe” dla poll_points)
 */
async function resetPollForEditing(gameId) {
  const { error: gErr } = await sb()
    .from("games")
    .update({ status: "draft", poll_opened_at: null, poll_closed_at: null })
    .eq("id", gameId);
  if (gErr) throw gErr;

  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id")
    .eq("game_id", gameId);
  if (qErr) throw qErr;

  const qIds = (qs || []).map((x) => x.id);
  if (!qIds.length) return;

  const { error: aErr } = await sb().from("answers").update({ fixed_points: 0 }).in("question_id", qIds);
  if (aErr) throw aErr;
}

// ====== ord helpers ======

function nextQuestionOrd(questions) {
  let max = 0;
  for (const q of questions) max = Math.max(max, Number(q.ord) || 0);
  return max + 1;
}

function nextAnswerOrd(answers) {
  const used = new Set((answers || []).map((a) => a.ord));
  for (let i = 1; i <= AN_MAX; i++) if (!used.has(i)) return i;
  return null;
}

// ====== config by game.type ======

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

// ====== Enter=blur (dla inputów) ======

function wireEnterAsBlur() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    const el = e.target;
    if (!(el instanceof HTMLElement)) return;

    // textarea zostawiamy w spokoju (Enter = nowa linia)
    if (el.tagName === "TEXTAREA") return;

    // tylko inputy / selecty
    if (el.tagName === "INPUT" || el.tagName === "SELECT") {
      e.preventDefault();
      el.blur();
    }
  });
}

// ====== BOOT ======

async function boot() {
  // auth / topbar
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

  // id
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

  // UI: tytuły / hinty / badge
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

  // body classes (ukrywanie sekcji)
  const body = document.body;
  body.classList.toggle("only-questions", !cfg.allowAnswers);
  body.classList.toggle("no-points", !cfg.allowPoints);

  // name autosave (blur)
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

  // state
  let questions = await listQuestions(gameId);
  let activeQId = questions[0]?.id || null;
  let answers = activeQId && cfg.allowAnswers ? await listAnswers(activeQId) : [];

  // refs
  const qList = $("qList");
  const qText = $("qText");
  const aList = $("aList");
  const rightPanel = document.querySelector(".rightPanel");

  function setHasQ(on) {
    if (!rightPanel) return;
    rightPanel.classList.toggle("hasQ", !!on);
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

  // ===== render questions (z X delete) =====

  function mkXButton() {
    const x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.textContent = "✕";
    x.title = "Usuń";
    return x;
  }

  function renderQuestions() {
    if (!qList) return;
    qList.innerHTML = "";

    // kafelek dodawania (bez limitu)
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
    addQ.addEventListener("click", async () => {
      try {
        const ord = nextQuestionOrd(questions);
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
    qList.appendChild(addQ);

    // lista pytań
    for (const q of questions) {
      const el = document.createElement("div");
      el.className = "qcard";
      if (q.id === activeQId) el.classList.add("active");
      el.style.position = "relative";

      const x = mkXButton();
      x.addEventListener("click", async (ev) => {
        ev.stopPropagation();

        const ok = confirm("Usunąć to pytanie i wszystkie jego odpowiedzi?");
        if (!ok) return;

        try {
          await deleteQuestionDeep(q.id);

          questions = await listQuestions(gameId);
          await refreshCounts();

          if (activeQId === q.id) {
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
      });

      el.innerHTML = `
        <div class="qord">Pytanie ${q.ord}</div>
        <div class="qprev"></div>
        <div class="qmeta"></div>
      `;
      el.appendChild(x);

      el.querySelector(".qprev").textContent = (q.text || "").trim() || `Pytanie ${q.ord}`;

      const meta = el.querySelector(".qmeta");
      if (!cfg.allowAnswers) {
        meta.textContent = "Tylko pytania";
      } else {
        const cnt = q.__answerCount ?? 0;
        meta.textContent = `${cnt}/${AN_MAX} odpowiedzi`;
      }

      el.addEventListener("click", async () => {
        activeQId = q.id;
        await loadAnswersForActive();
        renderQuestions();
        renderEditor();
      });

      qList.appendChild(el);
    }
  }

  // ===== remain counter (prepared) =====

  function renderRemainCounter(container) {
    if (!cfg.allowPoints) return;

    const sum = calcQuestionPoints(answers);
    const diff = SUM_PREPARED - sum;

    const remain = document.createElement("div");
    remain.className = "remainBox";
    remain.style.marginBottom = "10px";

    // kolorujemy tylko licznik (klasami)
    remain.classList.remove("remain-ok", "remain-over", "remain-under");
    if (diff === 0) remain.classList.add("remain-ok");
    else if (diff < 0) remain.classList.add("remain-over");
    else remain.classList.add("remain-under");

    if (diff === 0) remain.innerHTML = `<span>OK</span><b>${SUM_PREPARED}</b>`;
    else if (diff > 0) remain.innerHTML = `<span>ZOSTAŁO</span><b>${diff}</b>`;
    else remain.innerHTML = `<span>ZA DUŻO</span><b>${-diff}</b>`;

    container.appendChild(remain);
  }

  // ===== render answers (delete row, points save on blur) =====

  function renderAnswers() {
    if (!cfg.allowAnswers || !aList) return;

    aList.innerHTML = "";

    renderRemainCounter(aList);

    for (const a of answers) {
      const row = document.createElement("div");
      row.className = "arow";

      if (cfg.allowPoints) {
        row.innerHTML = `
          <input class="aText" type="text" maxlength="17" placeholder="ODP ${a.ord}">
          <input class="aPts" type="number" min="0" max="100" step="1" inputmode="numeric">
          <button class="aDel" type="button" title="Usuń">✕</button>
        `;
      } else {
        row.innerHTML = `
          <input class="aText" type="text" maxlength="17" placeholder="ODP ${a.ord}">
          <button class="aDel" type="button" title="Usuń">✕</button>
        `;
      }

      const iText = row.querySelector(".aText");
      iText.value = a.text || "";

      const iPts = cfg.allowPoints ? row.querySelector(".aPts") : null;
      if (iPts) iPts.value = Number(a.fixed_points) || 0;

      const bDel = row.querySelector(".aDel");

      // TEXT: zapis debounce + blur (Enter robi blur globalnie)
      const saveTextNow = async () => {
        try {
          const t = clip17(iText.value);
          // jeśli ktoś wyczyści -> nie zapisujemy pustego (constraint), tylko ustawiamy minimalny tekst
          const safe = t.trim() ? t : `ODP ${a.ord}`;
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

      // PTS (prepared): nie zapisuj w trakcie pisania, tylko:
      // - input: tylko odśwież licznik lokalnie
      // - blur: zapisz
      const savePtsNow = async () => {
        if (!cfg.allowPoints || !iPts) return;
        try {
          await updateAnswer(a.id, { fixed_points: clampPts(iPts.value) });

          // odśwież listę + licznik
          answers = await listAnswers(activeQId);
          renderAnswers();
          setMsg("Zapisano.");
        } catch (e) {
          console.error(e);
          setMsg("Błąd zapisu punktów (konsola).");
        }
      };

      iPts?.addEventListener("input", () => {
        // tylko lokalny update licznika
        a.fixed_points = clampPts(iPts.value);
        // odśwież licznik bez przeładowywania całej listy z DB
        renderAnswers();
      });
      iPts?.addEventListener("blur", savePtsNow);

      // DELETE: usuwa rekord (żadnego czyszczenia tekstu)
      bDel.addEventListener("click", async () => {
        const ok = confirm("Usunąć tę odpowiedź?");
        if (!ok) return;

        try {
          await deleteAnswer(a.id);
          answers = await listAnswers(activeQId);
          await refreshCounts();
          renderQuestions();
          renderAnswers();
          setMsg("Usunięto odpowiedź.");
        } catch (e) {
          console.error(e);
          setMsg("Błąd usuwania odpowiedzi (konsola).");
        }
      });

      aList.appendChild(row);
    }

    // add answer tile
    const canAdd = answers.length < AN_MAX;
    const addA = document.createElement("button");
    addA.type = "button";
    addA.className = "arow addTile";
    addA.disabled = !canAdd;

    addA.innerHTML = `
      <div style="font-weight:1000;">
        ${canAdd ? "+ Dodaj odpowiedź" : "Limit odpowiedzi osiągnięty"}
      </div>
      <div style="margin-left:auto; text-align:right; font-weight:900; opacity:.8;">
        ${answers.length}/${AN_MAX}
      </div>
    `;

    addA.addEventListener("click", async () => {
      if (!canAdd || !activeQId) return;
      try {
        const ord = nextAnswerOrd(answers);
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

    aList.appendChild(addA);
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

  // Q TEXT: debounce + blur
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

  // ===== Import modal (jedyny, z instrukcją w środku) =====

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

      setTxtMsg("Importuję…");

      // jeśli w tekście jest @Nazwa gry — ustaw w polu i zapisz
      if (parsed.name && gameName) {
        gameName.value = parsed.name;
        await saveNameIfChanged();
      }

      // start ord = max+1
      questions = await listQuestions(gameId);
      let qOrd = nextQuestionOrd(questions);

      for (const item of parsed.items) {
        const q = await createQuestion(gameId, qOrd);
        await updateQuestion(q.id, { text: normQ(item.qText) });

        if (cfg.allowAnswers) {
          let aOrd = 1;
          for (const a of item.answers || []) {
            if (aOrd > AN_MAX) break;

            const text = clip17(a.text);
            const pts =
              cfg.allowPoints && !cfg.ignoreImportPoints
                ? clampPts(a.points)
                : 0;

            await createAnswer(q.id, aOrd, text || `ODP ${aOrd}`, pts);
            aOrd++;
          }
        }

        qOrd++;
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

  // init
  await refreshCounts();
  questions = await listQuestions(gameId);
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
