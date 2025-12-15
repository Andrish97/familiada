// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");

const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");
const hint = document.getElementById("hint");

const typeOverlay = document.getElementById("typeOverlay");
const btnCreateFixed = document.getElementById("btnCreateFixed");
const btnCreatePoll = document.getElementById("btnCreatePoll");
const btnCancelType = document.getElementById("btnCancelType");

let currentUser = null;
let games = [];
let selectedGame = null; // cały rekord

function setHint(t) {
  if (hint) hint.textContent = t || "";
}

function openTypeModal() {
  typeOverlay.style.display = "";
}

function closeTypeModal() {
  typeOverlay.style.display = "none";
}

function syncActions() {
  const hasSel = !!selectedGame;

  // Edytuj: tylko gdy coś wybrane + dodatkowo blokada gdy sondaż otwarty
  btnEdit.disabled = !hasSel || (selectedGame?.kind === "poll" && selectedGame?.status === "poll_open");

  // Graj: tylko gdy coś wybrane + jeśli poll to musi być ready
  btnPlay.disabled = !hasSel || (selectedGame?.kind === "poll" && selectedGame?.status !== "ready");

  // Sondaż: tylko gdy coś wybrane + tylko dla kind=poll
  btnPoll.disabled = !hasSel || (selectedGame?.kind !== "poll");

  if (!hasSel) {
    setHint("Kliknij kafelek, żeby go zaznaczyć.");
    return;
  }

  if (selectedGame.kind === "poll") {
    const st = selectedGame.status || "draft";
    if (st === "poll_open") setHint(`Wybrano: ${selectedGame.name} (sondażowa • OTWARTY)`);
    else if (st === "ready") setHint(`Wybrano: ${selectedGame.name} (sondażowa • GOTOWA)`);
    else setHint(`Wybrano: ${selectedGame.name} (sondażowa • szkic)`);
  } else {
    setHint(`Wybrano: ${selectedGame.name} (lokalna)`);
  }
}

function clearSelection() {
  selectedGame = null;
  document.querySelectorAll(".card").forEach((c) => c.classList.remove("selected"));
  syncActions();
}

function selectCard(el, g) {
  document.querySelectorAll(".card").forEach((c) => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedGame = g;
  syncActions();
}

function cardGame(g) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <div class="x" title="Usuń">✕</div>
    <div class="name"></div>
    <div class="meta"></div>
  `;
  el.querySelector(".name").textContent = g.name;

  const meta =
    g.kind === "poll"
      ? `Sondażowa • status: ${(g.status || "draft")}`
      : "Lokalna • podane wartości";
  el.querySelector(".meta").textContent = meta;

  el.addEventListener("click", () => selectCard(el, g));

  el.querySelector(".x").addEventListener("click", async (e) => {
    e.stopPropagation();

    const ok = await confirmModal({
      title: "Usuń Familiadę",
      text: `Na pewno usunąć "${g.name}"? Tego nie da się łatwo odkręcić.`,
      okText: "Usuń",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    const { error } = await sb().from("games").delete().eq("id", g.id);
    if (error) {
      console.error("[builder] delete error:", error);
      alert("Nie udało się usunąć. Sprawdź konsolę.");
      return;
    }

    await refresh();
  });

  return el;
}

function cardPlus() {
  const el = document.createElement("div");
  el.className = "card plus";
  el.innerHTML = `
    <div>
      <div class="big">+</div>
      <div class="small">Nowa</div>
      <div class="tiny">Lokalna / Sondażowa</div>
    </div>
  `;

  el.addEventListener("click", () => openTypeModal());
  return el;
}

async function createGame(kind) {
  if (!currentUser?.id) {
    alert("Brak sesji użytkownika. Zaloguj się ponownie.");
    location.href = "index.html";
    return null;
  }

  // status dla poll: draft
  const payload = {
    name: "Nowa Familiada",
    owner_id: currentUser.id,
    kind, // "fixed" albo "poll"
    status: kind === "poll" ? "draft" : "ready", // lokalna jest od razu “do edycji”, status nie musi być używany
  };

  const { data: game, error } = await sb().from("games").insert(payload).select("*").single();
  if (error) {
    console.error("[builder] create game error:", error);
    alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    return null;
  }

  // Upewnij się, że live_state istnieje (sterowanie)
  const { error: lsErr } = await sb().from("live_state").insert({ game_id: game.id }).select().maybeSingle();
  if (lsErr) console.warn("[builder] live_state insert warn:", lsErr);

  return game;
}

async function refresh() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[builder] list games error:", error);
    alert("Nie udało się wczytać listy gier. Sprawdź konsolę.");
    return;
  }

  games = data || [];

  grid.innerHTML = "";
  games.forEach((g) => grid.appendChild(cardGame(g)));
  grid.appendChild(cardPlus());

  clearSelection();
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnEdit.addEventListener("click", async () => {
    if (!selectedGame) return;

    // jeśli poll i poll_open -> blokada edycji
    if (selectedGame.kind === "poll" && selectedGame.status === "poll_open") {
      alert("Sondaż jest otwarty — edycja zablokowana. Zamknij sondaż, jeśli chcesz edytować.");
      return;
    }

    location.href = `editor.html?id=${encodeURIComponent(selectedGame.id)}`;
  });

  btnPlay.addEventListener("click", async () => {
    if (!selectedGame) return;

    if (selectedGame.kind === "poll" && selectedGame.status !== "ready") {
      alert("Ta Familiada sondażowa nie jest gotowa do gry. Najpierw zamknij sondaż.");
      return;
    }

    location.href = `control.html?id=${encodeURIComponent(selectedGame.id)}`;
  });

  btnPoll.addEventListener("click", async () => {
    if (!selectedGame) return;

    if (selectedGame.kind !== "poll") return;

    // polls.html zawsze otwieramy z id — ale tam i tak zablokujemy link/QR jeśli gra pusta albo status nie poll_open
    location.href = `polls.html?id=${encodeURIComponent(selectedGame.id)}`;
  });

  // modal wyboru typu
  btnCancelType.addEventListener("click", () => closeTypeModal());
  typeOverlay.addEventListener("click", (e) => {
    if (e.target === typeOverlay) closeTypeModal();
  });

  btnCreateFixed.addEventListener("click", async () => {
    closeTypeModal();
    const g = await createGame("fixed");
    if (!g) return;
    await refresh();
    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  btnCreatePoll.addEventListener("click", async () => {
    closeTypeModal();
    const g = await createGame("poll");
    if (!g) return;
    await refresh();
    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  await refresh();
});
