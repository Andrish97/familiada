// base-explorerjs/actions/registry.js
// Rejestr akcji menedżera bazy: każda akcja zdefiniowana raz. Pasek narzędzi,
// menu kontekstowe, skróty klawiszowe (i dalej przeciąganie, gesty) tylko
// z niego czytają — etykieta, ikona, skrót, widoczność, dostępność, wykonanie
// i komunikat błędu są w jednym miejscu.
//
// Pola wpisu:
//   id        nazwa akcji (przestrzenie: folder., question., item., clip., …)
//   label     (ctx) => klucz tłumaczenia (menu; pasek bierze go do dymka)
//   icon, danger, primary
//   toolbar   { act, group } — przycisk paska (act = data-act, grupa = separator)
//   menu      cele menu kontekstowego: "root" | "cat" | "q" | "tag" | "tags-bg" | "meta"
//   menuGroup kolejność grup w menu (separator między grupami)
//   shortcut  { key: KeyboardEvent.code, mod?, shift?, alt? } (+ repeat: true,
//             jeśli przytrzymanie klawisza może powtarzać akcję)
//   visible   (ctx) => bool — „ma sens tu” (nie → przycisk/pozycja znika)
//   enabled   (ctx) => true | klucz powodu — „można teraz” (nie → szara,
//             powód w dymku; ze skrótu ten sam powód jako komunikat)
//   run       (ctx) => Promise
//   errorKey  komunikat, gdy wykonanie się nie uda (bez własnego komunikatu)

import {
  createFolderHere,
  createQuestionHere,
  deleteSelected,
  renameSelectedPrompt,
  copySelectedToClipboard,
  cutSelectedToClipboard,
  pasteClipboardHere,
  duplicateSelected,
  deleteTags,
  untagSelected,
  openFolder,
} from "../actions.js?v=v2026-10-20T19584";

const R = "baseExplorer.reasons.";

// Wspólne warunki (jedno miejsce zamiast canWrite/isEditor/canMutateHere…).
const needEdit = (ctx) => (ctx.canEdit ? true : `${R}readOnly`);
const needSel = (ctx) => (ctx.sel.count ? true : `${R}selectSomething`);
const needOne = (ctx) => (ctx.sel.one ? true : `${R}selectOne`);
// Tworzenie i wklejanie ma sens tylko „gdzieś”: w folderze, nie w wynikach.
// Menu na konkretnym folderze (albo wierszu „Folder główny”) wskazuje to miejsce.
const inPlace = (ctx) => !ctx.isFilterView || ctx.target?.kind === "cat" || ctx.target?.id === "root";

export const ACTIONS = [
  // ===== Tworzenie =====
  {
    id: "folder.create",
    label: (ctx) => (ctx.target?.kind === "cat" ? "baseExplorer.menu.newFolderIn" : "baseExplorer.menu.newFolder"),
    icon: "folder-plus",
    toolbar: { act: "newFolder", group: "create" },
    menu: ["root", "cat"], menuGroup: "create",
    shortcut: { key: "KeyN", mod: true, shift: true },
    visible: (ctx) => ctx.canEdit && inPlace(ctx),
    enabled: needEdit,
    run: (ctx) => createFolderHere(ctx.state, { parentId: ctx.here }),
    errorKey: "baseExplorer.errors.createFolderFailed",
  },
  {
    id: "question.create",
    label: (ctx) => (ctx.target?.kind === "cat" ? "baseExplorer.menu.newQuestionIn" : "baseExplorer.menu.newQuestion"),
    icon: "file-plus",
    toolbar: { act: "newQuestion", group: "create" },
    menu: ["root", "cat"], menuGroup: "create",
    shortcut: { key: "KeyN", mod: true },
    visible: (ctx) => ctx.canEdit && inPlace(ctx),
    enabled: needEdit,
    run: (ctx) => createQuestionHere(ctx.state, { categoryId: ctx.here }),
    errorKey: "baseExplorer.errors.createQuestionFailed",
  },

  // ===== Nawigacja =====
  {
    id: "folder.open",
    label: () => "baseExplorer.menu.openFolder",
    icon: "folder",
    menu: ["cat"], menuGroup: "open",
    shortcut: { key: "Enter" },
    visible: () => true,
    enabled: (ctx) => (ctx.sel.one && ctx.sel.folderIds.length === 1 ? true : `${R}selectFolder`),
    run: (ctx) => openFolder(ctx.state, ctx.sel.folderIds[0]),
    errorKey: "baseExplorer.errors.operationFailed",
  },

  // ===== Edycja =====
  {
    id: "question.edit",
    label: () => "baseExplorer.menu.editQuestion",
    icon: "edit-paper",
    toolbar: { act: "editQuestion", group: "edit" },
    menu: ["q"], menuGroup: "edit",
    shortcut: { key: "KeyE", mod: true },
    visible: (ctx) => ctx.canEdit,
    enabled: (ctx) => (ctx.sel.oneQuestionId ? true : `${R}selectQuestion`),
    run: (ctx) => ctx.state._api?.openQuestionModal?.(ctx.sel.oneQuestionId),
    errorKey: "baseExplorer.errors.questionOpenSaveFailed",
  },
  {
    id: "item.tags",
    label: () => "baseExplorer.menu.tags",
    icon: "tag",
    toolbar: { act: "editTags", group: "edit" },
    menu: ["cat", "q"], menuGroup: "tags",
    shortcut: { key: "KeyT", mod: true },
    visible: (ctx) => ctx.canEdit,
    enabled: needSel,
    run: (ctx) => ctx.state._api?.openAssignTagsModal?.(),
    errorKey: "baseExplorer.errors.operationFailed",
  },
  {
    id: "item.rename",
    label: (ctx) => (ctx.sel.oneQuestionId ? "baseExplorer.menu.renameQuestion" : "baseExplorer.menu.rename"),
    icon: "pencil",
    toolbar: { act: "rename", group: "edit" },
    menu: ["cat", "q"], menuGroup: "edit",
    shortcut: { key: "F2" },
    visible: (ctx) => ctx.canEdit,
    enabled: needOne,
    run: (ctx) => renameSelectedPrompt(ctx.state),
    errorKey: "baseExplorer.errors.renameFailed",
  },
  {
    id: "item.untag",
    label: () => "baseExplorer.menu.untag",
    icon: "tag",
    danger: true,
    toolbar: { act: "untag", group: "edit" },
    menu: ["cat", "q"], menuGroup: "danger",
    visible: (ctx) => ctx.canEdit && ctx.isTagView,
    enabled: needSel,
    run: (ctx) => untagSelected(ctx.state),
    errorKey: "baseExplorer.errors.removeTagsFailed",
  },
  {
    id: "item.delete",
    label: () => "baseExplorer.menu.delete",
    icon: "trash",
    danger: true,
    toolbar: { act: "delete", group: "edit" },
    menu: ["cat", "q"], menuGroup: "danger",
    shortcut: { key: "Delete" },
    visible: (ctx) => ctx.canEdit,
    enabled: needSel,
    run: (ctx) => deleteSelected(ctx.state),
    errorKey: "baseExplorer.errors.deleteFailed",
  },

  // ===== Schowek =====
  {
    id: "clip.copy",
    label: () => "baseExplorer.menu.copy",
    icon: "copy",
    toolbar: { act: "copy", group: "clipboard" },
    menu: ["cat", "q"], menuGroup: "clipboard",
    shortcut: { key: "KeyC", mod: true },
    visible: (ctx) => ctx.canEdit,
    enabled: needSel,
    run: (ctx) => copySelectedToClipboard(ctx.state),
    errorKey: "baseExplorer.errors.operationFailed",
  },
  {
    id: "clip.cut",
    label: () => "baseExplorer.menu.cut",
    icon: "cut",
    toolbar: { act: "cut", group: "clipboard" },
    menu: ["cat", "q"], menuGroup: "clipboard",
    shortcut: { key: "KeyX", mod: true },
    visible: (ctx) => ctx.canEdit,
    enabled: needSel,
    run: (ctx) => cutSelectedToClipboard(ctx.state),
    errorKey: "baseExplorer.errors.operationFailed",
  },
  {
    id: "clip.paste",
    label: () => "baseExplorer.menu.paste",
    icon: "paste",
    toolbar: { act: "paste", group: "clipboard" },
    menu: ["root", "cat", "q"], menuGroup: "clipboard",
    shortcut: { key: "KeyV", mod: true },
    visible: (ctx) => ctx.canEdit && inPlace(ctx),
    enabled: (ctx) => (ctx.hasClipboard ? true : `${R}clipboardEmpty`),
    // menu na folderze: wklej do tego folderu; inaczej do bieżącego
    run: (ctx) => pasteClipboardHere(ctx.state, { target: ctx.here }),
    errorKey: "baseExplorer.errors.pasteFailed",
  },
  {
    id: "item.duplicate",
    label: () => "baseExplorer.menu.duplicate",
    icon: "duplicate",
    toolbar: { act: "duplicate", group: "clipboard" },
    menu: ["cat", "q"], menuGroup: "clipboard",
    shortcut: { key: "KeyD", mod: true },
    // duplikat powstaje „tu”, więc w wynikach go nie ma (do czasu kopii
    // w folderze źródłowym — etap przeniesienia poleceń)
    visible: (ctx) => ctx.canEdit && !ctx.isFilterView,
    enabled: needSel,
    run: (ctx) => duplicateSelected(ctx.state),
    errorKey: "baseExplorer.errors.duplicateFailed",
  },

  // ===== Gra =====
  {
    id: "game.create",
    label: () => "baseExplorer.menu.createGame",
    icon: "gamepad",
    primary: true,
    toolbar: { act: "createGame", group: "game" },
    menu: ["cat", "q"], menuGroup: "game",
    shortcut: { key: "KeyG", mod: true },
    // także czytelnik: gra jest kopią pytań w jego własnych grach
    visible: () => true,
    enabled: needSel,
    run: async (ctx) => {
      const qIds = await ctx.state._api?.selectionToQuestionIds?.();
      if (!qIds?.length) return;
      await ctx.state._api?.openExportModal?.({ preselectIds: qIds });
    },
    errorKey: "baseExplorer.errors.operationFailed",
  },

  // ===== Widok =====
  {
    id: "view.refresh",
    label: () => "baseExplorer.toolbar.refreshView",
    icon: "refresh",
    toolbar: { act: "refreshView", group: "view" },
    shortcut: { key: "KeyR", mod: true, alt: true },
    visible: () => true,
    enabled: () => true,
    run: (ctx) => ctx.state._api?.refreshList?.(),
    errorKey: "baseExplorer.errors.operationFailed",
  },

  // ===== Tagi (lewy panel) =====
  {
    id: "tag.show",
    label: () => "baseExplorer.menu.show",
    icon: "eye",
    menu: ["tag", "tags-bg"], menuGroup: "open",
    visible: () => true,
    enabled: (ctx) => (ctx.tagSel.length ? true : `${R}selectTag`),
    run: (ctx) => ctx.state._api?.openTagView?.(ctx.tagSel),
    errorKey: "baseExplorer.errors.operationFailed",
  },
  {
    id: "type.show",
    label: () => "baseExplorer.menu.show",
    icon: "eye",
    menu: ["meta"], menuGroup: "open",
    visible: () => true,
    enabled: (ctx) => (ctx.typeSel.length ? true : `${R}selectType`),
    run: (ctx) => ctx.state._api?.openTypeView?.(),
    errorKey: "baseExplorer.errors.operationFailed",
  },
  {
    id: "tag.create",
    label: () => "baseExplorer.menu.addTag",
    icon: "plus",
    menu: ["tag", "tags-bg"], menuGroup: "create",
    visible: (ctx) => ctx.canEdit,
    enabled: () => true,
    run: (ctx) => ctx.state._api?.openTagModal?.({ mode: "create" }),
    errorKey: "baseExplorer.tags.errors.saveFailed",
  },
  {
    id: "tag.edit",
    label: () => "baseExplorer.menu.editTag",
    icon: "pencil",
    menu: ["tag"], menuGroup: "edit",
    visible: (ctx) => ctx.canEdit,
    enabled: (ctx) => (ctx.tagSel.length === 1 ? true : `${R}selectOneTag`),
    run: (ctx) => ctx.state._api?.openTagModal?.({ mode: "edit", tagId: ctx.tagSel[0] }),
    errorKey: "baseExplorer.tags.errors.saveFailed",
  },
  {
    id: "tag.delete",
    label: (ctx) => (ctx.tagSel.length > 1 ? "baseExplorer.menu.deleteTags" : "baseExplorer.menu.deleteTag"),
    icon: "trash",
    danger: true,
    menu: ["tag"], menuGroup: "danger",
    visible: (ctx) => ctx.canEdit,
    enabled: (ctx) => (ctx.tagSel.length ? true : `${R}selectTag`),
    run: (ctx) => deleteTags(ctx.state, ctx.tagSel),
    errorKey: "baseExplorer.errors.deleteTagsFailed",
  },
];

export const MENU_GROUPS = ["open", "create", "clipboard", "tags", "edit", "game", "danger"];
export const TOOLBAR_GROUPS = ["create", "edit", "clipboard", "game", "view"];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
export function actionById(id) {
  return BY_ID.get(id) || null;
}

// Stan akcji w kontekście: { visible, enabled (bool), reason (klucz|null) }.
export function actionState(action, ctx) {
  const visible = !!action.visible(ctx);
  const r = visible ? action.enabled(ctx) : false;
  return { visible, enabled: r === true, reason: r === true ? null : (typeof r === "string" ? r : null) };
}
