// Host theme factory. Keep its shape parallel with Display's createTheme().
export function createTheme(root) {
  for (const [property, value] of Object.entries({
    "--h-paper-bg": "#0a0a0c",
    "--h-ink": "#f5f5f7",
    "--h-font": '"JetBrainsMono-Variable", ui-monospace, "SF Mono", Consolas, monospace',
    "--font-ratio": "0.82",
    "--h-letter-spacing": "normal",
    "--h-line-height-mult": "1.4",
    "--baseline-shift": "0",
    "--ios-text-shift": "0px",
  })) root.style.setProperty(property, value);

  return { ruled: false };
}
