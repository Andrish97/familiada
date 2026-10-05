// js/core/supabase.js
// Ten moduł eksportuje FUNKCJĘ sb(), bo Twój auth.js wywołuje sb().auth...

export const SUPABASE_URL = "https://api.familiada.online";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJpYXQiOjE3NzIyMTEyNTAsImV4cCI6MjA4NzU3MTI1MCwicm9sZSI6ImFub24ifQ.9Hg8RB6iC72o2ommzcYUNQWnPSzsDyUdxwQR9PGcF4U";

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
// debug helper:
globalThis.__sb = sb;
globalThis.__sbClient = sb();

export function buildSiteUrl(path = "") {
  const p = String(path || "").trim();
  const normalized = p.startsWith("/") ? p : `/${p}`;
  return new URL(normalized, location.origin).toString();
}
