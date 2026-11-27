(() => {
  const SERVICE_URI = 'luna://nl.kasper.latestnews.service';
  const config = window.latestNewsConfig || {};
  const status = document.getElementById('status');
  const details = document.getElementById('details');
  const list = document.getElementById('episodes');
  const retry = document.getElementById('retry');
  let busy = false;
  let wasHidden = false;
  const CACHE_KEY = 'journaal-list-v1';
  const CACHE_TTL = 120000;
  let cachedList = null;

  function readCache() {
    try {
      if (!cachedList && window.sessionStorage) {
        cachedList = JSON.parse(window.sessionStorage.getItem(CACHE_KEY));
      }
      if (cachedList && Number.isFinite(cachedList.savedAt) &&
          cachedList.savedAt <= Date.now() && Date.now() - cachedList.savedAt < CACHE_TTL &&
          Array.isArray(cachedList.episodes) && cachedList.episodes.every((episode) =>
            episode && typeof episode.title === 'string' &&
            Number.isFinite(episode.firstBroadcastDate))) {
        return cachedList;
      }
    } catch {
      // Storage can be unavailable on some TV/browser configurations.
    }
    return null;
  }

  function clearCache() {
    cachedList = null;
    try {
      if (window.sessionStorage) window.sessionStorage.removeItem(CACHE_KEY);
    } catch {}
  }

  function saveCache(episodes, warning) {
    cachedList = { savedAt: Date.now(), episodes, warning };
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cachedList));
    } catch {}
  }

  function show(message, extra = '', loading = false) {
    status.textContent = message;
    status.className = loading ? 'loading-spinner' : '';
    details.textContent = extra;
  }

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat('nl-NL', {
      timeZone: 'Europe/Amsterdam',
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(timestamp * 1000));
  }

  function chooseEpisode(episode) {
    if (busy) return;
    if (episode.playbackMode === 'native' && episode.nosId &&
        episode.nosAvailability === 'available') {
      window.location.href = `playback.html?id=${encodeURIComponent(episode.nosId)}`;
      return;
    }
    if (!config.nosAppId) {
      show('NOS-app moet nog worden gekoppeld.', 'Het NOS-app-id op deze televisie is nog niet bevestigd.');
      return;
    }
    if (!episode.nosId || episode.nosAvailability !== 'available') {
      show('Deze uitzending kan niet via NOS worden geopend.',
        episode.nosAvailability === 'unknown'
          ? 'De NOS-catalogus is niet bereikbaar. Vernieuw de lijst en probeer opnieuw.'
          : 'Deze uitzending staat niet in de huidige NOS-catalogus. Vernieuw de lijst.');
      return;
    }
    busy = true;
    show('Gekozen journaal openen', formatDate(episode.firstBroadcastDate), true);
    webOS.service.request('luna://com.webos.applicationManager', {
      method: 'launch',
      parameters: {
        id: config.nosAppId,
        params: {
          handledBy: 'platform',
          contentTarget: `https://smarttv.nos.nl/webos/#/player?id=${encodeURIComponent(episode.nosId)}`
        }
      },
      onSuccess() {
        busy = false;
        show('Gekozen uitzending doorgegeven aan NOS.', formatDate(episode.firstBroadcastDate));
      },
      onFailure(error) {
        busy = false;
        show('NOS-app kon niet worden geopend.', error.errorText || 'Controleer of de NOS-app is geïnstalleerd.');
      }
    });
  }

  function renderEpisodes(episodes) {
    list.replaceChildren();
    const groups = new Map([
      ['nos-journaal', []],
      ['nos-achtuurjournaal', []]
    ]);
    const names = {
      'nos-journaal': 'NOS Journaal',
      'nos-achtuurjournaal': 'NOS Achtuurjournaal'
    };
    episodes.forEach((episode) => {
      const type = episode.programType || episode.title;
      if (!groups.has(type)) return;
      if (groups.get(type).length < 3) groups.get(type).push(episode);
    });
    groups.forEach((group, type) => {
      const heading = document.createElement('h2');
      heading.className = 'group-heading';
      heading.textContent = `${names[type]} · ${group.length} beschikbaar`;
      list.append(heading);
      if (!group.length) {
        const empty = document.createElement('p');
        empty.className = 'group-empty';
        empty.textContent = 'De NOS-catalogus geeft momenteel geen afzonderlijke uitzending van dit type terug.';
        list.append(empty);
      }
      group.forEach((episode, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'episode';
        const time = document.createElement('span');
        time.className = 'episode-time';
        time.textContent = formatDate(episode.firstBroadcastDate);
        const title = document.createElement('span');
        title.className = 'episode-title';
        const duration = Number.isFinite(episode.durationInSeconds)
          ? ` · ${Math.round(episode.durationInSeconds / 60)} min` : '';
        title.textContent = `${index === 0 ? 'Nieuwste' : 'Eerder'} · ${episode.title}${duration}`;
        const availability = document.createElement('span');
        availability.className = 'episode-availability';
        availability.textContent = episode.nosAvailability === 'available'
          ? 'OK: bekijk deze uitzending in de NOS-app'
          : episode.nosAvailability === 'unavailable'
            ? 'Niet gevonden in de NOS-catalogus'
            : 'NOS-beschikbaarheid onbekend';
        button.append(time, title);
        if (episode.playbackMode !== 'native' || episode.nosAvailability !== 'available') {
          button.append(availability);
        }
        button.addEventListener('click', () => chooseEpisode(episode));
        list.append(button);
      });
    });
    const first = list.querySelector('.episode');
    if (first) first.focus();
  }

  function displayList(episodes, warning = '') {
    renderEpisodes(episodes);
    show(episodes.length ? '' : 'Geen beschikbare uitzendingen gevonden bij NOS.', warning);
    retry.hidden = false;
    if (!episodes.length) retry.focus();
  }

  function getLatestEpisodes(force = false) {
    if (busy) return;
    const cached = force ? null : readCache();
    if (cached) {
      displayList(cached.episodes, cached.warning);
      return;
    }
    clearCache();
    busy = true;
    retry.hidden = true;
    show('Recente en eerdere uitzendingen ophalen', '', true);
    if (!window.webOS || !webOS.service) {
      busy = false;
      show('Deze app werkt alleen op een LG webOS-tv.');
      return;
    }
    webOS.service.request(SERVICE_URI, {
      method: 'latest',
      parameters: {},
      onSuccess(response) {
        busy = false;
        const episodes = Array.isArray(response.episodes) ? response.episodes : [];
        const warning = typeof response.warning === 'string' ? response.warning : '';
        saveCache(episodes, warning);
        displayList(episodes, warning);
      },
      onFailure(error) {
        busy = false;
        list.replaceChildren();
        show('Uitzendingen ophalen is mislukt.', error.errorText || 'Probeer het opnieuw.');
        retry.hidden = false;
        retry.focus();
      }
    });
  }

  retry.addEventListener('click', () => getLatestEpisodes(true));
  document.addEventListener('webOSRelaunch', () => getLatestEpisodes());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) wasHidden = true;
    else if (wasHidden) {
      wasHidden = false;
      getLatestEpisodes();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.keyCode === 461) {
      webOS.platformBack();
      return;
    }
    const direction = [37, 38].includes(event.keyCode) ? -1
      : [39, 40].includes(event.keyCode) ? 1 : 0;
    if (!direction) return;
    const buttons = Array.from(list.querySelectorAll('.episode'));
    if (!retry.hidden) buttons.push(retry);
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement);
    const next = current < 0 ? 0 : Math.max(0, Math.min(buttons.length - 1, current + direction));
    buttons[next].focus();
  });
  getLatestEpisodes();
})();
