import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const sheet = document.getElementById("sheet");
const blank = document.getElementById("blank");
const textEl = document.getElementById("text");
const btnFS = document.getElementById("btnFS");

let visible = true;

function show(on) {
  visible = on;
  sheet.style.display = on ? "" : "none";
  blank.style.display = on ? "none" : "";
}

function handleCmd(line) {
  const l = line.trim();

  if (l === "HIDE") show(false);
  if (l === "SHOW") show(true);
  if (l === "CLEAR") textEl.textContent = "";

  if (l.startsWith("TEXT")) {
    const m = l.match(/^TEXT\s+"([\s\S]*)"$/);
    if (m) {
      textEl.textContent = m[1];
      show(true);
    }
  }
}

/* swipe góra/dół – nie przy krawędziach */
let startY = null;

window.addEventListener("pointerdown", (e) => {
  if (e.clientY < 40 || e.clientY > window.innerHeight - 40) return;
  startY = e.clientY;
});

window.addEventListener("pointerup", (e) => {
  if (startY == null) return;
  const dy = e.clientY - startY;
  if (dy > 80) show(true);
  if (dy < -80) show(false);
  startY = null;
});

btnFS.onclick = async () => {
  if (!document.fullscreenElement)
    await document.documentElement.requestFullscreen();
  else
    await document.exitFullscreen();
};

function sub() {
  sb()
    .channel(`familiada-host:${gameId}`)
    .on("broadcast", { event: "HOST_CMD" }, (e) => {
      handleCmd(e.payload?.line || "");
    })
    .subscribe();
}

document.addEventListener("DOMContentLoaded", () => {
  if (!gameId || !key) return;
  show(true);
  sub();
});
