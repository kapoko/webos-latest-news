const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function setup(statusCode = 200, responses) {
  const methods = {};
  let clock = Date.parse('2026-11-25T08:30:00+01:00');
  const calls = [];
  class Clock extends Date {
    static now() { return clock; }
  }
  const https = {
    get(url, options, callback) {
      calls.push({ url, options });
      const request = new EventEmitter();
      request.setTimeout = () => {};
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = statusCode;
        response.setEncoding = () => {};
        callback(response);
        const body = responses ? responses[calls.length - 1] : [{
          id: '105718', date_scheduled: '2026-11-25T08:00:00+0100',
          programs: [{ name: 'NOS Journaal', system_name: 'nos-journaal' }],
          urls: [{ profile: 'hls_unencrypted', url: 'https://example.org/unused.m3u8' }]
        }];
        response.emit('data', typeof body === 'string' ? body : JSON.stringify(body));
        response.emit('end');
      });
      return request;
    }
  };
  vm.runInNewContext(fs.readFileSync('service/service.js', 'utf8'), {
    require(name) {
      if (name === 'https') return https;
      if (name === 'webos-service') return function () {
        this.register = (method, handler) => { methods[method] = handler; };
      };
      if (name === './catalog') return require('../service/catalog');
      if (name === './archive') return {
        createArchiveLookup: () => async (broadcasts) => ({ broadcasts, incomplete: false })
      };
      return require(name);
    },
    Date: Clock, Buffer, Promise
  });
  return {
    calls,
    advance() { clock += 60000; },
    fetch() { return new Promise((resolve) => methods.latest({ respond: resolve })); },
    playback(nosId) {
      return new Promise((resolve) => methods.playback({ payload: { nosId }, respond: resolve }));
    }
  };
}

test('each refresh uses a fresh NOS proxy cache key and retains the morning broadcast', async () => {
  const service = setup();
  const first = await service.fetch();
  assert.equal(first.returnValue, true);
  assert.equal(first.episodes[0].nosId, '105718');
  assert.equal(first.episodes[0].programType, 'nos-journaal');
  assert.equal(first.episodes[0].playbackMode, 'native');
  service.advance();
  await service.fetch();
  const urls = service.calls.map((call) => new URL(call.url));
  assert.equal(urls[0].pathname, '/smarttv/v3/broadcasts');
  assert.ok(urls[0].searchParams.get('refresh'));
  assert.notEqual(urls[0].searchParams.get('refresh'), urls[1].searchParams.get('refresh'));
  assert.ok(service.calls[0].options.headers['X-NOS']);
});

test('NOS HTTP failures remain errors rather than empty successful catalogues', async () => {
  const service = setup(403);
  const response = await service.fetch();
  assert.equal(response.returnValue, false);
  assert.match(response.errorText, /HTTP 403/);
});

const archived = {
  id: '105700', date_scheduled: '2026-11-25T07:00:00+0100',
  programs: [{ name: 'NOS Journaal', system_name: 'nos-journaal' }],
  duration_seconds: 540,
  urls: [{ profile: 'hls_unencrypted',
    url: 'https://resolver.streaming.api.nos.nl/stream?stream=test' }]
};

test('playback fetches an archived detail directly and resolves a fresh native HLS URL', async () => {
  const url = 'https://vod.ak.md.npox.nl/package/clear/test/index.m3u8?token=fresh';
  const service = setup(200, [archived, `callback(${JSON.stringify(url)});`]);
  const result = await service.playback('105700');
  assert.equal(result.returnValue, true);
  assert.equal(result.episode.durationInSeconds, 540);
  assert.equal(result.streamUrl, url);
  assert.match(service.calls[0].url, /\/broadcasts\/105700\?refresh=/);
  assert.ok(service.calls[0].options.headers['X-NOS']);
  assert.match(service.calls[1].url, /&callback=callback&type=jsonp$/);
});

test('playback rejects invalid ids before making requests', async () => {
  const service = setup();
  for (const id of [undefined, '../broadcasts', 'https://example.org', 105700]) {
    assert.equal((await service.playback(id)).returnValue, false);
  }
  assert.equal(service.calls.length, 0);
});

test('playback does not substitute another broadcast or accept an arbitrary resolver', async () => {
  for (const item of [
    { ...archived, id: '105701' },
    { ...archived, urls: [{ profile: 'hls_unencrypted', url: 'https://example.org/stream' }] },
    { ...archived, programs: [{ name: 'Other', system_name: 'other' }] }
  ]) {
    const service = setup(200, [item]);
    assert.equal((await service.playback('105700')).returnValue, false);
    assert.equal(service.calls.length, 1);
  }
});

test('playback rejects malformed resolver responses and unexpected streaming hosts', async () => {
  for (const body of ['not jsonp', 'callback("https://example.org/video.m3u8");',
    'callback("https://npox.nl.evil.example/video.m3u8");']) {
    const service = setup(200, [archived, body]);
    assert.equal((await service.playback('105700')).returnValue, false);
  }
});
