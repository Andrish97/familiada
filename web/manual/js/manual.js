// manual/js/manual.js
// Podręcznik (E13): części → rozdziały → podrozdziały. Treść z content/{lang}.js
// (generowana z docs/podrecznik przez scripts/manual/build-content.mjs).
// Adres: ?ch=<rozdział>#s-<podrozdział> (np. ?ch=7#s-7-3); bez ?ch= — spis treści.
// Zmiana rozdziału to replaceState (jak karty, tabs.js): „Wstecz” wraca do poprzedniej strony.
// Strona ma działać nawet bez auth: najpierw treść, potem initPage „miękko”.

import { initI18n, setUiLang, getUiLang, t } from "../../shared/translation/translation.js?v=v2026-10-22T00131";
import { initPage } from "../../shared/js/core/page-init.js?v=v2026-10-22T00131";
import { hydrateIcons } from "../../shared/js/core/icons.js?v=v2026-10-22T00131";
import "../../shared/js/core/contact-modal.js?v=v2026-10-22T00131";

const CONTENT = {
  pl: () => import("../content/pl.js?v=v2026-10-22T00131"),
  en: () => import("../content/en.js?v=v2026-10-22T00131"),
  uk: () => import("../content/uk.js?v=v2026-10-22T00131"),
};
export const CHAPTER_PARAM = "ch";

const article = document.getElementById("manualArticle");
const content = document.getElementById("manualContent");
const toc = document.getElementById("manualToc");
const tocToggle = document.getElementById("manualTocToggle");
const tocBackdrop = document.getElementById("manualTocBackdrop");
const currentLabel = document.getElementById("manualCurrent");

let manual = null;
let current = null;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const chapterHref = (id, hash = "") => {
  const u = new URL(location.href);
  if (id) u.searchParams.set(CHAPTER_PARAM, id); else u.searchParams.delete(CHAPTER_PARAM);
  u.hash = hash;
  return u.pathname + u.search + u.hash;
};
const findChapter = (id) => manual?.chapters.find((c) => c.id === id) || null;
const partOf = (id) => manual?.parts.find((p) => p.chapters.includes(id)) || null;

async function initManualI18n() {
  const params = new URLSearchParams(location.search);
  if (!params.has("lang") && !localStorage.getItem("uiLang")) {
    await setUiLang("pl", { persist: true, updateUrl: true, apply: false });
  }
  await initI18n({ withSwitcher: true });
}

async function loadContent(lang) {
  const load = CONTENT[lang] || CONTENT.pl;
  return (await load()).default;
}

const sectionId = (id) => `s-${id.replace(/\./g, "-")}`;

// Lewy pasek jak w Ustawieniach gry: części jako etykiety, rozdziały jako pozycje,
// podrozdziały otwartego rozdziału jako wcięte pozycje. Bez numerów — numer jest tylko adresem.
function renderToc() {
  toc.innerHTML = manual.parts.map((part) => `
    <div class="m-side-part">${esc(part.title)}</div>
    ${part.chapters.map((id) => {
      const ch = findChapter(id);
      const active = current === id;
      const sections = active ? ch.sections.filter((s) => s.level === 2) : [];
      return `<a class="m-side-item${active ? " active" : ""}" href="${chapterHref(id)}" data-ch="${esc(id)}"${active ? ' aria-current="page"' : ""}>${esc(ch.title)}</a>
        ${sections.map((s) => `<a class="m-side-item m-side-sub" href="${chapterHref(id, `#${sectionId(s.id)}`)}" data-ch="${esc(id)}" data-sec="${esc(s.id)}">${esc(s.title)}</a>`).join("")}`;
    }).join("")}`).join("");
}

function renderStart() {
  article.innerHTML = `
    <header class="m-head">
      <h1 class="m-title">${esc(t("manual.pageTitle"))}</h1>
      <p class="m-lead">${esc(t("manual.startLead"))}</p>
    </header>
    <div class="m-parts">
      ${manual.parts.map((part) => `
        <section class="m-part-card">
          <h2 class="m-part-title">${esc(part.title)}</h2>
          ${part.intro || ""}
          <ol class="m-part-chapters">
            ${part.chapters.map((id) => `<li><a href="${chapterHref(id)}" data-ch="${esc(id)}">${esc(findChapter(id).title)}</a></li>`).join("")}
          </ol>
        </section>`).join("")}
    </div>`;
}

function renderChapter(ch) {
  const order = manual.chapters.map((c) => c.id);
  const idx = order.indexOf(ch.id);
  const prev = idx > 0 ? findChapter(order[idx - 1]) : null;
  const next = idx < order.length - 1 ? findChapter(order[idx + 1]) : null;
  const part = partOf(ch.id);
  const sections = ch.sections.filter((s) => s.level === 2);
  const pager = (c, cls, label) => c
    ? `<a class="m-pager-link ${cls}" href="${chapterHref(c.id)}" data-ch="${esc(c.id)}"><span class="m-pager-label">${esc(label)}</span><span class="m-pager-title">${esc(c.title)}</span></a>`
    : `<span class="m-pager-link ${cls} is-empty"></span>`;
  article.innerHTML = `
    <header class="m-head">
      ${part ? `<div class="m-crumb">${esc(part.title)}</div>` : ""}
      <h1 class="m-title">${esc(ch.title)}</h1>
      ${sections.length > 1 ? `<nav class="m-sections" aria-label="${esc(t("manual.sections"))}">
        <div class="m-sections-title">${esc(t("manual.sections"))}</div>
        <ol>${sections.map((s) => `<li><a href="#${sectionId(s.id)}" data-sec="${esc(s.id)}">${esc(s.title)}</a></li>`).join("")}</ol>
      </nav>` : ""}
    </header>
    <div class="m-doc">${ch.html}</div>
    <nav class="m-pager">
      ${pager(prev, "prev", t("manual.prev"))}
      ${pager(next, "next", t("manual.next"))}
    </nav>`;
}

function scrollToHash(hash, smooth = false) {
  const el = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  if (el) el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  else content.scrollTo({ top: 0 });
  markSection();
}

// Podświetla w pasku podrozdział, który jest właśnie czytany.
function markSection() {
  const heads = [...article.querySelectorAll(".m-doc .m-h2")];
  const top = content.getBoundingClientRect().top + 24;
  let currentId = heads[0]?.id || "";
  for (const h of heads) if (h.getBoundingClientRect().top <= top) currentId = h.id;
  for (const a of toc.querySelectorAll(".m-side-sub")) a.classList.toggle("current", sectionId(a.dataset.sec) === currentId);
}

function show(id, hash = "", { updateUrl = true, smooth = false } = {}) {
  const ch = id ? findChapter(id) : null;
  current = ch ? ch.id : null;
  if (ch) renderChapter(ch); else renderStart();
  renderToc();
  currentLabel.textContent = ch ? ch.title : t("manual.pageTitle");
  hydrateIcons(article);
  setTocOpen(false);
  if (updateUrl) {
    const next = chapterHref(current, ch ? hash : "");
    if (next !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", next);
  }
  scrollToHash(ch ? hash : "", smooth);
}

function setTocOpen(open) {
  toc.classList.toggle("is-open", open);
  tocBackdrop.classList.toggle("is-open", open);
  tocToggle.setAttribute("aria-expanded", String(open));
}

function wireNavigation() {
  // Odnośniki wewnątrz podręcznika (spis, karty części, „→ 7.3”, poprzedni/następny).
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest?.("a[href]");
    if (!a || !a.closest(".m-layout") || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
    const url = new URL(a.getAttribute("href"), location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname) return;
    ev.preventDefault();
    const id = url.searchParams.get(CHAPTER_PARAM) || (url.search ? null : current);
    if (id === current && url.hash) {
      history.replaceState(history.state, "", chapterHref(current, url.hash));
      setTocOpen(false);
      scrollToHash(url.hash, true);
      return;
    }
    show(id, url.hash);
  });
  tocToggle.addEventListener("click", () => setTocOpen(!toc.classList.contains("is-open")));
  tocBackdrop.addEventListener("click", () => setTocOpen(false));
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") setTocOpen(false); });
  let raf = 0;
  content.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(markSection); }, { passive: true });
}

async function renderForLang() {
  manual = await loadContent(getUiLang());
  const params = new URLSearchParams(location.search);
  show(params.get(CHAPTER_PARAM), location.hash, { updateUrl: true });
}

/* ================= Init ================= */
async function init() {
  const i18nP = initManualI18n().catch((err) => {
    console.error("[manual] i18n nieaktywny:", err);
  });
  initPage("manual", { ready: i18nP }).catch((err) => {
    console.warn("[manual] initPage nieaktywny:", err);
  });
  await i18nP;
  wireNavigation();
  try {
    await renderForLang();
  } finally {
    document.documentElement.classList.remove("page-loading");
    document.querySelector("main[data-skel-step]")?.classList.add("skel-step-ready");
  }
}

void init();

window.addEventListener("i18n:lang", () => {
  if (manual) void renderForLang();
});
