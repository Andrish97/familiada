// base-explorerjs/ui/rename-modal.js
// Okno zmiany nazwy folderu / treści pytania (#renameModal z index.html).
// Zwraca Promise z nową wartością albo null (anulowano).

import { t } from "../../../../shared/translation/translation.js?v=v2026-10-20T23220";
import { enterModalSheet, exitModalSheet, isSheetViewport } from "../../../../shared/js/core/modal-sheet.js?v=v2026-10-20T23220";

const btnBack = document.getElementById("btnBack");

export function openRenameModal({ title, value = "", maxLen = 80 } = {}) {
  const modal = document.getElementById("renameModal");
  const input = document.getElementById("renameModalInput");
  const btnSave = document.getElementById("renameModalSave");
  const btnClose = document.getElementById("renameModalClose");
  const titleEl = document.getElementById("renameModalTitle");

  if (!modal || !input || !btnSave || !btnClose || !titleEl) {
    // jeśli ktoś zapomni wkleić HTML: po prostu anuluj
    return Promise.resolve(null);
  }

  // jednorazowe bindowanie (żeby nie dokładać listenerów przy każdym otwarciu)
  if (!modal._wired) {
    modal._wired = true;

    modal.addEventListener("click", (e) => {
      // klik w tło zamyka -- ale nie w trybie sheet (mobile), gdzie
      // jedynym wyjściem ma być przycisk wstecz w topbarze.
      if (modal.classList.contains("modal--sheet") && isSheetViewport()) return;
      if (e.target && e.target.matches?.("[data-close]")) {
        modal._resolver?.(null);
      }
    });

    btnClose.addEventListener("click", () => {
      modal._resolver?.(null);
    });

    // ESC zamyka
    document.addEventListener("keydown", (e) => {
      if (modal.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        modal._resolver?.(null);
      }
    });

    // Enter = zapisz
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnSave.click();
      }
    });

    btnSave.addEventListener("click", () => {
      const v = String(input.value || "").trim();
      modal._resolver?.(v || null);
    });
  }

  titleEl.textContent = title || t("baseExplorer.rename.title");
  input.value = String(value || "");
  input.maxLength = Number(maxLen) || 80;

  modal.hidden = false;
  enterModalSheet(modal, { backBtn: btnBack, onClose: () => modal._resolver?.(null) });

  // focus + zaznacz tekst
  setTimeout(() => {
    try {
      input.focus();
      input.setSelectionRange(0, input.value.length);
    } catch {}
  }, 0);

  return new Promise((resolve) => {
    modal._resolver = (result) => {
      modal.hidden = true;
      exitModalSheet(modal);
      modal._resolver = null;
      resolve(result);
    };
  });
}

