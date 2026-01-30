// js/pages/demo-progress-modal.js
// Prosty modal postępu demo (blokuje UI).
// Tworzony dynamicznie, bez zmian w HTML.

function byId(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createDemoProgressModal() {
  // jeśli już istnieje, użyj ponownie
  let overlay = byId("demoProgressOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "demoProgressOverlay";

    // Klucz: overlay musi blokować interakcje
    // Styl bazowy – a reszta ma “łapać” Twoje CSS (builder-like)
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "9999";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "18px";
    overlay.style.background = "rgba(0,0,0,.82)";
    overlay.style.backdropFilter = "blur(6px)";
    overlay.style.webkitBackdropFilter = "blur(6px)";

    overlay.innerHTML = `
      <div id="demoProgressCard" class="modalCard" style="
        width:min(760px, 96vw);
        border-radius:18px;
        border:1px solid rgba(255,255,255,.16);
        background: rgba(20,20,24,.92);
        color: #fff;
        box-shadow: 0 10px 40px rgba(0,0,0,.45);
        overflow:hidden;
      ">
        <div style="padding:16px 16px 12px 16px; border-bottom:1px solid rgba(255,255,255,.10);">
          <div style="font-weight:900; letter-spacing:.06em; text-transform:uppercase;">
            Przywracam DEMO
          </div>
          <div id="demoProgressSub" style="opacity:.8; margin-top:6px; font-size:14px;">
            Proszę nie zamykaj strony. To może potrwać chwilę.
          </div>
        </div>

        <div style="padding:14px 16px 10px 16px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="flex:1;">
              <div id="demoProgressLabel" style="font-weight:700;">Start…</div>
              <div id="demoProgressHint" style="opacity:.75; font-size:13px; margin-top:4px;"></div>
            </div>
            <div id="demoProgressPct" style="min-width:44px; text-align:right; font-variant-numeric: tabular-nums; opacity:.9;">0%</div>
          </div>

          <div style="margin-top:10px; height:10px; background:rgba(255,255,255,.10); border-radius:999px; overflow:hidden;">
            <div id="demoProgressBar" style="height:100%; width:0%; background:rgba(255,255,255,.85); border-radius:999px;"></div>
          </div>

          <div id="demoProgressLog" style="
            margin-top:12px;
            padding:10px 12px;
            border-radius:14px;
            background: rgba(255,255,255,.06);
            border:1px solid rgba(255,255,255,.10);
            max-height: 240px;
            overflow:auto;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.45;
            white-space: pre-wrap;
          "></div>

          <div id="demoProgressErr" style="display:none; margin-top:10px; color:#ffb3b3;"></div>
        </div>
      </div>
    `;

    // BLOKUJ: klik w tło nic nie robi (nie zamykamy)
    overlay.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });

    document.body.appendChild(overlay);
  }

  const elLabel = byId("demoProgressLabel");
  const elHint = byId("demoProgressHint");
  const elPct = byId("demoProgressPct");
  const elBar = byId("demoProgressBar");
  const elLog = byId("demoProgressLog");
  const elErr = byId("demoProgressErr");
  const elSub = byId("demoProgressSub");

  function show() {
    overlay.style.display = "flex";
    // twarda blokada scrolla
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function hide() {
    overlay.style.display = "none";
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }

  function setProgress({ step, total, label, hint }) {
    const s = Math.max(0, Number(step || 0));
    const t = Math.max(1, Number(total || 1));
    const pct = Math.max(0, Math.min(100, Math.round((s / t) * 100)));

    if (elLabel) elLabel.textContent = String(label || "");
    if (elHint) elHint.textContent = String(hint || "");
    if (elPct) elPct.textContent = `${pct}%`;
    if (elBar) elBar.style.width = `${pct}%`;
  }

  function log(line) {
    if (!elLog) return;
    const txt = (elLog.textContent || "").trim();
    elLog.textContent = (txt ? txt + "\n" : "") + String(line || "");
    elLog.scrollTop = elLog.scrollHeight;
  }

  function setError(msg) {
    if (!elErr) return;
    elErr.style.display = msg ? "block" : "none";
    elErr.innerHTML = msg ? esc(msg) : "";
    if (elSub) elSub.textContent = "Wystąpił błąd. Możesz spróbować ponownie.";
  }

  return { show, hide, setProgress, log, setError };
}
