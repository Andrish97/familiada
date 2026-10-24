import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnoseSession, summarizeSessions, describeDevice } from "../../web/admin/js/session-diagnosis.js";

const entry = (n, extra = {}) => ({ n, first: "2026-10-23T10:00:00Z", last: "2026-10-23T10:05:00Z", dur_ms: 0, hidden_ms: 0, max_ms: 0, ...extra });
const ids = row => diagnoseSession(row).map(item => item.id);

test("telefon w tle z utratą połączenia = uśpienie (problem), z dowodami ze zdarzeń", () => {
  const row = {
    control_version: 2,
    diag: { summary: { display: {
      "display_state:page_state:hidden": entry(2),
      "display_state:page_state:visible": entry(3, { hidden_ms: 95_000 }),
      "device_lease:expired": entry(1),
      "device_lease:primary": entry(1),
    } } },
    stats_detail: { events: [
      { source: "display", category: "device_info", metrics: { device_class: "phone", browser: "safari", os: "ios" } },
      { source: "display", category: "device_lease", metrics: { to_state: "expired" }, at: "2026-10-23T10:01:00Z" },
    ] },
  };
  const [first] = diagnoseSession(row);
  assert.equal(first.id, "asleep");
  assert.equal(first.level, "problem");
  assert.match(first.detail, /Wyświetlacz: w tle 2 razy, łącznie 1 min 35 s/);
  assert.match(first.detail, /utrata połączenia z grą 1 raz/);
  assert.equal(first.evidence.length, 1);
});

test("komputer w tle bez utraty połączenia = tylko informacja", () => {
  const result = diagnoseSession({ diag: { summary: { host: { "display_state:page_state:hidden": entry(1) } } } });
  assert.deepEqual(result.map(item => [item.id, item.level]), [["background", "info"]]);
});

test("wolne łącze urządzenia, wolny serwer i brak sieci", () => {
  const row = { diag: { summary: {
    buzzer: { "device_network:slow:device_network": entry(2, { max_ms: 2400 }), "page_lifecycle:offline": entry(1), "page_lifecycle:online": entry(1, { dur_ms: 7000 }) },
    host: { "device_network:slow:server": entry(1, { max_ms: 3100 }) },
    control: { "device_network:slow:device_network": entry(1, { max_ms: 1500 }) },
  } } };
  assert.deepEqual(ids(row).sort(), ["control_network", "offline", "slow_network", "system"].sort());
  const offline = diagnoseSession(row).find(item => item.id === "offline");
  assert.match(offline.detail, /Przycisk: 1 raz, łącznie 7 s/);
});

test("Control: błąd bazy to system, brak odpowiedzi to łącze Control", () => {
  const event = source => ({ source: "control", category: "connectivity", metrics: { phase: "read_error", source } });
  const result = diagnoseSession({ diag: { summary: { control: { "connectivity:read_error": entry(2) } } },
    stats_detail: { events: [event("lease_status"), event("status_read")] } });
  assert.deepEqual(result.map(item => item.id).sort(), ["control_network", "system"]);
});

test("kilka urządzeń traci kanał naraz przy widocznych kartach = system", () => {
  const outage = (source, at) => ({ source, category: "device_transport", at, metrics: { start_visibility: "visible", start_online: true } });
  const result = diagnoseSession({ diag: { summary: {} }, stats_detail: { events: [
    outage("display", "2026-10-23T10:00:00Z"), outage("host", "2026-10-23T10:00:04Z"),
  ] } });
  assert.equal(result[0].id, "system");
  assert.deepEqual(result[0].sources.sort(), ["display", "host"]);
});

test("przeładowanie, druga karta, blokada ekranu, zacięcia, dźwięk", () => {
  const result = diagnoseSession({ diag: { summary: {
    display: {
      "device_lease:primary": entry(3), "device_lease:waiting": entry(1), "wake_lock:denied": entry(1),
      "display_state:render_stall": entry(2, { max_ms: 900 }),
    },
    control: { "audio_start:failed": entry(1) },
  } } });
  assert.deepEqual(result.map(item => item.id).sort(), ["duplicate", "reload", "screen_lock", "slow_device", "sound"].sort());
  assert.match(result.find(item => item.id === "reload").detail, /Wyświetlacz: 2 razy/);
});

test("zestawienie sesji: odsetki i sesje bez problemów", () => {
  const rows = [
    { control_version: 2, diag: { summary: { display: { "device_lease:expired": entry(1) } } } },
    { control_version: 2, diag: { summary: {} } },
    { control_version: 2, diag: { summary: { host: { "display_state:page_state:hidden": entry(1) } } } },
    { control_version: 1 },
  ];
  const result = summarizeSessions(rows);
  assert.equal(result.sessions, 3);
  assert.equal(result.clean, 2);
  assert.deepEqual(result.items.map(item => [item.id, item.count]), [["asleep", 1], ["background", 1]]);
});

test("opis urządzenia bez wersji", () => {
  assert.equal(describeDevice({ device_class: "phone", browser: "safari", os: "ios", battery_level: 30, charging: true }),
    "telefon · Safari · iOS · bateria 30% (ładowanie)");
});
