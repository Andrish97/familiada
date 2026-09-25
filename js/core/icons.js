// js/core/icons.js
// Wspólny silnik ikon: jedno źródło rysunków SVG dla całej aplikacji.
//
// Użycie:
//   - w JS:   el.innerHTML = `${icon("trash")} ${t("...")}`;
//   - w HTML: <i class="ico" data-icon="trash" aria-hidden="true"></i>
//     (silnik sam podmienia takie znaczniki na <svg> — także te dodane
//     później przez JS, dzięki MutationObserver).
//
// Styl zestawu: zaokrąglony kontur (stroke 1.8); ptaszek grubszy, „!” i „i”
// bez kółka (pełne), anuluj = X w kółku (kontur). Kolor zawsze
// z currentColor, rozmiar domyślnie 1em (nadpisywany przez CSS .ico).
//
// Ikona wstawiona do elementu z data-i18n zniknie przy tłumaczeniu
// (textContent) — dlatego ikonę stawiamy OBOK tłumaczonego <span>, nie w nim.

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const FILL = 'fill="currentColor"';

const s = (body, vb = "0 0 24 24") => ({ vb, attrs: STROKE, body });
const f = (body, vb = "0 0 24 24") => ({ vb, attrs: FILL, body });

const TRASH_BODY = '<path d="M3.5 6h17"/><path d="M8.5 6V4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V6"/><path d="M18.5 6l-.8 13.1a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 6"/>';
const SEARCH_BODY = '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.5-4.5"/>';
const FOLDER_BODY = '<path d="M3 7.5V6a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7L11.4 6.3a2 2 0 0 0 1.5.7H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>';
const FILE_BODY = '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z"/><path d="M14 2.5V8h5.5"/>';
const ENVELOPE_SMALL = '<rect x="2.5" y="10" width="19" height="11.5" rx="2"/><path d="m3 11.5 9 5.5 9-5.5"/>';
const SPEAKER_BODY = '<path d="M11 5 6.5 9H3.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3L11 19Z"/>';
const TRAY = '<path d="M20.5 15v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V15"/>';
const CARDS = '<path d="M15 3H6a3 3 0 0 0-3 3v9"/><rect x="8" y="8" width="13" height="13" rx="2.5"/>';
const CARET = '<path d="M6.6 9h10.8a.9.9 0 0 1 .7 1.5l-5.4 6.1a.9.9 0 0 1-1.4 0l-5.4-6.1A.9.9 0 0 1 6.6 9Z"/>';
const caret = (deg) => f(deg ? `<g transform="rotate(${deg} 12 12)">${CARET}</g>` : CARET);
const STAR_PATH = '<path d="M11.5 2.8a.6.6 0 0 1 1 0l2.6 5.3a1.2 1.2 0 0 0 .9.6l5.8.9a.6.6 0 0 1 .3 1l-4.2 4.1a1.2 1.2 0 0 0-.3 1l1 5.8a.6.6 0 0 1-.9.6l-5.2-2.7a1.2 1.2 0 0 0-1.1 0l-5.2 2.7a.6.6 0 0 1-.9-.6l1-5.8a1.2 1.2 0 0 0-.3-1L2.8 10.6a.6.6 0 0 1 .3-1l5.8-.9a1.2 1.2 0 0 0 .9-.6Z"/>';
const flag = (code, top, bottom) => ({
  vb: "0 0 24 24", attrs: "",
  body: `<defs><mask id="fam-flag-${code}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><text x="12" y="15.3" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Arial,sans-serif" font-size="8.4" font-weight="800" letter-spacing=".4" fill="#000">${code.toUpperCase()}</text></mask></defs><g mask="url(#fam-flag-${code}-m)"><rect x="1" y="5.5" width="22" height="6.5" fill="${top}"/><rect x="1" y="12" width="22" height="6.5" fill="${bottom}"/></g>`,
});

export const ICONS = Object.freeze({
  // --- zamykanie / usuwanie / stany ---------------------------------------
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  trash: s(`${TRASH_BODY}<path d="M10 10.5v6M14 10.5v6"/>`),
  "trash-forever": s(`${TRASH_BODY}<path d="m10 11 4 5M14 11l-4 5"/>`),
  check: { vb: "0 0 24 24", attrs: 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"', body: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>' },
  cancel: s('<circle cx="12" cy="12" r="9.5"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>'),
  error: f('<rect x="10.3" y="2.5" width="3.4" height="12.5" rx="1.7"/><circle cx="12" cy="19.5" r="2"/>'),
  warning: s('<path d="M10.3 3.9 2.4 17.6a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17h.01"/>'),
  info: f('<circle cx="12" cy="4.5" r="2"/><rect x="10.3" y="9" width="3.4" height="12.5" rx="1.7"/>'),

  // --- edycja / schowek ---------------------------------------------------
  "edit-paper": s('<path d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8"/><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3l-9 9a2 2 0 0 1-.9.5l-2.9.8.8-2.9a2 2 0 0 1 .5-.9Z"/>'),
  pencil: s('<path d="M16.9 3.6a2.3 2.3 0 0 1 3.3 3.3L7.6 19.5l-4.3 1.2 1.2-4.3Z"/><path d="m14.8 5.7 3.5 3.5"/>'),
  copy: s(CARDS),
  duplicate: s(`${CARDS}<path d="M14.5 11.5v6M11.5 14.5h6"/>`),
  cut: s('<circle cx="6" cy="6" r="2.8"/><circle cx="6" cy="18" r="2.8"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'),
  paste: s('<rect x="8" y="2.5" width="8" height="4" rx="1.2"/><path d="M16 4.5h2a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  "file-plus": s(`${FILE_BODY}<path d="M12 11.5v6M9 14.5h6"/>`),
  "file-doc": s(`${FILE_BODY}<path d="M8.5 13h7M8.5 17h5"/>`),
  "file-expired": s('<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>'),
  folder: s(FOLDER_BODY),
  "folder-plus": s(`${FOLDER_BODY}<path d="M12 10.5v6M9 13.5h6"/>`),
  tag: s('<path d="M3 4.8V11a2 2 0 0 0 .6 1.4l8.6 8.6a2 2 0 0 0 2.8 0l6-6a2 2 0 0 0 0-2.8L12.4 3.6A2 2 0 0 0 11 3H4.8A1.8 1.8 0 0 0 3 4.8Z"/><circle cx="7.8" cy="7.8" r="1.2" fill="currentColor" stroke="none"/>'),
  paperclip: s('<path d="m20.5 11.2-8.4 8.4a5.5 5.5 0 0 1-7.8-7.8l8.4-8.4a3.7 3.7 0 0 1 5.2 5.2l-8.4 8.4a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/>'),
  image: s('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.8"/><path d="m21 15.5-3.6-3.6a1.8 1.8 0 0 0-2.5 0L5.5 21"/>'),
  save: s('<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>'),
  search: s(SEARCH_BODY),
  "zoom-in": s(`${SEARCH_BODY}<path d="M11 8v6M8 11h6"/>`),
  "zoom-out": s(`${SEARCH_BODY}<path d="M8 11h6"/>`),
  "align-left": s('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  "align-center": s('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  "align-right": s('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  merge: s('<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.2 2.9L4 22"/><path d="m20 22-5-5"/>'),

  // --- strzałki / przepływ ------------------------------------------------
  download: s(`${TRAY}<path d="m7 10 5 5 5-5M12 15V3.5"/>`),
  upload: s(`${TRAY}<path d="m17 8-5-5-5 5M12 3v12"/>`),
  refresh: s('<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6l2.5 2.5"/><path d="M20.5 3.5v5h-5"/>'),
  restore: s('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5"/>'),
  undo: s('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: s('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  "arrow-up": s('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>'),
  "arrow-down": s('<path d="M12 5v14M18.5 12.5 12 19l-6.5-6.5"/>'),
  grip: f('<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>'),
  "arrow-right": s('<path d="M5 12h14M12.5 5.5 19 12l-6.5 6.5"/>'),
  "arrow-left": s('<path d="M19 12H5M11.5 18.5 5 12l6.5-6.5"/>'),
  reply: s('<path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>'),
  "caret-down": caret(0),
  "caret-up": caret(180),
  "caret-right": caret(-90),
  "caret-left": caret(90),
  "fullscreen-enter": s('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  "fullscreen-exit": s('<path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5"/>'),

  // --- poczta -------------------------------------------------------------
  envelope: s('<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6.5 9 6 9-6"/>'),
  "envelope-in": s(`${ENVELOPE_SMALL}<path d="M12 2v6.5M9 5.5l3 3 3-3"/>`),
  "envelope-out": s(`${ENVELOPE_SMALL}<path d="M12 8.5V2M9 5l3-3 3 3"/>`),
  // kształt z audytu (uchwyt + tuba), przerysowany konturem jak reszta zestawu
  megaphone: s('<rect x="2.8" y="7.5" width="4.7" height="9" rx="1.2"/><path d="M7.5 9.2 19.5 4.5v15l-12-4.7Z"/>'),
  bell: s('<path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15 6 8.5"/><path d="M10.3 20.5a2 2 0 0 0 3.4 0"/>'),

  // --- nawigacja / miejsca ------------------------------------------------
  home: s('<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-7h6v7"/>'),
  gamepad: s('<path d="M6.7 5h10.6a4 4 0 0 1 3.9 3.1l1.4 6.1a3.9 3.9 0 0 1-6.6 3.6L14.2 16H9.8L8 17.8a3.9 3.9 0 0 1-6.6-3.6l1.4-6.1A4 4 0 0 1 6.7 5Z"/><path d="M7 9v5M4.5 11.5h5"/><circle cx="16.5" cy="10" r=".8" fill="currentColor" stroke="none"/><circle cx="19" cy="12.5" r=".8" fill="currentColor" stroke="none"/>'),
  drawer: s('<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M4 12h16M10 7h4M10 16.5h4"/>'),
  // rysunek z audytu: słupki na tle poziomych podziałek
  polls: f('<rect x="2" y="20" width="20" height="1.4" rx=".7" opacity=".5"/><rect x="2" y="15.5" width="20" height="1.1" rx=".55" opacity=".28"/><rect x="2" y="10.5" width="20" height="1.1" rx=".55" opacity=".28"/><rect x="4" y="11" width="4" height="9" rx="1"/><rect x="10" y="15" width="4" height="5" rx="1"/><rect x="16" y="6" width="4" height="14" rx="1"/>'),
  hamburger: s('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  globe: s('<circle cx="12" cy="12" r="9.5"/><path d="M12 2.5a14 14 0 0 0 0 19 14 14 0 0 0 0-19M2.5 12h19"/>'),
  shield: s('<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/>'),
  calendar: s('<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>'),
  hourglass: s('<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>'),
  camera: s('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3.2"/>'),
  eye: s('<path d="M2.1 12.3a1 1 0 0 1 0-.6 10.7 10.7 0 0 1 19.8 0 1 1 0 0 1 0 .6 10.7 10.7 0 0 1-19.8 0"/><circle cx="12" cy="12" r="3"/>'),
  "eye-off": s('<path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7"/><path d="M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="m2 2 20 20"/>'),

  // --- osoby / urządzenia -------------------------------------------------
  person: s('<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
  people: s('<circle cx="9" cy="7.5" r="3.8"/><path d="M2.5 21v-1.5a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4V21"/><path d="M16 3.3a3.8 3.8 0 0 1 0 7.4M21.5 21v-1.5a4 4 0 0 0-3-3.9"/>'),
  // Prowadzący (ludzik jak w udostępnianiu + mikrofon) i buzzer (przycisk z boku).
  host: s('<circle cx="9" cy="7.5" r="3.8"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><rect x="16.8" y="3" width="4" height="7" rx="2"/><path d="M15.3 8.8a3.5 3.5 0 0 0 7 0M18.8 12.3V15"/>'),
  buzzer: s('<path d="M5.75 11.25a6.25 6.25 0 0 1 12.5 0Z"/><path d="M9.2 11.25V15M14.8 11.25V15"/><rect x="3.5" y="15" width="17" height="3.8" rx="1"/>'),
  display: s('<rect x="2.5" y="3.5" width="19" height="13" rx="1.8"/><path d="M9 20h6M12 16.5V20"/>'),
  phone: s('<rect x="3.5" y="3" width="10" height="18" rx="2.2"/><path d="M8 17.5h1"/><path d="M17 9.5a3.5 3.5 0 0 1 0 5"/><path d="M19.7 7a7.2 7.2 0 0 1 0 10"/>'),

  // --- dźwięk / odtwarzanie -----------------------------------------------
  "speaker-on": s(`${SPEAKER_BODY}<path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/>`),
  "speaker-off": s(`${SPEAKER_BODY}<path d="m16 9.5 5 5M21 9.5l-5 5"/>`),
  play: f('<path d="M7 4.8v14.4a1 1 0 0 0 1.5.9l11.3-7.2a1 1 0 0 0 0-1.8L8.5 3.9A1 1 0 0 0 7 4.8Z"/>'),
  stop: f('<rect x="5" y="5" width="14" height="14" rx="2.2"/>'),
  pause: f('<rect x="5.5" y="4" width="4.5" height="16" rx="1.3"/><rect x="14" y="4" width="4.5" height="16" rx="1.3"/>'),

  // --- oceny --------------------------------------------------------------
  star: f(STAR_PATH),
  "star-empty": s(STAR_PATH),
  "star-half": s(`<defs><clipPath id="fam-star-half-c"><rect width="12" height="24"/></clipPath></defs><g clip-path="url(#fam-star-half-c)" fill="currentColor">${STAR_PATH}</g>${STAR_PATH}`),

  // --- edytor logo --------------------------------------------------------
  cursor: s('<path d="M4.5 3.5 19 9.3a.5.5 0 0 1 0 .9l-6 2.1a1.5 1.5 0 0 0-.9.9l-2.1 6a.5.5 0 0 1-.9 0Z"/>'),
  hand: s('<path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>'),
  text: s('<path d="M4.5 7V4.5h15V7M9 20h6M12 4.5V20"/>'),
  brush: s('<path d="m9.1 11.9 8-8.1a2.9 2.9 0 1 1 4.1 4.1l-8.1 8"/><path d="M7.1 14.9c-1.7 0-3 1.4-3 3 0 1.4-2.5 1.6-2 2.1 1.1 1.1 2.5 2 4 2 2.2 0 4-1.8 4-4a3 3 0 0 0-3-3.1Z"/>'),
  eraser: s('<path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7M5 11l9 9"/>'),
  shapes: s('<rect x="3" y="3" width="8" height="8" rx="1.5"/><circle cx="17.5" cy="7" r="4"/><path d="M12.8 20.5 17 13l4.3 7.5Z"/><path d="M3 20.5h8"/>'),
  "swatch-white": f('<rect x="4" y="5.5" width="16" height="13" rx="2"/>'),
  "swatch-black": { vb: "0 0 24 24", attrs: 'fill="none" stroke="currentColor" stroke-width="1.2"', body: '<rect x="4.6" y="6.1" width="14.8" height="11.8" rx="1.6"/>' },

  // --- języki (zatwierdzone: PL/UA z dziurą w fladze, EN sam napis) --------
  "flag-pl": flag("pl", "#ffffff", "#dc143c"),
  "flag-ua": flag("ua", "#0057b7", "#ffd700"),
  "lang-en": { vb: "0 0 24 24", attrs: "", body: '<text x="12" y="15.6" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Arial,sans-serif" font-size="9.4" font-weight="800" letter-spacing=".3" fill="currentColor">EN</text>' },
});

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * Zwraca znacznik <svg> ikony. Nieznana nazwa -> pusty string (i ostrzeżenie
 * w konsoli), żeby literówka nie psuła reszty widoku.
 * @param {string} name
 * @param {{ className?: string, label?: string }} [opts] label = dostępna nazwa
 *   (dla samodzielnych przycisków-ikon); bez niej ikona jest aria-hidden.
 */
export function icon(name, { className = "", label = "" } = {}) {
  const def = ICONS[name];
  if (!def) {
    if (typeof console !== "undefined") console.warn(`[icons] nieznana ikona: ${name}`);
    return "";
  }
  const cls = `ico ico-${name}${className ? ` ${className}` : ""}`;
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="${cls}" viewBox="${def.vb}" width="1em" height="1em" ${def.attrs} ${a11y} focusable="false">${def.body}</svg>`;
}

/**
 * Gwiazdki oceny wypełnione procentowo: 4.6 → 4 pełne, piąta w 60%.
 * Częściowa gwiazdka = kontur + pełna gwiazdka w zagnieżdżonym <svg> o
 * szerokości przyciętej do ułamka (zagnieżdżony svg obcina zawartość do
 * swojego obszaru, więc nie trzeba clipPath z unikalnym id).
 * @param {number} value średnia ocena
 * @param {{ max?: number, label?: string }} [opts]
 */
export function starRating(value, { max = 5, label = "" } = {}) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const X0 = 2.7, X1 = 21.3; // poziomy zasięg rysunku gwiazdki w viewBox 0–24
  const empty = ICONS["star-empty"], full = ICONS.star;
  let out = "";
  for (let i = 0; i < max; i++) {
    const frac = Math.max(0, Math.min(1, v - i));
    if (frac >= 0.99) { out += icon("star"); continue; }
    if (frac <= 0.01) { out += icon("star-empty"); continue; }
    const w = (X0 + frac * (X1 - X0)).toFixed(2);
    out += `<svg class="ico ico-star-part" viewBox="0 0 24 24" width="1em" height="1em" ${empty.attrs} aria-hidden="true" focusable="false">${empty.body}<svg width="${w}" height="24" ${full.attrs}>${full.body}</svg></svg>`;
  }
  const a11y = label ? ` role="img" aria-label="${esc(label)}"` : "";
  return `<span class="ico-stars"${a11y}>${out}</span>`;
}

/**
 * Ikona + tekst (tekst jest escapowany) — do przycisków ustawianych z JS:
 *   btn.innerHTML = iconText("arrow-left", t("common.back"));
 * @param {{ after?: boolean }} [opts] after = ikona za tekstem.
 */
export function iconText(name, text, { after = false } = {}) {
  const i = icon(name), txt = esc(text ?? "");
  if (!i) return txt;
  return after ? `${txt} ${i}` : `${i} ${txt}`;
}

/** Podmienia <i data-icon="nazwa"> (i podobne) w danym poddrzewie na <svg>. */
export function hydrateIcons(root = typeof document !== "undefined" ? document : null) {
  if (!root?.querySelectorAll) return;
  const list = root.matches?.("[data-icon]") ? [root] : [];
  list.push(...root.querySelectorAll("[data-icon]"));
  for (const el of list) {
    if (el.tagName === "svg" || el.tagName === "SVG") continue;
    const extra = String(el.getAttribute("class") || "").split(/\s+/).filter((c) => c && c !== "ico").join(" ");
    const html = icon(el.dataset.icon, { className: extra, label: el.getAttribute("aria-label") || "" });
    if (html) el.outerHTML = html;
  }
}

if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  const start = () => {
    hydrateIcons(document);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) hydrateIcons(n);
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
