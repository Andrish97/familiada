// Wspólny "silnik ikon" -- jedno miejsce z gotowymi ikonami SVG (jednolity
// styl: wypełniony kształt, bez obrysu), żeby nie duplikować tych samych
// glifów w kilku plikach. Każda stała to kompletny <svg>...</svg>, bez
// narzuconej klasy CSS -- rozmiar/kolor ustawia miejsce użycia.

// Kosz zamiast "X" -- semantyka usuwania, nie zamykania -- używany spójnie
// na kaflach w builderze, bazach i logo (ten sam glif co w Base Explorerze).
export const TRASH_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"/></svg>`;

// Narzędzia edytora rysunku (logo-editor/js/draw.js) -- dawniej osobne
// ikony kreskowe (stroke) tylko w tym pliku, teraz wypełnione (fill), jak
// reszta apki, i dostępne do reużycia gdziekolwiek indziej.
export const SELECT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3l6 14 2-6 6-2L5 3z"/></svg>`;

export const PAN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 11V5.83l1.59 1.59L16 6l-4-4-4 4 1.41 1.41L11 5.83V11H5.83l1.59-1.59L6 8l-4 4 4 4 1.41-1.41L5.83 13H11v5.17l-1.59-1.59L8 18l4 4 4-4-1.41-1.41L13 18.17V13h5.17l-1.59 1.59L18 16l4-4-4-4-1.41 1.41L18.17 11H13z"/></svg>`;

export const ZOOM_IN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM12 10H10v2H9v-2H7V9h2V7h1v2h2z"/></svg>`;

export const ZOOM_OUT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z"/></svg>`;

export const TEXT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4v3h5.5v12h3V7H19V4H5z"/></svg>`;

export const BRUSH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z"/></svg>`;

export const ERASER_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16.24 3.56a2 2 0 0 1 2.83 0l2.37 2.37a2 2 0 0 1 0 2.83L13 17.19a2 2 0 0 1-1.41.59H7.5L4 14.28a2 2 0 0 1 0-2.83l8.83-8.83a2 2 0 0 1 1.41-.58zM7.5 17.78l2.09 2.09H21v1.5H8.5z"/></svg>`;

export const SHAPES_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2" y="9" width="8" height="8" rx="1.5"/><circle cx="17" cy="6" r="4.2"/><polygon points="17,13 22,22 12,22"/></svg>`;

export const UNDO_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`;

export const REDO_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>`;

export const EYE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;

// Dwa nachodzące na siebie kwadraty -- ten sam glif co svgDuplicate() w
// base-explorer/js/render.js, żeby ikona "duplikuj" wyglądała tak samo
// wszędzie tam, gdzie występuje.
export const DUPLICATE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7h12v14H7V7zm-2 2H3V3h14v2H5v4z"/></svg>`;

// Przeniesione z base-explorer/js/render.js (toolbar Base Explorera +
// ikony w drzewie/liście) -- jedno źródło zamiast kopii w dwóch plikach.
export const FOLDER_PLUS_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6zm2 7h-2v2H8v2h2v2h2v-2h2v-2h-2v-2z"/></svg>`;

export const FILE_PLUS_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1v5h5M12 11h-2v2H8v2h2v2h2v-2h2v-2h-2v-2z"/></svg>`;

export const EDIT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l10.06-10.06.92.92L5.92 20.08zM20.71 6.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.13 1.13 2.75 2.75 1.13-1.13z"/></svg>`;

export const TAG_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3H4a2 2 0 0 0-2 2v5.59A2 2 0 0 0 2.83 12l9.59 9.59a2 2 0 0 0 2.83 0l5.34-5.34a2 2 0 0 0 0-2.83zM6.5 8A1.5 1.5 0 1 1 8 6.5 1.5 1.5 0 0 1 6.5 8z"/></svg>`;

// Ołówek -- inny wariant niż EDIT_ICON (używany np. przy zmianie nazwy,
// vs. EDIT_ICON przy "Edytuj pytanie"), oba to legalne, celowo osobne
// przyciski w toolbarze Base Explorera.
export const PENCIL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18-11.5a1 1 0 0 0 0-1.41l-1.59-1.59a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75L21 5.75z"/></svg>`;

export const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm4 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h12v14z"/></svg>`;

export const CUT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9.64 7.64L12 10l2.36-2.36a3 3 0 1 1 1.41 1.41L13.41 11l2.36 2.36a3 3 0 1 1-1.41 1.41L12 12.41l-2.36 2.36a3 3 0 1 1-1.41-1.41L10.59 11 8.23 8.64a3 3 0 1 1 1.41-1.41z"/></svg>`;

export const PASTE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 4h-3.18A3 3 0 0 0 13 2h-2a3 3 0 0 0-2.82 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8-1h2a1 1 0 0 1 1 1v1H10V4a1 1 0 0 1 1-1zm8 19H5V6h2v2h10V6h2v16z"/></svg>`;

export const PLAY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7L8 5z"/></svg>`;

// Poprzednia ścieżka mieszała dwa łuki o różnych promieniach/środkach
// (A7.95.../a5 5.../A7 7...) dla strzałki i "kółka" -- nie składały się w
// spójny pierścień, więc ikona wyglądała na wizualnie zepsutą. To
// sprawdzony, jednościeżkowy glif Material Icons "refresh".
export const REFRESH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;

export const FOLDER_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/></svg>`;

export const HOME_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`;

// Zatwierdzone w przeglądzie emotek -> ikon (patrz tabela z komentarzami).
export const CHECK_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"/></svg>`;

export const CANCEL_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"/></svg>`;

export const STAR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>`;

// Pusta gwiazdka -- ten sam kształt co STAR_ICON, tylko obrys zamiast
// wypełnienia, do wierszy "X na 5 gwiazdek" (np. oceny w marketplace).
export const STAR_EMPTY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>`;

export const ENVELOPE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M3 6.5l9 6.5 9-6.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;

export const PEOPLE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8" r="3"/><path d="M2 19c0-3.3 2.9-6 6.5-6S15 15.7 15 19v1H2v-1z"/><circle cx="17" cy="9" r="2.4"/><path d="M14 12.2c1-.5 2-.7 3-.7 3 0 5.5 2.2 5.5 5v.5H16v-.5c0-1.6-.5-3-1.9-4.1z" opacity=".7"/></svg>`;

export const PERSON_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="7.5" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7v1H4v-1z"/></svg>`;

export const SAVE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`;

export const SEARCH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;

export const HAMBURGER_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="2.4" rx="1.2"/><rect x="3" y="10.8" width="18" height="2.4" rx="1.2"/><rect x="3" y="16.6" width="18" height="2.4" rx="1.2"/></svg>`;

export const SPEAKER_ON_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon points="4,9 8,9 13,5 13,19 8,15 4,15"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 6a9 9 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

export const SPEAKER_OFF_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon points="4,9 8,9 13,5 13,19 8,15 4,15"/><path d="M16.5 9l5 5M21.5 9l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

export const GLOBE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="3.6" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`;
