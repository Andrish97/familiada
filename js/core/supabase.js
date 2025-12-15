// js/core/supabase.js
// Jedno źródło prawdy dla Supabase

export const SUPABASE_URL = "https://mohjsqjxgnzodmzltcri.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vaGpzcWp4Z256b2Rtemx0Y3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MzcxMTMsImV4cCI6MjA4MTMxMzExM30.YP3SQT80KtPaRkUXt45eix-qZfFU5DdC5SjoprqFq2U";

if (!window.supabase || !window.supabase.createClient) {
  throw new Error(
    "supabase-js v2 nie jest załadowany. Sprawdź kolejność <script>."
  );
}

// 👉 TO JEST OBIEKT, NIE FUNKCJA
export const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// opcjonalnie globalnie (Ty już tego używasz w innych miejscach)
window.supabaseClient = sb;

