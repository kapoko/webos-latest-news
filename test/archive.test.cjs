const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createArchiveLookup } = require('../service/archive');
const { latestNosEpisodes } = require('../service/catalog');

function broadcast(id, time, duration = 240) {
  return {
    id: String(id), date_scheduled: `2026-11-27T${time}:00+0100`,
    duration_seconds: duration,
    programs: [{ name: 'NOS Journaal', system_name: 'nos-journaal' }],
    urls: [{ profile: 'hls_unencrypted', url: 'https://example.org/stream' }]
  };
}
function missing() { return Object.assign(new Error('Missing'), { statusCode: 404 }); }

const afterMorning = () => Date.parse('2026-11-27T09:00:00+01:00');

test('stops starting archive checks after finding three ordinary editions', async () => {
  const calls = [];
  const discover = createArchiveLookup(async (id) => {
    calls.push(id);
    if (id === '99') return broadcast(id, '07:00', 540);
    if (id === '98') return broadcast(id, '06:30');
    throw missing();
  }, afterMorning);
  const evening = {
    ...broadcast(90, '00:00'),
    programs: [{ name: 'NOS Achtuurjournaal', system_name: 'nos-achtuurjournaal' }]
  };
  const result = await discover([broadcast(100, '07:30'), evening]);
  const episodes = latestNosEpisodes(result.broadcasts, afterMorning() / 1000, 3);
  assert.deepEqual(episodes.filter((item) => item.programType === 'nos-journaal')
    .map((item) => item.nosId), ['100', '99', '98']);
  assert.ok(episodes.some((item) => item.nosId === '90'));
  assert.ok(calls.length >= 2 && calls.length <= 4);
  assert.equal(result.incomplete, false);
  const before = calls.length;
  await discover([broadcast(100, '07:30'), evening]);
  assert.equal(calls.length, before);
});

test('three editions already in the catalogue require no archive calls', async () => {
  let calls = 0;
  const discover = createArchiveLookup(async () => { calls++; throw missing(); }, afterMorning);
  await discover([broadcast(100, '07:30'), broadcast(99, '07:00'), broadcast(98, '06:30')]);
  assert.equal(calls, 0);
});

test('future, duplicate, unrelated, or streamless entries do not satisfy the stopping rule', async () => {
  const calls = [];
  const entries = {
    99: broadcast(99, '12:00'),
    98: { ...broadcast(98, '07:00'), programs: [{ name: 'Other', system_name: 'other' }] },
    97: { ...broadcast(97, '07:00'), urls: [] },
    96: broadcast(96, '07:30'),
    95: broadcast(95, '07:00'),
    94: broadcast(94, '06:30')
  };
  const discover = createArchiveLookup(async (id) => {
    calls.push(id);
    if (entries[id]) return entries[id];
    throw missing();
  }, afterMorning);
  const result = await discover([broadcast(100, '07:30')]);
  assert.ok(calls.includes('94'));
  const episodes = latestNosEpisodes(result.broadcasts, afterMorning() / 1000, 3);
  assert.deepEqual(episodes.map((episode) => episode.nosId), ['100', '95', '94']);
});

test('discovers missing 07:00 alongside 07:30, skips known ids and tolerates gaps', async () => {
  const calls = [];
  const current = broadcast(105769, '07:30');
  const earlier = broadcast(105767, '07:00', 540);
  const discover = createArchiveLookup(async (id) => {
    calls.push(id);
    if (id === earlier.id) return earlier;
    throw missing();
  });
  const result = await discover([current]);
  const episodes = latestNosEpisodes(result.broadcasts, Date.parse('2026-11-27T08:00:00+01:00') / 1000, 6);
  assert.deepEqual(episodes.map((item) => item.nosId), ['105769', '105767']);
  assert.equal(episodes[1].durationInSeconds, 540);
  assert.equal(result.incomplete, false);
  assert.equal(calls.length, 12);
  assert.ok(!calls.includes(current.id));
});

test('archive work is limited to three concurrent requests and 12 nearby IDs', async () => {
  let active = 0;
  let peak = 0;
  const calls = [];
  const discover = createArchiveLookup(async (id) => {
    calls.push(Number(id));
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    throw missing();
  });
  await discover([broadcast(100, '07:30'), broadcast(98, '07:00')]);
  assert.equal(peak, 3);
  assert.equal(calls.length, 11);
  assert.ok(calls.every((id) => id >= 88 && id < 100 && id !== 98));
});

test('successful details and 404s are cached briefly but retried after expiry', async () => {
  let now = 0;
  let calls = 0;
  const discover = createArchiveLookup(async (id) => {
    calls++;
    if (id === '99') return broadcast(id, '07:00', 540);
    throw missing();
  }, () => now);
  const list = [broadcast(100, '07:30')];
  await discover(list);
  const cached = await discover(list);
  assert.equal(calls, 12);
  assert.equal(cached.broadcasts.length, 2);
  now = 120001;
  await discover(list);
  assert.equal(calls, 24);
});

test('transient errors preserve current broadcasts, warn, and are not cached', async () => {
  let calls = 0;
  const discover = createArchiveLookup(async () => { calls++; throw new Error('HTTP 503'); });
  const list = [broadcast(100, '07:30')];
  const result = await discover(list);
  assert.deepEqual(result.broadcasts, list);
  assert.equal(result.incomplete, true);
  await discover(list);
  assert.equal(calls, 24);
});

test('deadline stops further requests and reports partial discovery', async () => {
  let now = 0;
  let calls = 0;
  const discover = createArchiveLookup(async () => {
    calls++;
    now += 9000;
    throw missing();
  }, () => now);
  const result = await discover([broadcast(100, '07:30')]);
  assert.equal(calls, 1);
  assert.equal(result.incomplete, true);
});

test('empty or non-Journaal catalogues do not trigger speculative requests', async () => {
  const discover = createArchiveLookup(async () => { throw new Error('Unexpected request'); });
  assert.equal((await discover([])).broadcasts.length, 0);
  assert.equal((await discover([{ id: '100', programs: [] }])).incomplete, false);
});

test('extended selection retains three distinct editions per type', () => {
  const list = Array.from({ length: 8 }, (_, index) => broadcast(100 - index, `0${8 - index}:00`));
  const result = latestNosEpisodes(list, Date.parse('2026-11-27T09:00:00+01:00') / 1000, 3);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((item) => item.nosId), ['100', '99', '98']);
});
