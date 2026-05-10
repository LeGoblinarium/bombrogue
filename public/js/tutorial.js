/**
 * Tutorial — state machine for the interactive solo tutorial.
 *
 * 8 steps:
 *   1. Move to a blue cell
 *   2. Select Bomb and place a bomb
 *   3. End your turn
 *   4. Detonate the bomb
 *   5. Use Répulseur and make a bomb move (path.length > 1)
 *   6. Create a bomb wall (place bombs aligned within 6 cells)
 *   7. Trigger a chain detonation (detonate a wall-connected bomb)
 *   8. Final congratulations
 *
 * Public API:
 *   Tutorial.start(initialState)
 *   Tutorial.isActive()
 *   Tutorial.hasEnded()
 *   Tutorial.onStateUpdate(delta)
 *   Tutorial.onTurnStart(data)
 *   Tutorial.onDetonationResult(data)
 */
const Tutorial = (() => {
  let _active    = false;
  let _ended     = false;   // stays true after _endTutorial() to suppress game-over screen
  let _collapsed = false;   // tooltip hidden by user; mini badge shown instead
  let _step      = 0;       // 0-based index into STEPS
  let _hintTimer = null;
  let _resizeListener = null;

  // Spell IDs allowed at each step (null = all unblocked)
  const STEPS = [
    {
      label: 'Étape 1 / 8 — Déplacement',
      msg: '🔵 Les cases bleues sont accessibles. <b>Clique une case bleue</b> pour la sélectionner (le chemin s\'affiche), puis <b>reclique la même case</b> pour confirmer.',
      allowedSpells: new Set(), // block all spells, movement only
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 2 / 8 — Poser une bombe',
      msg: 'Clique <b>💣 Bombe</b> ci-dessous, puis <b>clique une case</b> à portée pour la sélectionner, et <b>reclique-la</b> pour poser la bombe.',
      allowedSpells: new Set(['place-bomb']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 3 / 8 — Fin de tour',
      msg: 'Clique <b>⏭ Fin tour</b> pour passer au tour suivant.',
      allowedSpells: new Set(['end-turn']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 4 / 8 — Détonation',
      msg: 'Clique <b>💥 Détoner</b>, puis <b>clique la bombe</b> pour la sélectionner, et <b>reclique-la</b> pour l\'exploser.',
      allowedSpells: new Set(['detonate']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 5 / 8 — Répulseur',
      msg: 'Pose d\'abord une bombe (💣). Puis clique <b>↔ Répulseur</b> et vise <b>une case à côté de la bombe</b> (pas la bombe elle-même !) pour la pousser.',
      allowedSpells: new Set(['place-bomb', 'repulseur', 'end-turn']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 6 / 8 — Murs de bombes',
      msg: '💥 Deux bombes <b>alignées</b> (H ou V) à moins de 6 cases d\'écart créent un <b>mur de dégâts</b> : 15 dmg pour 2 bombes, 25 dmg pour 3+.<br><br>⏳ Les bombes <b>vieillissent</b> chaque cycle (+20 % de dégâts, jusqu\'à ×1,8).<br><br>Pose des bombes alignées pour <b>créer un mur</b> !',
      allowedSpells: new Set(['place-bomb', 'detonate', 'end-turn']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 7 / 8 — Réaction en chaîne',
      msg: '🔗 Quand des bombes sont reliées par un mur, <b>détoner l\'une d\'elles</b> fait exploser toutes les autres !<br><br>Les bombes de l\'étape précédente sont toujours là. <b>Détone-en une</b> pour déclencher la réaction en chaîne !',
      allowedSpells: new Set(['place-bomb', 'detonate', 'end-turn']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 8 / 8',
      msg: '🎉 Parfait ! Tu maîtrises maintenant toutes les mécaniques du jeu.<br><br>Bonne partie !',
      allowedSpells: null,
      anchor: 'spell-bar',
      arrowSide: 'bottom',
      isFinal: true,
    },
  ];

  // ── DOM helpers ──────────────────────────────────────────────────────────────

  function _tooltip()  { return document.getElementById('tutorial-tooltip'); }
  function _labelEl()  { return document.getElementById('tut-step-label'); }
  function _msgEl()    { return document.getElementById('tut-message'); }
  function _skipBtn()  { return document.getElementById('tut-skip'); }
  function _hideBtn()  { return document.getElementById('tut-hide'); }
  function _miniEl()   { return document.getElementById('tutorial-mini'); }

  // ── Collapse / expand ────────────────────────────────────────────────────────

  function _positionMini() {
    const mini = _miniEl();
    const anchor = document.getElementById(STEPS[_step].anchor);
    if (!mini || !anchor) return;

    // Measure with visibility hidden so layout is correct
    mini.style.visibility = 'hidden';
    mini.classList.remove('hidden');

    const aRect = anchor.getBoundingClientRect();
    const mW = mini.offsetWidth;
    const mH = mini.offsetHeight;
    const GAP = 8;

    let left = aRect.left + aRect.width / 2 - mW / 2;
    left = Math.max(8, Math.min(window.innerWidth - mW - 8, left));
    const top = Math.max(8, aRect.top - mH - GAP);

    mini.style.left = left + 'px';
    mini.style.top  = top  + 'px';
    mini.style.visibility = 'visible';
  }

  function _setCollapsed(val) {
    _collapsed = val;
    const tt   = _tooltip();
    const mini = _miniEl();
    if (val) {
      if (tt)   tt.classList.add('hidden');
      _positionMini();
    } else {
      if (mini) mini.classList.add('hidden');
      _positionTooltip(); // removes 'hidden' and repositions
    }
  }

  // ── Tooltip positioning ──────────────────────────────────────────────────────

  function _positionTooltip() {
    const step = STEPS[_step];
    const tt = _tooltip();
    if (!tt) return;

    const anchor = document.getElementById(step.anchor);
    if (!anchor) return;

    const aRect = anchor.getBoundingClientRect();
    const GAP = 12;

    // Show off-screen first to measure size
    tt.style.visibility = 'hidden';
    tt.style.left = '0px';
    tt.style.top  = '0px';
    tt.removeAttribute('data-arrow');
    tt.classList.remove('hidden');

    const ttW = tt.offsetWidth;
    const ttH = tt.offsetHeight;

    let left = aRect.left + aRect.width / 2 - ttW / 2;
    left = Math.max(8, Math.min(window.innerWidth - ttW - 8, left));

    let top, arrowSide;
    if (step.arrowSide === 'bottom') {
      top = aRect.top - ttH - GAP;
      if (top < 8) {
        top = aRect.bottom + GAP;
        arrowSide = 'top';
      } else {
        arrowSide = 'bottom';
      }
    } else {
      top = aRect.bottom + GAP;
      if (top + ttH > window.innerHeight - 8) {
        top = aRect.top - ttH - GAP;
        arrowSide = 'bottom';
      } else {
        arrowSide = 'top';
      }
    }

    top  = Math.max(8, Math.min(window.innerHeight - ttH - 8, top));
    left = Math.max(8, Math.min(window.innerWidth  - ttW - 8, left));

    tt.style.left = left + 'px';
    tt.style.top  = top  + 'px';
    tt.dataset.arrow = arrowSide;
    tt.style.visibility = 'visible';
  }

  // ── Step rendering ───────────────────────────────────────────────────────────

  function _renderStep() {
    const step = STEPS[_step];
    const label = _labelEl();
    const msg   = _msgEl();
    const skip  = _skipBtn();
    const tt    = _tooltip();

    if (!tt) return;

    label.textContent = step.label;
    msg.innerHTML     = step.msg;

    // Remove any previous action buttons
    tt.querySelectorAll('.tut-finish-btn, .tut-next-btn').forEach(b => b.remove());

    if (step.isFinal) {
      skip.classList.add('hidden');
      const finishBtn = document.createElement('button');
      finishBtn.className = 'tut-finish-btn btn';
      finishBtn.textContent = '🎉 Terminer le tutoriel';
      finishBtn.addEventListener('click', _endTutorial);
      tt.appendChild(finishBtn);
    } else {
      skip.classList.remove('hidden');
    }

    // Always un-collapse when a new step is rendered
    const mini = _miniEl();
    if (mini) mini.classList.add('hidden');
    _positionTooltip();
    _applySpellBlocking();
  }

  // Show a temporary hint (orange) without advancing the step
  function _showHint(hintMsg) {
    const msg = _msgEl();
    if (!msg) return;
    const originalMsg = STEPS[_step].msg;
    msg.innerHTML = `<span style="color:#fb923c">${hintMsg}</span>`;
    clearTimeout(_hintTimer);
    _hintTimer = setTimeout(() => {
      if (_active) msg.innerHTML = originalMsg;
    }, 4000);
  }

  // ── Spell blocking ───────────────────────────────────────────────────────────

  function _applySpellBlocking() {
    const step = STEPS[_step];
    if (step.allowedSpells === null) {
      document.querySelectorAll('[data-spell-id]').forEach(btn => {
        btn.classList.remove('tut-blocked');
        btn.style.removeProperty('pointer-events');
        btn.style.removeProperty('opacity');
      });
      return;
    }

    document.querySelectorAll('[data-spell-id]').forEach(btn => {
      const id = btn.dataset.spellId;
      const blocked = !step.allowedSpells.has(id);
      btn.classList.toggle('tut-blocked', blocked);
      btn.style.pointerEvents = blocked ? 'none' : '';
      btn.style.opacity       = blocked ? '0.3'  : '';
    });
  }

  function _reapplyBlockingAfterRender() {
    requestAnimationFrame(_applySpellBlocking);
  }

  // ── Step transitions ─────────────────────────────────────────────────────────

  function _advance() {
    if (!_active) return;
    _collapsed = false; // auto-show tooltip on new step
    _step++;
    if (_step >= STEPS.length) {
      _endTutorial();
      return;
    }
    _renderStep();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function start(/* initialState */) {
    _active    = true;
    _ended     = false;
    _collapsed = false;
    _step      = 0;

    // Wire "skip" button (added once; listener survives across steps)
    const skip = _skipBtn();
    if (skip) skip.addEventListener('click', _endTutorial);

    // Wire "hide" (eye) button
    const hideBtn = _hideBtn();
    if (hideBtn) hideBtn.addEventListener('click', () => _setCollapsed(true));

    // Wire mini badge
    const mini = _miniEl();
    if (mini) mini.addEventListener('click', () => _setCollapsed(false));

    // Reposition on resize
    _resizeListener = () => {
      if (!_active) return;
      if (_collapsed) _positionMini();
      else _positionTooltip();
    };
    window.addEventListener('resize', _resizeListener);

    _renderStep();
  }

  function isActive() { return _active; }
  function hasEnded() { return _ended; }

  function onStateUpdate(delta) {
    if (!_active) return;
    _reapplyBlockingAfterRender();

    const action = delta.actionType;

    switch (_step) {
      case 0:
        if (action === 'move') _advance();
        break;

      case 1:
        if (action === 'place-bomb') _advance();
        break;

      // Step 2 (end-turn) handled in onTurnStart

      case 3:
        // Detonate step handled in onDetonationResult
        break;

      case 4: {
        if (action === 'repulseur') {
          const bombMoved = (delta.movements || []).some(
            m => m.type === 'bomb' && m.path && m.path.length > 1
          );
          if (bombMoved) {
            _advance();
          } else {
            _showHint('La bombe n\'a pas bougé ! Clique une case <b>à côté</b> de la bombe pour la pousser — pas sur la bombe elle-même.');
          }
        }
        break;
      }

      case 5:
        if (action === 'place-bomb' && delta.wallsCreated) _advance();
        break;

      // Step 6 (chain detonation) handled in onDetonationResult
    }
  }

  function onTurnStart(/* data */) {
    if (!_active) return;
    _reapplyBlockingAfterRender();
    if (_step === 2) _advance();
  }

  function onDetonationResult(data) {
    if (!_active) return;

    if (_step === 3) {
      _advance();
      return;
    }

    if (_step === 6) {
      // Wall-connected bombs all fire at step 0 together → count total blast events
      const totalBlasts = data && Array.isArray(data.sequence)
        ? data.sequence.reduce((s, group) => s + group.length, 0)
        : 0;
      if (totalBlasts > 1) {
        _advance();
      } else {
        _showHint('Pas de réaction en chaîne ! Les bombes doivent être <b>reliées par un mur</b> — place-en deux alignées, puis détone l\'une d\'elles.');
      }
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  function _endTutorial() {
    if (!_active) return;
    _active = false;
    _ended  = true;

    clearTimeout(_hintTimer);
    if (_resizeListener) {
      window.removeEventListener('resize', _resizeListener);
      _resizeListener = null;
    }

    document.querySelectorAll('[data-spell-id]').forEach(btn => {
      btn.classList.remove('tut-blocked');
      btn.style.removeProperty('pointer-events');
      btn.style.removeProperty('opacity');
    });

    const tt   = _tooltip();
    const mini = _miniEl();
    if (tt)   tt.classList.add('hidden');
    if (mini) mini.classList.add('hidden');

    Socket.emit('leave-room');
    UI.showScreen('screen-lobby');
    Socket.emit('list-rooms');
  }

  return { start, isActive, hasEnded, onStateUpdate, onTurnStart, onDetonationResult };
})();
