// js/pages/polls.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";
import { TYPES, STATUS, RULES } from "../core/game-validate.js";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";

guardDesktopOnly({ message: "Sondaże są dostępne tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");
const msg = document.getElementById("msg");

const cardMain = document.getElementById("cardMain");
const cardEmpty = document.getElementById("cardEmpty");

const chipKind = document.getElementById("chipKind");
const chipStatus = document.getElementById("chipStatus");

const gName = document.getElementById("gName");
const gMeta = document.getElementById("gMeta");
const hintTop = document.getElementById("hintTop");

const pollLinkEl = document.getElementById("pollLink");
const qrBox = document.getElementById("qr");

const btnCopy = document.getElementById("btnCopy");
const btnOpen = document.getElementById("btnOpen");
const btnOpenQr = document.getElementById("btnOpenQr");

const btnPollAction = document.getElementById("btnPollAction");
const btnPreview = document.getElementById("btnPreview");

const resultsCard = document.getElementById("resultsCard");
const resultsMeta = document.getElementById("resultsMeta");
const resultsList = document.getElementById("resultsList");

let game = null;

/* ================= UI helpers ================= */

function setMsg(t) {
  if (!msg) return;
  msg.textContent = t || "";
  if (t) setTimeout(() => (msg.textContent = ""), 2600);
}

function typePL(t) {
  if (t === TYPES.POLL_TEXT) return "SONDAŻ (TEKST)";
  if (t === TYPES.POLL_POINTS) return "SONDAŻ (PUNKTY)";
  if (t === TYPES.PREPARED) return "PREPAROWANY";
  return String(t || "—").toUpperCase();
}

function statusPL(st) {
  const s = st || STATUS.DRAFT;
  if (s === STATUS.DRAFT) return "SZKIC";
  if (s === STATUS.POLL_OPEN) return "OTWARTY";
  if (s === STATUS.READY) return "ZAMKNIĘTY";
  return String(s).toUpperCase();
}

function setChips(g) {
  if (chipKind) chipKind.textContent = typePL(g.type);

  if (chipStatus) {
    chipStatus.className = "chip status";
    const st = g.status || STATUS.DRAFT;
    chipStatus.textContent = statusPL(st);

    if (st === STATUS.READY) chipStatus.classList.add("ok");
    else if (st === STATUS.POLL_OPEN) chipStatus.classList.add("warn");
    else chipStatus.classList.add("bad");
  }
}

function clearQr() {
  if (qrBox) qrBox.innerHTML = "";
}

async function renderSmallQr(link) {
  if (!qrBox) return;
  qrBox.innerHTML = "";
  if (!link) return;

  try {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, link, { width: 260, margin: 1 });
    qrBox.appendChild(canvas);
  } catch (e) {
    console.error("[polls] QR error:", e);
    qrBox.textContent = "QR nie działa.";
  }
}

function setLinkUiVisible(on) {
  if (btnCopy) btnCopy.disabled = !on;
  if (btnOpen) btnOpen.disabled = !on;
  if (btnOpenQr) btnOpenQr.disabled = !on;
  if (!on) clearQr();
}

/* ================= Link ================= */

function pollUrlForGame(g) {
  const file =
    g.type === TYPES.POLL_TEXT ? "poll-text.html" :
    g.type === TYPES.POLL_POINTS ? "poll-points.html" :
    null;

  if (!file) return "";

  const u = new URL(file, location.href);
  u.searchParams.set("id", g.id);
  u.searchParams.set("key", g.share_key_poll);
  return u.toString();
}

/* ================= DB ================= */

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_poll")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchQuestions(gameId) {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchAnswers(questionId) {
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", questionId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

/* ================= VALIDACJE (Twoje reguły) ================= */

async function validateCanOpen(g) {
  // tylko dla poll_* typów
  if (!(g.type === TYPES.POLL_TEXT || g.type === TYPES.POLL_POINTS)) {
    return { ok: false, reason: "To nie jest gra sondażowa." };
  }

  const qs = await fetchQuestions(g.id);
  if (qs.length < RULES.QN_MIN) {
    return { ok: false, reason: `Żeby uruchomić: min ${RULES.QN_MIN} pytań (masz ${qs.length}).` };
  }

  if (g.type === TYPES.POLL_TEXT) {
    // typowy sondaż: tylko liczba pytań
    return { ok: true, reason: "" };
  }

  // poll_points: każde pytanie ma 3..6 odpowiedzi
  for (const q of qs) {
    const as = await fetchAnswers(q.id);
    if (as.length < RULES.AN_MIN || as.length > RULES.AN_MAX) {
      return {
        ok: false,
        reason: `Żeby uruchomić: każde pytanie musi mieć ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi. (Pyt. ${q.ord} ma ${as.length}).`
      };
    }
  }

  return { ok: true, reason: "" };
}

async function latestSessionId(gameId, questionId) {
  const { data, error } = await sb()
    .from("poll_sessions")
    .select("id,created_at")
    .eq("game_id", gameId)
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

async function validateCanClose(g) {
  if (g.status !== STATUS.POLL_OPEN) return { ok: false, reason: "Sondaż nie jest otwarty." };

  const qs = await fetchQuestions(g.id);
  if (!qs.length) return { ok: false, reason: "Brak pytań." };

  // TEXT: w każdym pytaniu min 3 RÓŻNE odpowiedzi (zebrane)
  if (g.type === TYPES.POLL_TEXT) {
    // zakładamy tabelę poll_text_entries z kolumnami:
    // poll_session_id, question_id, answer_norm
    for (const q of qs) {
      const sid = await latestSessionId(g.id, q.id);
      if (!sid) return { ok: false, reason: `Brak sesji dla pytania ${q.ord}.` };

      const { data, error } = await sb()
        .from("poll_text_entries")
        .select("answer_norm")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);

      if (error) {
        console.error("[polls] missing poll_text_entries?", error);
        return { ok: false, reason: "Brak tabeli poll_text_entries / brak dostępu — nie da się policzyć odpowiedzi." };
      }

      const uniq = new Set((data || []).map(r => String(r.answer_norm || "").trim()).filter(Boolean));
      if (uniq.size < RULES.AN_MIN) {
        return {
          ok: false,
          reason: `Żeby zamknąć: w każdym pytaniu min ${RULES.AN_MIN} różne odpowiedzi. (Pyt. ${q.ord} ma ${uniq.size}).`
        };
      }
    }
    return { ok: true, reason: "" };
  }

  // POINTS: w każdym pytaniu co najmniej 2 odpowiedzi mają punkty != 0
  // (czyli w praktyce: co najmniej 2 odpowiedzi dostały przynajmniej 1 głos w sesji)
  if (g.type === TYPES.POLL_POINTS) {
    for (const q of qs) {
      const sid = await latestSessionId(g.id, q.id);
      if (!sid) return { ok: false, reason: `Brak sesji dla pytania ${q.ord}.` };

      const as = await fetchAnswers(q.id);
      const allowed = new Set(as.map(a => a.id));

      const { data: votes, error: vErr } = await sb()
        .from("poll_votes")
        .select("answer_id")
        .eq("poll_session_id", sid);

      if (vErr) throw vErr;

      const counts = new Map();
      for (const a of as) counts.set(a.id, 0);
      for (const v of (votes || [])) {
        if (allowed.has(v.answer_id)) counts.set(v.answer_id, (counts.get(v.answer_id) || 0) + 1);
      }

      let nonZero = 0;
      for (const [_, c] of counts) if ((c || 0) > 0) nonZero++;

      if (nonZero < 2) {
        return { ok: false, reason: `Żeby zamknąć: w każdym pytaniu min 2 odpowiedzi muszą mieć punkty ≠ 0. (Pyt. ${q.ord} ma ${nonZero}).` };
      }
    }
    return { ok: true, reason: "" };
  }

  return { ok: false, reason: "Nieznany typ sondażu." };
}

/* ================= Preview wyników (light) ================= */

async function previewResults(g) {
  if (!resultsCard || !resultsList || !resultsMeta) return;

  if (resultsCard.style.display === "none") {
    resultsCard.style.display = "";
  } else {
    resultsCard.style.display = "none";
    return;
  }

  resultsMeta.textContent = "Ładuję…";
  resultsList.innerHTML = "";

  const qs = (await fetchQuestions(g.id)).slice(0, RULES.QN_MIN);

  if (g.type === TYPES.POLL_POINTS) {
    // pokaż liczbę głosów na odpowiedź z ostatniej sesji
    for (const q of qs) {
      const sid = await latestSessionId(g.id, q.id);
      const as = await fetchAnswers(q.id);

      const counts = new Map();
      for (const a of as) counts.set(a.id, 0);

      if (sid) {
        const { data: votes } = await sb()
          .from("poll_votes")
          .select("answer_id")
          .eq("poll_session_id", sid);
        for (const v of (votes || [])) {
          if (counts.has(v.answer_id)) counts.set(v.answer_id, (counts.get(v.answer_id) || 0) + 1);
        }
      }

      const box = document.createElement("div");
      box.className = "resultQ";
      box.innerHTML = `<div class="qTitle"></div>`;
      box.querySelector(".qTitle").textContent = `P${q.ord}: ${q.text || "—"}`;

      for (const a of as) {
        const row = document.createElement("div");
        row.className = "aRow";
        row.innerHTML = `<div class="aTxt"></div><div class="aVal"></div>`;
        row.querySelector(".aTxt").textContent = a.text || "—";
        row.querySelector(".aVal").textContent = String(counts.get(a.id) || 0);
        box.appendChild(row);
      }

      resultsList.appendChild(box);
    }

    resultsMeta.textContent = "Podgląd: liczba głosów z ostatniej sesji.";
    return;
  }

  if (g.type === TYPES.POLL_TEXT) {
    // pokaż top zgrupowane po answer_norm (jeśli masz poll_text_entries)
    for (const q of qs) {
      const sid = await latestSessionId(g.id, q.id);
      if (!sid) continue;

      const { data, error } = await sb()
        .from("poll_text_entries")
        .select("answer_norm")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);

      if (error) {
        resultsMeta.textContent = "Brak tabeli poll_text_entries — nie da się pokazać podglądu text.";
        return;
      }

      const counts = new Map();
      for (const r of (data || [])) {
        const k = String(r.answer_norm || "").trim();
        if (!k) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
      }

      const top = [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 10);

      const box = document.createElement("div");
      box.className = "resultQ";
      box.innerHTML = `<div class="qTitle"></div>`;
      box.querySelector(".qTitle").textContent = `P${q.ord}: ${q.text || "—"}`;

      for (const [k, c] of top) {
        const row = document.createElement("div");
        row.className = "aRow";
        row.innerHTML = `<div class="aTxt"></div><div class="aVal"></div>`;
        row.querySelector(".aTxt").textContent = k;
        row.querySelector(".aVal").textContent = String(c);
        box.appendChild(row);
      }

      resultsList.appendChild(box);
    }

    resultsMeta.textContent = "Podgląd: TOP odpowiedzi (po normalizacji answer_norm).";
    return;
  }

  resultsMeta.textContent = "Podgląd niedostępny dla tego typu gry.";
}

/* ================= Action button state ================= */

function setActionButton(label, enabled, hintText) {
  if (btnPollAction) {
    btnPollAction.textContent = label;
    btnPollAction.disabled = !enabled;
  }
  if (hintTop && hintText) hintTop.textContent = hintText;
}

async function refresh() {
  if (!gameId) {
    cardMain && (cardMain.style.display = "none");
    cardEmpty && (cardEmpty.style.display = "");
    chipKind && (chipKind.textContent = "—");
    chipStatus && (chipStatus.textContent = "—");
    setMsg("Brak parametru id.");
    return;
  }

  game = await loadGame();

  // tylko poll_* na tej stronie
  if (!(game.type === TYPES.POLL_TEXT || game.type === TYPES.POLL_POINTS)) {
    cardMain && (cardMain.style.display = "none");
    cardEmpty && (cardEmpty.style.display = "");
    setMsg("To nie jest gra sondażowa.");
    return;
  }

  setChips(game);

  cardEmpty && (cardEmpty.style.display = "none");
  cardMain && (cardMain.style.display = "");

  if (gName) gName.textContent = game.name || "Sondaż";
  if (gMeta) {
    gMeta.textContent =
      game.type === TYPES.POLL_TEXT
        ? `Uruchom: min ${RULES.QN_MIN} pytań. Zamknij: w każdym pytaniu min ${RULES.AN_MIN} różne odpowiedzi.`
        : `Uruchom: min ${RULES.QN_MIN} pytań i każde pytanie ma ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi. Zamknij: w każdym pytaniu min 2 odpowiedzi mają punkty ≠ 0.`;
  }

  // link/qr tylko gdy otwarty
  if (pollLinkEl) pollLinkEl.value = "";
  setLinkUiVisible(false);
  clearQr();

  const st = game.status || STATUS.DRAFT;

  if (st === STATUS.POLL_OPEN) {
    const link = pollUrlForGame(game);
    if (pollLinkEl) pollLinkEl.value = link;
    setLinkUiVisible(true);
    await renderSmallQr(link);

    const chkClose = await validateCanClose(game);
    setActionButton(
      "Zamknąć sondaż",
      chkClose.ok,
      chkClose.ok ? "Możesz zamknąć sondaż." : chkClose.reason
    );
    return;
  }

  if (st === STATUS.DRAFT) {
    const chkOpen = await validateCanOpen(game);
    setActionButton(
      "Uruchomić sondaż",
      chkOpen.ok,
      chkOpen.ok ? "Link i QR pojawią się po uruchomieniu." : chkOpen.reason
    );
    return;
  }

  // READY (zamknięty)
  if (st === STATUS.READY) {
    // otworzyć ponownie: zawsze możliwe, ale ostrzegamy że czyścimy dane
    setActionButton(
      "Uruchomić ponownie",
      true,
      "Otworzy ponownie sondaż i usunie poprzednie dane głosowania."
    );
    return;
  }

  // fallback
  setActionButton("—", false, "Nieznany stan.");
}

/* ================= Actions ================= */

async function actionOpen() {
  const chk = await validateCanOpen(game);
  if (!chk.ok) return setMsg(chk.reason);

  const ok = await confirmModal({
    title: "Uruchomić sondaż?",
    text: `Uruchomić sondaż dla "${game.name}"?`,
    okText: "Uruchom",
    cancelText: "Anuluj",
  });
  if (!ok) return;

  const { error } = await sb().rpc("poll_open", {
    p_game_id: gameId,
    p_key: game.share_key_poll,
  });
  if (error) throw error;

  setMsg("Sondaż uruchomiony.");
  await refresh();
}

async function actionReopen() {
  const ok = await confirmModal({
    title: "Uruchomić ponownie?",
    text: "Uruchomić sondaż ponownie? Poprzednie dane głosowania zostaną usunięte.",
    okText: "Uruchom ponownie",
    cancelText: "Anuluj",
  });
  if (!ok) return;

  // Preferowane: osobny RPC, który CZYŚCI dane i otwiera nową sesję
  const { error } = await sb().rpc("poll_reopen_wipe", {
    p_game_id: gameId,
    p_key: game.share_key_poll,
  });

  if (error) {
    console.error("[polls] poll_reopen_wipe missing? fallback to poll_open", error);

    // fallback: jeżeli nie masz RPC poll_reopen_wipe, to i tak otworzy nową sesję,
    // ale stare dane zostaną w historii — zgodnie z Twoim opisem to NIE jest idealne.
    const res2 = await sb().rpc("poll_open", {
      p_game_id: gameId,
      p_key: game.share_key_poll,
    });
    if (res2.error) throw res2.error;
  }

  setMsg("Sondaż uruchomiony ponownie.");
  await refresh();
}

async function actionClose() {
  const chk = await validateCanClose(game);
  if (!chk.ok) return setMsg(chk.reason);

  // points: automatyczne zamknięcie i normalizacja do 100
  if (game.type === TYPES.POLL_POINTS) {
    const ok = await confirmModal({
      title: "Zamknąć sondaż?",
      text: "Zamknąć sondaż i przeliczyć punkty do 100 (0 głosów => min 1 pkt)?",
      okText: "Zamknij",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    const { error } = await sb().rpc("poll_close_and_normalize", {
      p_game_id: gameId,
      p_key: game.share_key_poll,
    });
    if (error) throw error;

    setMsg("Sondaż zamknięty. Gra gotowa.");
    await refresh();
    return;
  }

  // text: u Ciebie jest ręczny panel łączenia — to jest osobny krok UI.
  // Na teraz robimy: zamknij sondaż (blokuje dalsze wpisy), a “panel merge” dołożymy jako następny ekran/overlay.
  const ok = await confirmModal({
    title: "Zamknąć sondaż?",
    text: "Zamknąć sondaż? Potem przejdziesz do porządkowania odpowiedzi (łączenie/usuwanie) i normalizacji do 100.",
    okText: "Zamknij",
    cancelText: "Anuluj",
  });
  if (!ok) return;

  const { error } = await sb().rpc("poll_text_close", {
    p_game_id: gameId,
    p_key: game.share_key_poll,
  });
  if (error) throw error;

  setMsg("Sondaż zamknięty. Teraz porządkujemy odpowiedzi.");
  await refresh();
}

/* ================= Init ================= */

document.addEventListener("DOMContentLoaded", async () => {
  const u = await requireAuth("index.html");
  if (who) who.textContent = u?.email || "—";

  btnBack?.addEventListener("click", () => (location.href = "builder.html"));
  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnCopy?.addEventListener("click", async () => {
    if (!pollLinkEl?.value) return;
    try {
      await navigator.clipboard.writeText(pollLinkEl.value);
      setMsg("Skopiowano link sondażu.");
    } catch {
      setMsg("Nie udało się skopiować.");
    }
  });

  btnOpen?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    window.open(pollLinkEl.value, "_blank", "noopener,noreferrer");
  });

  btnOpenQr?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    const u2 = new URL("poll-qr.html", location.href);
    u2.searchParams.set("url", pollLinkEl.value);
    window.open(u2.toString(), "_blank", "noopener,noreferrer");
  });

  btnPollAction?.addEventListener("click", async () => {
    if (!game) return;

    try {
      const st = game.status || STATUS.DRAFT;
      if (st === STATUS.DRAFT) return await actionOpen();
      if (st === STATUS.POLL_OPEN) return await actionClose();
      if (st === STATUS.READY) return await actionReopen();
    } catch (e) {
      console.error("[polls] action error:", e);
      alert(`Operacja nie powiodła się.\n\n${e?.message || e}`);
    }
  });

  btnPreview?.addEventListener("click", async () => {
    if (!game) return;
    try {
      await previewResults(game);
    } catch (e) {
      console.error("[polls] preview error:", e);
      setMsg("Nie udało się wczytać podglądu (konsola).");
    }
  });

  await refresh();
});
