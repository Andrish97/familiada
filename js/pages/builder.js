// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

let currentUser = null;
let games = [];
let selectedId = null;

function setSelected(id) {
  selectedId = id;
  [...grid.querySelectorAll(".card")].forEach((c) => c.classList.remove("selected"));
  const el = grid.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (el) el.classList.add("selected");
  renderActionsBar();
}

function getSelectedGame() {
  return games.find((g) => g.id === selectedId) || null;
}

function statusLabel(g) {
  const kind = g.kind || "fixed";
  const status = g.status || "draft";

  if (kind === "poll") {
    if (status === "poll_open") return "Sondaż: OTWARTY";
    if (status === "ready") return "Sondaż: ZAMKNIĘTY (gotowa)";
    return "Sondaż: nieuruchomiony";
  }

  return "Lokalna";
}

function canEdit(g) {
  // Twoja zasada: jeśli poll jest otwarty – nie pozwalamy edytować
  return !(g.kind === "poll" && g.status === "poll_open");
}

function canPlay(g) {
  // lokalna zawsze (o ile ma dane — walidację dopniemy później)
  // sondażowa dopiero po status=ready
  if (g.kind === "poll") return g.status === "ready";
  return true;
}

function canPoll(g) {
  return g.kind === "poll";
}

function renderActionsBar() {
  // usuń poprzedni pasek akcji
  const old = document.getElementById("actionsBar");
  if (old) old.remove();

  const g = getSelectedGame();

  const bar = document.createElement("div");
  bar.id = "actionsBar";
  bar.className = "actionsBar";

  bar.innerHTML = `
    <button class="btn" id="actEdit" type="button" ${!g || !canEdit(g) ? "disabled" : ""}>Edytuj</button>
    <button class="btn gold" id="actPlay" type="button" ${!g || !canPlay(g) ? "disabled" : ""}>Graj</button>
    <button class="btn" id="actPoll" type="button" ${!g || !canPoll(g) ? "disabled" : ""}>Sondaż</button>
    <button class="btn danger" id="actDelete" type="button" ${!g ? "disabled" : ""}>Usuń</button>
    <div class="actionsHint" id="actionsHint"></div>
  `;

  grid.parentElement.appendChild(bar);

  const hint = bar.querySelector("#actionsHint");

  if (!g) {
    hint.textContent = "Zaznacz Familiadę, żeby sterować.";
    return;
  }

  if (g.kind === "poll" && g.status === "poll_open") {
    hint.textContent = "Sondaż jest otwarty — edycja zablokowana.";
  } else if (g.kind === "poll" && g.status !== "ready") {
    hint.textContent = "Gra sondażowa: uruchom i zakończ sondaż, aby była gotowa do gry.";
  } else {
    hint.textContent = statusLabel(g);
  }

  bar.querySelector("#actEdit").addEventListener("click", () => {
    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  bar.querySelector("#actPlay").addEventListener("click", () => {
    // na razie kierujemy do control (walidacje min pytań itd. dopniemy w control)
    location.href = `control.html?id=${encodeURIComponent(g.id)}`;
  });

  bar.querySelector("#actPoll").addEventListener("click", () => {
    location.href = `polls.html?id=${encodeURIComponent(g.id)}`;
  });

  bar.querySelector("#actDelete").addEventListener("click", async () => {
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

    selectedId = null;
    await refresh();
  });
}

function cardGame(g) {
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.id = g.id;

  el.innerHTML = `
    <div class="name"></div>
    <div class="meta"></div>
  `;

  el.querySelector(".name").textContent = g.name;
  el.querySelector(".meta").textContent = statusLabel(g);

  el.addEventListener("click", () => setSelected(g.id));
  el.addEventListener("dblclick", () => {
    // szybkie wejście do edytora, ale respektujemy blokadę
    if (!canEdit(g)) return;
    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  return el;
}

function cardPlus() {
  const el = document.createElement("div");
  el.className = "card plus";

  el.innerHTML = `<div><div class="big">+</div><div class="small">Nowa Familiada</div></div>`;

  el.addEventListener("click", async () => {
    // tu później dorobimy ładny wybór typu (lokalna/sondażowa) w UI buildera
    // na razie tworzymy lokalną, a typ gry ustawisz później (albo dopniemy modal)
    const ok = await confirmModal({
      title: "Nowa Familiada",
      text: "Utworzyć nową Familiadę (lokalną)?",
      okText: "Utwórz",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    if (!currentUser?.id) {
      alert("Brak sesji użytkownika. Zaloguj się ponownie.");
      location.href = "index.html";
      return;
    }

    const { data: game, error } = await sb()
      .from("games")
      .insert({
        name: "Nowa Familiada",
        owner_id: currentUser.id,
        kind: "fixed",
        status: "draft",
      })
      .select("*")
      .single();

    if (error) {
      console.error("[builder] create game error:", error);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
      return;
    }

    // upewnij się, że live_state istnieje
    const { error: lsErr } = await sb()
      .from("live_state")
      .insert({ game_id: game.id })
      .select()
      .maybeSingle();
    if (lsErr) console.warn("[builder] live_state insert warn:", lsErr);

    await refresh();
    setSelected(game.id);
  });

  return el;
}

async function refresh() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at,kind,status")
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

  // odśwież zaznaczenie jeśli dalej istnieje
  if (selectedId && !games.some((g) => g.id === selectedId)) {
    selectedId = null;
  }
  if (selectedId) setSelected(selectedId);
  else renderActionsBar();
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  await refresh();
});
