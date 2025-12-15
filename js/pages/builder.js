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
    <div class="meta"></div>
  `;
  el.querySelector(".name").textContent = g.name;

  const kindTxt = g.kind === "poll" ? "SONDAŻ" : "LOKALNA";
  const statusTxt = g.status || "draft";
  el.querySelector(".meta").textContent = `${kindTxt} • status: ${statusTxt} • kliknij, aby edytować`;

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
  el.innerHTML = `
    <div>
      <div class="big">+</div>
      <div class="small">Nowa / Import</div>
      <div class="tiny">LOKALNA lub SONDAŻ</div>
    </div>
  `;

  el.addEventListener("click", async () => {
    // 1) czy tworzyć
    const ok = await confirmModal({
      title: "Nowa Familiada",
      text: "Utworzyć nową Familiadę?",
      okText: "Dalej",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    // 2) wybór typu (tak, to dwa kroki, ale bez dokładania nowego typu modala)
    const isPoll = await confirmModal({
      title: "Typ Familiady",
      text: "Czy to ma być Familiada SONDAŻOWA?\n\nTAK = sondaż (głosy → normalizacja do 100 → gotowa do gry)\nNIE = lokalna (wprowadzasz wartości ręcznie).",
      okText: "TAK (sondaż)",
      cancelText: "NIE (lokalna)",
    });

    if (!currentUser?.id) {
      alert("Brak sesji użytkownika. Zaloguj się ponownie.");
      location.href = "index.html";
      return;
    }

    const kind = isPoll ? "poll" : "fixed";
    const status = isPoll ? "draft" : "draft";

    const { data: game, error } = await sb()
      .from("games")
      .insert({
        name: isPoll ? "Nowa Familiada (sondaż)" : "Nowa Familiada",
        owner_id: currentUser.id,
        kind,
        status,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[builder] create game error:", error);
      alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
      return;
    }

    const { error: lsErr } = await sb()
      .from("live_state")
      .insert({ game_id: game.id })
      .select()
      .maybeSingle();

    if (lsErr) console.warn("[builder] live_state insert warn:", lsErr);

    location.href = `editor.html?id=${encodeURIComponent(game.id)}`;
  });

  return el;
}

function cardPollsShortcut(){
  const el = document.createElement("div");
  el.className = "card plus";
  el.innerHTML = `
    <div>
      <div class="big">📊</div>
      <div class="small">Sondaże</div>
      <div class="tiny">uruchom / podgląd / zakończ</div>
    </div>
  `;
  el.addEventListener("click", ()=> location.href = "polls.html");
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

  grid.innerHTML = "";
  (data || []).forEach((g) => grid.appendChild(cardGame(g)));
  grid.appendChild(cardPlus());
  grid.appendChild(cardPollsShortcut());
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

