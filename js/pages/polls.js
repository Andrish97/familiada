// js/pages/polls.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Sondaże są dostępne tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");
const msg = document.getElementById("msg");

const cardMain = document.getElementById("cardMain");
const cardEmpty = document.getElementById("cardEmpty");

const chipKind = document.getElementById("chipKind");
const chipStatus = document.getElementById("chipStatus");

const gName = document.getElementById("gName");
const gMeta = document.getElementById("gMeta");
const pollLinkEl = document.getElementById("pollLink");

const qrBox = document.getElementById("qr");

const btnCopy = document.getElementById("btnCopy");
const btnOpen = document.getElementById("btnOpen");
const btnOpenQr = document.getElementById("btnOpenQr");

const btnStart = document.getElementById("btnStart");
const btnClose = document.getElementById("btnClose");
const btnReopen = document.getElementById("btnReopen");

let game = null;

const RULES = { QN: 10, AN: 5 };

function setMsg(t) {
  if (!msg) return;
  msg.textContent = t || "";
  if (t) setTimeout(() => (msg.textContent = ""), 2000);
}

function pollLink(g) {
  const base = new URL("poll.html", location.href);
  base.searchParams.set("id", g.id);
  base.searchParams.set("key", g.share_key_poll);
  return base.toString();
}

function setChips(g) {
  if (chipKind) chipKind.textContent = g.kind === "poll" ? "SONDAŻOWA" : "LOKALNA";

  if (chipStatus) {
    chipStatus.className = "chip status";
    const st = g.status || "draft";
    chipStatus.textContent = st.toUpperCase();

    if (st === "ready") chipStatus.classList.add("ok");
    else if (st === "poll_open") chipStatus.classList.add("warn");
    else chipStatus.classList.add("bad");
  }
}

function clearQr() {
  if (qrBox) qrBox.innerHTML = "";
}

async function renderQr(link) {
  if (!qrBox) return;
  qrBox.innerHTML = "";
  try {
    // QRCode jest globalne z CDN (qrcode.min.js)
    await QRCode.toCanvas(link, { width: 160, margin: 1 }, (err, canvas) => {
      if (err) return;
      qrBox.appendChild(canvas);
    });
  } catch {
    clearQr();
  }
}

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status,share_key_poll")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

// Twarda zasada: 10 pytań i każde ma DOKŁADNIE 5 odpowiedzi.
async function pollSetupCheck(gid) {
  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id,ord")
    .eq("game_id", gid)
    .order("ord", { ascending: true });

  if (qErr) return { ok: false, reason: "Błąd wczytywania pytań." };
  if (!qs || qs.length < RULES.QN)
    return { ok: false, reason: `Za mało pytań: ${qs?.length || 0} / ${RULES.QN}.` };

  // bierzemy pierwsze 10 (reszta ignorowana)
  const ten = qs.slice(0, RULES.QN);

  for (const q of ten) {
    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("id")
      .eq("question_id", q.id);

    if (aErr) return { ok: false, reason: `Błąd wczytywania odpowiedzi (pytanie #${q.ord}).` };
    if (!ans || ans.length !== RULES.AN)
      return { ok: false, reason: `Pytanie #${q.ord} ma ${ans?.length || 0} / ${RULES.AN} odpowiedzi.` };
  }

  return { ok: true, reason: "" };
}

function setLinkUiVisible(on) {
  if (pollLinkEl) pollLinkEl.value = on ? pollLinkEl.value : "";
  btnCopy && (btnCopy.disabled = !on);
  btnOpen && (btnOpen.disabled = !on);
  btnOpenQr && (btnOpenQr.disabled = !on);
  if (!on) clearQr();
}

async function refresh() {
  if (!gameId) {
    cardMain && (cardMain.style.display = "none");
    cardEmpty && (cardEmpty.style.display = "");
    chipKind && (chipKind.textContent = "—");
    chipStatus && (chipStatus.textContent = "—");
    setMsg("Brak parametru id.");
    return;
  }

  game = await loadGame();

  // twardo: tylko dla poll
  if (game.kind !== "poll") {
    cardMain && (cardMain.style.display = "none");
    cardEmpty && (cardEmpty.style.display = "");
    setMsg("To nie jest gra sondażowa.");
    return;
  }

  setChips(game);

  cardEmpty && (cardEmpty.style.display = "none");
  cardMain && (cardMain.style.display = "");

  if (gName) gName.textContent = game.name || "Sondaż";
  if (gMeta)
    gMeta.textContent =
      "Link i QR pojawiają się tylko, gdy sondaż jest OTWARTY i gra spełnia zasady (10 pytań, 5 odpowiedzi).";

  // OFF domyślnie
  if (pollLinkEl) pollLinkEl.value = "";
  setLinkUiVisible(false);

  const st = game.status || "draft";
  const chk = await pollSetupCheck(game.id);

  // przyciski (bez crashy nawet jeśli elementów nie ma)
  btnStart && (btnStart.disabled = !chk.ok || st === "poll_open");
  btnClose && (btnClose.disabled = st !== "poll_open");
  btnReopen && (btnReopen.disabled = !chk.ok || st !== "ready");

  if (st === "poll_open" && chk.ok) {
    const link = pollLink(game);
    if (pollLinkEl) pollLinkEl.value = link;
    setLinkUiVisible(true);
    await renderQr(link);
    setMsg("");
  } else {
    setLinkUiVisible(false);

    if (!chk.ok) setMsg(chk.reason);
    else if (st === "ready") setMsg("Sondaż jest zamknięty (wyniki policzone). Możesz go otworzyć ponownie.");
    else setMsg("Sondaż jest nieaktywny — uruchom go, żeby pokazać link i QR.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const u = await requireAuth("index.html");
  if (who) who.textContent = u?.email || "—";

  btnBack?.addEventListener("click", () => (location.href = "builder.html"));
  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnCopy?.addEventListener("click", async () => {
    if (!pollLinkEl?.value) return;
    try {
      await navigator.clipboard.writeText(pollLinkEl.value);
      setMsg("Skopiowano link sondażu.");
    } catch {
      setMsg("Nie udało się skopiować.");
    }
  });

  btnOpen?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    window.open(pollLinkEl.value, "_blank", "noopener,noreferrer");
  });

  btnOpenQr?.addEventListener("click", () => {
    if (!pollLinkEl?.value) return;
    const u = new URL("poll-qr.html", location.href);
    u.searchParams.set("url", pollLinkEl.value);
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  });

  btnStart?.addEventListener("click", async () => {
    if (!game) return;

    const chk = await pollSetupCheck(gameId);
    if (!chk.ok) {
      setMsg(chk.reason);
      return;
    }

    const ok = await confirmModal({
      title: "Uruchomić sondaż?",
      text: `Uruchomić sondaż dla "${game.name}"?`,
      okText: "Uruchom",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    try {
      await sb().rpc("poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
      setMsg("Sondaż uruchomiony.");
      await refresh();
    } catch (e) {
      console.error("[polls] open error:", e);
      alert("Nie udało się uruchomić sondażu. Sprawdź konsolę.");
    }
  });

  btnReopen?.addEventListener("click", async () => {
    if (!game) return;

    const chk = await pollSetupCheck(gameId);
    if (!chk.ok) {
      setMsg(chk.reason);
      return;
    }

    const ok = await confirmModal({
      title: "Otworzyć ponownie?",
      text: "Otworzyć sondaż ponownie? Utworzy nową sesję głosowania (stare głosy zostają w historii).",
      okText: "Otwórz ponownie",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    try {
      await sb().rpc("poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
      setMsg("Sondaż otwarty ponownie.");
      await refresh();
    } catch (e) {
      console.error("[polls] reopen error:", e);
      alert("Nie udało się otworzyć ponownie. Sprawdź konsolę.");
    }
  });

  btnClose?.addEventListener("click", async () => {
    if (!game) return;

    const ok = await confirmModal({
      title: "Zakończyć sondaż?",
      text: "Zamknąć sondaż i przeliczyć punkty do 100 (0 głosów => min 1 pkt)?",
      okText: "Zakończ",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    try {
      await sb().rpc("poll_close_and_normalize", { p_game_id: gameId, p_key: game.share_key_poll });
      setMsg("Sondaż zamknięty. Gra gotowa do zagrania.");
      await refresh();
    } catch (e) {
      console.error("[polls] close error:", e);
      alert("Nie udało się zamknąć sondażu. Sprawdź konsolę.");
    }
  });

  await refresh();
});
