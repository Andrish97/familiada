// base-explorer/js/create-game-modal.js
import { sb } from "../../js/core/supabase.js";
import { importGame } from "../../js/pages/builder-import-export.js";

/**
 * Otwiera modal tworzenia gry z zaznaczonych pytań.
 * - pobiera payloady pytań z qb_questions
 * - składa JSON gry
 * - zapisuje przez importGame()
 */
export async function openCreateGameModal({ state, questionIds }) {
  const overlay = document.getElementById("createGameOverlay");
  if (!overlay) {
    alert("Brak #createGameOverlay w DOM (wklej modals.html).");
    return;
  }

  const els = {
    name: overlay.querySelector("#cgName"),
    type: overlay.querySelector("#cgType"),
    list: overlay.querySelector("#cgQuestionsPreview"),
    btnCancel: overlay.querySelector("[data-cg-cancel]") || overlay.querySelector("#cgCancelBtn"),
    btnCreate: overlay.querySelector("[data-cg-create]") || overlay.querySelector("#cgCreateBtn"),
  };

  if (!els.name || !els.type || !els.list || !els.btnCancel || !els.btnCreate) {
    alert("Modal gry: brakuje wymaganych elementów (sprawdź ID/data-* w modals.html).");
    return;
  }

  const ids = Array.from(new Set(questionIds || [])).filter(Boolean);
  if (!ids.length) return;

  // --- fetch questions ---
  const { data, error } = await sb()
    .from("qb_questions")
    .select("id,payload")
    .in("id", ids);

  if (error) {
    console.error(error);
    alert("Nie udało się wczytać pytań do gry.");
    return;
  }

  const map = new Map((data || []).map((r) => [r.id, r.payload]));
  const ordered = ids
    .map((id) => ({ id, payload: map.get(id) }))
    .filter((x) => x.payload);

  // --- preview ---
  els.list.innerHTML = ordered
    .map((x, i) => {
      const txt = String(x.payload?.text || "").trim() || "(bez treści)";
      return `<div class="cgPrevRow"><span class="cgPrevIdx">${i + 1}.</span> <span class="cgPrevText">${escapeHtml(
        txt
      )}</span></div>`;
    })
    .join("");

  // defaults
  if (!String(els.name.value || "").trim()) els.name.value = "NOWA GRA";
  if (!String(els.type.value || "").trim()) els.type.value = "prepared";

  // --- open ---
  showOverlay(overlay);

  const ac = new AbortController();
  const { signal } = ac;

  function close() {
    ac.abort();
    hideOverlay(overlay);
  }

  overlay.addEventListener(
    "click",
    (e) => {
      if (e.target === overlay) close();
    },
    { signal }
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") close();
    },
    { signal }
  );

  els.btnCancel.addEventListener("click", close, { signal });

  els.btnCreate.addEventListener(
    "click",
    async () => {
      try {
        const gameName = String(els.name.value || "").trim() || "NOWA GRA";
        const gameType = String(els.type.value || "").trim() || "prepared";

        const out = {
          game: { name: gameName, type: gameType },
          questions: ordered.map((x) => normalizeQuestionPayload(x.payload)),
        };

        // zapis (import) gry
        const ownerId = state?.user?.id || state?.authUser?.id || null;
        if (!ownerId) {
          alert("Brak user id w state (ustaw state.user w page.js).");
          return;
        }

        const res = await importGame(out, { ownerId });

        close();

        // opcjonalnie: jeśli importGame zwraca gameId, możesz tu zrobić nawigację
        // (bez zgadywania ścieżek – zostawiamy tylko komunikat)
        if (res?.gameId) {
          alert(`Utworzono grę. ID: ${res.gameId}`);
        } else {
          alert("Utworzono grę.");
        }
      } catch (e) {
        console.error(e);
        alert("Nie udało się utworzyć gry.");
      }
    },
    { signal }
  );
}

/* ========================= helpers ========================= */

function normalizeQuestionPayload(p) {
  const text = String(p?.text || "");
  const answers = Array.isArray(p?.answers) ? p.answers : [];
  return {
    text,
    answers: answers.map((a, i) => ({
      ord: Number(a?.ord ?? i + 1),
      text: String(a?.text || ""),
      fixed_points: a?.fixed_points ?? undefined,
    })),
  };
}

function showOverlay(overlay) {
  overlay.hidden = false;
  overlay.classList.add("is-open");
  document.documentElement.classList.add("modal-open");
}

function hideOverlay(overlay) {
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  document.documentElement.classList.remove("modal-open");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
