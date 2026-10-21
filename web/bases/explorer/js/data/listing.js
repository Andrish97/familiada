// base-explorerjs/data/listing.js
// „Co pokazać”: jedna czysta funkcja z miejsca (folder / folder główny /
// kosz) i zapytania (tekst + tagi + proponowane kategorie).
//
// Zasady (docs/menedzer-bazy/README.md §3.7):
// - puste zapytanie → zawartość bieżącego folderu (jak dziś),
// - zapytanie → wyniki z poddrzewa bieżącego miejsca (folder główny = cała
//   baza), jak wyszukiwanie w Eksploratorze; tekst, tagi i kategorie łączone
//   razem, bez względu na to, skąd przyszły (pole wyszukiwania czy panel),
// - tekst bez wielkości liter i polskich znaków, słowa w dowolnej kolejności,
// - tagi: pytanie ma mieć wszystkie (AND); kategorie: którąkolwiek (OR —
//   są rozłączne),
// - folder w wynikach, gdy pasują wszystkie pytania jego poddrzewa (jak
//   kropki przy folderze) albo jego nazwa pasuje do tekstu (i spełnia tagi
//   i kategorie); pytania pod pokazanym folderem nie powtarzają się.

export function emptyQuery() {
  return { text: "", tagIds: [], types: [] };
}

export function isQueryEmpty(q) {
  return !String(q?.text || "").trim() && !q?.tagIds?.length && !q?.types?.length;
}

// „Żółw” → „zolw”: małe litery, bez znaków diakrytycznych (ł osobno — nie
// rozkłada się w NFD).
export function normalizeText(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
}

function words(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

// hay: tekst już znormalizowany (derived.js: questionSearchText / folderSearchText)
function hasAllWords(hay, ws) {
  if (!ws.length) return true;
  return ws.every((w) => hay.includes(w));
}

/**
 * location: { kind: "root" } | { kind: "folder", folderId } | { kind: "trash" }
 * Zwraca:
 *  - { mode: "browse", folders, questions }
 *  - { mode: "results", folders, questions, matchCount: Map(folderId → n) }
 *  - { mode: "trash", entries }
 */
export function computeListing(store, d, { location, query }) {
  if (location?.kind === "trash") {
    return { mode: "trash", entries: store?.trash || [] };
  }
  const scope = location?.kind === "folder" && d.folderById.has(location.folderId) ? location.folderId : null;

  if (isQueryEmpty(query)) {
    return { mode: "browse", folders: d.childFolders(scope), questions: d.folderQuestions(scope) };
  }

  const ws = words(query.text);
  const tagIds = query.tagIds || [];
  const types = query.types || [];

  const questionMatches = (q) => hasAllWords(d.questionSearchText(q.id), ws)
    && tagIds.every((t) => d.tagsOfQuestion(q.id).has(t))
    && (!types.length || types.includes(d.typeOfQuestion(q.id)));

  const scopeQuestionIds = scope ? d.subtreeQuestionIds(scope) : (store?.questions || []).map((q) => q.id);
  const matched = new Set(scopeQuestionIds.filter((id) => questionMatches(d.questionById.get(id))));

  const scopeFolderIds = scope ? d.descendantFolderIds(scope) : [...d.folderById.keys()];
  const shown = new Set();
  const matchCount = new Map();
  for (const fid of scopeFolderIds) {
    const ids = d.subtreeQuestionIds(fid);
    const n = ids.filter((id) => matched.has(id)).length;
    matchCount.set(fid, n);
    const full = ids.length > 0 && n === ids.length;
    const folderFitsFilters = (!tagIds.length && !types.length) || full;
    const byName = ws.length > 0 && hasAllWords(d.folderSearchText(fid), ws) && folderFitsFilters;
    if (full || byName) shown.add(fid);
  }

  // tylko najwyższe pokazane foldery (bez folderu obok jego przodka)
  const top = [...shown].filter((fid) => !d.ancestorIds(fid).some((a) => shown.has(a)));
  const topSet = new Set(top);
  const insideShown = (q) => {
    const fid = q.category_id;
    return !!fid && d.folderById.has(fid) && (topSet.has(fid) || d.ancestorIds(fid).some((a) => topSet.has(a)));
  };

  return {
    mode: "results",
    folders: top.map((fid) => d.folderById.get(fid)),
    questions: [...matched].map((id) => d.questionById.get(id)).filter((q) => !insideShown(q)),
    matchCount,
  };
}
