// Guard zwykłego panelu i dostępność trybu testowego są niezależne.
// Wymiary odnoszą się do obszaru pod topbarem, po odjęciu marginesów.
export const MIN_CONTROL_SCALE = 0.85;
export const CONTROL_REFERENCE = Object.freeze({ width: 1100, height: 680 });
export const DEVICE_VIEWPORT = Object.freeze({ width: 1024, height: 768 });

export function controlLayoutGeometry({ width, height, topbarHeight = 68, testMode = false }) {
  const availableWidth = Math.max(0, width - 32);
  const availableHeight = Math.max(0, height - topbarHeight - 32);
  const sidebarWidth = testMode ? availableHeight * 4 / 9 : 0;
  const panelWidth = Math.max(0, availableWidth - sidebarWidth - (testMode ? 12 : 0));
  const scale = Math.min(1, panelWidth / CONTROL_REFERENCE.width, availableHeight / CONTROL_REFERENCE.height);
  return {
    availableWidth,
    availableHeight,
    sidebarWidth,
    panelWidth,
    scale,
    fits: width >= 980 && scale >= MIN_CONTROL_SCALE,
    deviceHeight: testMode ? availableHeight / 3 : 0,
    deviceScale: testMode ? sidebarWidth / DEVICE_VIEWPORT.width : 0,
    virtualWidth: scale > 0 ? panelWidth / scale : CONTROL_REFERENCE.width,
    virtualHeight: scale > 0 ? availableHeight / scale : CONTROL_REFERENCE.height,
  };
}
