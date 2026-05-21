import * as THREE from 'three';
import { cloneModel } from './models.js';

// Bas-klass för alla djur. Hanterar AI-state, rörelse, skada och visualisering.
class Creature {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.alive = true;
    this.respawnTime = 30; // sekunder innan ny spawnar
    this.respawnTimer = 0;
    this.facing = Math.random() * Math.PI * 2;
    this.wanderTimer = 0;
    this.wanderTarget = new THREE.Vector3();
    this.state = 'idle'; // 'idle' | 'flee' | 'chase' | 'attack'
    this.attackCooldown = 0;
    this.hitFlashTimer = 0;
    this.homePosition = position.clone();
    this.maxRoam = 12; // hur långt från hemmet djuret rör sig
  }

  isActive() {
    return this.alive;
  }

  takeDamage(amount, fromPos) {
    if (!this.alive) return false;
    this.hp -= amount;
    // Flammigt hopp åt sidan - stark knockback för bättre feedback
    if (fromPos) {
      const dx = this.position.x - fromPos.x;
      const dz = this.position.z - fromPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      this.velocity.x = (dx / len) * 14;
      this.velocity.z = (dz / len) * 14;
    }
    // Stagger - kan inte attackera i 0.5s
    this.attackCooldown = Math.max(this.attackCooldown, 0.5);
    // Visuell flash
    this.hitFlashTimer = 0.15;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    this.respawnTimer = 0;
    this.group.visible = false;
  }

  respawn() {
    this.alive = true;
    this.hp = this.maxHp;
    this._lootGiven = false;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * this.maxRoam;
    this.position.x = this.homePosition.x + Math.cos(angle) * r;
    this.position.z = this.homePosition.z + Math.sin(angle) * r;
    this.group.position.copy(this.position);
    this.group.visible = true;
    this.state = 'idle';
  }

  // Returnerar belöning som droppar vid död
  getLoot() {
    return [];
  }

  update(dt, playerPos) {
    if (!this.alive) {
      this.respawnTimer += dt;
      if (this.respawnTimer >= this.respawnTime) this.respawn();
      return;
    }

    // Decay velocity (bromsa över tid)
    this.velocity.x *= 0.92;
    this.velocity.z *= 0.92;

    // Tillämpa hastighet
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // AI-tillstånd (implementeras av subklasser via _decide)
    this._decide(dt, playerPos);

    this.group.position.copy(this.position);

    // Vänd mot spelaren när jagar/attackerar, annars vänd i rörelsens riktning
    if (this._chasingPlayer) {
      const px = playerPos.x - this.position.x;
      const pz = playerPos.z - this.position.z;
      if (Math.abs(px) > 0.01 || Math.abs(pz) > 0.01) {
        this.facing = Math.atan2(px, pz);
        this.group.rotation.y = this.facing;
      }
    } else if (Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.z) > 0.1) {
      this.facing = Math.atan2(this.velocity.x, this.velocity.z);
      this.group.rotation.y = this.facing;
    }

    // Hit-flash: blinka röd kort när skadad
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      this.group.visible = Math.floor(this.hitFlashTimer * 30) % 2 === 0;
    } else {
      this.group.visible = true;
    }
  }

  _wanderTowards(target, speed, dt) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.5) return false;
    this.velocity.x += (dx / dist) * speed * dt * 4;
    this.velocity.z += (dz / dist) * speed * dt * 4;
    const cap = speed;
    const vlen = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (vlen > cap) {
      this.velocity.x = (this.velocity.x / vlen) * cap;
      this.velocity.z = (this.velocity.z / vlen) * cap;
    }
    return true;
  }
}

// Kanin: liten, snabb, springer iväg
export class Rabbit extends Creature {
  constructor(scene, position) {
    super(scene, position);
    this.maxHp = 1;
    this.hp = 1;
    this.label = 'kanin';
    this.fleeSpeed = 7;
    this.wanderSpeed = 1.5;
    this.detectRange = 8;
    this.maxRoam = 10;

    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xfafafa });

    // Kropp
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), bodyMat);
    body.position.y = 0.3;
    body.castShadow = true;
    this.group.add(body);

    // Huvud
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.3), bodyMat);
    head.position.set(0, 0.45, 0.45);
    head.castShadow = true;
    this.group.add(head);

    // Öron
    const earMat = new THREE.MeshStandardMaterial({ color: 0xf5cba7 });
    const earGeo = new THREE.BoxGeometry(0.08, 0.3, 0.05);
    const lEar = new THREE.Mesh(earGeo, earMat);
    lEar.position.set(-0.1, 0.7, 0.4);
    this.group.add(lEar);
    const rEar = new THREE.Mesh(earGeo, earMat);
    rEar.position.set(0.1, 0.7, 0.4);
    this.group.add(rEar);

    // Svans
    const tail = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    tail.position.set(0, 0.35, -0.4);
    this.group.add(tail);

    this.group.position.copy(position);
    scene.add(this.group);
  }

  _decide(dt, playerPos) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < this.detectRange) {
      // Spring bort från spelaren
      this.velocity.x -= (dx / dist) * this.fleeSpeed * dt * 6;
      this.velocity.z -= (dz / dist) * this.fleeSpeed * dt * 6;
      const v = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (v > this.fleeSpeed) {
        this.velocity.x = (this.velocity.x / v) * this.fleeSpeed;
        this.velocity.z = (this.velocity.z / v) * this.fleeSpeed;
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 3;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * this.maxRoam;
        this.wanderTarget.set(
          this.homePosition.x + Math.cos(angle) * r,
          0,
          this.homePosition.z + Math.sin(angle) * r,
        );
      }
      this._wanderTowards(this.wanderTarget, this.wanderSpeed, dt);
    }
  }

  getLoot() {
    return [{ type: 'hide', amount: 1 }];
  }
}

// Hjort: större, snabbare, droppar mer
export class Deer extends Creature {
  constructor(scene, position) {
    super(scene, position);
    this.maxHp = 3;
    this.hp = 3;
    this.label = 'hjort';
    this.fleeSpeed = 8;
    this.wanderSpeed = 2;
    this.detectRange = 10;
    this.maxRoam = 18;

    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8d5524 });

    // Kropp
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 1.4), bodyMat);
    body.position.y = 1.0;
    body.castShadow = true;
    this.group.add(body);

    // Hals
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), bodyMat);
    neck.position.set(0, 1.4, 0.7);
    neck.rotation.x = -0.4;
    neck.castShadow = true;
    this.group.add(neck);

    // Huvud
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.7), bodyMat);
    head.position.set(0, 1.75, 0.95);
    head.castShadow = true;
    this.group.add(head);

    // Horn
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    for (const sign of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 5), hornMat);
      horn.position.set(sign * 0.13, 2.1, 0.85);
      horn.rotation.z = sign * 0.4;
      this.group.add(horn);
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.25, 5), hornMat);
      branch.position.set(sign * 0.25, 2.2, 0.85);
      branch.rotation.z = sign * 0.9;
      this.group.add(branch);
    }

    // Ben
    const legMat = new THREE.MeshStandardMaterial({ color: 0x5d3a1a });
    const legGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    for (const [x, z] of [[-0.25, 0.5], [0.25, 0.5], [-0.25, -0.5], [0.25, -0.5]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, 0.3, z);
      leg.castShadow = true;
      this.group.add(leg);
    }

    this.group.position.copy(position);
    scene.add(this.group);
  }

  _decide(dt, playerPos) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < this.detectRange) {
      this.velocity.x -= (dx / dist) * this.fleeSpeed * dt * 6;
      this.velocity.z -= (dz / dist) * this.fleeSpeed * dt * 6;
      const v = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (v > this.fleeSpeed) {
        this.velocity.x = (this.velocity.x / v) * this.fleeSpeed;
        this.velocity.z = (this.velocity.z / v) * this.fleeSpeed;
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 4;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * this.maxRoam;
        this.wanderTarget.set(
          this.homePosition.x + Math.cos(angle) * r,
          0,
          this.homePosition.z + Math.sin(angle) * r,
        );
      }
      this._wanderTowards(this.wanderTarget, this.wanderSpeed, dt);
    }
  }

  getLoot() {
    return [
      { type: 'hide', amount: 2 },
      { type: 'meat', amount: 1 },
    ];
  }
}

// Björn: aggressiv, jagar och attackerar spelaren
export class Bear extends Creature {
  constructor(scene, position) {
    super(scene, position);
    this.maxHp = 12;
    this.hp = 12;
    this.label = 'björnen';
    this.chaseSpeed = 4;
    this.detectRange = 14;
    this.attackRange = 2.5;
    this.attackDamage = 18;
    this.attackInterval = 1.5;
    this.respawnTime = 120;
    this.maxRoam = 6;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    this.mixer = null;
    this.actions = null;
    this.currentActionName = null;
    this._attackAnimTime = 0;
    this._deathHideDelay = 0;
    this._loadModel();
  }

  die() {
    this.alive = false;
    this.respawnTimer = 0;
    this._deathHideDelay = 2.0;
  }

  respawn() {
    super.respawn();
    this._deathHideDelay = 0;
    this.currentActionName = null;
    if (this.actions) {
      for (const a of Object.values(this.actions)) a.stop();
      this._playAction('Idle');
    }
  }

  async _loadModel() {
    try {
      const { root, mixer, actions } = await cloneModel('/models/bjorn_boss.glb');
      this.group.add(root);
      this.mixer = mixer;
      this.actions = actions;
      this._rootBone = root.getObjectByName('root') || null;
      this._hipsBone = root.getObjectByName('hips') || null;
      this._rootBoneRest = this._rootBone
        ? this._rootBone.position.clone()
        : null;
      this._hipsBoneRest = this._hipsBone
        ? this._hipsBone.position.clone()
        : null;
      console.log(
        '[Bear] GLB laddad. group.position=',
        this.group.position.toArray().map((v) => v.toFixed(1)).join(','),
        'rootBone=', this._rootBone?.name, '@', this._rootBoneRest?.toArray().map((v) => v.toFixed(2)).join(','),
        'actions=', Object.keys(actions),
      );
      this._playAction('Idle');
    } catch (err) {
      console.warn('Bear: GLB kunde inte laddas', err);
    }
  }

  _playAction(name, fadeTime = 0.2, opts = {}) {
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

  update(dt, playerPos) {
    super.update(dt, playerPos);

    if (this.mixer) {
      this.mixer.update(dt);
      if (this._rootBone && this._rootBoneRest) {
        this._rootBone.position.copy(this._rootBoneRest);
      }
      if (this._hipsBone && this._hipsBoneRest) {
        this._hipsBone.position.x = this._hipsBoneRest.x;
        this._hipsBone.position.z = this._hipsBoneRest.z;
      }
      this._updateAnimation(dt);
    }

    if (!this.alive && this._deathHideDelay > 0) {
      this._deathHideDelay -= dt;
      if (this._deathHideDelay > 0) this.group.visible = true;
      else this.group.visible = false;
    }
  }

  _updateAnimation(dt) {
    if (!this.alive) {
      this._playAction('Death', 0.15, { loop: false });
      return;
    }
    if (this._attackAnimTime > 0) {
      this._attackAnimTime -= dt;
      return;
    }
    if (this.hitFlashTimer > 0) {
      this._playAction('Hit', 0.05, { loop: false });
      return;
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this._playAction(speed > 0.5 ? 'Walk' : 'Idle');
  }

  _decide(dt, playerPos) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (dist < this.detectRange) {
      // Jaga - men stanna vid attack-distans, gå inte INI spelaren
      this.state = 'chase';
      this._chasingPlayer = true;
      const holdDist = this.attackRange * 0.85;
      if (dist > holdDist) {
        // Approach
        this.velocity.x += (dx / dist) * this.chaseSpeed * dt * 6;
        this.velocity.z += (dz / dist) * this.chaseSpeed * dt * 6;
        const v = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (v > this.chaseSpeed) {
          this.velocity.x = (this.velocity.x / v) * this.chaseSpeed;
          this.velocity.z = (this.velocity.z / v) * this.chaseSpeed;
        }
      } else {
        // Inom attack-räckhåll - stanna och slå
        this.velocity.x *= 0.5;
        this.velocity.z *= 0.5;
      }
    } else {
      this.state = 'idle';
      this._chasingPlayer = false;
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 4 + Math.random() * 4;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * this.maxRoam;
        this.wanderTarget.set(
          this.homePosition.x + Math.cos(angle) * r,
          0,
          this.homePosition.z + Math.sin(angle) * r,
        );
      }
      this._wanderTowards(this.wanderTarget, 1.2, dt);
    }
  }

  // Returnerar true om björnen attackerade just nu (för att applicera skada)
  tryAttack(playerPos) {
    if (this.attackCooldown > 0) return false;
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < this.attackRange) {
      this.attackCooldown = this.attackInterval;
      const anim = Math.random() < 0.5 ? 'Attack_Slam' : 'Attack_Swipe';
      this._playAction(anim, 0.08, { loop: false, force: true });
      this._attackAnimTime = 0.8;
      return true;
    }
    return false;
  }

  getLoot() {
    return [
      { type: 'hide', amount: 5 },
      { type: 'meat', amount: 3 },
      { type: 'gold', amount: 100 },
    ];
  }
}

// Skogstroll: den svåra bossen - mer HP och skada än björnen
export class Troll extends Creature {
  constructor(scene, position) {
    super(scene, position);
    this.maxHp = 30;
    this.hp = 30;
    this.label = 'trollet';
    this.chaseSpeed = 3.5;
    this.detectRange = 18;
    this.attackRange = 3.5;
    this.attackDamage = 30;
    this.attackInterval = 2.2;
    this.respawnTime = 180;
    this.maxRoam = 5;

    this.group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x6a7a3c, roughness: 0.9 });
    const mossy = new THREE.MeshStandardMaterial({ color: 0x4a5a2c, roughness: 0.95 });
    const darkSkin = new THREE.MeshStandardMaterial({ color: 0x4d5a26 });

    // Kropp - massiv låda
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.2), skinMat);
    body.position.y = 2.2;
    body.castShadow = true;
    this.group.add(body);

    // Mossa på axlarna
    const mossL = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.0), mossy);
    mossL.position.set(-0.5, 3.05, 0);
    this.group.add(mossL);
    const mossR = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.0), mossy);
    mossR.position.set(0.5, 3.05, 0);
    this.group.add(mossR);

    // Huvud - litet jämfört med kroppen
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.0), skinMat);
    head.position.y = 3.65;
    head.castShadow = true;
    this.group.add(head);

    // Spetsiga öron
    for (const sign of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 4), skinMat);
      ear.position.set(sign * 0.5, 4.1, 0);
      this.group.add(ear);
    }

    // Lysande röda ögon
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff5252,
      emissive: 0xff5252,
      emissiveIntensity: 1.0,
    });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), eyeMat);
    le.position.set(-0.22, 3.7, 0.51);
    this.group.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), eyeMat);
    re.position.set(0.22, 3.7, 0.51);
    this.group.add(re);

    // Underbett - två tänder
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xfff8e1 });
    const tL = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), toothMat);
    tL.position.set(-0.18, 3.35, 0.5);
    tL.rotation.x = Math.PI;
    this.group.add(tL);
    const tR = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), toothMat);
    tR.position.set(0.18, 3.35, 0.5);
    tR.rotation.x = Math.PI;
    this.group.add(tR);

    // Armar - stora och lätt böjda
    const armMat = darkSkin;
    const armGeo = new THREE.BoxGeometry(0.45, 1.8, 0.5);
    const lArm = new THREE.Mesh(armGeo, armMat);
    lArm.position.set(-1.15, 2.0, 0);
    lArm.castShadow = true;
    this.group.add(lArm);
    const rArm = new THREE.Mesh(armGeo, armMat);
    rArm.position.set(1.15, 2.0, 0);
    rArm.castShadow = true;
    this.group.add(rArm);
    this.rightArm = rArm;

    // Klubba i höger hand
    const clubHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x6d4c2a }),
    );
    clubHandle.position.set(0, -1.0, 0);
    rArm.add(clubHandle);
    const clubHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.95 }),
    );
    clubHead.position.set(0, -1.7, 0);
    rArm.add(clubHead);

    // Spikar på klubban
    for (const [dx, dy, dz] of [[0.3, 0, 0], [-0.3, 0, 0], [0, 0, 0.3], [0, 0, -0.3]]) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.2, 5),
        new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.6 }),
      );
      spike.position.set(dx, -1.7 + dy, dz);
      spike.rotation.z = Math.atan2(dx, 0) - Math.PI / 2;
      rArm.add(spike);
    }

    // Ben
    const legGeo = new THREE.BoxGeometry(0.55, 1.4, 0.6);
    const lL = new THREE.Mesh(legGeo, darkSkin);
    lL.position.set(-0.45, 0.7, 0);
    lL.castShadow = true;
    this.group.add(lL);
    const rL = new THREE.Mesh(legGeo, darkSkin);
    rL.position.set(0.45, 0.7, 0);
    rL.castShadow = true;
    this.group.add(rL);

    this.group.position.copy(position);
    scene.add(this.group);
  }

  _decide(dt, playerPos) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < this.detectRange) {
      this.state = 'chase';
      this._chasingPlayer = true;
      const holdDist = this.attackRange * 0.85;
      if (dist > holdDist) {
        this.velocity.x += (dx / dist) * this.chaseSpeed * dt * 6;
        this.velocity.z += (dz / dist) * this.chaseSpeed * dt * 6;
        const v = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (v > this.chaseSpeed) {
          this.velocity.x = (this.velocity.x / v) * this.chaseSpeed;
          this.velocity.z = (this.velocity.z / v) * this.chaseSpeed;
        }
      } else {
        this.velocity.x *= 0.4;
        this.velocity.z *= 0.4;
      }
    } else {
      this.state = 'idle';
      this._chasingPlayer = false;
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 5 + Math.random() * 4;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * this.maxRoam;
        this.wanderTarget.set(
          this.homePosition.x + Math.cos(angle) * r,
          0,
          this.homePosition.z + Math.sin(angle) * r,
        );
      }
      this._wanderTowards(this.wanderTarget, 1.0, dt);
    }

    // Klubban svingar lätt baserat på rörelse
    if (this.rightArm) {
      const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      this.rightArm.rotation.x = Math.sin(performance.now() * 0.003) * (0.1 + speed * 0.1);
    }
  }

  tryAttack(playerPos) {
    if (this.attackCooldown > 0) return false;
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < this.attackRange) {
      this.attackCooldown = this.attackInterval;
      return true;
    }
    return false;
  }

  getLoot() {
    return [
      { type: 'hide', amount: 10 },
      { type: 'meat', amount: 5 },
      { type: 'gold', amount: 300 },
    ];
  }
}

// Varg: spawnar bara på natten, jagar spelaren, kan inte gå in i lägret
export class Wolf extends Creature {
  constructor(scene, position, campCenter, campRadius) {
    super(scene, position);
    this.maxHp = 4;
    this.hp = 4;
    this.label = 'vargen';
    this.chaseSpeed = 5;
    this.detectRange = 22;
    this.attackRange = 1.8;
    this.attackDamage = 10;
    this.attackInterval = 1.0;
    this.respawnTime = 0; // hanteras av spawner istället
    this.campCenter = campCenter;
    this.campRadius = campRadius;

    this.group = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0x424242 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0x6d6d6d });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 1.2), furMat);
    body.position.y = 0.7;
    body.castShadow = true;
    this.group.add(body);

    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 1.0), bellyMat);
    belly.position.y = 0.5;
    this.group.add(belly);

    // Hals + huvud
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), furMat);
    neck.position.set(0, 0.85, 0.6);
    this.group.add(neck);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.55), furMat);
    head.position.set(0, 0.95, 0.95);
    head.castShadow = true;
    this.group.add(head);

    // Nos
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.25), bellyMat);
    snout.position.set(0, 0.85, 1.25);
    this.group.add(snout);

    // Öron
    for (const sign of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), furMat);
      ear.position.set(sign * 0.13, 1.22, 0.85);
      this.group.add(ear);
    }

    // Lysande gula ögon (skrämmande på natten)
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xfff176,
      emissive: 0xfff176,
      emissiveIntensity: 0.8,
    });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), eyeMat);
    le.position.set(-0.1, 1.0, 1.21);
    this.group.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), eyeMat);
    re.position.set(0.1, 1.0, 1.21);
    this.group.add(re);

    // Ben
    const legGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
    for (const [x, z] of [[-0.18, 0.4], [0.18, 0.4], [-0.18, -0.4], [0.18, -0.4]]) {
      const leg = new THREE.Mesh(legGeo, furMat);
      leg.position.set(x, 0.25, z);
      leg.castShadow = true;
      this.group.add(leg);
    }

    // Svans
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), furMat);
    tail.position.set(0, 0.7, -0.7);
    tail.rotation.x = -0.4;
    this.group.add(tail);

    this.group.position.copy(position);
    scene.add(this.group);
  }

  _decide(dt, playerPos) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Är spelaren i lägret? Då gör vi inget (kan inte attackera där)
    const playerInCamp = this._inCamp(playerPos.x, playerPos.z);
    if (playerInCamp) {
      // Cirkla utanför lägrets gräns
      const camp = this.campCenter;
      const angleFromCamp = Math.atan2(this.position.z - camp.z, this.position.x - camp.x);
      const targetR = this.campRadius + 2;
      const target = new THREE.Vector3(
        camp.x + Math.cos(angleFromCamp + dt * 0.3) * targetR,
        0,
        camp.z + Math.sin(angleFromCamp + dt * 0.3) * targetR,
      );
      this._wanderTowards(target, 2.0, dt);
      return;
    }

    if (dist < this.detectRange) {
      this._chasingPlayer = true;
      // Jaga - men aldrig in i lägret OCH stanna vid attack-distans
      const targetX = this.position.x + (dx / dist) * 2;
      const targetZ = this.position.z + (dz / dist) * 2;
      if (this._inCamp(targetX, targetZ)) {
        // Skulle gå in i lägret - stanna utanför
        this.velocity.x *= 0.5;
        this.velocity.z *= 0.5;
        return;
      }
      const holdDist = this.attackRange * 0.85;
      if (dist > holdDist) {
        this.velocity.x += (dx / dist) * this.chaseSpeed * dt * 6;
        this.velocity.z += (dz / dist) * this.chaseSpeed * dt * 6;
        const v = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (v > this.chaseSpeed) {
          this.velocity.x = (this.velocity.x / v) * this.chaseSpeed;
          this.velocity.z = (this.velocity.z / v) * this.chaseSpeed;
        }
      } else {
        // I attackpositionen - stanna och slå
        this.velocity.x *= 0.4;
        this.velocity.z *= 0.4;
      }
    } else {
      this._chasingPlayer = false;
    }

    // Säkerhetsnät: om vargen råkar vara i lägret, knuffa ut
    if (this._inCamp(this.position.x, this.position.z)) {
      const camp = this.campCenter;
      const dx2 = this.position.x - camp.x;
      const dz2 = this.position.z - camp.z;
      const d = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
      this.velocity.x = (dx2 / d) * 4;
      this.velocity.z = (dz2 / d) * 4;
    }
  }

  _inCamp(x, z) {
    const dx = x - this.campCenter.x;
    const dz = z - this.campCenter.z;
    return Math.sqrt(dx * dx + dz * dz) < this.campRadius;
  }

  tryAttack(playerPos) {
    if (this.attackCooldown > 0) return false;
    if (this._inCamp(playerPos.x, playerPos.z)) return false;
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < this.attackRange) {
      this.attackCooldown = this.attackInterval;
      return true;
    }
    return false;
  }

  getLoot() {
    return [{ type: 'hide', amount: 1 }, { type: 'meat', amount: 1 }];
  }

  // Vargar respawnar inte automatiskt - hanteras av spawner i game.js
  respawn() {}
}
