// js/pages/poll-qr.js
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";

const qs = new URLSearchParams(location.search);
const url = qs.get("url");

const qr = document.getElementById("qr");
const btnFS = document.getElementById("btnFS");

async function render(u){
  qr.innerHTML = "";
  if(!u){
    qr.textContent = "Brak URL";
    return;
  }

  try{
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, u, { width: 420, margin: 1 });
    qr.appendChild(canvas);
  }catch(e){
    console.error("[poll-qr] QR error:", e);
    qr.textContent = "Nie udało się wygenerować QR";
  }
}

btnFS?.addEventListener("click", async ()=>{
  try{
    if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
});

render(url);
