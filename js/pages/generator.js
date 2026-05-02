
import { sb as supabase } from "../core/supabase.js?v=v2026-05-02T19071";
import { alertModal, confirmModal } from "../core/modal.js?v=v2026-05-02T19071";

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
    show('gen-import-card');
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
  const cancelBtn = $('gen-cancel-btn');
  if (cancelBtn) {
    cancelBtn.style.display = '';
    cancelBtn.onclick = (e) => {
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
        warnings: Array.isArray(res?.warnings) ? res.warnings : [],
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
  const cancelBtn2 = $('gen-cancel-btn');
  if (cancelBtn2) { cancelBtn2.style.display = 'none'; cancelBtn2.onclick = null; }
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
  const items = report.reasons.slice(0, 6).map(r => `<li>${escHtml(r)}</li>`).join("");
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
        <button class="btn sm" data-action="edit" data-id="${game.id}">Edytuj</button>
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
        if (action === 'edit') {
          const g = games.find(x => x.id === id);
          if (g) openGameEditor(g);
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
  if (!it) return;
  const ok = await confirmModal({ title: "Odrzuć grę", text: "Usunąć tę grę z listy?", okText: "Odrzuć", cancelText: "Anuluj" });
  if (!ok) return;
  generated = generated.filter(x => x.id !== id);
  renderGeneratedList();
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

// Game Editor
let editorGameId = null;

function openGameEditor(game) {
  editorGameId = game.id;
  const overlay = $('gameEditorOverlay');
  $('ge-title').value = game.title || '';
  $('ge-description').value = game.description || '';
  $('ge-lang').value = game.lang || 'pl';
  renderEditorQuestions(game.payload?.questions || []);
  showStatus('ge-status', '', '');
  $('ge-title').addEventListener('input', updateTitleLen);
  $('ge-description').addEventListener('input', updateDescLen);
  overlay.style.display = 'flex';
}

function closeGameEditor() {
  $('gameEditorOverlay').style.display = 'none';
  editorGameId = null;
}

function renderEditorQuestions(questions) {
  const container = $('ge-questions');
  container.innerHTML = '';
  questions.forEach((q, qi) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'mail-card';
    qDiv.style.gap = '8px';
    qDiv.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:11px;font-weight:700;opacity:.5;min-width:20px">${qi + 1}.</span>
        <input class="inp ge-q-text" data-qi="${qi}" value="${escHtml(q.text)}" style="flex:1">
        <span class="ge-q-len" data-qi="${qi}" style="font-size:11px;opacity:.45;white-space:nowrap"></span>
      </div>
      <div class="ge-answers" data-qi="${qi}" style="display:grid;gap:6px">
        ${(q.answers || []).map((a, ai) => `
          <div style="display:flex;gap:6px;align-items:center">
            <span style="font-size:11px;opacity:.4;min-width:14px">${ai + 1}</span>
            <input class="inp ge-a-text" data-qi="${qi}" data-ai="${ai}" value="${escHtml(a.text)}" style="flex:1">
            <span class="ge-a-len" data-qi="${qi}" data-ai="${ai}" style="font-size:11px;opacity:.45;white-space:nowrap"></span>
            <input class="inp ge-a-pts" data-qi="${qi}" data-ai="${ai}" type="number" value="${a.fixed_points ?? ''}" style="width:60px" placeholder="pkt">
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;align-items:center;font-size:11px">
        <span class="ge-pts-sum" data-qi="${qi}"></span>
      </div>
    `;
    container.appendChild(qDiv);
  });
  // attach live validation
  container.querySelectorAll('.ge-q-text').forEach(el => {
    updateQLen(el);
    el.addEventListener('input', () => updateQLen(el));
  });
  container.querySelectorAll('.ge-a-text').forEach(el => {
    updateALen(el);
    el.addEventListener('input', () => updateALen(el));
  });
  container.querySelectorAll('.ge-a-pts').forEach(el => {
    updatePtsSum(el.dataset.qi);
    el.addEventListener('input', () => updatePtsSum(el.dataset.qi));
  });
  updateDescLen();
  updateTitleLen();
}

function updateQLen(el) {
  const len = el.value.trim().length;
  const span = document.querySelector(`.ge-q-len[data-qi="${el.dataset.qi}"]`);
  if (!span) return;
  span.textContent = `${len} zn.`;
  span.style.color = len < 10 ? 'var(--red, #f55)' : 'inherit';
}

function updateALen(el) {
  const len = el.value.trim().length;
  const span = document.querySelector(`.ge-a-len[data-qi="${el.dataset.qi}"][data-ai="${el.dataset.ai}"]`);
  if (!span) return;
  span.textContent = `${len}`;
  span.style.color = len === 0 ? 'var(--red, #f55)' : 'inherit';
}

function updatePtsSum(qi) {
  const pts = [...document.querySelectorAll(`.ge-a-pts[data-qi="${qi}"]`)]
    .map(el => Number(el.value) || 0);
  const sum = pts.reduce((a, b) => a + b, 0);
  const span = document.querySelector(`.ge-pts-sum[data-qi="${qi}"]`);
  if (!span) return;
  const ok = sum >= 80 && sum <= 100;
  span.textContent = `Suma pkt: ${sum}/100`;
  span.style.color = ok ? 'var(--green, #4c4)' : 'var(--red, #f55)';
  span.style.fontWeight = ok ? '' : '700';
}

function updateDescLen() {
  const el = $('ge-description');
  const hint = $('ge-desc-hint');
  if (!el || !hint) return;
  const len = el.value.trim().length;
  hint.textContent = `${len} zn.${len < 30 ? ' (min. 30)' : len < 60 ? ' (krótki)' : ''}`;
  hint.style.color = len < 30 ? 'var(--red, #f55)' : len < 60 ? 'var(--yellow, #fa0)' : 'inherit';
}

function updateTitleLen() {
  const el = $('ge-title');
  const hint = $('ge-title-hint');
  if (!el || !hint) return;
  const len = el.value.trim().length;
  hint.textContent = `${len} zn.${len < 6 ? ' (min. 6)' : ''}`;
  hint.style.color = len < 6 ? 'var(--red, #f55)' : 'inherit';
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function collectEditorData() {
  const title = $('ge-title').value.trim();
  const description = $('ge-description').value.trim();
  const lang = $('ge-lang').value;
  const qTexts = [...document.querySelectorAll('.ge-q-text')];
  const questions = qTexts.map((qEl) => {
    const qi = Number(qEl.dataset.qi);
    const aTexts = [...document.querySelectorAll(`.ge-a-text[data-qi="${qi}"]`)];
    const aPts = [...document.querySelectorAll(`.ge-a-pts[data-qi="${qi}"]`)];
    return {
      text: qEl.value.trim(),
      answers: aTexts.map((aEl, ai) => ({
        text: aEl.value.trim(),
        fixed_points: Number(aPts[ai]?.value) || 0,
      })),
    };
  });
  return { title, description, lang, payload: { questions } };
}

async function saveGameEditor() {
  const { title, description, lang, payload } = collectEditorData();
  showStatus('ge-status', 'Zapisuję…', 'info');
  try {
    const data = await callEdgeAction('update-producer-game', { id: editorGameId, title, description, lang, payload });
    const updated = data?.game;
    if (updated) {
      const idx = games.findIndex(g => g.id === editorGameId);
      if (idx !== -1) {
        games[idx] = { ...games[idx], ...updated };
        weaknessCache.delete(editorGameId);
        uniquenessCache.delete(editorGameId);
        renderGameList();
      }
    }
    showStatus('ge-status', '✓ Zapisano', 'ok');
    setTimeout(closeGameEditor, 800);
  } catch (e) {
    showStatus('ge-status', `✗ ${e.message}`, 'err');
  }
}


function importGamesFromData(raw) {
  let items;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch(e) {
    showStatus('gen-import-status', '✗ Nieprawidłowy JSON', 'err');
    return 0;
  }
  let added = 0;
  for (const item of items) {
    if (!item?.title || !item?.payload?.questions) continue;
    generated.unshift({
      id: makeLocalId(),
      approved: false,
      generating: false,
      candidate: {
        title: item.title,
        description: item.description || '',
        lang: item.lang || $('gen-manage-lang')?.value || 'pl',
        payload: item.payload,
      },
      matches: [],
      warnings: [],
    });
    added++;
  }
  return added;
}

async function handleImport() {
  const paste = $('gen-import-paste')?.value?.trim();
  let added = 0;
  if (paste) {
    added += importGamesFromData(paste);
    if ($('gen-import-paste')) $('gen-import-paste').value = '';
  }
  const fileInput = $('gen-import-file');
  if (fileInput?.files?.length) {
    for (const file of fileInput.files) {
      const text = await file.text();
      added += importGamesFromData(text);
    }
    fileInput.value = '';
  }
  if (added === 0) {
    showStatus('gen-import-status', '✗ Brak poprawnych gier', 'err');
    return;
  }
  showStatus('gen-import-status', `✓ Zaimportowano ${added} gier`, 'ok');
  show('gen-results-section');
  renderGeneratedList();
}


document.addEventListener('DOMContentLoaded', () => {
  $('gen-load-btn').addEventListener('click', loadGames);
  $('gen-enqueue-btn').addEventListener('click', generateGames);
  $('gen-scan-btn').addEventListener('click', scanForDuplicates);

  const importBtn = $('gen-import-btn');
  if (importBtn) importBtn.addEventListener('click', handleImport);
  const importFile = $('gen-import-file');
  if (importFile) importFile.addEventListener('change', () => { if (importFile.files?.length) handleImport(); });

  const exampleBtn = $('gen-import-example-btn');
  if (exampleBtn) exampleBtn.addEventListener('click', () => {
    const example = [{
      title: "Przykładowa gra",
      description: "Opis gry widoczny w marketplace. Powinien mieć minimum 60 znaków i zachęcać do gry.",
      lang: "pl",
      payload: {
        questions: Array.from({ length: 10 }, (_, i) => ({
          text: `Pytanie ${i + 1}: Co najczęściej kojarzy się z...?`,
          answers: [
            { text: "Odpowiedź 1", fixed_points: 42 },
            { text: "Odpowiedź 2", fixed_points: 26 },
            { text: "Odpowiedź 3", fixed_points: 18 },
            { text: "Odpowiedź 4", fixed_points: 13 },
          ]
        }))
      }
    }];
    const json = JSON.stringify(example, null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    a.download = 'przykladowa-gra.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  const editorClose = $('btnGameEditorClose');
  if (editorClose) editorClose.addEventListener('click', closeGameEditor);
  const editorCancel = $('btnGameEditorCancel');
  if (editorCancel) editorCancel.addEventListener('click', closeGameEditor);
  const editorSave = $('btnGameEditorSave');
  if (editorSave) editorSave.addEventListener('click', saveGameEditor);
  const editorOverlay = $('gameEditorOverlay');
  if (editorOverlay) editorOverlay.addEventListener('click', (e) => { if (e.target === editorOverlay) closeGameEditor(); });
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

  window.resetGeneratorSession = loadGames;
});
