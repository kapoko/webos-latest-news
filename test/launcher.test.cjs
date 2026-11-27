const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(config = {}, options = {}) {
  let clock = Date.parse('2026-11-27T09:00:00+01:00');
  class Clock extends Date {
    static now() { return clock; }
  }
  const storage = options.storage || new Map();
  const sessionStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); }
  };
  const listeners = {};
  const requests = [];
  const elements = {};
  const document = {
    hidden: false,
    activeElement: null,
    createElement() {
      return {
        textContent: '', hidden: false, children: [], events: {},
        addEventListener(name, handler) { this.events[name] = handler; },
        focus() { document.activeElement = this; },
        append(...children) { this.children.push(...children); },
        replaceChildren() { this.children = []; },
        querySelectorAll(selector) { return this.children.filter((child) => `.${child.className}` === selector); },
        querySelector(selector) { return this.querySelectorAll(selector)[0]; },
        get firstElementChild() { return this.children[0]; }
      };
    },
    getElementById(id) { return elements[id] ||= this.createElement(); },
    addEventListener(name, callback) { listeners[name] = callback; }
  };
  const webOS = { service: { request(uri, options) { requests.push({ uri, ...options }); } } };
  const window = { webOS, latestNewsConfig: config, location: {},
    sessionStorage: options.sessionStorage || sessionStorage };
  vm.runInNewContext(fs.readFileSync('app/app.js', 'utf8'), {
    document, window, webOS, Intl, Date: Clock, encodeURIComponent
  });
  return { document, listeners, requests, elements, window, storage,
    advance(ms) { clock += ms; } };
}

const episodes = [0, 1, 2].map((index) => ({
  title: index === 2 ? 'NOS Achtuurjournaal' : 'NOS Journaal',
  programType: index === 2 ? 'nos-achtuurjournaal' : 'nos-journaal',
  productId: `TEST_${index}`,
  firstBroadcastDate: 1795539600 - index * 3600,
  nosId: index === 0 ? '105707' : null,
  nosAvailability: index === 0 ? 'available' : 'unavailable'
}));

function choices(elements) {
  return elements.episodes.querySelectorAll('.episode');
}

test('list loading shows a spinner, then removes it on success or failure', () => {
  const { requests, elements, listeners } = setup();
  assert.equal(elements.status.className, 'loading-spinner');
  requests[0].onSuccess({ episodes });
  assert.equal(elements.status.className, '');
  elements.retry.events.click();
  assert.equal(elements.status.className, 'loading-spinner');
  requests[1].onFailure({ errorText: 'HTTP 503' });
  assert.equal(elements.status.className, '');
});

test('renders archived choices grouped by type', () => {
  const { requests, elements } = setup();
  requests[0].onSuccess({ episodes: [
    episodes[0], episodes[1], { ...episodes[0], nosId: 'extra' },
    episodes[2], { ...episodes[2], nosId: 'older' }
  ] });
  assert.equal(choices(elements).length, 5);
  const headings = elements.episodes.querySelectorAll('.group-heading');
  assert.deepEqual(headings.map((heading) => heading.textContent), [
    'NOS Journaal · 3 beschikbaar', 'NOS Achtuurjournaal · 2 beschikbaar'
  ]);
});

test('native choices show durations and select their exact id without launching NOS', () => {
  const { requests, elements, window } = setup();
  requests[0].onSuccess({ episodes: [{
    ...episodes[0], durationInSeconds: 540, playbackMode: 'native'
  }], warning: 'Gedeeltelijk archief' });
  assert.match(choices(elements)[0].children[1].textContent, /9 min/);
  assert.equal(choices(elements)[0].children.length, 2);
  assert.equal(elements.details.textContent, 'Gedeeltelijk archief');
  choices(elements)[0].events.click();
  assert.equal(window.location.href, 'playback.html?id=105707');
  assert.equal(requests.length, 1);
  assert.doesNotMatch(elements.status.textContent, /gekoppeld/);
});

test('interface caps extended history at three choices per type', () => {
  const { requests, elements } = setup();
  requests[0].onSuccess({ episodes: Array.from({ length: 10 }, (_, index) => ({
    ...episodes[0], nosId: String(100 + index), playbackMode: 'native'
  })) });
  assert.equal(choices(elements).length, 3);
});

test('shows a clear empty ordinary Journaal group when NOS only supplies the 20:00 edition', () => {
  const { requests, elements } = setup();
  requests[0].onSuccess({ episodes: [episodes[2]] });
  assert.equal(choices(elements).length, 1);
  assert.equal(elements.episodes.querySelectorAll('.group-heading')[0].textContent,
    'NOS Journaal · 0 beschikbaar');
  assert.equal(elements.episodes.querySelectorAll('.group-empty').length, 1);
});

test('does not render other programme types even when present in a response', () => {
  const { requests, elements } = setup();
  requests[0].onSuccess({ episodes: [
    episodes[0], { ...episodes[0], programType: 'nos-sportjournaal', title: 'NOS Sportjournaal' }
  ] });
  assert.equal(choices(elements).length, 1);
});

test('shows three choices with Dutch times without automatically opening another app', () => {
  const { requests, elements, document } = setup();
  requests[0].onSuccess({ episodes });
  assert.equal(requests.length, 1);
  assert.equal(choices(elements).length, 3);
  assert.equal(document.activeElement, choices(elements)[0]);
  assert.match(choices(elements)[0].children[0].textContent, /18:00/);
  assert.equal(choices(elements)[0].children[2].textContent, 'OK: bekijk deze uitzending in de NOS-app');
  assert.equal(choices(elements)[1].children[2].textContent, 'Niet gevonden in de NOS-catalogus');
});

test('does not guess a NOS app id when it has not been identified', () => {
  const { requests, elements } = setup();
  requests[0].onSuccess({ episodes });
  choices(elements)[0].events.click();
  assert.equal(requests.length, 1);
  assert.match(elements.status.textContent, /nog worden gekoppeld/);
});

test('opens the chosen NOS episode using platform-handled deep linking', () => {
  const { requests, elements } = setup({ nosAppId: 'test.nos.app' });
  requests[0].onSuccess({ episodes });
  choices(elements)[0].events.click();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].parameters.id, 'test.nos.app');
  assert.equal(requests[1].parameters.params.handledBy, 'platform');
  assert.equal(requests[1].parameters.params.contentTarget, 'https://smarttv.nos.nl/webos/#/player?id=105707');
  requests[1].onSuccess();
  assert.match(elements.status.textContent, /doorgegeven aan NOS/);
});

test('different episode selections produce different deep links', () => {
  const { requests, elements } = setup({ nosAppId: 'test.nos.app' });
  requests[0].onSuccess({ episodes: [
    episodes[0], { ...episodes[1], nosId: '105685', nosAvailability: 'available' }
  ] });
  choices(elements)[0].events.click();
  const firstTarget = requests[1].parameters.params.contentTarget;
  requests[1].onSuccess();
  choices(elements)[1].events.click();
  assert.notEqual(requests[2].parameters.params.contentTarget, firstTarget);
  assert.equal(requests[2].parameters.params.contentTarget, 'https://smarttv.nos.nl/webos/#/player?id=105685');
});

test('missing or unknown NOS episodes never silently open a different broadcast', () => {
  const { requests, elements } = setup({ nosAppId: 'test.nos.app' });
  requests[0].onSuccess({ episodes: [
    episodes[1], { ...episodes[2], nosAvailability: 'unknown' }
  ] });
  choices(elements)[0].events.click();
  assert.equal(requests.length, 1);
  assert.match(elements.details.textContent, /niet in de huidige NOS-catalogus/);
  choices(elements)[1].events.click();
  assert.equal(requests.length, 1);
  assert.match(elements.details.textContent, /NOS-catalogus is niet bereikbaar/);
});

test('remote arrows move focus through episodes and refresh', () => {
  const { requests, elements, document, listeners } = setup();
  requests[0].onSuccess({ episodes });
  const down = () => listeners.keydown({ keyCode: 40, preventDefault() {} });
  down();
  assert.equal(document.activeElement, choices(elements)[1]);
  down();
  down();
  assert.equal(document.activeElement, elements.retry);
});

test('relaunch ignores overlapping requests and reuses the fresh completed list', () => {
  const { requests, listeners } = setup();
  listeners.webOSRelaunch();
  assert.equal(requests.length, 1);
  requests[0].onSuccess({ episodes });
  listeners.webOSRelaunch();
  assert.equal(requests.length, 1);
});

test('returning from background reuses a fresh cached list', () => {
  const { requests, listeners, document } = setup();
  requests[0].onSuccess({ episodes });
  document.hidden = true;
  listeners.visibilitychange();
  document.hidden = false;
  listeners.visibilitychange();
  listeners.visibilitychange();
  assert.equal(requests.length, 1);
});

test('catalog failure allows retry on relaunch', () => {
  const { requests, listeners, elements } = setup();
  requests[0].onFailure({ errorText: 'Test failure' });
  assert.equal(elements.retry.hidden, false);
  listeners.webOSRelaunch();
  assert.equal(requests.length, 2);
});

test('failed refresh removes stale episode choices', () => {
  const { requests, listeners, elements } = setup();
  requests[0].onSuccess({ episodes });
  elements.retry.events.click();
  requests[1].onFailure({ errorText: 'NOS tijdelijk niet bereikbaar' });
  assert.equal(elements.episodes.children.length, 0);
  assert.equal(elements.retry.hidden, false);
});

test('returning from the player restores the complete list without a request or spinner', () => {
  const first = setup();
  first.requests[0].onSuccess({ episodes, warning: 'Gedeeltelijk archief' });
  const returned = setup({}, { storage: first.storage });
  assert.equal(returned.requests.length, 0);
  assert.equal(choices(returned.elements).length, 3);
  assert.equal(returned.elements.status.textContent, '');
  assert.equal(returned.elements.status.className, '');
  assert.equal(returned.elements.details.textContent, 'Gedeeltelijk archief');
  assert.equal(returned.elements.retry.hidden, false);
});

test('cache expires after two minutes and cache hits do not extend its lifetime', () => {
  const app = setup();
  app.requests[0].onSuccess({ episodes });
  app.advance(60000);
  app.listeners.webOSRelaunch();
  assert.equal(app.requests.length, 1);
  app.advance(60000);
  app.listeners.webOSRelaunch();
  assert.equal(app.requests.length, 2);
  assert.equal(app.elements.status.className, 'loading-spinner');
});

test('Vernieuwen explicitly bypasses even a newly restored list cache', () => {
  const first = setup();
  first.requests[0].onSuccess({ episodes });
  const returned = setup({}, { storage: first.storage });
  returned.elements.retry.events.click();
  assert.equal(returned.requests.length, 1);
  assert.equal(returned.elements.status.className, 'loading-spinner');
  returned.requests[0].onSuccess({ episodes: [episodes[0]] });
  assert.equal(choices(returned.elements).length, 1);
  assert.equal(choices(setup({}, { storage: first.storage }).elements).length, 1);
});

test('corrupt, expired, or future-dated session caches fall back to fetching', () => {
  const now = Date.parse('2026-11-27T09:00:00+01:00');
  for (const value of [
    'invalid JSON',
    JSON.stringify({ savedAt: now - 120000, episodes }),
    JSON.stringify({ savedAt: now + 1, episodes }),
    JSON.stringify({ savedAt: now, episodes: [null] })
  ]) {
    const app = setup({}, { storage: new Map([['journaal-list-v1', value]]) });
    assert.equal(app.requests.length, 1);
  }
});

test('unavailable session storage does not break fetching or in-page caching', () => {
  const denied = () => { throw new Error('Storage unavailable'); };
  const app = setup({}, { sessionStorage: { getItem: denied, setItem: denied, removeItem: denied } });
  app.requests[0].onSuccess({ episodes });
  app.listeners.webOSRelaunch();
  assert.equal(app.requests.length, 1);
  app.elements.retry.events.click();
  assert.equal(app.requests.length, 2);
});
