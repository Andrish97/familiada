// control/js/gameFinal.js
import { playSfx } from "/familiada/js/core/sfx.js";

/*
WYMAGANE ID w HTML (nowy finał krokowy):
- kontenery:
  - finalStatusList
  - finalP1Inputs
  - finalP2Inputs
  - finalP1Mapping
  - finalP2Mapping
  - finalSum
  - finalTimer
  - msgFinalStart (opcjonalnie) / msgFinal (jeśli chcesz wspólny)
  - msgFinalP1 (opcjonalnie)
  - msgFinalP2 (opcjonalnie)
  - msgFinalMap (opcjonalnie)
  - msgFinalFinish (opcjonalnie)

- tekst pytania w mapowaniu:
  - finalMapQuestion (lub dwa: finalP1MapQuestion / finalP2MapQuestion)
  - finalMapIndex   (lub dwa: finalP1MapIndex / finalP2MapIndex)

- przyciski:
  - btnFinalStart
  - btnFinalP1StartTimer
  - btnFinalP1Next
  - btnFinalP1MapPrev
  - btnFinalP1MapNext
  - btnFinalRound2Start
  - btnFinalP2StartTimer
  - btnFinalP2Next
  - btnFinalP2MapPrev
  - btnFinalP2MapNext
  - btnFinalFinish
*/

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export function createFinal({ ui, store, devices, display, loadAnswers }) {
  let qPicked = []; // 5 questions: [{id,ord,text}]
  let answersByQ = new Map(); // qid -> [{id,ord,text,fixed_points}]

  // picker (zostaje)
  let pickerAll = [];
  let pickerSelected = new Set();

  // timer
  let timerId = null;

  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setMsgAny(id, text) {
    // nie zakładamy, że wszystkie msg-* istnieją
    try {
      ui.setMsg(id, text);
    } catch {}
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
    const rt = store.state.final.runtime;
    if (rt?.timer) rt.timer.running = false;
  }

  function ensureRuntime() {
    const rt = store.state.final.runtime;

    // fazy: IDLE | P1_ENTRY | P1_MAP | ROUND2_START | P2_ENTRY | P2_MAP | FINISH
    if (!rt.phase) rt.phase = "IDLE";

    if (!Number.isFinite(rt.sum)) rt.sum = 0;
    if (!rt.winSide) rt.winSide = "A"; // tym sterujesz stroną timera na display

    if (!rt.timer) rt.timer = { running: false, secLeft: 0, phase: "P1" };

    if (!Array.isArray(rt.p1List)) rt.p1List = Array.from({ length: 5 }, () => ({ text: "", status: "EMPTY" })); // EMPTY|FILLED
    if (!Array.isArray(rt.p2List)) rt.p2List = Array.from({ length: 5 }, () => ({ text: "", status: "EMPTY" })); // EMPTY|FILLED|REPEAT

    if (!Array.isArray(rt.mapP1)) rt.mapP1 = Array.from({ length: 5 }, () => ({ choice: null, matchId: null, outText: "", pts: 0 })); // MATCH|MISS|SKIP
    if (!Array.isArray(rt.mapP2)) rt.mapP2 = Array.from({ length: 5 }, () => ({ choice: null, matchId: null, outText: "", pts: 0 })); // MATCH|MISS|SKIP|REPEAT

    if (!Number.isFinite(rt.mapIndex)) rt.mapIndex = 0;
    if (typeof rt.reached200 !== "boolean") rt.reached200 = false;
  }

  function showStep(step) {
    // wymaga ui.showFinalStep w ui.js
    ui.showFinalStep(step);
  }

  function setTimerOnDisplay(sec) {
    // timer na stronie zwycięzców, bez zer z przodu — display.finalTimerOnSide już to robi
    display.finalTimerOnSide(store.state.final.runtime.winSide, sec).catch(() => {});
  }

  function setSum(val) {
    const rt = store.state.final.runtime;
    rt.sum = Math.max(0, nInt(val, 0));
    ui.setText("finalSum", String(rt.sum));
    display.finalSetSuma(rt.sum).catch(() => {});
  }

  // ---------- picker ----------
  async function pickerReload() {
    const raw = sessionStorage.getItem("familiada:questionsCache");
    pickerAll = raw ? JSON.parse(raw) : [];
    pickerSelected = new Set(store.state.final.picked || []);
    pickerRender();
  }

  function pickerGetSelectedIds() {
    return Array.from(pickerSelected);
  }

  function pickerRender() {
    const root = document.getElementById("finalQList");
    const chips = document.getElementById("pickedChips");
    const cnt = document.getElementById("pickedCount");
    if (!root || !chips || !cnt) return;

    const confirmed = store.state.final.confirmed === true;

    const picked = pickerAll.filter((q) => pickerSelected.has(q.id));
    cnt.textContent = String(picked.length);

    chips.innerHTML = picked
      .map(
        (q) => `
      <div class="chip">
        <span>#${q.ord}</span>
        <span>${escapeHtml(q.text || "")}</span>
        ${confirmed ? "" : `<button type="button" data-x="${q.id}">✕</button>`}
      </div>
    `
      )
      .join("");

    if (!confirmed) {
      chips.querySelectorAll("button[data-x]").forEach((b) => {
        b.addEventListener("click", () => {
          pickerSelected.delete(b.dataset.x);
          store.state.final.picked = Array.from(pickerSelected).slice(0, 5);
          pickerRender();
        });
      });
    }

    if (confirmed) {
      root.innerHTML = picked
        .map(
          (q) => `
        <div class="qRow">
          <div class="meta">#${q.ord}</div>
          <div class="txt">${escapeHtml(q.text || "")}</div>
        </div>
      `
        )
        .join("");
      return;
    }

    root.innerHTML = pickerAll
      .map((q) => {
        const checked = pickerSelected.has(q.id);
        const disabled = !checked && pickerSelected.size >= 5;
        return `
        <label class="qRow">
          <input type="checkbox" data-qid="${q.id}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}/>
          <div class="meta">#${q.ord}</div>
          <div class="txt">${escapeHtml(q.text || "")}</div>
        </label>
      `;
      })
      .join("");

    root.querySelectorAll("input[data-qid]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.qid;
        if (!id) return;

        if (inp.checked) {
          if (pickerSelected.size >= 5) {
            inp.checked = false;
            return;
          }
          pickerSelected.add(id);
        } else {
          pickerSelected.delete(id);
        }

        store.state.final.picked = Array.from(pickerSelected).slice(0, 5);
        pickerRender();
      });
    });
  }

  // ---------- loading questions/answers ----------
  async function loadFinalQuestionsAndAnswers() {
    const raw = sessionStorage.getItem("familiada:questionsCache");
    const all = raw ? JSON.parse(raw) : [];

    qPicked = (store.state.final.picked || [])
      .map((id) => all.find((q) => q.id === id))
      .filter(Boolean);

    if (qPicked.length !== 5) throw new Error("Brakuje 5 pytań finału (zatwierdź w ustawieniach).");

    answersByQ = new Map();
    for (const q of qPicked) {
      const a = await loadAnswers(q.id);
      answersByQ.set(
        q.id,
        (a || []).map((x) => ({
          id: x.id,
          ord: x.ord,
          text: x.text,
          fixed_points: nInt(x.fixed_points, 0),
        }))
      );
    }
  }

  // ---------- status list (opcjonalnie, dla prowadzącego / podglądu) ----------
  function renderStatusList() {
    const rt = store.state.final.runtime;
    const qTexts = qPicked.map((q) => q.text || "");

    const lines = qTexts
      .map((q, i) => {
        const a = rt.p1List[i]?.status === "FILLED" ? "g" : "r";
        const b = rt.p2List[i]?.status === "FILLED" || rt.p2List[i]?.status === "REPEAT" ? "g" : "r";
        return `
          <div class="fLine">
            <div class="left">
              <span class="dotS ${a}"></span><span>P1.${i + 1}</span>
              <span style="opacity:.55;">/</span>
              <span class="dotS ${b}"></span><span>P2.${i + 1}</span>
            </div>
            <div>${escapeHtml(q)}</div>
          </div>
        `;
      })
      .join("");

    ui.setFinalStatusList(lines);
  }

  // ---------- entry renders ----------
  function renderEntryP1() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    const html = qPicked
      .map((q, i) => {
        const v = rt.p1List[i]?.text ?? "";
        return `
          <div class="fQ">
            <div class="qT">Pytanie ${i + 1}: ${escapeHtml(q.text || "")}</div>
            <div class="rows">
              <div>
                <input class="inp" data-i="${i}" value="${escapeHtml(v)}" placeholder="Wpisz…" autocomplete="off"/>
                <div class="rowBtns">
                  <button class="btn sm gold" type="button" data-act="ok" data-i="${i}">Zatwierdź</button>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    const root = document.getElementById("finalP1Inputs");
    if (root) root.innerHTML = html;

    root?.querySelectorAll('input[data-i]').forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i);
        rt.p1List[i].text = String(inp.value ?? "");
      });

      // Enter przechodzi do następnego pola, bez zatwierdzania
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const i = Number(inp.dataset.i);
        const next = root.querySelector(`input[data-i="${i + 1}"]`);
        next?.focus();
      });
    });

    root?.querySelectorAll('button[data-act="ok"]').forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.dataset.i);
        const v = String(rt.p1List[i].text ?? "").trim();
        rt.p1List[i].status = v ? "FILLED" : "EMPTY";
        renderStatusList();
      });
    });

    renderStatusList();
  }

  function renderEntryP2() {
    ensureRuntime();
    const rt = store.state.final.runtime;

    const html = qPicked
      .map((q, i) => {
        const v = rt.p2List[i]?.text ?? "";
        const p1 = String(rt.p1List[i]?.text ?? "").trim() || "—";
        return `
          <div class="fQ">
            <div class="qT">Pytanie ${i + 1}: ${escapeHtml(q.text || "")}</div>
            <div class="rows">
              <div>
                <div class="lbl2">Odp. gracza 1</div>
                <div class="badge" style="width:100%;">${escapeHtml(p1)}</div>
              </div>
              <div>
                <input class="inp" data-i="${i}" value="${escapeHtml(v)}" placeholder="Wpisz…" autocomplete="off"/>
                <div class="rowBtns">
                  <button class="btn sm gold" type="button" data-act="ok" data-i="${i}">Zatwierdź</button>
                  <button class="btn sm danger" type="button" data-act="rep" data-i="${i}">Powtórzenie</button>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    const root = document.getElementById("finalP2Inputs");
    if (root) root.innerHTML = html;

    root?.querySelectorAll('input[data-i]').forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i);
        rt.p2List[i].text = String(inp.value ?? "");
      });

      // Enter przechodzi do następnego pola, bez zatwierdzania
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const i = Number(inp.dataset.i);
        const next = root.querySelector(`input[data-i="${i + 1}"]`);
        next?.focus();
      });
    });

    root?.querySelectorAll('button[data-act="ok"]').forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.dataset.i);
        const v = String(rt.p2List[i].text ?? "").trim();
        rt.p2List[i].status = v ? "FILLED" : "EMPTY";
        renderStatusList();
      });
    });

    root?.querySelectorAll('button[data-act="rep"]').forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.dataset.i);
        rt.p2List[i].status = "REPEAT";
        // tylko dźwięk + info dla prowadzącego (operator widzi wizualnie)
        playSfx("answer_repeat");
        renderStatusList();
      });
    });

    renderStatusList();
  }

  // ---------- timers ----------
  function startTimer(seconds, phaseLabel) {
    ensureRuntime();
    stopTimer();

    const rt = store.state.final.runtime;
    rt.timer.running = true;
    rt.timer.secLeft = nInt(seconds, seconds);
    rt.timer.phase = phaseLabel;

    ui.setText("finalTimer", String(rt.timer.secLeft));
    setTimerOnDisplay(rt.timer.secLeft);

    // blokuj DALEJ do końca odliczania
    if (phaseLabel === "P1") ui.setEnabled("btnFinalP1Next", false);
    if (phaseLabel === "P2") ui.setEnabled("btnFinalP2Next", false);

    timerId = setInterval(() => {
      rt.timer.secLeft = Math.max(0, nInt(rt.timer.secLeft, 0) - 1);

      ui.setText("finalTimer", String(rt.timer.secLeft));
      setTimerOnDisplay(rt.timer.secLeft);

      if (rt.timer.secLeft <= 0) {
        stopTimer();
        playSfx("time_over");
        if (phaseLabel === "P1") ui.setEnabled("btnFinalP1Next", true);
        if (phaseLabel === "P2") ui.setEnabled("btnFinalP2Next", true);
      }
    }, 1000);
  }

  function startTimerP1() {
    startTimer(15, "P1");
  }

  function startTimerP2() {
    startTimer(20, "P2");
  }

  // ---------- mapping (jedno pytanie naraz) ----------
  function setMapHeader(which) {
    const rt = store.state.final.runtime;
    const i = rt.mapIndex;
    const q = qPicked[i];

    // obsłuż oba warianty ID: wspólne albo osobne
    const idxId = which === "P1" ? "finalP1MapIndex" : "finalP2MapIndex";
    const qId = which === "P1" ? "finalP1MapQuestion" : "finalP2MapQuestion";

    if (document.getElementById(idxId)) ui.setText(idxId, String(i + 1));
    else if (document.getElementById("finalMapIndex")) ui.setText("finalMapIndex", String(i + 1));

    if (document.getElementById(qId)) ui.setText(qId, q?.text || "—");
    else if (document.getElementById("finalMapQuestion")) ui.setText("finalMapQuestion", q?.text || "—");
  }

  function renderMap(which) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const i = rt.mapIndex;

    const q = qPicked[i];
    const aList = answersByQ.get(q.id) || [];

    const entry = which === "P1" ? rt.p1List[i] : rt.p2List[i];
    const mapRow = which === "P1" ? rt.mapP1[i] : rt.mapP2[i];

    setMapHeader(which);

    const typed = String(entry.text || "").trim();
    const status = entry.status || "EMPTY";

    const root = document.getElementById(which === "P1" ? "finalP1Mapping" : "finalP2Mapping");
    if (!root) return;

    // brak wpisu → tylko treść pytania, dalej przechodzi dalej (bez wysyłki)
    if (status !== "FILLED" || !typed) {
      root.innerHTML = `<div class="mini"><div class="hint">Brak odpowiedzi — przejdź dalej.</div></div>`;
      // w tym przypadku nie wymagamy wyboru
      ui.setEnabled(which === "P1" ? "btnFinalP1MapNext" : "btnFinalP2MapNext", true);
      return;
    }

    // P2 może mieć REPEAT (operator zaznacza) – wtedy na tablicy X/0, dźwięk już był, a tu tylko informacja
    if (which === "P2" && status === "REPEAT") {
      root.innerHTML = `<div class="mini"><div class="hint">Powtórzenie — 0 pkt. Na tablicy wygląda jak X/0.</div></div>`;
      ui.setEnabled("btnFinalP2MapNext", true);
      return;
    }

    const opts = aList
      .map((a) => {
        const active = mapRow.choice === "MATCH" && mapRow.matchId === a.id;
        return `
          <div class="mapOpt ${active ? "active" : ""}" data-kind="match" data-id="${a.id}">
            ${escapeHtml(a.text)} <span style="opacity:.7;">(${nInt(a.fixed_points, 0)})</span>
          </div>
        `;
      })
      .join("");

    const missActive = mapRow.choice === "MISS";

    root.innerHTML = `
      <div class="cards2" style="margin-top:10px;">
        <div class="card">
          <div class="name">Lista odpowiedzi</div>
          <div class="mappingGrid" style="margin-top:10px;">
            ${opts || `<div class="hint">Brak listy odpowiedzi.</div>`}
          </div>
        </div>

        <div class="card">
          <div class="name">Odpowiedź wpisana</div>
          <div class="mini"><div class="hint">Jeśli nie ma na liście — wybierz „Nie ma na liście”.</div></div>

          <div class="rowBtns">
            <button class="btn ${missActive ? "gold" : ""}" type="button" data-kind="miss">Nie ma na liście (0 pkt)</button>
          </div>

          <div class="rowBtns">
            <input class="inp" data-kind="out" value="${escapeHtml(mapRow.outText || typed)}" maxlength="11"/>
          </div>
        </div>
      </div>
    `;

    // bind match
    root.querySelectorAll('.mapOpt[data-kind="match"]').forEach((el) => {
      el.addEventListener("click", () => {
        mapRow.choice = "MATCH";
        mapRow.matchId = el.dataset.id || null;
        mapRow.outText = "";
        renderMap(which);
      });
    });

    // bind miss
    root.querySelector('button[data-kind="miss"]')?.addEventListener("click", () => {
      mapRow.choice = "MISS";
      mapRow.matchId = null;
      if (!mapRow.outText) mapRow.outText = typed;
      renderMap(which);
    });

    // bind out text
    root.querySelector('input[data-kind="out"]')?.addEventListener("input", (e) => {
      mapRow.outText = String(e.target.value ?? "");
    });

    // “Dalej” dopiero gdy wybrano MATCH albo MISS
    const ok = mapRow.choice === "MATCH" || mapRow.choice === "MISS";
    ui.setEnabled(which === "P1" ? "btnFinalP1MapNext" : "btnFinalP2MapNext", ok);
  }

  async function applyMapped(which) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    const i = rt.mapIndex;
    const q = qPicked[i];
    const aList = answersByQ.get(q.id) || [];

    const entry = which === "P1" ? rt.p1List[i] : rt.p2List[i];
    const status = entry.status || "EMPTY";
    const typed = String(entry.text || "").trim();

    // brak wpisu -> nic nie wysyłamy, przechodzimy dalej
    if (status !== "FILLED" || !typed) return { pts: 0, didSend: false };

    // P2 repeat -> 0 pkt, wyświetl jako placeholder + 0
    if (which === "P2" && status === "REPEAT") {
      await display.finalSetLeft(i + 1, display.PLACE.finalText);
      await display.finalSetA(i + 1, "00");
      playSfx("answer_repeat");
      return { pts: 0, didSend: true };
    }

    const row = which === "P1" ? rt.mapP1[i] : rt.mapP2[i];

    let outText = "";
    let pts = 0;
    let sfx = null;

    if (row.choice === "MATCH") {
      const a = aList.find((x) => x.id === row.matchId);
      outText = a?.text || "";
      pts = nInt(a?.fixed_points, 0);
      sfx = "answer_correct";
    } else if (row.choice === "MISS") {
      outText = String(row.outText || typed).trim();
      pts = 0;
      sfx = "answer_wrong";
    } else {
      // brak wyboru (nie powinno się zdarzyć gdy UI blokuje)
      outText = String(row.outText || typed).trim();
      pts = 0;
      sfx = "answer_wrong";
    }

    // wyślij na display: na razie używamy LEWEJ kolumny (jak w Twojej implementacji)
    // (jak będziesz chciał: P1 lewa, P2 prawa — dopisz później łatwo)
    const txt11 = outText ? outText.slice(0, 11) : display.PLACE.finalText;

    await display.finalSetLeft(i + 1, txt11);
    await display.finalSetA(i + 1, String(pts).padStart(2, "0").slice(-2));

    if (sfx) playSfx(sfx);

    return { pts, didSend: true };
  }

  function mapPrev(which) {
    ensureRuntime();
    const rt = store.state.final.runtime;
    if (rt.mapIndex <= 0) return;
    rt.mapIndex -= 1;
    renderMap(which);
    ui.setEnabled(which === "P1" ? "btnFinalP1MapPrev" : "btnFinalP2MapPrev", rt.mapIndex > 0);
  }

  async function mapNext(which) {
    ensureRuntime();
    const rt = store.state.final.runtime;

    // wyślij wynik tego pytania
    const res = await applyMapped(which);

    // suma
    if (res?.didSend) {
      const nextSum = Math.min(200, nInt(rt.sum, 0) + nInt(res.pts, 0));
      setSum(nextSum);

      if (nextSum >= 200) {
        rt.reached200 = true;
        rt.phase = "FINISH";
        showStep("final_finish");
        ui.setEnabled("btnFinalFinish", true);
        setMsgAny("msgFinalFinish", "Osiągnięto 200 punktów — finał przerwany.");
        return;
      }
    }

    // następny indeks
    if (rt.mapIndex < 4) {
      rt.mapIndex += 1;
      renderMap(which);
      ui.setEnabled(which === "P1" ? "btnFinalP1MapPrev" : "btnFinalP2MapPrev", rt.mapIndex > 0);
      return;
    }

    // koniec mapowania rundy
    if (which === "P1") {
      rt.phase = "ROUND2_START";
      showStep("final_round2_start");
      ui.setEnabled("btnFinalRound2Start", true);
      return;
    }

    // koniec P2 map => finish
    rt.phase = "FINISH";
    showStep("final_finish");
    ui.setEnabled("btnFinalFinish", true);
  }

  // ---------- phase transitions ----------
  async function startFinal() {
    ensureRuntime();
    stopTimer();

    if (store.state.hasFinal !== true) {
      setMsgAny("msgFinalStart", "Finał jest wyłączony.");
      setMsgAny("msgFinal", "Finał jest wyłączony.");
      return;
    }
    if (!store.state.final.confirmed || store.state.final.picked.length !== 5) {
      setMsgAny("msgFinalStart", "Zatwierdź 5 pytań finału w ustawieniach.");
      setMsgAny("msgFinal", "Zatwierdź 5 pytań finału w ustawieniach.");
      return;
    }

    // prepare runtime
    const rt = store.state.final.runtime;
    rt.phase = "P1_ENTRY";
    rt.sum = 0;
    rt.reached200 = false;
    rt.mapIndex = 0;

    // reset lists
    rt.p1List = Array.from({ length: 5 }, () => ({ text: "", status: "EMPTY" }));
    rt.p2List = Array.from({ length: 5 }, () => ({ text: "", status: "EMPTY" }));
    rt.mapP1 = Array.from({ length: 5 }, () => ({ choice: null, matchId: null, outText: "", pts: 0 }));
    rt.mapP2 = Array.from({ length: 5 }, () => ({ choice: null, matchId: null, outText: "", pts: 0 }));

    await loadFinalQuestionsAndAnswers();

    // display: start finału
    playSfx("final_theme");
    await display.finalBoardPlaceholders();
    await display.finalSetSuma(0);

    // timer label w UI
    ui.setText("finalTimer", "—");

    // przejście od razu na kartę 2 (P1 wpisywanie)
    showStep("final_p1_entry");
    renderEntryP1();

    ui.setEnabled("btnFinalP1StartTimer", true);
    ui.setEnabled("btnFinalP1Next", false);

    // map buttons safety
    ui.setEnabled("btnFinalP1MapPrev", false);
    ui.setEnabled("btnFinalP1MapNext", false);

    setMsgAny("msgFinalStart", "");
    setMsgAny("msgFinal", "Finał: wpisywanie odpowiedzi gracza 1.");
  }

  function goToP1Map() {
    ensureRuntime();
    stopTimer();

    const rt = store.state.final.runtime;
    rt.phase = "P1_MAP";
    rt.mapIndex = 0;

    showStep("final_p1_map");
    renderMap("P1");

    ui.setEnabled("btnFinalP1MapPrev", false);
    // next jest sterowany przez renderMap (czy jest wybór)
    ui.setEnabled("btnFinalP1MapNext", true);
  }

  async function startRound2() {
    ensureRuntime();
    stopTimer();

    const rt = store.state.final.runtime;
    rt.phase = "P2_ENTRY";
    rt.mapIndex = 0;

    // dźwięk rundy 2 (wg Twojej reguły round_transition zostaje na początku i na końcu rundy)
    playSfx("round_transition");

    // TODO: jeśli masz komendę display do "ukryj odpowiedzi, zostaw sumę" – dodaj tu.
    // Na razie zostawiamy jak jest, bo display API tego nie ma w Twoim pliku.

    showStep("final_p2_entry");
    renderEntryP2();

    ui.setEnabled("btnFinalP2StartTimer", true);
    ui.setEnabled("btnFinalP2Next", false);

    ui.setEnabled("btnFinalP2MapPrev", false);
    ui.setEnabled("btnFinalP2MapNext", false);

    setMsgAny("msgFinal", "Finał: wpisywanie odpowiedzi gracza 2.");
  }

  function goToP2Map() {
    ensureRuntime();
    stopTimer();

    const rt = store.state.final.runtime;
    rt.phase = "P2_MAP";
    rt.mapIndex = 0;

    showStep("final_p2_map");
    renderMap("P2");

    ui.setEnabled("btnFinalP2MapPrev", false);
    ui.setEnabled("btnFinalP2MapNext", true);
  }

  async function finishFinal() {
    ensureRuntime();
    stopTimer();

    const rt = store.state.final.runtime;
    rt.phase = "FINISH";

    // zawsze dźwięk finału na koniec (tak jak chcesz)
    playSfx("final_theme");

    // TODO: nagrody / logo / wariant bez nagrody
    // Na razie: tylko komunikat. (Nagrody dodamy jak dopniesz “ustawienia zaawansowane” w setup.)
    setMsgAny("msgFinalFinish", rt.sum >= 200 ? "Wygrana (>=200) — zakończono finał." : "Koniec finału — <200.");

    ui.setEnabled("btnFinalFinish", false);
  }

  return {
    // picker
    pickerReload,
    pickerRender,
    pickerGetSelectedIds,

    // phases
    startFinal,

    // timers
    startTimerP1,
    startTimerP2,

    // transitions
    goToP1Map,
    startRound2,
    goToP2Map,

    // mapping nav
    mapPrev,
    mapNext,

    // finish
    finishFinal,
  };
}
