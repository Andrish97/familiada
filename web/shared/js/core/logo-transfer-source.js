// A transferred logo carries its image bytes, including images inside DRAW groups.
export async function standaloneLogoSource(source, loadImage) {
  const result = structuredClone(source || {});
  for (const key of ['hostRasterUrl', 'hostRasterData', 'editHistory']) delete result[key];
  const embedded = value => typeof value === 'string' && /^data:image\//i.test(value);
  async function load(url) {
    const value = await loadImage(url);
    if (!embedded(value)) throw new Error('incomplete_logo_source');
    return value;
  }
  if (result.imageUrl) {
    if (!embedded(result.imageData)) result.imageData = await load(result.imageUrl);
    delete result.imageUrl;
  }
  async function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'src' && typeof item === 'string' && item && !embedded(item)) value[key] = await load(item);
      else if (item && typeof item === 'object') await visit(item);
    }
  }
  await visit(result.fabricData);
  return result;
}
