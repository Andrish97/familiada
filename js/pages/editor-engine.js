// js/pages/editor-engine.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { parseQaText, clip as clipN } from "../core/text-import.js";

const RULES = { QN: 10, AN: 5 };

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
    .select("id,ord,text,mode")
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

async function createQuestion(gameId, ord, mode) {
  const { data, error } = await sb()
    .from("questions")
    .insert({
      game_id: gameId,
      ord,
      text: `Pytanie ${ord}`,
      mode, // "poll" | "fixed"
    })
    .select("id,ord,text,mode")
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
  const used = new Set(items.map(x => x.ord));
  for (let i = 1; i <= limit; i++) if (!used.has(i)) return i;
  return null;
}

/**
 * cfg:
 * {
 *   type: "poll_text" | "poll_points" | "prepared",
 *   mode: "poll" | "fixed"   // questions.mode
 *   allowAnswers: boolean,
 *   allowPoints: boolean,     // only for prepared
 *   ignoreImportPoints: boolean, // poll_points + poll_text
 * }
 */
export async function bootEditor(cfg) {
  // auth
  const user = await requireAuth("index.html");
  const who = $("who");
  if (who) who.textContent = user?.email || "—";

  const btnLogout = $("btnLogout");
  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  const btnBack = $("btnBack");
  btnBack?.addEventListener("click", () => (location.href = "builder.html"));

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

  // name
  const gameName = $("gameName");
  const btnSave = $("btnSave");
  if (gameName) gameName.value = game.name || "";

  btnSave?.addEventListener("click", async () => {
    try {
      setMsg("Zapisuję nazwę…");
      await saveGameName(gameId, gameName?.value || "");
      setMsg("Zapisano.");
    } catch (e) {
      console.error(e);
      setMsg("Błąd zapisu nazwy (konsola).");
    }
  });

  // state
  let questions = await listQuestions(gameId);
  let activeQId = questions[0]?.id || null;
  let activeOrd = questions[0]?.ord || 1;
  let answers = activeQId && cfg.allowAnswers ? await listAnswers(activeQId) : [];

  // UI refs
  const qList = $("qList");
  const qText = $("qText");
  const aList = $("aList");

  const typeBadge = $("typeBadge");
  if (typeBadge) {
    typeBadge.textContent =
      cfg.type === "prepared" ? "Preparowany" :
      cfg.type === "poll_points" ? "Sondaż (wybór)" :
      "Typowy sondaż";
  }

  // “lock” zostawiamy na przyszłość (jeśli kiedyś zrobisz blokady)
  const lockBadge = $("lockBadge");
  if (lockBadge) lockBadge.style.display = "none";

  function renderQuestions() {
    if (!qList) return;
    qList.innerHTML = "";

    // kafelek dodawania gdy pusto
    if (!questions.length) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "qcard";
      tile.innerHTML = `
        <div class="qprev">+ Dodaj pierwsze pytanie</div>
        <div class="qmeta">Limit: ${RULES.QN}</div>
      `;
      qList.appendChild(tile);
      return;
    }

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
        const cnt = (q.__answerCount ?? 0);
        meta.textContent = `${cnt}/${RULES.AN} odpowiedzi`;
      } else {
        meta.textContent = `Tylko pytania`;
      }

      el.addEventListener("click", async () => {
        activeQId = q.id;
        activeOrd = q.ord;
        renderQuestions();
        await loadAnswersForActive();
        renderEditor();
      });

      qList.appendChild(el);
    }
  }

  async function refreshCounts() {
    if (!cfg.allowAnswers) {
      questions = await listQuestions(gameId);
      return;
    }
    // policz odpowiedzi per pytanie (tanio: dociągamy tylko ordy, i liczymy po stronie frontu)
    const qs = await listQuestions(gameId);
    for (const q of qs) {
      const as = await listAnswers(q.id);
      q.__answerCount = as.filter(a => (a.text || "").trim()).length;
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

  function renderAnswers() {
    if (!cfg.allowAnswers) return;
    if (!aList) return;
    aList.innerHTML = "";

    // kafelek gdy pusto
    if (!answers.length) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "arow";
      tile.style.cursor = "pointer";
      tile.innerHTML = `<div style="font-weight:1000;">+ Dodaj pierwszą odpowiedź</div>`;
      aList.appendChild(tile);
      return;
    }

    for (const a of answers) {✕
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

      const save = async () => {
        try {
          setMsg("Zapisuję…");
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

      iText.addEventListener("input", () => {
        if (iText.value.length > 17) iText.value = iText.value.slice(0, 17);
        save();
      });

      iPts?.addEventListener("input", () => {
        const v = Number(iPts.value);
        iPts.classList.toggle("tooMuch", isNum(v) && v > 100);
        save();
      });

      bDel.addEventListener("click", async () => {
        iText.value = "";
        if (iPts) iPts.value = "0";
        await save();
      });

      aList.appendChild(row);
    }
  }

  function renderEditor() {
    // pusto
    if (!activeQId) {
      qText && (qText.value = "");
      if (aList) aList.innerHTML = "";
      return;
    }

    const q = questions.find(x => x.id === activeQId);
    if (qText) qText.value = q?.text || "";

    renderAnswers();
  }

  // zapis pytania
  qText?.addEventListener("input", async () => {
    if (!activeQId) return;
    try {
      const t = normQ(qText.value);
      await updateQuestion(activeQId, { text: t, mode: cfg.mode });
      const q = questions.find(x => x.id === activeQId);
      if (q) q.text = t;
      renderQuestions();
      setMsg("Zapisano.");
    } catch (e) {
      console.error(e);
      setMsg("Błąd zapisu pytania (konsola).");
    }
  });

  // ====== Import TXT ======
  const btnImportTxt = $("btnImportTxt");
  const btnHowTxt = $("btnHowTxt");
  const btnHowClose = $("btnHowClose");

  const txtLoadFile = $("btnTxtLoadFile");
  const txtFile = $("txtFile");
  const txtTa = $("txtTa");
  const txtMsg = $("txtMsg");
  const btnTxtImport = $("btnTxtImport");
  const btnTxtClose = $("btnTxtClose");

  const setTxtMsg = (t) => { if (txtMsg) txtMsg.textContent = t || ""; };

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
      if (!f) { setTxtMsg("Wybierz plik TXT."); return; }
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
      if (!raw.trim()) { setTxtMsg("Wklej treść albo wczytaj plik."); return; }

      const parsed = parseQaText(raw);
      if (!parsed.ok) { setTxtMsg(parsed.error || "Błąd formatu."); return; }

      setTxtMsg("Importuję…");

      // Import: dla poll_text bierzemy tylko pytania.
      // Dla poll_points: pytania+odpowiedzi, punkty ignorujemy.
      // Dla prepared: pytania+odpowiedzi+punkty (clamp 0..100)
      await refreshCounts();

      // zaczynamy od następnego wolnego ord
      let qOrd = nextOrd(questions, RULES.QN);
      if (!qOrd) { setTxtMsg(`Brak miejsca — limit pytań ${RULES.QN}.`); return; }

      for (const item of parsed.items) {
        if (!qOrd) break;

        const q = await createQuestion(gameId, qOrd, cfg.mode);
        await updateQuestion(q.id, { text: normQ(item.qText), mode: cfg.mode });

        if (cfg.allowAnswers) {
          let aOrd = 1;
          for (const a of (item.answers || [])) {
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

        qOrd = nextOrd(await listQuestions(gameId), RULES.QN);
      }

      // refresh
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
