/**
 * Tutorial — state machine for the interactive solo tutorial.
 *
 * 10 steps:
 *   1.  Move to a blue cell
 *   2.  Place a bomb
 *   3.  End your turn
 *   4.  Detonate the bomb
 *   5.  Use Répulseur and make a bomb move
 *   6.  Info: Aimant & Rappel
 *   7.  Info: Substitution & Expulsion
 *   8.  Create a bomb wall
 *   9.  Trigger a chain detonation
 *   10. Final congratulations
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

  // allowedSpells: Set → only those IDs are clickable; null → all unblocked
  const STEPS = [
    {
      label: 'Étape 1 / 10 — Déplacement',
      msg: '🔵 Les cases bleues sont accessibles. <b>Clique une case bleue</b> pour la sélectionner (le chemin s\'affiche), puis <b>reclique la même case</b> pour confirmer.',
      allowedSpells: new Set(),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    {
      label: 'Étape 2 / 10 — Poser une bombe',
      msg: 'Clique <b>💣 Bombe</b> ci-dessous, puis <b>clique une case</b> à portée pour la sélectionner, et <b>reclique-la</b> pour poser la bombe.',
      allowedSpells: new Set(['place-bomb']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    {
      label: 'Étape 3 / 10 — Fin de tour',
      msg: 'Clique <b>⏭ Fin tour</b> pour passer au tour suivant.',
      allowedSpells: new Set(['end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    {
      label: 'Étape 4 / 10 — Détonation',
      msg: 'Clique <b>💥 Détoner</b>, puis <b>clique la bombe</b> pour la sélectionner, et <b>reclique-la</b> pour l\'exploser.',
      allowedSpells: new Set(['detonate']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    {
      label: 'Étape 5 / 10 — Répulseur',
      msg: 'Pose d\'abord une bombe (💣). Puis clique <b>↔ Répuls.</b> et vise <b>une case à côté de la bombe</b> (pas la bombe elle-même !) pour la pousser.',
      allowedSpells: new Set(['place-bomb', 'repulseur', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    {
      label: 'Étape 6 / 10 — Aimant & Rappel',
      msg: '<b>🧲 Aimant</b> (2 PA) : attire les bombes et les joueurs vers la case ciblée sur les axes cardinaux.<br><br><b>↩ Rappel</b> (1 PA) : téléporte une bombe (alliée ou ennemie) à sa <b>position précédente</b> — idéal pour retourner une bombe contre son propriétaire.',
      allowedSpells: null,
      anchor: 'spell-bar', arrowSide: 'bottom',
      isInfo: true,
    },
    {
      label: 'Étape 7 / 10 — Substitution & Expulsion',
      msg: '<b>🔀 Substit.</b> (3 PA) : échange ta position avec <b>une de tes propres bombes</b>. Parfait pour fuir ou te repositionner rapidement.<br><br><b>💨 Expuls.</b> (3 PA) : repousse tout ce qui est adjacent de <b>5 cases</b> dans la direction opposée à toi. Tape sur ton personnage pour déclencher.',
      allowedSpells: null,
      anchor: 'spell-bar', arrowSide: 'bottom',
      isInfo: true,
    },
    {
      label: 'Étape 8 / 10 — Murs de bombes',
      msg: '💥 Deux bombes <b>alignées</b> (H ou V) à moins de 6 cases d\'écart créent un <b>mur de dégâts</b> : 15 dmg pour 2 bombes, 25 dmg pour 3+.<br><br>⏳ Les bombes <b>vieillissent</b> chaque cycle (+20 % de dégâts, jusqu\'à ×1,8).<br><br>Pose des bombes alignées pour <b>créer un mur</b> !',
      allowedSpells: new Set(['place-bomb', 'detonate', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    {
      label: 'Étape 9 / 10 — Réaction en chaîne',
      msg: '🔗 Quand des bombes sont reliées par un mur, <b>détoner l\'une d\'elles</b> fait exploser toutes les autres !<br><br>Les bombes de l\'étape précédente sont toujours là. <b>Détone-en une</b> pour déclencher la réaction en chaîne !',
      allowedSpells: new Set(['place-bomb', 'detonate', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    {
      label: 'Étape 10 / 10',
      msg: '🎉 Parfait ! Tu maîtrises maintenant toutes les mécaniques du jeu.<br><br>Bonne partie !',
      allowedSpells: null,
      anchor: 'spell-bar', arrowSide: 'bottom',
      isFinal: true,
    },
  ];

  // ── DOM helpers ──────────────────────────────────────────────────────────────

  function _tooltip() { return document.getElementById('tutorial-tooltip'); }
  function _labelEl() { return document.getElementById('tut-step-label'); }
  function _msgEl()   { return document.getElementById('tut-message'); }
  function _skipBtn() { return document.getElementById('tut-skip'); }
  function _hideBtn() { return document.getElementById('tut-hide'); }
  function _miniEl()  { return document.getElementById('tutorial-mini'); }

  // ── Collapse / expand ────────────────────────────────────────────────────────

  function _positionMini() {
    const mini   = _miniEl();
    const anchor = document.getElementById(STEPS[_step].anchor);
    if (!mini || !anchor) return;

    mini.style.visibility = 'hidden';
    mini.classList.remove('hidden');

    const aRect = anchor.getBoundingClientRect();
    const mW    = mini.offsetWidth;
    const mH    = mini.offsetHeight;
    const GAP   = 8;

    let left = aRect.left + aRect.width / 2 - mW / 2;
    left = Math.max(8, Math.min(window.innerWidth - mW - 8, left));
    const top = Math.max(8, aRect.top - mH - GAP);

    mini.style.left       = left + 'px';
    mini.style.top        = top  + 'px';
    mini.style.visibility = 'visible';
  }

  function _setCollapsed(val) {
    _collapsed = val;
    const tt   = _tooltip();
    const mini = _miniEl();
    if (val) {
      if (tt) tt.classList.add('hidden');
      _positionMini();
    } else {
      if (mini) mini.classList.add('hidden');
      _positionTooltip(); // removes 'hidden' and repositions
    }
  }

  // ── Tooltip positioning ──────────────────────────────────────────────────────

  function _positionTooltip() {
    const step   = STEPS[_step];
    const tt     = _tooltip();
    if (!tt) return;

    const anchor = document.getElementById(step.anchor);
    if (!anchor) return;

    const aRect  = anchor.getBoundingClientRect();
    const GAP    = 12;

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
      if (top < 8) { top = aRect.bottom + GAP; arrowSide = 'top'; }
      else          { arrowSide = 'bottom'; }
    } else {
      top = aRect.bottom + GAP;
      if (top + ttH > window.innerHeight - 8) { top = aRect.top - ttH - GAP; arrowSide = 'bottom'; }
      else                                     { arrowSide = 'top'; }
    }

    top  = Math.max(8, Math.min(window.innerHeight - ttH - 8, top));
    left = Math.max(8, Math.min(window.innerWidth  - ttW - 8, left));

    tt.style.left       = left + 'px';
    tt.style.top        = top  + 'px';
    tt.dataset.arrow    = arrowSide;
    tt.style.visibility = 'visible';
  }

  // ── Step rendering ───────────────────────────────────────────────────────────

  function _renderStep() {
    const step  = STEPS[_step];
    const label = _labelEl();
    const msg   = _msgEl();
    const skip  = _skipBtn();
    const tt    = _tooltip();
    if (!tt) return;

    label.textContent = step.label;
    msg.innerHTML     = step.msg;

    tt.querySelectorAll('.tut-finish-btn, .tut-next-btn').forEach(b => b.remove());

    if (step.isFinal) {
      skip.classList.add('hidden');
      const btn = document.createElement('button');
      btn.className   = 'tut-finish-btn btn';
      btn.textContent = '🎉 Terminer le tutoriel';
      btn.addEventListener('click', _endTutorial);
      tt.appendChild(btn);
    } else if (step.isInfo) {
      skip.classList.add('hidden');
      const btn = document.createElement('button');
      btn.className   = 'tut-next-btn btn';
      btn.textContent = 'Suivant →';
      btn.addEventListener('click', _advance);
      tt.appendChild(btn);
    } else {
      skip.classList.remove('hidden');
    }

    // Always un-collapse on a new step so instructions are visible
    const mini = _miniEl();
    if (mini) mini.classList.add('hidden');
    _collapsed = false;
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
    const { allowedSpells } = STEPS[_step];
    document.querySelectorAll('[data-spell-id]').forEach(btn => {
      if (allowedSpells === null) {
        btn.classList.remove('tut-blocked');
        btn.style.removeProperty('pointer-events');
        btn.style.removeProperty('opacity');
      } else {
        const blocked = !allowedSpells.has(btn.dataset.spellId);
        btn.classList.toggle('tut-blocked', blocked);
        btn.style.pointerEvents = blocked ? 'none' : '';
        btn.style.opacity       = blocked ? '0.3'  : '';
      }
    });
  }

  function _reapplyBlockingAfterRender() {
    requestAnimationFrame(_applySpellBlocking);
  }

  // ── Step transitions ─────────────────────────────────────────────────────────

  function _advance() {
    if (!_active) return;
    _step++;
    if (_step >= STEPS.length) { _endTutorial(); return; }
    _renderStep();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function start() {
    _active    = true;
    _ended     = false;
    _collapsed = false;
    _step      = 0;

    const skip = _skipBtn();
    if (skip) skip.addEventListener('click', _endTutorial);

    const hideBtn = _hideBtn();
    if (hideBtn) hideBtn.addEventListener('click', () => _setCollapsed(true));

    const mini = _miniEl();
    if (mini) mini.addEventListener('click', () => _setCollapsed(false));

    _resizeListener = () => {
      if (!_active) return;
      if (_collapsed) _positionMini(); else _positionTooltip();
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
      case 0: if (action === 'move')       _advance(); break;
      case 1: if (action === 'place-bomb') _advance(); break;
      // case 2 (end-turn) handled in onTurnStart
      // case 3 (detonate) handled in onDetonationResult
      case 4: { // Répulseur
        if (action === 'repulseur') {
          const bombMoved = (delta.movements || []).some(
            m => m.type === 'bomb' && m.path && m.path.length > 1
          );
          if (bombMoved) _advance();
          else _showHint('La bombe n\'a pas bougé ! Clique une case <b>à côté</b> de la bombe pour la pousser — pas sur la bombe elle-même.');
        }
        break;
      }
      // cases 5, 6 are isInfo → advance via button
      case 7: // Murs de bombes
        if (action === 'place-bomb' && delta.wallsCreated) _advance();
        break;
      // case 8 (chain detonation) handled in onDetonationResult
    }
  }

  function onTurnStart() {
    if (!_active) return;
    _reapplyBlockingAfterRender();
    if (_step === 2) _advance(); // end-turn completed
  }

  function onDetonationResult(data) {
    if (!_active) return;

    if (_step === 3) { _advance(); return; } // step 4: any detonation

    if (_step === 8) { // step 9: must be a chain
      const totalBlasts = data && Array.isArray(data.sequence)
        ? data.sequence.reduce((s, group) => s + group.length, 0) : 0;
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
