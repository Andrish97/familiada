import { guardViewportWidth } from "../../shared/js/core/device-guard.js?v=v2026-10-19T13143";
guardViewportWidth({ minWidth: 0 });
import { getUser } from "../../shared/js/core/auth.js?v=v2026-10-19T13143";
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-19T13143";
import { initI18n, withLangParam, applyTranslations, getUiLang, t } from "../../shared/translation/translation.js?v=v2026-10-19T13143";
import { isGuestUser } from "../../shared/js/core/guest-mode.js?v=v2026-10-19T13143";
import { icon, starRating } from "../../shared/js/core/icons.js?v=v2026-10-19T13143";
import { enterModalSheet, exitModalSheet, isSheetViewport } from "../../shared/js/core/modal-sheet.js?v=v2026-10-19T13143";
import { initPinchZoom, lockPageZoomForPreview, unlockPageZoomAfterPreview } from "../../shared/js/core/pinch-zoom.js?v=v2026-10-19T13143";


async function redirectIfSession() {
  try {
    const user = await getUser();
    if (user) {
      // Gość ma prawie pełne konto: od razu /games/ (nawigacja, decyzja 2026-10-07).
      if (isGuestUser(user)) {
        location.replace(withLangParam("/games/"));
        return true;
      }
      if (!user.username) {
        location.replace(withLangParam("/login/?setup=username"));
        return true;
      }
      location.replace(withLangParam("/games/"));
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
    if (!Number.isFinite(avg) || !Number.isSafeInteger(count) || avg < 0 || avg > 5 || count < 1) return;

    const starsStr = starRating(avg);

    wrap.innerHTML = `
      <div class="rating-badge-index">
        <span class="stars" role="img" aria-label="${avg}/5">${starsStr}</span>
        <span class="score">${avg}/5</span>
        <span class="count">(${count})</span>
      </div>
    `;
  } catch (e) {
    console.warn("[index] loadRatingStats failed:", e);
  }
}

function updateInternalLinks() {
  document.querySelectorAll("main a[href]").forEach((link) => {
    if (!link.dataset.baseHref) link.dataset.baseHref = link.getAttribute("href") || "";
    const baseHref = link.dataset.baseHref;
    if (!baseHref || baseHref.startsWith("#")) return;
    const url = new URL(baseHref, location.href);
    if (url.origin !== location.origin) return;
    link.href = withLangParam(url.toString());
  });
}

function updateStructuredFaq() {
  const schema = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .find((node) => {
      try { return JSON.parse(node.textContent)?.["@type"] === "FAQPage"; }
      catch { return false; }
    });
  if (!schema) return;
  const mainEntity = [...document.querySelectorAll(".faq-item")].map((item) => ({
    "@type": "Question",
    name: item.querySelector(".faq-q")?.textContent?.trim() || "",
    acceptedAnswer: {
      "@type": "Answer",
      text: item.querySelector(".faq-a")?.textContent?.trim() || "",
    },
  })).filter((item) => item.name && item.acceptedAnswer.text);
  schema.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  });
}

/* ---------- images (lang) ---------- */

function buildLangImgUrl(lang, file) {
  return new URL(`/assets/img/${lang}/${file}`, location.href).toString();
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
      const id = sections[i]?.id;
      if (id && location.hash !== `#${id}`) history.pushState(history.state, "", `#${id}`);
      sections[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // Ustaw top rury śledząc dolną krawędź topbara
  function syncTop() {
    if (!topbar) { wrap.style.top = "0px"; return; }
    const topbarBottom = topbar.getBoundingClientRect().bottom;
    wrap.style.top = Math.max(0, topbarBottom) + "px";
    // Body rezerwuje wysokość elementów, nie ich współrzędne ekranowe.
    // Dzięki temu zmiana visualViewport nie dodaje/odejmuje pustego pasa
    // w dokumencie, a po zamknięciu arkusza wraca miejsce na pipeline.
    requestAnimationFrame(() => {
      const topbarHeight = topbar.getBoundingClientRect().height;
      const pipelineHeight = wrap.getBoundingClientRect().height;
      const sheetOpen = document.body.classList.contains("sheet-open");
      document.body.style.paddingTop = Math.max(0, topbarHeight + (sheetOpen ? 0 : pipelineHeight)) + "px";
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

    // Stany przycisków i adres bieżącej sekcji. replaceState nie zaśmieca
    // historii podczas zwykłego przewijania.
    nodes.forEach((node, i) => {
      node.classList.toggle("is-filled", i <= activeIdx);
      node.classList.toggle("is-active", i === activeIdx);
    });
    const activeId = sections[activeIdx]?.id;
    if (activeId && location.hash !== `#${activeId}`) {
      history.replaceState(history.state, "", `#${activeId}`);
    }

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
  window.visualViewport?.addEventListener("resize", syncTop, { passive: true });
  window.visualViewport?.addEventListener("scroll", syncTop, { passive: true });
  const sheetObserver = new MutationObserver(() => syncTop());
  sheetObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

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

/* ---------- FAQ: strzałka rozwijania (ta sama co w listach) ---------- */

function initFaqCarets() {
  document.querySelectorAll(".faq-q").forEach((q) => {
    if (!q.querySelector(".faq-caret")) q.insertAdjacentHTML("beforeend", icon("caret-down", { className: "faq-caret" }));
  });
}

/* ---------- image viewer ---------- */

function initImageViewer() {
  const overlay = document.createElement("div");
  overlay.id = "imgvOverlay";
  overlay.className = "overlay modal--sheet imgv-overlay";
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="modal imgv-panel" role="dialog" aria-modal="true" aria-labelledby="imgvHeading">
      <div class="imgv-top mHead">
        <h2 class="imgv-title mTitle" id="imgvHeading">${t("home.imageViewer.title")}</h2>
        <button class="btn sm" type="button" id="imgvClose" aria-label="${t("common.modal.closeLabel")}" data-i18n-aria-label="common.modal.closeLabel">${icon("close")}</button>
      </div>
      <p class="imgv-name mSub" id="imgvName"></p>
      <div class="imgv-stage" id="imgvStage"></div>
    </div>
  `;
  const main = document.querySelector("main.wrap");
  const footer = main?.querySelector(":scope > .footer");
  if (main) main.insertBefore(overlay, footer || null);
  else document.body.appendChild(overlay);
  const stage = overlay.querySelector("#imgvStage");
  const closeBtn = overlay.querySelector("#imgvClose");
  const backBtn = document.getElementById("btnImageViewerBack");
  const titleEl = overlay.querySelector("#imgvName");

  let previewZoom = null;
  let previousFocus = null;

  const open = (src, title) => {
    if (overlay.classList.contains("is-open")) return;
    previousFocus = document.activeElement;
    stage.innerHTML = "";
    titleEl.textContent = title || "";
    const isMobile = window.matchMedia("(max-width: 980px)").matches;
    if (isMobile) {
      const zoom = document.createElement("div");
      zoom.className = "imgv-zoom";
      const img = document.createElement("img");
      img.className = "imgv-img"; img.src = src; img.alt = title || "";
      zoom.appendChild(img); stage.appendChild(zoom);
      previewZoom = initPinchZoom(zoom, img);
      lockPageZoomForPreview();
    } else {
      const img = document.createElement("img");
      img.className = "imgv-img"; img.src = src; img.alt = title || "";
      stage.appendChild(img);
    }
    overlay.style.display = "";
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    enterModalSheet(overlay, { backBtn, onClose: close });
    (isSheetViewport() ? backBtn : closeBtn)?.focus();
  };

  const close = () => {
    overlay.classList.remove("is-open");
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    exitModalSheet(overlay);
    previewZoom?.reset();
    previewZoom = null;
    unlockPageZoomAfterPreview();
    stage.innerHTML = "";
    previousFocus?.focus?.();
    previousFocus = null;
  };

  closeBtn.addEventListener("click", close);
  backBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    close();
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("is-open")) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") {
      // W tym prostym dialogu jedynym elementem interaktywnym jest zamknięcie.
      e.preventDefault();
      (isSheetViewport() ? backBtn : closeBtn)?.focus();
    }
  });

  const openShot = (shot) => {
    if (!shot) return;
    const img = shot.querySelector(".shot-img");
    if (img) open(img.currentSrc || img.src, img.getAttribute("alt") || "");
  };

  document.querySelectorAll(".tile-shot").forEach((shot) => {
    const img = shot.querySelector(".shot-img");
    shot.tabIndex = 0;
    shot.setAttribute("role", "button");
    shot.setAttribute("aria-label", t("home.imageViewer.open", { title: img?.alt || "" }));
  });

  document.addEventListener("click", (e) => {
    openShot(e.target.closest(".tile-shot"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const shot = e.target.closest(".tile-shot");
    if (!shot) return;
    e.preventDefault();
    openShot(shot);
  });

}

/* ---------- boot ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initI18n({ withSwitcher: true });
  } catch (e) {
    console.error("[index] i18n init failed:", e);
  } finally {
    // Awaria sesji lub tłumaczeń nie może zostawić pustej strony.
    document.documentElement.classList.remove('page-loading');
  }
  document.querySelector('.topbar')?.classList.add('topbar-ready');
  applyTranslations();
  updateInternalLinks();
  updateStructuredFaq();

  const lang = getUiLang();
  switchLandingImages(lang);
  window.addEventListener("i18n:lang", (e) => {
    switchLandingImages(e.detail.lang);
    updateInternalLinks();
    updateStructuredFaq();
    document.querySelectorAll(".tile-shot").forEach((shot) => {
      const title = shot.querySelector(".shot-img")?.alt || "";
      shot.setAttribute("aria-label", t("home.imageViewer.open", { title }));
    });
  });

  initPipeline();
  initImageViewer();
  initFaqCarets();
  document.querySelector("main[data-skel-step]")?.classList.add("skel-step-ready");

  // Te zapytania są niekrytyczne: landing pozostaje gotowy także przy wolnym
  // lub niedostępnym backendzie, a każde odrzucenie jest jawnie obsłużone.
  void loadRatingStats();
  void redirectIfSession();
});
