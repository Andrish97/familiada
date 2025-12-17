// js/pages/editor.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Edytor Familiady jest dostępny tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

/* ===== DOM ===== */
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");

const gameName = document.getElementById("gameName");
const btnSaveName = document.getElementById("btnSaveName");

const qList = document.getElementById("qList");
const rightPanel = document.querySelector(".rightPanel");
const qText = document.getElementById("qText");
const btnAddQ = document.getElementById("btnAddQ");

const aHead = document.getElementById("aHead");
const aList = document.getElementById("aList");
const btnAddA = document.getElementById("btnAddA");

const msg = document.getElementById("msg");

const gameKindBadge = document.getElementById("gameKindBadge");
const lockBadge = document.getElementById("lockBadge");
const hintFixed = document.getElementById("hintFixed");
const hintPoll = document.getElementById("hintPoll");

const remainRow = document.getElementById("remainRow");
const remainVal = document.getElementById("remainVal");

/* ===== RULES ===== */
const AN_MIN = 5;
const AN_MAX = 6;
const MAX_ANSWER_LEN = 17;

/* ===== STATE ===== */
let currentUser = null;
let game = null;
let questions = [];
let activeQ = null;
let answers = [];

/* ===== helpers ===== */
function setMsg(t) {
  if (!msg) return;
  msg.textContent = t || "";
  if (t) setTimeout(() => (msg.textContent = ""), 1800);
}

function clip(s, n) {
  const t = String(s ?? "");
  return t.length <= n ? t : t.slice(0, n);
}

function isPoll() { return game?.kind === "poll"; }
function isFixed() { return game?.kind === "fixed"; }
function isLocked() { return isPoll() && game?.status === "poll_open"; }

function clampInt(v, min, max) {
  const x = Number(v);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function kindPL(kind) {
  return kind === "poll" ? "SONDAŻOWA" : "LOKALNA";
}

function calcSum() {
  return (answers || []).reduce((s, a) => s + (Number(a.fixed_points) || 0), 0);
}

function updateRemaining() {
  if (!remainRow || !remainVal) return;

  if (!isFixed() || !activeQ) {
    remainRow.style.display = "none";
    return;
  }

  remainRow.style.display = "";
  const left = Math.max(0, 100 - calcSum());
  remainVal.textContent = String(left);
}

function updateBadges() {
  if (!game) return;

  if (gameKindBadge) gameKindBadge.textContent = kindPL(game.kind);
  document.body.classList.toggle("is-poll", isPoll());

  if (lockBadge) lockBadge.style.display = isLocked() ? "" : "none";
  if (hintFixed) hintFixed.style.display = isFixed() ? "" : "none";
  if (hintPoll) hintPoll.style.display = isPoll() ? "" : "none";

  if (remainRow) remainRow.style.display = (isFixed() && !!activeQ) ? "" : "none";
}

function scrollAnswersToBottom() {
  if (!aList) return;
  requestAnimationFrame(() => {
    aList.scrollTop = aList.scrollHeight;
  });
}

/* ===== DB ===== */
async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function updateGameName(name) {
  const { error } = await sb().from("games").update({ name }).eq("id", gameId);
  if (error) throw error;
}

async function loadQuestions() {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function insertQuestion() {
  const ord = questions.length ? Math.max(...questions.map(q => q.ord || 0)) + 1 : 1;

  const { data, error } = await sb()
    .from("questions")
    .insert({
      game_id: gameId,
      ord,
      text: `Pytanie ${ord}`,
      mode: isPoll() ? "poll" : "fixed",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function updateQuestion(qid, patch) {
  const { error } = await sb().from("questions").update(patch).eq("id", qid);
  if (error) throw error;
}

async function deleteQuestion(qid) {
  const { error } = await sb().from("questions").delete().eq("id", qid);
  if (error) throw error;
}

async function loadAnswers(qid) {
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function insertAnswer(qid, ord) {
  const row = { question_id: qid, ord, text: "ODPOWIEDŹ", fixed_points: 0 };
  const { data, error } = await sb()
    .from("answers")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function updateAnswer(aid, patch) {
  const { error } = await sb().from("answers").update(patch).eq("id", aid);
  if (error) throw error;
}

async function deleteAnswer(aid) {
  const { error } = await sb().from("answers").delete().eq("id", aid);
  if (error) throw error;
}

/* ===== normalize: min 5, max 6, ord 1..n ===== */
async function normalizeAnswersForActiveQ() {
  if (!activeQ) return;

  answers = await loadAnswers(activeQ.id);

  // dopychamy do min 5
  while (answers.length < AN_MIN) {
    const ord = answers.length ? Math.max(...answers.map(a => a.ord || 0)) + 1 : 1;
    await insertAnswer(activeQ.id, ord);
    answers = await loadAnswers(activeQ.id);
  }

  // przycinamy do max 6 (usuwa nadmiar z końca po ord)
  if (answers.length > AN_MAX) {
    const sorted = [...answers].sort((a, b) => (a.ord || 0) - (b.ord || 0));
    const toDel = sorted.slice(AN_MAX);
    for (const a of toDel) await deleteAnswer(a.id);
    answers = await loadAnswers(activeQ.id);
  }

  // ord = 1..n
  const sorted2 = [...answers].sort((a, b) => (a.ord || 0) - (b.ord || 0));
  for (let i = 0; i < sorted2.length; i++) {
    const want = i + 1;
    if (sorted2[i].ord !== want) {
      await updateAnswer(sorted2[i].id, { ord: want });
    }
  }

  answers = await loadAnswers(activeQ.id);
}

/* ===== render ===== */
function renderQuestions() {
  if (!qList) return;
  qList.innerHTML = "";

  for (const q of questions) {
    const el = document.createElement("div");
    el.className = "qcard" + (activeQ?.id === q.id ? " active" : "");
    el.innerHTML = `
      <div class="qord">#${q.ord}</div>
      <div class="qprev"></div>
      <div class="qmode">${isPoll() ? "Sondażowa" : "Lokalna"}</div>
    `;
    el.querySelector(".qprev").textContent = q.text || "—";

    el.addEventListener("click", async (e) => {
      // SHIFT+klik: usuń pytanie
      if (e.shiftKey) {
        if (isLocked()) {
          setMsg("Sondaż jest otwarty — nie można usuwać.");
          return;
        }
        const ok = await confirmModal({
          title: "Usuń pytanie",
          text: "Usunąć pytanie i wszystkie odpowiedzi?",
          okText: "Usuń",
          cancelText: "Anuluj",
        });
        if (!ok) return;

        try {
          await deleteQuestion(q.id);
          if (activeQ?.id === q.id) activeQ = null;
          await refreshAll();
          setMsg("Usunięto pytanie.");
        } catch (err) {
          console.error("[editor] delete question error:", err);
          setMsg("Nie udało się usunąć pytania.");
        }
        return;
      }

      activeQ = q;
      await loadActive();
    });

    qList.appendChild(el);
  }
}

function renderEditorShell() {
  if (!rightPanel) return;

  if (!activeQ) {
    rightPanel.classList.remove("hasQ");
    updateBadges();
    updateRemaining();
    if (btnAddA) btnAddA.disabled = true;
    return;
  }

  rightPanel.classList.add("hasQ");

  const locked = isLocked();
  if (qText) qText.disabled = locked;
  if (btnAddQ) btnAddQ.disabled = locked;
  if (btnAddA) btnAddA.disabled = locked;

  if (qText) qText.value = activeQ.text || "";
  updateBadges();
  updateRemaining();
}

function renderAnswers() {
  if (!aList) return;
  aList.innerHTML = "";
  if (!activeQ) return;

  const locked = isLocked();

  // przycisk +Odpowiedź: aktywny tylko gdy < 6
  if (btnAddA) btnAddA.disabled = locked || answers.length >= AN_MAX;

  for (const a of answers) {
    const row = document.createElement("div");
    row.className = "arow";

    if (isFixed()) {
      row.innerHTML = `
        <input class="aText" />
        <input class="aPts" type="number" min="0" max="100" step="1" inputmode="numeric" />
        <button class="aDel" type="button" title="Usuń / Wyczyść" ${locked ? "disabled" : ""}>✕</button>
      `;
    } else {
      row.innerHTML = `
        <input class="aText" />
        <button class="aDel" type="button" title="Usuń / Wyczyść" ${locked ? "disabled" : ""}>✕</button>
      `;
    }

    const aText = row.querySelector(".aText");
    const aPts = row.querySelector(".aPts");
    const aDel = row.querySelector(".aDel");

    if (aText) aText.value = a.text || "";
    if (aPts) aPts.value = String(typeof a.fixed_points === "number" ? a.fixed_points : 0);

    // limit 17 znaków
    aText?.addEventListener("input", () => {
      const t = String(aText.value || "");
      if (t.length > MAX_ANSWER_LEN) {
        aText.value = t.slice(0, MAX_ANSWER_LEN);
        setMsg(`Odpowiedź max ${MAX_ANSWER_LEN} znaków.`);
      }
    });

    aText?.addEventListener("change", async () => {
      if (locked) return;
      const t = clip(aText.value, MAX_ANSWER_LEN).trim() || "ODPOWIEDŹ";
      aText.value = t;

      try {
        await updateAnswer(a.id, { text: t });
        a.text = t;
      } catch (e) {
        console.error("[editor] update answer text error:", e);
        setMsg("Nie udało się zapisać tekstu.");
      }
    });

    // punkty tylko dla lokalnej
    if (isFixed() && aPts) {
      aPts.disabled = locked;

      const applyLive = async (commit) => {
        if (locked) return;

        let cur = clampInt(aPts.value, 0, 100);

        // max 100 w pytaniu: ograniczamy bieżącą odpowiedź
        const otherSum = answers
          .filter(x => x.id !== a.id)
          .reduce((s, x) => s + (Number(x.fixed_points) || 0), 0);

        const maxAllowed = Math.max(0, 100 - otherSum);
        const next = Math.min(cur, maxAllowed);

        if (next !== cur) {
          aPts.value = String(next);
          setMsg("Suma nie może przekroczyć 100.");
        }

        a.fixed_points = next;
        updateRemaining();

        if (commit) {
          try {
            await updateAnswer(a.id, { fixed_points: next });
          } catch (e) {
            console.error("[editor] update points error:", e);
            setMsg("Nie udało się zapisać punktów.");
          }
        }
      };

      aPts.addEventListener("input", () => { applyLive(false); });
      aPts.addEventListener("change", () => { applyLive(true); });
    }

    // ✕ : usuń jeśli >5, inaczej wyczyść
    aDel.disabled = locked;
    aDel.addEventListener("click", async () => {
      if (locked) return;

      try {
        answers = await loadAnswers(activeQ.id);

        if (answers.length > AN_MIN) {
          const ok = await confirmModal({
            title: "Usuń odpowiedź",
            text: "Usunąć tę odpowiedź? (min. 5 odpowiedzi musi zostać)",
            okText: "Usuń",
            cancelText: "Anuluj",
          });
          if (!ok) return;

          await deleteAnswer(a.id);
          await normalizeAnswersForActiveQ();
          renderAnswers();
          updateRemaining();
          setMsg("Usunięto odpowiedź.");
          return;
        }

        // przy 5: wyczyść
        const ok = await confirmModal({
          title: "Wyczyść odpowiedź",
          text: isFixed()
            ? "Wyczyścić tekst i ustawić 0 pkt?"
            : "Wyczyścić tekst?",
          okText: "Wyczyść",
          cancelText: "Anuluj",
        });
        if (!ok) return;

        const patch = isFixed()
          ? { text: "ODPOWIEDŹ", fixed_points: 0 }
          : { text: "ODPOWIEDŹ" };

        await updateAnswer(a.id, patch);
        a.text = "ODPOWIEDŹ";
        if (isFixed()) a.fixed_points = 0;

        renderAnswers();
        updateRemaining();
        setMsg("Wyczyszczono.");
      } catch (e) {
        console.error("[editor] del/clear answer error:", e);
        setMsg("Nie udało się wykonać operacji.");
      }
    });

    aList.appendChild(row);
  }

  updateRemaining();
}

/* ===== flows ===== */
async function loadActive() {
  questions = await loadQuestions();
  activeQ = questions.find(x => x.id === activeQ?.id) || null;

  if (activeQ) {
    await normalizeAnswersForActiveQ();
  } else {
    answers = [];
  }

  renderQuestions();
  renderEditorShell();
  renderAnswers();
}

async function refreshAll() {
  game = await loadGame();
  if (gameName) gameName.value = game.name || "Familiada";

  updateBadges();

  questions = await loadQuestions();
  renderQuestions();

  // jeśli aktywne pytanie zniknęło
  if (activeQ) {
    activeQ = questions.find(x => x.id === activeQ.id) || null;
  }

  renderEditorShell();

  if (activeQ) {
    await normalizeAnswersForActiveQ();
  } else {
    answers = [];
  }

  renderAnswers();
}

/* ===== events ===== */
document.addEventListener("DOMContentLoaded", async () => {
  if (!gameId) {
    alert("Brak parametru id w URL (editor.html?id=...).");
    location.href = "builder.html";
    return;
  }

  currentUser = await requireAuth("index.html");
  if (who) who.textContent = currentUser?.email || "—";

  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnBack?.addEventListener("click", () => location.href = "builder.html");

  btnSaveName?.addEventListener("click", async () => {
    if (isLocked()) {
      setMsg("Sondaż jest otwarty — edycja zablokowana.");
      return;
    }
    const name = (gameName?.value || "").trim() || "Familiada";
    try {
      await updateGameName(name);
      setMsg("Zapisano nazwę.");
      await refreshAll();
    } catch (e) {
      console.error("[editor] save name error:", e);
      setMsg("Nie udało się zapisać nazwy.");
    }
  });

  btnAddQ?.addEventListener("click", async () => {
    if (isLocked()) {
      setMsg("Sondaż jest otwarty — edycja zablokowana.");
      return;
    }
    try {
      const q = await insertQuestion();
      activeQ = q;
      await loadActive();
      setMsg("Dodano pytanie.");
    } catch (e) {
      console.error("[editor] add question error:", e);
      setMsg("Nie udało się dodać pytania.");
    }
  });

  qText?.addEventListener("change", async () => {
    if (!activeQ) return;
    if (isLocked()) {
      setMsg("Sondaż jest otwarty — edycja zablokowana.");
      return;
    }
    const t = (qText.value || "").trim() || "Nowe pytanie";
    try {
      await updateQuestion(activeQ.id, { text: t });
      activeQ.text = t;
      renderQuestions();
      setMsg("Zapisano pytanie.");
    } catch (e) {
      console.error("[editor] update question error:", e);
      setMsg("Nie udało się zapisać pytania.");
    }
  });

  // + Odpowiedź (do max 6)
  btnAddA?.addEventListener("click", async () => {
    if (!activeQ) return;
    if (isLocked()) {
      setMsg("Sondaż jest otwarty — edycja zablokowana.");
      return;
    }

    try {
      answers = await loadAnswers(activeQ.id);
      if (answers.length >= AN_MAX) {
        setMsg(`Maksymalnie ${AN_MAX} odpowiedzi.`);
        return;
      }

      const ord = answers.length ? Math.max(...answers.map(a => a.ord || 0)) + 1 : 1;
      await insertAnswer(activeQ.id, ord);

      await normalizeAnswersForActiveQ();
      renderAnswers();
      scrollAnswersToBottom();
      setMsg("Dodano odpowiedź.");
    } catch (e) {
      console.error("[editor] add answer error:", e);
      setMsg("Nie udało się dodać odpowiedzi (sprawdź konsolę).");
    }
  });

  await refreshAll();
});
