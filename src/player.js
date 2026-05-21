import * as THREE from 'three';
import { cloneModel } from './models.js';

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

// Hipp-höjd där överkroppen pivoterar - används för torso-lutning
const TORSO_PIVOT_Y = 0.8;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.position = new THREE.Vector3(0, 0, 0);
    this.facing = 0;
    this.walkTime = 0;
    this.isChopping = false;
    this.chopProgress = 0;
    this.swingTime = 0;
    this.swingDuration = 0.5;
    this.swinging = false;
    this.swingStruckCallback = null;

    this.maxHp = 100;
    this.hp = 100;
    this.invulnTimer = 0;
    this.flashTimer = 0;

    // Andning för vatten
    this.maxBreath = 6;
    this.breath = 6;
    this.inWater = false;
    this.waterY = 0; // mål-y när man är i vatten
    this.surfaceY = 0; // smooth-interpolerad y

    this.yVel = 0;
    this.onGround = true;

    this.activeWeapon = null;

    this.group = new THREE.Group();

    // Torso-pivot: allt ovanför höften lutar/vrider sig härifrån
    this.torsoPivot = new THREE.Group();
    this.torsoPivot.position.y = TORSO_PIVOT_Y;
    this.group.add(this.torsoPivot);

    // Kropp (grön tröja) - relativt torsoPivot
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.9, 0.45),
      new THREE.MeshStandardMaterial({ color: SHIRT }),
    );
    body.position.y = 0.45;
    body.castShadow = true;
    this.bodyMesh = body;
    this.torsoPivot.add(body);

    // Huvud
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: SKIN }),
    );
    head.position.y = 1.2;
    head.castShadow = true;
    this.headMesh = head;
    this.torsoPivot.add(head);

    // Hår
    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.18, 0.65),
      new THREE.MeshStandardMaterial({ color: HAIR }),
    );
    hair.position.y = 1.56;
    this.torsoPivot.add(hair);

    // Ögon
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    le.position.set(-0.13, 1.25, 0.31);
    this.torsoPivot.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    re.position.set(0.13, 1.25, 0.31);
    this.torsoPivot.add(re);

    // Armar - pivot vid axel (relativt torso)
    this.leftArmPivot = this._makeLimbPivot(-0.55, 0.85, 0.22, 0.9, 0.3, SKIN);
    this.rightArmPivot = this._makeLimbPivot(0.55, 0.85, 0.22, 0.9, 0.3, SKIN);
    this.torsoPivot.add(this.leftArmPivot, this.rightArmPivot);

    // Verktyg/vapen
    this.axe = this._makeAxe();
    this.rightArmPivot.add(this.axe);
    this.axe.visible = false;

    this.sword = this._makeSword();
    this.rightArmPivot.add(this.sword);
    this.sword.visible = false;

    this.bow = this._makeBow();
    this.leftArmPivot.add(this.bow);
    this.bow.visible = false;

    // Pil i höger hand när man drar bågen
    this.drawArrow = this._makeDrawArrow();
    this.rightArmPivot.add(this.drawArrow);
    this.drawArrow.visible = false;

    // Ben - direkt under group (rör sig inte med torsoPivot)
    this.leftLegPivot = this._makeLimbPivot(-0.2, 0.8, 0.32, 0.85, 0.38, PANTS);
    this.rightLegPivot = this._makeLimbPivot(0.2, 0.8, 0.32, 0.85, 0.38, PANTS);
    this.group.add(this.leftLegPivot, this.rightLegPivot);

    scene.add(this.group);

    this.useGLB = false;
    this.mixer = null;
    this.actions = null;
    this.currentActionName = null;
    this.hasShield = false;
    this._loadGLB();
  }

  async _loadGLB() {
    try {
      const { root, mixer, actions } = await cloneModel('/models/player.glb');
      this.torsoPivot.visible = false;
      this.leftLegPivot.visible = false;
      this.rightLegPivot.visible = false;

      this.group.add(root);
      this.glbRoot = root;
      this.mixer = mixer;
      this.actions = actions;
      this._rootBone = root.getObjectByName('root') || null;
      this._hipsBone = root.getObjectByName('hips') || null;
      this._handR = root.getObjectByName('hand.R') || null;
      this._handL = root.getObjectByName('hand.L') || null;
      this._rootBoneRest = this._rootBone
        ? this._rootBone.position.clone()
        : null;
      this._hipsBoneRest = this._hipsBone
        ? this._hipsBone.position.clone()
        : null;
      this.useGLB = true;
      this._playAction('Idle');
      console.log(
        '[Player] GLB laddad. Animations:',
        Object.keys(actions).join(', '),
      );

      if (this._handR) {
        this._attachWeapon('/models/sword.glb', this._handR).then((m) => {
          this._glbSword = m;
        });
        this._attachWeapon('/models/axe.glb', this._handR).then((m) => {
          this._glbAxe = m;
        });
      }
      if (this._handL) {
        this._attachWeapon('/models/bow.glb', this._handL).then((m) => {
          this._glbBow = m;
        });
        this._attachWeapon('/models/shield.glb', this._handL).then((m) => {
          this._glbShield = m;
        });
      }
    } catch (err) {
      console.warn('[Player] GLB kunde inte laddas, kvar med box-mesh', err);
    }
  }

  async _attachWeapon(url, bone) {
    const { root } = await cloneModel(url);
    for (const name of ['Weapon_Sword', 'Weapon_Bow', 'Weapon_Axe', 'Weapon_Shield']) {
      const obj = root.getObjectByName(name);
      if (obj) {
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, 0, 0);
        break;
      }
    }
    bone.add(root);
    root.visible = false;
    return root;
  }

  _playAction(name, fadeTime = 0.12, opts = {}) {
    if (!this.actions || !this.actions[name]) return;
    if (this.currentActionName === name && !opts.force) return;

    const next = this.actions[name];
    const prev = this.currentActionName ? this.actions[this.currentActionName] : null;

    next.reset();
    if (opts.loop === false) {
      next.loop = THREE.LoopOnce;
      next.clampWhenFinished = true;
    } else {
      next.loop = THREE.LoopRepeat;
      next.clampWhenFinished = false;
    }
    next.fadeIn(fadeTime).play();
    if (prev) prev.fadeOut(fadeTime);

    this.currentActionName = name;
  }

  updateAnimation(dt, isMoving) {
    if (!this.useGLB || !this.mixer) return;

    this.mixer.update(dt);

    if (this._rootBone && this._rootBoneRest) {
      this._rootBone.position.copy(this._rootBoneRest);
    }
    if (this._hipsBone && this._hipsBoneRest) {
      this._hipsBone.position.x = this._hipsBoneRest.x;
      this._hipsBone.position.z = this._hipsBoneRest.z;
    }

    if (this._glbSword) {
      this._glbSword.visible = this.activeWeapon === 'sword' && !this.isChopping;
    }
    if (this._glbBow) {
      this._glbBow.visible = this.activeWeapon === 'bow' && !this.isChopping;
    }
    if (this._glbAxe) {
      this._glbAxe.visible = this.isChopping;
    }
    if (this._glbShield) {
      this._glbShield.visible =
        this.hasShield && this.activeWeapon !== 'bow' && !this.isChopping;
    }

    let next;
    let oneShot = false;

    if (this.hp <= 0) {
      next = 'Death';
      oneShot = true;
    } else if (this.swinging && this.activeWeapon === 'sword') {
      next = this.hasShield ? 'Sword_Shield_Slash' : 'Sword_Slash';
      oneShot = true;
    } else if (this.swinging && this.activeWeapon === 'bow') {
      next = 'Bow_Shot';
      oneShot = true;
    } else if (this.isChopping) {
      next = 'Chop';
    } else if (this.flashTimer > 0.05) {
      next = 'Hit';
      oneShot = true;
    } else if (!this.onGround && this.yVel > 0) {
      next = 'Jump';
      oneShot = true;
    } else if (isMoving) {
      next = 'Walk';
    } else {
      next = 'Idle';
    }

    this._playAction(next, 0.12, { loop: !oneShot });
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
      new THREE.CylinderGeometry(0.05, 0.06, 0.75, 8),
      new THREE.MeshStandardMaterial({ color: AXE_HANDLE }),
    );
    handle.position.y = 0.38;
    handle.castShadow = true;
    axe.add(handle);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.28, 0.4),
      new THREE.MeshStandardMaterial({ color: AXE_HEAD, metalness: 0.6, roughness: 0.4 }),
    );
    head.position.set(0, 0.7, 0.12);
    head.castShadow = true;
    axe.add(head);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8),
      new THREE.MeshStandardMaterial({ color: AXE_HANDLE }),
    );
    cap.position.y = 0.78;
    axe.add(cap);
    axe.position.set(0, -0.85, 0);
    axe.rotation.x = Math.PI / 8;
    return axe;
  }

  _makeSword() {
    const sword = new THREE.Group();
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: 0x3e2723 }),
    );
    grip.position.y = 0.11;
    sword.add(grip);
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.07, 0.12),
      new THREE.MeshStandardMaterial({ color: SWORD_GUARD, metalness: 0.7, roughness: 0.3 }),
    );
    guard.position.y = 0.26;
    sword.add(guard);
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.9, 0.04),
      new THREE.MeshStandardMaterial({ color: SWORD_BLADE, metalness: 0.85, roughness: 0.15 }),
    );
    blade.position.y = 0.76;
    blade.castShadow = true;
    sword.add(blade);
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

  _makeBow() {
    const bow = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: BOW_WOOD });
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

    // Sträng - sparas så vi kan dra ut den under skott
    this.bowString = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 1.1, 4),
      new THREE.MeshStandardMaterial({ color: BOW_STRING }),
    );
    this.bowString.position.z = 0.1;
    bow.add(this.bowString);

    bow.position.set(0, -0.85, 0);
    bow.rotation.z = Math.PI / 2;
    return bow;
  }

  _makeDrawArrow() {
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: 0xa1887f }),
    );
    shaft.rotation.x = Math.PI / 2;
    arrow.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.7 }),
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.42;
    arrow.add(tip);
    arrow.position.set(0, -0.85, 0);
    return arrow;
  }

  setActiveWeapon(weapon) {
    this.activeWeapon = weapon;
    this.sword.visible = weapon === 'sword' && !this.isChopping;
    this.bow.visible = weapon === 'bow' && !this.isChopping;
  }

  // Uppdaterar bara animation/facing baserat på faktisk rörelse (position sätts av game.js efter kollision)
  move(direction, distance) {
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
      this.torsoPivot.rotation.x = Math.abs(swing) * 0.05;
    }
  }

  idle(dt) {
    this.leftLegPivot.rotation.x *= 0.85;
    this.rightLegPivot.rotation.x *= 0.85;
    if (!this.isChopping && !this.swinging) {
      this.leftArmPivot.rotation.x *= 0.85;
      this.rightArmPivot.rotation.x *= 0.85;
      this.torsoPivot.rotation.x *= 0.85;
      this.torsoPivot.rotation.z *= 0.85;
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

    // I vatten: sjunk gradvis ner. Ur vatten: tillbaka till marknivå.
    const targetY = this.inWater && this.onGround ? -0.85 : 0;
    if (this.onGround) {
      this.surfaceY += (targetY - this.surfaceY) * Math.min(1, dt * 5);
      this.group.position.y = this.surfaceY;
    } else {
      this.surfaceY = 0;
      this.group.position.y = this.position.y;
    }

    // Andning - dräneras i vatten, regenererar på land
    if (this.inWater) {
      this.breath -= dt;
      if (this.breath < 0) {
        this.breath = 0;
        // Ta skada när andningen är slut
        this.hp = Math.max(0, this.hp - 18 * dt);
      }
    } else {
      this.breath = Math.min(this.maxBreath, this.breath + dt * 2.5);
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      this.group.visible = Math.floor(this.invulnTimer * 12) % 2 === 0;
    } else {
      this.group.visible = true;
    }

    // Röd flash när skadad
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const intensity = Math.max(0, this.flashTimer / 0.2);
      this.bodyMesh.material.emissive.setRGB(intensity * 0.8, 0, 0);
      this.headMesh.material.emissive.setRGB(intensity * 0.8, 0, 0);
    }
  }

  startChop() {
    this.isChopping = true;
    this.axe.visible = true;
    this.sword.visible = false;
    this.bow.visible = false;
    this.chopProgress = 0;
  }

  stopChop() {
    this.isChopping = false;
    this.axe.visible = false;
    this.rightArmPivot.rotation.x = 0;
    this.rightArmPivot.rotation.z = 0;
    this.leftArmPivot.rotation.x = 0;
    this.torsoPivot.rotation.x = 0;
    this.torsoPivot.rotation.z = 0;
    this.setActiveWeapon(this.activeWeapon);
  }

  // Driver chop-animationen utifrån hur långt skördningen kommit (0..1)
  setChopProgress(progress) {
    this.chopProgress = progress;
    const t = Math.min(1, progress);

    // Tre faser: höj (0..0.55), slå ned (0.55..0.75), avsluta (0.75..1)
    let armX, armZ, torsoX, torsoZ;
    if (t < 0.55) {
      // Höj yxan över huvudet
      const p = t / 0.55;
      const eased = p * p; // ease-in
      armX = -0.2 - eased * 2.4; // arm går från lite nedåt till rakt upp+bakåt
      armZ = 0;
      torsoX = -eased * 0.25; // luta tillbaka
      torsoZ = 0;
    } else if (t < 0.75) {
      // Slå ned hårt
      const p = (t - 0.55) / 0.2;
      const eased = 1 - Math.pow(1 - p, 3); // ease-out, snabbt i början
      armX = -2.6 + eased * 3.2; // från upp till framåt-ned
      armZ = 0;
      torsoX = -0.25 + eased * 0.55; // luta kraftigt framåt
      torsoZ = 0;
    } else {
      // Återhämtning
      const p = (t - 0.75) / 0.25;
      armX = 0.6 - p * 0.6;
      armZ = 0;
      torsoX = 0.3 - p * 0.3;
      torsoZ = 0;
    }

    this.rightArmPivot.rotation.x = armX;
    this.rightArmPivot.rotation.z = armZ;
    this.leftArmPivot.rotation.x = armX * 0.55;
    this.torsoPivot.rotation.x = torsoX;
    this.torsoPivot.rotation.z = torsoZ;
  }

  // Startar attack-animation. impactCallback körs vid själva slag-/skott-stunden.
  startSwing(impactCallback) {
    this.swinging = true;
    this.swingTime = 0;
    this.swingStruckCallback = impactCallback || null;
    this.swingImpactFired = false;

    if (this.activeWeapon === 'sword') {
      this.swingDuration = 0.45;
    } else if (this.activeWeapon === 'bow') {
      this.swingDuration = 0.6;
      this.drawArrow.visible = true;
    } else {
      this.swingDuration = 0.3;
    }
  }

  updateSwing(dt) {
    if (!this.swinging) return;
    this.swingTime += dt;
    const t = this.swingTime / this.swingDuration;

    if (this.activeWeapon === 'sword') {
      this._animateSwordSlash(t);
    } else if (this.activeWeapon === 'bow') {
      this._animateBowShot(t);
    }

    if (t >= 1) {
      this.swinging = false;
      this.swingStruckCallback = null;
      this.drawArrow.visible = false;
      this.rightArmPivot.rotation.x = 0;
      this.rightArmPivot.rotation.y = 0;
      this.rightArmPivot.rotation.z = 0;
      this.leftArmPivot.rotation.x = 0;
      this.leftArmPivot.rotation.z = 0;
      this.torsoPivot.rotation.x = 0;
      this.torsoPivot.rotation.y = 0;
      this.torsoPivot.rotation.z = 0;
      if (this.bowString) this.bowString.scale.y = 1;
    }
  }

  _animateSwordSlash(t) {
    // 0..0.3: Höj svärdet över huvudet på ena sidan (windup)
    // 0.3..0.55: Snabb diagonal slash över kroppen (impact mitt i)
    // 0.55..1: Återhämtning till neutral
    let armX, armZ, torsoX, torsoZ;
    if (t < 0.3) {
      const p = t / 0.3;
      const eased = p * p;
      armX = -eased * 2.0; // arm går upp
      armZ = eased * 0.9; // arm ut åt höger
      torsoX = -eased * 0.15; // luta bakåt
      torsoZ = eased * 0.25; // luta åt höger
    } else if (t < 0.55) {
      const p = (t - 0.3) / 0.25;
      const eased = 1 - Math.pow(1 - p, 2.5);
      armX = -2.0 + eased * 2.6; // sveper ned framåt
      armZ = 0.9 - eased * 2.2; // korsar över kroppen åt vänster
      torsoX = -0.15 + eased * 0.4; // pressar framåt
      torsoZ = 0.25 - eased * 0.55; // svänger åt vänster
      // Trigga skadan vid impakt-fönstret
      if (!this.swingImpactFired && p > 0.6 && this.swingStruckCallback) {
        this.swingStruckCallback();
        this.swingImpactFired = true;
      }
    } else {
      const p = (t - 0.55) / 0.45;
      armX = 0.6 - p * 0.6;
      armZ = -1.3 + p * 1.3;
      torsoX = 0.25 - p * 0.25;
      torsoZ = -0.3 + p * 0.3;
    }

    this.rightArmPivot.rotation.x = armX;
    this.rightArmPivot.rotation.z = armZ;
    this.leftArmPivot.rotation.x = armX * 0.3;
    this.torsoPivot.rotation.x = torsoX;
    this.torsoPivot.rotation.z = torsoZ;
  }

  _animateBowShot(t) {
    // 0..0.55: Lyft bågen, dra strängen bakåt
    // 0.55..0.65: Släpp (sträng + arm snäpper framåt)
    // 0.65..1: Sänk bågen
    let leftX, rightX, rightZ, torsoY;
    if (t < 0.55) {
      const p = t / 0.55;
      const eased = 1 - Math.pow(1 - p, 2); // ease-out: snabb upp först
      // Vänster arm håller bågen rakt fram
      leftX = -eased * 1.55;
      // Höger arm drar bakåt + utåt
      rightX = -eased * 1.4;
      rightZ = eased * 0.5;
      // Liten torso-vridning för att rikta
      torsoY = eased * 0.15;
      // Sträng dras ut (skala bowString)
      if (this.bowString) this.bowString.scale.y = 1 + eased * 0.4;
    } else if (t < 0.65) {
      const p = (t - 0.55) / 0.1;
      // Släpp - höger arm snäpper tillbaka snabbt
      leftX = -1.55;
      rightX = -1.4 + p * 1.6;
      rightZ = 0.5 - p * 0.5;
      torsoY = 0.15;
      if (this.bowString) this.bowString.scale.y = 1 + (1 - p) * 0.4;
      if (!this.swingImpactFired && this.swingStruckCallback) {
        this.swingStruckCallback();
        this.swingImpactFired = true;
        this.drawArrow.visible = false;
      }
    } else {
      const p = (t - 0.65) / 0.35;
      leftX = -1.55 + p * 1.55;
      rightX = 0.2 - p * 0.2;
      rightZ = 0;
      torsoY = 0.15 - p * 0.15;
      if (this.bowString) this.bowString.scale.y = 1;
    }

    this.leftArmPivot.rotation.x = leftX;
    this.rightArmPivot.rotation.x = rightX;
    this.rightArmPivot.rotation.z = rightZ;
    this.torsoPivot.rotation.y = torsoY;
  }

  takeDamage(amount) {
    if (this.invulnTimer > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = 0.8;
    this.flashTimer = 0.3;
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
