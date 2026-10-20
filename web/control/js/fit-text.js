// Zabezpieczenie czcionki rozgrywki Control (decyzja 2026-10-20): przy żadnych
// proporcjach okna nie może pojawić się przewijanie ani niewidoczna treść,
// a pytań nie wolno skracać "…", bo prowadzący czasem czyta je sam.
//
// Wielkość czcionki wynika z okna (--c2-fs w index.html) i jest dobrana tak,
// żeby najgorszy przypadek w limitach bazy mieścił się bez tej pomocy. Gdyby
// treść mimo to się nie mieściła (np. starsze, dłuższe pytania), cała karta
// rozgrywki dostaje jedną wspólną skalę (--c2-fit, 0.5–1): największą, przy
// której wszystko jest widoczne -- nigdy jeden kafel mniejszy od reszty.

const MIN_SCALE = 0.5;
const STEPS = 7;

// Pola, których treść musi zmieścić się w całości.
const BOXES = ".c2-stepper-question, .c2-tile, .c2-entrytile, .c2-btn-repeat, .c2-mapinput, .c2-roundlayout-side, .c2-statusbar, .c2-statusbar > span, .c2-gameplay-body";

function overflows(card) {
  for (const el of card.querySelectorAll(BOXES)) {
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) return true;
  }
  // Elementy, które same ucinają treść (overflow inny niż visible), też się liczą.
  for (const el of card.querySelectorAll(".c2-gameplay-body *, .c2-stepper *")) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") continue;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
      const style = getComputedStyle(el);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") return true;
    }
  }
  return false;
}

export function fitGameplayText(root) {
  const card = root.querySelector(".c2-gameplay-card");
  if (!card) return;
  card.style.removeProperty("--c2-fit");
  if (!overflows(card)) return;
  let lo = MIN_SCALE, hi = 1;
  for (let i = 0; i < STEPS; i++) {
    const mid = (lo + hi) / 2;
    card.style.setProperty("--c2-fit", String(mid));
    if (overflows(card)) hi = mid; else lo = mid;
  }
  card.style.setProperty("--c2-fit", String(lo));
}

// Ponowne sprawdzenie przy zmianie rozmiaru okna i po wczytaniu czcionek.
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
