import * as THREE from 'three';

export class Controls {
  constructor() {
    this.keys = new Set();

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
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
    return this.isDown('e');
  }

  // Returnerar en världsriktning (x, z) baserad på vart kameran tittar
  getMovementVector(cameraAngle) {
    let x = 0;
    let z = 0;
    if (this.isDown('w') || this.isDown('arrowup')) z -= 1;
    if (this.isDown('s') || this.isDown('arrowdown')) z += 1;
    if (this.isDown('a') || this.isDown('arrowleft')) x -= 1;
    if (this.isDown('d') || this.isDown('arrowright')) x += 1;

    if (x === 0 && z === 0) return new THREE.Vector3(0, 0, 0);

    const len = Math.sqrt(x * x + z * z);
    x /= len;
    z /= len;

    const sin = Math.sin(cameraAngle);
    const cos = Math.cos(cameraAngle);
    return new THREE.Vector3(x * cos + z * sin, 0, -x * sin + z * cos);
  }
}
