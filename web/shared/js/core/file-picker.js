export function bindLocalizedFilePicker({ input, button, fileName, t }) {
  if (!input || !button || !fileName) return { reset() {} };

  const syncName = () => {
    fileName.textContent = input.files?.[0]?.name || t("common.filePicker.none");
  };

  button.addEventListener("click", () => {
    input.value = "";
    syncName();
    input.click();
  });
  input.addEventListener("change", syncName);
  window.addEventListener("i18n:lang", () => {
    if (!input.files?.length) syncName();
  });

  return {
    reset() {
      input.value = "";
      syncName();
    },
  };
}
