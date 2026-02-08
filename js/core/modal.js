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
} = {}) {
  modalSeq += 1;
  const titleId = `uniTitle${modalSeq}`;
  const subId = `uniSub${modalSeq}`;

  const overlay = document.createElement("div");
  overlay.className = "overlay";

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
  msg.textContent = "—";

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
    });

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener("keydown", onKeydown, true);
      resolve(value);
    };

    const onKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(false);
    });

    okBtn.addEventListener("click", () => finish(true));
    cancelBtn?.addEventListener("click", () => finish(false));
    closeBtn.addEventListener("click", () => finish(false));

    document.addEventListener("keydown", onKeydown, true);
    document.body.appendChild(overlay);

    const focusTarget = initialFocus || okBtn;
    setTimeout(() => focusTarget?.focus?.(), 0);
  });
}

export function confirmModal({ title, text, okText, cancelText } = {}) {
  return openModal({
    title: title ?? modalText("common.modal.confirmTitle", "Potwierdź"),
    text: text ?? modalText("common.modal.confirmText", "Na pewno?"),
    okText: okText ?? modalText("common.modal.confirmOk", "Tak"),
    cancelText: cancelText ?? modalText("common.modal.confirmCancel", "Nie"),
    showCancel: true,
  });
}

export function alertModal({ title, text, okText } = {}) {
  return openModal({
    title: title ?? modalText("common.modal.alertTitle", "Informacja"),
    text: text ?? "—",
    okText: okText ?? modalText("common.modal.alertOk", "OK"),
    showCancel: false,
  });
}

export function promptModal({
  title,
  text,
  okText,
  cancelText,
  value = "",
  placeholder = "",
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
  }).then((ok) => (ok ? input.value : null));
}
