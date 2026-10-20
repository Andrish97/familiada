// base-explorerjs/history.js
// Historia cofania (Ctrl+Z) i ponawiania (Ctrl+Y / Ctrl+Shift+Z) menedżera
// bazy — w pamięci karty, do przeładowania strony.
//
// Polecenie: { labelKey, undo: async () => {}, redo: async () => {},
//              drop?: (stack) => {} }
// undo/redo wykonują zapis w bazie (ops.js) i odświeżają widok. drop("redo")
// woła się, gdy polecenie wypada z historii ponowień (nowa akcja po
// cofnięciu) — np. cofnięte utworzenie czyści wtedy swój wpis w koszu.
// Błąd cofania/ponawiania (element zmieniony albo usunięty gdzie indziej)
// czyści całą historię: dalsze kroki mogłyby dotyczyć innego stanu.

export function createHistory({ limit = 50, onChange = null } = {}) {
  let undoStack = [];
  let redoStack = [];
  let running = false;

  const peek = (stack) => stack[stack.length - 1] || null;

  function info() {
    return {
      canUndo: !running && undoStack.length > 0,
      canRedo: !running && redoStack.length > 0,
      undoLabelKey: peek(undoStack)?.labelKey || null,
      redoLabelKey: peek(redoStack)?.labelKey || null,
    };
  }

  function changed() {
    onChange?.(info());
  }

  function dropAll(stack, where) {
    for (const cmd of stack) {
      try { cmd.drop?.(where); } catch (e) { console.warn("history drop failed:", e); }
    }
  }

  function push(cmd) {
    if (!cmd) return;
    undoStack.push(cmd);
    if (undoStack.length > limit) dropAll(undoStack.splice(0, undoStack.length - limit), "undo");
    dropAll(redoStack, "redo");
    redoStack = [];
    changed();
  }

  function clear() {
    dropAll(redoStack, "redo");
    undoStack = [];
    redoStack = [];
    changed();
  }

  async function step(from, to, method) {
    if (running || !from().length) return null;
    const cmd = from().pop();
    running = true;
    changed();
    try {
      await cmd[method]();
      to().push(cmd);
      return cmd;
    } catch (e) {
      // element chwilowo zajęty (blokada): krok wraca na swoje miejsce,
      // historia zostaje — można spróbować później
      if (e?.keepHistory) {
        from().push(cmd);
        throw e;
      }
      // ten krok się nie udał — reszta historii mogłaby dotyczyć innego stanu
      running = false;
      dropAll(redoStack, "redo");
      undoStack = [];
      redoStack = [];
      throw e;
    } finally {
      running = false;
      changed();
    }
  }

  return {
    push,
    clear,
    info,
    undo: () => step(() => undoStack, () => redoStack, "undo"),
    redo: () => step(() => redoStack, () => undoStack, "redo"),
  };
}
