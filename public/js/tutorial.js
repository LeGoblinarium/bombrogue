/**
 * Tutorial — state machine for the interactive solo tutorial.
 *
 * 12 steps (all interactive):
 *   0.  Move
 *   1.  Place a bomb
 *   2.  End turn
 *   3.  Detonate
 *   4.  Répulseur (push a bomb)
 *   5.  Aimant (attract a bomb)
 *   6.  Rappel (send bomb back)
 *   7.  Substitution (swap with bomb)
 *   8.  Expulsion (push everything adjacent)
 *   9.  Create a bomb wall
 *   10. Chain detonation
 *   11. Final congratulations
 *
 * Public API:
 *   Tutorial.start()   Tutorial.isActive()   Tutorial.hasEnded()
 *   Tutorial.onStateUpdate(delta)
 *   Tutorial.onTurnStart()
 *   Tutorial.onDetonationResult(data)
 */
const Tutorial = (() => {
  let _active    = false;
  let _ended     = false;
  let _collapsed = false;
  let _step      = 0;
  let _hintTimer = null;
  let _resizeListener = null;

  const STEPS = [
    /* 0 */ {
      label: 'Étape 1 / 12 — Déplacement',
      msg: '🔵 Les cases bleues sont accessibles. <b>Clique une case bleue</b> pour afficher le chemin, puis <b>reclique la même case</b> pour confirmer le déplacement.',
      allowedSpells: new Set(),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 1 */ {
      label: 'Étape 2 / 12 — Poser une bombe',
      msg: 'Clique <b>💣 Bombe</b>, puis <b>clique une case</b> à portée pour la sélectionner, et <b>reclique-la</b> pour poser la bombe.',
      allowedSpells: new Set(['place-bomb']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 2 */ {
      label: 'Étape 3 / 12 — Fin de tour',
      msg: 'Clique <b>⏭ Fin tour</b> pour passer au tour suivant.',
      allowedSpells: new Set(['end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 3 */ {
      label: 'Étape 4 / 12 — Détonation',
      msg: 'Clique <b>💥 Détoner</b>, puis <b>clique la bombe</b> pour la sélectionner, et <b>reclique-la</b> pour l\'exploser.',
      allowedSpells: new Set(['detonate']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 4 */ {
      label: 'Étape 5 / 12 — Répulseur',
      msg: 'Pose d\'abord une bombe (💣). Puis clique <b>↔ Répuls.</b> et vise <b>une case à côté de la bombe</b> (pas la bombe elle-même !) pour la pousser.',
      allowedSpells: new Set(['place-bomb', 'repulseur', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 5 */ {
      label: 'Étape 6 / 12 — Aimant',
      msg: '🧲 L\'<b>Aimant</b> attire les bombes et les joueurs vers la case ciblée sur les axes cardinaux.<br><br>Pose une bombe (💣) si ce n\'est pas déjà fait, puis clique <b>🧲 Aimant</b> et cible une case pour attirer la bombe vers toi.',
      allowedSpells: new Set(['place-bomb', 'aimant', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 6 */ {
      label: 'Étape 7 / 12 — Rappel',
      msg: '↩ Le <b>Rappel</b> téléporte une bombe à sa <b>position précédente</b> — idéal pour retourner une bombe ennemie contre son propriétaire.<br><br>La bombe que tu viens d\'attirer a une position mémorisée. Clique <b>↩ Rappel</b> puis <b>clique cette bombe</b> pour la ramener en arrière.',
      allowedSpells: new Set(['rappel', 'place-bomb', 'repulseur', 'aimant', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 7 */ {
      label: 'Étape 8 / 12 — Substitution',
      msg: '🔀 La <b>Substitution</b> échange ta position avec <b>une de tes propres bombes</b> — parfait pour fuir ou te repositionner en un éclair.<br><br>Pose une bombe (💣) si besoin, puis clique <b>🔀 Substit.</b> et clique la bombe pour échanger vos positions.',
      allowedSpells: new Set(['place-bomb', 'substitution', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 8 */ {
      label: 'Étape 9 / 12 — Expulsion',
      msg: '💨 L\'<b>Expulsion</b> repousse <b>tout ce qui est adjacent</b> de 5 cases dans la direction opposée à toi. Aucune cible nécessaire.<br><br>Clique <b>💨 Expuls.</b> puis <b>clique sur ton propre personnage</b> pour déclencher.',
      allowedSpells: new Set(['expulsion', 'place-bomb', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 9 */ {
      label: 'Étape 10 / 12 — Murs de bombes',
      msg: '💥 Deux bombes <b>alignées</b> (H ou V) à moins de 6 cases d\'écart créent un <b>mur de dégâts</b> entre elles : 15 dmg pour 2 bombes, 25 dmg pour 3+.<br><br>⏳ Les bombes <b>vieillissent</b> chaque cycle (+20 % de dégâts, jusqu\'à ×1,8).<br><br>Pose des bombes alignées pour <b>créer un mur</b> !',
      allowedSpells: new Set(['place-bomb', 'detonate', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 10 */ {
      label: 'Étape 11 / 12 — Réaction en chaîne',
      msg: '🔗 Détoner une bombe connectée à d\'autres par un mur fait <b>exploser toutes les bombes du mur</b> en même temps !<br><br>Les bombes de l\'étape précédente sont toujours là. <b>Détone-en une</b> pour déclencher la réaction.',
      allowedSpells: new Set(['place-bomb', 'detonate', 'end-turn']),
      anchor: 'spell-bar', arrowSide: 'bottom',
    },
    /* 11 */ {
      label: 'Étape 12 / 12',
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

    let left = aRect.left + aRect.width / 2 - mW / 2;
    left = Math.max(8, Math.min(window.innerWidth - mW - 8, left));
    const top = Math.max(8, aRect.top - mH - 8);

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
      _positionTooltip();
    }
  }

  // ── Tooltip positioning ──────────────────────────────────────────────────────

  function _positionTooltip() {
    const step   = STEPS[_step];
    const tt     = _tooltip();
    if (!tt) return;

    const anchor = document.getElementById(step.anchor);
    if (!anchor) return;

    const aRect = anchor.getBoundingClientRect();
    const GAP   = 12;

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
      else         { arrowSide = 'bottom'; }
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

    tt.querySelectorAll('.tut-finish-btn').forEach(b => b.remove());

    if (step.isFinal) {
      skip.classList.add('hidden');
      const btn = document.createElement('button');
      btn.className   = 'tut-finish-btn btn';
      btn.textContent = '🎉 Terminer le tutoriel';
      btn.addEventListener('click', _endTutorial);
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
      case 0:  if (action === 'move')         _advance(); break;
      case 1:  if (action === 'place-bomb')   _advance(); break;
      // case 2: end-turn → onTurnStart
      // case 3: detonate → onDetonationResult
      case 4: { // Répulseur
        if (action === 'repulseur') {
          const bombMoved = (delta.movements || []).some(
            m => m.type === 'bomb' && m.path && m.path.length > 1
          );
          if (bombMoved) _advance();
          else _showHint('La bombe n\'a pas bougé ! Vise une case <b>à côté</b> de la bombe, pas sur la bombe elle-même.');
        }
        break;
      }
      case 5: { // Aimant
        if (action === 'aimant') {
          const bombMoved = (delta.movements || []).some(
            m => m.type === 'bomb' && m.path && m.path.length > 1
          );
          if (bombMoved) _advance();
          else _showHint('La bombe n\'a pas bougé ! Cible une case <b>entre toi et la bombe</b> pour l\'attirer vers toi — pas directement sur la bombe.');
        }
        break;
      }
      case 6:  if (action === 'rappel')       _advance(); break;
      case 7:  if (action === 'substitution') _advance(); break;
      case 8:  if (action === 'expulsion')    _advance(); break;
      case 9:  // Murs de bombes
        if (action === 'place-bomb' && delta.wallsCreated) _advance();
        break;
      // case 10: chain detonation → onDetonationResult
    }
  }

  function onTurnStart() {
    if (!_active) return;
    _reapplyBlockingAfterRender();
    if (_step === 2) _advance();
  }

  function onDetonationResult(data) {
    if (!_active) return;

    if (_step === 3) { _advance(); return; } // step 4: any detonation

    if (_step === 10) { // step 11: chain required
      const totalBlasts = data && Array.isArray(data.sequence)
        ? data.sequence.reduce((s, group) => s + group.length, 0) : 0;
      if (totalBlasts > 1) {
        _advance();
      } else {
        _showHint('Pas de réaction en chaîne ! Les bombes doivent être <b>reliées par un mur</b> — place-en deux alignées puis détone-en une.');
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
