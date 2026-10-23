#!/usr/bin/env node
// Audyt układu na scenach zrzutów (decyzje 2026-10-23, docs/wspolne-style-plan.md
// „Zakazy przewijania i zawijania”): na każdej scenie i urządzeniu sprawdza
//   - poziome przewijanie strony (zakazane wszędzie),
//   - przewijanie dokumentu na stronach, gdzie jest zakazane (SCROLL_POLICY),
//   - treść ukrytą przez obcięcie (overflow:hidden/clip bez wielokropka;
//     wielokropek ma pełny tekst w podpowiedzi core/tooltips.js),
//   - elementy sterujące poza ekranem albo zasłonięte przez przodka bez scrolla,
//   - elementy sterujące i tekst w strefie safe area (wyspa aparatu, pasek gestu).
//
//   node scripts/screens/audit-layout.cjs --scenes=games,polls   (opcje jak run.cjs)
//   node scripts/screens/audit-layout.cjs --all --devices=phone,phone-landscape
// Domyślne urządzenia: phone, phone-landscape, tablet, desktop, desktop-short.
// Wynik: <out>/audit.json i lista w konsoli; kod 1, gdy są błędy (--strict).
// Uruchamia run.cjs z --audit (te same sceny, dane i kroki co zrzuty).

// Strony, na których dokument może się przewijać (reszta: przewija się
// tylko obszar roboczy/lista; e20-kategorie-stron.md „Typ scrolla”).
const SCROLL_POLICY = {
  global: [/^\/$/, /^\/marketplace\//, /^\/account\//, /^\/manual\//, /^\/privacy\//, /^\/settings\//, /^\/login\//],
};

// Elementy, które nie mogą się zawijać (decyzje: e20-uwagi-do-korekty.md,
// ujednolicenie-wygladu.md; lista w wspolne-style-plan.md „Zakazy…”).
const NO_WRAP = ["#navMore", "#btnMySent", ".topbar .btn"];

// Funkcja wykonywana w stronie (page.evaluate). opts: { path, safe, allowDocScroll }.
function inspectLayout(opts) {
  const NO_WRAP = opts.noWrap || [];
  const out = [];
  const W = innerWidth, H = innerHeight;
  const safe = { top: 0, right: 0, bottom: 0, left: 0, ...(opts.safe || {}) };
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].slice(0, 3);
    if (cls.length) s += `.${cls.join(".")}`;
    return s;
  };
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      parts.unshift(label(e));
      if (e.id) break;
    }
    return parts.join(" > ");
  };
  const add = (kind, el, detail) => out.push({ kind, el: el ? path(el) : "", detail: detail || "" });
  const visible = (el) => {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
      if (e.inert || e.getAttribute("aria-hidden") === "true") return false;
    }
    return true;
  };
  const scrollable = (st) => /(auto|scroll)/.test(st.overflowY) || /(auto|scroll)/.test(st.overflowX);

  // Nakładka blokująca (ekran „Obróć urządzenie”, brak dostępu, blokada zasobu):
  // strona pod nią jest niedostępna z założenia — audyt sprawdza samą nakładkę.
  const guard = [...document.querySelectorAll(".blocking-overlay")].find((el) => visible(el));
  const root = guard || document.body;

  // 1. Dokument.
  const doc = document.scrollingElement || document.documentElement;
  if (doc.scrollWidth > W + 1) add("poziome-przewijanie", null, `${doc.scrollWidth}px > ${W}px`);
  if (doc.scrollHeight > H + 1 && !guard) {
    const st = getComputedStyle(document.body), hs = getComputedStyle(document.documentElement);
    const locked = /hidden|clip/.test(st.overflowY) || /hidden|clip/.test(hs.overflowY);
    if (locked) add("ucieta-strona", null, `treść ${doc.scrollHeight}px > ekran ${H}px przy zablokowanym przewijaniu`);
    else if (!opts.allowDocScroll) add("przewijanie-strony", null, `${doc.scrollHeight}px > ${H}px`);
  }

  // 2. Obcięcia i wielokropki.
  const all = [...root.querySelectorAll("*")].filter((el) => !el.closest("svg, canvas, video, iframe, [data-audit-skip]"));
  for (const el of all) {
    if (/^(INPUT|TEXTAREA|SELECT|IMG|PICTURE|OPTION|SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName)) continue;
    const st = getComputedStyle(el);
    const clipX = /hidden|clip/.test(st.overflowX), clipY = /hidden|clip/.test(st.overflowY);
    if (!clipX && !clipY) continue;
    const overX = clipX && el.scrollWidth > el.clientWidth + 1;
    const overY = clipY && el.scrollHeight > el.clientHeight + 1;
    if (!overX && !overY) continue;
    if (!visible(el)) continue;
    // Napis tylko dla czytników (sr-only, etykieta zwinięta do ikony) — ukryty celowo.
    if (el.clientWidth <= 2 || el.clientHeight <= 2 || (st.clip && st.clip !== "auto") || st.clipPath !== "none") continue;
    // Wielokropek: pełny tekst daje podpowiedź (core/tooltips.js — najechanie,
    // fokus, przytrzymanie na dotyku); naturalność ocenia się na zrzucie.
    if (st.textOverflow === "ellipsis" || Number(st.webkitLineClamp) > 0) continue;
    // Obcięcie widocznych dzieci (nie ozdobników o pointer-events:none / absolutnych tłach).
    const er = el.getBoundingClientRect();
    const hidden = [...el.querySelectorAll("*")].filter((c) => {
      if (!visible(c)) return false;
      const cs = getComputedStyle(c);
      if (cs.pointerEvents === "none" && !c.textContent.trim()) return false;
      const r = c.getBoundingClientRect();
      return (overX && (r.right > er.right + 2 || r.left < er.left - 2)) || (overY && (r.bottom > er.bottom + 2 || r.top < er.top - 2));
    });
    const leaves = hidden.filter((c) => !hidden.some((d) => d !== c && c.contains(d)));
    const meaningful = leaves.filter((c) => c.textContent.trim() || c.matches("button,a,input,select,textarea,[role=button],[tabindex]"));
    if (meaningful.length) add("ukryta-tresc", el, `${overX ? "w poziomie " : ""}${overY ? "w pionie " : ""}${meaningful.length} el. (${label(meaningful[0])})`);
    else if (!leaves.length && el.textContent.trim() && el.children.length === 0) add("uciety-tekst", el, el.textContent.trim().slice(0, 40));
  }

  // 3. Sterowanie poza ekranem / zasłonięte / w safe area.
  const controls = [...root.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [tabindex]:not([tabindex='-1'])")]
    .filter((el) => !el.closest("svg, [data-audit-skip]") && visible(el));
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    // Przodek z przewijaniem może pokazać element — wtedy liczy się tylko jego okno.
    let box = { left: 0, top: 0, right: W, bottom: H }, scroller = null, clipper = null;
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (scrollable(st) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) { scroller = e; break; }
      if (/hidden|clip/.test(st.overflowX + st.overflowY)) {
        const pr = e.getBoundingClientRect();
        if (r.right <= pr.left + 1 || r.left >= pr.right - 1 || r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1) { clipper = e; break; }
      }
      if (st.position === "fixed") break;
    }
    if (clipper) { add("sterowanie-zasloniete", el, `przez ${label(clipper)}`); continue; }
    if (scroller) continue;
    if (!opts.allowDocScroll && (r.bottom > box.bottom + 1 || r.right > box.right + 1 || r.left < box.left - 1 || r.top < box.top - 1)) {
      add("sterowanie-poza-ekranem", el, `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      continue;
    }
    const inSafe = (r.top < safe.top - 1 && safe.top) || (r.bottom > H - safe.bottom + 1 && safe.bottom && r.top < H)
      || (r.left < safe.left - 1 && safe.left) || (r.right > W - safe.right + 1 && safe.right);
    if (inSafe && (!opts.allowDocScroll || el.closest("[style*=fixed], .topbar, footer, .footer, .bottom-bar") || getComputedStyle(el).position === "fixed")) add("safe-area", el, `${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`);
  }
  // 4. Zakazy zawijania: element w jednym wierszu; stopka — części obok siebie.
  for (const el of root.querySelectorAll(NO_WRAP.join(","))) {
    if (!visible(el)) continue;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top / (lh * 0.6))));
    if (lines.size > 1) add("zawiniete", el, `${lines.size} wiersze`);
  }
  for (const foot of root.querySelectorAll(".footer")) {
    if (!visible(foot)) continue;
    const parts = [...foot.children].filter((c) => visible(c) && getComputedStyle(c).position !== "absolute");
    for (let i = 1; i < parts.length; i++) {
      const a = parts[i - 1].getBoundingClientRect(), b = parts[i].getBoundingClientRect();
      if (b.top >= a.bottom - 1) add("stopka-pod-soba", parts[i], "część stopki spadła pod poprzednią");
    }
  }

  // Uniknąć powtórzeń (te same elementy w listach).
  const seen = new Set();
  return out.filter((p) => { const k = `${p.kind}|${p.el.replace(/:\d+/g, "")}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const allowDocScroll = (path) => SCROLL_POLICY.global.some((re) => re.test(path.split(/[?#]/)[0]));

module.exports = { inspectLayout, allowDocScroll, SCROLL_POLICY, NO_WRAP };

if (require.main === module) {
  const { spawnSync } = require("node:child_process");
  const argv = process.argv.slice(2);
  if (!argv.some((a) => a.startsWith("--devices"))) argv.push("--devices=phone,phone-landscape,tablet,desktop,desktop-short", "--force-devices");
  if (!argv.some((a) => a.startsWith("--out"))) argv.push("--out=scripts/screens/out-audit");
  const r = spawnSync(process.execPath, [require.resolve("./run.cjs"), "--audit", ...argv], { stdio: "inherit" });
  process.exitCode = r.status ?? 1;
}
