const qs = new URLSearchParams(location.search);
const url = qs.get("url");

const qr = document.getElementById("qr");
const urlEl = document.getElementById("url");
const btnFS = document.getElementById("btnFS");

function render(u){
  urlEl.textContent = u || "Brak URL";
  qr.innerHTML = "";
  if(!u) return;

  QRCode.toCanvas(u, { width: 420, margin: 1 }, (err, canvas)=>{
    if(err) return;
    qr.appendChild(canvas);
  });
}

btnFS.addEventListener("click", async ()=>{
  try{
    if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
});

render(url);
