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
