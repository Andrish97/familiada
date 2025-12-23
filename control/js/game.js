//familiada/control/js/game.js
const $ = (id) => document.getElementById(id);

function setMsg(setter, text) {
  try { setter?.(text || ""); } catch {}
}

export function createGameUI({ display, setMsgGame }) {
  const teamA = $("teamA");
  const teamB = $("teamB");
  const btnGameReady = $("btnGameReady");

  const btnIntroLogo = $("btnIntroLogo");

  const roundAnsCnt = $("roundAnsCnt");
  const btnRoundIn = $("btnRoundIn");

  btnGameReady?.addEventListener("click", async () => {
    try {
      const a = String(teamA?.value ?? "").trim();
      const b = String(teamB?.value ?? "").trim();

      await display.gameReady({ teamA: a, teamB: b });
      setMsg(setMsgGame, "Wysłano: GAME_READY");
    } catch (e) {
      setMsg(setMsgGame, e?.message || String(e));
    }
  });

  btnIntroLogo?.addEventListener("click", async () => {
    try {
      await display.introLogo();
      setMsg(setMsgGame, "Wysłano: GAME_INTRO (logo)");
    } catch (e) {
      setMsg(setMsgGame, e?.message || String(e));
    }
  });

  btnRoundIn?.addEventListener("click", async () => {
    try {
      const n = Number.parseInt(String(roundAnsCnt?.value ?? ""), 10);
      await display.roundTransitionIn({ answersCount: n });
      setMsg(setMsgGame, `Wysłano: ROUND_TRANSITION_IN (odpowiedzi: ${Math.max(1, Math.min(6, n || 6))})`);
    } catch (e) {
      setMsg(setMsgGame, e?.message || String(e));
    }
  });
}
