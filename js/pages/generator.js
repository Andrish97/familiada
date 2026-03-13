/**
 * Generator Page Logic
 * v: 20260313-3
 */

import { t } from "/translation/translation.js?v=20260313-3";
import { sb as supabase } from "/js/core/supabase.js?v=20260313-3";

let loadedGames = [];
let genGames = [];
let selectedGames = new Set();
let pendingDelete = new Set();
let pendingAdd = [];
let generating = false;

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

function hideStatus(id) {
  const el = $(id);
  if(el) el.className = 'status-bar';
}

function setListBusy(busy) {
  $('gen-game-list').style.opacity = busy ? '0.5' : '1';
  $('gen-game-list').style.pointerEvents = busy ? 'none' : 'auto';
}

// Session Management
window.loadGeneratorList = async function() {
  const lang = $('gen-manage-lang').value;
  setListBusy(true);
  showStatus('gen-session-status', 'Wczytuję…', 'info');
  $('gen-scan-btn').disabled = true;
  
  try {
    const res = await callEdgeAction({ action: 'list-games', lang });
    loadedGames = res.games || [];
    selectedGames.clear();
    pendingDelete.clear();
    pendingAdd = [];
    
    lockGeneratorSession();
    
    if (loadedGames.length) {
      showStatus('gen-session-status', `Sesja aktywna · ${loadedGames.length} gier · ${lang.toUpperCase()}`, 'ok');
    } else {
      showStatus('gen-session-status', `Sesja aktywna · brak gier (możesz generować nowe) · ${lang.toUpperCase()}`, 'ok');
    }
    
    renderManageList();
    $('gen-scan-btn').disabled = loadedGames.length === 0;
    checkQueueStatus();
  } catch (e) {
    showStatus('gen-session-status', '✗ ' + e.message, 'err');
  } finally {
    setListBusy(false);
  }
};

function lockGeneratorSession() {
  $('gen-manage-lang').disabled = true;
  $('gen-load-btn').style.display = 'none';
  show('gen-reset-btn');
  show('gen-manage-card');
  show('gen-input-card');
  show('gen-enqueue-btn');
}

window.resetGeneratorSession = function() {
  if (pendingAdd.length || pendingDelete.size) {
    if (!confirm("Masz niezapisane zmiany. Czy na pewno chcesz wyjść?")) return;
  }
  $('gen-manage-lang').disabled = false;
  show('gen-load-btn');
  hide('gen-reset-btn');
  hide('gen-manage-card');
  hide('gen-input-card');
  hide('gen-enqueue-btn');
  hide('gen-results-section');
  hide('gen-pending-bar');
  hideStatus('gen-session-status');
  loadedGames = [];
  pendingAdd = [];
  pendingDelete.clear();
  selectedGames.clear();
  genGames = [];
  renderManageList();
  renderGenList();
};

// Queue & Generation
window.enqueueGeneration = async function() {
  const lang = $('gen-manage-lang').value;
  const count = Math.max(1, parseInt($('gen-count').value) || 5);
  const topic = $('gen-topic').value.trim();
  const existingTitles = loadedGames.filter(g => g.lang === lang).map(g => g.title).filter(Boolean);

  $('gen-enqueue-btn').disabled = true;
  showStatus('gen-session-status', 'Dodaję do kolejki...', 'info');

  try {
    const res = await callEdgeAction({
      action: 'enqueue',
      lang,
      total: count,
      topic,
      alreadyUsed: existingTitles
    });

    showStatus('gen-session-status', '✓ Dodano do kolejki. Śledź postęp poniżej.', 'ok');
    $('gen-topic').value = '';
    
    show('gen-results-section');
    genGames = Array.from({length: count}, (_, i) => ({game: null, status: 'pending', generating: true, idx: i, mainJobId: res.jobId}));
    renderGenList();
    
    checkQueueStatus();
  } catch (e) {
    showStatus('gen-session-status', '✗ ' + e.message, 'err');
  } finally {
    $('gen-enqueue-btn').disabled = false;
  }
};

async function checkQueueStatus() {
  if (window.activeTab !== 'generator') {
    console.log("[Generator] Tab not active, stopping poll.");
    return;
  }

  try {
    console.log("[Generator] Polling queue status...");
    const { data: jobs, error } = await supabase()
      .from('game_gen_queue')
      .select('*')
      .in('status', ['pending', 'processing', 'completed'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;
    if (!jobs?.length) {
      console.log("[Generator] No jobs found in queue.");
      return;
    }

    const mainJobId = genGames[0]?.mainJobId;
    const mainJob = jobs.find(j => j.id === mainJobId) || jobs[0];
    
    console.log(`[Generator] Main job status: ${mainJob.status}, progress: ${mainJob.processed_games}/${mainJob.total_games}`);

    const isMainActive = mainJob.status === 'pending' || mainJob.status === 'processing';
    const anyRegenActive = genGames.some(g => g.jobId && jobs.find(j => j.id === g.jobId && (j.status === 'pending' || j.status === 'processing')));

    // Update global progress bar
    const pct = mainJob.total_games > 0 ? Math.round((mainJob.processed_games / mainJob.total_games) * 100) : 0;
    const fill = $('gen-progress-fill');
    if (fill) fill.style.width = `${pct}%`;
    const counter = $('gen-results-counter');
    if (counter) counter.textContent = `${mainJob.processed_games} / ${mainJob.total_games} gier`;

    syncGenSlotsFromJobs(jobs);

    if (isMainActive || anyRegenActive) {
      setTimeout(checkQueueStatus, 2000);
    } else {
      console.log("[Generator] All jobs finished.");
    }
  } catch (e) { 
    console.error("[Generator] Queue check failed:", e); 
    setTimeout(checkQueueStatus, 5000); // Retry later
  }
}

function syncGenSlotsFromJobs(jobs) {
  if (!genGames.length) return;

  genGames.forEach((slot, idx) => {
    // 1. If it's a single regeneration job
    if (slot.jobId) {
      const job = jobs.find(j => j.id === slot.jobId);
      if (job && job.status === 'completed' && job.results?.[0]) {
        slot.game = job.results[0];
        slot.generating = false;
        slot.jobId = null;
        slot.status = 'pending';
      } else if (job) {
        slot.generating = job.status === 'processing' || job.status === 'pending';
      }
    } 
    // 2. If it belongs to the main batch job
    else if (!slot.game) {
      const mainJobId = slot.mainJobId;
      const job = jobs.find(j => j.id === mainJobId);
      if (job) {
        if (job.results?.[idx]) {
          slot.game = job.results[idx];
          slot.generating = false;
          slot.status = 'pending';
        } else {
          // It' "generating" only if it's the NEXT one to be processed
          slot.generating = job.status === 'processing' && idx === (job.results?.length || 0);
        }
      }
    }
  });

  renderGenList();
}

// Rendering
function renderManageList() {
  const list = $('gen-game-list');
  list.innerHTML = '';
  
  const all = [...loadedGames, ...pendingAdd.map(p => ({ ...JSON.parse(p.content), isPendingAdd: true, slug: p.slug }))];
  
  if (!all.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px 0;text-align:center">Brak gier.</div>';
    return;
  }

  all.forEach((g, idx) => {
    if (pendingDelete.has(g.slug)) return;
    
    const item = document.createElement('div');
    item.className = 'game-item';
    const title = g.meta?.title || g.title || g.slug;
    
    item.innerHTML = `
      <div class="game-row">
        <input type="checkbox" class="game-cb" ${selectedGames.has(g.slug) ? 'checked' : ''}>
        <span class="game-num">#${idx + 1}</span>
        <span class="game-title">${title}</span>
        ${g.isPendingAdd ? '<span class="game-badge badge-new">nowa</span>' : ''}
        <span class="game-chevron">▶</span>
      </div>
      <div class="game-preview" id="prev-${g.slug}">
        <div class="preview-desc">${g.meta?.description || g.description || ''}</div>
        <div class="preview-questions"></div>
      </div>
    `;
    
    const row = item.querySelector('.game-row');
    row.onclick = (e) => {
      if (e.target.classList.contains('game-cb')) {
        if (e.target.checked) selectedGames.add(g.slug);
        else selectedGames.delete(g.slug);
        updateBulkBar();
        return;
      }
      const prev = item.querySelector('.game-preview');
      const chev = item.querySelector('.game-chevron');
      const isOpen = prev.classList.toggle('open');
      chev.classList.toggle('open', isOpen);
      if (isOpen && !prev.querySelector('.preview-questions').innerHTML) {
        renderPreviewQuestions(prev.querySelector('.preview-questions'), g.payload || g);
      }
    };
    
    list.appendChild(item);
  });
}

function renderPreviewQuestions(container, data) {
  if (!data?.questions) return;
  container.innerHTML = data.questions.map(q => `
    <div class="q-block">
      <div class="q-text">${q.text}</div>
      <div class="answers-grid">
        ${(q.answers || []).map(a => `<span class="ans-chip">${a.text} <span class="ans-pts">${a.fixed_points}</span></span>`).join('')}
      </div>
    </div>
  `).join('');
}

function renderGenList() {
  const list = $('gen-results-list');
  list.innerHTML = '';
  
  genGames.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = `game-item ${item.status} ${item.generating ? 'generating' : ''}`;
    
    const title = item.game?.meta?.title || (item.generating ? 'Generowanie...' : 'Oczekiwanie...');
    
    el.innerHTML = `
      <div class="game-row">
        <span class="game-num">#${i + 1}</span>
        <span class="game-title">${title}</span>
        <div class="gen-actions">
          ${item.game ? `
            <button class="btn sm" onclick="window.approveGenGame(${i})">Zatwierdź</button>
            <button class="btn sm danger" onclick="window.regenerateGenGame(${i})">Odrzuć</button>
          ` : ''}
        </div>
        <span class="game-chevron">▶</span>
      </div>
      <div class="game-preview" id="gp-${i}">
        <div class="preview-desc">${item.game?.meta?.description || ''}</div>
        <div class="preview-questions"></div>
      </div>
    `;
    
    const row = el.querySelector('.game-row');
    row.onclick = (e) => {
      if (e.target.closest('.gen-actions')) return;
      const prev = el.querySelector('.game-preview');
      const chev = el.querySelector('.game-chevron');
      const isOpen = prev.classList.toggle('open');
      chev.classList.toggle('open', isOpen);
      if (isOpen && item.game) renderPreviewQuestions(prev.querySelector('.preview-questions'), item.game);
    };
    
    list.appendChild(el);
  });
  
  const approvedCount = genGames.filter(g => g.status === 'approved').length;
  $('gen-results-counter').textContent = `${approvedCount} / ${genGames.length} zatwierdzonych`;
  $('gen-progress-fill').style.width = `${(approvedCount / genGames.length) * 100}%`;
  $('gen-push-approved-btn').disabled = approvedCount === 0;
}

window.scanGames = async function() {
  const lang = $('gen-manage-lang').value;
  setListBusy(true);
  showStatus('gen-manage-status', 'AI skanuje gry…', 'info');
  try {
    const res = await callEdgeAction({ action: 'scan', lang, mode: 'duplicates', games: loadedGames });
    if (res.issues) {
      res.issues.forEach(iss => {
        iss.slugs.forEach(slug => {
          const game = loadedGames.find(g => g.slug === slug);
          if (game) {
            game.issueType = iss.type === 'duplicate' ? 'dup' : 'weak';
            game.issueReason = iss.reason;
          }
        });
      });
      renderManageList();
      showStatus('gen-manage-status', `🔍 Skonczono skanowanie. Znaleziono problemy.`, 'ok');
    }
  } catch (e) {
    showStatus('gen-manage-status', '✗ Błąd skanowania: ' + e.message, 'err');
  } finally {
    setListBusy(false);
  }
};
window.approveGenGame = function(i) {
  genGames[i].status = 'approved';
  renderGenList();
};

window.regenerateGenGame = function(idx) {
  const item = genGames[idx];
  if (item.generating) return;
  item.game = null; item.status = 'pending'; item.generating = true; item.jobId = null;
  renderGenList();
  
  const lang = $('gen-manage-lang').value;
  const existingTitles = genGames.filter((_,i) => i !== idx && _.game).map(g => g.game.meta?.title).filter(Boolean);
  loadedGames.filter(g => g.lang === lang).forEach(g => existingTitles.push(g.title));
  
  callEdgeAction({
    action: 'enqueue',
    lang,
    total: 1,
    topic: $('gen-topic').value.trim(),
    alreadyUsed: existingTitles
  }).then(res => {
    item.jobId = res.jobId;
    checkQueueStatus();
  }).catch(e => {
    item.status = 'rejected'; item.generating = false;
    showStatus('gen-session-status', '✗ Błąd: ' + e.message, 'err');
    renderGenList();
  });
};

window.pushApprovedGames = function() {
  const approved = genGames.filter(g => g.status === 'approved' && g.game);
  approved.forEach(item => {
    const slug = slugify(item.game.slug || item.game.meta?.title || 'game');
    pendingAdd.push({ slug, content: JSON.stringify(item.game, null, 2) });
  });
  genGames = genGames.filter(g => g.status !== 'approved');
  if (!genGames.length) hide('gen-results-section');
  updatePendingBar();
  renderManageList();
  renderGenList();
};

window.saveGeneratorChanges = async function() {
  if (!pendingDelete.size && !pendingAdd.length) return;
  setListBusy(true);
  showStatus('gen-manage-status', 'Zapisuję zmiany…', 'info');
  try {
    const lang = $('gen-manage-lang').value;
    const deletes = loadedGames.filter(g => pendingDelete.has(g.slug)).map(g => ({ filename: g.filename, indexKey: g.indexKey, slug: g.slug, sha: g.sha }));
    const remaining = loadedGames.filter(g => !pendingDelete.has(g.slug)).map(g => ({ filename: g.filename, indexKey: g.indexKey, slug: g.slug, sha: g.sha }));
    
    await callEdgeAction({ action: 'batch-commit', lang, deletes, adds: pendingAdd, remaining });
    
    pendingAdd = [];
    pendingDelete.clear();
    updatePendingBar();
    showStatus('gen-session-status', '✓ Zmiany zapisane.', 'ok');
    window.loadGeneratorList();
  } catch (e) {
    showStatus('gen-manage-status', '✗ ' + e.message, 'err');
  } finally {
    setListBusy(false);
  }
};

function updateBulkBar() {
  const bar = $('gen-bulk-bar');
  if (selectedGames.size > 0) {
    bar.classList.add('visible');
    $('gen-bulk-count').textContent = `${selectedGames.size} zaznaczonych`;
  } else {
    bar.classList.remove('visible');
  }
}

function updatePendingBar() {
  const bar = $('gen-pending-bar');
  const count = pendingDelete.size + pendingAdd.length;
  if (count > 0) {
    bar.classList.add('visible');
    $('gen-pending-count').textContent = `${count} niezapisanych zmian`;
  } else {
    bar.classList.remove('visible');
  }
}

// Utility
async function callEdgeAction(body) {
  const { data, error } = await supabase().functions.invoke('generate-game', { body });
  if (error) throw error;
  return data;
}

function slugify(text) {
  return (text || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Bindings
document.addEventListener('DOMContentLoaded', () => {
  $('gen-load-btn')?.addEventListener('click', window.loadGeneratorList);
  $('gen-scan-btn')?.addEventListener('click', window.scanGames);
  $('gen-reset-btn')?.addEventListener('click', window.resetGeneratorSession);
  $('gen-enqueue-btn')?.addEventListener('click', window.enqueueGeneration);
  $('gen-push-approved-btn')?.addEventListener('click', window.pushApprovedGames);
  $('gen-save-btn')?.addEventListener('click', window.saveGeneratorChanges);
  $('gen-clear-pending-btn')?.addEventListener('click', () => {
    pendingAdd = [];
    pendingDelete.clear();
    updatePendingBar();
    renderManageList();
  });
  $('gen-delete-sel-btn')?.addEventListener('click', () => {
    selectedGames.forEach(slug => pendingDelete.add(slug));
    selectedGames.clear();
    updateBulkBar();
    updatePendingBar();
    renderManageList();
  });
  $('gen-sel-all-btn')?.addEventListener('click', () => {
    loadedGames.forEach(g => selectedGames.add(g.slug));
    updateBulkBar();
    renderManageList();
  });
  $('gen-clear-sel-btn')?.addEventListener('click', () => {
    selectedGames.clear();
    updateBulkBar();
    renderManageList();
  });
  $('gen-approve-all-btn')?.addEventListener('click', () => {
    genGames.forEach(g => { if(g.game) g.status = 'approved'; });
    renderGenList();
  });
});
