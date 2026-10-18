import { test } from "node:test";
import assert from "node:assert/strict";
import { buildControl2StatsExport } from "../../web/settings/js/stats-export.js";

function session(id, startedAt, controlVersion = 2) {
  return { id, started_at: startedAt.toISOString(), control_version: controlVersion, stats_detail: { id } };
}

test("eksport dzisiejszy wybiera wyłącznie Control 2 z lokalnego dnia", () => {
  const now = new Date(2026, 9, 13, 12, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 1);
  const future = new Date(now.getTime() + 1);
  const rows = [session("today", today), session("control1", now, 1), session("yesterday", yesterday), session("future", future)];

  const result = buildControl2StatsExport(rows, "today", { now, timeZone: "Europe/Warsaw" });

  assert.deepEqual(result.sessions.map(row => row.id), ["today"]);
  assert.equal(result.session_count, 1);
  assert.equal(result.timezone, "Europe/Warsaw");
  assert.equal(result.sessions[0].stats_detail.id, "today");
});

test("JSON statystyk zachowuje zwięzłe podsumowania transportu i błędów synchronizacji", () => {
  const now = new Date(2026, 9, 13, 12, 0, 0);
  const events = [
    { kind: "diagnostic", category: "device_transport", at: now.toISOString(), devices: ["display"], metrics: { phase: "recovered", duration_ms: 6200, catchup_count: 2, missed_revisions: 4, hidden_duration_ms: 5100 } },
    { kind: "diagnostic", category: "device_state_sync", at: now.toISOString(), devices: ["buzzer"], metrics: { phase: "read_error", error_class: "TimeoutError" } },
  ];
  const result = buildControl2StatsExport([{ ...session("sync", now), stats_detail: { events } }], "today", { now });

  assert.deepEqual(result.sessions[0].stats_detail.events, events);
});

test("zakres 7 dni i 30 dni obejmuje granicę przedziału", () => {
  const now = new Date(2026, 9, 13, 12, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = [
    session("seven-days", sevenDaysAgo),
    session("just-before-seven", new Date(sevenDaysAgo.getTime() - 1)),
    session("thirty-days", thirtyDaysAgo),
    session("just-before-thirty", new Date(thirtyDaysAgo.getTime() - 1)),
  ];

  assert.deepEqual(buildControl2StatsExport(rows, "7d", { now }).sessions.map(row => row.id), ["seven-days"]);
  assert.deepEqual(buildControl2StatsExport(rows, "30d", { now }).sessions.map(row => row.id), ["seven-days", "just-before-seven", "thirty-days"]);
});

test("wszystkie załadowane eksportuje stare rekordy Control 2, ale pomija Control 1", () => {
  const now = new Date(2026, 9, 13, 12, 0, 0);
  const rows = [session("old-control2", new Date(2025, 0, 1)), session("control1", now, 1)];
  const result = buildControl2StatsExport(rows, "recent", { now });

  assert.deepEqual(result.sessions.map(row => row.id), ["old-control2"]);
  assert.equal(result.max_sessions_loaded, 500);
});

test("puste i błędne daty nie przerywają eksportu zakresowego", () => {
  const now = new Date(2026, 9, 13, 12, 0, 0);
  const result = buildControl2StatsExport([null, {}, { control_version: 2, started_at: "invalid" }], "today", { now });

  assert.deepEqual(result.sessions, []);
  assert.equal(result.session_count, 0);
  assert.throws(() => buildControl2StatsExport([], "year", { now }), /Invalid export period/);
});
