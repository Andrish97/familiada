// theme_classic.js
console.log("[Theme: Classic] Loaded v3");

const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
};
const rgbToHex = ({ r, g, b }) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
const mix = (c1, c2, t) => ({ r: Math.round(c1.r + (c2.r - c1.r) * t), g: Math.round(c1.g + (c2.g - c1.g) * t), b: Math.round(c1.b + (c2.b - c1.b) * t) });
const lighten = (c, t) => mix(c, { r: 255, g: 255, b: 255 }, t);
const darken  = (c, t) => mix(c, { r: 0, g: 0, b: 0 }, t);

const DEFAULT_COLORS = { A: "#c4002f", B: "#2a62ff", BG: "#d21180" };

function computeDerived(c) {
  const A = hexToRgb(c.A), B = hexToRgb(c.B);
  return {
    A: c.A,
    B: c.B,
    BG: c.BG,
    A_dark: rgbToHex(darken(A, 0.38)),
    B_dark: rgbToHex(darken(B, 0.35)),
    A_lamp: rgbToHex(lighten(A, 0.25)),
    B_lamp: rgbToHex(lighten(B, 0.18)),
    B_glow: rgbToHex(lighten(B, 0.28)),
  };
}

function computeBg(c) {
  const G = hexToRgb(c.BG);
  const top = lighten(G, 0.18);
  const mid = lighten(G, 0.05);
  const bot = darken(G, 0.55);
  return `radial-gradient(150vw 90vh at 50% 25%, ${rgbToHex(top)} 0%, ${rgbToHex(mid)} 30%, ${rgbToHex(G)} 55%, ${rgbToHex(bot)} 100%)`;
}

function applyControls(svg, controls, d) {
  const OFF_COLOR = "#2e2e32";
  
  // Tylko grupy indykatorów g7 (A) i g6 (B) są dynamiczne
  const indicatorMap = { A: "g7", B: "g6" };
  for (const [side, id] of Object.entries(indicatorMap)) {
    const on = controls[side] === true;
    const color = on ? d[side] : OFF_COLOR;
    const el = svg.querySelector(`#${id}`);
    if (el) {
      el.querySelectorAll("circle, rect, path").forEach(child => child.setAttribute("fill", color));
    }
  }
}

function buildSvgContent(d) {
  return `<defs id="defs11">
  <!-- RIM GRADIENT -->
  <linearGradient
       id="rimGrad"
       x1="13.12235"
       y1="81.530251"
       x2="1120.418"
       y2="81.530251"
       gradientTransform="matrix(1.1292055,0,0,0.56677018,1.5258789e-5,-18.413443)"
       gradientUnits="userSpaceOnUse">
    <stop offset="0"    stop-color="${d.A}"/>
    <stop offset="0.35" stop-color="${d.A_dark}"/>
    <stop offset="0.65" stop-color="${d.B_dark}"/>
    <stop offset="1"    stop-color="${d.B}"/>
  </linearGradient>

  <linearGradient id="innerGrad" x1="141.50781" y1="212.21851" x2="141.50781" y2="1060.5737" gradientTransform="matrix(1.1313709,0,0,0.56568542,1.5258789e-5,-18.413443)" gradientUnits="userSpaceOnUse">
    <stop offset="0"   stop-color="#e6eaef" />
    <stop offset="1" stop-color="#bfc7cf" />
  </linearGradient>

  <linearGradient id="silverGrad" x1="6.6645017" y1="3465.8503" x2="6.6645017" y2="3807.9612" gradientTransform="scale(4.5014618,0.22215006)" gradientUnits="userSpaceOnUse">
    <stop offset="0"    stop-color="#f6f7f9" />
    <stop offset="0.55" stop-color="#d1d5db" />
    <stop offset="1"    stop-color="#aab1bb" />
  </linearGradient>

  <!-- Filtry neonowe (przywrócone podwójne cienie dla lepszej głębi) -->
  <filter id="neonRed" x="-60%" y="-120%" width="220%" height="340%">
    <feDropShadow dx="0" dy="0" stdDeviation="4"  flood-color="${d.A}" flood-opacity="0.95"/>
    <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="${d.A}" flood-opacity="0.60"/>
  </filter>

  <filter id="neonBlue" x="-60%" y="-120%" width="220%" height="340%">
    <feDropShadow dx="0" dy="0" stdDeviation="4"  flood-color="${d.B}" flood-opacity="0.95"/>
    <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="${d.B}" flood-opacity="0.60"/>
  </filter>

  <radialGradient id="lampGrad_Red" cx="35%" cy="30%" r="70%">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.65" />
    <stop offset="25%"  stop-color="${d.A_lamp}" stop-opacity="1" />
    <stop offset="100%" stop-color="#000000" stop-opacity="0.35" />
  </radialGradient>

  <radialGradient id="lampGrad_Blue" cx="35%" cy="30%" r="70%">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.65" />
    <stop offset="25%"  stop-color="${d.B_lamp}" stop-opacity="1" />
    <stop offset="100%" stop-color="#000000" stop-opacity="0.35" />
  </radialGradient>
</defs>

<!-- OWAL ZEWNĘTRZNY -->
<rect id="outerOval" x="17.21785" y="30.195477" width="1245.5643" height="622.78217" rx="336" fill="url(#rimGrad)" stroke="#ffffff" stroke-width="4.8" stroke-opacity="0.9" />

<g id="frameLines" transform="matrix(0.8,0,0,0.8,1.5258789e-5,-18.413443)">
  <line x1="1359.6935" y1="300.03058" x2="1501.7794" y2="217.99724" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="1359.6935" y1="599.96942" x2="1501.7794" y2="682.00275" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="240.30647"  y1="300.03058" x2="98.220573"  y2="217.99724" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="240.30647"  y1="599.96942" x2="98.220573"  y2="682.00275" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="1099.9388" y1="749.93884" x2="1099.9388" y2="839.23883" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="1099.9388" y1="150.06114" x2="1099.9388" y2="60.761143"  stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="500.06116"  y1="749.93884" x2="500.06116"  y2="839.23883" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="500.06116"  y1="150.06114" x2="500.06116"  y2="60.761143"  stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
</g>

<rect id="innerOval" x="160.09785" y="101.63547" width="959.80432" height="479.90216" rx="248" fill="url(#innerGrad)" style="stroke-width:0.8"/>

<g id="basebar" transform="matrix(0.8,0,0,0.8,1.5258789e-5,-18.413443)">
  <rect x="30" y="769.93884" width="1540" height="76" fill="url(#silverGrad)" id="rect10833" />
  <rect id="rect10834" x="30" y="769.93884" width="770" height="76" fill="none" stroke="${d.A}" stroke-width="6" stroke-opacity="0.55" stroke-linejoin="round" />
  <rect id="rect10835" x="800" y="769.93884" width="770" height="76" fill="none" stroke="${d.B}" stroke-width="6" stroke-opacity="0.55" stroke-linejoin="round" />

  <rect x="-12.799952" y="-1.599999" width="58.400002" height="41.599998" rx="0" fill="#2e2e32" id="rect4" style="display:inline;fill:#000000;fill-opacity:1;stroke-width:0.264462" transform="matrix(1.25,0,0,1.25,1502,783.93885)" />
  <g id="g4" transform="translate(71,1.25e-5)" style="display:inline">
    <circle cx="1420" cy="786.93884" r="3" fill="#2e2e32" id="circle11598" />
    <circle cx="1427" cy="786.93884" r="3" fill="#2e2e32" id="circle11599" />
    <circle cx="1434" cy="786.93884" r="3" fill="#2e2e32" id="circle11600" />
    <circle cx="1441" cy="786.93884" r="3" fill="#2e2e32" id="circle11601" />
    <circle cx="1469" cy="786.93884" r="3" fill="#2e2e32" id="circle11605" />
    <circle cx="1476" cy="786.93884" r="3" fill="#2e2e32" id="circle11606" />
    <circle cx="1483" cy="786.93884" r="3" fill="#2e2e32" id="circle11607" />
    <circle cx="1420" cy="793.93884" r="3" fill="#2e2e32" id="circle11693" />
    <circle cx="1427" cy="793.93884" r="3" fill="#2e2e32" id="circle11694" />
    <circle cx="1434" cy="793.93884" r="3" fill="#2e2e32" id="circle11695" />
    <circle cx="1476" cy="793.93884" r="3" fill="#2e2e32" id="circle11701" />
    <circle cx="1483" cy="793.93884" r="3" fill="#2e2e32" id="circle11702" />
    <circle cx="1420" cy="800.93884" r="3" fill="#2e2e32" id="circle11788" />
    <circle cx="1427" cy="800.93884" r="3" fill="#2e2e32" id="circle11789" />
    <circle cx="1483" cy="800.93884" r="3" fill="#2e2e32" id="circle11797" />
    <circle cx="1420" cy="807.93884" r="3" fill="#2e2e32" id="circle11883" />
    <circle cx="1427" cy="807.93884" r="3" fill="#2e2e32" id="circle11884" />
    <circle cx="1483" cy="807.93884" r="3" fill="#2e2e32" id="circle11892" />
    <circle cx="1420" cy="814.93884" r="3" fill="#2e2e32" id="circle11978" />
    <circle cx="1427" cy="814.93884" r="3" fill="#2e2e32" id="circle11979" />
    <circle cx="1483" cy="814.93884" r="3" fill="#2e2e32" id="circle11987" />
    <circle cx="1420" cy="821.93884" r="3" fill="#2e2e32" id="circle12073" />
    <circle cx="1427" cy="821.93884" r="3" fill="#2e2e32" id="circle12074" />
    <circle cx="1434" cy="821.93884" r="3" fill="#2e2e32" id="circle12075" />
    <circle cx="1476" cy="821.93884" r="3" fill="#2e2e32" id="circle12081" />
    <circle cx="1483" cy="821.93884" r="3" fill="#2e2e32" id="circle12082" />
    <circle cx="1420" cy="828.93884" r="3" fill="#2e2e32" id="circle12168" />
    <circle cx="1427" cy="828.93884" r="3" fill="#2e2e32" id="circle12169" />
    <circle cx="1434" cy="828.93884" r="3" fill="#2e2e32" id="circle12170" />
    <circle cx="1441" cy="828.93884" r="3" fill="#2e2e32" id="circle12171" />
    <circle cx="1469" cy="828.93884" r="3" fill="#2e2e32" id="circle12175" />
    <circle cx="1476" cy="828.93884" r="3" fill="#2e2e32" id="circle12176" />
    <circle cx="1483" cy="828.93884" r="3" fill="#2e2e32" id="circle12177" />
  </g>
  <g id="g6" transform="matrix(1.25,0,0,1.25,0,23.016813)">
    <circle cx="1448" cy="786.93884" r="3" fill="#2e2e32" id="circle11602" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1455" cy="786.93884" r="3" fill="#2e2e32" id="circle11603" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1462" cy="786.93884" r="3" fill="#2e2e32" id="circle11604" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1441" cy="793.93884" r="3" fill="#2e2e32" id="circle11696" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1448" cy="793.93884" r="3" fill="#2e2e32" id="circle11697" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1455" cy="793.93884" r="3" fill="#2e2e32" id="circle11698" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1462" cy="793.93884" r="3" fill="#2e2e32" id="circle11699" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1469" cy="793.93884" r="3" fill="#2e2e32" id="circle11700" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1434" cy="800.93884" r="3" fill="#2e2e32" id="circle11790" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1441" cy="800.93884" r="3" fill="#2e2e32" id="circle11791" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1448" cy="800.93884" r="3" fill="#2e2e32" id="circle11792" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1455" cy="800.93884" r="3" fill="#2e2e32" id="circle11793" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1462" cy="800.93884" r="3" fill="#2e2e32" id="circle11794" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1469" cy="800.93884" r="3" fill="#2e2e32" id="circle11795" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1476" cy="800.93884" r="3" fill="#2e2e32" id="circle11796" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1434" cy="807.93884" r="3" fill="#2e2e32" id="circle11885" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1441" cy="807.93884" r="3" fill="#2e2e32" id="circle11886" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1448" cy="807.93884" r="3" fill="#2e2e32" id="circle11887" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1455" cy="807.93884" r="3" fill="#2e2e32" id="circle11888" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1462" cy="807.93884" r="3" fill="#2e2e32" id="circle11889" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1469" cy="807.93884" r="3" fill="#2e2e32" id="circle11890" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1476" cy="807.93884" r="3" fill="#2e2e32" id="circle11891" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1434" cy="814.93884" r="3" fill="#2e2e32" id="circle11980" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1441" cy="814.93884" r="3" fill="#2e2e32" id="circle11981" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1448" cy="814.93884" r="3" fill="#2e2e32" id="circle11982" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1455" cy="814.93884" r="3" fill="#2e2e32" id="circle11983" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1462" cy="814.93884" r="3" fill="#2e2e32" id="circle11984" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1469" cy="814.93884" r="3" fill="#2e2e32" id="circle11985" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1476" cy="814.93884" r="3" fill="#2e2e32" id="circle11986" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1441" cy="821.93884" r="3" fill="#2e2e32" id="circle12076" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1448" cy="821.93884" r="3" fill="#2e2e32" id="circle12077" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1455" cy="821.93884" r="3" fill="#2e2e32" id="circle12078" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1462" cy="821.93884" r="3" fill="#2e2e32" id="circle12079" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1469" cy="821.93884" r="3" fill="#2e2e32" id="circle12080" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1448" cy="828.93884" r="3" fill="#2e2e32" id="circle12172" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1455" cy="828.93884" r="3" fill="#2e2e32" id="circle12173" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
    <circle cx="1462" cy="828.93884" r="3" fill="#2e2e32" id="circle12174" transform="matrix(0.8,0,0,0.8,56.8,-18.413441)" />
  </g>
  <rect x="-1168.8" y="-1.599999" width="58.400002" height="41.599998" rx="0" fill="#2e2e32" id="rect5" style="display:inline;fill:#000000;fill-opacity:1;stroke-width:0.264462" transform="matrix(1.25,0,0,1.25,1502,783.93885)" />
  <g id="g3" transform="translate(-71,1.25e-5)" style="display:inline">
    <circle cx="117" cy="786.93884" r="3" fill="#2e2e32" id="circle10848" />
    <circle cx="124" cy="786.93884" r="3" fill="#2e2e32" id="circle10849" />
    <circle cx="131" cy="786.93884" r="3" fill="#2e2e32" id="circle10850" />
    <circle cx="159" cy="786.93884" r="3" fill="#2e2e32" id="circle10854" />
    <circle cx="166" cy="786.93884" r="3" fill="#2e2e32" id="circle10855" />
    <circle cx="173" cy="786.93884" r="3" fill="#2e2e32" id="circle10856" />
    <circle cx="180" cy="786.93884" r="3" fill="#2e2e32" id="circle10857" />
    <circle cx="117" cy="793.93884" r="3" fill="#2e2e32" id="circle10943" />
    <circle cx="124" cy="793.93884" r="3" fill="#2e2e32" id="circle10944" />
    <circle cx="166" cy="793.93884" r="3" fill="#2e2e32" id="circle10950" />
    <circle cx="173" cy="793.93884" r="3" fill="#2e2e32" id="circle10951" />
    <circle cx="180" cy="793.93884" r="3" fill="#2e2e32" id="circle10952" />
    <circle cx="117" cy="800.93884" r="3" fill="#2e2e32" id="circle11038" />
    <circle cx="173" cy="800.93884" r="3" fill="#2e2e32" id="circle11046" />
    <circle cx="180" cy="800.93884" r="3" fill="#2e2e32" id="circle11047" />
    <circle cx="117" cy="807.93884" r="3" fill="#2e2e32" id="circle11133" />
    <circle cx="173" cy="807.93884" r="3" fill="#2e2e32" id="circle11141" />
    <circle cx="180" cy="807.93884" r="3" fill="#2e2e32" id="circle11142" />
    <circle cx="117" cy="814.93884" r="3" fill="#2e2e32" id="circle11228" />
    <circle cx="173" cy="814.93884" r="3" fill="#2e2e32" id="circle11236" />
    <circle cx="180" cy="814.93884" r="3" fill="#2e2e32" id="circle11237" />
    <circle cx="117" cy="821.93884" r="3" fill="#2e2e32" id="circle11323" />
    <circle cx="124" cy="821.93884" r="3" fill="#2e2e32" id="circle11324" />
    <circle cx="166" cy="821.93884" r="3" fill="#2e2e32" id="circle11330" />
    <circle cx="173" cy="821.93884" r="3" fill="#2e2e32" id="circle11331" />
    <circle cx="180" cy="821.93884" r="3" fill="#2e2e32" id="circle11332" />
    <circle cx="117" cy="828.93884" r="3" fill="#2e2e32" id="circle11418" />
    <circle cx="124" cy="828.93884" r="3" fill="#2e2e32" id="circle11419" />
    <circle cx="131" cy="828.93884" r="3" fill="#2e2e32" id="circle11420" />
    <circle cx="159" cy="828.93884" r="3" fill="#2e2e32" id="circle11424" />
    <circle cx="166" cy="828.93884" r="3" fill="#2e2e32" id="circle11425" />
    <circle cx="173" cy="828.93884" r="3" fill="#2e2e32" id="circle11426" />
    <circle cx="180" cy="828.93884" r="3" fill="#2e2e32" id="circle11427" />
  </g>
  <g id="g7" transform="translate(-71,1.25e-5)" style="display:inline">
    <circle cx="138" cy="786.93884" r="3" fill="#2e2e32" id="circle10851" />
    <circle cx="145" cy="786.93884" r="3" fill="#2e2e32" id="circle10852" />
    <circle cx="152" cy="786.93884" r="3" fill="#2e2e32" id="circle10853" />
    <circle cx="131" cy="793.93884" r="3" fill="#2e2e32" id="circle10945" />
    <circle cx="138" cy="793.93884" r="3" fill="#2e2e32" id="circle10946" />
    <circle cx="145" cy="793.93884" r="3" fill="#2e2e32" id="circle10947" />
    <circle cx="152" cy="793.93884" r="3" fill="#2e2e32" id="circle10948" />
    <circle cx="159" cy="793.93884" r="3" fill="#2e2e32" id="circle10949" />
    <circle cx="124" cy="800.93884" r="3" fill="#2e2e32" id="circle11039" />
    <circle cx="131" cy="800.93884" r="3" fill="#2e2e32" id="circle11040" />
    <circle cx="138" cy="800.93884" r="3" fill="#2e2e32" id="circle11041" />
    <circle cx="145" cy="800.93884" r="3" fill="#2e2e32" id="circle11042" />
    <circle cx="152" cy="800.93884" r="3" fill="#2e2e32" id="circle11043" />
    <circle cx="159" cy="800.93884" r="3" fill="#2e2e32" id="circle11044" />
    <circle cx="166" cy="800.93884" r="3" fill="#2e2e32" id="circle11045" />
    <circle cx="124" cy="807.93884" r="3" fill="#2e2e32" id="circle11134" />
    <circle cx="131" cy="807.93884" r="3" fill="#2e2e32" id="circle11135" />
    <circle cx="138" cy="807.93884" r="3" fill="#2e2e32" id="circle11136" />
    <circle cx="145" cy="807.93884" r="3" fill="#2e2e32" id="circle11137" />
    <circle cx="152" cy="807.93884" r="3" fill="#2e2e32" id="circle11138" />
    <circle cx="159" cy="807.93884" r="3" fill="#2e2e32" id="circle11139" />
    <circle cx="166" cy="807.93884" r="3" fill="#2e2e32" id="circle11140" />
    <circle cx="124" cy="814.93884" r="3" fill="#2e2e32" id="circle11229" />
    <circle cx="131" cy="814.93884" r="3" fill="#2e2e32" id="circle11230" />
    <circle cx="138" cy="814.93884" r="3" fill="#2e2e32" id="circle11231" />
    <circle cx="145" cy="814.93884" r="3" fill="#2e2e32" id="circle11232" />
    <circle cx="152" cy="814.93884" r="3" fill="#2e2e32" id="circle11233" />
    <circle cx="159" cy="814.93884" r="3" fill="#2e2e32" id="circle11234" />
    <circle cx="166" cy="814.93884" r="3" fill="#2e2e32" id="circle11235" />
    <circle cx="131" cy="821.93884" r="3" fill="#2e2e32" id="circle11325" />
    <circle cx="138" cy="821.93884" r="3" fill="#2e2e32" id="circle11326" />
    <circle cx="145" cy="821.93884" r="3" fill="#2e2e32" id="circle11327" />
    <circle cx="152" cy="821.93884" r="3" fill="#2e2e32" id="circle11328" />
    <circle cx="159" cy="821.93884" r="3" fill="#2e2e32" id="circle11329" />
    <circle cx="138" cy="828.93884" r="3" fill="#2e2e32" id="circle11421" />
    <circle cx="145" cy="828.93884" r="3" fill="#2e2e32" id="circle11422" />
    <circle cx="152" cy="828.93884" r="3" fill="#2e2e32" id="circle11423" />
  </g>
</g>

<text x="1264" y="691.98657" text-anchor="end" font-family="sans-serif" font-size="14.4" fill="#ffffff" fill-opacity="0.25" letter-spacing="0.5">familiada.online</text>`;
}

function render(svg, bgLayer, d, colors, controls) {
  svg.setAttribute("viewBox", "0 0 1280 720");
  svg.innerHTML = buildSvgContent(d);
  applyControls(svg, controls);
  bgLayer.style.background = computeBg(colors);
}

export function createTheme(baseSvg, bgLayer, config = {}) {
  let colors   = { ...DEFAULT_COLORS, ...config.colors };
  let controls = { A: false, B: false, ...config.controls };

  const derived = computeDerived(colors);
  render(baseSvg, bgLayer, derived, colors, controls);

  return {
    name: "classic",
    displays: {
      big:        { cx: 640,    cy: 341.6 },
      leftPanel:  { cx: 88.7,   cy: 341.6 },
      rightPanel: { cx: 1191.4, cy: 341.6 },
      topPanel:   { cx: 640,    cy: 65.9  },
      long1:      { cx: 356.8,  cy: 628.0 },
      long2:      { cx: 923.2,  cy: 628.0 },
    },
    multiplier: 1.0,
    updateColors(newColors) {
      Object.assign(colors, newColors);
      const d = computeDerived(colors);
      render(baseSvg, bgLayer, d, colors, controls);
    },
    updateControls(newControls) {
      Object.assign(controls, newControls);
      applyControls(baseSvg, controls);
    },
    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
  };
}
