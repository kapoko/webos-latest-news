const { test } = require('node:test');
const assert = require('node:assert/strict');
const { latestNosEpisodes } = require('../service/catalog');

function broadcast(id, hour, overrides = {}) {
  return {
    id, date_scheduled: `2026-11-24T${hour}:00:00+0100`,
    programs: [{ name: 'NOS Journaal', system_name: 'nos-journaal' }],
    duration_seconds: 900,
    urls: [{ profile: 'hls_unencrypted', url: 'https://example.org/unused.m3u8' }],
    ...overrides
  };
}
const now = Date.parse('2026-11-24T21:00:00+01:00') / 1000;

test('lists the newest two NOS broadcasts per type with distinct times and ids', () => {
  const result = latestNosEpisodes([
    broadcast('a', '14'), broadcast('b', '18'), broadcast('c', '18'),
    broadcast('d', '20'), broadcast('e', '16')
  ], now);
  assert.deepEqual(result.map((item) => item.nosId), ['d', 'b']);
  assert.ok(result.every((item) => item.nosAvailability === 'available'));
  assert.ok(result.every((item) => !('urls' in item)));
});

test('never fills a short NOS list with broadcasts from another source', () => {
  const result = latestNosEpisodes([broadcast('a', '18'), broadcast('b', '20')], now);
  assert.equal(result.length, 2);
});

test('excludes future broadcasts, Jeugdjournaal and entries without a usable HLS asset', () => {
  const result = latestNosEpisodes([
    broadcast('a', '18'), broadcast('future', '22'),
    broadcast('youth', '17', { programs: [{ name: 'NOS Jeugdjournaal', system_name: 'nos-jeugdjournaal' }] }),
    broadcast('empty', '16', { urls: [] }),
    broadcast('bad-date', '15', { date_scheduled: 'invalid' }),
    broadcast('dash-only', '14', { urls: [{ profile: 'dash_unencrypted', url: 'unused' }] })
  ], now);
  assert.deepEqual(result.map((item) => item.nosId), ['a']);
});

test('keeps up to two episodes of every type, not two episodes in total', () => {
  const evening = { programs: [
    { name: 'NOS Journaal', system_name: 'nos-journaal' },
    { name: 'NOS Achtuurjournaal', system_name: 'nos-achtuurjournaal' }
  ] };
  const result = latestNosEpisodes([
    broadcast('n1', '18'), broadcast('n2', '16'), broadcast('n3', '14'),
    broadcast('e1', '19', evening), broadcast('e2', '17', evening), broadcast('e3', '15', evening)
  ], now);
  assert.deepEqual(result.map((item) => item.nosId), ['n1', 'n2', 'e1', 'e2']);
  assert.equal(result[2].programType, 'nos-achtuurjournaal');
});

test('excludes every programme except ordinary and eight oclock journaals', () => {
  const types = ['nos-jeugdjournaal', 'nos-sportjournaal', 'nieuwsuur',
    'nos-journaal-makkelijke-taal', 'nos-studio-sport'];
  const result = latestNosEpisodes(types.map((type, index) => broadcast(String(index), '18', {
    programs: [{ name: type, system_name: type }]
  })), now);
  assert.equal(result.length, 0);
});

test('includes the 20:00 edition without duplicating it under the general programme name', () => {
  const result = latestNosEpisodes([broadcast('a', '20', {
    programs: [
      { name: 'NOS Journaal', system_name: 'nos-journaal' },
      { name: 'NOS Achtuurjournaal', system_name: 'nos-achtuurjournaal' }
    ]
  })], now);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'NOS Achtuurjournaal');
});

test('invalid catalogue responses are reported instead of shown as an empty list', () => {
  assert.throws(() => latestNosEpisodes({}, now), /Ongeldige NOS-catalogus/);
});
