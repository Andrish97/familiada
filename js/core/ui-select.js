export function initUiSelect(root, { options = [], value = "", placeholder = "—", onChange, disabled = false } = {}) {
  if (!root) return null;
  const btn = root.querySelector(".ui-select-btn");
  const label = root.querySelector(".ui-select-label");
  const menu = root.querySelector(".ui-select-menu");
  if (!btn || !label || !menu) return null;

  let currentOptions = [];
  let currentValue = "";
  let destroyed = false;

  const close = () => {
    if (destroyed) return;
    root.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    if (destroyed || root.classList.contains("is-disabled")) return;
    root.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
  };

  const toggle = () => {
    if (root.classList.contains("open")) close();
    else open();
  };

  const setValue = (val, { silent = false } = {}) => {
    currentValue = String(val ?? "");
    const match = currentOptions.find((opt) => String(opt.value) === currentValue);
    label.textContent = match ? match.label : placeholder;
    for (const item of menu.querySelectorAll(".ui-select-item")) {
      const isSelected = item.dataset.value === currentValue;
      item.setAttribute("aria-selected", isSelected ? "true" : "false");
    }
    if (!silent && onChange) onChange(currentValue);
  };

  const setOptions = (opts = []) => {
    currentOptions = opts.map((opt) => ({
      value: String(opt.value ?? ""),
      label: String(opt.label ?? ""),
    }));
    menu.innerHTML = "";
    currentOptions.forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "ui-select-item";
      item.dataset.value = opt.value;
      item.textContent = opt.label || placeholder;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      menu.appendChild(item);
    });
    if (!currentOptions.some((opt) => opt.value === currentValue)) {
      currentValue = currentOptions[0]?.value || "";
    }
    setValue(currentValue, { silent: true });
  };

  const setDisabled = (flag) => {
    const on = !!flag;
    root.classList.toggle("is-disabled", on);
    btn.disabled = on;
    if (on) close();
  };

  const handleDocClick = (e) => {
    if (destroyed) return;
    if (!root.contains(e.target)) close();
  };

  const handleKeydown = (e) => {
    if (destroyed) return;
    if (e.key === "Escape") close();
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    toggle();
  });

  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".ui-select-item");
    if (!item) return;
    setValue(item.dataset.value);
    close();
  });

  document.addEventListener("click", handleDocClick);
  document.addEventListener("keydown", handleKeydown);

  setOptions(options);
  setValue(value, { silent: true });
  setDisabled(disabled);

  return {
    setOptions,
    setValue,
    getValue: () => currentValue,
    setDisabled,
    destroy: () => {
      destroyed = true;
      document.removeEventListener("click", handleDocClick);
      document.removeEventListener("keydown", handleKeydown);
    },
  };
}
