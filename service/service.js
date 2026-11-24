const https = require('https');
const Service = require('webos-service');
const crypto = require('crypto');
const { latestNosEpisodes } = require('./catalog');

const service = new Service('nl.kasper.latestnews.service');
const endpoint = 'https://api.nos.nl/smarttv/v3/broadcasts';

function fetchJson(url, headers) {
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
          reject(new Error(`NOS geeft HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('NOS geeft ongeldige JSON'));
        }
      });
    }).on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy(new Error('NOS reageert niet binnen 15 seconden.'));
    });
  });
}

service.register('latest', async (message) => {
  try {
    // Same public client-header format used by smarttv.nos.nl/webos/.
    // This request only uses catalogue metadata; playback stays in the NOS app.
    const identity = `twc;${Math.floor(Date.now() / 1000)};core/LG;NA/webOS;nl.nos.app.tv/`;
    const nosHeader = crypto.createHash('md5')
      .update('b8x9VqfZnCxcPg' + identity).digest('hex') +
      Buffer.from(identity).toString('base64');
    const broadcasts = await fetchJson(endpoint, { 'X-NOS': nosHeader });
    const now = Math.floor(Date.now() / 1000);
    const episodes = latestNosEpisodes(broadcasts, now);
    message.respond({
      returnValue: true,
      episodes,
      source: 'NOS'
    });
  } catch (error) {
    message.respond({ returnValue: false, errorText: error.message });
  }
});
