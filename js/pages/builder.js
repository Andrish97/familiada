// js/pages/games.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

const $ = (s) => document.querySelector(s);

const ui = {
  status: $(".g-status"),
  grid: $(".g-grid"),
  err: $(".g-error"),
  btnNew: $(".g-new"),
  btnLogout: $(".g-logout"),
};

let client = null;

function setError(msg) {
  ui.err.textContent = msg || "";
}

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

async function loadGames() {
  const { data, error } = await client
    .from("games")
    .select("id,name,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function createGame() {
  const { data, error } = await client
    .from("games")
    .insert({ name: "Nowa Familiada" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function deleteGame(id) {
  const { error } = await client.from("games").delete().eq("id", id);
  if (error) throw error;
}

function render(games) {
  ui.grid.innerHTML = "";

  // kafelek +
  const plus = document.createElement("div");
  plus.className = "g-new-tile";
  plus.innerHTML = `<span>+ dodaj grę</span>`;
  plus.addEventListener("click", async () => {
    try {
      setError("");
      ui.status.textContent = "Tworzę…";
      const g = await createGame();
      location.href = `builder.html?game=${encodeURIComponent(g.id)}`;
    } catch (e) {
      console.error(e);
      setError(e?.message || "Nie udało się utworzyć gry.");
      ui.status.textContent = "Błąd.";
    }
  });
  ui.grid.appendChild(plus);

  games.forEach((g) => {
    const card = document.createElement("div");
    card.className = "g-card";
    card.innerHTML = `
      <button class="g-del" type="button" title="Usuń">✕</button>
      <div class="g-name"></div>
      <div class="g-meta">Utworzono: ${fmtDate(g.created_at)}</div>
    `;

    card.querySelector(".g-name").textContent = g.name;

    card.addEventListener("click", (ev) => {
      // klik w X nie ma otwierać
      if (ev.target.closest(".g-del")) return;
      location.href = `builder.html?game=${encodeURIComponent(g.id)}`;
    });

    card.querySelector(".g-del").addEventListener("click", async () => {
      const ok = confirm(`Usunąć grę „${g.name}”?`);
      if (!ok) return;

      try {
        setError("");
        ui.status.textContent = "Usuwam…";
        await deleteGame(g.id);
        const list = await loadGames();
        ui.status.textContent = `Gry: ${list.length}`;
        render(list);
      } catch (e) {
        console.error(e);
        setError(e?.message || "Nie udało się usunąć.");
        ui.status.textContent = "Błąd.";
      }
    });

    ui.grid.appendChild(card);
  });
}

async function main() {
  await requireAuth("index.html");

  client = sb();

  ui.btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  ui.btnNew.addEventListener("click", async () => {
    const g = await createGame();
    location.href = `builder.html?game=${encodeURIComponent(g.id)}`;
  });

  ui.status.textContent = "Ładuję gry…";
  const games = await loadGames();
  ui.status.textContent = `Gry: ${games.length}`;
  render(games);
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    setError(e?.message || "Błąd krytyczny.");
    ui.status.textContent = "Błąd.";
  });
});
