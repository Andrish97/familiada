// Internal only: the owner, destination and expected file signature come from
// the trusted clone plan. This helper is not a request-body authorization check.
import { cloneLogoImagePath, isCopyUuid, isOwnedLogoStoragePath } from './paths.js';
import { getSupabaseConfig } from '../core/supabase.js';

const maxBytes = 5 * 1024 * 1024;
const normalizeEtag = value => String(value || '').replace(/^"|"$/g, '').toLowerCase();

export async function copyLogoStorageImage(env, plan) {
  const path = cloneLogoImagePath(plan, plan?.mime);
  if (!isCopyUuid(plan?.source_owner_id) || !isOwnedLogoStoragePath(plan?.source_path, plan.source_owner_id) ||
      !Number.isInteger(plan?.size) || plan.size < 1 || plan.size > maxBytes ||
      !/^[a-f0-9]{32}$/i.test(normalizeEtag(plan?.etag))) throw new Error('invalid_copy_storage_plan');
  const cfg = getSupabaseConfig(env);
  if (!cfg) throw new Error('copy_storage_unavailable');
  const headers = { apikey: cfg.serviceRoleKey, Authorization: `Bearer ${cfg.serviceRoleKey}` };
  const publicUrl = `${cfg.baseUrl}/storage/v1/object/public/user-logos/${path}`;
  const result = already => ({path, publicUrl, etag: normalizeEtag(plan.etag), size: plan.size, already});
  async function inspect(key) {
    return fetch(`${cfg.baseUrl}/storage/v1/object/authenticated/user-logos/${key.split('/').map(encodeURIComponent).join('/')}`, {method: 'HEAD', headers});
  }
  function matches(response) {
    return response.ok && normalizeEtag(response.headers.get('ETag')) === normalizeEtag(plan.etag) &&
      response.headers.get('Content-Length') !== null && Number(response.headers.get('Content-Length')) === plan.size &&
      response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === plan.mime;
  }
  // Read the immutable destination first: a lost-response retry works even
  // after the original file has been removed along with the sender account.
  const previous = await inspect(path);
  if (previous.ok) {
    if (!matches(previous)) throw new Error('copy_image_conflict');
    return result(true);
  }
  // This Storage deployment reports a missing HEAD object as400. The source
  // must still validate before any write; copy itself never overwrites a key.
  if (![400, 404].includes(previous.status)) throw new Error(`copy_image_inspect_failed:${previous.status}`);
  const source = await inspect(plan.source_path);
  if (!matches(source)) throw new Error('copy_image_source_changed');
  const copied = await fetch(`${cfg.baseUrl}/storage/v1/object/copy`, {
    method: 'POST', headers: {...headers, 'Content-Type': 'application/json'},
    body: JSON.stringify({bucketId: 'user-logos', sourceKey: plan.source_path, destinationKey: path}),
  });
  if (!copied.ok && ![400, 409].includes(copied.status)) throw new Error(`copy_image_storage_failed:${copied.status}`);
  // No upsert and no download/base64 conversion. Verify the result, including
  // a concurrent retry and a change of source between inspection and copy.
  const destination = await inspect(path);
  if (!matches(destination)) throw new Error('copy_image_conflict');
  return result(!copied.ok);
}
