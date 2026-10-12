// Guard zwykłego panelu i dostępność trybu testowego są niezależne.
// Panel z topbarem skaluje się razem; urządzenia zajmują pełne okno.
export const MIN_CONTROL_SCALE = 0.8;
export const CONTROL_REFERENCE = Object.freeze({ width: 1100, height: 640 });
export const DEVICE_VIEWPORT = Object.freeze({ width: 1024, height: 768 });

export function controlLayoutGeometry({ width, height, topbarHeight = 68, testMode = false }) {
  const sidebarWidth = testMode ? Math.max(0, height) * 4 / 9 : 0;
  const surfaceWidth = Math.max(0, width - sidebarWidth);
  const scale = Math.max(0, Math.min(1,
    surfaceWidth / (CONTROL_REFERENCE.width + 32),
    Math.max(0, height - 32) / (CONTROL_REFERENCE.height + topbarHeight)));
  const availableWidth = Math.max(0, surfaceWidth - 32 * scale);
  const availableHeight = Math.max(0, height - (topbarHeight + 32) * scale);
  return {
    availableWidth, availableHeight, sidebarWidth,
    panelWidth: availableWidth,
    surfaceWidth,
    scale,
    fits: width >= 980 && scale >= MIN_CONTROL_SCALE,
    deviceHeight: testMode ? Math.max(0, height) / 3 : 0,
    deviceScale: testMode ? sidebarWidth / DEVICE_VIEWPORT.width : 0,
    virtualSurfaceWidth: scale > 0 ? surfaceWidth / scale : CONTROL_REFERENCE.width + 32,
    virtualSurfaceHeight: scale > 0 ? height / scale : CONTROL_REFERENCE.height + topbarHeight + 32,
    virtualWidth: scale > 0 ? availableWidth / scale : CONTROL_REFERENCE.width,
    virtualHeight: scale > 0 ? availableHeight / scale : CONTROL_REFERENCE.height,
  };
}
