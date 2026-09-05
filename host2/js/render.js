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

    setPane1(`Odsłanianie — Gracz ${round}\n\nPytanie ${idx + 1}: ${question?.text || ""}`);

    const lines = [];
    if (round === 2) {
      const p1Text = f.runtime.p1[idx]?.text || "";
      lines.push(`Gracz 1: ${p1Text || "—"}`, "");
    }
    if (!rep && input) lines.push(`Wprowadzono: ${input}`);
    let status;
    if (rep) status = "POWTÓRZENIE";
    else if (!input) status = "PUSTO";
    else if (row1.kind === "MATCH" && row1.matchId) status = "TRAFIONE";
    else status = "BRAK";
    lines.push(`Status: ${status}`, "");
    lines.push("Możliwe odpowiedzi:");
    const sorted = (question?.answers || []).slice().sort((a, b) => b.fixed_points - a.fixed_points);
    for (const a of sorted) {
      const marker = row1.kind === "MATCH" && row1.matchId === a.id ? "✓ " : "  ";
      lines.push(`${marker}${a.text} (${a.fixed_points})`);
    }
    setPane2(lines.join("\n"));
  }

  function renderFinalEntry(row, round) {
    const f = row.detail.final;
    setPane1(`Finał — Gracz ${round}, wpisywanie odpowiedzi`);
    const lines = (f.questions || []).map((q, i) => `${i + 1}. ${q.text}`);
    setPane2(lines.join("\n"));
  }

  function renderFinal(row) {
    const step = row.step;
    if (step === "f_p1_entry") return renderFinalEntry(row, 1);
    if (step === "f_p2_entry") return renderFinalEntry(row, 2);
    if (step.startsWith("f_p1_map_q")) return renderFinalMapping(row, 1, Number(step.slice(-1)) - 1);
    if (step.startsWith("f_p2_map_q")) return renderFinalMapping(row, 2, Number(step.slice(-1)) - 1);
    setPane1("Finał");
    setPane2("");
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
