export function isTouchDevice() {
  return (
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );
}

const JOYSTICK_RADIUS = 60;
const DEAD_ZONE = 0.2;

export class MobileControls {
  constructor(controls, game) {
    this.controls = controls;
    this.game = game;
    this.joystickId = null;
    this.joystickStart = { x: 0, y: 0 };
    this.joystickValue = { x: 0, y: 0 };
    this.cameraDragId = null;
    this.cameraDragLast = { x: 0, y: 0 };
    this.activeKeys = new Set();
    this.sprintLocked = false;

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    const root = document.createElement('div');
    root.id = 'mobile-controls';
    root.innerHTML = `
      <div id="mobile-camera-zone"></div>
      <div id="mobile-joystick-zone">
        <div id="mobile-joystick-base">
          <div id="mobile-joystick-knob"></div>
        </div>
      </div>
      <div id="mobile-action-grid">
        <button class="mobile-btn mobile-btn-jump" data-action="jump" type="button">⤴</button>
        <button class="mobile-btn mobile-btn-attack" data-action="attack" type="button">⚔️</button>
        <button class="mobile-btn mobile-btn-interact" data-action="interact" type="button">E</button>
        <button class="mobile-btn mobile-btn-eat" data-action="eat" type="button">🍖</button>
        <button class="mobile-btn mobile-btn-sprint" data-action="sprint" type="button">🏃</button>
        <button class="mobile-btn mobile-btn-character" data-action="character" type="button">👤</button>
        <button class="mobile-btn mobile-btn-weapon" data-weapon="sword" type="button">🗡️</button>
        <button class="mobile-btn mobile-btn-weapon" data-weapon="bow" type="button">🏹</button>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.knob = root.querySelector('#mobile-joystick-knob');
    this.joystickBase = root.querySelector('#mobile-joystick-base');
    this.joystickZone = root.querySelector('#mobile-joystick-zone');
    this.cameraZone = root.querySelector('#mobile-camera-zone');
    this.sprintBtn = root.querySelector('.mobile-btn-sprint');
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

  _press(btn) {
    btn.classList.add('pressed');
    const action = btn.dataset.action;
    const weapon = btn.dataset.weapon;
    if (weapon === 'sword') this.controls.selectedWeapon = 'sword';
    else if (weapon === 'bow') this.controls.selectedWeapon = 'bow';
    else if (action === 'jump') this.controls.jumpQueued = true;
    else if (action === 'attack') this.controls.attackQueued = true;
    else if (action === 'interact') this.controls.interactQueued = true;
    else if (action === 'eat') this.controls.eatQueued = true;
    else if (action === 'character') this.controls.toggleCharacterQueued = true;
    else if (action === 'sprint') {
      this.sprintLocked = !this.sprintLocked;
      if (this.sprintLocked) {
        this.controls.keys.add('shift');
        this.sprintBtn.classList.add('locked');
      } else {
        this.controls.keys.delete('shift');
        this.sprintBtn.classList.remove('locked');
      }
    }
  }

  _release(btn) {
    btn.classList.remove('pressed');
  }

  _joyStart(e) {
    e.preventDefault();
    if (this.joystickId !== null) return;
    const t = e.changedTouches[0];
    this.joystickId = t.identifier;
    const rect = this.joystickBase.getBoundingClientRect();
    this.joystickStart.x = rect.left + rect.width / 2;
    this.joystickStart.y = rect.top + rect.height / 2;
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
        this.joystickValue.x = 0;
        this.joystickValue.y = 0;
        this.knob.style.transform = 'translate(-50%, -50%)';
        this._applyMovement();
        return;
      }
    }
  }

  _updateJoy(x, y) {
    let dx = x - this.joystickStart.x;
    let dy = y - this.joystickStart.y;
    const len = Math.hypot(dx, dy);
    const max = JOYSTICK_RADIUS;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.joystickValue.x = dx / max;
    this.joystickValue.y = dy / max;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this._applyMovement();
  }

  _applyMovement() {
    const { x, y } = this.joystickValue;
    this._setKey('w', y < -DEAD_ZONE);
    this._setKey('s', y > DEAD_ZONE);
    this._setKey('a', x < -DEAD_ZONE);
    this._setKey('d', x > DEAD_ZONE);
  }

  _setKey(key, on) {
    if (on) {
      if (!this.activeKeys.has(key)) {
        this.activeKeys.add(key);
        this.controls.keys.add(key);
      }
    } else if (this.activeKeys.has(key)) {
      this.activeKeys.delete(key);
      this.controls.keys.delete(key);
    }
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
