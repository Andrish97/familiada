// share-sections.js
// Jeden podział na sekcje wszędzie, gdzie udostępniamy zasób (baza, ankieta,
// subskrypcje, urządzenia): Subskrybenci (jeszcze bez zaproszenia) · Oczekujące
// (zaproszenie wysłane) · Aktywni (przyjęte; w ankiecie: zagłosowali) ·
// Odrzucone (tylko tam, gdzie taki stan istnieje). Ten sam nagłówek z podpisem
// i ten sam wiersz (.shareRow). Puste sekcje są ukryte.
// Wygląd: base.css (.shareSection, .shareRow). Komentarz: bez końca komentarza.

import { t } from "../../translation/translation.js?v=v2026-10-09T22024";
import { icon } from "./icons.js?v=v2026-10-09T22024";

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
