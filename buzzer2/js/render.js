// buzzer2/js/render.js
// Stan przycisku wyprowadzony CAŁKOWICIE z game_state — brak własnego
// device_state (dzisiejsze teamA/teamB/state były osobno persystowane;
// tu kolory zespołów i tak są już w detail.display.colors, więc nic więcej
// nie trzeba trzymać per-urządzenie).

const $ = (id) => document.getElementById(id);

export const STATE = { OFF: "OFF", ON: "ON", PUSHED_A: "PUSHED_A", PUSHED_B: "PUSHED_B" };

// OFF ("czarny ekran") TYLKO przed rozpoczęciem gry: zanim JAKIKOLWIEK
// pojedynek w tej grze się w ogóle zaczął (duel.enabled ustawiane na true
// dopiero przy PIERWSZYM wejściu w r_duel — shared/gameStateShape.js's
// domyślne duel.enabled=false — i NIGDY nie wraca do false aż do "Zacznij
// od nowa"), przez cały Finał (top_card="final" — Buzzer w finale
// nieużywany: control/js/gameFinal.js's startFinal() wysyła jedyne "OFF"
// w całym finale i nic już go z powrotem nie włącza) oraz w trybie
// physicalBuzzer (urządzenie w ogóle pominięte).
//
// Odtąd widoczne PRZEZ CAŁĄ resztę rundy/gry — NIE tylko w literalnym
// kroku "r_duel". ACCEPT_BUZZ (engine.js) przenosi step na "r_play"
// NATYCHMIAST po przyjęciu zgłoszenia, ale stary control/js/gameRounds.js
// po ACCEPT_BUZZ nigdy więcej nie woła sendBuzzerCmd aż do NASTĘPNEGO
// pojedynku (grep potwierdzony: "ON" tylko przy wejściu w r_duel, "RESET"+
// "ON" tylko po pełnym reset cyklu) — Buzzer zostaje zapalony/przygaszony
// (PUSHED_<zwycięzca>) przez całą resztę PLAY/STEAL/REVEAL, nie gaśnie do
// czarnego. duel.firstTeam (nie lastPressed — to surowe zdarzenie
// naciśnięcia, firstTeam to POTWIERDZONY zwycięzca pojedynku, patrz
// engine.js's ACCEPT_BUZZ) trzyma się w state przez całą resztę rundy,
// więc to jest właściwe pole do jednoznacznego odczytu tego stanu.
export function deriveButtonState(row) {
  if (row.top_card !== "rounds") return STATE.OFF;
  if (row.detail.settings?.physicalBuzzer) return STATE.OFF;
  const duel = row.detail.rounds?.duel;
  if (!duel?.enabled) return STATE.OFF;
  if (!duel.firstTeam) return STATE.ON;
  return duel.firstTeam === "A" ? STATE.PUSHED_A : STATE.PUSHED_B;
}

export function createButtonRenderer() {
  const offScreen = $("offScreen");
  const arena = $("arena");
  const btnA = $("btnA");
  const btnB = $("btnB");

  // js/pages/buzzer.js's derivePalette()/parseHexToRgb()/mixRgb() — css/buzzer.css
  // maluje przycisk (gradient + glow) wyłącznie z --team-X-hi/-lo/--glow-X, NIE
  // z gołego --team-a/--team-b, więc bez przeliczenia tych trzech pochodnych
  // niestandardowy kolor drużyny (z ustawień gry) nigdy nie dotrze do przycisku
  // — wcześniej ustawiano tu tylko --team-a/--team-b, co wizualnie nic nie robiło.
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function parseHexToRgb(hex) {
    let h = String(hex).trim();
    if (!h.startsWith("#")) return null;
    h = h.slice(1);
    if (h.length === 3) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
    if (h.length === 6 || h.length === 8) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    return null;
  }
  function rgbToHex({ r, g, b }) {
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  }
  function mixRgb(a, b, t) {
    t = clamp01(t);
    const lerp = (x, y) => Math.round(x + (y - x) * t);
    return { r: lerp(a.r, b.r), g: lerp(a.g, b.g), b: lerp(a.b, b.b) };
  }
  function derivePalette(baseColor) {
    const rgb = parseHexToRgb(baseColor);
    if (!rgb) return { hi: baseColor, lo: baseColor, glowRgba: "rgba(255,255,255,.35)" };
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    const hi = rgbToHex(mixRgb(rgb, white, 0.25));
    const lo = rgbToHex(mixRgb(rgb, black, 0.45));
    return { hi, lo, glowRgba: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .35)` };
  }

  function applyColors(colors) {
    if (!colors) return;
    const root = document.documentElement;
    if (colors.A) {
      root.style.setProperty("--team-a", colors.A);
      const pa = derivePalette(colors.A);
      root.style.setProperty("--team-a-hi", pa.hi);
      root.style.setProperty("--team-a-lo", pa.lo);
      root.style.setProperty("--glow-a", pa.glowRgba);
    }
    if (colors.B) {
      root.style.setProperty("--team-b", colors.B);
      const pb = derivePalette(colors.B);
      root.style.setProperty("--team-b-hi", pb.hi);
      root.style.setProperty("--team-b-lo", pb.lo);
      root.style.setProperty("--glow-b", pb.glowRgba);
    }
  }

  function show(state) {
    const isOff = state === STATE.OFF;
    if (offScreen) offScreen.hidden = !isOff;
    if (arena) arena.hidden = isOff;

    btnA?.classList.remove("lit", "dim");
    btnB?.classList.remove("lit", "dim");
    if (btnA) btnA.disabled = true;
    if (btnB) btnB.disabled = true;
    if (isOff) return;

    if (state === STATE.ON) {
      if (btnA) btnA.disabled = false;
      if (btnB) btnB.disabled = false;
      btnA?.classList.add("dim");
      btnB?.classList.add("dim");
      return;
    }
    if (state === STATE.PUSHED_A) { btnA?.classList.add("lit"); btnB?.classList.add("dim"); return; }
    if (state === STATE.PUSHED_B) { btnB?.classList.add("lit"); btnA?.classList.add("dim"); }
  }

  function render(row) {
    applyColors(row.detail?.display?.colors);
    show(deriveButtonState(row));
  }

  return { render };
}
