
import { sb as supabase } from "/js/core/supabase.js?v=20260314-1";
import { alertModal, confirmModal } from "../core/modal.js";

let games = [];
const uniquenessCache = new Map();
const weaknessCache = new Map();
const selectedIds = new Set();
let generated = [];
let lastGenerateParams = { lang: 'pl', topic: '' };
let cancelGenerate = false;

// Helpers
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if(el) el.style.display = 'block'; };
const hide = id => { const el = $(id); if(el) el.style.display = 'none'; };

function showStatus(id, msg, type) {
  const el = $(id);
  if(!el) return;
  el.textContent = msg;
  el.className = 'status-bar visible ' + (type || '');
}

function setBusy(busy) {
  ['gen-load-btn', 'gen-scan-btn', 'gen-enqueue-btn'].forEach(id => {
    const el = $(id);
    if (el) el.disabled = busy;
  });
  const list = $('gen-game-list');
  if (list) list.style.opacity = busy ? '0.5' : '1';
}

function setProgress(done, total) {
  const fill = $('gen-progress-fill');
  if (!fill) return;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  fill.style.width = `${pct}%`;
}

function makeLocalId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// API Call
async function callEdgeAction(action, body = {}) {
  const { data, error } = await supabase().functions.invoke('generate-game', { body: { action, ...body } });
  if (error) throw new Error(error.message || 'Unknown error');
  return data;
}

// Main logic
async function loadGames() {
  const lang = $('gen-manage-lang').value;
  setBusy(true);
  showStatus('gen-session-status', 'Wczytuję gry...', 'info');
  try {
    games = await callEdgeAction('list-producer-games', { lang });
    uniquenessCache.clear();
    weaknessCache.clear();
    selectedIds.clear();
    generated = [];
    hide('gen-results-section');
    show('gen-manage-card');
    show('gen-input-card');
    show('gen-enqueue-btn');
    const scanBtn = $('gen-scan-btn');
    if (scanBtn) scanBtn.disabled = games.length === 0;
    renderGameList();
    showStatus('gen-session-status', `Załadowano ${games.length} gier.`, 'ok');
  } catch (e) {
    showStatus('gen-session-status', `✗ ${e.message}`, 'err');
  } finally {
    setBusy(false);
  }
}

async function generateGames() {
  const lang = $('gen-manage-lang').value;
  const count = parseInt($('gen-count').value) || 1;
  const topic = $('gen-topic').value.trim();
  lastGenerateParams = { lang, topic };
  cancelGenerate = false;
  const resetBtn = $('gen-reset-btn');
  if (resetBtn) {
    resetBtn.style.display = '';
    resetBtn.textContent = '✕ Przerwij generowanie';
    resetBtn.onclick = (e) => {
      e.preventDefault();
      cancelGenerate = true;
      showStatus('gen-session-status', 'Przerywam…', 'info');
    };
  }
  
  setBusy(true);
  showStatus('gen-session-status', `Generowanie ${count} gier...`, 'info');
  show('gen-results-section');
  setProgress(0, count);
  generated = [];
  renderGeneratedList();

  let produced = 0;
  let slotAttempts = 0;
  let slotStartedAt = Date.now();
  let backoffMs = 400;

  while (!cancelGenerate && produced < count) {
    const slot = produced + 1;
    slotAttempts++;
    const elapsedSec = Math.max(0, Math.round((Date.now() - slotStartedAt) / 1000));
    showStatus('gen-session-status', `Generowanie ${slot}/${count}… (${elapsedSec}s)`, 'info');
    try {
      const existingTitles = games.map(g => String(g.title || "").trim()).filter(Boolean);
      const generatedTitles = generated.map(g => String(g?.candidate?.title || "").trim()).filter(Boolean);
      const avoidTitles = Array.from(new Set([...existingTitles, ...generatedTitles])).slice(0, 25);

      const res = await callEdgeAction('generate-producer-game', { lang, topic, avoidTitles });
      if (res?.retry && !res?.candidate) {
        const reason = String(res?.reason || '');
        const waitMs = reason === 'rate_limit' ? (Number(res?.wait_ms) || 6000) : 200;
        if (reason === 'rate_limit') {
          const sec = Math.max(1, Math.round(waitMs / 1000));
          showStatus('gen-session-status', `Limit Groq — czekam ${sec}s… (${slot}/${count})`, 'info');
        } else if (slotAttempts % 5 === 0) {
          showStatus('gen-session-status', `Szukam lepszej gry… (${slot}/${count})`, 'info');
        }
        await new Promise(r => setTimeout(r, waitMs));
        backoffMs = reason === 'rate_limit'
          ? Math.min(5000, Math.floor(backoffMs * 1.6))
          : 400;
        continue;
      }
      const candidate = res?.candidate;
      if (!candidate) throw new Error('Brak danych gry z serwera');
      const item = {
        id: makeLocalId(),
        approved: false,
        generating: false,
        candidate,
        matches: Array.isArray(res?.matches) ? res.matches : [],
      };
      generated.unshift(item);
      produced++;
      slotAttempts = 0;
      slotStartedAt = Date.now();
      renderGeneratedList();
      setProgress(produced, count);
      backoffMs = 400;
    } catch (e) {
      const msg = e?.message || String(e);
      showStatus('gen-session-status', `⚠️ Błąd generowania (retry): ${msg}`, 'err');
      await new Promise(r => setTimeout(r, backoffMs));
      backoffMs = Math.min(5000, Math.floor(backoffMs * 1.6));
    }
  }

  if (cancelGenerate) {
    showStatus('gen-session-status', `Przerwano: ${produced}/${count}.`, 'err');
  } else {
    showStatus('gen-session-status', 'Zakończono generowanie.', 'ok');
  }
  setBusy(false);
  if (resetBtn) {
    resetBtn.style.display = 'none';
    resetBtn.onclick = null;
  }
}

async function deleteGame(id) {
  const ok = await confirmModal({
    title: "Usuń grę",
    text: "Czy na pewno usunąć tę grę?",
    okText: "Usuń",
    cancelText: "Anuluj",
  });
  if (!ok) return;
  setBusy(true);
  try {
    await callEdgeAction('delete-game', { id });
    games = games.filter(g => g.id !== id);
    uniquenessCache.delete(id);
    weaknessCache.delete(id);
    selectedIds.delete(id);
    renderGameList();
  } catch (e) {
    showStatus('gen-session-status', `✗ Błąd usuwania: ${e.message}`, 'err');
  } finally {
    setBusy(false);
  }
}

function updateBulkBar() {
  const bar = $('gen-bulk-bar');
  const countEl = $('gen-bulk-count');
  if (!bar || !countEl) return;
  const count = selectedIds.size;
  bar.style.display = 'flex';
  bar.classList.add('visible');
  countEl.textContent = `${count} zaznaczonych`;

  const delBtn = $('gen-delete-sel-btn');
  const clearBtn = $('gen-clear-sel-btn');
  if (delBtn) delBtn.disabled = count === 0;
  if (clearBtn) clearBtn.disabled = count === 0;
}

function setSelected(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateBulkBar();
}

function clearSelection() {
  selectedIds.clear();
  renderGameList();
}

function selectAll() {
  for (const g of games) selectedIds.add(g.id);
  renderGameList();
}

function selectIssues() {
  selectedIds.clear();
  for (const g of games) {
    const r = weaknessCache.get(g.id) || analyzeWeakness(g);
    weaknessCache.set(g.id, r);
    const hasDup = Array.isArray(uniquenessCache.get(g.id)) && uniquenessCache.get(g.id).length > 0;
    if (r.level !== 'ok' || hasDup) selectedIds.add(g.id);
  }
  renderGameList();
}

async function deleteSelected() {
  const ids = Array.from(selectedIds);
  if (!ids.length) {
    await alertModal({ title: "Usuwanie", text: "Brak zaznaczonych gier." });
    return;
  }
  const confirmed = await confirmModal({
    title: "Usuń zaznaczone",
    text: `Usunąć zaznaczone gry (${ids.length})?`,
    okText: "Usuń",
    cancelText: "Anuluj",
  });
  if (!confirmed) return;
  setBusy(true);
  showStatus('gen-session-status', `Usuwam ${ids.length} gier...`, 'info');
  let deletedCount = 0;
  try {
    for (const id of ids) {
      await callEdgeAction('delete-game', { id });
      deletedCount++;
      games = games.filter(g => g.id !== id);
      uniquenessCache.delete(id);
      weaknessCache.delete(id);
      selectedIds.delete(id);
      updateBulkBar();
    }
    renderGameList();
    showStatus('gen-session-status', `Usunięto ${deletedCount}/${ids.length}.`, 'ok');
  } catch (e) {
    showStatus('gen-session-status', `✗ Błąd po ${deletedCount}/${ids.length}: ${e.message}`, 'err');
  } finally {
    setBusy(false);
  }
}

function analyzeWeakness(game) {
  const reasons = [];
  const title = String(game?.title || "").trim();
  const desc = String(game?.description || "").trim();
  const qs = game?.payload?.questions || [];

  if (!Array.isArray(qs) || qs.length === 0) {
    return { level: "weak", score: 0, reasons: ["Brak pytań w payload."], summary: "Jakość: 0/100 (brak pytań)" };
  }

  let score = 100;

  const descLen = desc.length;
  if (descLen === 0) {
    score -= 25;
    reasons.push("Opis pusty (−25).");
  } else if (descLen < 30) {
    score -= 18;
    reasons.push(`Opis bardzo krótki (${descLen} znaków) (−18).`);
  } else if (descLen < 60) {
    score -= 10;
    reasons.push(`Opis krótki (${descLen} znaków) (−10).`);
  }

  const qCount = qs.length;
  if (qCount < 10) {
    const penalty = Math.min(60, (10 - qCount) * 8);
    score -= penalty;
    reasons.push(`Za mało pytań (${qCount}/10) (−${penalty}).`);
  } else if (qCount > 12) {
    const penalty = Math.min(10, (qCount - 12) * 2);
    score -= penalty;
    reasons.push(`Bardzo dużo pytań (${qCount}) (−${penalty}).`);
  }

  let answersTotal = 0;
  let qWithLt4 = 0;
  let qWithLt3 = 0;
  let badPoints = 0;
  let shortQuestions = 0;
  let dupQuestions = 0;
  let zeroHeavyPoints = 0;
  let topHeavyPoints = 0;
  let badSumPoints = 0;
  let divBy5Points = 0;

  const qSeen = new Set();

  for (const q of qs) {
    const qText = String(q?.text || "").trim();
    if (qText.length < 10) shortQuestions++;

    const qKey = qText.toLowerCase();
    if (qKey && qSeen.has(qKey)) dupQuestions++;
    if (qKey) qSeen.add(qKey);

    const ans = Array.isArray(q?.answers) ? q.answers : [];
    answersTotal += ans.length;
    if (ans.length < 4) qWithLt4++;
    if (ans.length < 3) qWithLt3++;

    let sum = 0;
    let maxPts = 0;
    let zeros = 0;
    let allDiv5 = true;
    for (const a of ans) {
      const ptsRaw = a?.fixed_points;
      const pts = typeof ptsRaw === "number" ? ptsRaw : Number(ptsRaw);
      if (!Number.isFinite(pts)) badPoints++;
      else {
        sum += pts;
        if (pts === 0) zeros++;
        if (pts > maxPts) maxPts = pts;
        if (pts % 5 !== 0) allDiv5 = false;
      }
    }
    if (sum > 100 || sum < 80) {
      badSumPoints++;
    }
    if (sum > 100) {
      score -= 2;
      reasons.push(`Suma punktów > 100 w pytaniu: "${qText}" (−2).`);
    }
    if (zeros >= 2) zeroHeavyPoints++;
    if (maxPts >= 85) topHeavyPoints++;
    if (ans.length === 4 && allDiv5) divBy5Points++;
  }

  const avgAnswers = qCount ? answersTotal / qCount : 0;
  if (qWithLt4 > 0) {
    const penalty = Math.min(30, qWithLt4 * 4);
    score -= penalty;
    reasons.push(`Pytania z <4 odpowiedzi: ${qWithLt4} (−${penalty}).`);
  }
  if (qWithLt3 > 0) {
    const penalty = Math.min(30, qWithLt3 * 6);
    score -= penalty;
    reasons.push(`Pytania z <3 odpowiedzi: ${qWithLt3} (−${penalty}).`);
  }
  if (avgAnswers > 0 && avgAnswers < 4) {
    const penalty = Math.min(20, Math.ceil((4 - avgAnswers) * 10));
    score -= penalty;
    reasons.push(`Średnio mało odpowiedzi na pytanie (${avgAnswers.toFixed(1)}) (−${penalty}).`);
  }

  if (shortQuestions > 0) {
    const penalty = Math.min(12, shortQuestions * 2);
    score -= penalty;
    reasons.push(`Krótkie pytania: ${shortQuestions} (−${penalty}).`);
  }
  if (dupQuestions > 0) {
    const penalty = Math.min(20, dupQuestions * 5);
    score -= penalty;
    reasons.push(`Powtórzone pytania: ${dupQuestions} (−${penalty}).`);
  }
  if (badPoints > 0) {
    const penalty = Math.min(15, badPoints);
    score -= penalty;
    reasons.push(`Brakujące/nienumeryczne punkty: ${badPoints} (−${penalty}).`);
  }
  if (badSumPoints > 0) {
    const penalty = Math.min(18, badSumPoints * 3);
    score -= penalty;
    reasons.push(`Nietypowa suma punktów (poza 80–100): ${badSumPoints} (−${penalty}).`);
  }
  if (zeroHeavyPoints > 0) {
    const penalty = Math.min(30, zeroHeavyPoints * 6);
    score -= penalty;
    reasons.push(`Pytania z 2+ zerami w punktach: ${zeroHeavyPoints} (−${penalty}).`);
  }
  if (topHeavyPoints > 0) {
    const penalty = Math.min(20, topHeavyPoints * 3);
    score -= penalty;
    reasons.push(`Pytania z bardzo wysokim top wynikiem (≥85): ${topHeavyPoints} (−${penalty}).`);
  }
  if (divBy5Points > 0) {
    const penalty = Math.min(12, divBy5Points * 2);
    score -= penalty;
    reasons.push(`Pytania z punktami wyłącznie /5: ${divBy5Points} (−${penalty}).`);
  }

  if (title.length < 6) {
    score -= 5;
    reasons.push(`Krótki tytuł (${title.length} znaków) (−5).`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const level = score >= 80 ? "ok" : score >= 60 ? "mid" : "weak";
  const label = level === "ok" ? "OK" : level === "mid" ? "średnia" : "słaba";
  const summary = `Jakość: ${score}/100 (${label})`;
  return { level, score, reasons, summary };
}

function renderWeakInfo(container, report) {
  if (!container) return;
  if (!report) {
    container.textContent = "";
    return;
  }
  if (report.level === "ok") {
    container.textContent = report.summary;
    return;
  }
  const items = report.reasons.slice(0, 6).map(r => `<li>${r}</li>`).join("");
  const more = report.reasons.length > 6 ? `<li>… i ${report.reasons.length - 6} więcej</li>` : "";
  container.innerHTML = `<div>${report.summary}</div><ul style="margin:6px 0 0 16px">${items}${more}</ul>`;
}

async function scanForDuplicates() {
  setBusy(true);
  const lang = $('gen-manage-lang').value;
  showStatus('gen-session-status', 'Dobiłem embeddingi (synonimy/parafrazy) i skanuję unikalność...', 'info');
  try {
    await callEdgeAction('embed-missing', { lang, limit: 25 });
    for (const g of games) {
      if (uniquenessCache.has(g.id)) continue;
      const res = await callEdgeAction('check-uniqueness', { id: g.id });
      uniquenessCache.set(g.id, Array.isArray(res?.matches) ? res.matches : []);
      renderGameList();
    }
    showStatus('gen-session-status', `Skanowanie zakończone.`, 'ok');
  } catch (e) {
    showStatus('gen-session-status', `✗ Błąd skanowania: ${e.message}`, 'err');
  } finally {
    setBusy(false);
  }
}

async function checkUniqueness(id) {
  setBusy(true);
  showStatus('gen-session-status', 'Sprawdzam podobne gry...', 'info');
  try {
    const res = await callEdgeAction('check-uniqueness', { id });
    uniquenessCache.set(id, Array.isArray(res?.matches) ? res.matches : []);
    renderGameList();
    showStatus('gen-session-status', 'Gotowe.', 'ok');
  } catch (e) {
    showStatus('gen-session-status', `✗ Błąd: ${e.message}`, 'err');
  } finally {
    setBusy(false);
  }
}

// Rendering
function renderGameList() {
  const list = $('gen-game-list');
  list.innerHTML = '';
  if (!games.length) {
    list.innerHTML = '<div class="text-center text-muted p-3">Brak gier.</div>';
    updateBulkBar();
    return;
  }

  games.forEach(game => {
    const item = document.createElement('div');
    const matches = uniquenessCache.get(game.id);
    const hasDup = Array.isArray(matches) && matches.length > 0;
    const top = Array.isArray(matches) && matches.length ? matches[0] : null;
    const topLine = top
      ? `Podobne: ${Math.round((top.similarity || 0) * 100)}% · ${top.title} · ${top.origin}`
      : (matches ? 'Podobne: brak (>=45%)' : 'Podobne: nie sprawdzono');

    const weak = weaknessCache.get(game.id) || analyzeWeakness(game);
    weaknessCache.set(game.id, weak);
    const qualityLine = weak?.summary || '';
    const isWeak = weak.level !== 'ok';
    item.className = `game-item${hasDup ? ' issue-dup' : ''}${isWeak ? ' issue-weak' : ''}`;
    const checked = selectedIds.has(game.id) ? 'checked' : '';
    item.innerHTML = `
      <div class="game-row">
        <input type="checkbox" class="game-cb" data-id="${game.id}" ${checked} />
        <span class="game-title">${game.title}</span>
        ${hasDup ? `<span class="game-badge badge-dup">DUP</span>` : ``}
        ${isWeak ? `<span class="game-badge badge-weak">SŁABE</span>` : ``}
        <span class="game-title" style="color:var(--muted);font-size:12px;flex:1;margin-left:10px">${topLine} · ${qualityLine}</span>
        <button class="btn sm" data-action="uniq" data-id="${game.id}">Unikalność</button>
        <button class="btn sm danger" data-id="${game.id}">Usuń</button>
        <span class="game-chevron">▶</span>
      </div>
      <div class="game-preview">
        <div class="preview-desc">${game.description || ''}</div>
        <div class="preview-weak" style="color:var(--muted);font-size:12px;margin:6px 0 10px"></div>
        <div class="preview-questions"></div>
      </div>
    `;
    
    const cb = item.querySelector('.game-cb');
    if (cb) {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelected(cb.dataset.id, cb.checked);
      });
    }

    item.querySelector('.game-row').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        if (action === 'uniq') {
          checkUniqueness(id);
          return;
        }
        deleteGame(id);
        return;
      }
      const preview = item.querySelector('.game-preview');
      const chevron = item.querySelector('.game-chevron');
      const isOpen = preview.classList.toggle('open');
      chevron.classList.toggle('open', isOpen);
      if (isOpen) {
        renderWeakInfo(preview.querySelector('.preview-weak'), weaknessCache.get(game.id));
        renderPreviewQuestions(preview.querySelector('.preview-questions'), game.payload);
      }
    });
    
    list.appendChild(item);
  });
  updateBulkBar();
}

function renderGeneratedList() {
  const list = $('gen-results-list');
  const counter = $('gen-results-counter');
  const pushBtn = $('gen-push-approved-btn');
  if (!list) return;

  const approvedCount = generated.filter(g => g.approved).length;
  if (counter) counter.textContent = `${approvedCount}/${generated.length} zatwierdzonych`;
  if (pushBtn) pushBtn.disabled = approvedCount === 0;

  list.innerHTML = '';
  if (!generated.length) {
    list.innerHTML = '<div style="opacity:.6;font-size:12px;padding:10px 0">Brak wygenerowanych gier.</div>';
    return;
  }

  for (const g of generated) {
    const cand = g.candidate || {};
    const w = analyzeWeakness({ title: cand.title, description: cand.description, payload: cand.payload });
    const top = Array.isArray(g.matches) && g.matches.length ? g.matches[0] : null;
    const dupLine = top ? `Podobne: ${Math.round((top.similarity || 0) * 100)}% · ${top.title} · ${top.origin}` : 'Podobne: brak';

    const item = document.createElement('div');
    item.className = `game-item ${g.approved ? 'approved' : ''} ${g.generating ? 'generating' : ''}`;
    item.innerHTML = `
      <div class="game-row">
        <input type="checkbox" class="game-cb" data-id="${g.id}" ${g.approved ? 'checked' : ''} />
        <span class="game-title">${cand.title || '—'}</span>
        <span class="game-title" style="color:var(--muted);font-size:12px;flex:1;margin-left:10px">${dupLine} · ${w.summary}</span>
        <button class="btn sm danger" data-action="reject" data-id="${g.id}" ${g.generating ? 'disabled' : ''}>Odrzuć</button>
        <span class="game-chevron">▶</span>
      </div>
      <div class="game-preview">
        <div class="preview-desc">${cand.description || ''}</div>
        <div class="preview-weak" style="color:var(--muted);font-size:12px;margin:6px 0 10px"></div>
        <div class="preview-questions"></div>
      </div>
    `;

    const cb = item.querySelector('.game-cb');
    if (cb) {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = cb.dataset.id;
        const it = generated.find(x => x.id === id);
        if (it) it.approved = !!cb.checked;
        renderGeneratedList();
      });
    }

    item.querySelector('.game-row').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        if (action === 'reject') {
          rejectGenerated(id);
        }
        return;
      }
      const preview = item.querySelector('.game-preview');
      const chevron = item.querySelector('.game-chevron');
      const isOpen = preview.classList.toggle('open');
      chevron.classList.toggle('open', isOpen);
      if (isOpen) {
        renderWeakInfo(preview.querySelector('.preview-weak'), w);
        renderPreviewQuestions(preview.querySelector('.preview-questions'), cand.payload);
      }
    });

    list.appendChild(item);
  }
}

async function rejectGenerated(id) {
  const it = generated.find(x => x.id === id);
  if (!it || it.generating) return;

  const ok = await confirmModal({
    title: "Odrzuć i wygeneruj ponownie",
    text: "Odrzucić tę grę i wygenerować nową w jej miejsce?",
    okText: "Odrzuć",
    cancelText: "Anuluj",
  });
  if (!ok) return;

  it.generating = true;
  it.approved = false;
  renderGeneratedList();

  const lang = lastGenerateParams.lang || $('gen-manage-lang')?.value || 'pl';
  const topic = lastGenerateParams.topic || $('gen-topic')?.value?.trim?.() || '';

  const existingTitles = games.map(g => String(g.title || "").trim()).filter(Boolean);
  const generatedTitles = generated
    .filter(g => g.id !== id)
    .map(g => String(g?.candidate?.title || "").trim())
    .filter(Boolean);
  const avoidTitles = Array.from(new Set([...existingTitles, ...generatedTitles])).slice(0, 25);

  try {
    showStatus('gen-session-status', 'Regeneruję odrzuconą grę...', 'info');
    const maxTries = 3;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        showStatus('gen-session-status', `Regeneruję odrzuconą grę (próba ${attempt}/${maxTries})...`, 'info');
        const res = await callEdgeAction('generate-producer-game', { lang, topic, avoidTitles });
        const candidate = res?.candidate;
        if (!candidate) throw new Error('Brak danych gry z serwera');
        it.candidate = candidate;
        it.matches = Array.isArray(res?.matches) ? res.matches : [];
        it.generating = false;
        renderGeneratedList();
        showStatus('gen-session-status', 'Gotowe.', 'ok');
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Regenerowanie nieudane.');
  } catch (e) {
    it.generating = false;
    renderGeneratedList();
    showStatus('gen-session-status', `✗ Regenerowanie: ${e.message}`, 'err');
  }
}

async function publishApproved() {
  const items = generated.filter(g => g.approved);
  if (!items.length) {
    await alertModal({ title: "Publikacja", text: "Brak zatwierdzonych gier." });
    return;
  }
  const ok = await confirmModal({
    title: "Publikacja",
    text: `Opublikować zatwierdzone gry (${items.length})?`,
    okText: "Opublikuj",
    cancelText: "Anuluj",
  });
  if (!ok) return;

  setBusy(true);
  showStatus('gen-session-status', `Publikuję ${items.length} gier...`, 'info');
  let done = 0;
  try {
    for (const it of items) {
      await callEdgeAction('publish-producer-game', { lang: it.candidate.lang, payload: it.candidate.payload, title: it.candidate.title, description: it.candidate.description });
      done++;
      generated = generated.filter(x => x.id !== it.id);
      renderGeneratedList();
    }
    showStatus('gen-session-status', `Opublikowano ${done}.`, 'ok');
    await loadGames();
  } catch (e) {
    showStatus('gen-session-status', `✗ Błąd po ${done}/${items.length}: ${e.message}`, 'err');
  } finally {
    setBusy(false);
  }
}

function approveAllGenerated() {
  for (const it of generated) it.approved = true;
  renderGeneratedList();
}

function renderPreviewQuestions(container, payload) {
  if (!payload || !payload.questions) return;
  container.innerHTML = payload.questions.map(q => `
    <div class="q-block">
      <div class="q-text">${q.text}</div>
      <div class="answers-grid">
        ${(q.answers || []).map(a => `<span class="ans-chip">${a.text} <span class="ans-pts">${a.fixed_points || ''}</span></span>`).join('')}
      </div>
    </div>
  `).join('');
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  $('gen-load-btn').addEventListener('click', loadGames);
  $('gen-enqueue-btn').addEventListener('click', generateGames);
  $('gen-scan-btn').addEventListener('click', scanForDuplicates);
  const selIssuesBtn = $('gen-select-issues-btn');
  if (selIssuesBtn) selIssuesBtn.addEventListener('click', (e) => { e.preventDefault(); selectIssues(); });
  const selAllBtn = $('gen-sel-all-btn');
  if (selAllBtn) selAllBtn.addEventListener('click', (e) => { e.preventDefault(); selectAll(); });
  const clearBtn = $('gen-clear-sel-btn');
  if (clearBtn) clearBtn.addEventListener('click', (e) => { e.preventDefault(); clearSelection(); });
  const delBtn = $('gen-delete-sel-btn');
  if (delBtn) delBtn.addEventListener('click', (e) => { e.preventDefault(); deleteSelected(); });

  const approveAllBtn = $('gen-approve-all-btn');
  if (approveAllBtn) approveAllBtn.addEventListener('click', (e) => { e.preventDefault(); approveAllGenerated(); });
  const pushApprovedBtn = $('gen-push-approved-btn');
  if (pushApprovedBtn) pushApprovedBtn.addEventListener('click', (e) => { e.preventDefault(); publishApproved(); });
  
  const lastLang = localStorage.getItem('gen_last_lang');
  if (lastLang) {
    $('gen-manage-lang').value = lastLang;
  }
  
  $('gen-manage-lang').addEventListener('change', (e) => {
    localStorage.setItem('gen_last_lang', e.target.value);
    loadGames();
  });
  
  loadGames();
});
