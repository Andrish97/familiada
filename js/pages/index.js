import { getUser } from "../core/auth.js";
import { initI18n, withLangParam, applyTranslations, getUiLang } from "../../translation/translation.js";
import { isGuestUser } from "../core/guest-mode.js";

async function redirectIfSession() {
  try {
    const user = await getUser();
    if (user) {
      if (isGuestUser(user)) return false;
      if (!user.username) {
        location.replace(withLangParam("login?setup=username"));
        return true;
      }
      location.replace(withLangParam("builder"));
      return true;
    }
  } catch (e) {
    console.warn("[index] session check failed:", e);
  }
  return false;
}

/* ---------- images (lang) ---------- */

function buildLangImgUrl(lang, file) {
  return new URL(`img/${lang}/${file}`, location.href).toString();
}

function setImgLoaded(img) {
  if (!img) return;
  if (img.complete && img.naturalWidth > 0) {
    img.classList.add("is-loaded");
    return;
  }
  img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
  img.addEventListener("error", () => img.classList.add("is-loaded"), { once: true });
}

function switchLandingImages(lang) {
  document.querySelectorAll(".shot-img").forEach((img) => {
    const file = img.dataset.file;
    if (!file) return;
    const next = buildLangImgUrl(lang, file);
    if (img.src === next) { setImgLoaded(img); return; }
    img.classList.remove("is-loaded");
    img.src = next;
    setImgLoaded(img);
  });
}

/* ---------- pipeline nav ---------- */

function initPipeline() {
  const wrap = document.getElementById("pipeline");
  const fill = document.getElementById("pipelineFill");
  if (!wrap || !fill) return;

  const nodes = Array.from(wrap.querySelectorAll(".pipeline-node"));
  const sections = nodes.map((n) => document.getElementById(n.dataset.target));
  const hero = document.querySelector(".hero-card");

  nodes.forEach((node, i) => {
    node.addEventListener("click", () => {
      sections[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  function update() {
    const scrollY = window.scrollY;
    const winH = window.innerHeight;

    // Show after hero
    if (hero) {
      wrap.classList.toggle("is-visible", hero.getBoundingClientRect().bottom < 10);
    }

    // Which section + progress within it
    let activeIdx = -1;
    let progress = 0;

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!s) continue;
      const rect = s.getBoundingClientRect();
      if (rect.top <= winH * 0.4) {
        activeIdx = i;
        const sectionTop = scrollY + rect.top;
        progress = Math.min(1, Math.max(0, (scrollY - sectionTop + winH * 0.4) / rect.height));
      }
    }

    // Node states
    nodes.forEach((node, i) => {
      node.classList.remove("is-active", "is-filled");
      if (i < activeIdx) node.classList.add("is-filled");
      else if (i === activeIdx) node.classList.add("is-active");
    });

    // Fill bar
    if (activeIdx < 0) { fill.style.width = "0%"; return; }
    const n = sections.length;
    const seg = 100 / (n - 1);
    const total = Math.min(100, activeIdx * seg + progress * seg);
    fill.style.width = total + "%";
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
}

/* ---------- image viewer ---------- */

function initImageViewer() {
  const overlay = document.createElement("div");
  overlay.className = "imgv-overlay";
  overlay.innerHTML = `
    <div class="imgv-panel" role="dialog" aria-modal="true">
      <div class="imgv-top">
        <div class="imgv-title" id="imgvTitle"></div>
        <button class="imgv-close btn" type="button" id="imgvClose" aria-label="Close">✕</button>
      </div>
      <div class="imgv-stage" id="imgvStage"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const stage = overlay.querySelector("#imgvStage");
  const closeBtn = overlay.querySelector("#imgvClose");
  const titleEl = overlay.querySelector("#imgvTitle");

  let currentImg = null;
  let scale = 1, tx = 0, ty = 0;
  let startDist = 0, startScale = 1;
  let pointers = new Map();
  let lastPan = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const setTransform = () => currentImg && (currentImg.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${scale})`);
  const resetZoom = () => { scale = 1; tx = 0; ty = 0; setTransform(); };

  const open = (src, title) => {
    stage.innerHTML = "";
    titleEl.textContent = title || "";
    const isMobile = window.matchMedia("(max-width: 900px)").matches;

    if (isMobile) {
      const zoom = document.createElement("div");
      zoom.className = "imgv-zoom";
      const img = document.createElement("img");
      img.className = "imgv-img"; img.src = src; img.alt = title || "";
      zoom.appendChild(img); stage.appendChild(zoom);
      currentImg = img; resetZoom(); bindMobileZoom(zoom);
    } else {
      const img = document.createElement("img");
      img.className = "imgv-img"; img.src = src; img.alt = title || "";
      stage.appendChild(img); currentImg = img;
    }

    overlay.classList.add("is-open");
    document.body.classList.add("topbar-mobile-lock");
  };

  const close = () => {
    overlay.classList.remove("is-open");
    document.body.classList.remove("topbar-mobile-lock");
    stage.innerHTML = ""; currentImg = null;
    pointers.clear(); startDist = 0; lastPan = null;
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
  });

  document.addEventListener("click", (e) => {
    const shot = e.target.closest(".tile-shot");
    if (!shot) return;
    const img = shot.querySelector(".shot-img");
    if (!img) return;
    open(img.currentSrc || img.src, img.getAttribute("alt") || "");
  });

  function bindMobileZoom(root) {
    pointers.clear(); lastPan = null; startDist = 0; startScale = scale;

    root.onpointerdown = (e) => {
      root.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };

    root.onpointermove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.values()];

      if (pts.length === 1 && scale > 1) {
        const p = pts[0];
        if (!lastPan) lastPan = { x: p.x, y: p.y };
        tx += p.x - lastPan.x; ty += p.y - lastPan.y;
        lastPan = { x: p.x, y: p.y }; setTransform(); return;
      }

      if (pts.length === 2) {
        const [a, b] = pts;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (!startDist) { startDist = dist; startScale = scale; lastPan = null; return; }
        scale = clamp(startScale * (dist / startDist), 1, 4); setTransform();
      }
    };

    root.onpointerup = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) startDist = 0;
      if (pointers.size === 0) lastPan = null;
    };
    root.onpointercancel = root.onpointerup;

    let lastTap = 0;
    root.ontouchend = () => {
      const now = Date.now();
      if (now - lastTap < 280) resetZoom();
      lastTap = now;
    };
  }
}

/* ---------- boot ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: true });
  applyTranslations();

  const cta = document.getElementById("ctaStart");
  if (cta) cta.href = withLangParam("login");

  const lang = getUiLang();
  switchLandingImages(lang);

  window.addEventListener("i18n:lang", (e) => switchLandingImages(e.detail.lang));

  initPipeline();
  initImageViewer();

  await redirectIfSession();
});
