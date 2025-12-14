import { sb } from "./supabase.js";

function niceAuthError(e) {
  const msg = e?.message || String(e);
  if (msg.toLowerCase().includes("email not confirmed")) return "Potwierdź e-mail (link w skrzynce).";
  if (msg.toLowerCase().includes("invalid login credentials")) return "Zły e-mail lub hasło.";
  return msg;
}

export async function getUser() {
  const { data, error } = await sb().auth.getUser();
  if (error) return null;
  return data.user || null;
}

export async function requireAuth(redirect = "index.html") {
  const u = await getUser();
  if (!u) location.href = redirect;
  return u;
}

export async function signIn(email, password) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw new Error(niceAuthError(error));
  const user = data.user;
  if (!user?.email_confirmed_at) {
    await sb().auth.signOut();
    throw new Error("Najpierw potwierdź e-mail.");
  }
  return user;
}

export async function signUp(email, password, redirectTo) {
  const { error } = await sb().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(niceAuthError(error));
}

export async function signOut() {
  await sb().auth.signOut();
}

export async function resetPassword(email, redirectTo) {
  const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(niceAuthError(error));
}

