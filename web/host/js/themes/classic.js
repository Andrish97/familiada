// Host theme factory. Keep its shape parallel with Display's createTheme().
export function createTheme(root) {
  for (const [property, value] of Object.entries({
    "--h-paper-bg": "#fffdf5",
    "--h-ink": "#111",
    "--h-font": '"Caveat-Variable", cursive',
    "--font-ratio": "1",
    "--h-letter-spacing": "normal",
    "--h-line-height-mult": "1",
    "--baseline-shift": "0.12",
    "--ios-text-shift": "0px",
  })) root.style.setProperty(property, value);

  return { ruled: true };
}
