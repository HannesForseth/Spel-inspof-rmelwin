import * as THREE from 'three';

// Färger inspirerade av Melwins koncept-ritning
const SHIRT = 0x4caf50;
const PANTS = 0x6d4c2a;
const SKIN = 0xffdbac;
const HAIR = 0x4e342e;
const AXE_HEAD = 0xb0bec5;
const AXE_HANDLE = 0x8d6e63;
const SWORD_BLADE = 0xe0e0e0;
const SWORD_GUARD = 0xffc107;
const BOW_WOOD = 0x6d4c2a;
const BOW_STRING = 0xfafafa;

const GRAVITY = 22;
const JUMP_VELOCITY = 8;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.position = new THREE.Vector3(0, 0, 0);
    this.facing = 0;
    this.walkTime = 0;
    this.chopTime = 0;
    this.isChopping = false;
    this.swingTime = 0; // för svärds-/pil-animation
    this.swinging = false;

    // Hälsa
    this.maxHp = 100;
    this.hp = 100;
    this.invulnTimer = 0;

    // Hopp / fysik
    this.yVel = 0;
    this.onGround = true;

    // Aktivt vapen ('sword' | 'bow' | null)
    this.activeWeapon = null;

    this.group = new THREE.Group();

    // Kropp (grön tröja)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.9, 0.45),
      new THREE.MeshStandardMaterial({ color: SHIRT }),
    );
    body.position.y = 1.25;
    body.castShadow = true;
    this.group.add(body);

    // Huvud
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: SKIN }),
    );
    head.position.y = 2.0;
    head.castShadow = true;
    this.group.add(head);

    // Hår
    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.18, 0.65),
      new THREE.MeshStandardMaterial({ color: HAIR }),
    );
    hair.position.y = 2.36;
    this.group.add(hair);

    // Ögon
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    le.position.set(-0.13, 2.05, 0.31);
    this.group.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    re.position.set(0.13, 2.05, 0.31);
    this.group.add(re);

    // Armar (pivot vid axel, arm hänger ned i -y)
    this.leftArmPivot = this._makeLimbPivot(-0.55, 1.65, 0.22, 0.9, 0.3, SKIN);
    this.rightArmPivot = this._makeLimbPivot(0.55, 1.65, 0.22, 0.9, 0.3, SKIN);
    this.group.add(this.leftArmPivot, this.rightArmPivot);

    // Verktyg/vapen i händer
    this.axe = this._makeAxe();
    this.rightArmPivot.add(this.axe);
    this.axe.visible = false;

    this.sword = this._makeSword();
    this.rightArmPivot.add(this.sword);
    this.sword.visible = false;

    this.bow = this._makeBow();
    this.leftArmPivot.add(this.bow);
    this.bow.visible = false;

    // Ben (pivot vid höft)
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

  // Yxa: vertikalt skaft, huvud högst upp med eggen som pekar FRAMÅT (+z)
  _makeAxe() {
    const axe = new THREE.Group();

    // Skaft (från grepp y=0 upp till y=0.75)
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.75, 8),
      new THREE.MeshStandardMaterial({ color: AXE_HANDLE }),
    );
    handle.position.y = 0.38;
    handle.castShadow = true;
    axe.add(handle);

    // Huvud: tunn skiva som sticker framåt i z (rätt riktning för hugg)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.28, 0.4),
      new THREE.MeshStandardMaterial({ color: AXE_HEAD, metalness: 0.6, roughness: 0.4 }),
    );
    head.position.set(0, 0.7, 0.12);
    head.castShadow = true;
    axe.add(head);

    // Lite av skaftet sticker upp genom huvudet
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8),
      new THREE.MeshStandardMaterial({ color: AXE_HANDLE }),
    );
    cap.position.y = 0.78;
    axe.add(cap);

    // Placera i höger hand (handen är i botten av armen, y=-0.85 i armens lokala system)
    // Roterar lite framåt (+x) så det ser ut som ett vilo-grepp
    axe.position.set(0, -0.85, 0);
    axe.rotation.x = Math.PI / 8;
    return axe;
  }

  // Svärd: vertikalt blad, parerstång + grepp
  _makeSword() {
    const sword = new THREE.Group();

    // Grepp
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: 0x3e2723 }),
    );
    grip.position.y = 0.11;
    sword.add(grip);

    // Parerstång (kors)
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.07, 0.12),
      new THREE.MeshStandardMaterial({ color: SWORD_GUARD, metalness: 0.7, roughness: 0.3 }),
    );
    guard.position.y = 0.26;
    sword.add(guard);

    // Blad - smalt, framåtriktat
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.9, 0.04),
      new THREE.MeshStandardMaterial({ color: SWORD_BLADE, metalness: 0.85, roughness: 0.15 }),
    );
    blade.position.y = 0.76;
    blade.castShadow = true;
    sword.add(blade);

    // Spets
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.085, 0.18, 4),
      new THREE.MeshStandardMaterial({ color: SWORD_BLADE, metalness: 0.85, roughness: 0.15 }),
    );
    tip.position.y = 1.3;
    sword.add(tip);

    sword.position.set(0, -0.85, 0);
    sword.rotation.x = Math.PI / 8;
    return sword;
  }

  // Pilbåge: krökt båge + senstring
  _makeBow() {
    const bow = new THREE.Group();

    const woodMat = new THREE.MeshStandardMaterial({ color: BOW_WOOD });
    // Båge i tre delar för en böjd form
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), woodMat);
    top.position.set(0, 0.32, -0.05);
    top.rotation.x = -0.3;
    bow.add(top);

    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), woodMat);
    bottom.position.set(0, -0.32, -0.05);
    bottom.rotation.x = 0.3;
    bow.add(bottom);

    const middle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), woodMat);
    bow.add(middle);

    // Sträng
    const string = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 1.1, 4),
      new THREE.MeshStandardMaterial({ color: BOW_STRING }),
    );
    string.position.z = 0.1;
    bow.add(string);

    bow.position.set(0, -0.85, 0);
    bow.rotation.z = Math.PI / 2; // horisontellt grepp
    return bow;
  }

  setActiveWeapon(weapon) {
    this.activeWeapon = weapon;
    this.sword.visible = weapon === 'sword' && !this.isChopping;
    this.bow.visible = weapon === 'bow' && !this.isChopping;
  }

  move(direction, distance) {
    this.position.x += direction.x * distance;
    this.position.z += direction.z * distance;

    const maxR = 95;
    if (Math.abs(this.position.x) > maxR) this.position.x = Math.sign(this.position.x) * maxR;
    if (Math.abs(this.position.z) > maxR) this.position.z = Math.sign(this.position.z) * maxR;

    this.facing = Math.atan2(direction.x, direction.z);
    this.walkTime = (this.walkTime + distance * 6) % (Math.PI * 2);

    this.group.position.x = this.position.x;
    this.group.position.z = this.position.z;
    this.group.rotation.y = this.facing;

    const swing = Math.sin(this.walkTime) * 0.7;
    this.leftLegPivot.rotation.x = swing;
    this.rightLegPivot.rotation.x = -swing;
    if (!this.isChopping && !this.swinging) {
      this.leftArmPivot.rotation.x = -swing * 0.5;
      this.rightArmPivot.rotation.x = swing * 0.5;
    }
  }

  idle(dt) {
    this.leftLegPivot.rotation.x *= 0.85;
    this.rightLegPivot.rotation.x *= 0.85;
    if (!this.isChopping && !this.swinging) {
      this.leftArmPivot.rotation.x *= 0.85;
      this.rightArmPivot.rotation.x *= 0.85;
    }
  }

  tryJump() {
    if (this.onGround) {
      this.yVel = JUMP_VELOCITY;
      this.onGround = false;
    }
  }

  updatePhysics(dt) {
    if (!this.onGround) {
      this.yVel -= GRAVITY * dt;
      this.position.y += this.yVel * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.yVel = 0;
        this.onGround = true;
      }
    }
    this.group.position.y = this.position.y;

    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      // blinka när skadad
      this.group.visible = Math.floor(this.invulnTimer * 12) % 2 === 0;
    } else {
      this.group.visible = true;
    }
  }

  startChop() {
    this.isChopping = true;
    this.axe.visible = true;
    this.sword.visible = false;
    this.bow.visible = false;
    this.chopTime = 0;
  }

  stopChop() {
    this.isChopping = false;
    this.axe.visible = false;
    this.rightArmPivot.rotation.x = 0;
    this.leftArmPivot.rotation.x = 0;
    // återställ vapenvy
    this.setActiveWeapon(this.activeWeapon);
  }

  updateChop(dt) {
    if (!this.isChopping) return;
    this.chopTime += dt * 6;
    // Höj och hugg
    const swing = (Math.sin(this.chopTime) + 1) * 0.5;
    this.rightArmPivot.rotation.x = -swing * 1.4 - 0.2;
    this.leftArmPivot.rotation.x = -swing * 0.6;
  }

  // Animera svärds-/pilskott
  startSwing() {
    this.swinging = true;
    this.swingTime = 0;
  }

  updateSwing(dt) {
    if (!this.swinging) return;
    this.swingTime += dt;
    const t = this.swingTime / 0.4; // 0.4s total animation
    if (this.activeWeapon === 'sword') {
      // Hugg från sida till sida
      const phase = Math.sin(t * Math.PI);
      this.rightArmPivot.rotation.z = -phase * 1.2;
      this.rightArmPivot.rotation.x = -phase * 0.8;
    } else if (this.activeWeapon === 'bow') {
      // Sikta + skjut
      const phase = Math.min(t, 1);
      this.leftArmPivot.rotation.x = -1.5 + phase * 0.2;
      this.rightArmPivot.rotation.x = -1.3 + phase * 0.15;
    }
    if (t >= 1) {
      this.swinging = false;
      this.rightArmPivot.rotation.z = 0;
      this.rightArmPivot.rotation.x = 0;
      this.leftArmPivot.rotation.x = 0;
    }
  }

  takeDamage(amount) {
    if (this.invulnTimer > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = 0.8;
    return true;
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  isAlive() {
    return this.hp > 0;
  }

  respawn() {
    this.hp = this.maxHp;
    this.position.set(0, 0, 0);
    this.yVel = 0;
    this.onGround = true;
    this.group.position.copy(this.position);
    this.invulnTimer = 1.5;
  }
}
