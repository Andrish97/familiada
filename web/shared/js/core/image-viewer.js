// js/core/image-viewer.js
// Podgląd zrzutu w oknie (strona główna, Wskazówki): na komputerze obraz w oknie
// z tytułem, na telefonie okno od dołu z przybliżaniem palcami (pinch-zoom.js).
// Zamyka [×], Esc, kliknięcie tła albo „Wstecz” na górnym pasku (backBtn).

import { t } from "../../translation/translation.js?v=v2026-10-22T07405";
import { icon } from "./icons.js?v=v2026-10-22T07405";
import { enterModalSheet, exitModalSheet, isSheetViewport } from "./modal-sheet.js?v=v2026-10-22T07405";
import { initPinchZoom, lockPageZoomForPreview, unlockPageZoomAfterPreview } from "./pinch-zoom.js?v=v2026-10-22T07405";

/**
 * @param {{ mount?: HTMLElement|null, before?: Node|null, backBtn?: HTMLElement|null }} opts
 *   mount/before — gdzie wstawić okno (domyślnie body), backBtn — przycisk „Wstecz” w topbarze
 * @returns {{ open(src: string, title?: string, preview?: HTMLImageElement|null): void, close(): void }}
 */
export function createImageViewer({ mount = null, before = null, backBtn = null } = {}) {
  const overlay = document.createElement("div");
  overlay.id = "imgvOverlay";
  overlay.className = "overlay modal--sheet imgv-overlay";
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="modal imgv-panel" role="dialog" aria-modal="true" aria-labelledby="imgvHeading">
      <div class="imgv-top mHead">
        <h2 class="imgv-title mTitle" id="imgvHeading" data-i18n="common.imageViewer.title">${t("common.imageViewer.title")}</h2>
        <button class="btn sm" type="button" id="imgvClose" aria-label="${t("common.modal.closeLabel")}" data-i18n-aria-label="common.modal.closeLabel">${icon("close")}</button>
      </div>
      <p class="imgv-name mSub" id="imgvName"></p>
      <div class="imgv-stage" id="imgvStage"></div>
    </div>
  `;
  (mount || document.body).insertBefore(overlay, before);
  const stage = overlay.querySelector("#imgvStage");
  const closeBtn = overlay.querySelector("#imgvClose");
  const titleEl = overlay.querySelector("#imgvName");

  let previewZoom = null;
  let previousFocus = null;

  // preview -- obraz ze strony (już wczytany): pokazany od razu w docelowym
  // rozmiarze, a pełny kadr podmienia go po zdekodowaniu, bez skoku okna.
  const open = (src, title, preview = null) => {
    if (overlay.classList.contains("is-open")) return;
    previousFocus = document.activeElement;
    stage.innerHTML = "";
    titleEl.textContent = title || "";
    const isMobile = window.matchMedia("(max-width: 980px)").matches;
    const img = document.createElement("img");
    img.className = "imgv-img"; img.alt = title || "";
    const ready = preview?.complete && preview.naturalWidth > 0;
    img.src = ready ? (preview.currentSrc || preview.src) : src;
    if (ready && img.src !== new URL(src, location.href).href) {
      const full = new Image();
      full.src = src;
      full.decode().then(() => { if (img.isConnected) img.src = src; }).catch(() => {});
    }
    if (isMobile) {
      const zoom = document.createElement("div");
      zoom.className = "imgv-zoom";
      zoom.appendChild(img); stage.appendChild(zoom);
      previewZoom = initPinchZoom(zoom, img);
      lockPageZoomForPreview();
    } else {
      if (ready) {
        // Rozmiar okna z proporcji kadru, a nie z rozdzielczości podglądu.
        const ratio = preview.naturalWidth / preview.naturalHeight;
        img.style.aspectRatio = `${preview.naturalWidth} / ${preview.naturalHeight}`;
        img.style.width = `min(88vw, 1400px, calc(min(72vh, 800px) * ${ratio}))`;
        img.style.height = "auto";
      }
      stage.appendChild(img);
    }
    overlay.style.display = "";
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    enterModalSheet(overlay, { backBtn, onClose: close });
    (isSheetViewport() ? overlay.querySelector(".sheet-handle") : closeBtn)?.focus();
  };

  const close = () => {
    if (!overlay.classList.contains("is-open")) return;
    overlay.classList.remove("is-open");
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    exitModalSheet(overlay);
    previewZoom?.reset();
    previewZoom = null;
    unlockPageZoomAfterPreview();
    stage.innerHTML = "";
    previousFocus?.focus?.();
    previousFocus = null;
  };

  closeBtn.addEventListener("click", close);
  backBtn?.addEventListener("click", (e) => {
    if (!overlay.classList.contains("is-open")) return;
    e.preventDefault();
    close();
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("is-open")) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "Tab") {
      // W tym prostym dialogu jedynym elementem interaktywnym jest zamknięcie.
      e.preventDefault();
      (isSheetViewport() ? overlay.querySelector(".sheet-handle") : closeBtn)?.focus();
    }
  }, true);

  return { open, close };
}
