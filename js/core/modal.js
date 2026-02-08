let modalSeq = 0;

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
  closeBtn.setAttribute("aria-label", "Zamknij");
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
  title = "Potwierdź",
  text = "Na pewno?",
  okText = "Tak",
  cancelText = "Nie",
  showCancel = true,
  body = null,
  initialFocus = null,
} = {}) {
  return new Promise((resolve) => {
    const { overlay, okBtn, cancelBtn, closeBtn } = buildModal({
      title,
      text,
      okText,
      cancelText,
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

export function confirmModal({ title = "Potwierdź", text = "Na pewno?", okText = "Tak", cancelText = "Nie" } = {}) {
  return openModal({ title, text, okText, cancelText, showCancel: true });
}

export function alertModal({ title = "Informacja", text = "—", okText = "OK" } = {}) {
  return openModal({ title, text, okText, showCancel: false });
}

export function promptModal({
  title = "Wpisz",
  text = "Podaj wartość:",
  okText = "Zapisz",
  cancelText = "Anuluj",
  value = "",
  placeholder = "",
} = {}) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inp uni-inp";
  input.value = value;
  input.placeholder = placeholder;

  return openModal({
    title,
    text,
    okText,
    cancelText,
    showCancel: true,
    body: input,
    initialFocus: input,
  }).then((ok) => (ok ? input.value : null));
}
