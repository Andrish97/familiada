import { sb } from "./supabase.js";

export async function getUserDemoFlag(userId) {
  if (!userId) throw new Error("getUserDemoFlag: brak userId");

  // zapewnij wiersz (pierwszy raz -> demo=true)
  await sb()
    .from("user_flags")
    .upsert({ user_id: userId }, { onConflict: "user_id" });

  const { data, error } = await sb()
    .from("user_flags")
    .select("demo")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return !!data?.demo;
}

export async function setUserDemoFlag(userId, value) {
  if (!userId) throw new Error("setUserDemoFlag: brak userId");

  const { error } = await sb()
    .from("user_flags")
    .upsert(
      { user_id: userId, demo: !!value },
      { onConflict: "user_id" }
    );

  if (error) throw error;
}

/**
 * Reset flagi "gdziekolwiek" – domyślnie ustawia demo=true.
 * Użycie:
 *   await resetUserDemoFlag(currentUser.id);
 *   await resetUserDemoFlag(currentUser.id, false); // jeśli chcesz wymusić "już zseedowane"
 */
export async function resetUserDemoFlag(userId, value = true) {
  return await setUserDemoFlag(userId, value);
}


// =======================================================
// Email notifications flag (global per user)
// email_notifications boolean not null default true
// =======================================================

export async function getUserEmailNotificationsFlag(userId) {
  if (!userId) throw new Error("getUserEmailNotificationsFlag: brak userId");

  // ensure row exists (first time -> defaults from DB)
  await sb()
    .from("user_flags")
    .upsert({ user_id: userId }, { onConflict: "user_id" });

  const { data, error } = await sb()
    .from("user_flags")
    .select("email_notifications")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.email_notifications !== false;
}

export async function setUserEmailNotificationsFlag(userId, value) {
  if (!userId) throw new Error("setUserEmailNotificationsFlag: brak userId");

  const { error } = await sb()
    .from("user_flags")
    .upsert(
      { user_id: userId, email_notifications: !!value },
      { onConflict: "user_id" }
    );

  if (error) throw error;
}

export async function getUserEmailNotificationsFlag(userId) {
  if (!userId) throw new Error("getUserEmailNotificationsFlag: brak userId");
  const rows = await getEmailNotificationsForUsers([userId]);
  return rows?.[0]?.email_notifications !== false;
}

// =======================================================
// Batch read for email_notifications (frontend filter)
// =======================================================

export async function getEmailNotificationsForUsers(userIds = []) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return [];

  const { data, error } = await sb().rpc("userflags_get_email_notifications", {
    p_user_ids: ids,
  });
  if (error) throw error;

  const allow = new Map();
  // default: true (brak wiersza => traktujemy jako true)
  for (const id of ids) allow.set(id, true);
  for (const row of (data || [])) allow.set(row.user_id, row.email_notifications !== false);

  return ids.map((id) => ({
    user_id: id,
    email_notifications: allow.get(id),
  }));
}
