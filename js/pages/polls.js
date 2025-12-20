// js/pages/polls.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";

import { TYPES, STATUS, RULES } from "../core/game-validate.js";

guardDesktopOnly({ message: "Sondaże są dostępne tylko na komputerze." });

/* =======================
   Helpers
======================= */

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const $ = (id) => document.getElementById(id);

const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBack");
const msg = $("msg");

const cardMain = $("cardMain");
const cardEmpty = $("cardEmpty");

const chipType = $("chipType");
const chipStatus = $("chipStatus");
const hintTop = $("hintTop");

const gName = $("gName");
const gMeta = $("gMeta");
const pollLinkEl = $("pollLink");

const qrBox = $("qr");

const btnCopy = $("btnCopy");
const btnOpen = $("btnOpen");
const btnOpenQr = $("btnOpenQr");

const btnPollAction = $("btnPollAction");
const btnPreview = $("btnPreview");

const resultsCard = $("resultsCard");
const resultsMeta = $("resultsMeta");
const resultsList = $("resultsList");

const textCloseCard = $("textCloseCard");
const textCloseMeta = $("textCloseMeta");
const textCloseList = $("textCloseList");
const btnCancelTextClose = $("btnCancelTextClose");
const btnFinishTextClose = $("btnFinishTextClose");

let game = null;
let textCloseModel = null;
let msgTimer = null;

function setMsg(t) {
  if (!msg) return;
  msg.textContent = t || "";
  clearTimeout(msgTimer);
  if (t) msgTimer = setTimeout(() => (msg.textContent = ""), 2400);
}

function typePL(type) {
  if (type === TYPES.POLL_TEXT) return "TYPOWY SONDAŻ";
  if (type === TYPES.POLL_POINTS) return "PUNKTACJA";
  if (type === TYPES.PREPARED) return "PREPAROWANY";
  return String(type || "—").toUpperCase();
}

function statusPL(st) {
  const s = st || STATUS.DRAFT;
  if (s === STATUS.DRAFT) return "SZKIC";
  if (s === STATUS.POLL_OPEN) return "OTWARTY";
  if (s === STATUS.READY) return "ZAMKNIĘTY";
  return String(s).toUpperCase();
}

function pollLink(g) {
  const base =
    g.type === TYPES.POLL_TEXT
      ? new URL("poll-text.html", location.href)
      : new URL("poll-points.html", location.href);

  base.searchParams.set("id", g.id);
  base.searchParams.set("key", g.share_key_poll);
  return base.toString();
}

function setChips(g) {
  if (chipType) chipType.textContent = typePL(g.type);

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

/* =======================
   DB loaders
======================= */

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_poll,poll_opened_at,poll_closed_at")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  return data;
}

async function countQuestions() {
  const { count, error } = await sb()
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);

  if (error) throw error;
  return count || 0;
}

async function listQuestionsBasic() {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function countAnswersForQuestion(qid) {
  const { count, error } = await sb()
    .from("answers")
    .select("id", { count: "exact", head: true })
    .eq("question_id", qid);

  if (error) throw error;
  return count || 0;
}

/* =======================
   Walidacje UI (start/close/reopen)
======================= */

async function validateCanOpen(g) {
  if ((g.status || STATUS.DRAFT) !== STATUS.DRAFT) {
    return { ok: false, reason: "Sondaż można uruchomić tylko ze stanu SZKIC." };
  }

  if (g.type === TYPES.PREPARED) {
    return { ok: false, reason: "Gra preparowana nie ma sondażu." };
  }

  const qn = await countQuestions();
  if (qn < RULES.QN_MIN) {
    return {
      ok: false,
      reason: `Żeby uruchomić sondaż, liczba pytań musi być ≥ ${RULES.QN_MIN} (masz ${qn}).`,
    };
  }

  if (g.type === TYPES.POLL_POINTS) {
    const qsList = await listQuestionsBasic();
    for (const q of qsList) {
      const an = await countAnswersForQuestion(q.id);
      if (an < RULES.AN_MIN || an > RULES.AN_MAX) {
        return {
          ok: false,
          reason: `W trybie PUNKTACJA każde pytanie musi mieć ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi.`,
        };
      }
    }
  }

  return { ok: true, reason: "" };
}

async function validateCanReopen(g) {
  if ((g.status || STATUS.DRAFT) !== STATUS.READY) {
    return { ok: false, reason: "Ponowne uruchomienie jest możliwe tylko gdy sondaż jest ZAMKNIĘTY." };
  }
  // zasady jak start, tylko udajemy draft
  return await validateCanOpen({ ...g, status: STATUS.DRAFT });
}

async function getLastSessionIdForQuestion(questionId) {
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
  if ((g.status || STATUS.DRAFT) !== STATUS.POLL_OPEN) {
    return { ok: false, reason: "Sondaż można zamknąć tylko gdy jest OTWARTY." };
  }

  if (g.type === TYPES.POLL_POINTS) {
    const qsList = await listQuestionsBasic();
    for (const q of qsList) {
      const sid = await getLastSessionIdForQuestion(q.id);
      if (!sid) return { ok: false, reason: "Brak aktywnej sesji głosowania." };

      const { data, error } = await sb()
        .from("poll_votes")
        .select("answer_id")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);

      if (error) throw error;
      const uniq = new Set((data || []).map((x) => x.answer_id).filter(Boolean));
      if (uniq.size < 2) {
        return {
          ok: false,
          reason: "Aby zamknąć: w każdym pytaniu co najmniej 2 odpowiedzi muszą mieć głosy > 0.",
        };
      }
    }
    return { ok: true, reason: "" };
  }

  if (g.type === TYPES.POLL_TEXT) {
    const qsList = await listQuestionsBasic();
    for (const q of qsList) {
      const sid = await getLastSessionIdForQuestion(q.id);
      if (!sid) return { ok: false, reason: "Brak aktywnej sesji." };

      const { data, error } = await sb()
        .from("poll_text_entries")
        .select("answer_norm")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);

      if (error) throw error;

      const uniq = new Set((data || []).map((x) => (x.answer_norm || "").trim()).filter(Boolean));
      if (uniq.size < 3) {
        return { ok: false, reason: "Aby zamknąć: w każdym pytaniu muszą być co najmniej 3 różne odpowiedzi." };
      }
    }
    return { ok: true, reason: "" };
  }

  return { ok: false, reason: "Nieznany typ gry." };
}

/* =======================
   Preview wyników
======================= */

async function previewResults() {
  if (!game || !resultsCard || !resultsList || !resultsMeta) return;

  resultsCard.style.display = "";
  resultsList.innerHTML = "";
  resultsMeta.textContent = "Ładuję…";

  const qsList = await listQuestionsBasic();
  const out = [];

  if (game.type === TYPES.POLL_POINTS) {
    for (const q of qsList) {
      const sid = await getLastSessionIdForQuestion(q.id);

      const { data: ans, error: aErr } = await sb()
        .from("answers")
        .select("id,ord,text")
        .eq("question_id", q.id)
        .order("ord", { ascending: true });

      if (aErr) throw aErr;

      const counts = new Map();
      (ans || []).forEach((a) => counts.set(a.id, 0));

      if (sid) {
        const { data: votes, error: vErr } = await sb()
          .from("poll_votes")
          .select("answer_id")
          .eq("poll_session_id", sid)
          .eq("question_id", q.id);

        if (vErr) throw vErr;
        for (const v of votes || []) counts.set(v.answer_id, (counts.get(v.answer_id) || 0) + 1);
      }

      out.push({
        q,
        answers: (ans || []).map((a) => ({ text: a.text, val: counts.get(a.id) || 0 })),
      });
    }
    resultsMeta.textContent = "Podgląd: liczba głosów w ostatniej sesji (na pytanie).";
  } else {
    // poll_text
    for (const q of qsList) {
      const sid = await getLastSessionIdForQuestion(q.id);
      const map = new Map();

      if (sid) {
        const { data, error } = await sb()
          .from("poll_text_entries")
          .select("answer_norm")
          .eq("poll_session_id", sid)
          .eq("question_id", q.id);

        if (error) throw error;

        for (const r of data || []) {
          const k = (r.answer_norm || "").trim();
          if (!k) continue;
          map.set(k, (map.get(k) || 0) + 1);
        }
      }

      const rows = [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([txt, cnt]) => ({ text: txt, val: cnt }));

      out.push({ q, answers: rows });
    }
    resultsMeta.textContent = "Podgląd: agregacja odpowiedzi (lowercase + trim) w ostatniej sesji.";
  }

  for (const item of out) {
    const box = document.createElement("div");
    box.className = "resultQ";
    box.innerHTML = `<div class="qTitle">P${item.q.ord}: ${item.q.text}</div>`;

    for (const a of item.answers) {
      const row = document.createElement("div");
      row.className = "aRow";
      row.innerHTML = `<div class="aTxt"></div><div class="aVal"></div>`;
      row.querySelector(".aTxt").textContent = a.text;
      row.querySelector(".aVal").textContent = String(a.val);
      box.appendChild(row);
    }

    resultsList.appendChild(box);
  }
}

/* =======================
   poll_text: zamknięcie z panelem merge/delete
======================= */

function clip17Final(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > 17 ? t.slice(0, 17) : t;
}

function normalizeTo100Int(items) {
  // items: [{text,count}]
  const top = [...items].sort((a, b) => b.count - a.count).slice(0, 6);
  if (!top.length) return [];

  const total = top.reduce((s, x) => s + Math.max(0, x.count | 0), 0) || 1;

  const raw = top.map((x) => {
    const r = (100 * (x.count | 0)) / total;
    const f = Math.floor(r);
    return { ...x, raw: r, floor: f, frac: r - f };
  });

  raw.forEach((x) => {
    if (x.floor < 1) x.floor = 1;
  });

  let sum = raw.reduce((s, x) => s + x.floor, 0);
  let diff = 100 - sum;

  if (diff > 0) {
    raw.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < diff; i++) raw[i % raw.length].floor += 1;
  } else if (diff < 0) {
    diff = -diff;
    raw.sort((a, b) => b.floor - a.floor);
    let i = 0;
    while (diff > 0 && i < raw.length * 5) {
      const idx = i % raw.length;
      if (raw[idx].floor > 1) {
        raw[idx].floor -= 1;
        diff--;
      }
      i++;
    }
  }

  return raw
    .sort((a, b) => b.count - a.count)
    .map((x) => ({ text: x.text, points: x.floor }));
}

async function buildTextClosePanel() {
  if (!textCloseCard || !textCloseList || !textCloseMeta) return null;

  textCloseCard.style.display = "";
  if (resultsCard) resultsCard.style.display = "none";
  textCloseList.innerHTML = "";
  textCloseMeta.textContent = "Ładuję odpowiedzi z ostatniej sesji…";

  const qsList = await listQuestionsBasic();
  const model = [];

  for (const q of qsList) {
    const sid = await getLastSessionIdForQuestion(q.id);
    const map = new Map();

    if (sid) {
      const { data, error } = await sb()
        .from("poll_text_entries")
        .select("answer_norm")
        .eq("poll_session_id", sid)
        .eq("question_id", q.id);

      if (error) throw error;

      for (const r of data || []) {
        const k = (r.answer_norm || "").trim();
        if (!k) continue;
        map.set(k, (map.get(k) || 0) + 1);
      }
    }

    const items = [...map.entries()]
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);

    model.push({ question_id: q.id, ord: q.ord, text: q.text, items });
  }

  textCloseMeta.textContent =
    "Przeciągnij odpowiedź na inną, aby je połączyć (sumuje liczbę). Możesz też usuwać. Na końcu bierzemy TOP 6 i normalizujemy do 100.";

  for (const q of model) {
    const box = document.createElement("div");
    box.className = "tcQ";
    box.innerHTML = `
      <div class="head">
        <div>
          <div class="qTitle">P${q.ord}: ${q.text}</div>
          <div class="qHint">Przeciągnij, żeby połączyć • max 17 znaków w finalnych odpowiedziach</div>
        </div>
      </div>
      <div class="tcList"></div>
    `;

    const list = box.querySelector(".tcList");

    const rerender = () => {
      list.innerHTML = "";
      q.items.sort((a, b) => b.count - a.count);

      for (let idx = 0; idx < q.items.length; idx++) {
        const it = q.items[idx];

        const row = document.createElement("div");
        row.className = "tcItem";
        row.draggable = true;

        row.innerHTML = `
          <div class="tcTxt"></div>
          <div class="tcCnt"></div>
          <button class="tcDel" type="button" title="Usuń">✕</button>
        `;

        row.querySelector(".tcTxt").textContent = it.text;
        row.querySelector(".tcCnt").textContent = String(it.count);

        row.querySelector(".tcDel").addEventListener("click", () => {
          q.items.splice(idx, 1);
          rerender();
        });

        row.addEventListener("dragstart", (e) => {
          row.classList.add("dragging");
          e.dataTransfer.setData("text/plain", String(idx));
        });
        row.addEventListener("dragend", () => row.classList.remove("dragging"));
        row.addEventListener("dragover", (e) => e.preventDefault());

        row.addEventListener("drop", (e) => {
          e.preventDefault();
          const fromIdx = Number(e.dataTransfer.getData("text/plain"));
          const toIdx = idx;
          if (!Number.isFinite(fromIdx) || fromIdx === toIdx) return;

          const from = q.items[fromIdx];
          const to = q.items[toIdx];
          if (!from || !to) return;

          to.count += from.count;
          q.items.splice(fromIdx, 1);
          rerender();
        });

        list.appendChild(row);
      }
    };

    rerender();
    textCloseList.appendChild(box);
  }

  return model;
}

/* =======================
   UI
======================= */

function setActionButton(label, disabled, hint) {
  if (btnPollAction) {
    btnPollAction.textContent = label;
    btnPollAction.disabled = !!disabled;
  }
  if (hintTop) hintTop.textContent = hint || "";
}

async function refresh() {
  if (!gameId) {
    if (cardMain) cardMain.style.display = "none";
    if (cardEmpty) cardEmpty.style.display = "";
    setMsg("Brak parametru id.");
    return;
  }

  game = await loadGame();

  if (cardEmpty) cardEmpty.style.display = "none";
  if (cardMain) cardMain.style.display = "";

  setChips(game);

  if (gName) gName.textContent = game.name || "Sondaż";

  if (gMeta) {
    if (game.type === TYPES.POLL_TEXT) {
      gMeta.textContent = `Tryb: typowy sondaż (tekst). Start: ≥ ${RULES.QN_MIN} pytań. Zamknięcie: w każdym pytaniu ≥ 3 różne odpowiedzi.`;
    } else if (game.type === TYPES.POLL_POINTS) {
      gMeta.textContent = `Tryb: punktacja. Start: ≥ ${RULES.QN_MIN} pytań i każde pytanie ma ${RULES.AN_MIN}–${RULES.AN_MAX} odpowiedzi. Zamknięcie: w każdym pytaniu ≥ 2 odpowiedzi mają głosy > 0.`;
    } else {
      gMeta.textContent = "Gra preparowana nie ma sondażu.";
    }
  }

  // link/qr
  if (pollLinkEl) pollLinkEl.value = "";
  setLinkUiVisible(false);
  clearQr();

  if (textCloseCard) textCloseCard.style.display = "none";
  if (resultsCard) resultsCard.style.display = "none";
  textCloseModel = null;

  const st = game.status || STATUS.DRAFT;

  if (st === STATUS.POLL_OPEN) {
    const link = pollLink(game);
    if (pollLinkEl) pollLinkEl.value = link;
    setLinkUiVisible(true);
    await renderSmallQr(link);
  }

  // przycisk stanowy
  if (game.type === TYPES.PREPARED) {
    setActionButton("Brak sondażu", true, "Gra preparowana nie ma sondażu.");
    return;
  }

  if (st === STATUS.DRAFT) {
    const chk = await validateCanOpen(game);
    setActionButton("Uruchomić sondaż", !chk.ok, chk.ok ? "Gotowe do uruchomienia." : chk.reason);
    return;
  }

  if (st === STATUS.POLL_OPEN) {
    const chk = await validateCanClose(game);
    setActionButton("Zamknąć sondaż", !chk.ok, chk.ok ? "Możesz zamknąć sondaż." : chk.reason);
    return;
  }

  if (st === STATUS.READY) {
    const chk = await validateCanReopen(game);
    setActionButton(
      "Uruchomić ponownie",
      !chk.ok,
      chk.ok ? "Otworzy nową sesję (poprzednie dane przestają być aktywne)." : chk.reason
    );
    return;
  }

  setActionButton("—", true, "Nieznany status.");
}

/* =======================
   Start + eventy
======================= */

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
    const u = new URL("poll-qr.html", location.href);
    u.searchParams.set("url", pollLinkEl.value);
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  });

  btnPreview?.addEventListener("click", async () => {
    if (!resultsCard) return;
    if (resultsCard.style.display === "none" || resultsCard.style.display === "") {
      await previewResults();
    } else {
      resultsCard.style.display = "none";
    }
  });

  btnPollAction?.addEventListener("click", async () => {
    if (!game) return;

    const st = game.status || STATUS.DRAFT;

    // START
    if (st === STATUS.DRAFT) {
      const chk = await validateCanOpen(game);
      if (!chk.ok) {
        setMsg(chk.reason);
        return;
      }

      const ok = await confirmModal({
        title: "Uruchomić sondaż?",
        text: `Uruchomić sondaż dla "${game.name}"?`,
        okText: "Uruchom",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      try {
        const { error } = await sb().rpc("poll_open", {
          p_game_id: gameId,
          p_key: game.share_key_poll,
        });
        if (error) throw error;

        setMsg("Sondaż uruchomiony.");
        await refresh();
      } catch (e) {
        console.error("[polls] open error:", e);
        alert(`Nie udało się uruchomić sondażu.\n\n${e?.message || e}`);
      }
      return;
    }

    // CLOSE
    if (st === STATUS.POLL_OPEN) {
      const chk = await validateCanClose(game);
      if (!chk.ok) {
        setMsg(chk.reason);
        return;
      }

      // poll_points: zamykamy od razu
      if (game.type === TYPES.POLL_POINTS) {
        const ok = await confirmModal({
          title: "Zakończyć sondaż?",
          text: "Zamknąć sondaż i przeliczyć punkty do 100 (0 głosów => 1 pkt)?",
          okText: "Zakończ",
          cancelText: "Anuluj",
        });
        if (!ok) return;

        try {
          const { error } = await sb().rpc("poll_points_close_and_normalize", {
            p_game_id: gameId,
            p_key: game.share_key_poll,
          });
          if (error) throw error;

          setMsg("Sondaż zamknięty. Gra gotowa.");
          await refresh();
        } catch (e) {
          console.error("[polls] close points error:", e);
          alert(`Nie udało się zamknąć sondażu.\n\n${e?.message || e}`);
        }
        return;
      }

      // poll_text: panel merge/delete + finalizacja
      try {
        textCloseModel = await buildTextClosePanel();
        setMsg("Edytuj odpowiedzi, a potem kliknij „Zamknij i przelicz”.");
      } catch (e) {
        console.error("[polls] build text close:", e);
        alert("Nie udało się wczytać odpowiedzi tekstowych.");
      }
      return;
    }

    // REOPEN
    if (st === STATUS.READY) {
      const chk = await validateCanReopen(game);
      if (!chk.ok) {
        setMsg(chk.reason);
        return;
      }

      const ok = await confirmModal({
        title: "Uruchomić ponownie?",
        text: "Otworzyć sondaż ponownie? Poprzednie dane nie będą użyte w aktywnej sesji.",
        okText: "Otwórz ponownie",
        cancelText: "Anuluj",
      });
      if (!ok) return;

      try {
        const { error } = await sb().rpc("poll_open", {
          p_game_id: gameId,
          p_key: game.share_key_poll,
        });
        if (error) throw error;

        setMsg("Sondaż uruchomiony ponownie.");
        await refresh();
      } catch (e) {
        console.error("[polls] reopen error:", e);
        alert(`Nie udało się otworzyć ponownie.\n\n${e?.message || e}`);
      }
      return;
    }
  });

  btnCancelTextClose?.addEventListener("click", () => {
    if (textCloseCard) textCloseCard.style.display = "none";
    textCloseModel = null;
    setMsg("Anulowano zamykanie (sondaż dalej otwarty).");
  });

  btnFinishTextClose?.addEventListener("click", async () => {
    if (!game || game.type !== TYPES.POLL_TEXT) return;
    if (!textCloseModel) return;

    const payloadItems = [];

    for (const q of textCloseModel) {
      const cleaned = (q.items || [])
        .map((x) => ({ text: clip17Final(x.text), count: Number(x.count) || 0 }))
        .filter((x) => x.text && x.count > 0);

      const final = normalizeTo100Int(cleaned)
        .map((x) => ({ text: clip17Final(x.text), points: Number(x.points) || 0 }))
        .filter((x) => x.text);

      if (final.length < 3) {
        alert(`Pytanie ${q.ord}: po edycji zostało mniej niż 3 odpowiedzi. Dodaj/połącz inaczej.`);
        return;
      }

      payloadItems.push({
        question_id: q.question_id,
        answers: final,
      });
    }

    const ok = await confirmModal({
      title: "Zamknąć sondaż?",
      text: "Zamknąć sondaż, wybrać TOP 6 i zapisać punkty do 100 dla każdego pytania?",
      okText: "Zamknij",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    try {
      const { error } = await sb().rpc("poll_text_close_apply", {
        p_game_id: gameId,
        p_key: game.share_key_poll,
        p_payload: { items: payloadItems },
      });
      if (error) throw error;

      setMsg("Sondaż zamknięty. Gra gotowa.");
      if (textCloseCard) textCloseCard.style.display = "none";
      textCloseModel = null;
      await refresh();
    } catch (e) {
      console.error("[polls] close text error:", e);
      alert(`Nie udało się zamknąć sondażu.\n\n${e?.message || e}`);
    }
  });

  await refresh();
});
