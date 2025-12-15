// js/core/supabase.js
// Ten moduł eksportuje FUNKCJĘ sb(), bo Twój auth.js wywołuje sb().auth...

export const SUPABASE_URL = "https://mohjsqjxgnzodmzltcri.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vaGpzcWp4Z256b2Rtemx0Y3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MzcxMTMsImV4cCI6MjA4MTMxMzExM30.YP3SQT80KtPaRkUXt45eix-qZfFU5DdC5SjoprqFq2U";

let _client = null;

export function sb() {
  if (_client) return _client;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error(
      "supabase-js v2 nie jest załadowany. Upewnij się, że <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' defer></script> jest przed modułami."
    );
  }

  _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // żeby reszta stron mogła używać window.supabaseClient
  window.supabaseClient = _client;

  return _client;
}
