import { t } from "../../translation/translation.js?v=v2026-09-21T17140";
import { enterModalSheet, exitModalSheet, isSheetViewport } from "./modal-sheet.js?v=v2026-09-21T17140";
let modalSeq = 0;

function modalText(key, fallback) {
  return typeof t === "function" ? t(key) : fallback;
}

function buildModal({
  title,
  text,
  okText,
  cancelText,
  showCancel = true,
  body = null,
  sheet = null,
} = {}) {
  modalSeq += 1;
  const titleId = `uniTitle${modalSeq}`;
  const subId = `uniSub${modalSeq}`;

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.style.background = "rgba(0,0,0,.75)";
  // sheet: rozbudowana treść (np. szczegóły statystyki, podgląd
  // wiadomości) przekazana przez wywołującego — na telefonie zastępuje
  // treść strony zamiast być małym oknem, patrz js/core/modal-sheet.js.
  // Krótkie confirm/alert nigdy tego nie przekazują, więc ich wygląd
  // się nie zmienia. WAŻNE: klasa idzie na .overlay (jak w statycznym
  // HTML wszystkich innych modali), nie na .modal — reguła CSS "ukryj
  // resztę main.wrap" wyklucza z ukrycia po klasie .modal--sheet na
  // BEZPOŚREDNIM dziecku main.wrap (czyli .overlay), nie na jego
  // wewnętrznym .modal.
  if (sheet) overlay.classList.add("modal--sheet");

  const modal = document.createElement("div");
  modal.className = "modal uni-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", titleId);
  modal.setAttribute("aria-describedby", subId);

  const head = document.createElement("div");
  head.className = "uni-head";

  const titleEl = document.createElement("div");
  titleEl.className = "mTitle";
  titleEl.id = titleId;
  titleEl.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn sm";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", modalText("common.modal.closeLabel", "Zamknij"));
  closeBtn.textContent = "✕";

  head.appendChild(titleEl);
  head.appendChild(closeBtn);

  const sub = document.createElement("div");
  sub.className = "mSub";
  sub.id = subId;
  sub.style.whiteSpace = "pre-line";
  sub.textContent = text;

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "uni-body";
  if (body) bodyWrap.appendChild(body);

  const foot = document.createElement("div");
  foot.className = "importRow uni-foot";

  const okBtn = document.createElement("button");
  okBtn.className = "btn sm gold";
  okBtn.type = "button";
  okBtn.textContent = okText;

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn sm";
  cancelBtn.type = "button";
  cancelBtn.textContent = cancelText;

  const msg = document.createElement("div");
  msg.className = "importMsg";
  msg.textContent = "";

  foot.appendChild(okBtn);
  if (showCancel) foot.appendChild(cancelBtn);
  foot.appendChild(msg);

  modal.appendChild(head);
  modal.appendChild(sub);
  if (body) modal.appendChild(bodyWrap);
  modal.appendChild(foot);

  overlay.appendChild(modal);

  return {
    overlay,
    okBtn,
    cancelBtn,
    closeBtn,
  };
}

function openModal({
  title,
  text,
  okText,
  cancelText,
  showCancel = true,
  body = null,
  initialFocus = null,
  onReady = null,
  sheet = null,
} = {}) {
  return new Promise((resolve) => {
    const fallbackTitle = showCancel
      ? modalText("common.modal.confirmTitle", "Potwierdź")
      : modalText("common.modal.alertTitle", "Informacja");
    const fallbackText = showCancel
      ? modalText("common.modal.confirmText", "Na pewno?")
      : "—";
    const fallbackOk = showCancel
      ? modalText("common.modal.confirmOk", "Tak")
      : modalText("common.modal.alertOk", "OK");
    const fallbackCancel = modalText("common.modal.confirmCancel", "Nie");
    const { overlay, okBtn, cancelBtn, closeBtn } = buildModal({
      title: title ?? fallbackTitle,
      text: text ?? fallbackText,
      okText: okText ?? fallbackOk,
      cancelText: cancelText ?? fallbackCancel,
      showCancel,
      body,
      sheet,
    });

    try {
      if (typeof onReady === "function") onReady({ overlay, okBtn, cancelBtn, closeBtn });
    } catch {
      // ignore
    }

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      if (sheet) exitModalSheet(overlay);
      overlay.remove();
      document.removeEventListener("keydown", onKeydown, true);
      try {
        document.dispatchEvent(new CustomEvent("uni-modal:closed", { detail: { value } }));
      } catch {
        // ignore
      }
      resolve(value);
    };

    const onKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    };

    overlay.addEventListener("click", (e) => {
      if (e.target !== overlay) return;
      // W trybie sheet modal zastępuje treść strony — jedynym wyjściem
      // ma być przycisk wstecz w topbarze, nie klik w tło.
      if (sheet && isSheetViewport()) return;
      finish(false);
    });

    okBtn.addEventListener("click", () => finish(true));
    cancelBtn?.addEventListener("click", () => finish(false));
    closeBtn.addEventListener("click", () => finish(false));

    document.addEventListener("keydown", onKeydown, true);

    // Modal w trybie sheet musi być dzieckiem <main class="wrap">/.explorer
    // (przed .footer), żeby reguła CSS "ukryj resztę treści strony" go
    // objęła i żeby na telefonie zastępował treść strony zamiast lądować
    // za stopką (patrz css/base.css, sekcja "Modal sheet (mobile)").
    const sheetParent = sheet && document.querySelector("main.wrap, main.explorer");
    if (sheetParent) {
      const footer = sheetParent.querySelector(":scope > .footer");
      if (footer) sheetParent.insertBefore(overlay, footer);
      else sheetParent.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }

    if (sheet) enterModalSheet(overlay, { backBtn: sheet.backBtn, onClose: () => finish(false), keepBackBtnText: sheet.keepBackBtnText });

    const focusTarget = initialFocus || okBtn;
    setTimeout(() => focusTarget?.focus?.(), 0);
  });
}

export function confirmModal({ title, text, okText, cancelText, body = null, initialFocus = null, onReady, sheet = null } = {}) {
  return openModal({
    title: title ?? modalText("common.modal.confirmTitle", "Potwierdź"),
    text: text ?? modalText("common.modal.confirmText", "Na pewno?"),
    okText: okText ?? modalText("common.modal.confirmOk", "Tak"),
    cancelText: cancelText ?? modalText("common.modal.confirmCancel", "Nie"),
    showCancel: true,
    body,
    initialFocus,
    onReady,
    sheet,
  });
}

export function alertModal({ title, text, okText, onReady, sheet = null } = {}) {
  return openModal({
    title: title ?? modalText("common.modal.alertTitle", "Informacja"),
    text: text ?? "—",
    okText: okText ?? modalText("common.modal.alertOk", "OK"),
    showCancel: false,
    onReady,
    sheet,
  });
}


export function promptModal({
  title,
  text,
  okText,
  cancelText,
  value = "",
  placeholder = "",
  onReady = null,
} = {}) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inp uni-inp";
  input.value = value;
  input.placeholder = placeholder;

  return openModal({
    title: title ?? modalText("common.modal.promptTitle", "Wpisz"),
    text: text ?? modalText("common.modal.promptText", "Podaj wartość:"),
    okText: okText ?? modalText("common.modal.promptOk", "Zapisz"),
    cancelText: cancelText ?? modalText("common.modal.promptCancel", "Anuluj"),
    showCancel: true,
    body: input,
    initialFocus: input,
    onReady,
  }).then((ok) => (ok ? input.value : null));
}
