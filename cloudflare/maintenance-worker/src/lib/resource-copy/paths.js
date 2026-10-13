// One immutable namespace for both bucket copies and embedded image uploads.
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const extensions = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'};
export const isCopyUuid = value => typeof value === 'string' && uuid.test(value);
export const isOwnedLogoStoragePath = (path, owner) => isCopyUuid(owner) && typeof path === 'string' && path.startsWith(`${owner}/`) && path.split('/').every(part => /^[a-zA-Z0-9._-]+$/.test(part) && part !== '.' && part !== '..');
export function cloneLogoImagePath(plan, mime) {
  if (![plan?.recipient_id,plan?.copy_id,plan?.asset_id].every(isCopyUuid) || !Object.hasOwn(extensions, mime)) throw new Error('invalid_copy_storage_plan');
  return `${plan.recipient_id}/copies/${plan.copy_id}/${plan.asset_id}.${extensions[mime]}`;
}
