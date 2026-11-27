// NOS has no working history-list endpoint. Inspect a small window of detail
// IDs before the newest Journaal; gaps and other programmes are normal.
const { latestNosEpisodes } = require('./catalog');

function createArchiveLookup(fetchBroadcast, clock = Date.now) {
  const cache = new Map();
  return async function discover(broadcasts) {
    const anchors = broadcasts.filter((item) =>
      /^\d{1,10}$/.test(String(item.id)) && Array.isArray(item.programs) &&
      item.programs.some((program) => program.system_name === 'nos-journaal')
    ).map((item) => Number(item.id));
    if (!anchors.length) return { broadcasts, incomplete: false };
    const anchor = Math.max(...anchors);
    const known = new Set(broadcasts.map((item) => String(item.id)));
    const ids = [];
    for (let id = anchor - 1; id > 0 && id >= anchor - 12; id--) {
      if (!known.has(String(id))) ids.push(String(id));
    }
    const found = [];
    let cursor = 0;
    let incomplete = false;
    const deadline = clock() + 8000;
    function enoughEpisodes() {
      return latestNosEpisodes(broadcasts.concat(found), Math.floor(clock() / 1000), 3)
        .filter((episode) => episode.programType === 'nos-journaal').length >= 3;
    }
    async function worker() {
      while (cursor < ids.length) {
        if (enoughEpisodes()) return;
        if (clock() >= deadline) { incomplete = true; return; }
        const id = ids[cursor++];
        let entry = cache.get(id);
        if (!entry || entry.expires <= clock()) {
          try {
            const item = await fetchBroadcast(id);
            if (!item || String(item.id) !== id) throw new Error('Onjuist NOS-id.');
            entry = { item, expires: clock() + 120000 };
          } catch (error) {
            if (error.statusCode !== 404) { incomplete = true; continue; }
            entry = { item: null, expires: clock() + 120000 };
          }
          if (cache.size >= 128) cache.clear();
          cache.set(id, entry);
        }
        if (entry.item) found.push(entry.item);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    return { broadcasts: broadcasts.concat(found), incomplete };
  };
}

module.exports = { createArchiveLookup };
