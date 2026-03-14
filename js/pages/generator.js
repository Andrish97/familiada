
import { sb as supabase } from "/js/core/supabase.js?v=20260314-1";

let games = [];
const uniquenessCache = new Map();
const weaknessCache = new Map();

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
  
  setBusy(true);
  showStatus('gen-session-status', `Generowanie ${count} gier...`, 'info');
  
  for (let i = 0; i < count; i++) {
    try {
      const res = await callEdgeAction('generate-producer-game', { lang, topic, avoidTitles: games.map(g => g.title) });
      const newGame = res?.game;
      if (!newGame) throw new Error('Brak danych gry z serwera');
      games.unshift(newGame);
      uniquenessCache.set(newGame.id, Array.isArray(res?.matches) ? res.matches : []);
      renderGameList();
    } catch (e) {
      showStatus('gen-session-status', `✗ Błąd generowania: ${e.message}`, 'err');
      break;
    }
  }
  
  showStatus('gen-session-status', 'Zakończono generowanie.', 'ok');
  setBusy(false);
}

async function deleteGame(id) {
  if (!confirm('Czy na pewno usunąć tę grę?')) return;
  setBusy(true);
  try {
    await callEdgeAction('delete-game', { id });
    games = games.filter(g => g.id !== id);
    uniquenessCache.delete(id);
    weaknessCache.delete(id);
    renderGameList();
  } catch (e) {
    showStatus('gen-session-status', `✗ Błąd usuwania: ${e.message}`, 'err');
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
    return { level: "weak", reasons: ["Brak pytań w payload."], summary: "Słabe: brak pytań" };
  }

  if (title.length < 6) reasons.push(`Krótki tytuł (${title.length} znaków).`);
  if (desc.length < 25) reasons.push(`Krótki opis (${desc.length} znaków).`);

  if (qs.length < 10) {
    reasons.push(`Za mało pytań (${qs.length}/10).`);
  }

  let badAnswers = 0;
  let badPoints = 0;
  let shortQuestions = 0;
  let dupQuestions = 0;

  const qSeen = new Set();

  for (const q of qs) {
    const qText = String(q?.text || "").trim();
    if (qText.length < 8) shortQuestions++;

    const qKey = qText.toLowerCase();
    if (qKey && qSeen.has(qKey)) dupQuestions++;
    if (qKey) qSeen.add(qKey);

    const ans = Array.isArray(q?.answers) ? q.answers : [];
    if (ans.length < 3) badAnswers++;

    const ansTexts = new Set();
    let sum = 0;
    for (const a of ans) {
      const aText = String(a?.text || "").trim();
      const aKey = aText.toLowerCase();
      if (aKey) {
        if (ansTexts.has(aKey)) reasons.push(`Duplikat odpowiedzi w pytaniu: "${qText}".`);
        ansTexts.add(aKey);
      }

      const ptsRaw = a?.fixed_points;
      const pts = typeof ptsRaw === "number" ? ptsRaw : Number(ptsRaw);
      if (!Number.isFinite(pts)) badPoints++;
      else sum += pts;
    }
    if (sum > 100) reasons.push(`Suma punktów > 100 w pytaniu: "${qText}" (${sum}).`);
  }

  if (shortQuestions > 0) reasons.push(`Krótkie pytania: ${shortQuestions}.`);
  if (dupQuestions > 0) reasons.push(`Powtórzone pytania: ${dupQuestions}.`);
  if (badAnswers > 0) reasons.push(`Pytania z <3 odpowiedzi: ${badAnswers}.`);
  if (badPoints > 0) reasons.push(`Odpowiedzi z brakującymi/nienumerycznymi punktami: ${badPoints}.`);

  const level = reasons.length ? "weak" : "ok";
  const summary = level === "ok" ? "Jakość: OK" : `Słabe: ${reasons.length} sygnałów`;
  return { level, reasons, summary };
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
    return;
  }

  games.forEach(game => {
    const item = document.createElement('div');
    item.className = 'game-item';
    const matches = uniquenessCache.get(game.id);
    const top = Array.isArray(matches) && matches.length ? matches[0] : null;
    const topLine = top
      ? `Podobne: ${Math.round((top.similarity || 0) * 100)}% · ${top.title} · ${top.origin}`
      : (matches ? 'Podobne: brak (>=45%)' : 'Podobne: nie sprawdzono');

    const weak = weaknessCache.get(game.id) || analyzeWeakness(game);
    weaknessCache.set(game.id, weak);
    const qualityLine = weak?.summary || '';
    item.innerHTML = `
      <div class="game-row">
        <span class="game-title">${game.title}</span>
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
