
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
  el.innerHTML = `<div><div class="big">+</div><div class="small">Nowa / Import</div></div>`;

  el.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Nowa Familiada",
      text: "Utworzyć nową Familiadę?",
      okText: "Utwórz",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    if (!currentUser?.id) {
      alert("Brak sesji użytkownika. Zaloguj się ponownie.");
      location.href = "index.html";
      return;
    }

    // Insert: z triggerem owner_id może być pominięte,
    // ale jawnie podajemy owner_id, żeby RLS nie miało wątpliwości.
    const { data: game, error } = await sb()
      .from("games")
      .insert({
        name: "Nowa Familiada",
        owner_id: currentUser.id,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[builder] create game error:", error);
      alert(
        "Nie udało się utworzyć gry.\n\n" +
        "Najczęściej: RLS/owner_id albo brak sesji.\n" +
        "Sprawdź konsolę (F12) i polityki w Supabase."
      );
      return;
    }

    // Upewnij się, że live_state istnieje
    const { error: lsErr } = await sb()
      .from("live_state")
      .insert({ game_id: game.id })
      .select()
      .maybeSingle();

    // Ignorujemy konflikt/brak uprawnień jeśli RLS już to kontroluje inaczej,
    // ale w Twoim schemacie owner powinien móc.
    if (lsErr) {
      console.warn("[builder] live_state insert warn:", lsErr);
    }

    location.href = `editor.html?id=${encodeURIComponent(game.id)}`;
  });

  return el;
}

async function refresh() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[builder] list games error:", error);
    alert("Nie udało się wczytać listy gier. Sprawdź konsolę.");
    return;
  }

  grid.innerHTML = "";
  (data || []).forEach((g) => grid.appendChild(cardGame(g)));
  grid.appendChild(cardPlus());
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
