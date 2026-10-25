// Apply defaults only in response to choosing a different theme in Settings.
// Loading a saved game or rendering a snapshot never calls this function.
export function chooseDisplayTheme(display, entry, defaultKey = "classic") {
  if (!entry || (display.theme || defaultKey) === entry.key) return display;
  const colors = { ...display.colors };
  if (/^#[a-f0-9]{6}$/i.test(entry.defaultBackground || "")) {
    colors.BACKGROUND = entry.defaultBackground;
  }
  return { ...display, theme: entry.key, colors };
}
