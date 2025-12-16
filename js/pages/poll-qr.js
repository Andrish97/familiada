// js/pages/poll-qr.js
const qs = new URLSearchParams(location.search);
const url = qs.get("url");

const qr = document.getElementById("qr");
const btnFS = document.getElementById("btnFS");

function waitForQRCode(){
  return new Promise((resolve, reject)=>{
    let tries = 0;
    const i = setInterval(()=>{
      if(window.QRCode){
        clearInterval(i);
        resolve(window.QRCode);
      }
      tries++;
      if(tries > 80){
        clearInterval(i);
        reject(new Error("QRCode lib not loaded"));
      }
    }, 50);
  });
}

async function render(u){
  qr.innerHTML = "";
  if(!u){
    qr.textContent = "Brak URL";
    return;
  }

  try{
    const QRCode = await waitForQRCode();
    QRCode.toCanvas(u, { width: 420, margin: 1 }, (err, canvas)=>{
      if(err) {
        qr.textContent = "Nie udało się wygenerować QR";
        return;
      }
      qr.appendChild(canvas);
    });
  }catch{
    qr.textContent = "Nie udało się załadować QR";
  }
}

btnFS?.addEventListener("click", async ()=>{
  try{
    if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
});

render(url);
