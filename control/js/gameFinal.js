import { playSfx } from "/familiada/js/core/sfx.js";

function norm(s){
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("Ą","A").replaceAll("Ć","C").replaceAll("Ę","E").replaceAll("Ł","L")
    .replaceAll("Ń","N").replaceAll("Ó","O").replaceAll("Ś","S").replaceAll("Ź","Z").replaceAll("Ż","Z");
}

function nInt(v, d=0){ const x = Number.parseInt(String(v??""),10); return Number.isFinite(x)?x:d; }

export function createFinal({ ui, store, devices, display, loadAnswers }) {
  let qAll = [];
  let qPicked = []; // 5 questions
  let answersByQ = new Map();

  let pickerAll = [];
  let pickerSelected = new Set();

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function pickerReload() {
    // load questions list via the already-loaded list in setup (we don’t have direct loadQuestions here)
    // simplest: reuse UI list from store: we only store ids; the app can reload list again here by calling core.
    // BUT you wanted “ładnie”: so we rely on app to call final.pickerReload() after app boot; it uses store.final.picked in confirm.
    // Here: we fetch from SB using game-validate import in app; to keep module standalone we only render from existing DOM is not enough.
    // So we do: use window.__finalQuestions passed? If not, show empty.
    // To keep it working now: we try to read cached list from sessionStorage set by app (if you want). If not, show empty.
    const raw = sessionStorage.getItem("familiada:questionsCache");
    pickerAll = raw ? JSON.parse(raw) : [];
    pickerSelected = new Set(store.state.final.picked || []);
    pickerRender();
  }

  function pickerGetSelectedIds() { return Array.from(pickerSelected); }

  function pickerRender() {
    const root = document.getElementById("finalQList");
    const chips = document.getElementById("pickedChips");
    const cnt = document.getElementById("pickedCount");
    if (!root || !chips || !cnt) return;

    const confirmed = store.state.final.confirmed === true;

    // chips
    const picked = pickerAll.filter((q) => pickerSelected.has(q.id));
    cnt.textContent = String(picked.length);

    chips.innerHTML = picked.map((q) => `
      <div class="chip">
        <span>#${q.ord}</span>
        <span>${escapeHtml(q.text || "")}</span>
        ${confirmed ? "" : `<button type="button" data-x="${q.id}">✕</button>`}
      </div>
    `).join("");

    if (!confirmed) {
      chips.querySelectorAll("button[data-x]").forEach((b) => {
        b.addEventListener("click", () => {
          pickerSelected.delete(b.dataset.x);
          store.state.final.picked = Array.from(pickerSelected).slice(0, 5);
          pickerRender();
        });
      });
    }

    // list
    if (confirmed) {
      // show only chosen
      root.innerHTML = picked.map((q) => `
        <div class="qRow">
          <div class="meta">#${q.ord}</div>
          <div class="txt">${escapeHtml(q.text || "")}</div>
        </div>
      `).join("");
      return;
    }

    root.innerHTML = pickerAll.map((q) => {
      const checked = pickerSelected.has(q.id);
      const disabled = !checked && pickerSelected.size >= 5;
      return `
        <label class="qRow">
          <input type="checkbox" data-qid="${q.id}" ${checked ? "checked":""} ${disabled ? "disabled":""}/>
          <div class="meta">#${q.ord}</div>
          <div class="txt">${escapeHtml(q.text || "")}</div>
        </label>
      `;
    }).join("");

    root.querySelectorAll("input[data-qid]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.qid;
        if (!id) return;
        if (inp.checked) {
          if (pickerSelected.size >= 5) { inp.checked = false; return; }
          pickerSelected.add(id);
        } else {
          pickerSelected.delete(id);
        }
        store.state.final.picked = Array.from(pickerSelected).slice(0, 5);
        pickerRender();
      });
    });
  }

  function buildStatusList(phase, qTexts, p1, p2) {
    // status: 🟢 = odpowiedź udzielona; 🔴 = można wrócić
    // For entry: based on state per question (EMPTY / FILLED / REPEAT)
    const lines = qTexts.map((q, i) => {
      const s1 = p1[i]?.status || "EMPTY";
      const dot = (s1 === "FILLED" || s1 === "REPEAT") ? "g" : "r";
      const label = dot === "g" ? "🟢" : "🔴";
      return `
        <div class="fLine">
          <div class="left">
            <span class="dotS ${dot}"></span>
            <span>${label} P${i+1}</span>
          </div>
          <div>${escapeHtml(q)}</div>
        </div>
      `;
    }).join("");
    return lines;
  }

  function ensureFinalRuntime() {
    const rt = store.state.final.runtime;
    if (!rt.p1List) rt.p1List = Array.from({ length: 5 }, () => ({ text:"", status:"EMPTY" })); // status: EMPTY|FILLED|REPEAT
    if (!rt.p2List) rt.p2List = Array.from({ length: 5 }, () => ({ text:"", status:"EMPTY" }));
    if (!rt.mapList) rt.mapList = Array.from({ length: 5 }, () => ({
      choice: null, // MATCH|MISS|SKIP|REPEAT
      matchId: null,
      outText: "",
      pts: 0,
    }));
  }

  async function loadFinalQuestionsAndAnswers() {
    // only ids are stored; texts cached in sessionStorage from app (see below note)
    const raw = sessionStorage.getItem("familiada:questionsCache");
    const all = raw ? JSON.parse(raw) : [];
    qPicked = (store.state.final.picked || []).map((id) => all.find((q) => q.id === id)).filter(Boolean);
    if (qPicked.length !== 5) throw new Error("Brakuje 5 pytań finału (zatwierdź w ustawieniach).");

    answersByQ = new Map();
    for (const q of qPicked) {
      const a = await loadAnswers(q.id);
      answersByQ.set(q.id, (a || []).map((x) => ({
        id: x.id,
        ord: x.ord,
        text: x.text,
        fixed_points: nInt(x.fixed_points, 0),
      })));
    }
  }

  function renderFinalEntry() {
    ensureFinalRuntime();

    const rt = store.state.final.runtime;
    const phase = rt.phase;

    const qTexts = qPicked.map((q) => q.text || "");
    ui.setFinalStatusList(buildStatusList(phase, qTexts, rt.p1List, rt.p2List));

    // inputs
    const html = qPicked.map((q, i) => {
      const p1 = rt.p1List[i];
      const p2 = rt.p2List[i];
      return `
        <div class="fQ" data-i="${i}">
          <div class="qT">Pytanie ${i+1}: ${escapeHtml(q.text || "")}</div>
          <div class="rows">
            <div>
              <div class="lbl2">Gracz 1</div>
              <input class="inp" data-p="1" data-i="${i}" value="${escapeHtml(p1.text)}" placeholder="Wpisz…" autocomplete="off"/>
              <div class="rowBtns">
                <button class="btn sm gold" type="button" data-enter="1" data-i="${i}">Enter</button>
                <button class="btn sm" type="button" data-skip="1" data-i="${i}">Pomiń</button>
                <button class="btn sm danger" type="button" data-repeat="1" data-i="${i}">Powtórzenie</button>
              </div>
            </div>
            <div>
              <div class="lbl2">Gracz 2</div>
              <input class="inp" data-p="2" data-i="${i}" value="${escapeHtml(p2.text)}" placeholder="Wpisz…" autocomplete="off"/>
              <div class="rowBtns">
                <button class="btn sm gold" type="button" data-enter="2" data-i="${i}">Enter</button>
                <button class="btn sm" type="button" data-skip="2" data-i="${i}">Pomiń</button>
                <button class="btn sm danger" type="button" data-repeat="2" data-i="${i}">Powtórzenie</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    ui.setFinalInputs(html);

    // wire inputs events
    document.querySelectorAll('#finalInputs input[data-p]').forEach((inp) => {
      inp.addEventListener("input", () => {
        const p = Number(inp.dataset.p);
        const i = Number(inp.dataset.i);
        const v = String(inp.value ?? "");
        if (p === 1) rt.p1List[i].text = v;
        if (p === 2) rt.p2List[i].text = v;
      });

      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;

        const p = Number(inp.dataset.p);
        const i = Number(inp.dataset.i);

        // Cmd/Ctrl+Enter = powtórzenie
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          markRepeat(p, i);
          return;
        }

        e.preventDefault();
        markEntered(p, i);
      });
    });

    document.querySelectorAll('#finalInputs button[data-enter]').forEach((b) => {
      b.addEventListener("click", () => markEntered(Number(b.dataset.enter), Number(b.dataset.i)));
    });
    document.querySelectorAll('#finalInputs button[data-skip]').forEach((b) => {
      b.addEventListener("click", () => markSkip(Number(b.dataset.skip), Number(b.dataset.i)));
    });
    document.querySelectorAll('#finalInputs button[data-repeat]').forEach((b) => {
      b.addEventListener("click", () => markRepeat(Number(b.dataset.repeat), Number(b.dataset.i)));
    });

    // enable mapping only when at least p1 statuses decided (some filled/empty/repeat)
    const any = rt.p1List.some((x) => x.status !== "EMPTY" || x.text.trim().length > 0);
    ui.setEnabled("btnFinalToMapping", any);
  }

  function markEntered(player, idx) {
    ensureFinalRuntime();
    const rt = store.state.final.runtime;
    const arr = player === 1 ? rt.p1List : rt.p2List;

    const v = String(arr[idx].text ?? "").trim();
    if (v.length > 0) {
      arr[idx].status = "FILLED";
    } else {
      // Enter on empty => no answer
      arr[idx].status = "EMPTY";
    }
    playSfx("answer_correct");
    renderFinalEntry();
  }

  function markRepeat(player, idx) {
    ensureFinalRuntime();
    const rt = store.state.final.runtime;
    const arr = player === 1 ? rt.p1List : rt.p2List;

    // repeat can also be empty (per spec)
    arr[idx].status = "REPEAT";
    playSfx("answer_repeat");
    renderFinalEntry();
  }

  function markSkip(player, idx) {
    ensureFinalRuntime();
    const rt = store.state.final.runtime;
    const arr = player === 1 ? rt.p1List : rt.p2List;

    arr[idx].text = "";
    arr[idx].status = "EMPTY";
    renderFinalEntry();
  }

  function buildMapping() {
    ensureFinalRuntime();
    const rt = store.state.final.runtime;

    const mapHtml = qPicked.map((q, i) => {
      const aList = answersByQ.get(q.id) || [];
      const p1 = rt.p1List[i];
      const p2 = rt.p2List[i];

      const u1 = String(p1.text ?? "").trim();
      const u2 = String(p2.text ?? "").trim();

      // show helper: second player sees first player's answer (you wanted)
      const p1View = u1.length ? escapeHtml(u1) : "—";

      const row = rt.mapList[i];

      // mapping candidates: only those where player answered (FILLED) and not empty
      // If EMPTY => auto skip
      const mapable = (p1.status === "FILLED" && u1.length > 0) || (p2.status === "FILLED" && u2.length > 0) || (p1.status === "REPEAT" || p2.status === "REPEAT");

      // build options for match
      const opts = aList.map((a) => {
        const active = row.choice === "MATCH" && row.matchId === a.id;
        return `<div class="mapOpt ${active ? "active":""}" data-i="${i}" data-kind="match" data-id="${a.id}">
          ${escapeHtml(a.text)} <span style="opacity:.7;">(${a.fixed_points})</span>
        </div>`;
      }).join("");

      const missActive = row.choice === "MISS";
      const skipActive = row.choice === "SKIP";
      const repActive = row.choice === "REPEAT";

      return `
        <div class="mapRow" data-i="${i}">
          <div class="mTop">
            <div class="mQ">Pytanie ${i+1}: ${escapeHtml(q.text || "")}</div>
            <div class="badge">G1: ${escapeHtml(u1 || "—")} • G2: ${escapeHtml(u2 || "—")} (G1→ ${p1View})</div>
          </div>

          <div class="mBody">
            <div class="mapPick">
              <div>
                <div class="lbl2">Dostępne odpowiedzi</div>
                ${opts || `<div class="hint">Brak listy odpowiedzi.</div>`}
              </div>
              <div>
                <div class="lbl2">Inne</div>

                <div class="mapOpt ${missActive ? "active":""}" data-i="${i}" data-kind="miss">
                  Nietrafiona / własna (0 pkt) — można poprawić literówkę tu:
                </div>
                <input class="inp" data-i="${i}" data-kind="out" value="${escapeHtml(row.outText || (u1 || u2 || ""))}" placeholder="Tekst do wyświetlenia (0 pkt)"/>

                <div class="rowBtns" style="margin-top:10px;">
                  <button class="btn sm ${skipActive ? "gold":""}" type="button" data-i="${i}" data-kind="skip">Brak odpowiedzi</button>
                  <button class="btn sm danger ${repActive ? "gold":""}" type="button" data-i="${i}" data-kind="repeat">Powtórzenie</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    ui.setFinalMapping(mapHtml);

    // wire mapping clicks
    document.querySelectorAll('#finalMapping .mapOpt[data-kind="match"]').forEach((d) => {
      d.addEventListener("click", () => {
        const i = Number(d.dataset.i);
        const id = d.dataset.id;
        const row = store.state.final.runtime.mapList[i];
        row.choice = "MATCH";
        row.matchId = id;
        row.outText = "";
        renderMapping();
      });
    });

    document.querySelectorAll('#finalMapping .mapOpt[data-kind="miss"]').forEach((d) => {
      d.addEventListener("click", () => {
        const i = Number(d.dataset.i);
        const row = store.state.final.runtime.mapList[i];
        row.choice = "MISS";
        if (!row.outText) {
          const p1 = store.state.final.runtime.p1List[i];
          const p2 = store.state.final.runtime.p2List[i];
          row.outText = (p1.text || p2.text || "").trim();
        }
        renderMapping();
      });
    });

    document.querySelectorAll('#finalMapping button[data-kind="skip"]').forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.dataset.i);
        const row = store.state.final.runtime.mapList[i];
        row.choice = "SKIP";
        row.matchId = null;
        row.outText = "";
        renderMapping();
      });
    });

    document.querySelectorAll('#finalMapping button[data-kind="repeat"]').forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.dataset.i);
        const row = store.state.final.runtime.mapList[i];
        row.choice = "REPEAT";
        row.matchId = null;
        row.outText = "";
        renderMapping();
      });
    });

    document.querySelectorAll('#finalMapping input[data-kind="out"]').forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i);
        const row = store.state.final.runtime.mapList[i];
        row.outText = String(inp.value ?? "");
      });
    });
  }

  function renderMapping() {
    buildMapping();
    // enable commit when every row has a choice
    const ok = store.state.final.runtime.mapList.every((r) => !!r.choice);
    ui.setEnabled("btnFinalCommit", ok);
  }

  async function startFinal() {
    if (store.state.hasFinal !== true) {
      ui.setMsg("msgFinal", "Finał jest wyłączony.");
      return;
    }
    if (!store.state.final.confirmed || store.state.final.picked.length !== 5) {
      ui.setMsg("msgFinal", "Zatwierdź 5 pytań finału w ustawieniach.");
      return;
    }

    // prepare
    store.state.final.runtime.phase = "P1_ENTRY";
    store.state.final.runtime.sum = 0;

    await loadFinalQuestionsAndAnswers();

    // display: final board placeholders
    playSfx("final_theme");
    await display.finalBoardPlaceholders();
    await display.finalSetSuma(0);

    ui.setMsg("msgFinal", "Finał rozpoczęty. Wpisuj odpowiedzi.");
    renderFinalEntry();

    // enable “to mapping” once some entries exist
    ui.setEnabled("btnFinalToMapping", true);
    ui.setEnabled("btnFinalRevealAll", false);
    ui.setEnabled("btnFinalFinish", false);
  }

  function toMapping() {
    store.state.final.runtime.phase = "MAPPING";
    buildMapping();
    renderMapping();

    ui.setEnabled("btnFinalRevealAll", true);
    ui.setEnabled("btnFinalToMapping", false);
  }

  async function revealAll() {
    // reveal everything on display from mapping results (but not finalize)
    await commitToDisplay(true);
  }

  async function commitToDisplay(isPreview = false) {
    const rt = store.state.final.runtime;

    // compute pts
    let sum = 0;

    for (let i = 0; i < 5; i++) {
      const q = qPicked[i];
      const row = rt.mapList[i];
      const aList = answersByQ.get(q.id) || [];

      if (row.choice === "MATCH") {
        const a = aList.find((x) => x.id === row.matchId);
        const pts = a ? nInt(a.fixed_points, 0) : 0;
        row.pts = pts;
        row.outText = a?.text || "";
        sum += pts;
      } else if (row.choice === "MISS") {
        row.pts = 0;
        // keep outText as typed
      } else if (row.choice === "SKIP") {
        row.pts = 0;
        row.outText = ""; // show placeholders
      } else if (row.choice === "REPEAT") {
        row.pts = 0;
        row.outText = ""; // on board looks like X/0 – only sound differs (handled earlier)
      }
    }

    rt.sum = sum;
    ui.setText("finalSum", String(sum));

    // send to display: left = player1, right = player2, points in A/B columns
    // simplified: we show row text on left as final outText and points on A, keep right similarly if you decide later.
    // Here we follow your “final answers appear with points; if missing => 0; placeholders if none”.
    for (let i = 0; i < 5; i++) {
      const row = rt.mapList[i];

      const out = String(row.outText || "").trim();
      const txt = out.length ? out : display.PLACE.finalText;

      // Put in left column as “answer”
      await display.finalSetLeft(i+1, txt.slice(0, 11));
      await display.finalSetA(i+1, String(row.pts).padStart(2, "0").slice(-2));

      // Right column stays placeholder for now (you can extend to show both players separately)
      await display.finalSetRight(i+1, display.PLACE.finalText);
      await display.finalSetB(i+1, "00");
    }

    await display.finalSetSuma(sum);

    ui.setEnabled("btnFinalFinish", !isPreview);
    if (!isPreview) {
      store.state.final.runtime.phase = "DONE";
    }
  }

  function finishFinal() {
    ui.setMsg("msgFinal", "Finał zakończony.");
    ui.setEnabled("btnFinalFinish", false);
  }

  return {
    pickerReload,
    pickerRender,
    pickerGetSelectedIds,

    startFinal,
    toMapping,
    revealAll,
    commitToDisplay,
    finishFinal,
  };
}
