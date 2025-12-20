import { sb } from "../core/supabase.js";

const countEl = document.getElementById("count");
const MAXLEN = 17;
let busy = false;

function updateCount() {
  if (!countEl || !answerInput) return;
  const n = (answerInput.value || "").length;
  countEl.textContent = `${n}/${MAXLEN}`;
}
// normalizacja do zliczania: trim + lower, bez grzebania w środku
function normForCount(s) {
  return String(s ?? "").trim().toLowerCase();
}

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const title = document.getElementById("title");
const sub = document.getElementById("sub");

const qbox = document.getElementById("qbox");
const qtext = document.getElementById("qtext");
const prog = document.getElementById("prog");

const answerInput = document.getElementById("answerInput");
const btnSend = document.getElementById("btnSend");

const closed = document.getElementById("closed");

function token() {
  const k = `fam_poll_token_${gameId}`;
  let t = localStorage.getItem(k);
  if (!t) {
    t = Math.random().toString(16).slice(2) + Date.now().toString(16);
    localStorage.setItem(k, t);
  }
  return t;
}

let data = null;
let idx = 0;
let busy = false;

function showBox(on){
  qbox.style.display = on ? "" : "none";
  closed.style.display = on ? "none" : "";
}

function showClosed(msg){
  showBox(false);
  closed.textContent = msg || "Sondaż jest zamknięty. Dziękujemy!";
  sub.textContent = "Ten sondaż nie przyjmuje już odpowiedzi.";
}

function showError(msg){
  showBox(false);
  closed.textContent = msg || "Nie udało się wczytać sondażu.";
  sub.textContent = "—";
}

function render() {
  const g = data?.game;
  title.textContent = g?.name ? `Sondaż: ${g.name}` : "Sondaż";

  if (!g) return showError("Brak danych gry.");
  if (g.type !== "poll_text") return showError("To nie jest sondaż tekstowy.");
  if (g.status !== "poll_open") return showClosed("Sondaż jest zamknięty. Dziękujemy!");

  const qlist = data?.questions || [];
  if (!qlist.length) return showError("Brak pytań do sondażu.");

  if (idx >= qlist.length) {
    sub.textContent = "Dzięki! Udzieliłeś(aś) odpowiedzi na wszystkie pytania.";
    showBox(false);
    closed.textContent = "Dziękujemy za udział w sondażu!";
    return;
  }

  const q = qlist[idx];

  showBox(true);
  sub.textContent = "Wpisz odpowiedź (starannie).";
  qtext.textContent = q.text || "—";
  prog.textContent = `Pytanie ${idx + 1} / ${qlist.length}`;

  if (answerInput) answerInput.value = "";
  answerInput?.focus();
  updateCount();
}

async function send() {
  if (busy) return;
  if (!data || !data.game || data.game.status !== "poll_open") {
    return showClosed("Sondaż jest zamknięty. Dziękujemy!");
  }

  const qlist = data.questions || [];
  const q = qlist[idx];
  if (!q) return;

  // 1) pobierz raw
  let raw = String(answerInput?.value ?? "");

  // 2) utnij twardo do 17 (na wypadek obejścia maxlength)
  if (raw.length > MAXLEN) raw = raw.slice(0, MAXLEN);

  // 3) trimujemy TYLKO początek/koniec (w środku zostaje)
  raw = raw.trim();

  // 4) po trimie może się okazać puste
  if (!raw) {
    setSub?.("Wpisz odpowiedź (max 17 znaków)."); // jeśli masz sub helper, inaczej usuń
    return;
  }

  // 5) normalizacja do zliczania / klucza
  const norm = normForCount(raw); // trim + lower
  if (!norm) return;

  // UX: opcjonalnie wstaw “przycięty” tekst z powrotem do inputa
  answerInput.value = raw;
  updateCount?.();

  // 6) wysyłka
  busy = true;
  btnSend && (btnSend.disabled = true);

  try {
    // Tu masz 2 warianty zależnie od tego, jak zapisujesz tekstowe odpowiedzi.
    // A) jeśli masz RPC np. poll_text_submit / poll_text_vote — podstaw nazwę:
    const { error } = await sb().rpc("poll_text_submit", {
      p_game_id: gameId,
      p_key: key,
      p_question_ord: q.ord,       // albo q.id — zależy od backendu
      p_answer_raw: raw,           // oryginał (ładny do wyświetlania)
      p_answer_norm: norm,         // klucz do zliczania
      p_voter_token: token(),
    });
    if (error) throw error;

    // 7) przejście dalej
    answerInput.value = "";
    updateCount?.();
    idx += 1;
    render();
  } catch (e) {
    const m = (e?.message || String(e)).toLowerCase();
    if (m.includes("poll closed") || m.includes("poll_closed")) {
      showClosed("Sondaż jest zamknięty. Dziękujemy!");
      return;
    }
    console.error("[poll-text] send error:", e);
    alert("Nie udało się wysłać odpowiedzi. Spróbuj ponownie.");
  } finally {
    busy = false;
    btnSend && (btnSend.disabled = false);
  }
}

async function load() {
  if (!gameId || !key) return showError("Nieprawidłowy link sondażu.");

  try {
    const res = await sb().rpc("get_poll_game", { p_game_id: gameId, p_key: key });
    data = res.data;
    idx = 0;
    render();
  } catch {
    showError("Nie udało się wczytać sondażu.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  btnSend?.addEventListener("click", send);
  answerInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); send(); }
  });
  answerInput?.addEventListener("input", () => {
    // maxlength w HTML już pilnuje, ale to zabezpieczenie na wypadek wklejek/bugów
    if (answerInput.value.length > MAXLEN) {
      answerInput.value = answerInput.value.slice(0, MAXLEN);
    }
    updateCount();
  });
  load();
});
