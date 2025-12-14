
// js/core/supabase.js
// Wspólna inicjalizacja Supabase dla całego projektu

export const SUPABASE_URL = "https://mohjsqjxgnzodmzltcri.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vaGpzcWp4Z256b2Rtemx0Y3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MzcxMTMsImV4cCI6MjA4MTMxMzExM30.YP3SQT80KtPaRkUXt45eix-qZfFU5DdC5SjoprqFq2U";

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
