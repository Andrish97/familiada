// admin/js/ratings.js — Oceny: oceny aplikacji i gier producenta.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-25T08101";
import { icon } from "../../shared/js/core/icons.js?v=v2026-10-25T08101";
import { openDialog } from "../../shared/js/core/modal-sheet.js?v=v2026-10-25T08101";
import { adminFetch, adminGet, els, esc, escSetting } from "./core.js?v=v2026-10-25T08101";
import { setStatus } from "./maintenance.js?v=v2026-10-25T08101";

export async function loadRatings({ silent = false } = {}) {
  if (!silent) setStatus("Ładowanie ocen…");
  if (els.ratingsTableBody) els.ratingsTableBody.innerHTML = "";
  if (els.ratingsTableInfo) els.ratingsTableInfo.textContent = "";

  try {
    // Load stats
    const { data: statsData, error: statsError } = await sb().rpc("get_app_rating_stats");
    if (statsError) throw statsError;
    const stats = Array.isArray(statsData) ? statsData[0] : statsData;
    if (els.ratingsGlobalStats && stats) {
      els.ratingsGlobalStats.innerHTML = `Średnia: ${stats.avg_stars}/5 ${icon("star")} | Łącznie: ${stats.total_count}`;
    }

    // Load detailed ratings
    const rows = (await adminGet("/ratings", "rows")) || [];
    if (rows.length === 0) {
      if (els.ratingsTableBody) els.ratingsTableBody.innerHTML = '<tr><td colspan="4" class="table-empty">Brak ocen.</td></tr>';
      return;
    }

    if (els.ratingsTableBody) {
      els.ratingsTableBody.innerHTML = rows.map(r => {
        const date = new Date(r.created_at).toLocaleString();
        const user = r.username || r.email || "Nieznany";
        const stars = icon("star").repeat(r.stars) + icon("star-empty").repeat(5 - r.stars);
        return `
          <tr>
            <td class="rt-date">${date}</td>
            <td class="rt-user">${esc(user)}</td>
            <td class="rt-stars">${stars}</td>
            <td class="rt-comment">${esc(r.comment || "-")}</td>
          </tr>
        `;
      }).join("");
    }
  } catch (e) {
    console.error("[settings] loadRatings error:", e);
    if (els.ratingsTableInfo) els.ratingsTableInfo.textContent = "Błąd ładowania ocen: " + e.message;
  } finally {
    if (!silent) setStatus("Załadowano");
  }
}

export async function loadProducerRatings() {
  const tbody = document.getElementById("producerRatingsBody");
  const info  = document.getElementById("producerRatingsInfo");
  if (!tbody) return;
  if (info) info.textContent = "Ładowanie…";
  try {
    const res = await adminFetch("/marketplace/producer-ratings");
    if (!res.ok) throw new Error(await res.text());
    const { rows } = await res.json();
    if (info) info.textContent = "";
    if (!rows || !rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty table-empty--plain">Brak gier producenta.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(g => `<tr>
      <td>${escSetting(g.title)}</td>
      <td>${escSetting(g.lang.toUpperCase())}</td>
      <td>${g.avg_rating > 0 ? (+(g.avg_rating)).toFixed(1) + " " + icon("star") : "—"}</td>
      <td>${g.rating_count}</td>
      <td>${g.library_count}</td>
      <td><button class="btn sm" data-raters-id="${escSetting(g.id)}" data-raters-title="${escSetting(g.title)}" type="button">Oceniający</button></td>
    </tr>`).join("");
    tbody.querySelectorAll("[data-raters-id]").forEach(btn => {
      btn.addEventListener("click", () => openRatersModal(btn.dataset.ratersId, btn.dataset.ratersTitle));
    });
  } catch (err) {
    if (info) info.textContent = String(err?.message || err);
  }
}

async function openRatersModal(gameId, title) {
  const overlay = document.getElementById("ratersOverlay");
  const body    = document.getElementById("ratersBody");
  const titleEl = document.getElementById("ratersTitle");
  if (!overlay || !body) return;
  if (titleEl) titleEl.textContent = title || "Oceniający";
  body.innerHTML = "Ładowanie…";
  openDialog(overlay);
  try {
    const res = await adminFetch(`/marketplace/game-raters?id=${encodeURIComponent(gameId)}`);
    if (!res.ok) throw new Error(await res.text());
    const { rows } = await res.json();
    if (!rows || !rows.length) {
      body.textContent = "Brak ocen.";
      return;
    }
    // Dwie kolumny (data pod nazwą) — mieszczą się także na telefonie.
    body.innerHTML = `<table class="data-table raters-table"><thead><tr>
      <th>Użytkownik</th><th>Ocena</th>
    </tr></thead><tbody>${rows.map(r =>
      `<tr>
        <td>${escSetting(r.username || "?")}<div class="raters-date">${new Date(r.rated_at).toLocaleString()}</div></td>
        <td class="nowrap">${icon("star").repeat(r.stars)}${icon("star-empty").repeat(5 - r.stars)} (${r.stars})</td>
      </tr>`
    ).join("")}</tbody></table>`;
  } catch (err) {
    body.textContent = String(err?.message || err);
  }
}

export function wireRatingsEvents() {
  if (els.btnRatingsRefresh) {
    els.btnRatingsRefresh.addEventListener("click", () => loadRatings());
  }
}
