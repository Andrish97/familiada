// manual/js/manual.js
// Podręcznik (E13): części → rozdziały → podrozdziały. Treść z content/{lang}.js
// (generowana z docs/podrecznik przez scripts/manual/build-content.mjs).
// Adres: ?ch=<rozdział>#s-<podrozdział> (np. ?ch=7#s-7-3); bez ?ch= — spis treści.
// Zmiana rozdziału to replaceState (jak karty, tabs.js): „Wstecz” wraca do poprzedniej strony.
// Strona ma działać nawet bez auth: najpierw treść, potem initPage „miękko”.

import { initI18n, setUiLang, getUiLang, t } from "../../shared/translation/translation.js?v=v2026-10-23T14420";
import { initPage } from "../../shared/js/core/page-init.js?v=v2026-10-23T14420";
import { hydrateIcons, icon } from "../../shared/js/core/icons.js?v=v2026-10-23T14420";
import "../../shared/js/core/contact-modal.js?v=v2026-10-23T14420";
import { linkTo } from "../../shared/js/core/nav-map.js?v=v2026-10-23T14420";
import { onSwipe } from "../../shared/js/core/swipe.js?v=v2026-10-23T14420";
import { createImageViewer } from "../../shared/js/core/image-viewer.js?v=v2026-10-23T14420";
import { buildIndex, initManualSearch, highlight } from "./search.js?v=v2026-10-23T14420";

const CONTENT = {
  pl: () => import("../content/pl.js?v=v2026-10-23T14420"),
  en: () => import("../content/en.js?v=v2026-10-23T14420"),
  uk: () => import("../content/uk.js?v=v2026-10-23T14420"),
};
export const CHAPTER_PARAM = "ch";
// Skąd przyszedł czytelnik po kliknięciu odnośnika w treści (rozdział albo podrozdział, np. "6.7").
export const FROM_PARAM = "from";

const article = document.getElementById("manualArticle");
const content = document.getElementById("manualContent");
const toc = document.getElementById("manualToc");
const tocToggle = document.getElementById("manualTocToggle");
const tocBackdrop = document.getElementById("manualTocBackdrop");
const currentLabel = document.getElementById("manualCurrent");
const returnBar = document.getElementById("manualReturnBar");
const layout = document.querySelector(".m-layout");

let manual = null;
let current = null;
let searchIndexEntries = [];
let search = null;
let tocList = null;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const chapterHref = (id, hash = "", from = null) => {
  const u = new URL(location.href);
  if (id) u.searchParams.set(CHAPTER_PARAM, id); else u.searchParams.delete(CHAPTER_PARAM);
  if (from) u.searchParams.set(FROM_PARAM, from); else u.searchParams.delete(FROM_PARAM);
  u.hash = hash;
  return u.pathname + u.search + u.hash;
};
let returnTo = null;
const findChapter = (id) => manual?.chapters.find((c) => c.id === id) || null;
const partOf = (id) => manual?.parts.find((p) => p.chapters.includes(id)) || null;
const titleOf = (id) => {
  const ch = findChapter(String(id).split(".")[0]);
  if (!ch) return "";
  if (!String(id).includes(".")) return ch.title;
  return ch.sections.find((s) => s.id === id)?.title || ch.title;
};
const hrefFor = (id) => {
  const chId = String(id).split(".")[0];
  return chapterHref(chId, String(id).includes(".") ? `#${sectionId(id)}` : "");
};
// Podrozdział, w którym leży element (ostatni nagłówek przed nim), albo bieżący rozdział.
function sectionOf(el) {
  let found = current;
  for (const h of article.querySelectorAll(".m-doc .m-h2, .m-doc .m-h3")) {
    if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = h.id.replace(/^s-/, "").replace(/-/g, ".");
  }
  return found;
}

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
  tocList.innerHTML = manual.parts.map((part) => `
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
  const back = returnTo && titleOf(returnTo)
    ? `<div class="m-return-bar"><a class="m-return" href="${hrefFor(returnTo)}" data-return="1"><i data-icon="arrow-left"></i><span>${esc(t("manual.backTo", { title: titleOf(returnTo) }))}</span></a></div>`
    : "";
  article.innerHTML = `
    ${back}
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

// Karuzela widoków: przewijanie z przyciąganiem (przesunięcie palcem na telefonie),
// strzałki, kropki i klawisze ←/→, gdy karuzela ma fokus.
function wireCarousels(root) {
  for (const box of root.querySelectorAll(".m-carousel")) {
    const track = box.querySelector(".m-carousel-track");
    const slides = [...track.children];
    const nav = document.createElement("div");
    nav.className = "m-carousel-nav";
    nav.innerHTML = `<button class="btn sm icon" type="button" data-step="-1" aria-label="${esc(t("manual.shotPrev"))}" title="${esc(t("manual.shotPrev"))}">${icon("arrow-left")}</button>
      <div class="m-carousel-dots">${slides.map((_, i) => `<button class="m-carousel-dot" type="button" data-i="${i}" aria-label="${esc(t("manual.shotN", { n: i + 1, total: slides.length }))}"></button>`).join("")}</div>
      <button class="btn sm icon" type="button" data-step="1" aria-label="${esc(t("manual.shotNext"))}" title="${esc(t("manual.shotNext"))}">${icon("arrow-right")}</button>`;
    box.append(nav);
    const dots = [...nav.querySelectorAll(".m-carousel-dot")];
    const index = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const go = (i) => track.scrollTo({ left: ((i + slides.length) % slides.length) * track.clientWidth, behavior: "smooth" });
    const mark = () => dots.forEach((d, k) => d.classList.toggle("active", k === index()));
    nav.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      go(b.dataset.i != null ? Number(b.dataset.i) : index() + Number(b.dataset.step));
    });
    box.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") { ev.preventDefault(); go(index() + (ev.key === "ArrowLeft" ? -1 : 1)); }
    });
    // Palec w bok przechodzi o jeden widok (przewijanie strony w pionie zostaje).
    onSwipe(track, (dir) => go(index() + dir));
    track.addEventListener("scroll", () => requestAnimationFrame(mark), { passive: true });
    mark();
  }
}

// Powiększenie zrzutu: to samo okno co na stronie głównej (na telefonie od dołu,
// z przybliżaniem palcami).
let viewer = null;
function openShot(img) {
  viewer ||= createImageViewer({ backBtn: document.getElementById("btnImageViewerBack") });
  viewer.open(img.currentSrc || img.src, img.alt, img);
}

// Zrzuty wczytują się leniwie i mogą zepchnąć cel przewinięcia — przez chwilę po przewinięciu
// każdy wczytany obraz poprawia pozycję, chyba że czytelnik sam przewinie (kółko, dotyk, klawisze).
let keepCancel = null;
function keepInView(el, block) {
  keepCancel?.();
  const until = Date.now() + 4000;
  const again = () => { if (Date.now() < until && el.isConnected) el.scrollIntoView({ block }); };
  const imgs = [...article.querySelectorAll("img")].filter((img) => !img.complete);
  imgs.forEach((img) => img.addEventListener("load", again, { once: true }));
  const stop = () => keepCancel?.();
  const events = ["wheel", "touchstart", "keydown"];
  events.forEach((e) => content.addEventListener(e, stop, { once: true, passive: true }));
  keepCancel = () => {
    imgs.forEach((img) => img.removeEventListener("load", again));
    events.forEach((e) => content.removeEventListener(e, stop));
    keepCancel = null;
  };
}

function scrollToHash(hash, smooth = false) {
  const el = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  if (el) { el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }); keepInView(el, "start"); }
  else { keepCancel?.(); content.scrollTo({ top: 0 }); }
  markSection();
}

// Podświetla w pasku podrozdział, który jest właśnie czytany.
function markSection() {
  const heads = [...article.querySelectorAll(".m-doc .m-h2")];
  const top = content.getBoundingClientRect().top + 24;
  let currentId = heads[0]?.id || "";
  for (const h of heads) if (h.getBoundingClientRect().top <= top) currentId = h.id;
  for (const a of tocList.querySelectorAll(".m-side-sub")) a.classList.toggle("current", sectionId(a.dataset.sec) === currentId);
}

// Wyszukiwarka nad spisem treści: wybór wyniku otwiera podrozdział i zaznacza trafienia
// (zaznaczenie znika przy następnym przejściu).
function wireSearch() {
  toc.innerHTML = `<div class="m-search" id="manualSearch"></div><div class="m-side-list"></div>`;
  tocList = toc.querySelector(".m-side-list");
  hydrateIcons(document.querySelector(".m-actionbar"));
  search = initManualSearch(toc.querySelector("#manualSearch"), () => searchIndexEntries, (entry, query) => {
    show(entry.ch, entry.id === entry.ch ? "" : `#${sectionId(entry.id)}`);
    const scope = entry.id === entry.ch ? article.querySelector(".m-doc") : sectionScope(sectionId(entry.id));
    for (const el of scope) highlight(el, query);
    const first = article.querySelector("mark.m-hit");
    if (first) { first.scrollIntoView({ block: "center" }); keepInView(first, "center"); }
  });
}

// Elementy podrozdziału: nagłówek i wszystko do następnego nagłówka tego samego lub wyższego poziomu.
function sectionScope(id) {
  const head = document.getElementById(id);
  if (!head) return [];
  const level = Number(head.tagName[1]);
  const out = [head];
  for (let el = head.nextElementSibling; el; el = el.nextElementSibling) {
    if (/^H[1-6]$/.test(el.tagName) && Number(el.tagName[1]) <= level) break;
    out.push(el);
  }
  return out;
}

// „Wróć do: …”: w treści (komputer) i w pasku ze „Spis treści” (telefon, tablet).
function syncReturn() {
  const on = !!(returnTo && titleOf(returnTo));
  article.classList.toggle("has-return", on);
  layout?.classList.toggle("has-return", on);
  if (!returnBar) return;
  returnBar.hidden = !on;
  if (on) {
    returnBar.setAttribute("href", hrefFor(returnTo));
    returnBar.innerHTML = `${icon("arrow-left")}<span>${esc(t("manual.backTo", { title: titleOf(returnTo) }))}</span>`;
  }
}

function show(id, hash = "", { updateUrl = true, smooth = false, from = null, keepPanel = false } = {}) {
  const ch = id ? findChapter(id) : null;
  current = ch ? ch.id : null;
  returnTo = ch && from && titleOf(from) ? from : null;
  if (ch) renderChapter(ch); else renderStart();
  syncReturn();
  renderToc();
  currentLabel.textContent = ch ? ch.title : t("manual.pageTitle");
  hydrateIcons(article);
  wireCarousels(article);
  // Pierwsze wyświetlenie (i zmiana języka) nie zamyka panelu otwartego w trakcie wczytywania.
  if (!keepPanel) setTocOpen(false);
  if (updateUrl) {
    const next = chapterHref(current, ch ? hash : "", returnTo);
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
    const zoom = ev.target.closest?.(".m-shot-zoom");
    if (zoom) { openShot(zoom.querySelector("img")); return; }
    const a = ev.target.closest?.("a[href]");
    if (!a || !a.closest(".m-layout") || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
    // Nazwa strony serwisu (*Moje gry*): najpierw adres podręcznika wskazuje bieżący podrozdział,
    // potem linkTo() niesie go w ?ret=, więc „←” na stronie docelowej wraca w to samo miejsce.
    if (a.dataset.page) {
      ev.preventDefault();
      const sec = sectionOf(a);
      history.replaceState(history.state, "", chapterHref(current, sec && sec.includes(".") ? `#${sectionId(sec)}` : "", returnTo));
      location.href = linkTo(a.dataset.page);
      return;
    }
    const url = new URL(a.getAttribute("href"), location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname) return;
    ev.preventDefault();
    const id = url.searchParams.get(CHAPTER_PARAM) || (url.search ? null : current);
    // Odnośnik w treści zapamiętuje miejsce wyjścia; spis treści, pager i „Wróć” — nie.
    const from = a.classList.contains("m-ref") ? sectionOf(a) : null;
    if (id === current && url.hash && !from) {
      history.replaceState(history.state, "", chapterHref(current, url.hash, a.dataset.return ? null : returnTo));
      if (a.dataset.return) { returnTo = null; article.querySelector(".m-return-bar")?.remove(); syncReturn(); }
      setTocOpen(false);
      scrollToHash(url.hash, true);
      return;
    }
    show(id, url.hash, { from });
  });
  let raf = 0;
  content.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(markSection); }, { passive: true });
}

async function renderForLang() {
  manual = await loadContent(getUiLang());
  searchIndexEntries = buildIndex(manual);
  // Tekst wpisany, zanim treść się wczytała, dostaje wyniki od razu po zbudowaniu indeksu.
  if (search?.input.value) search.refresh();
  const params = new URLSearchParams(location.search);
  show(params.get(CHAPTER_PARAM), location.hash, { updateUrl: true, from: params.get(FROM_PARAM), keepPanel: true });
}

/* ================= Init ================= */
// Przyciski panelu działają od pierwszej chwili — także gdy treść i tłumaczenia jeszcze się wczytują.
function wirePanel() {
  tocToggle.addEventListener("click", () => setTocOpen(!toc.classList.contains("is-open")));
  document.getElementById("manualSearchToggle")?.addEventListener("click", () => {
    setTocOpen(true);
    toc.querySelector(".searchText")?.focus();
  });
  tocBackdrop.addEventListener("click", () => setTocOpen(false));
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") setTocOpen(false); });
}

async function init() {
  wirePanel();
  const i18nP = initManualI18n().catch((err) => {
    console.error("[manual] i18n nieaktywny:", err);
  });
  initPage("manual", { ready: i18nP }).catch((err) => {
    console.warn("[manual] initPage nieaktywny:", err);
  });
  await i18nP;
  wireSearch();
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
