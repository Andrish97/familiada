// js/core/supabase.js
// Ten plik MUSI leżeć w: js/core/supabase.js
// i MUSI być importowany z auth.js jako: import { sb } from "./supabase.js";

export const SUPABASE_URL = "https://mohjsqjxgnzodmzltcri.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vaGpzcWp4Z256b2Rtemx0Y3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MzcxMTMsImV4cCI6MjA4MTMxMzExM30.YP3SQT80KtPaRkUXt45eix-qZfFU5DdC5SjoprqFq2U";

function create() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error(
      "Supabase-js nie jest załadowany. Upewnij się, że masz <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' defer></script> PRZED auth.js."
    );
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// auth.js oczekuje named export `sb`:
export const sb = create();

// opcjonalnie — dla reszty aplikacji (Twoje strony już tego używają):
window.supabaseClient = sb;


