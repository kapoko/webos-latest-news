const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(search = '?id=105767') {
  const requests = [];
  const listeners = {};
  const classes = new Set();
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  function element() {
    return {
      hidden: false, disabled: false, events: {},
      addEventListener(name, callback) { this.events[name] = callback; },
      setAttribute(name, value) { this[name] = value; },
      focus() { document.activeElement = this; },
      blur() { document.activeElement = null; }
    };
  }
  const video = {
    events: {}, paused: true, duration: 540, currentTime: 0,
    addEventListener(name, callback) { this.events[name] = callback; },
    pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); },
    load() {},
    removeAttribute(name) { delete this[name]; },
    getAttribute(name) { return this[name] || null; }
  };
  const elements = {
    video, 'player-status': {}, 'player-episode': {},
    play: element(), 'player-controls': element(), 'toggle-play': element(),
    rewind: element(), seek: element(), 'player-time': {}
  };
  elements['player-controls'].contains = (item) =>
    !!item && ['play', 'toggle-play', 'rewind', 'seek'].some((id) => elements[id] === item);
  elements['toggle-play'].disabled = elements.rewind.disabled = elements.seek.disabled = true;
  const document = {
    hidden: false,
    body: { classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); } } },
    getElementById(id) { return elements[id]; },
    addEventListener(name, callback) { listeners[name] = callback; }
  };
  const webOS = { service: { request(uri, options) { requests.push({ uri, ...options }); } } };
  const window = { webOS, location: { search } };
  vm.runInNewContext(fs.readFileSync('app/playback.js', 'utf8'), {
    document, window, webOS, URLSearchParams, Intl, Date,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    video, elements, document, window, requests, classes, listeners,
    start() { elements.play.events.click(); },
    key(keyCode) { listeners.keydown({ keyCode, preventDefault() {} }); },
    tick(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
    }
  };
}

test('selected playback requests the exact archived broadcast and uses native video', () => {
  const app = setup();
  assert.equal(app.requests.length, 1);
  app.start();
  app.start();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].method, 'playback');
  assert.equal(app.requests[0].parameters.nosId, '105767');
  app.requests[0].onSuccess({ streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8' });
  assert.equal(app.video.src, 'https://vod.ak.md.npox.nl/test.m3u8');
  assert.equal(app.video.paused, false);
  app.video.events.playing();
  assert.equal(app.elements['player-controls'].hidden, false);
  assert.equal(app.elements['toggle-play'].textContent, 'Pauze');
});

test('player shows a spinner only while fetching, loading, or buffering', () => {
  const app = setup();
  const status = app.elements['player-status'];
  assert.equal(status.className, 'loading-spinner');
  app.requests[0].onSuccess({ streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8' });
  assert.equal(status.className, 'loading-spinner');
  app.video.events.playing();
  assert.equal(status.className, '');
  app.video.events.waiting();
  assert.equal(status.className, 'loading-spinner');
  app.video.events.error();
  assert.equal(status.className, '');
});

test('player uses the selected id rather than the original test broadcast', () => {
  const app = setup('?id=105800');
  assert.equal(app.requests[0].parameters.nosId, '105800');
  app.requests[0].onSuccess({
    streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8',
    episode: { title: 'NOS Journaal', firstBroadcastDate: 1795759200, durationInSeconds: 540 }
  });
  assert.match(app.elements['player-episode'].textContent, /07:00.*9 min/);
});

test('missing or malformed player ids never request a substitute', () => {
  for (const search of ['', '?id=bad', '?id=123/456']) {
    const app = setup(search);
    assert.equal(app.requests.length, 0);
    assert.match(app.elements['player-status'].textContent, /Geen geldige uitzending/);
  }
});

test('quality shows the decoded height and follows adaptive resolution changes', () => {
  const app = setup();
  app.requests[0].onSuccess({
    streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8',
    episode: { title: 'NOS Journaal', firstBroadcastDate: 1795759200, durationInSeconds: 540 }
  });
  assert.match(app.elements['player-episode'].textContent, /9 min · kwaliteit onbekend$/);
  app.video.videoHeight = 720;
  app.video.events.loadedmetadata();
  assert.match(app.elements['player-episode'].textContent, /9 min · 720p$/);
  app.video.videoHeight = 1080;
  app.video.events.resize();
  assert.match(app.elements['player-episode'].textContent, /9 min · 1080p$/);
  app.video.videoHeight = 576;
  app.video.events.timeupdate();
  assert.match(app.elements['player-episode'].textContent, /9 min · 576p$/);
  app.video.videoHeight = 480;
  app.listeners.mousemove();
  assert.match(app.elements['player-episode'].textContent, /9 min · 480p$/);
  app.video.videoHeight = 0;
  app.video.events.resize();
  assert.match(app.elements['player-episode'].textContent, /kwaliteit onbekend$/);
});

test('retry does not present the previous stream resolution as current quality', () => {
  const app = setup();
  app.video.videoHeight = 1080;
  app.requests[0].onSuccess({
    streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8',
    episode: { title: 'NOS Journaal', firstBroadcastDate: 1795759200, durationInSeconds: 540 }
  });
  assert.match(app.elements['player-episode'].textContent, /1080p$/);
  app.start();
  assert.match(app.elements['player-episode'].textContent, /kwaliteit onbekend$/);
});

test('remote pauses, resumes, bounds seeks, and Back hides controls before exiting', () => {
  const app = setup();
  app.start();
  app.requests[0].onSuccess({ streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8' });
  app.key(13);
  assert.equal(app.video.paused, true);
  app.key(13);
  assert.equal(app.video.paused, false);
  app.elements.seek.focus();
  app.key(37);
  assert.equal(app.video.currentTime, 0);
  app.key(39);
  assert.equal(app.video.currentTime, 15);
  app.video.currentTime = 535;
  app.key(39);
  assert.equal(app.video.currentTime, 540);
  app.key(461);
  assert.equal(app.elements['player-controls'].hidden, true);
  assert.ok(app.video.src);
  app.key(461);
  assert.equal(app.video.src, undefined);
  assert.equal(app.window.location.href, 'index.html');
});

test('network and native playback errors remain visible and allow fresh resolution', () => {
  const app = setup();
  app.start();
  app.requests[0].onFailure({ errorText: 'HTTP 404' });
  assert.match(app.elements['player-status'].textContent, /HTTP 404/);
  app.start();
  app.requests[1].onSuccess({ streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8' });
  app.video.error = { code: 4, message: 'Unsupported source' };
  app.video.events.error();
  assert.match(app.elements['player-status'].textContent, /Videofout 4.*Unsupported source/);
  assert.equal(app.elements['player-controls'].hidden, false);
  app.start();
  assert.equal(app.requests.length, 3);
});

test('cursor movement shows controls and resets the three-second auto-hide timer', () => {
  const app = setup();
  app.requests[0].onSuccess({ streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8' });
  app.video.events.playing();
  app.tick(3000);
  assert.equal(app.elements['player-controls'].hidden, true);
  app.listeners.mousemove();
  assert.equal(app.elements['player-controls'].hidden, false);
  app.tick(2000);
  app.listeners.pointermove();
  app.tick(2000);
  assert.equal(app.elements['player-controls'].hidden, false);
  app.tick(1000);
  assert.equal(app.elements['player-controls'].hidden, true);
});

test('on-screen play/pause, 15-second rewind, and seek slider control native video', () => {
  const app = setup();
  app.requests[0].onSuccess({ streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8' });
  app.elements['toggle-play'].events.click();
  assert.equal(app.video.paused, true);
  assert.equal(app.elements['toggle-play'].textContent, 'Afspelen');
  app.elements['toggle-play'].events.click();
  assert.equal(app.video.paused, false);
  app.video.currentTime = 10;
  app.elements.rewind.events.click();
  assert.equal(app.video.currentTime, 0);
  app.video.currentTime = 60;
  app.elements.rewind.events.click();
  assert.equal(app.video.currentTime, 45);
  app.elements.seek.value = '180';
  app.elements.seek.events.input();
  assert.equal(app.video.currentTime, 180);
  assert.equal(app.elements['player-time'].textContent, '3:00 / 9:00');
  app.video.currentTime = 200;
  app.video.events.timeupdate();
  assert.equal(app.elements.seek.value, 200);
});

test('remote navigates controls, activates rewind, and can reveal a hidden bar', () => {
  const app = setup();
  app.requests[0].onSuccess({ streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8' });
  app.video.events.playing();
  app.tick(3000);
  app.key(40);
  assert.equal(app.document.activeElement, app.elements['toggle-play']);
  app.key(39);
  assert.equal(app.document.activeElement, app.elements.rewind);
  app.video.currentTime = 60;
  app.key(13);
  assert.equal(app.video.currentTime, 45);
  app.key(39);
  assert.equal(app.document.activeElement, app.elements.seek);
  app.key(39);
  assert.equal(app.video.currentTime, 60);
});

test('unknown duration disables seeking and errors remain visible until dismissed', () => {
  const app = setup();
  app.video.duration = NaN;
  app.requests[0].onSuccess({ streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8' });
  app.video.events.loadedmetadata();
  assert.equal(app.elements.seek.disabled, true);
  assert.equal(app.elements.rewind.disabled, true);
  assert.equal(app.elements['player-time'].textContent, '0:00 / 0:00');
  app.video.error = { code: 4 };
  app.video.events.error();
  app.tick(5000);
  assert.equal(app.elements['player-controls'].hidden, false);
  assert.equal(app.elements.play.hidden, false);
  app.key(461);
  assert.equal(app.elements['player-controls'].hidden, true);
});

test('backgrounding pauses playback and ignores a late stream response', () => {
  const app = setup();
  app.start();
  app.document.hidden = true;
  app.listeners.visibilitychange();
  app.requests[0].onSuccess({ streamUrl: 'https://vod.ak.md.npox.nl/test.m3u8' });
  assert.equal(app.video.src, undefined);
  assert.equal(app.video.paused, true);
});
