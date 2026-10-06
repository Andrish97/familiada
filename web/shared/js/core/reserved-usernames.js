let prefixes = ['test','familiada','admin','administrator','moderator','support','pomoc','kontakt','contact','system','official','security','billing','noreply'].map(prefix=>({prefix,kind:prefix==='test'?'test':'system'}));
export function setReservedUsernamePrefixes(rows) {
  if (Array.isArray(rows)) prefixes=rows.filter(row=>typeof row.prefix==='string' && row.prefix.length>0);
}
export function reservedUsernameReason(value) {
  const name=String(value||'').trim().toLowerCase();
  return prefixes.find(row=>name.startsWith(row.prefix))?.kind || null;
}
