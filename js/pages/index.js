import { getUser } from "../core/auth.js?v=v2026-04-23T16383";
import { sb } from "../core/supabase.js?v=v2026-04-23T16383";
import { initI18n, withLangParam, applyTranslations, getUiLang, t } from "../../translation/translation.js?v=v2026-04-23T16383";
import { isGuestUser } from "../core/guest-mode.js?v=v2026-04-23T16383";
import { initRatingSystem } from "../core/rating-system.js?v=v2026-04-23T16383";

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

async function loadRatingStats() {
  const wrap = document.getElementById("ratingBadgeWrap");
  if (!wrap) return;

  try {
    const { data, error } = await sb().rpc("get_app_rating_stats");
    if (error) throw error;
    
    // Stats is an array if called via RPC sometimes, but with our definition it should be an object or row.
    const stats = Array.isArray(data) ? data[0] : data;
    if (!stats || Number(stats.total_count) < 1) return;

    const avg = Number(stats.avg_stars);
    const count = Number(stats.total_count);

    const fullStars = Math.floor(avg);
    const halfStar = avg % 1 >= 0.5;
    const starsStr = "★".repeat(fullStars) + (halfStar ? "½" : "") + "☆".repeat(Math.max(0, 5 - fullStars - (halfStar ? 1 : 0)));

    wrap.innerHTML = `
      <div class="rating-badge-index">
        <span class="stars">${starsStr}</span>
        <span class="score">${avg}/5</span>
        <span class="count">(${count})</span>
      </div>
    `;
  } catch (e) {
    console.warn("[index] loadRatingStats failed:", e);
  }
}

/* ---------- images (lang) ---------- */

function buildLangImgUrl(lang, file) {
  return new URL(`img/${lang}/${file}`, location.href).toString();
}

function setImgLoaded(img) {
  if (!img) return;
  if (img.complete && img.naturalWidth > 0) { img.classList.add("is-loaded"); return; }
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
  const topbar = document.querySelector(".topbar");
  if (!wrap) return;

  const pipeline = wrap.querySelector(".pipeline");
  const nodes = Array.from(pipeline.querySelectorAll(".pipeline-node"));
  const sections = nodes.map((n) => document.getElementById(n.dataset.target));

  // Usuń stary track jeśli był
  pipeline.querySelectorAll(".pipeline-track").forEach((el) => el.remove());

  // Wstrzyknij linie między przyciski: [node][line][node][line][node]...
  // Iterujemy od końca żeby nie przesuwać indeksów
  const lines = [];
  for (let i = nodes.length - 1; i >= 1; i--) {
    const line = document.createElement("div");
    line.className = "pipeline-line";
    const lineFill = document.createElement("div");
    lineFill.className = "pipeline-line-fill";
    line.appendChild(lineFill);
    // wstaw przed węzłem i
    nodes[i].before(line);
    lines.unshift(line); // lines[0] = linia między węzłem 0 i 1, itd.
  }

  // Kliknięcie scrolluje do sekcji
  nodes.forEach((node, i) => {
    node.addEventListener("click", () => {
      sections[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // Ustaw top rury śledząc dolną krawędź topbara
  function syncTop() {
    if (!topbar) { wrap.style.top = "0px"; return; }
    const bottom = topbar.getBoundingClientRect().bottom;
    wrap.style.top = Math.max(0, bottom) + "px";
    // Body padding musi uwzględniać topbar + pipeline żeby treść nie wchodziła pod pipeline
    requestAnimationFrame(() => {
      const pipelineBottom = wrap.getBoundingClientRect().bottom;
      document.body.style.paddingTop = Math.max(0, pipelineBottom) + "px";
    });
  }

  function update() {
    syncTop();

    const scrollY = window.scrollY;
    const winH = window.innerHeight;
    let activeIdx = -1;
    let progress = 0;

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!s) continue;
      const rect = s.getBoundingClientRect();
      if (rect.top <= winH * 0.38) {
        activeIdx = i;
        const sectionTop = scrollY + rect.top;
        progress = Math.min(1, Math.max(0, (scrollY - sectionTop + winH * 0.38) / rect.height));
      }
    }

    // Stany przycisków
    nodes.forEach((node, i) => {
      node.classList.toggle("is-filled", i <= activeIdx);
      node.classList.toggle("is-active", i === activeIdx);
    });

    // Stany linii
    // linia[i] łączy węzeł i z węzłem i+1
    // linia pełna jeśli węzeł i+1 jest osiągnięty (is-filled)
    // linia częściowa jeśli i === activeIdx (w trakcie scrollowania przez sekcję)
    lines.forEach((line, i) => {
      const fill = line.querySelector(".pipeline-line-fill");
      if (i < activeIdx) {
        fill.style.width = "100%";
      } else if (i === activeIdx) {
        fill.style.width = (progress * 100) + "%";
      } else {
        fill.style.width = "0%";
      }
    });
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });

  // Śledź animację chowania topbara (klasa is-hidden-mobile, transition ~0.22s)
  if (topbar) {
    const observer = new MutationObserver(() => {
      const duration = 260;
      let elapsed = 0;
      const tick = () => {
        syncTop();
        elapsed += 16;
        if (elapsed < duration) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    observer.observe(topbar, { attributes: true, attributeFilter: ["class"] });
  }

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
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("is-open")) close(); });

  document.addEventListener("click", (e) => {
    const shot = e.target.closest(".tile-shot");
    if (!shot) return;
    const img = shot.querySelector(".shot-img");
    if (img) open(img.currentSrc || img.src, img.getAttribute("alt") || "");
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
  initRatingSystem();
  applyTranslations();

  const cta = document.getElementById("ctaStart");
  if (cta) cta.href = withLangParam("login");

  const lang = getUiLang();
  switchLandingImages(lang);
  window.addEventListener("i18n:lang", (e) => switchLandingImages(e.detail.lang));

  initPipeline();
  initImageViewer();

  await redirectIfSession();
  await loadRatingStats();

  // Tab Title Animation (Accepted)
  const originalTitle = document.title;
  window.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      const messages = ["Wracaj do gry! 🎮", "Suchar czeka... 🤣", "Pytanie: więcej niż jedno zwierzę? 🐑"];
      document.title = messages[Math.floor(Math.random() * messages.length)];
    } else {
      document.title = originalTitle;
    }
  });

  // Persistent Teaser Logic (Accepted)
  const teaser = document.getElementById("quickPollTeaser");
  if (teaser) {
    if (localStorage.getItem("fam:teaser_clicked")) {
      teaser.style.display = "none";
    } else {
      teaser.querySelectorAll(".teaser-btn").forEach(btn => {
        btn.addEventListener("click", function() {
          const pts = this.dataset.pts;
          const txt = this.innerText;
          this.innerHTML = `${txt} (${pts} pkt!)`;
          this.style.background = "var(--gold)";
          this.style.color = "#000";
          localStorage.setItem("fam:teaser_clicked", "1");
          setTimeout(() => {
            teaser.style.opacity = "0";
            teaser.style.transition = "opacity 0.5s ease";
            setTimeout(() => teaser.style.display = "none", 500);
          }, 2000);
        });
      });
    }
  }

  // Console Joke (Accepted)
  const suchary = [
    "Dlaczego matematyka jest smutna? Bo ma dużo problemów.",
    "Co mówi ryba, gdy uderzy w ścianę? Dam!",
    "Jak się nazywa ser, który nie jest twój? Nacho cheese.",
    "Co robią policjanci w kinie? Śledzą akcję."
  ];
});
