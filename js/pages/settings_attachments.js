
  // ── Attachments Logic ──────────────────────────────────────────────────────
  let currentAttachments = [];

  const updateAttachmentList = () => {
    const list = document.getElementById("composeAttachmentList");
    if (!list) return;
    list.innerHTML = "";
    currentAttachments.forEach((f, index) => {
      const span = document.createElement("span");
      span.style.display = "inline-flex";
      span.style.alignItems = "center";
      span.style.gap = "4px";
      span.style.padding = "2px 8px";
      span.style.borderRadius = "10px";
      span.style.border = "1px solid rgba(255,255,255,.12)";
      span.style.fontSize = "11px";
      span.style.color = "rgba(255,255,255,.6)";
      span.textContent = f.name;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn sm";
      removeBtn.style.padding = "0 4px";
      removeBtn.style.marginLeft = "4px";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        currentAttachments.splice(index, 1);
        updateAttachmentList();
      });

      span.appendChild(removeBtn);
      list.appendChild(span);
    });
  };

  document.getElementById("composeAttachmentInput")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    currentAttachments = [...currentAttachments, ...files];
    e.target.value = ""; // reset input
    updateAttachmentList();
  });
