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

// modal typu
const typeOverlay = document.getElementById("typeOverlay");
const btnCreateFixed = document.getElementById("btnCreateFixed");
const btnCreatePoll = document.getElementById("btnCreatePoll");
const btnCancelType = document.getElementById("btnCancelType");

let currentUser = null;
let games = [];
let selectedId = null;

function getSelected() {
  return games.find((g) => g.id === selectedId) || null;
}

function isPollGame(g) {
  return (g.kind || "fixed") === "poll";
}

function isPollOpen(g) {
  return isPollGame(g) && (g.status || "draft") === "poll_open";
}

function canEdit(g) {
  // Twoja zasada: jeśli sondaż otwarty -> blok edycji
  return !!g && !isPollOpen(g);
}

function canPlay(g) {
  if (!g) return false;
  if (isPollGame(g)) return (g.status || "draft") === "ready";
  return true;
}

function canPoll(g) {
  return !!g && isPollGame(g);
}

function labelMeta(g) {
  const kind = g.kind || "fixed";
  const status = g.status || "draft";

  if (kind === "poll") {
    if (status === "poll_open") return "Sondaż: OTWARTY";
    if (status === "ready") return "Sondaż: ZAMKNIĘTY (gotowa)";
    return "Sondaż: nieuruchomiony";
  }
  return "Lokalna";
}

function syncButtons() {
  const g = getSelected();

  btnEdit.disabled = !g || !canEdit(g);
  btnPlay.disabled = !g || !canPlay(g);
  btnPoll.disabled = !g || !canPoll(g);

  if (!g) {
    hint.textContent = "Kliknij kafelek, żeby go zaznaczyć.";
    return;
  }

  if (isPollOpen(g)) {
    hint.textContent = "Sondaż jest OTWARTY — edycja zablokowana.";
    return;
  }

  if (isPollGame(g) && (g.status || "draft") !== "ready") {
    hint.textContent = "Gra sondażowa: uruchom i zakończ sondaż, aby była gotowa do gry.";
    return;
  }

  hint.textContent = `Zaznaczono: ${g.name} • ${labelMeta(g)}`;
}

function setSelected(id) {
  selectedId = id;

  [...grid.querySelectorAll(".card[data-id]")].forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === id);
  });

  syncButtons();
}

function openTypeModal(open) {
  typeOverlay.style.display = open ? "" : "none";
}

async function createGame(kind) {
  if (!currentUser?.id) {
    alert("Brak sesji użytkownika. Zaloguj się ponownie.");
    location.href = "index.html";
    return null;
  }

  const base = {
    name: "Nowa Familiada",
    owner_id: currentUser.id,
    kind: kind, // 'fixed' | 'poll'
    status: "draft", // 'draft' | 'poll_open' | 'ready'
  };

  const { data: game, error } = await sb()
    .from("games")
    .insert(base)
    .select("id,name,kind,status,created_at")
    .single();

  if (error) throw error;

  // upewnij się, że live_state istnieje (jeśli już jest, ostrzeżenie ignorujemy)
  const { error: lsErr } = await sb()
    .from("live_state")
    .insert({ game_id: game.id })
    .select()
    .maybeSingle();

  if (lsErr) {
    console.warn("[builder] live_state insert warn:", lsErr);
  }

  return game;
}

async function deleteGame(g) {
  const ok = await confirmModal({
    title: "Usuń Familiadę",
    text: `Na pewno usunąć "${g.name}"? Tego nie da się łatwo odkręcić.`,
    okText: "Usuń",
    cancelText: "Anuluj",
  });
  if (!ok) return;

  const { error } = await sb().from("games").delete().eq("id", g.id);
  if (error) throw error;
}

function cardGame(g) {
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.id = g.id;

  el.innerHTML = `
    <div class="x" title="Usuń">✕</div>
    <div class="name"></div>
    <div class="meta"></div>
  `;

  el.querySelector(".name").textContent = g.name;
  el.querySelector(".meta").textContent = labelMeta(g);

  el.addEventListener("click", () => setSelected(g.id));

  el.addEventListener("dblclick", () => {
    if (!canEdit(g)) return;
    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  el.querySelector(".x").addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await deleteGame(g);
      if (selectedId === g.id) selectedId = null;
      await refresh();
    } catch (err) {
      console.error("[builder] delete error:", err);
      alert("Nie udało się usunąć. Sprawdź konsolę.");
    }
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
      <div class="tiny">Lokalna / Sondaż</div>
    </div>
  `;

  el.addEventListener("click", () => openTypeModal(true));
  return el;
}

async function refresh() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at,kind,status")
    .order("created_at", { ascending: false });

  if (error) throw error;

  games = data || [];

  grid.innerHTML = "";
  games.forEach((g) => grid.appendChild(cardGame(g)));
  grid.appendChild(cardPlus());

  // odśwież zaznaczenie
  if (selectedId && !games.some((g) => g.id === selectedId)) {
    selectedId = null;
  }
  if (selectedId) setSelected(selectedId);
  else syncButtons();
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  // akcje górne
  btnEdit.addEventListener("click", () => {
    const g = getSelected();
    if (!g || !canEdit(g)) return;
    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  btnPlay.addEventListener("click", () => {
    const g = getSelected();
    if (!g || !canPlay(g)) return;
    location.href = `control.html?id=${encodeURIComponent(g.id)}`;
  });

  btnPoll.addEventListener("click", () => {
    const g = getSelected();
    if (!g || !canPoll(g)) return;
    location.href = `polls.html?id=${encodeURIComponent(g.id)}`;
  });

  // modal typu
  btnCancelType.addEventListener("click", () => openTypeModal(false));

  // klik poza modalem zamyka
  typeOverlay.addEventListener("click", (e) => {
    if (e.target === typeOverlay) openTypeModal(false);
  });

  btnCreateFixed.addEventListener("click", async () => {
    openTypeModal(false);
    try {
      const g = await createGame("fixed");
      await refresh();
      setSelected(g.id);
      location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
    } catch (err) {
      console.error("[builder] create fixed error:", err);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    }
  });

  btnCreatePoll.addEventListener("click", async () => {
    openTypeModal(false);
    try {
      const g = await createGame("poll");
      await refresh();
      setSelected(g.id);
      location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
    } catch (err) {
      console.error("[builder] create poll error:", err);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    }
  });

  try {
    await refresh();
  } catch (err) {
    console.error("[builder] refresh error:", err);
    alert("Nie udało się wczytać listy gier. Sprawdź konsolę.");
  }
});
