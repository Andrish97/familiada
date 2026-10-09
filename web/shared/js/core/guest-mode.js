// js/core/guest-mode.js
export function isGuestUser(user) {
  if (!user) return false;

  // Guest mode must be driven by explicit flags/metadata, not username pattern.
  if (user?.is_guest === true) return true;
  if (user?.user_metadata?.is_guest === true) return true;
  if (user?.app_metadata?.is_guest === true) return true;

  return false;
}

export function hideForGuest(user, elements = []) {
  const guest = isGuestUser(user);
  if (!guest) return false;
  for (const el of elements) {
    if (!el) continue;
    el.style.display = "none";
  }
  return true;
}
