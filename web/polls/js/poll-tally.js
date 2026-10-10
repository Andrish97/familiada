// Podliczanie głosów w karcie Wyniki — płynna zmiana TYCH SAMYCH wierszy
// (docs/ankiety-refaktor.md, „Podliczanie w karcie Wyniki”).
//
// Ankieta punktowa: liczba głosów zamienia się w punkty (podgląd liczony tu tym
// samym algorytmem co baza: poll-tally-math.js), słupki w skali 0–100, pod
// pytaniem „suma: 100”. Bez edycji. „Zatwierdź” -> poll_points_tally (strona).
//
// Ankieta tekstowa: wiersze dostają uchwyt (przeciągnij na inny = połącz), pole
// edycji tekstu, kosz; punkty na żywo (algorytm bazy), licznik „3–6 odpowiedzi”
// przy pytaniu, Cofnij / Ponów. Poprawki zapisują się w bazie (szkic,
// poll_text_tally_draft_save, z opóźnieniem) i wracają po ponownym wejściu.
// „Zatwierdź” -> poll_text_tally_apply (strona; punkty liczy baza).
//
// Moduł zmienia tylko DOM wyników przekazanych przez pollResults.slots();
// stan ankiety, przyciski i potwierdzenia zostają w polls.js.
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-10T06005";
import { t } from "../../shared/translation/translation.js?v=v2026-10-10T06005";
import { icon } from "../../shared/js/core/icons.js?v=v2026-10-10T06005";
import { makeResultRow } from "../../shared/js/core/poll-results.js?v=v2026-10-10T06005";
import {
  pointsPollPreview,
  textTallyPoints,
  ANSWERS_MIN,
  TEXT_MAX_LEN,
} from "../../shared/js/core/poll-tally-math.js?v=v2026-10-10T06005";

const SAVE_DEBOUNCE_MS = 900;
const UNDO_LIMIT = 100;
const ROW_LEAVE_MS = 320;
const PAGE = 1000;

// Liczba w elemencie płynnie przechodzi do nowej wartości (albo wstawia "—").
function tweenText(el, to, ms = 650) {
  if (el._raf) cancelAnimationFrame(el._raf);
  if (typeof to !== "number") {
    el.textContent = String(to);
    return;
  }
  const from = Number.parseFloat(el.textContent);
  if (!Number.isFinite(from) || from === to || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = String(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function mk(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}

function setPct(r, pct) {
  const w = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
  if (r.bar.style.width !== w) r.bar.style.width = w;
}

/**
 * @param {object} cfg
 * @param {string} cfg.gameId
 * @param {{slots:()=>Map, reset:()=>void}} cfg.pollResults
 * @param {object} cfg.ui  { barEl, hintEl, toolsEl, saveEl, undoBtn, redoBtn,
 *                           onValidity(boolean), onError(message) }
 */
export function createTally({ gameId, pollResults, ui }) {
  let mode = ""; // "" | "points" | "text"
  let model = []; // tekst: [{ question_id, ord, text, items:[{id,text,count}] }]
  let states = new Map(); // question_id -> { q, slot, rows: Map(itemId -> r), meta }
  let nextId = 1;
  let undo = [];
  let redo = [];
  let sig = 0;
  let dirty = false;
  let saveTimer = null;
  let savingChain = Promise.resolve();
  let drag = null; // { qid, id }
  let mergeSrc = null; // { qid, id } — tryb łączenia na dotyku

  const isActive = () => !!mode;

  /* ---------- wspólne: meta pod tytułem pytania ---------- */

  function ensureMeta(slot, { withCounter, withMergeDup, qs }) {
    const box = slot.list.parentElement;
    let meta = box.querySelector(":scope > .tallyMeta");
    if (!meta) {
      meta = mk("div", "tallyMeta");
      meta.innerHTML = `
        <span class="tallyCounter"></span>
        <span class="tallySum"></span>
        <button class="btn xs tcMergeDup" type="button"></button>`;
      box.insertBefore(meta, slot.list);
      requestAnimationFrame(() => requestAnimationFrame(() => meta.classList.add("on")));
    }
    meta.querySelector(".tallyCounter").hidden = !withCounter;
    const dup = meta.querySelector(".tcMergeDup");
    dup.hidden = !withMergeDup;
    dup.textContent = t("polls.tally.mergeDup");
    dup.onclick = withMergeDup && qs ? () => mutate(() => mergeDuplicates(qs.q)) : null;
    return meta;
  }

  function dropMeta(slot) {
    const meta = slot.list.parentElement.querySelector(":scope > .tallyMeta");
    meta?.remove();
  }

  /* ---------- ankieta punktowa ---------- */

  async function enterPoints(data) {
    mode = "points";
    ui.hintEl.textContent = t("polls.tally.hintPoints");
    ui.barEl.hidden = false;
    ui.toolsEl.hidden = true;
    const slots = pollResults.slots();

    for (const q of data.questions || []) {
      const slot = slots.get(q.id);
      if (!slot) continue;
      const answers = q.answers || [];
      const pts = pointsPollPreview(answers.map((a) => Number(a.votes) || 0));
      const meta = ensureMeta(slot, { withCounter: false, withMergeDup: false });
      meta.querySelector(".tallySum").textContent = t("polls.tally.sum", { n: pts.reduce((s, x) => s + x, 0) });
      slot.list.classList.add("tally");
      answers.forEach((a, i) => {
        const r = slot.rows.get(a.id);
        if (!r) return;
        r.row.classList.add("tallyRow");
        tweenText(r.val, pts[i]);
        setPct(r, pts[i]);
      });
    }
    ui.onValidity(true);
  }

  function leavePoints() {
    for (const slot of pollResults.slots().values()) {
      slot.list.classList.remove("tally");
      slot.list.querySelectorAll(".tallyRow").forEach((el) => el.classList.remove("tallyRow"));
      dropMeta(slot);
    }
  }

  /* ---------- ankieta tekstowa: wczytanie ---------- */

  async function pagedEntries(sessionIds) {
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb()
        .from("poll_text_entries")
        .select("question_id,answer_norm,poll_session_id")
        .in("poll_session_id", sessionIds)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return all;
  }

  async function loadTextModel() {
    const { data: questions, error: qErr } = await sb()
      .from("questions")
      .select("id,ord,text")
      .eq("game_id", gameId)
      .order("ord", { ascending: true });
    if (qErr) throw qErr;

    const { data: sessions, error: sErr } = await sb()
      .from("poll_sessions")
      .select("id,question_id,created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });
    if (sErr) throw sErr;

    const latest = new Map(); // question_id -> session id (najnowsza)
    for (const s of sessions || []) if (!latest.has(s.question_id)) latest.set(s.question_id, s.id);
    const sessionIds = [...new Set(latest.values())];
    const entries = sessionIds.length ? await pagedEntries(sessionIds) : [];

    const counts = new Map(); // question_id -> Map(norm -> n)
    let total = 0;
    for (const e of entries) {
      if (latest.get(e.question_id) !== e.poll_session_id) continue;
      const k = String(e.answer_norm || "").trim();
      if (!k) continue;
      if (!counts.has(e.question_id)) counts.set(e.question_id, new Map());
      const m = counts.get(e.question_id);
      m.set(k, (m.get(k) || 0) + 1);
      total++;
    }

    let n = 1;
    const out = (questions || []).map((q) => {
      const items = [...(counts.get(q.id) || new Map()).entries()]
        .map(([text, count]) => ({ id: `i${n++}`, text, count }))
        .sort((a, b) => b.count - a.count);
      return { question_id: q.id, ord: q.ord, text: q.text, items };
    });
    return { model: out, sig: total, nextId: n };
  }

  // Szkic z bazy pasuje, gdy dotyczy tych samych pytań i tej samej liczby głosów
  // (po wznowieniu i nowych głosach stary szkic nie może ukryć nowych odpowiedzi).
  async function restoreDraft(loaded) {
    try {
      const { data, error } = await sb().rpc("poll_text_tally_draft_get", { p_game_id: gameId });
      if (error) throw error;
      const d = data?.draft;
      if (!d || d.sig !== loaded.sig || !Array.isArray(d.questions)) return false;
      const byQ = new Map(d.questions.map((q) => [q.question_id, q]));
      const next = [];
      for (const q of loaded.model) {
        const dq = byQ.get(q.question_id);
        if (!dq || !Array.isArray(dq.items)) return false;
        const items = dq.items
          .map((it) => ({ id: String(it.id), text: String(it.text ?? ""), count: Math.max(0, Math.floor(Number(it.count) || 0)) }))
          .filter((it) => it.id);
        next.push({ ...q, items });
      }
      loaded.model.splice(0, loaded.model.length, ...next);
      let maxId = 0;
      for (const q of next) for (const it of q.items) maxId = Math.max(maxId, Number(String(it.id).replace(/\D/g, "")) || 0);
      loaded.nextId = Math.max(loaded.nextId, maxId + 1);
      return true;
    } catch (e) {
      console.warn("[poll-tally] draft_get failed", e);
      return false;
    }
  }

  async function enterText() {
    const loaded = await loadTextModel();
    const restored = await restoreDraft(loaded);

    mode = "text";
    model = loaded.model;
    sig = loaded.sig;
    nextId = loaded.nextId;
    undo = [];
    redo = [];
    dirty = false;
    states = new Map();
    updateHistory();
    ui.hintEl.textContent = t("polls.tally.hintText");
    ui.barEl.hidden = false;
    ui.toolsEl.hidden = false;
    setSave("");

    const slots = pollResults.slots();
    for (const q of model) {
      const slot = slots.get(q.question_id);
      if (!slot) continue;
      q.items.sort((a, b) => b.count - a.count);
      const qs = { q, slot, rows: new Map(), meta: null };
      states.set(q.question_id, qs);
      qs.meta = ensureMeta(slot, { withCounter: true, withMergeDup: true, qs });

      // te same wiersze co w widoku surowym: dopasowanie po tekście
      const taken = new Set();
      for (const it of q.items) {
        const key = it.text;
        const existing = !taken.has(key) ? slot.rows.get(key) : null;
        if (existing) {
          taken.add(key);
          slot.rows.delete(key);
          decorate(qs, existing, it);
          qs.rows.set(it.id, existing);
        }
      }
      // wiersze, których nie ma w modelu (np. spoza TOP 12 przy innym widoku)
      for (const [, r] of slot.rows) r.row.remove();
      slot.rows.clear();
      for (const it of q.items) {
        if (qs.rows.has(it.id)) continue;
        const r = makeResultRow(it.text);
        r.val.textContent = String(it.count);
        decorate(qs, r, it);
        qs.rows.set(it.id, r);
        slot.list.appendChild(r.row);
      }
      reorder(qs, false);
    }
    // jedna klatka na rozłożenie uchwytów, potem klasa włącza przejścia CSS
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    for (const qs of states.values()) qs.slot.list.classList.add("tally");
    for (const qs of states.values()) updateQuestion(qs);
    validity();
    if (restored) ui.onNotice?.(t("polls.tally.restored"));
  }

  /* ---------- wiersz tekstowy ---------- */

  function decorate(qs, r, item) {
    const { row } = r;
    row.classList.add("tallyRow");
    row.dataset.itemId = item.id;

    const handle = mk("span", "tcHandle", icon("grip"));
    handle.draggable = true;
    handle.title = t("polls.tally.dragHandle");
    handle.setAttribute("aria-label", t("polls.tally.dragHandle"));

    const inp = mk("input", "aTxtInp");
    inp.type = "text";
    inp.maxLength = TEXT_MAX_LEN;
    inp.value = item.text;
    inp.setAttribute("aria-label", t("polls.tally.hintText"));

    const cnt = mk("span", "tcCnt");
    const mergeBtn = mk("button", "tcBtn tcMergeBtn", icon("merge"));
    mergeBtn.type = "button";
    mergeBtn.title = t("polls.tally.mergeWith");
    mergeBtn.setAttribute("aria-label", t("polls.tally.mergeWith"));
    const del = mk("button", "tcBtn tcDel", icon("trash"));
    del.type = "button";
    del.title = t("polls.tally.remove");
    del.setAttribute("aria-label", t("polls.tally.remove"));

    r.txt = row.querySelector(".aTxt");
    r.inp = inp;
    r.cnt = cnt;
    r.handle = handle;
    r.itemId = item.id;
    row.insertBefore(handle, r.bar.nextSibling);
    r.txt.after(inp);
    row.insertBefore(cnt, r.val);
    row.append(mergeBtn, del);

    const findItem = () => qs.q.items.find((x) => x.id === item.id);

    // edycja tekstu: punkty na żywo, jeden wpis w historii na całą edycję
    let editSnap = null;
    inp.addEventListener("focus", () => { editSnap = snapshot(); });
    inp.addEventListener("input", () => {
      const it = findItem();
      if (!it) return;
      it.text = inp.value;
      updateQuestion(qs);
      validity();
      scheduleSave();
    });
    inp.addEventListener("blur", () => {
      if (editSnap && editSnap !== snapshot()) {
        undo.push(editSnap);
        if (undo.length > UNDO_LIMIT) undo.shift();
        redo = [];
        updateHistory();
      }
      editSnap = null;
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
    });

    del.addEventListener("click", () => mutate(() => {
      qs.q.items = qs.q.items.filter((x) => x.id !== item.id);
    }));

    // przeciąganie (komputer): uchwyt -> inny wiersz tego samego pytania
    handle.addEventListener("dragstart", (e) => {
      drag = { qid: qs.q.question_id, id: item.id };
      row.classList.add("dragging");
      try {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setDragImage(row, 18, 19);
      } catch { /* starsze przeglądarki */ }
    });
    handle.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      drag = null;
      qs.slot.list.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
    });
    row.addEventListener("dragover", (e) => {
      if (!drag || drag.qid !== qs.q.question_id || drag.id === item.id) return;
      e.preventDefault();
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drop-target");
      if (!drag || drag.qid !== qs.q.question_id || drag.id === item.id) return;
      const from = drag.id;
      drag = null;
      mutate(() => mergeInto(qs.q, from, item.id));
    });

    // dotyk: „Połącz z…” — pierwszy dotyk wybiera źródło, drugi cel
    mergeBtn.addEventListener("click", () => {
      const qid = qs.q.question_id;
      if (mergeSrc && mergeSrc.qid === qid && mergeSrc.id === item.id) { clearMergeMode(); return; }
      if (mergeSrc && mergeSrc.qid === qid) {
        const from = mergeSrc.id;
        clearMergeMode();
        mutate(() => mergeInto(qs.q, from, item.id));
        return;
      }
      clearMergeMode();
      mergeSrc = { qid, id: item.id };
      qs.slot.list.querySelectorAll(".aRow").forEach((el) => {
        el.classList.toggle("merge-src", el.dataset.itemId === item.id);
        el.classList.toggle("merge-target", el.dataset.itemId !== item.id);
      });
    });
  }

  function clearMergeMode() {
    mergeSrc = null;
    for (const qs of states.values()) {
      qs.slot.list.querySelectorAll(".aRow").forEach((el) => el.classList.remove("merge-src", "merge-target"));
    }
  }

  /* ---------- operacje na modelu ---------- */

  function mergeInto(q, fromId, toId) {
    const from = q.items.find((x) => x.id === fromId);
    const to = q.items.find((x) => x.id === toId);
    if (!from || !to || from === to) return;
    to.count += from.count;
    q.items = q.items.filter((x) => x !== from);
  }

  function mergeDuplicates(q) {
    const seen = new Map();
    const out = [];
    for (const it of q.items) {
      const key = String(it.text ?? "").trim().toLowerCase();
      if (!key) { out.push(it); continue; }
      const first = seen.get(key);
      if (first) first.count += it.count;
      else { seen.set(key, it); out.push(it); }
    }
    q.items = out;
  }

  function snapshot() {
    return JSON.stringify(model.map((q) => ({ question_id: q.question_id, items: q.items })));
  }

  function restoreSnapshot(json) {
    const arr = JSON.parse(json);
    for (const sq of arr) {
      const qs = states.get(sq.question_id);
      if (qs) qs.q.items = sq.items;
    }
    for (const qs of states.values()) {
      qs.q.items.sort((a, b) => b.count - a.count);
      sync(qs);
    }
    validity();
    scheduleSave();
  }

  function updateHistory() {
    if (ui.undoBtn) ui.undoBtn.disabled = undo.length === 0;
    if (ui.redoBtn) ui.redoBtn.disabled = redo.length === 0;
  }

  function undoAction() {
    if (mode !== "text" || !undo.length) return;
    redo.push(snapshot());
    restoreSnapshot(undo.pop());
    updateHistory();
  }

  function redoAction() {
    if (mode !== "text" || !redo.length) return;
    undo.push(snapshot());
    restoreSnapshot(redo.pop());
    updateHistory();
  }

  // Zmiana modelu: wpis do historii, nowy porządek (najwięcej głosów na górze),
  // płynne przestawienie wierszy, zapis szkicu.
  function mutate(fn) {
    undo.push(snapshot());
    if (undo.length > UNDO_LIMIT) undo.shift();
    redo = [];
    fn();
    for (const qs of states.values()) {
      qs.q.items.sort((a, b) => b.count - a.count);
      sync(qs);
    }
    updateHistory();
    validity();
    scheduleSave();
  }

  /* ---------- DOM wierszy: synchronizacja, kolejność, wartości ---------- */

  function reorder(qs, animate = true) {
    const list = qs.slot.list;
    const want = qs.q.items.map((it) => qs.rows.get(it.id)?.row).filter(Boolean);
    const have = [...list.children].filter((el) => el.classList.contains("aRow") && !el.classList.contains("leaving"));
    if (want.length === have.length && want.every((el, i) => el === have[i])) return;

    const before = new Map();
    if (animate) for (const el of have) before.set(el, el.getBoundingClientRect().top);
    for (const el of want) list.appendChild(el);
    if (!animate) return;
    for (const el of want) {
      const prev = before.get(el);
      if (prev == null) continue;
      const dy = prev - el.getBoundingClientRect().top;
      if (!dy) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform .35s ease";
        el.style.transform = "";
        setTimeout(() => { el.style.transition = ""; }, 380);
      });
    }
  }

  function sync(qs) {
    const ids = new Set(qs.q.items.map((it) => it.id));
    for (const [id, r] of [...qs.rows]) {
      if (ids.has(id)) continue;
      qs.rows.delete(id);
      r.row.classList.add("leaving");
      setTimeout(() => r.row.remove(), ROW_LEAVE_MS);
    }
    for (const it of qs.q.items) {
      if (qs.rows.has(it.id)) continue;
      const r = makeResultRow(it.text);
      r.val.textContent = String(it.count);
      r.row.classList.add("entering");
      decorate(qs, r, it);
      qs.rows.set(it.id, r);
      qs.slot.list.appendChild(r.row);
      requestAnimationFrame(() => requestAnimationFrame(() => r.row.classList.remove("entering")));
    }
    reorder(qs, true);
    updateQuestion(qs);
  }

  function updateQuestion(qs) {
    const items = qs.q.items;
    const calc = textTallyPoints(items.map((it) => ({ text: it.text, count: it.count })));
    const byIdx = new Map(calc.map((c) => [c.idx, c.points]));
    let sum = 0;
    items.forEach((it, i) => {
      const r = qs.rows.get(it.id);
      if (!r) return;
      const pts = byIdx.get(i);
      const included = pts != null;
      if (included) sum += pts;
      r.row.classList.toggle("out", !included);
      tweenText(r.val, included ? pts : "—");
      setPct(r, included ? pts : 0);
      r.cnt.textContent = t("polls.tally.votes", { n: it.count });
      if (r.inp.value !== it.text && document.activeElement !== r.inp) r.inp.value = it.text;
    });
    const n = calc.length;
    const counter = qs.meta.querySelector(".tallyCounter");
    counter.textContent = t("polls.tally.counter", { n });
    counter.classList.toggle("invalid", n < ANSWERS_MIN);
    qs.meta.querySelector(".tallySum").textContent = t("polls.tally.sum", { n: sum });
    qs.meta.querySelector(".tcMergeDup").textContent = t("polls.tally.mergeDup");
  }

  function textValid() {
    for (const qs of states.values()) {
      const n = textTallyPoints(qs.q.items.map((it) => ({ text: it.text, count: it.count }))).length;
      if (n < ANSWERS_MIN) return false;
    }
    return states.size > 0;
  }

  function validity() {
    ui.onValidity(mode === "points" ? true : textValid());
  }

  /* ---------- szkic w bazie ---------- */

  function setSave(state) {
    if (!ui.saveEl) return;
    ui.saveEl.dataset.state = state || "";
    ui.saveEl.textContent = state === "saving" ? t("polls.tally.saving")
      : state === "saved" ? t("polls.tally.saved")
      : state === "failed" ? t("polls.tally.saveFailed") : "";
  }

  function draftPayload() {
    return {
      v: 1,
      sig,
      questions: model.map((q) => ({
        question_id: q.question_id,
        items: q.items.map((it) => ({ id: it.id, text: it.text, count: it.count })),
      })),
    };
  }

  function scheduleSave() {
    if (mode !== "text") return;
    dirty = true;
    setSave("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void saveDraft(); }, SAVE_DEBOUNCE_MS);
  }

  function saveDraft() {
    clearTimeout(saveTimer);
    if (mode !== "text" || !dirty) return savingChain;
    const payload = draftPayload();
    dirty = false;
    savingChain = savingChain.then(async () => {
      try {
        const { error } = await sb().rpc("poll_text_tally_draft_save", { p_game_id: gameId, p_draft: payload });
        if (error) throw error;
        if (!dirty) setSave("saved");
      } catch (e) {
        console.warn("[poll-tally] draft_save failed", e);
        dirty = true;
        setSave("failed");
      }
    });
    return savingChain;
  }

  /* ---------- API ---------- */

  function cleanupDom() {
    clearMergeMode();
    clearTimeout(saveTimer);
    ui.barEl.hidden = true;
    mode = "";
    model = [];
    states = new Map();
    undo = [];
    redo = [];
    dirty = false;
    updateHistory();
    setSave("");
  }

  return {
    isActive,
    mode: () => mode,
    enterPoints,
    enterText,
    valid: () => (mode === "points" ? true : textValid()),
    undo: undoAction,
    redo: redoAction,
    flush: () => saveDraft(),
    textPayload: () => ({
      items: model.map((q) => ({
        question_id: q.question_id,
        answers: q.items.map((it) => ({ text: it.text, count: it.count })),
      })),
    }),
    // wyjście z podliczania: punktowa wraca animacją, tekstowa — po zapisie szkicu
    // — widokiem surowym (wywołujący przerysowuje wyniki)
    async leave() {
      if (mode === "points") {
        leavePoints();
      } else if (mode === "text") {
        await saveDraft();
      }
      const wasText = mode === "text";
      cleanupDom();
      if (wasText) pollResults.reset();
    },
    // po udanym zatwierdzeniu: tylko sprzątanie, wyniki przerysuje strona
    finish() {
      if (mode === "points") leavePoints();
      cleanupDom();
      pollResults.reset();
    },
    // zmiana języka w trakcie podliczania
    relabel() {
      if (mode === "points") {
        ui.hintEl.textContent = t("polls.tally.hintPoints");
      } else if (mode === "text") {
        ui.hintEl.textContent = t("polls.tally.hintText");
        for (const qs of states.values()) updateQuestion(qs);
      }
    },
  };
}
