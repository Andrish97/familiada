import { createTheme as createModernTheme } from "./modern.js?v=v2026-10-26T14464";

// The board variants keep Host's reading and swipe behavior. Their shapes
// live in host.css; the game supplies background and team colors separately.
export function createBoardTheme(root, { serif = false } = {}) {
  createModernTheme(root);
  root.style.setProperty("--host-paper-bg", "var(--host-board-bg)");
  if (serif) {
    root.style.setProperty("--host-font", 'Georgia, "Times New Roman", serif');
    root.style.setProperty("--host-font-ratio", "0.94");
  }
  return { ruled: false, board: true };
}
