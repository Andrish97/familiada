// familiada/logo/js/routes.js
// Adresy stron logo: lista /logo/ i trzy edytory /logo/editor-<tryb>/?id=.
// Edytor wraca do listy przez ?ret= (lista z kartą, z której wszedł);
// bez ret — na /logo/ (domyślna karta). Patrz docs/nawigacja-mapa-plan.md.

import { withLangParam } from "../../shared/translation/translation.js?v=v2026-10-09T01243";
import { TYPE_GLYPH } from "./render.js?v=v2026-10-09T01243";

export const LIST_PATH = "/logo/";

export const EDITOR_PATHS = {
  TEXT: "/logo/editor-text/",
  DRAW: "/logo/editor-draw/",
  IMAGE: "/logo/editor-image/",
};

/**
 * Tryb edycji zapisanego logo. GLYPH to zawsze Tekst; PIX -- Obraz, jeśli ma
 * obraz źródłowy, w pozostałych przypadkach Rysunek (także stare logo i demo
 * bez source: ich kropki trafiają na scenę jako warstwa obrazu).
 */
export function editModeFor(logo) {
  if (logo.type === TYPE_GLYPH) return "TEXT";
  const src = logo.payload?.source || {};
  if (src.mode === "IMAGE" || src.imageUrl || src.imageData) return "IMAGE";
  return "DRAW";
}

export const currentRelativeUrl = () => `${location.pathname}${location.search}${location.hash}`;

export function editorUrl(mode, id, ret = currentRelativeUrl()) {
  const url = new URL(EDITOR_PATHS[mode], location.origin);
  url.searchParams.set("id", id);
  url.searchParams.set("ret", ret);
  return withLangParam(url.toString());
}

/** Powrót z edytora: ?ret= tylko, jeśli wskazuje listę logo w tej domenie. */
export function listBackUrl() {
  const raw = new URLSearchParams(location.search).get("ret");
  if (raw) {
    try {
      const url = new URL(raw, location.origin);
      if (url.origin === location.origin && url.pathname === LIST_PATH) return withLangParam(url.toString());
    } catch {}
  }
  return withLangParam(new URL(LIST_PATH, location.origin).toString());
}

/** Instrukcja (karta „logo”); jej „Wstecz” wraca dokładnie na bieżący adres. */
export function manualUrl() {
  const url = new URL("/manual/", location.origin);
  url.searchParams.set("ret", currentRelativeUrl());
  url.hash = "logo";
  return withLangParam(url.toString());
}
