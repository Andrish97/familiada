import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

function cardGame(g) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <div class="x" title="Usuń">✕</div>
    <div class="name"></div>
    <div class="meta">Kliknij, aby edytować</div>
  `;
  el.querySelector(".name").textContent = g.name;

  el.addEventListener("click", () => {
    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  el.querySelector(".x").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await confirmModal({
      title: "Usuń Familiadę",
      text: `Na pewno usunąć "${g.name}"? Tego nie da się łatwo odkręcić.`,
      okText: "Usuń",
      cancelText: "Anuluj",
    });
    if (!ok) return;
    await sb().from("games").delete().eq("id", g.id);
    await refresh();
  });

  return el;
}

function cardPlus() {
  const el = document.createElement("div");
  el.className = "card plus";
  el.innerHTML = `<div><div class="big">+</div><div class="small">Nowa / Import</div></div>`;

  el.addEventListener("click", async () => {
    // “grubo”: wybór modalem
    const ok = await confirmModal({
      title: "Nowa Familiada",
      text: "Utworzyć nową? (Import z pliku dodamy jako osobną opcję w następnym kroku).",
      okText: "Utwórz",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    const { data: game, error } = await sb()
      .from("games")
      .insert({ name: "Nowa Familiada" })
      .select("*")
      .single();
    if (error) throw error;

    // Upewnij live_state
    await sb().from("live_state").insert({ game_id: game.id }).select().maybeSingle();

    location.href = `editor.html?id=${encodeURIComponent(game.id)}`;
  });

  return el;
}

async function refresh() {
  const { data, error } = await sb().from("games").select("id,name,created_at").order("created_at", { ascending: false });
  if (error) throw error;

  grid.innerHTML = "";
  (data || []).forEach((g) => grid.appendChild(cardGame(g)));
  grid.appendChild(cardPlus());
}

document.addEventListener("DOMContentLoaded", async () => {
  const u = await requireAuth("index.html");
  who.textContent = u.email || "—";

  btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  await refresh();
});
