function nInt(v, def = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : def;
}

function repeatChar(ch, n) {
  let out = "";
  for (let i = 0; i < n; i++) out += ch;
  return out;
}

const PLACE = {
  roundsText: repeatChar("…", 17),
  roundsPts: "——",
  roundsSumaStart: "00",
};

function fmtTripletPoints(val) {
  const x = Math.max(0, nInt(val, 0));
  return String(x).slice(0, 3).padStart(3, "0");
}

function escapeForQuotedCommand(raw) {
  return String(raw ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r\n", "\n");
}

export function createDisplayDriver({ devices }) {
  const disp = (line) => devices.sendDisplay(line);

  async function setTeamsLongs(teamA, teamB) {
    await disp(`LONG1 "${escapeForQuotedCommand(teamA)}"`);
    await disp(`LONG2 "${escapeForQuotedCommand(teamB)}"`);
  }

  async function gameReady({ teamA, teamB }) {
    await disp("MODE GRA");
    await disp("MODE BLANK");
    await setTeamsLongs(teamA, teamB);

    // triplet pusty = nic (Twoja zasada)
    await disp(`TOP ""`);
    await disp(`LEFT ""`);
    await disp(`RIGHT ""`);
  }

  async function introLogo() {
    await disp("MODE GRA");
    await disp("LOGO ANIMIN rain right 80");
  }

  async function hideBoardRainLeft() {
    await disp("HIDE ANIMOUT rain left 80");
  }

  async function roundTransitionIn({ answersCount }) {
    const n = Math.max(1, Math.min(6, nInt(answersCount, 6)));

    await disp("MODE GRA"); // ważne: logo/scene tylko w GRA
    await hideBoardRainLeft();

    // RBATCH: wysyłamy tylko tyle rzędów ile istnieje (R1..Rn). Reszty NIE MA.
    const rows = [];
    for (let i = 1; i <= n; i++) {
      rows.push(`R${i} "${PLACE.roundsText}" ${PLACE.roundsPts}`);
    }

    const cmd =
      `RBATCH SUMA ${PLACE.roundsSumaStart} ` +
      rows.join(" ") +
      ` ANIMIN edge top 20`;

    await disp(cmd);

    // triplet punkty = 000/000/000
    await disp(`TOP "${fmtTripletPoints(0)}"`);
    await disp(`LEFT "${fmtTripletPoints(0)}"`);
    await disp(`RIGHT "${fmtTripletPoints(0)}"`);
  }

  return {
    gameReady,
    introLogo,
    hideBoardRainLeft,
    roundTransitionIn,
  };
}
