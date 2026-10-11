// Wynik obejmuje tylko wiersze faktycznie wstawione po triggerach bazy.
export function mailQueueResult(items, inserted, batchSize) {
  const counts = new Map();
  for (const row of inserted || []) {
    const key = String(row.to_email).trim().toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const results = items.map((item, index) => {
    if (index >= batchSize) return { to: item.to, ok: false, queued: false, error: 'batch_limit' };
    const key = String(item.to).trim().toLowerCase();
    const count = counts.get(key) || 0;
    if (count) {
      counts.set(key, count - 1);
      return { to: item.to, ok: true, queued: true };
    }
    return { to: item.to, ok: true, queued: false, skipped: true, reason: 'notifications_disabled' };
  });
  return { ok: true, queued: (inserted || []).length, results };
}
