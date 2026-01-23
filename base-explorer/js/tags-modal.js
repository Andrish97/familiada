// base-explorer/js/tags-modal.js
// Nowy modal tagów (3 warstwy) – spójny z założeniami:
// - na każdej warstwie tylko X i "Zapisz"
// - L1: lista tagów + tri-state + "Dodaj nowy" -> L2(create)
// - L2: nazwa + duży kafel koloru -> klik otwiera L3
// - L3: picker (zostaje), Zapisz wraca do L2, X zamyka cały modal
//
// UWAGA: ten plik nie zna nic o SEARCH/TAG view. To jest czysty modal.

import { sb } from "../../js/core/supabase.js";
import { listQuestionTags, listAllQuestions } from "./repo.js";

/* ================= Utils ================= */

function canWrite(state) {
  return state?.role === "owner" || state?.role === "editor";
}

function uniqIds(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function clamp255(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r, g, b) {
  const to2 = (x) => x.toString(16).padStart(2, "0");
  return "#" + to2(clamp255(r)) + to2(clamp255(g)) + to2(clamp255(b));
}

function hexToRgb(hex) {
  const s = String(hex || "").trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const h = m[1];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function hideErr(box) {
  if (!box) return;
  box.style.display = "none";
  box.textContent = "";
}

function showErr(box, msg) {
  if (!box) return;
  box.style.display = "";
  box.textContent = String(msg || "");
}

function normTagName(s) {
  return String(s || "")
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isDuplicateTagName(state, nameRaw, { allowId = null } = {}) {
  const wanted = normTagName(nameRaw);
  if (!wanted) return false;

  const tags = Array.isArray(state.tags) ? state.tags : [];
  return tags.some((t) => {
    if (!t) return false;
    if (allowId && t.id === allowId) return false;
    return normTagName(t.name) === wanted;
  });
}

/* ================= DOM map (ID muszą pasować do Twojego HTML) =================
  Oczekiwane ID:
  overlay: tagsOverlay

  Warstwy:
    tagsL1, tagsL2, tagsL3

  L1:
    tagsL1Close (X)
    tagsL1Save  (Zapisz)
    tagsAddNew  (Dodaj nowy)
    tagsAssignInfo
    tagsAssignList
    tagsAssignErr

  L2:
    tagsL2Close (X)
    tagsL2Save  (Zapisz)
    tagsEditTitle
    tagsEditHelp
    tagsEditName
    tagsEditColorTile  (duży kafel – klik => L3)
    tagsEditColorDot   (kropka w kaflu)
    tagsEditErr

  L3:
    tagsL3Close (X)
    tagsL3Save  (Zapisz)  => akceptuje kolor i wraca do L2
    tagsColorPreview
    tagsColorHex
    tagsColorR, tagsColorG, tagsColorB
    tagsColorRVal, tagsColorGVal, tagsColorBVal
*/

function els() {
  const overlay = document.getElementById("tagsOverlay");
  if (!overlay) return null;

  return {
    overlay,

    L1: document.getElementById("tagsL1"),
    L2: document.getElementById("tagsL2"),
    L3: document.getElementById("tagsL3"),

    // L1
    l1Close: document.getElementById("tagsL1Close"),
    l1Save: document.getElementById("tagsL1Save"),
    addNew: document.getElementById("tagsAddNew"),
    assignInfo: document.getElementById("tagsAssignInfo"),
    assignList: document.getElementById("tagsAssignList"),
    assignErr: document.getElementById("tagsAssignErr"),

    // L2
    l2Close: document.getElementById("tagsL2Close"),
    l2Save: document.getElementById("tagsL2Save"),
    editTitle: document.getElementById("tagsEditTitle"),
    editHelp: document.getElementById("tagsEditHelp"),
    editName: document.getElementById("tagsEditName"),
    editColorTile: document.getElementById("tagsEditColorTile"),
    editColorDot: document.getElementById("tagsEditColorDot"),
    editErr: document.getElementById("tagsEditErr"),

    // L3
    l3Close: document.getElementById("tagsL3Close"),
    l3Save: document.getElementById("tagsL3Save"),
    colorPreview: document.getElementById("tagsColorPreview"),
    colorHex: document.getElementById("tagsColorHex"),
    colorR: document.getElementById("tagsColorR"),
    colorG: document.getElementById("tagsColorG"),
    colorB: document.getElementById("tagsColorB"),
    colorRVal: document.getElementById("tagsColorRVal"),
    colorGVal: document.getElementById("tagsColorGVal"),
    colorBVal: document.getElementById("tagsColorBVal"),
  };
}

function showLayer(E, n) {
  E.L1.style.display = n === 1 ? "" : "none";
  E.L2.style.display = n === 2 ? "" : "none";
  E.L3.style.display = n === 3 ? "" : "none";
}

/* ================= Data helpers ================= */

// Rozwijanie folderów -> pytania w poddrzewie: używa cache z actions.js, ale tu robimy minimum:
// Jeśli masz już state._folderDescQIds z ensureDerivedFolderMaps – podajemy go opcjonalnie przez opts.
// Jeśli nie: fallback to "nie rozwijamy folderów" (bezpieczne, ale uboższe).
async function expandFoldersToQuestionIds(state, folderIds, opts) {
  const cIds = uniqIds(folderIds);
  if (!cIds.length) return [];

  const map = opts?.folderDescQIds; // Map(folderId -> Set(qid))
  if (!map) return [];

  const out = new Set();
  for (const cid of cIds) {
    const set = map.get(cid);
    if (!set) continue;
    for (const qid of set) out.add(qid);
  }
  return Array.from(out);
}

async function refreshTags(state) {
  const { data, error } = await sb()
    .from("qb_tags")
    .select("id,base_id,name,color,ord")
    .eq("base_id", state.baseId)
    .order("ord", { ascending: true });

  if (error) throw error;
  state.tags = data || [];
}

/* ================= Modal main ================= */

export async function openTagsModal(state, opts = {}) {
  const E = els();
  if (!E) return false;

  const editor = canWrite(state);

  // opts:
  // mode: "assign" | "create" | "edit"
  // tagId: dla edit
  // selection: { qIds, cIds } – jeśli nie podasz, modal pokaże "Brak zaznaczenia" i zapis L1 nic nie zrobi
  // folderDescQIds: Map(folderId -> Set(qid)) (opcjonalnie) – jeśli chcesz, by foldery się rozwijały do pytań
  const mode = opts.mode || "assign";
  const editTagId = opts.tagId || null;
  const sel = opts.selection || { qIds: [], cIds: [] };

  const m = {
    layer: 1,
    mode,
    editTagId,
    // tri-state tylko dla L1
    tri: new Map(), // tagId -> "all" | "none" | "some"
    dirty: new Set(), // tagId, które user zmienił
    // L2
    edit: {
      mode: mode === "edit" ? "edit" : "create",
      tagId: mode === "edit" ? editTagId : null,
      name: "",
      color: "#4da3ff",
    },
    // L3
    pickedColor: "#4da3ff",
    colorBase: "#4da3ff",
  };

  let resolvePromise = null;

  function close(result) {
    E.overlay.style.display = "none";
    document.removeEventListener("keydown", onKey);

    E.l1Close?.removeEventListener("click", onClose);
    E.l2Close?.removeEventListener("click", onClose);
    E.l3Close?.removeEventListener("click", onClose);

    E.l1Save?.removeEventListener("click", onSave);
    E.l2Save?.removeEventListener("click", onSave);
    E.l3Save?.removeEventListener("click", onSave);

    E.addNew?.removeEventListener("click", onAddNew);
    E.editColorTile?.removeEventListener("click", onOpenPicker);

    E.colorR?.removeEventListener("input", onSliderInput);
    E.colorG?.removeEventListener("input", onSliderInput);
    E.colorB?.removeEventListener("input", onSliderInput);
    E.colorHex?.removeEventListener("input", onHexInput);

    resolvePromise(result);
  }

  function go(n) {
    m.layer = n;
    showLayer(E, n);
    hideErr(E.assignErr);
    hideErr(E.editErr);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(false);
    }
  }

  function onClose() {
    close(false);
  }

  function renderAssignInfo() {
    if (!E.assignInfo) return;
    const qN = (sel.qIds || []).length;
    const cN = (sel.cIds || []).length;
    const parts = [];
    if (qN) parts.push(`${qN} pyt.`);
    if (cN) parts.push(`${cN} folder(ów)`);
    E.assignInfo.textContent = parts.length ? `Zaznaczenie: ${parts.join(" + ")}.` : "Brak zaznaczenia.";
  }

  function triToUi(tri) {
    return {
      checked: tri === "all",
      indeterminate: tri === "some",
    };
  }

  function cycleTri(tagId) {
    const cur = m.tri.get(tagId) || "none";
    if (cur === "some") {
      alert("Tag jest przypisany częściowo. Kliknięcie ustawi: wszyscy.");
      m.tri.set(tagId, "all");
      m.dirty.add(tagId);
      return;
    }
    if (cur === "all") {
      m.tri.set(tagId, "none");
      m.dirty.add(tagId);
      return;
    }
    m.tri.set(tagId, "all");
    m.dirty.add(tagId);
  }

  async function initTriState() {
    if (!Array.isArray(state.tags)) await refreshTags(state);

    const tags = (state.tags || []).slice().sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));
    const tagIdsAll = tags.map((t) => t.id).filter(Boolean);

    // pytania = qIds + rozwinięte foldery (jeśli dostarczono mapę)
    const qFromFolders = await expandFoldersToQuestionIds(state, sel.cIds || [], opts);
    const allQIds = uniqIds([...(sel.qIds || []), ...(qFromFolders || [])]);

    // brak targetu: wszystko startuje jako "none"
    if (!allQIds.length) {
      for (const tid of tagIdsAll) m.tri.set(tid, "none");
      return;
    }

    // pobierz linki tagów dla targetowych pytań
    const links = await listQuestionTags(allQIds);
    const qMap = new Map(); // qid -> Set(tid)
    for (const l of links || []) {
      if (!qMap.has(l.question_id)) qMap.set(l.question_id, new Set());
      qMap.get(l.question_id).add(l.tag_id);
    }

    const total = allQIds.length;

    for (const tid of tagIdsAll) {
      let has = 0;
      for (const qid of allQIds) {
        const set = qMap.get(qid);
        if (set && set.has(tid)) has++;
      }
      if (has === 0) m.tri.set(tid, "none");
      else if (has === total) m.tri.set(tid, "all");
      else m.tri.set(tid, "some");
    }
  }

  function renderAssignList() {
    if (!E.assignList) return;
    const tags = (state.tags || []).slice().sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));

    E.assignList.innerHTML = tags
      .map((t) => {
        const tri = m.tri.get(t.id) || "none";
        const ui = triToUi(tri);

        return `
          <label class="tags-row" data-tag-id="${t.id}" style="opacity:${editor ? "1" : "0.75"}; cursor:${editor ? "pointer" : "default"};">
            <input type="checkbox" data-tag-id="${t.id}" ${ui.checked ? "checked" : ""} ${editor ? "" : "disabled"} />
            <span class="tag-dot" style="background:${t.color || "#777"}"></span>
            <span class="m-p">#${String(t.name || "")}</span>
            ${tri === "some" ? `<span class="m-note">częściowo</span>` : `<span class="m-note" style="visibility:hidden;">.</span>`}
          </label>
        `;
      })
      .join("");

    const boxes = Array.from(E.assignList.querySelectorAll('input[type="checkbox"][data-tag-id]'));
    for (const box of boxes) {
      const tid = box.dataset.tagId;
      const tri = m.tri.get(tid) || "none";
      box.indeterminate = tri === "some";

      box.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editor) return;

        cycleTri(tid);
        renderAssignList();
      });
    }
  }

  function enterL2(editMode, tagId) {
    m.edit.mode = editMode;
    m.edit.tagId = tagId || null;

    const current =
      editMode === "edit" && tagId ? (state.tags || []).find((t) => t.id === tagId) || null : null;

    m.edit.name = String(current?.name || "");
    m.edit.color = String(current?.color || "#4da3ff");
    m.pickedColor = m.edit.color;

    if (E.editTitle) E.editTitle.textContent = editMode === "edit" ? "Edytuj tag" : "Nowy tag";
    if (E.editHelp) E.editHelp.textContent = editMode === "edit" ? "Zmień nazwę i kolor taga." : "Dodaj nowy tag.";
    if (E.editName) E.editName.value = m.edit.name;

    if (E.editColorDot) E.editColorDot.style.background = m.pickedColor;
    if (E.editColorTile) {
      // jeśli kafel ma mieć też kolor tła – zależy od Twojego HTML/CSS
      E.editColorTile.style.setProperty("--tag-color", m.pickedColor);
    }

    go(2);
    try {
      E.editName?.focus?.();
      E.editName?.setSelectionRange?.(E.editName.value.length, E.editName.value.length);
    } catch {}
  }

  function setPickerUI({ r, g, b }, { silent = false } = {}) {
    r = clamp255(r);
    g = clamp255(g);
    b = clamp255(b);

    if (E.colorR) E.colorR.value = String(r);
    if (E.colorG) E.colorG.value = String(g);
    if (E.colorB) E.colorB.value = String(b);

    if (E.colorRVal) E.colorRVal.textContent = String(r);
    if (E.colorGVal) E.colorGVal.textContent = String(g);
    if (E.colorBVal) E.colorBVal.textContent = String(b);

    const hex = rgbToHex(r, g, b);

    // gradient tracki (tak jak miałeś)
    if (E.colorR) {
      const left = rgbToHex(0, g, b);
      const right = rgbToHex(255, g, b);
      E.colorR.style.setProperty("--track", `linear-gradient(to right, ${left}, ${right})`);
    }
    if (E.colorG) {
      const left = rgbToHex(r, 0, b);
      const right = rgbToHex(r, 255, b);
      E.colorG.style.setProperty("--track", `linear-gradient(to right, ${left}, ${right})`);
    }
    if (E.colorB) {
      const left = rgbToHex(r, g, 0);
      const right = rgbToHex(r, g, 255);
      E.colorB.style.setProperty("--track", `linear-gradient(to right, ${left}, ${right})`);
    }

    if (E.colorHex && !silent) E.colorHex.value = hex;
    if (E.colorPreview) E.colorPreview.style.background = hex;

    m.pickedColor = hex;

    // od razu aktualizuj L2
    if (E.editColorDot) E.editColorDot.style.background = hex;
    if (E.editColorTile) E.editColorTile.style.setProperty("--tag-color", hex);
  }

  function openPickerFrom(hex) {
    m.colorBase = String(hex || "#4da3ff");
    const rgb = hexToRgb(m.colorBase) || { r: 77, g: 163, b: 255 };
    setPickerUI(rgb, { silent: false });
    go(3);
  }

  async function saveL1Assign() {
    if (!editor) {
      close(false);
      return false;
    }
    
    // target pytania
    const qFromFolders = await expandFoldersToQuestionIds(state, sel.cIds || [], opts);
    const allQIds = uniqIds([...(sel.qIds || []), ...(qFromFolders || [])]);

    // brak targetu: tylko zamknij
    if (!allQIds.length) {
      close(true);
      return true;
    }

    const dirtyTagIds = Array.from(m.dirty || []).filter(Boolean);
    if (!dirtyTagIds.length) {
      close(true);
      return true;
    }

    // istniejące linki (qid x tid)
    const { data: existing, error: e0 } = await sb()
      .from("qb_question_tags")
      .select("question_id,tag_id")
      .in("question_id", allQIds)
      .in("tag_id", dirtyTagIds);
    if (e0) throw e0;

    const have = new Set((existing || []).map((x) => `${x.question_id}::${x.tag_id}`));

    const inserts = [];
    const deletes = []; // { tid, qIds }

    for (const tid of dirtyTagIds) {
      const tri = m.tri.get(tid) || "none";
      if (tri === "all") {
        for (const qid of allQIds) {
          const k = `${qid}::${tid}`;
          if (!have.has(k)) inserts.push({ question_id: qid, tag_id: tid });
        }
      } else if (tri === "none") {
        deletes.push({ tid, qIds: allQIds });
      }
    }

    for (const d of deletes) {
      const { error } = await sb()
        .from("qb_question_tags")
        .delete()
        .in("question_id", d.qIds)
        .eq("tag_id", d.tid);
      if (error) throw error;
    }

    if (inserts.length) {
      const { error } = await sb().from("qb_question_tags").insert(inserts, { defaultToNull: false });
      if (error) throw error;
    }

    close(true);
    return true;
  }

  async function saveL2Tag() {
    if (!editor) {
      close(false);
      return false;
    }

    hideErr(E.editErr);

    const nameRaw = String(E.editName?.value || "")
      .trim()
      .replace(/^#/, "")
      .slice(0, 40);

    if (!nameRaw) {
      showErr(E.editErr, "Podaj nazwę.");
      return false;
    }

    // upewnij się, że lista tagów jest świeża (dla duplikatów)
    if (!Array.isArray(state.tags)) await refreshTags(state);

    const allowId = m.edit.mode === "edit" ? (m.edit.tagId || null) : null;
    if (isDuplicateTagName(state, nameRaw, { allowId })) {
      showErr(E.editErr, "Taki tag już istnieje. Wybierz inną nazwę.");
      return false;
    }

    const color = String(m.pickedColor || "#4da3ff").trim();

    if (m.edit.mode === "edit" && m.edit.tagId) {
      const { error } = await sb().from("qb_tags").update({ name: nameRaw, color }).eq("id", m.edit.tagId);
      if (error) throw error;
    } else {
      const { error } = await sb()
        .from("qb_tags")
        .insert({ base_id: state.baseId, name: nameRaw, color, ord: 9999 }, { defaultToNull: false });
      if (error) throw error;
    }

    await refreshTags(state);

    // Po zapisie L2:
    // - jeśli weszliśmy z "create/edit" bez assign: zamknij modal
    // - jeśli jesteśmy w assign: wróć do L1 i przelicz tri-state (nowy tag startuje jako "none")
    if (mode === "assign") {
      await initTriState();
      renderAssignList();
      go(1);
      return true;
    }

    close(true);
    return true;
  }

  function saveL3Color() {
    // „Zapisz” w pickerze = zaakceptuj kolor i wróć do L2
    // (kolor już jest w m.pickedColor na bieżąco)
    go(2);
    return true;
  }

  async function onSave() {
    try {
      if (m.layer === 1) return await saveL1Assign();
      if (m.layer === 2) return await saveL2Tag();
      if (m.layer === 3) return saveL3Color();
    } catch (e) {
      console.error(e);
      if (m.layer === 1) showErr(E.assignErr, "Nie udało się zapisać tagów.");
      if (m.layer === 2) showErr(E.editErr, "Nie udało się zapisać taga.");
      // L3: bez errboxa (to tylko powrót)
    }
    return false;
  }

  function onAddNew() {
    if (!editor) return;
    enterL2("create", null);
  }

  function onOpenPicker() {
    if (!editor) return;
    openPickerFrom(m.pickedColor);
  }

  function onSliderInput() {
    const r = clamp255(E.colorR?.value);
    const g = clamp255(E.colorG?.value);
    const b = clamp255(E.colorB?.value);
    setPickerUI({ r, g, b }, { silent: false });
  }

  function onHexInput() {
    const v = String(E.colorHex?.value || "").trim();
    const rgb = hexToRgb(v);
    if (!rgb) return;
    setPickerUI(rgb, { silent: true });
  }

  // OPEN
  E.overlay.style.display = "grid";
  document.addEventListener("keydown", onKey);

  // X wszędzie zamyka modal
  E.l1Close?.addEventListener("click", onClose);
  E.l2Close?.addEventListener("click", onClose);
  E.l3Close?.addEventListener("click", onClose);

  // Save wszędzie
  E.l1Save?.addEventListener("click", onSave);
  E.l2Save?.addEventListener("click", onSave);
  E.l3Save?.addEventListener("click", onSave);

  // L1: Dodaj nowy
  E.addNew?.addEventListener("click", onAddNew);

  // L2: kafel koloru
  E.editColorTile?.addEventListener("click", onOpenPicker);

  // L3: inputy
  E.colorR?.addEventListener("input", onSliderInput);
  E.colorG?.addEventListener("input", onSliderInput);
  E.colorB?.addEventListener("input", onSliderInput);
  E.colorHex?.addEventListener("input", onHexInput);

  hideErr(E.assignErr);
  hideErr(E.editErr);

  // Start:
  if (!Array.isArray(state.tags)) await refreshTags(state);

  if (mode === "assign") {
    go(1);
    renderAssignInfo();
    await initTriState();
    renderAssignList();
  } else if (mode === "edit") {
    enterL2("edit", editTagId);
  } else {
    enterL2("create", null);
  }

  return await new Promise((resolve) => {
    resolvePromise = resolve;
  });
}
