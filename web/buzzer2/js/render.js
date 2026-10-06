// buzzer2/js/render.js
// Stan przycisku wyprowadzony CAŁKOWICIE z game_state — brak własnego
// device_state (dzisiejsze teamA/teamB/state były osobno persystowane;
// tu kolory zespołów i tak są już w detail.display.colors, więc nic więcej
// nie trzeba trzymać per-urządzenie).

const $ = (id) => document.getElementById(id);

export const STATE = { OFF: "OFF", ON: "ON", PUSHED_A: "PUSHED_A", PUSHED_B: "PUSHED_B" };

// OFF ("czarny ekran") TYLKO przed rozpoczęciem gry: zanim JAKIKOLWIEK
// pojedynek w tej grze się w ogóle zaczął (duel.enabled ustawiane na true
// dopiero przy PIERWSZYM wejściu w r_duel — web/js/gameplay/gameStateShape.js's
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
// czarnego. duel.firstTeam (POTWIERDZONY zwycięzca pojedynku, patrz
// engine.js's ACCEPT_BUZZ) trzyma się w state przez całą resztę rundy —
// dlatego poniższa funkcja woli je, gdy jest ustawione. PRZED
// potwierdzeniem jedyny sygnał to duel.lastPressed (surowe zdarzenie
// naciśnięcia) — patrz poprawka niżej, to pole NIE jest ignorowane.
// Zgłoszone (nagranie): "naciskają, zaświeca ten który pierwszy nacisnął
// [...] operator to widzi i zatwierdza" — realny bug, nie coś do samej
// weryfikacji. Ta funkcja czytała WYŁĄCZNIE `firstTeam` (ustawiane
// dopiero przez ACCEPT_BUZZ, czyli PO potwierdzeniu operatora) — surowe
// naciśnięcie (`lastPressed`, zapisywane bezpośrednio przez
// `game_state_buzzer_press`, zanim operator cokolwiek kliknie) było
// całkowicie ignorowane. `/buzzer2/js/main.js`'s `press()` woła
// `renderer.render(data)` z komentarzem "przycisk pokazuje PUSHED_x od
// razu" — ale przy starym kodzie to nigdy nie było prawdą: `derive
// ButtonState` i tak zwracał `ON` (nic nie świeci), dopóki operator nie
// zatwierdził. Stary (nie-v2) `/buzzer/js/buzzer.js`'s `press()` miał to
// poprawnie — lokalny, optymistyczny `show(PUSHED_x)` natychmiast po
// kliknięciu, zanim nawet broadcast do Control odleciał.
// Naprawione: `lastPressed` jako fallback, gdy `firstTeam` jeszcze nie
// jest ustawione — światło zapala się od razu po naciśnięciu, nie czeka
// na operatora. `firstTeam` ma pierwszeństwo (gdy już ustawione, zawsze
// zgadza się z `lastPressed` tej samej rundy — ACCEPT_BUZZ nigdy nie
// zmienia `lastPressed`), więc światło zostaje dokładnie tej samej
// drużyny przez całą resztę rundy, bez żadnego mignięcia przy
// potwierdzeniu. "Ponów naciśnięcie" (RETRY_DUEL) czyści `lastPressed`
// na `null` tylko, gdy `firstTeam` wciąż nie jest ustawione — światło
// poprawnie gaśnie (wraca do `ON`), jeśli operator odrzuci zgłoszenie
// przed zatwierdzeniem.
export function deriveButtonState(row) {
  if (row.top_card !== "rounds") return STATE.OFF;
  if (row.detail.settings?.physicalBuzzer) return STATE.OFF;
  const duel = row.detail.rounds?.duel;
  if (!duel?.enabled) return row.step === "r_intro" || row.step === "r_roundStart" ? STATE.ON : STATE.OFF;
  const pressed = duel.firstTeam || duel.lastPressed;
  if (!pressed) return STATE.ON;
  return pressed === "A" ? STATE.PUSHED_A : STATE.PUSHED_B;
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

  function render(row, pressedTeam = null) {
    applyColors(row.detail?.display?.colors);
    const confirmed = deriveButtonState(row);
    const state = confirmed === STATE.ON && pressedTeam
      ? (pressedTeam === "A" ? STATE.PUSHED_A : STATE.PUSHED_B) : confirmed;
    show(state);
    // Migracja 264 -- blokada w bazie (game_state.locked_until, ustawiana
    // przez Control PO każdym przejściu z dźwiękiem/animacją, np.
    // "Rozpocznij rundę") nie jest częścią deriveButtonState() (ta liczy
    // WYŁĄCZNIE z logiki pojedynku -- duel.enabled/firstTeam) -- bez tego
    // przycisk pokazywał się jako klikalny (ON) już w momencie, gdy
    // duel.enabled stało się true, czyli ZANIM animacja wjazdu planszy
    // faktycznie dograła. Kontestant (albo test) klikający w tym oknie
    // dostawał ciche odrzucenie z bazy (kod "locked") -- przycisk
    // wyglądał na aktywny, ale nic się nie działo. Nie zmieniamy samego
    // stanu (ON zostaje ON, nie OFF -- to nie jest "gra jeszcze się nie
    // zaczęła", tylko "za wcześnie o ułamek sekundy"), tylko dokładamy
    // disabled na czas blokady.
    if (state === STATE.ON && (isLockedRow(row) || row.step !== "r_duel" || !row.detail?.rounds?.duel?.enabled)) {
      if (btnA) btnA.disabled = true;
      if (btnB) btnB.disabled = true;
    }
  }

  return { render };
}

// Wystawione osobno -- buzzer2/js/main.js's press() sprawdza to samo PRZED
// wystrzeleniem RPC (żeby nie czekać na sieciowe odrzucenie, skoro wynik
// znany jest już lokalnie) i planuje ponowny render() dokładnie w chwili,
// gdy blokada naturalnie wygasa (serwer nie dzwoni WCALE po
// game_state_set_lock -- patrz komentarz w control2/js/store.js's
// setLockNow -- więc bez własnego zegarka przycisk zostałby disabled aż do
// KOLEJNEGO, niepowiązanego zapisu w grze).
export function isLockedRow(row) {
  if (row?.display_animation_pending) return true;
  const until = row?.locked_until;
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}
