import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";

const qs = new URLSearchParams(location.search);
const url = qs.get("url");

const qr = document.getElementById("qr");
const btnFS = document.getElementById("btnFS");

function updateFsIcon(){
  if(!btnFS) return;
  btnFS.textContent = document.fullscreenElement ? "⧉" : "⛶";
}

async function render(u){
  qr.innerHTML = "";
  if(!u){ qr.textContent = "Brak URL"; return; }

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
  }catch(e){
    console.warn("[poll-qr] fullscreen error", e);
  }
});

document.addEventListener("fullscreenchange", updateFsIcon);

updateFsIcon();
render(url);
