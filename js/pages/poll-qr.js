const qs = new URLSearchParams(location.search);
const url = qs.get("url");

const qr = document.getElementById("qr");
const urlEl = document.getElementById("url");
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
      if(tries > 50){
        clearInterval(i);
        reject(new Error("QRCode lib not loaded"));
      }
    }, 50);
  });
}

async function render(u){
  urlEl.textContent = u || "Brak URL";
  qr.innerHTML = "";
  if(!u) return;

  try{
    const QRCode = await waitForQRCode();
    QRCode.toCanvas(u, { width: 420, margin: 1 }, (err, canvas)=>{
      if(err) return;
      qr.appendChild(canvas);
    });
  }catch(e){
    qr.textContent = "Nie udało się załadować QR";
  }
}

btnFS.addEventListener("click", async ()=>{
  try{
    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    }else{
      await document.exitFullscreen();
    }
  }catch{}
});

render(url);
