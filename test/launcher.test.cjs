const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(config = {}) {
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
  vm.runInNewContext(fs.readFileSync('app/app.js', 'utf8'), {
    document, window: { webOS, latestNewsConfig: config }, webOS, Intl, Date, encodeURIComponent
  });
  return { document, listeners, requests, elements };
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

test('renders more than three choices grouped by type, at most two per group', () => {
  const { requests, elements } = setup();
  requests[0].onSuccess({ episodes: [
    episodes[0], episodes[1], { ...episodes[0], nosId: 'extra' },
    episodes[2], { ...episodes[2], nosId: 'older' }
  ] });
  assert.equal(choices(elements).length, 4);
  const headings = elements.episodes.querySelectorAll('.group-heading');
  assert.deepEqual(headings.map((heading) => heading.textContent), [
    'NOS Journaal · 2 beschikbaar', 'NOS Achtuurjournaal · 2 beschikbaar'
  ]);
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

test('relaunch ignores overlapping requests and refreshes completed requests', () => {
  const { requests, listeners } = setup();
  listeners.webOSRelaunch();
  assert.equal(requests.length, 1);
  requests[0].onSuccess({ episodes });
  listeners.webOSRelaunch();
  assert.equal(requests.length, 2);
});

test('returning from background refreshes the list once', () => {
  const { requests, listeners, document } = setup();
  requests[0].onSuccess({ episodes });
  document.hidden = true;
  listeners.visibilitychange();
  document.hidden = false;
  listeners.visibilitychange();
  listeners.visibilitychange();
  assert.equal(requests.length, 2);
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
  listeners.webOSRelaunch();
  requests[1].onFailure({ errorText: 'NOS tijdelijk niet bereikbaar' });
  assert.equal(elements.episodes.children.length, 0);
  assert.equal(elements.retry.hidden, false);
});
