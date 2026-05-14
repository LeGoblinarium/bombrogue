const Audio = (() => {
  const sounds = {};
  const FILES = [
    'Turn_start', 'Explosion', 'Repulsion', 'Aimant',
    'Entourloupe', 'Stratageme', 'Liberation', 'Bombe', 'Mur_bombe', 'Bonus',
  ];

  // ── Music ──────────────────────────────────────────────────────────────────
  const MUSIC_FILES = [
    'bombrogue_music_01', 'bombrogue_music_02',
    'bombrogue_music_03', 'bombrogue_music_04',
  ];
  const MUSIC_VOLUME = 0.35; // half of SFX volume (0.7)
  let musicTracks   = [];
  let musicIndex    = 0;
  let musicMuted    = false;
  let musicStarted  = false;

  function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function _playTrack(index) {
    const track = musicTracks[index];
    if (!track) return;
    track.volume = musicMuted ? 0 : MUSIC_VOLUME;
    track.currentTime = 0;
    track.play().catch(() => {});
  }

  function initMusic() {
    if (musicTracks.length) return; // already initialised
    const order = [...MUSIC_FILES];
    _shuffle(order);
    for (const name of order) {
      const el = new window.Audio(`/sounds/${name}.mp3`);
      // 'none' avoids ~24 MB of preloaded music per visit; the file is only
      // fetched when the user actually unmutes/starts the track.
      el.preload = 'none';
      el.addEventListener('ended', () => {
        musicIndex = (musicIndex + 1) % musicTracks.length;
        // Re-shuffle when we complete a full cycle
        if (musicIndex === 0) _shuffle(musicTracks);
        _playTrack(musicIndex);
      });
      musicTracks.push(el);
    }
    musicMuted = localStorage.getItem('musicMuted') === 'true';
  }

  function startMusic() {
    if (musicStarted || musicMuted) return;
    musicStarted = true;
    musicIndex = 0;
    _playTrack(0);
  }

  function toggleMusic() {
    musicMuted = !musicMuted;
    localStorage.setItem('musicMuted', musicMuted);
    const current = musicTracks[musicIndex];
    if (!current) return;
    if (musicMuted) {
      current.pause();
    } else {
      // Resume or start for the first time
      if (!musicStarted) {
        musicStarted = true;
        musicIndex = 0;
        _playTrack(0);
      } else {
        current.volume = MUSIC_VOLUME;
        current.play().catch(() => {});
      }
    }
  }

  function isMusicMuted() { return musicMuted; }

  // ── SFX ────────────────────────────────────────────────────────────────────
  function init() {
    for (const name of FILES) {
      const el = new window.Audio(`/sounds/${name}.mp3`);
      // SFX are tiny (~25 KB) but still defer to first play to save bandwidth
      // on lobby-only visits where no game is started.
      el.preload = 'metadata';
      sounds[name] = el;
    }
    initMusic();
  }

  function play(name) {
    const snd = sounds[name];
    if (!snd) return;
    // Clone for overlapping playback (e.g. multiple explosions)
    const clone = snd.cloneNode();
    clone.volume = 0.7;
    clone.play().catch(() => {}); // ignore autoplay policy errors
  }

  function playForAction(actionType, wallsCreated) {
    switch (actionType) {
      case 'place-bomb':   play('Bombe'); break;
      case 'repulseur':    play('Repulsion'); break;
      case 'aimant':       play('Aimant'); break;
      case 'substitution': play('Entourloupe'); break;
      case 'rappel':       play('Stratageme'); break;
      case 'expulsion':    play('Liberation'); break;
    }
    if (wallsCreated) play('Mur_bombe');
  }

  return { init, play, playForAction, startMusic, toggleMusic, isMusicMuted };
})();
