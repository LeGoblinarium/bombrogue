const Audio = (() => {
  const sounds = {};
  const FILES = [
    'Turn_start', 'Explosion', 'Repulsion', 'Aimant',
    'Entourloupe', 'Stratageme', 'Liberation', 'Bombe', 'Mur_bombe', 'Bonus',
  ];

  function init() {
    for (const name of FILES) {
      const el = new window.Audio(`/sounds/${name}.mp3`);
      el.preload = 'auto';
      sounds[name] = el;
    }
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
      case 'entourloupe':  play('Entourloupe'); break;
      case 'stratageme':   play('Stratageme'); break;
      case 'liberation':   play('Liberation'); break;
    }
    if (wallsCreated) play('Mur_bombe');
  }

  return { init, play, playForAction };
})();
