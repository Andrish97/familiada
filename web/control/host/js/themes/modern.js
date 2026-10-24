// Host theme factory. Keep its shape parallel with Display's createTheme().
export function createTheme(root) {
  for (const [property, value] of Object.entries({
    "--host-paper-bg": "#0a0a0c",
    "--host-ink": "#f5f5f7",
    "--host-font": '"JetBrainsMono-Variable", ui-monospace, "SF Mono", Consolas, monospace',
    "--host-font-ratio": "0.82",
    "--host-letter-spacing": "normal",
    "--host-line-height-mult": "1.4",
    "--host-baseline-shift": "0",
    "--host-ios-text-shift": "0px",
  })) root.style.setProperty(property, value);

  return { ruled: false };
}
