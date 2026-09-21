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
