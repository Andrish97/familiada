// Definition preparation shared by duplicate-to-self and send-to-friend.
// Authorization, demo provenance and the persisted request ID are server data.
import { baseExportSnapshot } from './base-transfer-format.js?v=v2026-10-12T23450';
import { gameExportSnapshot } from './game-transfer-format.js?v=v2026-10-12T23450';
import { mapLogoSourceImages } from './logo-transfer-source.js?v=v2026-10-12T23450';
import { parseLogoPackage } from '../../../logo/js/package.js?v=v2026-10-12T23450';

export function duplicateResourceName(name, names, suffix, maxLength = 80) {
  if (typeof suffix !== 'string' || !suffix.trim() || !Number.isInteger(maxLength) || maxLength < 12) throw new Error('invalid_copy_name');
  const existing = new Set(names);
  const base = String(name || '').trim();
  for (let number = 1; number <= existing.size + 1; number++) {
    const tail = ` ${suffix.trim()}${number === 1 ? '' : ` ${number}`}`;
    if ([...tail].length >= maxLength) throw new Error('invalid_copy_name');
    const candidate = [...base].slice(0, maxLength - [...tail].length).join('').trimEnd() + tail;
    if (!existing.has(candidate.trim())) return candidate.trim();
  }
  throw new Error('copy_name_unavailable');
}

export async function prepareResourceClone(kind, source, options) {
  const {action, names = [], suffix, fallbackName, materializeImage} = options;
  if (!['duplicate', 'send'].includes(action) || !['game', 'base', 'logo'].includes(kind) || action === 'send' && kind === 'base') throw new Error('invalid_copy_action');
  const root = source[kind];
  if (!root) throw new Error('invalid_copy_source');
  // Trusted provenance survives duplication internally, without a parent FK
  // or a visible badge. It is never accepted as proof from the request body.
  const demoOrigin = root.is_demo === true || source.demo_origin === true;
  if (action === 'send' && demoOrigin) throw new Error('demo_not_sendable');
  let definition;
  if (kind === 'game') definition = gameExportSnapshot(root, source.questions, fallbackName);
  else if (kind === 'base') definition = baseExportSnapshot(source, fallbackName);
  else {
    const logo = parseLogoPackage(root, fallbackName);
    const completed = new Map();
    logo.payload.source = await mapLogoSourceImages(logo.payload.source, async image => {
      if (typeof materializeImage !== 'function') throw new Error('copy_image_materializer_required');
      if (!completed.has(image)) completed.set(image, await materializeImage(image));
      return completed.get(image);
    });
    definition = logo;
  }
  const named = kind === 'logo' ? definition : definition[kind];
  if (action === 'duplicate') named.name = duplicateResourceName(named.name, names, suffix);
  return {kind, definition, demoOrigin};
}
