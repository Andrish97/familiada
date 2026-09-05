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

const $ = (id) => document.getElementById(id);

function answerLine(ord, text, revealed) {
  return revealed ? `${ord}. ${text}` : `${ord}. ______`;
}

export function createHostRenderer() {
  const paperText1 = $("paperText1");
  const paperText2 = $("paperText2");
  const cover2 = $("cover2");

  let authoritativeCovered = false;
  let peeked = false;

  function applyCover() {
    const covered = authoritativeCovered && !peeked;
    cover2?.classList.toggle("coverOn", covered);
    cover2?.classList.toggle("coverOff", !covered);
  }

  function setPane1(text) { if (paperText1) paperText1.textContent = text; }
  function setPane2(text) { if (paperText2) paperText2.textContent = text; }

  function renderRounds(row) {
    const r = row.detail.rounds;
    setPane1(`Runda ${r.roundNo}\n\n${r.question?.text || ""}`);
    const lines = (r.answers || [])
      .slice()
      .sort((a, b) => a.ord - b.ord)
      .map((a) => answerLine(a.ord, a.text, (r.revealed || []).includes(a.ord)));
    setPane2(lines.join("\n"));
  }

  function renderFinal(row) {
    const f = row.detail.final;
    const isP2 = row.step.startsWith("f_p2");
    const round = isP2 ? 2 : 1;
    const entries = f.runtime[isP2 ? "p2" : "p1"] || [];
    const mapRows = f.runtime[isP2 ? "map2" : "map1"] || [];
    setPane1(`Finał — Gracz ${round}`);
    const lines = entries.map((entry, i) => {
      const mapped = mapRows[i];
      const typed = entry?.text || "";
      const status = mapped?.revealedAnswer ? "✓" : "…";
      return `${i + 1}. [${status}] ${typed}`;
    });
    setPane2(lines.join("\n"));
  }

  function render(row) {
    authoritativeCovered = !!row.detail?.host?.covered;
    peeked = false; // nowy stan resetuje podgląd
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
