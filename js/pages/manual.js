// js/pages/manual.js
import { requireAuth, signOut } from "../core/auth.js";

const tabs = document.querySelectorAll(".simple-tabs .tab");
const pages = {
  general: document.getElementById("tab-general"),
  edit: document.getElementById("tab-edit"),
  polls: document.getElementById("tab-polls"),
  control: document.getElementById("tab-control"),
};

function setActive(name) {
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(pages).forEach(([key, el]) => {
    el.classList.toggle("active", key === name);
  });
}

async function boot() {
  const user = await requireAuth("index.html");
  document.getElementById("who").textContent = user?.email || "—";

  document.getElementById("btnLogout").onclick = async () => {
    await signOut();
    location.href = "index.html";
  };

  document.getElementById("btnBack").onclick = () => {
    location.href = "builder.html";
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => setActive(tab.dataset.tab));
  });
}
