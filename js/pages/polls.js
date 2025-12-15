<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Familiada — QR</title>

  <link rel="icon" href="favicon.ico"/>

  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js" defer></script>

  <style>
    body{
      margin:0; min-height:100vh;
      background:#050914; color:#fff;
      font-family:system-ui,-apple-system,Segoe UI,sans-serif;
      display:flex; align-items:center; justify-content:center;
    }
    .wrap{
      width:min(900px,94vw);
      text-align:center;
      padding:18px;
    }
    .title{
      font-weight:1000;
      letter-spacing:.12em;
      text-transform:uppercase;
      color:#ffeaa6;
      margin-bottom:14px;
    }
    .box{
      display:flex;
      gap:18px;
      justify-content:center;
      align-items:center;
      flex-wrap:wrap;
    }
    .qr{
      width:420px; height:420px;
      border-radius:22px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 24px 60px rgba(0,0,0,.55);
      padding:18px;
    }
    .url{
      opacity:.85;
      word-break:break-all;
      max-width: 800px;
      margin-top:14px;
      font-weight:700;
      font-size:14px;
    }
    .hint{
      opacity:.7;
      margin-top:10px;
      font-size:12px;
    }
    button{
      margin-top:14px;
      padding:12px 14px;
      border-radius:16px;
      border:1px solid rgba(255,255,255,.18);
      background:rgba(255,255,255,.06);
      color:#fff;
      font-weight:900;
      cursor:pointer;
    }
  </style>
</head>

<body>
  <div class="wrap">
    <div class="title">Skanuj kod QR</div>

    <div class="box">
      <div class="qr" id="qr"></div>
    </div>

    <div class="url" id="u">—</div>
    <div class="hint">Kliknij w tło / F11 / fullscreen w przeglądarce dla rzutnika.</div>

    <button id="fs" type="button">Pełny ekran</button>
  </div>

  <script>
    function getUrl(){
      const qs = new URLSearchParams(location.search);
      return qs.get("url") || "";
    }

    function render(){
      const url = getUrl();
      document.getElementById("u").textContent = url || "Brak parametru url";
      const box = document.getElementById("qr");
      box.innerHTML = "";

      if(!url) return;

      QRCode.toCanvas(url, { width: 380, margin: 1 }, (err, canvas)=>{
        if(err) return;
        box.appendChild(canvas);
      });
    }

    document.addEventListener("DOMContentLoaded", ()=>{
      render();
      document.getElementById("fs").addEventListener("click", async ()=>{
        try{
          if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
          else await document.exitFullscreen();
        }catch{}
      });
    });
  </script>
</body>
</html>
