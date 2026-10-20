// Dopasowanie czcionki rozgrywki Control do miejsca (zgłoszone: przy żadnych
// proporcjach okna nie może pojawić się przewijanie ani niewidoczna treść,
// a pytania nie wolno skracać "…", bo prowadzący czasem czyta je sam).
//
// Bazowa wielkość rośnie z oknem (--c2-fs w index.html). Tu każda grupa
// podobnych elementów dostaje wspólną skalę (0.5–1): największą, przy której
// wszystkie jej elementy mieszczą się w swoich polach. Wspólna skala trzyma
// równe napisy w kaflach jednego rodzaju zamiast każdy w innym rozmiarze.

const MIN_SCALE = 0.5;
const STEPS = 7;

// Selektory grup -- kolejność bez znaczenia, grupy są niezależne.
const GROUPS = [
  ".c2-stepper-question",
  ".c2-entryrow > .c2-entrytile:not(.c2-entrytile-input)",
  ".c2-entryrow > .c2-entrytile-input, .c2-entryrow > .c2-btn-repeat",
  ".c2-tilegrid > .c2-tile, .c2-tilegrid > .c2-mapinput, .c2-tilegrid > .c2-entrytile, .c2-timer-row",
  ".c2-roundlayout-side",
  ".c2-statusbar",
];

function overflows(el) {
  if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) return true;
  // Elementy wewnątrz, które same ucinają treść (overflow:hidden), też się liczą.
  for (const child of el.querySelectorAll("*")) {
    if (child.tagName === "INPUT" || child.tagName === "TEXTAREA") continue;
    if (child.scrollHeight > child.clientHeight + 1 || child.scrollWidth > child.clientWidth + 1) {
      const style = getComputedStyle(child);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") return true;
    }
  }
  return false;
}

function fitGroup(elements) {
  if (!elements.length) return;
  for (const el of elements) el.style.fontSize = "";
  const base = elements.map((el) => parseFloat(getComputedStyle(el).fontSize));
  const apply = (scale) => elements.forEach((el, i) => { el.style.fontSize = `${(base[i] * scale).toFixed(2)}px`; });
  const fits = () => !elements.some(overflows);
  apply(1);
  if (fits()) { for (const el of elements) el.style.fontSize = ""; return; }
  let lo = MIN_SCALE, hi = 1;
  for (let i = 0; i < STEPS; i++) {
    const mid = (lo + hi) / 2;
    apply(mid);
    if (fits()) lo = mid; else hi = mid;
  }
  apply(lo);
}

export function fitGameplayText(root) {
  const card = root.querySelector(".c2-gameplay-card");
  if (!card) return;
  for (const selector of GROUPS) fitGroup([...card.querySelectorAll(selector)]);
}

// Ponowne dopasowanie przy zmianie rozmiaru okna i po wczytaniu czcionek.
export function watchGameplayText(root) {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; fitGameplayText(root); });
  };
  new ResizeObserver(schedule).observe(root);
  document.fonts?.ready.then(schedule);
  return schedule;
}
