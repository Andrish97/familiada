export function buildControl2StatsExport(rows, period, { now = new Date(), timeZone } = {}) {
  const current = now instanceof Date ? new Date(now) : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new TypeError("Invalid export timestamp");
  if (!["today", "7d", "30d", "recent"].includes(period)) throw new TypeError("Invalid export period");

  const todayStart = new Date(current);
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = period === "7d" ? new Date(current.getTime() - 7 * 24 * 60 * 60 * 1000)
    : period === "30d" ? new Date(current.getTime() - 30 * 24 * 60 * 60 * 1000)
    : todayStart;
  const sessions = (Array.isArray(rows) ? rows : []).filter(row => {
    if (!row || Number(row.control_version) !== 2) return false;
    if (period === "recent") return true;
    const startedAt = Date.parse(row.started_at || "");
    return Number.isFinite(startedAt) && startedAt >= cutoff.getTime() && startedAt <= current.getTime();
  });

  return {
    exported_at: current.toISOString(),
    timezone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    source: "Familiada → Ustawienia → Statystyki → Rozgrywki",
    filter: period,
    session_count: sessions.length,
    max_sessions_loaded: 500,
    sessions,
  };
}
