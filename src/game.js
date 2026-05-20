import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { Inventory } from './inventory.js';
import { Upgrades } from './upgrades.js';
import { UI } from './ui.js';
import { Save } from './save.js';
import { DayNight } from './daynight.js';
import { Rabbit, Deer, Bear, Wolf } from './creatures.js';
import { Arrow, HitEffect, findNearestTarget } from './combat.js';

const INTERACT_RANGE = 3.0;
const SWORD_RANGE = 3.0;

export class Game {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 180);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this._setupLights();
    this._setupCamera();

    this.save = new Save();
    this.inventory = new Inventory();
    this.upgrades = new Upgrades();
    this.world = new World(this.scene);
    this.player = new Player(this.scene);
    this.controls = new Controls();
    this.dayNight = new DayNight(this.scene, this.sun, this.ambient);
    this.ui = new UI(this);

    this.save.load(this.inventory, this.upgrades, this.player, this.controls);

    // Spawna djur
    this.creatures = [];
    this._spawnAnimals();
    this._spawnBear();

    // Vargspawner (aktiveras på natten)
    this.wolves = [];
    this.wolfSpawnTimer = 0;
    this.maxWolves = 5;

    // Pilar och effekter
    this.arrows = [];
    this.effects = [];

    this.clock = new THREE.Clock();
    this.interactingWith = null;
    this.interactProgress = 0;

    // Sätt aktivt vapen om man redan äger något
    if (this.upgrades.hasWeapon('sword')) this.controls.selectedWeapon = 'sword';
    else if (this.upgrades.hasWeapon('bow')) this.controls.selectedWeapon = 'bow';
    this.player.setActiveWeapon(this.controls.selectedWeapon);

    window.addEventListener('resize', () => this._onResize());
  }

  _setupLights() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff4d6, 0.95);
    this.sun.position.set(40, 60, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
  }

  _setupCamera() {
    this.cameraAngle = 0;
    this.cameraDistance = 13;
    this.cameraHeight = 9;
    this.mouseDown = false;
    this.lastMouseX = 0;

    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.lastMouseX = e.clientX;
    });
    window.addEventListener('mouseup', () => (this.mouseDown = false));
    window.addEventListener('mousemove', (e) => {
      if (this.mouseDown) {
        const dx = e.clientX - this.lastMouseX;
        this.cameraAngle -= dx * 0.005;
        this.lastMouseX = e.clientX;
      }
    });

    let lastTouchX = 0;
    dom.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) lastTouchX = e.touches[0].clientX;
    });
    dom.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchX;
        this.cameraAngle -= dx * 0.005;
        lastTouchX = e.touches[0].clientX;
      }
    });
  }

  _spawnAnimals() {
    for (let i = 0; i < 8; i++) {
      const pos = this._randomSpawnPos(15);
      if (!pos) continue;
      this.creatures.push(new Rabbit(this.scene, pos));
    }
    for (let i = 0; i < 5; i++) {
      const pos = this._randomSpawnPos(25);
      if (!pos) continue;
      this.creatures.push(new Deer(this.scene, pos));
    }
  }

  _spawnBear() {
    // Björnen står utanför grottan
    const cavePos = this.world.caveCenter;
    const bearPos = new THREE.Vector3(cavePos.x, 0, cavePos.z + 5);
    this.bear = new Bear(this.scene, bearPos);
    this.creatures.push(this.bear);
  }

  _randomSpawnPos(minDist = 15, maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
      const x = (Math.random() - 0.5) * 140;
      const z = (Math.random() - 0.5) * 140;
      if (Math.sqrt(x * x + z * z) < minDist) continue;
      if (this.world._inPond(x, z, 3)) continue;
      if (this.world._inCamp(x, z, 4)) continue;
      if (this.world._inCave(x, z, 8)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  _spawnWolfNearPlayer() {
    if (this.wolves.length >= this.maxWolves) return;
    // Spawna 18-25 enheter från spelaren, INTE i lägret
    for (let attempt = 0; attempt < 15; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 18 + Math.random() * 7;
      const x = this.player.position.x + Math.cos(angle) * dist;
      const z = this.player.position.z + Math.sin(angle) * dist;
      if (this.world._inCamp(x, z, 2)) continue;
      if (this.world._inPond(x, z, 2)) continue;
      if (Math.abs(x) > 90 || Math.abs(z) > 90) continue;
      const wolf = new Wolf(this.scene, new THREE.Vector3(x, 0, z), this.world.campCenter, this.world.campRadius);
      this.wolves.push(wolf);
      this.creatures.push(wolf);
      return;
    }
  }

  _despawnAllWolves() {
    for (const w of this.wolves) {
      this.scene.remove(w.group);
      const idx = this.creatures.indexOf(w);
      if (idx >= 0) this.creatures.splice(idx, 1);
    }
    this.wolves = [];
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start() {
    this._animate();
    setInterval(() => {
      this.save.save(this.inventory, this.upgrades, this.player, this.controls);
    }, 5000);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    // Dag/natt
    this.dayNight.update(dt);

    // Spawna/despawna vargar baserat på dag/natt
    if (this.dayNight.isNighttime()) {
      this.wolfSpawnTimer -= dt;
      if (this.wolfSpawnTimer <= 0 && this.wolves.length < this.maxWolves) {
        this._spawnWolfNearPlayer();
        this.wolfSpawnTimer = 6 + Math.random() * 4;
      }
    } else if (this.wolves.length > 0) {
      this._despawnAllWolves();
    }

    // Rörelse / hopp / spring
    const baseSpeed = this.upgrades.getMoveSpeed();
    const speed = this.controls.isRunning() ? baseSpeed * 1.7 : baseSpeed;
    const moveVec = this.controls.getMovementVector(this.cameraAngle);

    if (moveVec.lengthSq() > 0 && !this.ui.shopOpen) {
      this.player.move(moveVec, speed * dt);
      if (this.interactingWith) this._cancelInteraction();
    } else {
      this.player.idle(dt);
    }

    if (!this.ui.shopOpen && this.controls.consumeJump()) {
      this.player.tryJump();
    }
    if (!this.ui.shopOpen && this.controls.consumeEat()) {
      this.eatToHeal();
    }
    this.player.updatePhysics(dt);

    // Vapenval (visualisera nyligen valt vapen)
    if (this.controls.selectedWeapon !== this.player.activeWeapon) {
      // Bara välj om man äger det
      if (this.upgrades.hasWeapon(this.controls.selectedWeapon)) {
        this.player.setActiveWeapon(this.controls.selectedWeapon);
      } else {
        this.controls.selectedWeapon = this.player.activeWeapon;
      }
    }

    // Vapenanvändning
    if (!this.ui.shopOpen && this.controls.consumeAttack()) {
      this._tryAttack();
    }
    this.player.updateSwing(dt);

    // Kameran följer spelaren
    const px = this.player.position.x;
    const pz = this.player.position.z;
    this.camera.position.set(
      px + Math.sin(this.cameraAngle) * this.cameraDistance,
      this.cameraHeight + this.player.position.y * 0.3,
      pz + Math.cos(this.cameraAngle) * this.cameraDistance,
    );
    this.camera.lookAt(px, 1.2 + this.player.position.y * 0.3, pz);

    // Skördning av träd/bär/fisk/eld
    const nearest = this.world.getNearestInteractable(this.player.position, INTERACT_RANGE);
    if (
      !this.ui.shopOpen &&
      this.controls.isInteractPressed() &&
      nearest &&
      nearest.canHarvest(this.upgrades, this.inventory)
    ) {
      if (this.interactingWith !== nearest) {
        this.interactingWith = nearest;
        this.interactProgress = 0;
        const dx = nearest.position.x - px;
        const dz = nearest.position.z - pz;
        this.player.group.rotation.y = Math.atan2(dx, dz);
        if (nearest.actionType === 'chop') this.player.startChop();
      }
      const duration = nearest.getHarvestDuration(this.upgrades);
      this.interactProgress += dt / duration;
      this.player.updateChop(dt);
      if (this.interactProgress >= 1) {
        this._completeHarvest();
      }
    } else if (this.interactingWith && !this.controls.isInteractPressed()) {
      this._cancelInteraction();
    } else if (this.interactingWith && nearest !== this.interactingWith) {
      this._cancelInteraction();
    }

    // Uppdatera djur + björn/varg-attacker
    for (const c of this.creatures) {
      c.update(dt, this.player.position);
      if ((c instanceof Bear || c instanceof Wolf) && c.alive && c.tryAttack(this.player.position)) {
        const hit = this.player.takeDamage(c.attackDamage);
        if (hit) {
          this.ui.showToast(`💢 ${c.label} attackerade dig! -${c.attackDamage} ❤️`);
          this.effects.push(new HitEffect(this.scene, this.player.position.clone().setY(1.5), 0xf44336));
        }
        if (!this.player.isAlive()) this._playerDied();
      }
    }

    // Plocka upp loot från döda djur (visuell död + reward redan delat ut i takeDamage)
    // Hantera respawn av vanliga djur i creatures.update

    // Pilar
    for (const arrow of this.arrows) {
      arrow.update(dt);
      // Om träff: ge belöning (Arrow.update kallar takeDamage som setar alive=false)
    }
    this.arrows = this.arrows.filter((a) => a.alive);

    // Effekter
    for (const e of this.effects) e.update(dt);
    this.effects = this.effects.filter((e) => e.alive);

    // Plocka upp loot från döda djur
    this._collectLoot();

    this.world.update(dt);

    this.ui.update({
      nearest,
      interactingWith: this.interactingWith,
      progress: this.interactProgress,
      inventory: this.inventory,
      upgrades: this.upgrades,
      player: this.player,
      timeLabel: this.dayNight.getTimeLabel(),
      activeWeapon: this.player.activeWeapon,
    });
  }

  _completeHarvest() {
    const target = this.interactingWith;
    const reward = target.harvest();
    if (reward.type === 'cook') {
      // Specialfall: laga rått kött
      if (this.inventory.meat > 0) {
        this.inventory.meat -= 1;
        this.inventory.cookedMeat += 1;
        this.ui.showToast('🍖 Du lagade kött!');
      }
    } else {
      this.inventory.add(reward.type, reward.amount);
      this.ui.showToast(this._rewardEmoji(reward.type) + ' +' + reward.amount);
    }
    this.interactProgress = 0;
    if (!target.canHarvest(this.upgrades, this.inventory)) {
      this._cancelInteraction();
    }
  }

  _tryAttack() {
    const weapon = this.player.activeWeapon;
    if (!weapon) {
      this.ui.showToast('⚠️ Köp ett vapen i butiken (B) först');
      return;
    }
    if (weapon === 'sword') {
      const dmg = this.upgrades.getSwordDamage();
      if (dmg <= 0) return;
      // Hitta djur framför spelaren inom svärdsräckvidd
      const facing = this.player.facing;
      const fx = Math.sin(facing);
      const fz = Math.cos(facing);
      let target = null;
      let bestScore = -Infinity;
      for (const c of this.creatures) {
        if (!c.alive) continue;
        const dx = c.position.x - this.player.position.x;
        const dz = c.position.z - this.player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > SWORD_RANGE) continue;
        // Punktprodukt: positiv = framför, negativ = bakom
        const dot = (dx * fx + dz * fz) / (dist || 1);
        if (dot < 0.3) continue; // bara inom ~70° framåt-kon
        const score = dot - dist * 0.1;
        if (score > bestScore) {
          bestScore = score;
          target = c;
        }
      }
      this.player.startSwing();
      if (target) {
        const killed = target.takeDamage(dmg, this.player.position);
        this.effects.push(new HitEffect(this.scene, target.position.clone(), 0xff5722));
        if (killed) this._onCreatureKilled(target);
      }
    } else if (weapon === 'bow') {
      const dmg = this.upgrades.getBowDamage();
      if (dmg <= 0) return;
      const range = this.upgrades.getBowRange();
      // Autosikte: skjut på närmaste djur inom räckvidd
      const target = findNearestTarget(this.player.position, this.creatures, range);
      this.player.startSwing();
      if (target) {
        const arrow = new Arrow(
          this.scene,
          this.player.position.clone().setY(1.5),
          target,
          dmg,
        );
        this.arrows.push(arrow);
        // Kolla efter pilen träffar i nästa update
      } else {
        this.ui.showToast('🏹 Inget djur inom räckvidd');
      }
    }
  }

  _onCreatureKilled(creature) {
    if (creature._lootGiven) return;
    creature._lootGiven = true;
    const loot = creature.getLoot();
    const labels = {
      hide: '🟫 Skinn',
      meat: '🥩 Kött',
      gold: '💰 Guld',
    };
    let summary = `Dödade ${creature.label}!`;
    for (const drop of loot) {
      if (drop.type === 'gold') {
        this.inventory.gold += drop.amount;
        summary += ` +${drop.amount} 💰`;
      } else {
        const added = this.inventory.add(drop.type, drop.amount);
        if (added) summary += ` +${drop.amount} ${labels[drop.type] || drop.type}`;
      }
    }
    this.ui.showToast(summary);
    // Effekt
    this.effects.push(new HitEffect(this.scene, creature.position.clone(), 0xffeb3b));
  }

  // Upptäcker djur som dött (t.ex. av pilar) och delar ut loot
  _collectLoot() {
    for (const c of this.creatures) {
      if (!c.alive && !c._lootGiven) {
        this._onCreatureKilled(c);
      }
    }
  }

  _cancelInteraction() {
    this.interactingWith = null;
    this.interactProgress = 0;
    this.player.stopChop();
  }

  _playerDied() {
    this.ui.showToast('💀 Du dog! Återupplivar i lägret...');
    this.player.respawn();
    // Förlora hälften av inventariet som straff
    this.inventory.wood = Math.floor(this.inventory.wood / 2);
    this.inventory.berry = Math.floor(this.inventory.berry / 2);
    this.inventory.fish = Math.floor(this.inventory.fish / 2);
    this.inventory.hide = Math.floor(this.inventory.hide / 2);
    this.inventory.meat = Math.floor(this.inventory.meat / 2);
  }

  _rewardEmoji(type) {
    return {
      wood: '🪵',
      berry: '🫐',
      fish: '🐟',
      hide: '🟫',
      meat: '🥩',
      cookedMeat: '🍖',
    }[type] || '';
  }

  // Spelaren kan trycka H för att äta och läka
  eatToHeal() {
    if (this.inventory.cookedMeat > 0) {
      this.inventory.cookedMeat -= 1;
      const healed = this.player.heal(40);
      this.ui.showToast(`🍖 +${healed} ❤️`);
      return true;
    }
    if (this.inventory.berry > 0) {
      this.inventory.berry -= 1;
      const healed = this.player.heal(10);
      this.ui.showToast(`🫐 +${healed} ❤️`);
      return true;
    }
    if (this.inventory.fish > 0) {
      this.inventory.fish -= 1;
      const healed = this.player.heal(15);
      this.ui.showToast(`🐟 +${healed} ❤️`);
      return true;
    }
    this.ui.showToast('Du har inget att äta!');
    return false;
  }
}
