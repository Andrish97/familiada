import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMaintenanceCountdown, formatMaintenanceReturnAt } from '../../web/shared/js/core/maintenance-format.js';

test('maintenance countdown preserves PL, EN and UK inflection at boundaries', () => {
  const fmt = (seconds, lang) => formatMaintenanceCountdown(seconds * 1000, lang);
  assert.equal(fmt(-1, 'pl'), '0 sekund');
  assert.equal(fmt(1, 'pl'), '1 sekunda');
  assert.equal(fmt(2, 'pl'), '2 sekundy');
  assert.equal(fmt(12, 'pl'), '12 sekund');
  assert.equal(fmt(60, 'pl'), '1 minuta');
  assert.equal(fmt(120, 'uk'), '2 хвилини');
  assert.equal(fmt(12 * 60, 'uk'), '12 хвилин');
  assert.equal(fmt(3600, 'en'), '1 hour');
  assert.equal(fmt(86400, 'en'), '1 day');
  assert.equal(fmt(2 * 86400, 'pl'), '2 dni');
});

test('unsupported locale keeps separate public and admin clock layouts', () => {
  const fmt = (seconds, mode) => formatMaintenanceCountdown(seconds * 1000, 'fr', { fallbackClock: mode });
  assert.equal(fmt(65, 'public'), '00:01:05');
  assert.equal(fmt(65, 'admin'), '01:05');
  assert.equal(fmt(86400 + 3660, 'admin'), '1d 01:01');
  assert.equal(fmt(8 * 86400, 'admin'), '8d');
});

test('return date uses local day including a daylight-saving boundary', () => {
  const now = new Date(2026, 2, 29, 1, 30);
  const today = new Date(2026, 2, 29, 12, 5);
  const tomorrow = new Date(2026, 2, 30, 0, 0);
  assert.equal(formatMaintenanceReturnAt(today, 'pl', { now }), 'o 12:05');
  assert.equal(formatMaintenanceReturnAt(today, 'en', { now }), 'at 12:05');
  assert.equal(formatMaintenanceReturnAt(today, 'uk', { now }), 'о 12:05');
  assert.equal(formatMaintenanceReturnAt(tomorrow, 'pl', { now }), '30.03.2026');
  assert.equal(formatMaintenanceReturnAt(tomorrow, 'en', { now }), 'on 03/30/2026');
  assert.equal(formatMaintenanceReturnAt(null, 'pl', { now }), '—');
});
