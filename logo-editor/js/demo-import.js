// Moduł pomocniczy do importu demo logo (BEZ bootowania UI)

import { sb } from "../../js/core/supabase.js";
import { requireAuth } from "../../js/core/auth.js";
import { t } from "../../translation/translation.js";

/* =========================================================
   Stałe typów – takie same jak w main.js
========================================================= */

const TYPE_GLYPH = "GLYPH_30x10";
const TYPE_PIX = "PIX_150x70";

/* =========================================================
   Utils
========================================================= */

async function ensureCurrentUser(){
  const { data, error } = await sb().auth.getUser();
  if (error) throw error;

  const u = data?.user;
  if (!u?.id){
    const user = await requireAuth("../login");
    if (!user?.id) throw new Error(t("logoEditor.errors.noUser"));
    return user;
  }

  return u;
}

async function fetchTextRequired(url, label = "Import"){
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status} (${url})`);
  return await r.text();
}

/* =========================================================
   Parsowanie JSON logo (ten sam format co eksport)
========================================================= */

function cleanRows30x10(rows){
  const out = Array.from({ length: 10 }, (_, i) => {
    const r = String(rows?.[i] ?? "");
    return r.padEnd(30, " ").slice(0, 30);
  });
  return out;
}

function parseImportJson(text){
  let obj = null;
  try { obj = JSON.parse(text); }
  catch { throw new Error(t("logoEditor.errors.invalidJson")); }

  const kind = String(obj?.kind || "").toUpperCase();
  const name = String(obj?.name || t("logoEditor.defaults.logoName")).trim() || t("logoEditor.defaults.logoName");

  if (kind === "GLYPH"){
    const rows = cleanRows30x10(obj?.payload?.rows);
    return { kind: "GLYPH", name, rows };
  }

  if (kind === "PIX"){
    const p = obj?.payload || {};
    const w = Number(p.w);
    const h = Number(p.h);
    const bits_b64 = String(p.bits_b64 || "");

    if (!w || !h || !bits_b64){
      throw new Error(t("logoEditor.errors.invalidPixFormat"));
    }

    return {
      kind: "PIX",
      name,
      pixPayload: {
        w,
        h,
        format: "BITPACK_MSB_FIRST_ROW_MAJOR",
        bits_b64
      }
    };
  }

  throw new Error(t("logoEditor.errors.unknownLogoFormat"));
}

/* =========================================================
   DB helpers
========================================================= */

async function listMyLogos(userId){
  const { data, error } = await sb()
    .from("user_logos")
    .select("id,name")
    .eq("user_id", userId);

  if (error) throw error;
  return data || [];
}

function makeUniqueName(baseName, existing){
  const base = String(baseName || "").trim() || t("logoEditor.defaults.logoName");
  const used = new Set(
    (existing || []).map(l => String(l.name || "").toLowerCase())
  );

  if (!used.has(base.toLowerCase())) return base;

  let i = 2;
  while (i < 9999){
    const cand = `${base} (${i})`;
    if (!used.has(cand.toLowerCase())) return cand;
    i++;
  }

  return `${base} (${Date.now()})`;
}

async function createLogo(row){
  const { data, error } = await sb()
    .from("user_logos")
    .insert(row)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/* =========================================================
   PUBLIC API — demo import 4 logos
========================================================= */

export async function demoImport4Logos(url1, url2, url3, url4){

  const user = await ensureCurrentUser();

  const urls = [url1, url2, url3, url4]
    .map(u => String(u || "").trim())
    .filter(Boolean);

  if (urls.length !== 4){
    throw new Error(t("logoEditor.errors.demoImportFiles"));
  }

  const existing = await listMyLogos(user.id);

  const createdIds = [];
  const errors = [];

  for (let i = 0; i < urls.length; i++){
    const url = urls[i];

    try{
      const txt = await fetchTextRequired(url, `Logo ${i + 1}`);
      const parsed = parseImportJson(txt);

      const uniqueName = makeUniqueName(parsed.name, existing);

      let row;

      if (parsed.kind === "GLYPH"){
        row = {
          user_id: user.id,
          name: uniqueName,
          type: TYPE_GLYPH,
          is_active: false,
          payload: { layers: [{ rows: parsed.rows }] }
        };
      } else {
        row = {
          user_id: user.id,
          name: uniqueName,
          type: TYPE_PIX,
          is_active: false,
          payload: parsed.pixPayload
        };
      }

      const id = await createLogo(row);

      createdIds.push(id);
      existing.push({ id, name: uniqueName });

    } catch (e){
      errors.push({
        url,
        error: String(e?.message || e)
      });
    }
  }

  return {
    ok: errors.length === 0,
    createdIds,
    errors
  };
}
