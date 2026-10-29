// A transferred logo carries its image bytes, including images inside DRAW groups.
export async function mapLogoSourceImages(source, mapImage) {
  const result = structuredClone(source || {});
  for (const key of ['hostRasterUrl', 'hostRasterData', 'editHistory']) delete result[key];
  const embedded = value => typeof value === 'string' && /^data:image\//i.test(value);
  if (result.imageData && !embedded(result.imageData) && !result.imageUrl) throw new Error('incomplete_logo_source');
  if (embedded(result.imageData) || result.imageUrl) {
    const value = await mapImage(embedded(result.imageData) ? result.imageData : result.imageUrl);
    if (embedded(value)) {
      result.imageData = value;
      delete result.imageUrl;
    } else {
      if (typeof value !== 'string' || !value) throw new Error('incomplete_logo_source');
      result.imageUrl = value;
      delete result.imageData;
    }
  }
  async function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'src' && typeof item === 'string' && item) {
        const mapped = await mapImage(item);
        if (typeof mapped !== 'string' || !mapped) throw new Error('incomplete_logo_source');
        value[key] = mapped;
      }
      else if (item && typeof item === 'object') await visit(item);
    }
  }
  await visit(result.fabricData);
  return result;
}

export async function standaloneLogoSource(source, loadImage) {
  return mapLogoSourceImages(source, async value => {
    if (/^data:image\//i.test(value)) return value;
    const result = await loadImage(value);
    if (typeof result !== 'string' || !/^data:image\//i.test(result)) throw new Error('incomplete_logo_source');
    return result;
  });
}
