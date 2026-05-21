import * as THREE from 'three';

export class Controls {
  constructor() {
    this.keys = new Set();
    this.jumpQueued = false;
    this.attackQueued = false;
    this.eatQueued = false;
    this.interactQueued = false; // E-tryck (en gång per nedtryckning)
    this.toggleCharacterQueued = false;
    this.selectedWeapon = null; // 'sword' | 'bow' | null

    // Virtuell axis (för mobil joystick). x/z -1..1, magnitude 0..1
    this.virtualAxis = { x: 0, z: 0, magnitude: 0 };
    this.virtualRun = false;
    this.virtualInteractHeld = false;
    this.virtualAttackHeld = false;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      // Förhindra att mellanslag scrollar sidan
      if (e.key === ' ') e.preventDefault();

      // Engångsknappar (registreras vid tryck, inte hålls)
      if (!this.keys.has(k)) {
        if (e.key === ' ') this.jumpQueued = true;
        if (k === 'f') this.attackQueued = true;
        if (k === 'h') this.eatQueued = true;
        if (k === 'e') this.interactQueued = true;
        if (k === 'c') this.toggleCharacterQueued = true;
        if (k === '1') this.selectedWeapon = 'sword';
        if (k === '2') this.selectedWeapon = 'bow';
      }

      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  isDown(key) {
    return this.keys.has(key.toLowerCase());
  }

  isInteractPressed() {
    return this.isDown('e') || this.virtualInteractHeld;
  }

  isRunning() {
    return this.isDown('shift') || this.virtualRun;
  }

  consumeJump() {
    if (this.jumpQueued) {
      this.jumpQueued = false;
      return true;
    }
    return false;
  }

  consumeAttack() {
    if (this.attackQueued) {
      this.attackQueued = false;
      return true;
    }
    return false;
  }

  consumeEat() {
    if (this.eatQueued) {
      this.eatQueued = false;
      return true;
    }
    return false;
  }

  consumeInteractPress() {
    if (this.interactQueued) {
      this.interactQueued = false;
      return true;
    }
    return false;
  }

  consumeToggleCharacter() {
    if (this.toggleCharacterQueued) {
      this.toggleCharacterQueued = false;
      return true;
    }
    return false;
  }

  getMovementVector(cameraAngle) {
    let x = 0;
    let z = 0;

    if (this.virtualAxis.magnitude > 0.05) {
      x = this.virtualAxis.x;
      z = this.virtualAxis.z;
    } else {
      if (this.isDown('w') || this.isDown('arrowup')) z -= 1;
      if (this.isDown('s') || this.isDown('arrowdown')) z += 1;
      if (this.isDown('a') || this.isDown('arrowleft')) x -= 1;
      if (this.isDown('d') || this.isDown('arrowright')) x += 1;

      const len = Math.sqrt(x * x + z * z);
      if (len > 1) {
        x /= len;
        z /= len;
      }
    }

    if (x === 0 && z === 0) return new THREE.Vector3(0, 0, 0);

    const sin = Math.sin(cameraAngle);
    const cos = Math.cos(cameraAngle);
    return new THREE.Vector3(x * cos + z * sin, 0, -x * sin + z * cos);
  }
}
