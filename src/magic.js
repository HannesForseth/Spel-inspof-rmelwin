import * as THREE from 'three';
import { cloneModel } from './models.js';

export const SPELLS = {
  fireball: {
    key: 'fireball',
    label: '🔥 Eldboll',
    description: 'Brännande projektil — 25 skada',
    type: 'projectile',
    modelUrl: '/models/magi/fireball.glb',
    manaCost: 20,
    cooldown: 1.5,
    damage: 25,
    speed: 18,
    lifetime: 3,
    color: 0xff5500,
    castAnim: 'Cast_Projectile',
    impactDelay: 0.3,
  },
  iceball: {
    key: 'iceball',
    label: '❄️ Isboll',
    description: 'Frysande projektil — 20 skada, sänker fienden',
    type: 'projectile',
    modelUrl: '/models/magi/iceball.glb',
    manaCost: 25,
    cooldown: 2.0,
    damage: 20,
    speed: 15,
    lifetime: 3,
    color: 0x55aaff,
    castAnim: 'Cast_Projectile',
    impactDelay: 0.3,
    slow: 0.5,
  },
  lightning: {
    key: 'lightning',
    label: '⚡ Blixt-AOE',
    description: 'Träffar alla fiender inom 7m — 40 skada',
    type: 'aoe',
    modelUrl: '/models/magi/lightning_bolt.glb',
    manaCost: 40,
    cooldown: 3.5,
    damage: 40,
    radius: 7,
    color: 0xaaccff,
    castAnim: 'Cast_AOE',
    impactDelay: 0.55,
  },
};

export class SpellProjectile {
  constructor(scene, spell, originPos, dirVec) {
    this.scene = scene;
    this.spell = spell;
    this.position = originPos.clone();
    this.velocity = dirVec.clone().normalize().multiplyScalar(spell.speed);
    this.lifetime = spell.lifetime;
    this.alive = true;
    this.mesh = null;

    this.light = new THREE.PointLight(spell.color, 1.8, 8);
    this.light.position.copy(this.position);
    scene.add(this.light);

    this._loadMesh();
  }

  async _loadMesh() {
    const { root } = await cloneModel(this.spell.modelUrl);
    if (!this.alive) return;
    root.position.copy(this.position);
    root.scale.setScalar(0.5);
    this.scene.add(root);
    this.mesh = root;
  }

  update(dt) {
    if (!this.alive) return;
    this.position.addScaledVector(this.velocity, dt);
    this.lifetime -= dt;
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.x += dt * 5;
      this.mesh.rotation.y += dt * 7;
    }
    this.light.position.copy(this.position);
    if (this.position.y < 0) this.destroy();
    if (this.lifetime <= 0) this.destroy();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    if (this.mesh) this.scene.remove(this.mesh);
    this.scene.remove(this.light);
  }
}

export class AOEEffect {
  constructor(scene, originPos, spell, targets) {
    this.scene = scene;
    this.spell = spell;
    this.position = originPos.clone();
    this.lifetime = 0.7;
    this.maxLifetime = 0.7;
    this.alive = true;
    this.bolts = [];

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(spell.radius - 0.2, spell.radius, 64),
      new THREE.MeshBasicMaterial({
        color: spell.color,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(originPos);
    this.ring.position.y = 0.05;
    scene.add(this.ring);

    this.light = new THREE.PointLight(spell.color, 4, spell.radius * 2);
    this.light.position.copy(originPos);
    this.light.position.y = 2.5;
    scene.add(this.light);

    for (const t of targets) {
      this._spawnBolt(t.position.clone());
    }
  }

  async _spawnBolt(pos) {
    const { root } = await cloneModel(this.spell.modelUrl);
    if (!this.alive) return;
    root.position.copy(pos);
    root.scale.setScalar(0.8);
    this.scene.add(root);
    this.bolts.push(root);
  }

  update(dt) {
    if (!this.alive) return;
    this.lifetime -= dt;
    const t = Math.max(0, this.lifetime / this.maxLifetime);
    this.ring.material.opacity = 0.75 * t;
    this.light.intensity = 4 * t;
    for (const b of this.bolts) {
      b.scale.setScalar(0.8 * (0.5 + t));
    }
    if (this.lifetime <= 0) this.destroy();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.scene.remove(this.ring);
    this.scene.remove(this.light);
    for (const b of this.bolts) this.scene.remove(b);
  }
}
