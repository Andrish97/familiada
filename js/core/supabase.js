
// js/core/supabase.js
// Wspólna inicjalizacja Supabase dla całego projektu

export const SUPABASE_URL = "WSTAW_TUTAJ_SUPABASE_URL";
export const SUPABASE_ANON_KEY = "WSTAW_TUTAJ_SUPABASE_ANON_KEY";

export function getSupabase() {
  if (!window.supabase?.createClient) {
    throw new Error("supabase-js niezaładowany (brak window.supabase.createClient)");
  }
  if (!window.__sb) {
    window.__sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return window.__sb;
}
