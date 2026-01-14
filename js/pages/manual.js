// js/pages/manual.js
import { requireAuth, signOut } from "../core/auth.js";

function $(id){ return document.getElementById(id); }

const TABS = [
  { btn: "tabOgl", page: "pageOgl", hash: "#ogolny" },
  { btn: "tabEdit", page: "pageEdit", hash: "#edycja" },
  { btn: "tabPolls", page: "pagePolls", hash: "#sondaze" },
  { btn: "tabControl", page: "pageControl", hash: "#control" },
];

function setActive(btnId, pushHash=true){
  for (const t of TABS){
    const b = $(t.btn);
    const p = $(t.page);
    const active = (t.btn === btnId);
    b?.classList.toggle("active", active);
    p?.classList.toggle("active", active);
  }
  if (pushHash){
    const t = TABS.find(x => x.btn === btnId);
    if (t) history.replaceState(null, "", t.hash);
  }
}

function setFromHash(){
  const h = (location.hash || "").toLowerCase();
  const t = TABS.find(x => x.hash === h);
  if (t) setActive(t.btn, false);
}

async function boot(){
  // auth/topbar — tak samo jak editor.js
  const user = await requireAuth("index.html");
  const who = $("who");
  if (who) who.textContent = user?.email || "—";

  $("btnLogout")?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  $("btnBack")?.addEventListener("click", () => {
    location.href = "builder.html";
  });

  // tabs
  for (const t of TABS){
    $(t.btn)?.addEventListener("click", () => setActive(t.btn, true));
  }
  window.addEventListener("hashchange", setFromHash);

  setFromHash();
}

boot().catch(err => {
  console.error(err);
  alert(err?.message || String(err));
});
