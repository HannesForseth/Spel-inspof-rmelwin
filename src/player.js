import * as THREE from 'three';

// Färger inspirerade av Melwins koncept-ritning
const SHIRT = 0x4caf50;
const PANTS = 0x6d4c2a;
const SKIN = 0xffdbac;
const HAIR = 0x4e342e;
const AXE_HEAD = 0xb0bec5;
const AXE_HANDLE = 0x8d6e63;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.position = new THREE.Vector3(0, 0, 0);
    this.facing = 0;
    this.walkTime = 0;
    this.chopTime = 0;
    this.isChopping = false;

    this.group = new THREE.Group();

    // Kropp (grön tröja)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.9, 0.45),
      new THREE.MeshStandardMaterial({ color: SHIRT }),
    );
    body.position.y = 1.25;
    body.castShadow = true;
    this.group.add(body);

    // Huvud (hudfärgad box)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: SKIN }),
    );
    head.position.y = 2.0;
    head.castShadow = true;
    this.group.add(head);

    // Hår (brun lock på toppen)
    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.18, 0.65),
      new THREE.MeshStandardMaterial({ color: HAIR }),
    );
    hair.position.y = 2.36;
    this.group.add(hair);

    // Ögon (små mörka boxar på framsidan)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    leftEye.position.set(-0.13, 2.05, 0.31);
    this.group.add(leftEye);
    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    rightEye.position.set(0.13, 2.05, 0.31);
    this.group.add(rightEye);

    // Armar (pivot vid axeln)
    this.leftArmPivot = this._makeLimbPivot(-0.55, 1.65, 0.22, 0.9, 0.3, SKIN);
    this.rightArmPivot = this._makeLimbPivot(0.55, 1.65, 0.22, 0.9, 0.3, SKIN);
    this.group.add(this.leftArmPivot, this.rightArmPivot);

    // Yxa i höger hand (osynlig tills man hugger)
    this.axe = this._makeAxe();
    this.axe.position.set(0, -0.85, 0.25);
    this.axe.rotation.x = -Math.PI / 4;
    this.axe.visible = false;
    this.rightArmPivot.add(this.axe);

    // Ben (pivot vid höften)
    this.leftLegPivot = this._makeLimbPivot(-0.2, 0.8, 0.32, 0.85, 0.38, PANTS);
    this.rightLegPivot = this._makeLimbPivot(0.2, 0.8, 0.32, 0.85, 0.38, PANTS);
    this.group.add(this.leftLegPivot, this.rightLegPivot);

    scene.add(this.group);
  }

  _makeLimbPivot(x, y, w, h, d, color) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  }

  _makeAxe() {
    const axe = new THREE.Group();
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: AXE_HANDLE }),
    );
    axe.add(handle);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.22, 0.08),
      new THREE.MeshStandardMaterial({ color: AXE_HEAD, metalness: 0.6, roughness: 0.4 }),
    );
    head.position.y = 0.32;
    head.position.x = 0.05;
    axe.add(head);
    return axe;
  }

  move(direction, distance) {
    this.position.x += direction.x * distance;
    this.position.z += direction.z * distance;

    const maxR = 95;
    if (Math.abs(this.position.x) > maxR) this.position.x = Math.sign(this.position.x) * maxR;
    if (Math.abs(this.position.z) > maxR) this.position.z = Math.sign(this.position.z) * maxR;

    this.facing = Math.atan2(direction.x, direction.z);
    this.walkTime = (this.walkTime + distance * 6) % (Math.PI * 2);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.facing;

    const swing = Math.sin(this.walkTime) * 0.7;
    this.leftLegPivot.rotation.x = swing;
    this.rightLegPivot.rotation.x = -swing;
    if (!this.isChopping) {
      this.leftArmPivot.rotation.x = -swing * 0.5;
      this.rightArmPivot.rotation.x = swing * 0.5;
    }
  }

  idle(dt) {
    this.leftLegPivot.rotation.x *= 0.85;
    this.rightLegPivot.rotation.x *= 0.85;
    if (!this.isChopping) {
      this.leftArmPivot.rotation.x *= 0.85;
      this.rightArmPivot.rotation.x *= 0.85;
    }
  }

  startChop() {
    this.isChopping = true;
    this.axe.visible = true;
    this.chopTime = 0;
  }

  stopChop() {
    this.isChopping = false;
    this.axe.visible = false;
    this.rightArmPivot.rotation.x = 0;
    this.leftArmPivot.rotation.x = 0;
  }

  updateChop(dt) {
    if (!this.isChopping) return;
    this.chopTime += dt * 6;
    // Höj och sänk yxan
    const swing = (Math.sin(this.chopTime) + 1) * 0.5; // 0..1
    this.rightArmPivot.rotation.x = -swing * 1.6;
    this.leftArmPivot.rotation.x = -swing * 0.8;
  }
}
