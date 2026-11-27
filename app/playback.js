(() => {
  const video = document.getElementById('video');
  const status = document.getElementById('player-status');
  const start = document.getElementById('play');
  const episodeInfo = document.getElementById('player-episode');
  const controls = document.getElementById('player-controls');
  const toggle = document.getElementById('toggle-play');
  const rewind = document.getElementById('rewind');
  const seek = document.getElementById('seek');
  const time = document.getElementById('player-time');
  const id = new URLSearchParams(window.location.search).get('id');
  let loading = false;
  let generation = 0;
  let hideTimer;
  let episodeLabel = '';

  function show(text, loading = false) {
    status.textContent = text;
    status.className = loading ? 'loading-spinner' : '';
  }

  function hideControls() {
    clearTimeout(hideTimer);
    controls.hidden = true;
    if (controls.contains(document.activeElement)) document.activeElement.blur();
  }

  function revealControls(autoHide = true) {
    clearTimeout(hideTimer);
    controls.hidden = false;
    updateQuality();
    if (autoHide && !loading && video.getAttribute('src') && !video.error) {
      hideTimer = setTimeout(hideControls, 3000);
    }
  }

  function updateQuality() {
    if (!episodeLabel) return;
    const height = !loading && !video.error && video.getAttribute('src') ? video.videoHeight : 0;
    const quality = Number.isFinite(height) && height > 0 ? `${height}p` : 'kwaliteit onbekend';
    const label = `${episodeLabel} · ${quality}`;
    if (episodeInfo.textContent !== label) episodeInfo.textContent = label;
  }

  function formatTime(seconds) {
    seconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function updateProgress() {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    seek.max = duration;
    seek.value = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    seek.disabled = rewind.disabled = !duration || loading || !video.getAttribute('src') || !!video.error;
    toggle.disabled = loading || !video.getAttribute('src') || !!video.error;
    toggle.textContent = video.paused ? 'Afspelen' : 'Pauze';
    time.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
    seek.setAttribute('aria-valuetext', time.textContent);
    updateQuality();
  }

  function seekTo(seconds) {
    if (!seek.disabled && Number.isFinite(seconds)) {
      video.currentTime = Math.max(0, Math.min(video.duration, seconds));
      updateProgress();
    }
    revealControls();
  }

  function togglePlayback() {
    if (toggle.disabled) return;
    if (video.paused) resume();
    else video.pause();
    updateProgress();
    revealControls();
  }

  function resume() {
    const result = video.play();
    if (result && result.catch) result.catch((error) => {
      show(`Afspelen niet gestart: ${error.message}. Probeer opnieuw met OK.`);
      updateProgress();
      revealControls(false);
    });
  }

  function load() {
    if (loading) return;
    if (!id || !/^\d{1,10}$/.test(id)) {
      show('Geen geldige uitzending gekozen. Ga terug naar de lijst.');
      return;
    }
    if (!window.webOS || !webOS.service) {
      show('Deze speler werkt alleen op een LG webOS-tv.');
      return;
    }
    loading = true;
    revealControls(false);
    const request = ++generation;
    video.pause();
    video.removeAttribute('src');
    video.load();
    updateProgress();
    show('Gekozen uitzending en verse stream-URL ophalen', true);
    webOS.service.request('luna://nl.kasper.latestnews.service', {
      method: 'playback',
      parameters: { nosId: id },
      onSuccess(response) {
        if (request !== generation) return;
        loading = false;
        if (!response.streamUrl) {
          show('NOS heeft geen stream-URL teruggegeven.');
          return;
        }
        if (response.episode) {
          const episode = response.episode;
          const time = new Intl.DateTimeFormat('nl-NL', {
            timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long',
            hour: '2-digit', minute: '2-digit'
          }).format(new Date(episode.firstBroadcastDate * 1000));
          episodeLabel = `${episode.title} · ${time} · ${
            Math.round(episode.durationInSeconds / 60)} min`;
        }
        video.src = response.streamUrl;
        start.hidden = true;
        video.load();
        updateProgress();
        show('Stream laden', true);
        resume();
      },
      onFailure(error) {
        if (request !== generation) return;
        loading = false;
        start.hidden = false;
        start.focus();
        updateProgress();
        revealControls(false);
        show(`Ophalen mislukt: ${error.errorText || 'Onbekende fout'}`);
      }
    });
  }

  video.addEventListener('playing', () => {
    show('');
    updateProgress();
    revealControls();
  });
  video.addEventListener('pause', () => {
    show('Gepauzeerd.');
    updateProgress();
    revealControls();
  });
  video.addEventListener('waiting', () => {
    show('Bufferen', true);
    revealControls(false);
  });
  video.addEventListener('ended', () => {
    show('Uitzending afgelopen. Terug om af te sluiten.');
    updateProgress();
    revealControls();
  });
  video.addEventListener('error', () => {
    start.hidden = false;
    updateProgress();
    revealControls(false);
    show(`Videofout ${video.error ? video.error.code : '?'}: ${
      video.error && video.error.message || 'Stream niet afspeelbaar op deze tv.'
    } Druk op Start om een verse URL te proberen.`);
  });
  ['timeupdate', 'loadedmetadata', 'durationchange', 'resize'].forEach((name) =>
    video.addEventListener(name, updateProgress));
  toggle.addEventListener('click', togglePlayback);
  rewind.addEventListener('click', () => seekTo(video.currentTime - 15));
  seek.addEventListener('input', () => seekTo(Number(seek.value)));
  document.addEventListener('mousemove', () => revealControls());
  document.addEventListener('pointermove', () => revealControls());
  controls.addEventListener('focusin', () => revealControls());
  start.addEventListener('click', load);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      generation++;
      loading = false;
      video.pause();
      clearTimeout(hideTimer);
    }
  });
  document.addEventListener('keydown', (event) => {
    const key = event.keyCode;
    if (key === 461) {
      event.preventDefault();
      if (!controls.hidden) {
        hideControls();
        return;
      }
      generation++;
      video.pause();
      video.removeAttribute('src');
      video.load();
      window.location.href = 'index.html';
    } else if ([37, 38, 39, 40].includes(key)) {
      event.preventDefault();
      const wasHidden = controls.hidden;
      revealControls();
      const buttons = [toggle, rewind, seek, start].filter((item) => !item.disabled && !item.hidden);
      if (!buttons.length) return;
      if (wasHidden) { buttons[0].focus(); return; }
      if (document.activeElement === seek && (key === 37 || key === 39)) {
        seekTo(video.currentTime + (key === 37 ? -15 : 15));
      } else {
        const index = buttons.indexOf(document.activeElement);
        const direction = key === 37 || key === 38 ? -1 : 1;
        buttons[Math.max(0, Math.min(buttons.length - 1, index + direction))].focus();
      }
    } else if (key === 13) {
      event.preventDefault();
      if (video.error || !video.getAttribute('src')) load();
      else if (!controls.hidden && document.activeElement === rewind) seekTo(video.currentTime - 15);
      else togglePlayback();
    } else if ([415, 19, 179, 413].includes(key) && video.getAttribute('src')) {
      event.preventDefault();
      if (key === 19 || key === 413 || (key === 179 && !video.paused)) {
        video.pause();
      } else {
        resume();
      }
      updateProgress();
      revealControls();
    }
  });
  start.focus();
  load();
})();
