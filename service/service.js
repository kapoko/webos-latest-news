const https = require('https');
const Service = require('webos-service');
const crypto = require('crypto');
const { latestNosEpisodes } = require('./catalog');
const { createArchiveLookup } = require('./archive');

const service = new Service('nl.kapoko.latestnews.service');
const endpoint = 'https://api.nos.nl/smarttv/v3/broadcasts';

function fetchText(url, headers, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: Object.assign({
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://smarttv.nos.nl/webos/'
      }, headers)
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`NOS geeft HTTP ${response.statusCode}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        resolve(body);
      });
    }).on('error', reject);
    request.setTimeout(timeout, () => {
      request.destroy(new Error('NOS reageert niet op tijd.'));
    });
  });
}

async function fetchJson(url, headers, timeout) {
  const body = await fetchText(url, headers, timeout);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('NOS geeft ongeldige JSON');
  }
}

function nosHeaders() {
  const identity = `twc;${Math.floor(Date.now() / 1000)};core/LG;NA/webOS;nl.nos.app.tv/`;
  return { 'X-NOS': crypto.createHash('md5')
    .update('b8x9VqfZnCxcPg' + identity).digest('hex') +
    Buffer.from(identity).toString('base64') };
}

const discoverArchive = createArchiveLookup((id) =>
  fetchJson(`${endpoint}/${id}?refresh=${Date.now()}`, nosHeaders(), 4000)
);

service.register('playback', async (message) => {
  try {
    const id = message.payload && message.payload.nosId;
    if (typeof id !== 'string' || !/^\d{1,10}$/.test(id)) {
      throw new Error('Ongeldig NOS-uitzending-id.');
    }
    const broadcast = await fetchJson(`${endpoint}/${id}?refresh=${Date.now()}`, nosHeaders());
    const episodes = latestNosEpisodes([broadcast], Math.floor(Date.now() / 1000));
    if (!episodes.length || episodes[0].nosId !== id) {
      throw new Error('Deze journaaluitzending heeft geen beschikbare HLS-stream.');
    }
    const asset = broadcast.urls.find((url) => url.profile === 'hls_unencrypted');
    if (!asset || typeof asset.url !== 'string' ||
        !asset.url.startsWith('https://resolver.streaming.api.nos.nl/stream?')) {
      throw new Error('Geen ondersteunde NOS-streamresolver gevonden.');
    }
    const body = await fetchText(`${asset.url}&callback=callback&type=jsonp`);
    const match = /^callback\(([\s\S]*)\);?\s*$/.exec(body);
    if (!match) throw new Error('NOS geeft een ongeldig streamantwoord.');
    const streamUrl = JSON.parse(match[1]);
    if (typeof streamUrl !== 'string' ||
        !/^https:\/\/(?:[a-z0-9-]+\.)*npox\.nl\/[^#\s]+$/i.test(streamUrl)) {
      throw new Error('NOS geeft geen ondersteunde directe stream-URL.');
    }
    message.respond({ returnValue: true, episode: episodes[0], streamUrl });
  } catch (error) {
    message.respond({ returnValue: false, errorText: error.message });
  }
});

service.register('latest', async (message) => {
  try {
    // Same public client-header format used by smarttv.nos.nl/webos/.
    // NOS's proxy can return a STALE catalogue for hours, even when sent
    // Cache-Control: no-cache. A unique query avoids that stale cache entry.
    const broadcasts = await fetchJson(`${endpoint}?refresh=${Date.now()}`, nosHeaders());
    if (!Array.isArray(broadcasts)) throw new Error('Ongeldige NOS-catalogus.');
    const archive = await discoverArchive(broadcasts);
    const now = Math.floor(Date.now() / 1000);
    const episodes = latestNosEpisodes(archive.broadcasts, now, 3).map((episode) =>
      Object.assign(episode, { playbackMode: 'native' })
    );
    message.respond({
      returnValue: true,
      episodes,
      source: 'NOS',
      warning: archive.incomplete
        ? 'Niet alle eerdere uitzendingen konden worden gecontroleerd. Vernieuw om opnieuw te proberen.'
        : ''
    });
  } catch (error) {
    message.respond({ returnValue: false, errorText: error.message });
  }
});
