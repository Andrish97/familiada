// Host theme factory. Keep its shape parallel with Display's createTheme().
export function createTheme(root) {
  for (const [property, value] of Object.entries({
    "--host-paper-bg": "#fffdf5",
    "--host-ink": "#111",
    "--host-font": '"Caveat-Variable", cursive',
    "--host-font-ratio": "1",
    "--host-letter-spacing": "normal",
    "--host-line-height-mult": "1",
    "--host-baseline-shift": "0.12",
    "--host-ios-text-shift": "0px",
  })) root.style.setProperty(property, value);

  return { ruled: true };
}
