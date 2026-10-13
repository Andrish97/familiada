// Pure byte validation shared by browser import and server-side copy upload.
export function decodeImportedLogoImage(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/]+=*)$/i);
  if (!match) throw new Error("Unsupported or invalid embedded logo image");
  const mime = match[1].toLowerCase();
  const encoded = match[2];
  if (encoded.length > Math.ceil((5 * 1024 * 1024) / 3) * 4) throw new Error("Logo image exceeds 5 MB");
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Logo image exceeds 5 MB or is empty");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" }[mime];
  return { bytes, mime, ext };
}
