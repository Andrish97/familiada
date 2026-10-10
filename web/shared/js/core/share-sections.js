// share-sections.js
// Jeden podział na sekcje wszędzie, gdzie udostępniamy zasób (baza, ankieta,
// subskrypcje, urządzenia): Subskrybenci (jeszcze bez zaproszenia) · Oczekujące
// (zaproszenie wysłane) · Aktywni (przyjęte; w ankiecie: zagłosowali) ·
// Odrzucone (tylko tam, gdzie taki stan istnieje). Ten sam nagłówek z podpisem
// i ten sam wiersz (.shareRow). Puste sekcje są ukryte.
// Wygląd: base.css (.shareSection, .shareRow). Komentarz: bez końca komentarza.

import { t } from "../../translation/translation.js?v=v2026-10-10T15095";
import { icon } from "./icons.js?v=v2026-10-10T15095";

export const SHARE_SECTION_ORDER = ["subscribers", "pending", "active", "declined"];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Pojedynczy wiersz (kafel) sekcji.
 * @param {object} row
 * @param {string|number} [row.id]
 * @param {string} row.label        nazwa / e-mail
 * @param {string} [row.title]      dymek nazwy
 * @param {{text:string,cls?:string}[]} [row.tags]  oznaczenia (kolor tylko pomocniczo)
 * @param {string} [row.note]       drobna linia pod nazwą
 * @param {HTMLElement[]} [row.extras]  dodatkowe elementy w rogu (np. lista roli)
 * @param {{key:string,icon:string,title:string,disabled?:boolean,gold?:boolean,text?:string,onClick:Function}[]} [row.actions]
 * @param {boolean} [row.selected]
 * @param {boolean} [row.disabled]
 * @param {Function} [row.onClick]  kliknięcie w wiersz (wybór)
 * @param {string} [row.role]       np. "checkbox"
 */
export function shareRowEl(row) {
  const el = document.createElement("div");
  el.className = "shareRow";
  if (row.id != null) el.dataset.id = String(row.id);
  if (row.selected) el.classList.add("selected");
  if (row.disabled) el.classList.add("blocked");
  if (row.onClick && !row.disabled) el.classList.add("pick");
  if (row.role) {
    el.setAttribute("role", row.role);
    if (row.role === "checkbox") el.setAttribute("aria-checked", row.selected ? "true" : "false");
  }
  const tags = (row.tags || []).map((x) => `<span class="tag ${esc(x.cls || "tag--muted")}">${esc(x.text)}</span>`).join("");
  el.innerHTML = `
    <div class="shareMain">
      <div class="shareEmail" title="${esc(row.title || row.label)}">${esc(row.label)}</div>
      ${tags ? `<div class="shareTags">${tags}</div>` : ""}
      ${row.note ? `<div class="shareNote">${esc(row.note)}</div>` : ""}
    </div>
    <div class="shareRowActions"></div>`;
  const acts = el.querySelector(".shareRowActions");
  for (const x of row.extras || []) acts.append(x);
  for (const a of row.actions || []) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn xsm" + (a.gold ? " gold" : "");
    b.dataset.act = a.key;
    b.title = a.title || "";
    b.setAttribute("aria-label", a.title || a.key);
    if (a.disabled) b.disabled = true;
    b.innerHTML = a.icon ? icon(a.icon) : esc(a.text || "");
    b.addEventListener("click", (e) => { e.stopPropagation(); a.onClick?.(e); });
    acts.append(b);
  }
  if (row.onClick && !row.disabled) {
    el.tabIndex = 0;
    el.addEventListener("click", (e) => row.onClick(e));
    el.addEventListener("keydown", (e) => {
      if (e.target !== el) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); row.onClick(e); }
    });
  }
  return el;
}

/**
 * Wyrysowuje sekcje w kontenerze. Kolejność zawsze jak SHARE_SECTION_ORDER;
 * pusta sekcja nie powstaje.
 * @param {HTMLElement} host
 * @param {Record<string,{rows:object[],subtitle?:string,title?:string,header?:HTMLElement}>} groups
 * @param {{grid?:boolean}} [opts]  grid: kafle w kilku kolumnach (strony), inaczej lista (okna)
 */
export function renderShareSections(host, groups, opts = {}) {
  const frag = document.createDocumentFragment();
  for (const key of SHARE_SECTION_ORDER) {
    const g = groups[key];
    if (!g || !g.rows?.length) continue;
    const sec = document.createElement("section");
    sec.className = "shareSection shareSection--" + key;
    sec.dataset.section = key;
    const title = document.createElement("div");
    title.className = "shareSectionTitle";
    title.textContent = g.title || t(`shareSections.${key}`);
    const sub = document.createElement("div");
    sub.className = "shareSectionSub";
    sub.textContent = g.subtitle || t(`shareSections.${key}Sub`);
    const list = document.createElement("div");
    list.className = "shareList" + (opts.grid ? " shareList--grid" : "");
    for (const r of g.rows) list.append(shareRowEl(r));
    sec.append(title, sub, list);
    frag.append(sec);
  }
  host.replaceChildren(frag);
}

// ===== Wiersze z sekcjami wg strony (E19: Zadania, Znajomi, Subskrybenci) =====
// Sekcje podaje strona w swojej kolejności (nie ma stałej listy jak wyżej).
// Wiersz: inicjał w kółku, tytuł, szara linijka stanu, opcjonalny kanał
// (friend|subscriber|mail), akcje po prawej w wierszu. Komputer: tekst
// akcji, telefon: sama ikona (aria-label zostaje); usuwanie zawsze ikoną.
// Wygląd: base.css (.rowsPage, .rowsSection, .rowsRow).

const ROW_CHANNELS = ["friend", "subscriber", "mail"];

/**
 * Pojedynczy wiersz.
 * @param {object} row
 * @param {string|number} [row.id]
 * @param {string} row.title
 * @param {string} [row.avatar]   tekst, z którego bierzemy inicjał (domyślnie tytuł)
 * @param {string} [row.note]     szara linijka stanu
 * @param {"friend"|"subscriber"|"mail"} [row.channel]
 * @param {Record<string,string>} [row.data]  atrybuty data-* wiersza (np. kind)
 * @param {{key:string,text?:string,icon?:string,title?:string,gold?:boolean,iconOnly?:boolean,disabled?:boolean,onClick:Function}[]} [row.actions]
 */
export function rowEl(row) {
  const el = document.createElement("div");
  el.className = "rowsRow";
  if (row.id != null) el.dataset.id = String(row.id);
  for (const [k, v] of Object.entries(row.data || {})) el.dataset[k] = String(v);
  const initial = Array.from(String(row.avatar || row.title || "?").trim())[0] || "?";
  const channel = ROW_CHANNELS.includes(row.channel) ? row.channel : "";
  const noteParts = [];
  if (channel) noteParts.push(`<span class="rowsChannel rowsChannel--${channel}">${esc(t(`shareSections.channel.${channel}`))}</span>`);
  if (row.note) noteParts.push(esc(row.note));
  el.innerHTML = `
    <span class="rowsAvatar" aria-hidden="true">${esc(initial.toLocaleUpperCase())}</span>
    <div class="rowsMain">
      <div class="rowsTitle" title="${esc(row.title)}">${esc(row.title)}</div>
      ${noteParts.length ? `<div class="rowsNote">${noteParts.join(" · ")}</div>` : ""}
    </div>
    <div class="rowsActions"></div>`;
  const acts = el.querySelector(".rowsActions");
  for (const a of row.actions || []) {
    const label = a.title || a.text || a.key;
    const iconOnly = a.iconOnly || a.icon === "trash" || !a.text;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn xsm rowsAct" + (a.gold ? " gold" : "") + (iconOnly ? " rowsAct--icon" : "");
    b.dataset.act = a.key;
    b.title = label;
    b.setAttribute("aria-label", label);
    if (a.disabled) b.disabled = true;
    b.innerHTML = (a.text && !iconOnly ? `<span class="rowsActText">${esc(a.text)}</span>` : "")
      + (a.icon ? `<span class="rowsActIcon">${icon(a.icon)}</span>` : "");
    b.addEventListener("click", (e) => { e.stopPropagation(); a.onClick?.(e, b); });
    acts.append(b);
  }
  return el;
}

/**
 * Wyrysowuje sekcje w kolejności podanej przez stronę; pusta sekcja nie powstaje.
 * Sekcja z polem `collapsed` (true/false) jest zwijana; ostatni wybór
 * użytkownika zostaje w hoście przy kolejnych rysowaniach.
 * @param {HTMLElement} host
 * @param {{key:string,title:string,rows:object[],collapsed?:boolean}[]} sections
 * @param {{emptyText?:string}} [opts]  emptyText: tekst, gdy żadna sekcja nie ma wierszy
 */
export function renderRowSections(host, sections, opts = {}) {
  const state = host._rowsCollapsed || (host._rowsCollapsed = {});
  const frag = document.createDocumentFragment();
  for (const s of sections) {
    if (!s.rows?.length) continue;
    const sec = document.createElement("section");
    sec.className = "rowsSection rowsSection--" + s.key;
    sec.dataset.section = s.key;
    const collapsible = typeof s.collapsed === "boolean";
    const collapsed = collapsible && (s.key in state ? state[s.key] : s.collapsed);
    const head = document.createElement(collapsible ? "button" : "div");
    head.className = "rowsSectionHead";
    if (collapsible) {
      head.type = "button";
      head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    head.innerHTML = `<span class="rowsSectionTitle">${esc(s.title)}</span><span class="rowsSectionCount">${s.rows.length}</span>${collapsible ? `<span class="rowsSectionCaret" aria-hidden="true">${icon(collapsed ? "caret-down" : "caret-up")}</span>` : ""}`;
    const list = document.createElement("div");
    list.className = "rowsList";
    list.hidden = collapsed;
    for (const r of s.rows) list.append(rowEl(r));
    if (collapsible) {
      head.addEventListener("click", () => {
        const now = !list.hidden;
        list.hidden = now;
        state[s.key] = now;
        head.setAttribute("aria-expanded", now ? "false" : "true");
        head.querySelector(".rowsSectionCaret").innerHTML = icon(now ? "caret-down" : "caret-up");
      });
    }
    sec.append(head, list);
    frag.append(sec);
  }
  if (!frag.childNodes.length && opts.emptyText) {
    const d = document.createElement("div");
    d.className = "rowsEmpty";
    d.textContent = opts.emptyText;
    frag.append(d);
  }
  host.replaceChildren(frag);
}
