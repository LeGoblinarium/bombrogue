/**
 * Tutorial — state machine for the interactive solo tutorial.
 *
 * 6 steps:
 *   1. Move to a blue cell
 *   2. Select Bomb and place a bomb
 *   3. End your turn
 *   4. Detonate the bomb
 *   5. Use Répulseur and make a bomb move (path.length > 1)
 *   6. Zone info + Finish button
 *
 * Public API:
 *   Tutorial.start(initialState)
 *   Tutorial.isActive()
 *   Tutorial.onStateUpdate(delta)
 *   Tutorial.onTurnStart(data)
 *   Tutorial.onDetonationResult()
 */
const Tutorial = (() => {
  let _active = false;
  let _step = 0;           // 0-based index into STEPS
  let _hintTimer = null;
  let _resizeListener = null;

  // Spell IDs allowed at each step (null = all blocked; undefined = none blocked)
  // Values: Set of allowed spell IDs, or null to block all.
  const STEPS = [
    {
      label: 'Étape 1 / 6',
      msg: 'Clique sur une case de la grille pour te déplacer. Les cases accessibles s\'affichent en bleu.',
      allowedSpells: new Set(), // block all spells, movement only
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 2 / 6',
      msg: 'Sélectionne <b>💣 Bombe</b> dans la barre du bas, puis clique une case libre à portée pour la poser.',
      allowedSpells: new Set(['place-bomb']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 3 / 6',
      msg: 'Clique sur <b>⏭ Fin tour</b> pour terminer ton tour.',
      allowedSpells: new Set(['end-turn']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 4 / 6',
      msg: 'Sélectionne <b>💥 Détoner</b>, puis clique sur la bombe pour la faire exploser.',
      allowedSpells: new Set(['detonate']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 5 / 6',
      msg: 'Pose une nouvelle bombe, puis sélectionne <b>↔ Répulseur</b> et clique sur <b>une case à côté de la bombe</b> pour la pousser. Ne clique pas sur la bombe elle-même !',
      allowedSpells: new Set(['place-bomb', 'repulseur', 'end-turn']),
      anchor: 'spell-bar',
      arrowSide: 'bottom',
    },
    {
      label: 'Étape 6 / 6',
      msg: 'La <b>zone de danger</b> rétrécit la grille toutes les 2 cycles. Les cases hors zone infligent des dégâts. Tu connais maintenant les bases !',
      allowedSpells: null, // no blocking at final step
      anchor: 'spell-bar',
      arrowSide: 'bottom',
      isFinal: true,
    },
  ];

  // ── DOM helpers ──────────────────────────────────────────────────────────────

  function _tooltip()   { return document.getElementById('tutorial-tooltip'); }
  function _labelEl()   { return document.getElementById('tut-step-label'); }
  function _msgEl()     { return document.getElementById('tut-message'); }
  function _skipBtn()   { return document.getElementById('tut-skip'); }

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
      // Tooltip above the anchor → arrow points down
      top = aRect.top - ttH - GAP;
      if (top < 8) {
        // Flip below
        top = aRect.bottom + GAP;
        arrowSide = 'top';
      } else {
        arrowSide = 'bottom';
      }
    } else {
      // Tooltip below the anchor → arrow points up
      top = aRect.bottom + GAP;
      if (top + ttH > window.innerHeight - 8) {
        top = aRect.top - ttH - GAP;
        arrowSide = 'bottom';
      } else {
        arrowSide = 'top';
      }
    }

    // Clamp to viewport so tooltip never goes off-screen
    top  = Math.max(8, Math.min(window.innerHeight - ttH - 8, top));
    left = Math.max(8, Math.min(window.innerWidth  - ttW - 8, left));

    tt.style.left = left + 'px';
    tt.style.top  = top  + 'px';
    tt.dataset.arrow = arrowSide;
    tt.style.visibility = 'visible';
  }

  function _renderStep() {
    const step = STEPS[_step];
    const label = _labelEl();
    const msg   = _msgEl();
    const skip  = _skipBtn();
    const tt    = _tooltip();

    if (!tt) return;

    label.textContent = step.label;
    msg.innerHTML     = step.msg;

    // Remove any previous finish button
    const prevFinish = tt.querySelector('.tut-finish-btn');
    if (prevFinish) prevFinish.remove();

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
      // Final step — unblock everything
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
    // renderSpellBar destroys buttons — re-apply on next frame
    requestAnimationFrame(_applySpellBlocking);
  }

  // ── Step transitions ─────────────────────────────────────────────────────────

  function _advance() {
    if (!_active) return;
    _step++;
    if (_step >= STEPS.length) {
      _endTutorial();
      return;
    }
    _renderStep();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function start(/* initialState */) {
    _active = true;
    _step   = 0;

    const skip = _skipBtn();
    if (skip) skip.addEventListener('click', _endTutorial);

    // Reposition on resize
    _resizeListener = () => { if (_active) _positionTooltip(); };
    window.addEventListener('resize', _resizeListener);

    _renderStep();
  }

  function isActive() {
    return _active;
  }

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

      // Step 2 (end-turn) is handled in onTurnStart — server sends turn-start
      // after the turn ends, which is our signal that end-turn succeeded.

      case 3:
        // Detonate step — handled in onDetonationResult
        break;

      case 4: {
        // Répulseur step: verify a bomb actually moved
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
    }
  }

  function onTurnStart(/* data */) {
    if (!_active) return;
    _reapplyBlockingAfterRender();

    // Step 2: waiting for the player to press "End turn".
    // A turn-start event means the server started a new turn → our end-turn worked.
    if (_step === 2) _advance();
  }

  function onDetonationResult() {
    if (!_active) return;
    // Step 3: detonation confirmed
    if (_step === 3) _advance();
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  function _endTutorial() {
    if (!_active) return;
    _active = false;

    clearTimeout(_hintTimer);
    if (_resizeListener) {
      window.removeEventListener('resize', _resizeListener);
      _resizeListener = null;
    }

    // Unblock all spells
    document.querySelectorAll('[data-spell-id]').forEach(btn => {
      btn.classList.remove('tut-blocked');
      btn.style.removeProperty('pointer-events');
      btn.style.removeProperty('opacity');
    });

    // Hide the tooltip
    const tt = _tooltip();
    if (tt) tt.classList.add('hidden');

    // Leave the tutorial room and return to lobby
    Socket.emit('leave-room');
    UI.showScreen('screen-lobby');
    Socket.emit('list-rooms');
  }

  return { start, isActive, onStateUpdate, onTurnStart, onDetonationResult };
})();
