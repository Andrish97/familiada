// js/pages/bases-import.js
// Import bazy pytań z JSON (URL) do DB.
// Ten plik ma być używany przez demo-seed i ewentualnie inne miejsca.
// NIE zawiera UI, renderowania, eventów.

import { sb } from "../core/supabase.js";
import { requireAuth } from "../core/auth.js";

/* ================= Utils ================= */

function safeName(s) {
  return (String(s ?? "").trim() || "Nowa baza pytań").slice(0, 80);
}

function isValidImportPayload(p) {
  return !!p && typeof p === "object" && p.base && Array.isArray(p.questions);
}

async function createBase({ currentUserId, name }) {
  const { data, error } = await sb()
    .from("question_bases")
    .insert(
      {
        owner_id: currentUserId,
        name: safeName(name),
      },
      { defaultToNull: false }
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/* ================= Core import ================= */

export async function importBase(payload, { currentUserId } = {}) {
  if (!currentUserId) throw new Error("importBase: brak currentUserId");

  if (!isValidImportPayload(payload)) {
    throw new Error("Zły format pliku (brak base / questions).");
  }

  const baseId = await createBase({
    currentUserId,
    name: payload.base?.name || "Nowa baza pytań",
  });

  const oldToNewCat = new Map();
  const oldToNewTag = new Map();
  const oldToNewQ = new Map();

  // 1) Kategorie – topologicznie (rooty → dzieci)
  const cats = Array.isArray(payload.categories) ? payload.categories : [];
  const byParent = new Map();
  for (const c of cats) {
    const key = c.parent_id || "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));
  }

  async function insertCatSubtree(parentOldId, parentNewId) {
    const key = parentOldId || "__root__";
    const kids = byParent.get(key) || [];
    for (const c of kids) {
      const { data, error } = await sb()
        .from("qb_categories")
        .insert(
          {
            base_id: baseId,
            parent_id: parentNewId,
            name: String(c.name || "Kategoria").slice(0, 80),
            ord: Number(c.ord) || 0,
          },
          { defaultToNull: false }
        )
        .select("id")
        .single();

      if (error) throw error;

      oldToNewCat.set(c.id, data.id);
      await insertCatSubtree(c.id, data.id);
    }
  }
  await insertCatSubtree(null, null);

  // 2) Tagi
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  for (const t of tags) {
    const { data, error } = await sb()
      .from("qb_tags")
      .insert(
        {
          base_id: baseId,
          name: String(t.name || "Tag").slice(0, 40),
          color: String(t.color || "gray").slice(0, 24),
          ord: Number(t.ord) || 0,
        },
        { defaultToNull: false }
      )
      .select("id")
      .single();

    if (error) throw error;
    oldToNewTag.set(t.id, data.id);
  }

  // 3) Pytania
  const qs = Array.isArray(payload.questions) ? payload.questions : [];
  for (const q of qs) {
    const newCatId = q.category_id ? oldToNewCat.get(q.category_id) || null : null;

    const { data, error } = await sb()
      .from("qb_questions")
      .insert(
        {
          base_id: baseId,
          category_id: newCatId,
          ord: Number(q.ord) || 0,
          payload: q.payload || {},
          updated_by: currentUserId,
        },
        { defaultToNull: false }
      )
      .select("id")
      .single();

    if (error) throw error;
    oldToNewQ.set(q.id, data.id);
  }

  // 4) Powiązania tagów pytań
  const qtags = Array.isArray(payload.question_tags) ? payload.question_tags : [];
  const rows = [];
  for (const r of qtags) {
    const nq = oldToNewQ.get(r.question_id);
    const nt = oldToNewTag.get(r.tag_id);
    if (!nq || !nt) continue;
    rows.push({ question_id: nq, tag_id: nt });
  }
  if (rows.length) {
    const { error } = await sb().from("qb_question_tags").insert(rows);
    if (error) throw error;
  }

  // 5) Powiązania tagów kategorii (folderów)
  const ctags = Array.isArray(payload.category_tags) ? payload.category_tags : [];
  const crows = [];
  for (const r of ctags) {
    const nc = oldToNewCat.get(r.category_id);
    const nt = oldToNewTag.get(r.tag_id);
    if (!nc || !nt) continue;
    crows.push({ category_id: nc, tag_id: nt });
  }
  if (crows.length) {
    const { error } = await sb().from("qb_category_tags").insert(crows);
    if (error) throw error;
  }

  return baseId;
}

/* ================= Public import from URL ================= */

export async function importBaseFromUrl(url) {
  await requireAuth();

  const u = String(url || "").trim();
  if (!u) throw new Error("importBaseFromUrl: brak URL");

  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error(`Nie można wczytać pliku JSON (${res.status}): ${u}`);

  const payload = await res.json();
  if (!payload || typeof payload !== "object") throw new Error("Niepoprawny format JSON bazy");

  // current user id
  const { data, error } = await sb().auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error("Brak zalogowanego użytkownika.");

  return await importBase(payload, { currentUserId: uid });
}
