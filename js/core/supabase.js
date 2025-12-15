// js/core/supabase.js
// Inicjalizacja supabase-js v2 jako moduł ES
// Uzupełnij danymi z Twojego projektu Supabase (Settings → API)

export const SUPABASE_URL = "https://mohjsqjxgnzodmzltcri.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vaGpzcWp4Z256b2Rtemx0Y3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MzcxMTMsImV4cCI6MjA4MTMxMzExM30.YP3SQT80KtPaRkUXt45eix-qZfFU5DdC5SjoprqFq2U";

let client = null;

export function getSupabase() {
  if (client) return client;

  if (!window.supabase || !window.supabase.createClient) {
    throw new Error(
      "Brak supabase-js. Sprawdź, czy masz <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' defer></script> w HTML."
    );
  }

  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
