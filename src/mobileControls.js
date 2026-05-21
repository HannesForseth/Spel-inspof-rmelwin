export function isTouchDevice() {
  return (
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );
}

export function vibrate(pattern) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }
}

export function requestFullscreen() {
  const el = document.documentElement;
  const fn =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.msRequestFullscreen;
  if (fn) fn.call(el).catch(() => {});
  if (screen.orientation?.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}

export function exitFullscreen() {
  const fn =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.msExitFullscreen;
  if (fn) fn.call(document).catch(() => {});
}

export function isFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

const JOYSTICK_RADIUS = 70;
const RUN_THRESHOLD = 0.85;
const ATTACK_REPEAT_MS = 350;

export class MobileControls {
  constructor(controls, game) {
    this.controls = controls;
    this.game = game;
    this.joystickId = null;
    this.joystickOrigin = { x: 0, y: 0 };
    this.cameraDragId = null;
    this.cameraDragLast = { x: 0, y: 0 };
    this.attackHoldTimer = null;

    this._buildDOM();
    this._bindEvents();
    this._bindFullscreenChanges();
  }

  _buildDOM() {
    const root = document.createElement('div');
    root.id = 'mobile-controls';
    root.innerHTML = `
      <button id="mobile-fullscreen" class="mobile-corner-btn" type="button" aria-label="Fullscreen">⛶</button>
      <div id="mobile-camera-zone"></div>
      <div id="mobile-joystick-zone">
        <div id="mobile-joystick-base" class="hidden">
          <div id="mobile-joystick-knob"></div>
          <div id="mobile-joystick-ring"></div>
        </div>
      </div>
      <div id="mobile-action-grid">
        <button class="mobile-btn mobile-btn-character" data-action="character" type="button" aria-label="Karaktär">👤</button>
        <button class="mobile-btn mobile-btn-eat" data-action="eat" type="button" aria-label="Ät">🍖</button>
        <button class="mobile-btn mobile-btn-weapon" data-weapon="sword" type="button" aria-label="Svärd">🗡️</button>
        <button class="mobile-btn mobile-btn-weapon" data-weapon="bow" type="button" aria-label="Båge">🏹</button>
        <button class="mobile-btn mobile-btn-interact" data-action="interact" type="button" aria-label="Interagera/Hugg">E</button>
        <button class="mobile-btn mobile-btn-jump" data-action="jump" type="button" aria-label="Hopp">⤴</button>
        <button class="mobile-btn mobile-btn-attack" data-action="attack" type="button" aria-label="Attack">⚔️</button>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.knob = root.querySelector('#mobile-joystick-knob');
    this.joystickBase = root.querySelector('#mobile-joystick-base');
    this.joystickZone = root.querySelector('#mobile-joystick-zone');
    this.cameraZone = root.querySelector('#mobile-camera-zone');
    this.fullscreenBtn = root.querySelector('#mobile-fullscreen');
  }

  _bindEvents() {
    this.joystickZone.addEventListener('touchstart', (e) => this._joyStart(e), { passive: false });
    this.joystickZone.addEventListener('touchmove', (e) => this._joyMove(e), { passive: false });
    this.joystickZone.addEventListener('touchend', (e) => this._joyEnd(e), { passive: false });
    this.joystickZone.addEventListener('touchcancel', (e) => this._joyEnd(e), { passive: false });

    this.cameraZone.addEventListener('touchstart', (e) => this._camStart(e), { passive: false });
    this.cameraZone.addEventListener('touchmove', (e) => this._camMove(e), { passive: false });
    this.cameraZone.addEventListener('touchend', (e) => this._camEnd(e), { passive: false });
    this.cameraZone.addEventListener('touchcancel', (e) => this._camEnd(e), { passive: false });

    this.fullscreenBtn.addEventListener('click', () => {
      if (isFullscreen()) exitFullscreen();
      else requestFullscreen();
    });

    for (const btn of this.root.querySelectorAll('.mobile-btn')) {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._press(btn);
      }, { passive: false });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this._release(btn);
      }, { passive: false });
      btn.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        this._release(btn);
      }, { passive: false });
    }

    document.body.classList.add('is-mobile');
  }

  _bindFullscreenChanges() {
    const update = () => {
      this.fullscreenBtn.textContent = isFullscreen() ? '⛶' : '⛶';
      this.fullscreenBtn.classList.toggle('active', isFullscreen());
    };
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
  }

  _press(btn) {
    btn.classList.add('pressed');
    const action = btn.dataset.action;
    const weapon = btn.dataset.weapon;
    if (weapon === 'sword') {
      this.controls.selectedWeapon = 'sword';
      vibrate(15);
    } else if (weapon === 'bow') {
      this.controls.selectedWeapon = 'bow';
      vibrate(15);
    } else if (action === 'jump') {
      this.controls.jumpQueued = true;
      vibrate(20);
    } else if (action === 'attack') {
      this.controls.attackQueued = true;
      this.controls.virtualAttackHeld = true;
      vibrate(25);
      if (this.attackHoldTimer) clearInterval(this.attackHoldTimer);
      this.attackHoldTimer = setInterval(() => {
        this.controls.attackQueued = true;
        vibrate(15);
      }, ATTACK_REPEAT_MS);
    } else if (action === 'interact') {
      this.controls.interactQueued = true;
      this.controls.virtualInteractHeld = true;
      vibrate(20);
    } else if (action === 'eat') {
      this.controls.eatQueued = true;
      vibrate(30);
    } else if (action === 'character') {
      this.controls.toggleCharacterQueued = true;
      vibrate(15);
    }
  }

  _release(btn) {
    btn.classList.remove('pressed');
    const action = btn.dataset.action;
    if (action === 'attack') {
      this.controls.virtualAttackHeld = false;
      if (this.attackHoldTimer) {
        clearInterval(this.attackHoldTimer);
        this.attackHoldTimer = null;
      }
    } else if (action === 'interact') {
      this.controls.virtualInteractHeld = false;
    }
  }

  _joyStart(e) {
    e.preventDefault();
    if (this.joystickId !== null) return;
    const t = e.changedTouches[0];
    this.joystickId = t.identifier;
    this.joystickOrigin.x = t.clientX;
    this.joystickOrigin.y = t.clientY;
    this.joystickBase.style.left = `${t.clientX}px`;
    this.joystickBase.style.top = `${t.clientY}px`;
    this.joystickBase.classList.remove('hidden');
    this._updateJoy(t.clientX, t.clientY);
  }

  _joyMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joystickId) {
        this._updateJoy(t.clientX, t.clientY);
        return;
      }
    }
  }

  _joyEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joystickId) {
        this.joystickId = null;
        this.controls.virtualAxis.x = 0;
        this.controls.virtualAxis.z = 0;
        this.controls.virtualAxis.magnitude = 0;
        this.controls.virtualRun = false;
        this.joystickBase.classList.add('hidden');
        this.knob.style.transform = 'translate(-50%, -50%)';
        return;
      }
    }
  }

  _updateJoy(x, y) {
    let dx = x - this.joystickOrigin.x;
    let dy = y - this.joystickOrigin.y;
    const len = Math.hypot(dx, dy);
    const max = JOYSTICK_RADIUS;
    let magnitude = Math.min(len / max, 1);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const ax = magnitude > 0 ? (dx / max) : 0;
    const az = magnitude > 0 ? (dy / max) : 0;
    this.controls.virtualAxis.x = ax;
    this.controls.virtualAxis.z = az;
    this.controls.virtualAxis.magnitude = magnitude;
    this.controls.virtualRun = magnitude > RUN_THRESHOLD;
  }

  _camStart(e) {
    e.preventDefault();
    if (this.cameraDragId !== null) return;
    const t = e.changedTouches[0];
    this.cameraDragId = t.identifier;
    this.cameraDragLast.x = t.clientX;
    this.cameraDragLast.y = t.clientY;
  }

  _camMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.cameraDragId) {
        const dx = t.clientX - this.cameraDragLast.x;
        this.cameraDragLast.x = t.clientX;
        this.cameraDragLast.y = t.clientY;
        if (this.game && typeof this.game.cameraAngle === 'number') {
          this.game.cameraAngle -= dx * 0.008;
        }
        return;
      }
    }
  }

  _camEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.cameraDragId) {
        this.cameraDragId = null;
        return;
      }
    }
  }
}
