import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { Inventory } from './inventory.js';
import { Upgrades } from './upgrades.js';
import { UI } from './ui.js';
import { Save } from './save.js';
import { DayNight } from './daynight.js';
import { Rabbit, Deer, Bear, Wolf, Troll } from './creatures.js';
import { Arrow, HitEffect, findNearestTarget } from './combat.js';
import { net } from './net.js';
import { RemotePlayer } from './remotePlayer.js';
import { isTouchDevice, vibrate } from './mobileControls.js';
import { SPELLS, SpellProjectile, AOEEffect } from './magic.js';

const INPUT_SEND_HZ = 20;
const INPUT_SEND_INTERVAL = 1 / INPUT_SEND_HZ;

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

    this.isMobile = isTouchDevice();
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(
      this.isMobile
        ? Math.min(window.devicePixelRatio, 1.25)
        : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.isMobile
      ? THREE.BasicShadowMap
      : THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    if (this.isMobile) {
      this.scene.fog = new THREE.Fog(0x87ceeb, 45, 130);
    }

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
    this._spawnTroll();

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
    this.cameraShake = 0;
    this.cameraShakeIntensity = 0;

    this.remotePlayers = new Map();
    this.inputSendTimer = 0;

    this.spellProjectiles = [];
    this.aoeEffects = [];
    this.spellCooldowns = [0, 0];
    net.addEventListener('world:state', (e) => this._onWorldState(e.detail));
    net.addEventListener('player:left', (e) =>
      this._removeRemotePlayer(e.detail.userId),
    );

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
    // Björnen står inuti grottkammaren - väntar på inkräktare
    const cavePos = this.world.caveCenter;
    const bearPos = new THREE.Vector3(cavePos.x, 0, cavePos.z - 3);
    this.bear = new Bear(this.scene, bearPos);
    this.creatures.push(this.bear);
  }

  _spawnTroll() {
    // Trollet bor långt borta vid en stenformation på motsatt sida av sjön
    const trollPos = this.world.trollLairCenter || new THREE.Vector3(70, 0, -60);
    this.troll = new Troll(this.scene, trollPos);
    this.creatures.push(this.troll);
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
      // Räkna ut tänkt ny position och låt världen lösa kollisioner
      const distance = speed * dt;
      const intended = this.player.position.clone();
      intended.x += moveVec.x * distance;
      intended.z += moveVec.z * distance;
      const resolved = this.world.resolveCollision(this.player.position, intended);
      // Beräkna faktisk rörelseriktning för animationen
      const dx = resolved.x - this.player.position.x;
      const dz = resolved.z - this.player.position.z;
      const actualDist = Math.sqrt(dx * dx + dz * dz);
      if (actualDist > 0.001) {
        const dir = new THREE.Vector3(dx / actualDist, 0, dz / actualDist);
        this.player.position.x = resolved.x;
        this.player.position.z = resolved.z;
        this.player.move(dir, actualDist);
      } else {
        this.player.idle(dt);
      }
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
    if (this.controls.consumeToggleCharacter()) {
      this.ui.toggleCharacterPanel();
    }
    if (this.controls.consumeToggleBag()) {
      this.ui.toggleBag();
    }

    // Kolla om spelaren är i sjön (drunkningsmekanik)
    this.player.inWater = this.world._inPond(
      this.player.position.x,
      this.player.position.z,
      -0.3,
    );
    this.player.hasShield = this.player.equipped.shield;
    this.player.hasArmor = this.player.equipped.armor;
    this.player.updatePhysics(dt);
    this.player.updateMana(dt);
    this.player.updateAnimation(dt, moveVec.lengthSq() > 0.001);
    if (!this.player.isAlive()) this._playerDied();

    this.spellCooldowns[0] = Math.max(0, this.spellCooldowns[0] - dt);
    this.spellCooldowns[1] = Math.max(0, this.spellCooldowns[1] - dt);
    if (this.controls.consumeSpell(0)) this._castSpell(0);
    if (this.controls.consumeSpell(1)) this._castSpell(1);

    for (const p of this.spellProjectiles) {
      p.update(dt);
      if (!p.alive) continue;
      for (const c of this._getAllAliveCreatures()) {
        const dx = c.position.x - p.position.x;
        const dz = c.position.z - p.position.z;
        const dy = (c.position.y || 0) + 1 - p.position.y;
        if (dx * dx + dz * dz + dy * dy < 2.25) {
          const killed = c.takeDamage(p.spell.damage, this.player.position);
          this.effects.push(
            new HitEffect(this.scene, p.position.clone(), p.spell.color),
          );
          if (killed) this._onCreatureKilled(c);
          vibrate(40);
          p.destroy();
          break;
        }
      }
    }
    this.spellProjectiles = this.spellProjectiles.filter((p) => p.alive);

    for (const a of this.aoeEffects) a.update(dt);
    this.aoeEffects = this.aoeEffects.filter((a) => a.alive);

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

    // Kameran följer spelaren (med ev. skak)
    this.cameraShake = Math.max(0, this.cameraShake - dt);
    const shakeAmt = this.cameraShake > 0 ? this.cameraShake / 0.25 * this.cameraShakeIntensity : 0;
    const sx = (Math.random() - 0.5) * shakeAmt;
    const sy = (Math.random() - 0.5) * shakeAmt;

    const px = this.player.position.x;
    const pz = this.player.position.z;
    this.camera.position.set(
      px + Math.sin(this.cameraAngle) * this.cameraDistance + sx,
      this.cameraHeight + this.player.position.y * 0.3 + sy,
      pz + Math.cos(this.cameraAngle) * this.cameraDistance,
    );
    this.camera.lookAt(px, 1.2 + this.player.position.y * 0.3, pz);

    // Skördning av träd/bär/fisk/eld + NPC-interaktion
    const nearest = this.world.getNearestInteractable(this.player.position, INTERACT_RANGE);

    // Konsumera E-tryck (en gång per nedtryckning) - används för köpman
    const interactJustPressed = this.controls.consumeInteractPress();
    if (
      !this.ui.shopOpen &&
      nearest &&
      nearest.actionType === 'trade' &&
      interactJustPressed
    ) {
      this.ui.openShop();
    }

    if (
      !this.ui.shopOpen &&
      this.controls.isInteractPressed() &&
      nearest &&
      nearest.actionType !== 'trade' &&
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
      if (nearest.actionType === 'chop') {
        this.player.setChopProgress(this.interactProgress);
      }
      if (this.interactProgress >= 1) {
        // Liten kamera-knyck på huggar-impact
        if (nearest.actionType === 'chop') this._triggerShake(0.15, 0.15);
        this._completeHarvest();
      }
    } else if (this.interactingWith && !this.controls.isInteractPressed()) {
      this._cancelInteraction();
    } else if (this.interactingWith && nearest !== this.interactingWith) {
      this._cancelInteraction();
    }

    // Separation: knuffa isär djur så de inte staplas på varandra eller spelaren
    this._separateCreatures();

    // Uppdatera djur + boss-attacker. Djur kan inte gå i vattnet.
    for (const c of this.creatures) {
      c.update(dt, this.player.position);

      // Knuffa ut ur sjön om de råkar gå i
      if (c.alive && this.world._inPond(c.position.x, c.position.z, -0.2)) {
        const dx = c.position.x - this.world.pondCenter.x;
        const dz = c.position.z - this.world.pondCenter.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.001) {
          const ang = Math.atan2(dz, dx);
          const r =
            this.world.pondAvgRadius +
            Math.sin(ang * 2.3) * 2.8 +
            Math.cos(ang * 1.7) * 2.2;
          const targetR = r + 1.0;
          c.position.x = this.world.pondCenter.x + (dx / dist) * targetR;
          c.position.z = this.world.pondCenter.z + (dz / dist) * targetR;
          c.velocity.x *= -0.3;
          c.velocity.z *= -0.3;
          c.group.position.copy(c.position);
        }
      }

      if (
        (c instanceof Bear || c instanceof Wolf || c instanceof Troll) &&
        c.alive &&
        c.tryAttack(this.player.position)
      ) {
        const defense = this.upgrades.getDefense(this.player.equipped);
        const reduced = Math.max(1, c.attackDamage - defense);
        const hit = this.player.takeDamage(reduced);
        if (hit) {
          const blocked = c.attackDamage - reduced;
          const blockTxt = blocked > 0 ? ` (🛡️ -${blocked})` : '';
          this.ui.showToast(`💢 ${c.label} attackerade dig! -${reduced} ❤️${blockTxt}`);
          this.ui.flashDamage();
          this.effects.push(new HitEffect(this.scene, this.player.position.clone().setY(1.5), 0xf44336));
          this._triggerShake(0.45, 0.4);
          vibrate([60, 30, 40]);
        }
        if (!this.player.isAlive()) {
          this._playerDied();
          vibrate([0, 100, 50, 200]);
        }
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

    // Multiplayer: skicka egen position, uppdatera andra spelare
    for (const rp of this.remotePlayers.values()) rp.update(dt);
    this.inputSendTimer += dt;
    if (this.inputSendTimer >= INPUT_SEND_INTERVAL) {
      this.inputSendTimer = 0;
      this._sendInput();
    }

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
    if (this.player.swinging) return; // ingen spam av attacker
    if (this.player.isChopping) return;

    if (this.isMobile && weapon === 'sword') {
      const target = findNearestTarget(this.player.position, this.creatures, SWORD_RANGE * 1.6);
      if (target) {
        const dx = target.position.x - this.player.position.x;
        const dz = target.position.z - this.player.position.z;
        this.player.facing = Math.atan2(dx, dz);
      }
    }

    if (weapon === 'sword') {
      const dmg = this.upgrades.getSwordDamage();
      if (dmg <= 0) return;
      // Vid impact - slå ALLA djur i framåt-konen (multi-hit)
      this.player.startSwing(() => {
        const targets = this._findSwordTargets();
        if (targets.length === 0) {
          this._triggerShake(0.06, 0.06);
          vibrate(15);
          return;
        }
        for (const t of targets) {
          const killed = t.takeDamage(dmg, this.player.position);
          this.effects.push(new HitEffect(this.scene, t.position.clone().setY(1), 0xffeb3b));
          if (killed) this._onCreatureKilled(t);
        }
        this._triggerShake(0.25, 0.3);
        vibrate([40, 20, 30]);
      });
    } else if (weapon === 'bow') {
      const dmg = this.upgrades.getBowDamage();
      if (dmg <= 0) return;
      if (this.inventory.arrows <= 0) {
        this.ui.showToast('🏹 Slut på pilar! Tillverka hos köpmannen');
        return;
      }
      const range = this.upgrades.getBowRange();
      const lockedTarget = findNearestTarget(this.player.position, this.creatures, range);
      if (!lockedTarget) {
        this.ui.showToast('🏹 Inget djur inom räckvidd');
        return;
      }
      // Konsumera pil och skjut
      this.inventory.arrows -= 1;
      this.player.startSwing(() => {
        const target = lockedTarget.alive
          ? lockedTarget
          : findNearestTarget(this.player.position, this.creatures, range);
        if (target) {
          const arrow = new Arrow(
            this.scene,
            this.player.position.clone().setY(1.5),
            target,
            dmg,
          );
          this.arrows.push(arrow);
          this._triggerShake(0.1, 0.1);
        }
      });
    }
  }

  // Knuffa isär djur så de inte staplas, samt undviker spelaren
  _separateCreatures() {
    const playerSep = 1.0; // minsta avstånd djur ↔ spelare
    const creatureSep = 1.6; // minsta avstånd djur ↔ djur

    for (const c of this.creatures) {
      if (!c.alive) continue;
      // Push från spelaren - så de inte står RAKT på dig
      const pdx = c.position.x - this.player.position.x;
      const pdz = c.position.z - this.player.position.z;
      const pd = Math.sqrt(pdx * pdx + pdz * pdz);
      if (pd < playerSep && pd > 0.01) {
        const push = (playerSep - pd) * 0.6;
        c.position.x += (pdx / pd) * push;
        c.position.z += (pdz / pd) * push;
      }
      // Push från andra djur
      for (const o of this.creatures) {
        if (o === c || !o.alive) continue;
        const dx = c.position.x - o.position.x;
        const dz = c.position.z - o.position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < creatureSep && d > 0.01) {
          const push = (creatureSep - d) * 0.3;
          c.position.x += (dx / d) * push;
          c.position.z += (dz / d) * push;
        }
      }
      c.group.position.copy(c.position);
    }
  }

  // Hittar ALLA djur i framåt-konen inom svärdsräckvidd (multi-hit)
  _findSwordTargets() {
    const facing = this.player.facing;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const targets = [];
    for (const c of this.creatures) {
      if (!c.alive) continue;
      const dx = c.position.x - this.player.position.x;
      const dz = c.position.z - this.player.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > SWORD_RANGE) continue;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < 0.25) continue; // ~75° framåt
      targets.push(c);
    }
    return targets;
  }

  _triggerShake(duration, intensity) {
    if (duration > this.cameraShake) {
      this.cameraShake = duration;
      this.cameraShakeIntensity = intensity;
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

  _sendInput() {
    let action = 'idle';
    if (this.player.hp <= 0) action = 'ghost';
    else if (this.player.swinging) action = 'attack';
    else if (this.player.isChopping) action = 'work';
    else if (
      this.controls.isDown('w') ||
      this.controls.isDown('a') ||
      this.controls.isDown('s') ||
      this.controls.isDown('d')
    ) {
      action = this.controls.isDown('shift') ? 'run' : 'walk';
    }

    net.sendInput({
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      facing: this.player.facing,
      action,
      hp: this.player.hp,
      weapon: this.player.activeWeapon,
    });
  }

  _onWorldState(state) {
    const seen = new Set();
    for (const p of state.players) {
      if (p.userId === net.me?.userId) continue;
      seen.add(p.userId);
      let rp = this.remotePlayers.get(p.userId);
      if (!rp) {
        rp = new RemotePlayer(this.scene, p.userId, p.username);
        rp.position.set(p.x, p.y, p.z);
        this.remotePlayers.set(p.userId, rp);
      }
      rp.setTargetState(p);
    }
    for (const [id, rp] of this.remotePlayers) {
      if (!seen.has(id)) {
        rp.destroy();
        this.remotePlayers.delete(id);
      }
    }
  }

  _removeRemotePlayer(userId) {
    const rp = this.remotePlayers.get(userId);
    if (rp) {
      rp.destroy();
      this.remotePlayers.delete(userId);
    }
  }

  _getAllAliveCreatures() {
    const list = [];
    for (const c of this.creatures) if (c.alive) list.push(c);
    for (const w of this.wolves) if (w.alive) list.push(w);
    if (this.bear?.alive) list.push(this.bear);
    if (this.troll?.alive) list.push(this.troll);
    return list;
  }

  _castSpell(slot) {
    const key = this.upgrades.getEquippedSpell(slot);
    if (!key) {
      this.ui.showToast('Ingen magi i den slotten');
      return;
    }
    if (this.spellCooldowns[slot] > 0) {
      this.ui.showToast(`🔄 ${this.spellCooldowns[slot].toFixed(1)}s kvar`);
      return;
    }
    const spell = SPELLS[key];
    if (!spell) return;
    if (!this.player.useMana(spell.manaCost)) {
      this.ui.showToast('💧 Otillräckligt med mana');
      return;
    }
    this.spellCooldowns[slot] = spell.cooldown;

    if (spell.type === 'projectile') {
      this.player.facing = Math.atan2(
        -Math.sin(this.cameraAngle),
        -Math.cos(this.cameraAngle),
      );
    }

    this.player.triggerCast(spell.castAnim);
    vibrate(25);

    const playerPos = this.player.position.clone();

    setTimeout(() => {
      if (!this.player.isAlive()) return;
      const handPos = new THREE.Vector3();
      this.player.getRightHandWorldPosition(handPos);
      if (spell.type === 'projectile') {
        this._spawnSpellProjectile(spell, handPos);
      } else if (spell.type === 'aoe') {
        this._castAOE(spell, playerPos);
      }
    }, spell.impactDelay * 1000);
  }

  _spawnSpellProjectile(spell, origin) {
    const dir = new THREE.Vector3(
      Math.sin(this.player.facing),
      0,
      Math.cos(this.player.facing),
    );
    this.spellProjectiles.push(
      new SpellProjectile(this.scene, spell, origin, dir),
    );
  }

  _castAOE(spell, origin) {
    const targets = this._getAllAliveCreatures().filter(
      (c) => c.position.distanceTo(origin) <= spell.radius,
    );
    for (const t of targets) {
      const killed = t.takeDamage(spell.damage, origin);
      this.effects.push(
        new HitEffect(this.scene, t.position.clone().setY(1), spell.color),
      );
      if (killed) this._onCreatureKilled(t);
    }
    this.aoeEffects.push(new AOEEffect(this.scene, origin, spell, targets));
    this._triggerShake(0.5, 0.5);
    vibrate([100, 50, 80]);
  }
}
