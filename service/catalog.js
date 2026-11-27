function latestNosEpisodes(broadcasts, now, perType = 2) {
  if (!Array.isArray(broadcasts)) throw new Error('Ongeldige NOS-catalogus.');
  const groups = new Map();
  const sorted = broadcasts.filter((item) =>
    item.id && Array.isArray(item.programs) &&
    item.programs.some((program) => program.name &&
      ['nos-journaal', 'nos-achtuurjournaal'].includes(program.system_name)) &&
    Number.isFinite(Date.parse(item.date_scheduled)) &&
    Date.parse(item.date_scheduled) / 1000 <= now &&
    Array.isArray(item.urls) && item.urls.some((url) =>
      typeof url.profile === 'string' && url.profile.startsWith('hls_') && url.url
    )
  ).sort((a, b) => Date.parse(b.date_scheduled) - Date.parse(a.date_scheduled));
  sorted.forEach((item) => {
    // The 20:00 edition also has a general Journaal tag; show it only once.
    const program = item.programs.find((program) => program.system_name === 'nos-achtuurjournaal') ||
      item.programs.find((program) => program.system_name === 'nos-journaal');
    if (!groups.has(program.system_name)) groups.set(program.system_name, []);
    const group = groups.get(program.system_name);
    const time = Date.parse(item.date_scheduled) / 1000;
    if (group.length < perType && !group.some((episode) =>
      episode.firstBroadcastDate === time || episode.nosId === String(item.id)
    )) {
      group.push({
        title: program.name,
        programType: program.system_name,
        firstBroadcastDate: time,
        durationInSeconds: item.duration_seconds,
        nosId: String(item.id),
        nosAvailability: 'available'
      });
    }
  });
  const order = ['nos-journaal', 'nos-achtuurjournaal'];
  function rank(type) {
    const index = order.indexOf(type);
    return index < 0 ? order.length : index;
  }
  return Array.from(groups.entries())
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .reduce((episodes, entry) => episodes.concat(entry[1]), []);
}

module.exports = { latestNosEpisodes };
