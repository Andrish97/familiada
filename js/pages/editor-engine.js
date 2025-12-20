// js/pages/editor-engine.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { parseQaText, clip as clipN } from "../core/text-import.js";
import { canEnterEdit, RULES as GV_RULES } from "../core/game-validate.js";

const QN_MIN = GV_RULES.QN_MIN; // 10
const AN_MIN = GV_RULES.AN_MIN; // 3
const AN_MAX = GV_RULES.AN_MAX; // 6

const $ = (id) => document.getElementById(id);

const clip17 = (s) => clipN(String(s ?? ""), 17);
const normQ = (s) => String(s ?? "").trim().slice(0, 200);
const normName = (s) =>
  (String(s ?? "Nowa Familiada").trim() || "Nowa Familiada").slice(0, 80);

const clampPts = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
};

function calcQuestionPoints(answers) {
  let sum = 0;
  for (const a of answers) {
    const p = Number(a.fixed_points);
    if (!Number.isFinite(p)) continue;
    if (p < 0) continue;
    sum += p;
  }
  return sum;
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

function setMsg(t) {
  const el = $("msg");
  if (el) el.textContent = t || "";
}

function openOverlay(id, on) {
  const el = $(id);
  if (!el) return;
  el.style.display = on ? "" : "none";
  document.body.classList.toggle("modalOpen", !!on); // jak w builder (opcjonalnie, jeśli masz CSS)
}

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
  const { error } = await sb()
    .from("games")
    .update({ name: normName(name) })
    .eq("id", gameId);
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

async function createAnswer(questionId, ord, text, fixed_points) {
  const { data, error } = await sb()
    .from("answers")
    .insert({ question_id: questionId, ord, text, fixed_points })
    .select("id,ord,text,fixed_points")
    .single();
  if (error) throw error;
  return data;
}

async function updateAnswer(aId, patch) {
  const { error } = await sb().from("answers").update(patch).eq("id", aId);
  if (error) throw error;
}

function nextQuestionOrd(items) {
  let max = 0;
  for (const x of items) max = Math.max(max, Number(x.ord) || 0);
  return max + 1;
}

function nextAnswerOrd(items, limit) {
  const used = new Set(items.map((x) => x.ord));
  for (let i = 1; i <= limit; i++) if (!used.has(i)) return i;
  return null;
}

/**
 * Enter = blur (globalnie w edytorze) dla INPUTów.
 * Nie dotykamy TEXTAREA (żeby Enter robił nową linię w pytaniu).
 */
function installEnterAsBlur() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

    const t = e.target;
    if (!t) return;

    // tylko inputy (text/number itd.)
    if (t.tagName === "INPUT") {
      e.preventDefault();
      t.blur();
    }
  });
}

export async function bootEditor(cfg) {
  installEnterAsBlur();

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
    if (game.type === "prepared")
      location.href = `editor-prepared.html?id=${encodeURIComponent(gameId)}`;
    if (game.type === "poll_text")
      location.href = `editor-poll-text.html?id=${encodeURIComponent(gameId)}`;
    if (game.type === "poll_points")
      location.href = `editor-poll-points.html?id=${encodeURIComponent(gameId)}`;
    return;
  }

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

  // ===== badge =====
  const badge = $("kindBadge") || $("typeBadge");
  if (badge) {
    badge.textContent =
      cfg.type === "prepared"
        ? "Preparowany"
        : cfg.type === "poll_points"
        ? "Punktacja odpowiedzi"
        : "Typowy sondaż";
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

  window.addEventListener("beforeunload", () => {
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

  function buildRemainBox() {
    const sum = calcQuestionPoints(answers);
    const diff = 100 - sum;

    const remain = document.createElement("div");
    remain.className = "remainBox";
    remain.style.marginBottom = "10px";
    remain.classList.remove("ok", "over");

    if (diff === 0) {
      remain.classList.add("ok");
      remain.innerHTML = `<span>OK</span><b>100</b>`;
    } else if (diff > 0) {
      // default (żółty)
      remain.innerHTML = `<span>ZOSTAŁO</span><b>${diff}</b>`;
    } else {
      remain.classList.add("over");
      remain.innerHTML = `<span>ZA DUŻO</span><b>${-diff}</b>`;
    }

    return remain;
  }

  // ===== render questions =====
  function renderQuestions() {
    if (!qList) return;
    qList.innerHTML = "";

    // kafelek dodawania pytania (bez limitu)
    const qCount = questions.length;
    const meetsMin = qCount >= QN_MIN;

    const addQBtn = document.createElement("button");
    addQBtn.type = "button";
    addQBtn.className = "qcard";
    addQBtn.innerHTML = `
      <div class="qprev">+ Dodaj pytanie</div>
      <div class="qmeta">
        ${meetsMin ? "Minimum spełnione" : `Wymagane minimum: ${QN_MIN} (masz ${qCount})`}
      </div>
    `;

    addQBtn.addEventListener("click", async () => {
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

    qList.appendChild(addQBtn);

    for (const q of questions) {
      const el = document.createElement("div");
      el.className = "qcard";
      if (q.id === activeQId) el.classList.add("active");

      el.innerHTML = `
        <div class="qord">Pytanie ${q.ord}</div>
        <div class="qprev"></div>
        <div class="qmeta"></div>
      `;
      el.querySelector(".qprev").textContent =
        (q.text || "").trim() || `Pytanie ${q.ord}`;

      const meta = el.querySelector(".qmeta");
      if (cfg.allowAnswers) {
        const cnt = q.__answerCount ?? 0;
        meta.textContent = `${cnt}/${AN_MAX} odpowiedzi`;
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

  function renderAnswers() {
    if (!cfg.allowAnswers) return;
    if (!aList) return;

    aList.innerHTML = "";

    if (cfg.allowPoints) {
      aList.appendChild(buildRemainBox());
    }

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

      // tekst: zapis na debounce
      const saveTextNow = async () => {
        try {
          const patch = { text: clip17(iText.value) };
          if (!cfg.allowPoints) patch.fixed_points = 0;

          await updateAnswer(a.id, patch);
          setMsg("Zapisano.");
        } catch (e) {
          console.error(e);
          setMsg("Błąd zapisu (konsola).");
        }
      };
      const saveText = debounce(saveTextNow, 350);

      // punkty: zapis TYLKO na blur
      const savePointsNow = async () => {
        if (!cfg.allowPoints || !iPts) return;
        try {
          const newPts = clampPts(iPts.value);
          await updateAnswer(a.id, { fixed_points: newPts });

          answers = await listAnswers(activeQId);
          renderAnswers();
          setMsg("Zapisano.");
        } catch (e) {
          console.error(e);
          setMsg("Błąd zapisu punktów (konsola).");
        }
      };

      iText.addEventListener("input", () => {
        if (iText.value.length > 17) iText.value = iText.value.slice(0, 17);
        setMsg("Piszesz…");
        saveText();
      });

      if (iPts) {
        iPts.addEventListener("blur", savePointsNow);

        // nie zmieniamy kolorów inputa punktów — tylko licznik (remainBox)
        // (czyli żadnych .tooMuch i tym podobnych)
        iPts.addEventListener(
          "wheel",
          (e) => {
            e.preventDefault();
          },
          { passive: false }
        );
      }

      bDel.addEventListener("click", async () => {
        try {
          iText.value = "";
          if (iPts) iPts.value = "0";

          await updateAnswer(a.id, { text: "", fixed_points: 0 });

          if (cfg.allowPoints) {
            answers = await listAnswers(activeQId);
            renderAnswers();
          } else {
            setMsg("Zapisano.");
          }
        } catch (e) {
          console.error(e);
          setMsg("Błąd zapisu (konsola).");
        }
      });

      aList.appendChild(row);
    }

    // add-tile
    const canAddA = answers.length < AN_MAX;
    const addABtn = document.createElement("button");
    addABtn.type = "button";
    addABtn.className = "arow addTile";
    addABtn.disabled = !canAddA;

    addABtn.style.cursor = canAddA ? "pointer" : "not-allowed";
    addABtn.style.opacity = canAddA ? "1" : ".55";
    addABtn.innerHTML = `
      <div style="font-weight:1000;">
        ${canAddA ? "+ Dodaj odpowiedź" : "Limit odpowiedzi osiągnięty"}
      </div>
      <div style="margin-left:auto; text-align:right; font-weight:900; opacity:.8;">
        ${answers.length}/${AN_MAX}
      </div>
    `;

    addABtn.addEventListener("click", async () => {
      if (!canAddA || !activeQId) return;
      try {
        const ord = nextAnswerOrd(answers, AN_MAX);
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

  // pytanie: zapis debounced (textarea ma normalny Enter)
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

  // ===== Import (JEDEN MODAL) =====
  const btnImportTxt = $("btnImportTxt");

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
        setTxtMsg("Wybierz plik TXT albo wklej treść w pole niżej.");
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

      // @Nazwa Gry => ustaw i zapisz nazwę
      if (parsed.name && gameName) {
        const nm = normName(parsed.name);
        gameName.value = nm;
        await saveGameName(gameId, nm);
        lastSavedName = nm;
      }

      let qOrd = nextQuestionOrd(await listQuestions(gameId));

      for (const item of parsed.items) {
        const q = await createQuestion(gameId, qOrd);
        await updateQuestion(q.id, { text: normQ(item.qText) });

        if (cfg.allowAnswers) {
          let aOrd = 1;
          for (const a of item.answers || []) {
            if (aOrd > AN_MAX) break;

            const text = clip17(a.text);
            const pts =
              cfg.allowPoints && !cfg.ignoreImportPoints ? clampPts(a.points) : 0;

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

      openOverlay("txtImportOverlay", false);
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
