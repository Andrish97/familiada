// js/core/db-guard.js
import { sb } from "./supabase.js?v=v2026-08-28T13445";

// Supabase/PostgREST UPDATE ... WHERE trafiający w 0 wierszy NIE zwraca
// błędu — to mechanizm stojący za "cichym sukcesem" przy edycji czegoś,
// co zostało usunięte w innym miejscu (ominięta blokada z resource-lock.js,
// albo zasób bez blokady w ogóle). updateChecked() wymusza .select() po
// update i rozpoznaje ten przypadek, rzucając błąd z kodem ROW_GONE
// zamiast fałszywie potwierdzać zapis.
export const ROW_GONE = "ROW_GONE";

export async function updateChecked(table, match, patch) {
  let q = sb().from(table).update(patch);
  for (const [col, val] of Object.entries(match)) q = q.eq(col, val);
  const { data, error } = await q.select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    const e = new Error(`updateChecked: 0 rows matched in "${table}"`);
    e.code = ROW_GONE;
    throw e;
  }
  return data;
}
