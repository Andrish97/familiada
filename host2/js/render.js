// host2/js/render.js
// Host "jest głupi" jak Display — tylko wyświetla tekst + zasłania/odsłania
// pasmo 2, bez żadnej własnej logiki gry. W odróżnieniu od Display nie ma
// osobnego "silnika rysowania" — to zwykłe operacje DOM (patrz plan,
// sekcja 5: "tu cały plik jest prostszy").
//
// Zasada z planu (sekcja 2a): Host NIGDY nie pokazuje banku, X, timera ani
// wskaźnika kontroli — tylko tytuł/pytanie (pasmo 1) i listę odpowiedzi z
// podświetleniem odkrytych (pasmo 2).
//
// Zasłona pasma 2 (cover2): authoritative source to detail.host.covered
// (Control decyduje KIEDY w ogóle coś jest do zasłonięcia — finał). Ręczne
// odsłonięcie przez gest przesunięcia na tablecie prowadzącego to WYŁĄCZNIE
// lokalny podgląd (peek) — nigdy nie zapisuje się do game_state, bo to nie
// jest fakt o grze, tylko wygoda tego jednego urządzenia. Każda nowa zmiana
// stanu (nowy wiersz) resetuje peek z powrotem do authoritative wartości.
//
// i18n: cały tekst pasma 1/2 idzie przez t() z tych samych kluczy co dawniej
// control/js/gameRounds.js's roundsHost()/control/js/gameFinal.js's
// finalHost() (translation/{pl,en,uk}.js) — audyt znalazł, że ten plik miał
// to wcześniej na sztywno po polsku, więc zmiana języka w Control (patrz
// shared/gameStateShape.js's settings.uiLang) nie miała żadnego wpływu na
// treść, którą prowadzący faktycznie czyta.
import { t } from "../../translation/translation.js?v=v2026-09-05T19503";

const $ = (id) => document.getElementById(id);
const rh = (key, vars) => t(`control.roundsHost.${key}`, vars);
const fh = (key, vars) => t(`control.finalHost.${key}`, vars);
const fu = (key, vars) => t(`control.finalUi.${key}`, vars);

// control/js/gameRounds.js's hostAnswersLines(): prowadzący widzi PEŁNĄ
// treść i punkty KAŻDEJ odpowiedzi od razu, niezależnie od tego, czy jest
// już odsłonięta dla widzów — inaczej nie mógłby ocenić, czy to, co
// powiedział kontestant, w ogóle pasuje do listy. Odsłonięcie zmienia tam
// tylko kolor (kosmetyka, pominięta — patrz komentarz przy renderFinalMapping);
// tu zamiast koloru: znacznik "✓" (ten sam styl co w renderFinalMapping niżej).
// Naprawiona luka: wcześniejsza wersja chowała tekst i punkty pod "______"
// aż do odsłonięcia, co w praktyce robiłoby ekran Prowadzącego bezużytecznym.
function answerLine(ord, text, pts, revealed) {
  const marker = revealed ? "✓ " : "  ";
  return `${marker}${ord}) ${text} (${pts})`;
}

export function createHostRenderer() {
  const paperText1 = $("paperText1");
  const paperText2 = $("paperText2");
  const cover2 = $("cover2");

  let authoritativeCovered = false;
  let peeked = false;
  let timerHandle = null;

  function stopTimerTick() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }

  function applyCover() {
    const covered = authoritativeCovered && !peeked;
    cover2?.classList.toggle("coverOn", covered);
    cover2?.classList.toggle("coverOff", !covered);
  }

  function setPane1(text) { if (paperText1) paperText1.textContent = text; }
  function setPane2(text) { if (paperText2) paperText2.textContent = text; }

  // control/js/gameRounds.js's hostTitleForRounds() — dokładnie te same 4
  // warianty tytułu wg fazy (translation/pl.js's roundTitle*). Pominięty:
  // stary system miał piąty, przejściowy wariant "POJEDYNEK" trwający
  // ułamek sekundy tuż po rozstrzygnięciu pojedynku (duel.enabled=false na
  // chwilę przed zmianą fazy) — bez odpowiednika w nowym silniku (nie ma
  // takiej przejściowej flagi), więc cały czas trwania DUEL pokazuje
  // "PRZYCISK", tak jak widoczna jest niemal cała reszta tego czasu i tak.
  function roundTitle(row) {
    const rn = row.detail.rounds.roundNo;
    switch (row.phase) {
      case "DUEL": return rh("roundTitleDuelBuzzer", { round: rn });
      case "PLAY": return rh("roundTitlePlay", { round: rn });
      case "STEAL": return rh("roundTitleSteal", { round: rn });
      case "REVEAL": return rh("roundTitleReveal", { round: rn });
      default: return rh("roundTitleDefault", { round: rn });
    }
  }

  function renderRounds(row) {
    const r = row.detail.rounds;
    setPane1(`${roundTitle(row)}\n\n${r.question?.text || ""}`);
    const lines = (r.answers || [])
      .slice()
      .sort((a, b) => a.ord - b.ord)
      .map((a) => answerLine(a.ord, a.text, a.fixed_points, (r.revealed || []).includes(a.ord)));
    setPane2(lines.join("\n"));
  }

  // Dokładnie ten sam zestaw informacji co dzisiejsze gameFinal.js's
  // hostMappingLeft/hostMappingRight (pytanie, co wpisał gracz, status
  // dopasowania, pełna lista możliwych odpowiedzi z zaznaczoną trafioną) —
  // bez kolorowego formatowania (to kosmetyka), ale ta sama treść.
  function renderFinalMapping(row, round, idx) {
    const f = row.detail.final;
    const question = f.questions?.[idx];
    const mapArr = f.runtime[round === 1 ? "map1" : "map2"];
    const row1 = mapArr[idx] || {};
    const entryKey = round === 1 ? "p1" : "p2";
    const input = (f.runtime[entryKey][idx]?.text || "").trim();
    const rep = round === 2 && f.runtime.p2[idx]?.repeat === true;

    const title = round === 1 ? fh("titleRevealRound1") : fh("titleRevealRound2");
    setPane1(`${title}\n\n${fh("questionLabel", { n: idx + 1 })}: ${question?.text || ""}`);

    const lines = [];
    if (round === 2) {
      const p1Text = f.runtime.p1[idx]?.text || "";
      lines.push(`${fh("player1Label")}: ${p1Text || fu("fallbackAnswer")}`, "");
    }
    if (!rep && input) lines.push(`${fh("enteredLabel")}: ${input}`);
    let status;
    if (rep) status = fh("statusRepeat");
    else if (!input) status = fh("statusEmpty");
    else if (row1.kind === "MATCH" && row1.matchId) status = fh("statusMatch");
    else status = fh("statusMissing");
    lines.push(`${fh("statusLabel")}: ${status}`, "");
    lines.push(fh("answersListLabel"));
    const sorted = (question?.answers || []).slice().sort((a, b) => b.fixed_points - a.fixed_points);
    for (const a of sorted) {
      const marker = row1.kind === "MATCH" && row1.matchId === a.id ? "✓ " : "  ";
      lines.push(`${marker}${a.text} (${a.fixed_points})`);
    }
    setPane2(lines.join("\n"));
  }

  // control/js/gameFinal.js's hostEntryStatus(): per-pytanie status widoczny
  // NA ŻYWO w trakcie wpisywania (nie tylko przy odsłanianiu) — bez tego
  // prowadzący nie wie, które pytania gracz już wypełnił.
  function entryStatus(f, round, idx) {
    const key = round === 1 ? "p1" : "p2";
    const row = f.runtime[key][idx] || {};
    if (round === 2 && row.repeat === true) return fh("entryRepeat");
    return (row.text || "").trim().length > 0 ? fh("entryDone") : fh("entryEmpty");
  }

  function renderFinalEntry(row, round) {
    const f = row.detail.final;
    const timer = f.runtime?.timer;
    const phaseKey = round === 1 ? "P1" : "P2";
    const counting = timer?.running && timer.phase === phaseKey;
    const titleKey = round === 1 ? "titleRound1" : "titleRound2";
    const titleTimerKey = round === 1 ? "titleRound1Timer" : "titleRound2Timer";

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
      setPane1(fh(titleTimerKey, { seconds: remaining }));
      if (remaining <= 0) stopTimerTick();
    };
    if (counting) { tick(); timerHandle = setInterval(tick, 1000); }
    else setPane1(fh(titleKey));

    const lines = (f.questions || []).map((q, i) => `${i + 1}) ${q.text} — ${entryStatus(f, round, i)}`);
    setPane2(lines.join("\n"));
  }

  // control/js/gameFinal.js's hostUpdate(): kroki poza wpisywaniem/mapowaniem
  // (f_start, f_p2_start, f_end) czyszczą obie strony całkowicie (hostClearAll()),
  // nie pokazują żadnego zastępczego napisu.
  function renderFinal(row) {
    const step = row.step;
    if (step === "f_p1_entry") return renderFinalEntry(row, 1);
    if (step === "f_p2_entry") return renderFinalEntry(row, 2);
    if (step.startsWith("f_p1_map_q")) return renderFinalMapping(row, 1, Number(step.slice(-1)) - 1);
    if (step.startsWith("f_p2_map_q")) return renderFinalMapping(row, 2, Number(step.slice(-1)) - 1);
    setPane1("");
    setPane2("");
  }

  function render(row) {
    authoritativeCovered = !!row.detail?.host?.covered;
    peeked = false; // nowy stan resetuje podgląd
    stopTimerTick(); // nowy wiersz zastępuje ewentualny poprzedni tick jednorazowo w renderFinalEntry
    if (row.top_card === "rounds") renderRounds(row);
    else if (row.top_card === "final") renderFinal(row);
    else { setPane1(""); setPane2(""); }
    applyCover();
  }

  function setPeek(on) {
    peeked = !!on;
    applyCover();
  }

  function isCovered() { return authoritativeCovered && !peeked; }
  function isCoverableAtAll() { return authoritativeCovered; }

  return { render, setPeek, isCovered, isCoverableAtAll };
}
