// base-explorer/js/repo.js
// Repozytorium danych (Supabase) dla menadżera bazy pytań.

import { sb } from "../../js/core/supabase.js";

/**
 * Pobiera metadane bazy.
 * Zwraca: { id, name, owner_id, created_at, updated_at }
 */
export async function getBaseMeta(baseId) {
  const { data, error } = await sb()
    .from("question_bases")
    .select("id,name,owner_id,created_at,updated_at")
    .eq("id", baseId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Ustala rolę użytkownika dla bazy:
 * - owner: jeśli owner_id === userId
 * - editor/viewer: z question_base_shares
 * Jeśli brak dostępu -> rzuca błąd (brak rekordu share i nie-owner).
 *
 * Zwraca: { role: "owner"|"editor"|"viewer" }
 */
export async function getBaseRole(baseId, userId) {
  const base = await getBaseMeta(baseId);

  if (base?.owner_id === userId) {
    return { role: "owner" };
  }

  const { data, error } = await sb()
    .from("question_base_shares")
    .select("role")
    .eq("base_id", baseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  const role = data?.role;
  if (role === "editor" || role === "viewer") {
    return { role };
  }

  // Brak dostępu (UI powinno wrócić do bases z komunikatem)
  const e = new Error("Brak dostępu do tej bazy.");
  e.code = "NO_ACCESS";
  throw e;
}

/**
 * Kategorie (foldery) w bazie.
 * Zwraca listę: [{ id, base_id, parent_id, name, ord }]
 */
export async function listCategories(baseId) {
  const { data, error } = await sb()
    .from("qb_categories")
    .select("id,base_id,parent_id,name,ord")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Tagi w bazie.
 * Zwraca listę: [{ id, base_id, name, color, ord }]
 */
export async function listTags(baseId) {
  const { data, error } = await sb()
    .from("qb_tags")
    .select("id,base_id,name,color,ord")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Pytania w folderze (category_id), albo "bez folderu" (categoryId = null).
 * Zwraca listę: [{ id, base_id, category_id, ord, payload, created_at, updated_at }]
 *
 * Uwaga: w etapie 1 pobieramy prosto po folderze; search i sort robimy lokalnie w UI.
 */
export async function listQuestionsByCategory(baseId, categoryId) {
  let q = sb()
    .from("qb_questions")
    .select("id,base_id,category_id,ord,payload,created_at,updated_at")
    .eq("base_id", baseId);

  if (categoryId === null) {
    q = q.is("category_id", null);
  } else {
    q = q.eq("category_id", categoryId);
  }

  const { data, error } = await q.order("ord", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Pytania dla widoku "Wszystkie" (bez ograniczenia do folderu).
 * Zwraca listę jak wyżej.
 */
export async function listAllQuestions(baseId) {
  const { data, error } = await sb()
    .from("qb_questions")
    .select("id,base_id,category_id,ord,payload,created_at,updated_at")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Powiązania tagów dla zestawu pytań.
 * Zwraca listę: [{ question_id, tag_id }]
 */
export async function listQuestionTags(questionIds) {
  const ids = Array.isArray(questionIds) ? questionIds.filter(Boolean) : [];
  if (!ids.length) return [];

  const { data, error } = await sb()
    .from("qb_question_tags")
    .select("question_id,tag_id")
    .in("question_id", ids);

  if (error) throw error;
  return data || [];
}

/**
 * Pytania z danym tagiem.
 * (Na start wersja prosta: najpierw bierzemy question_id z mapy tagów, potem dociągamy pytania.)
 */
export async function listQuestionsByTag(baseId, tagId) {
  const { data: links, error: lErr } = await sb()
    .from("qb_question_tags")
    .select("question_id")
    .eq("tag_id", tagId);

  if (lErr) throw lErr;

  const qIds = (links || []).map((x) => x.question_id).filter(Boolean);
  if (!qIds.length) return [];

  const { data: qs, error: qErr } = await sb()
    .from("qb_questions")
    .select("id,base_id,category_id,ord,payload,created_at,updated_at")
    .eq("base_id", baseId)
    .in("id", qIds)
    .order("ord", { ascending: true });

  if (qErr) throw qErr;
  return qs || [];
}

/**
 * Powiązania tagów dla zestawu folderów.
 * Zwraca listę: [{ category_id, tag_id }]
 */
export async function listCategoryTags(categoryIds) {
  const ids = Array.isArray(categoryIds) ? categoryIds.filter(Boolean) : [];
  if (!ids.length) return [];

  const { data, error } = await sb()
    .from("qb_category_tags")
    .select("category_id,tag_id")
    .in("category_id", ids);

  if (error) throw error;
  return data || [];
}

/**
 * Foldery z danym tagiem.
 * (prosto: linki, potem foldery)
 */
export async function listCategoriesByTag(baseId, tagId) {
  const { data: links, error: lErr } = await sb()
    .from("qb_category_tags")
    .select("category_id")
    .eq("tag_id", tagId);

  if (lErr) throw lErr;

  const cIds = (links || []).map(x => x.category_id).filter(Boolean);
  if (!cIds.length) return [];

  const { data: cats, error: cErr } = await sb()
    .from("qb_categories")
    .select("id,base_id,parent_id,name,ord")
    .eq("base_id", baseId)
    .in("id", cIds)
    .order("ord", { ascending: true });

  if (cErr) throw cErr;
  return cats || [];
}
