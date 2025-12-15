// js/core/supabase.js
// ES module: eksportuje klienta Supabase jako named export: `sb`
// Wymaga, aby supabase-js v2 był załadowany wcześniej jako <script ... defer></script>

export const SUPABASE_URL = "https://mohjsqjxgnzodmzltcri.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vaGpzcWp4Z256b2Rtemx0Y3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MzcxMTMsImV4cCI6MjA4MTMxMzExM30.YP3SQT80KtPaRkUXt45eix-qZfFU5DdC5SjoprqFq2U";
// Named export, którego oczekuje Twój auth.js:
export let sb = null;

function tryInit() {
  if (sb) return sb;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    // Supabase-js jeszcze nie jest gotowy (zła kolejność <script> w HTML)
    return null;
  }

  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return sb;
}

// od razu próbujemy zainicjalizować (typowo zadziała)
tryInit();

// fallback: jeśli moduł wykonał się zanim supabase-js był gotowy
// (np. zła kolejność scriptów), próbujemy po DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  tryInit();
});

// dodatkowo: wygodny getter
export function getSb() {
  const client = tryInit();
  if (!client) {
    throw new Error(
      "Supabase nie jest gotowy. Upewnij się, że <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' defer></script> jest PRZED importem auth.js."
    );
  }
  return client;
}

