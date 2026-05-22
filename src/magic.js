import * as THREE from 'three';
import { cloneModel } from './models.js';

export const SPELLS = {
  fireball: {
    key: 'fireball',
    label: '🔥 Eldboll',
    description: 'Brännande projektil — 25 skada',
    type: 'projectile',
    modelUrl: '/models/magi/magic_fireball.glb',
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
    modelUrl: '/models/magi/magic_iceball.glb',
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
    modelUrl: '/models/magi/magic_lightning.glb',
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
    this.pulse = 0;

    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 18, 18),
      new THREE.MeshBasicMaterial({
        color: spell.color,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.aura.position.copy(this.position);
    scene.add(this.aura);

    this.haloMaterial = new THREE.MeshBasicMaterial({
      color: spell.color,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 16), this.haloMaterial);
    this.halo.position.copy(this.position);
    scene.add(this.halo);

    this.light = new THREE.PointLight(spell.color, 5, 14);
    this.light.position.copy(this.position);
    scene.add(this.light);

    this._loadMesh();
  }

  async _loadMesh() {
    const { root } = await cloneModel(this.spell.modelUrl);
    if (!this.alive) return;
    root.traverse((obj) => {
      if (obj.material) {
        obj.material.emissive = new THREE.Color(this.spell.color);
        obj.material.emissiveIntensity = 3.5;
        obj.material.toneMapped = false;
      }
    });
    root.position.copy(this.position);
    root.scale.setScalar(1.0);
    this.scene.add(root);
    this.mesh = root;
  }

  update(dt) {
    if (!this.alive) return;
    this.position.addScaledVector(this.velocity, dt);
    this.lifetime -= dt;
    this.pulse += dt * 14;
    const breath = 1 + Math.sin(this.pulse) * 0.18;
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.x += dt * 5;
      this.mesh.rotation.y += dt * 7;
      this.mesh.scale.setScalar(breath);
    }
    this.aura.position.copy(this.position);
    this.aura.scale.setScalar(breath);
    this.halo.position.copy(this.position);
    this.halo.scale.setScalar(1 + Math.sin(this.pulse * 0.7) * 0.25);
    this.haloMaterial.opacity = 0.25 + Math.sin(this.pulse * 0.7) * 0.1;
    this.light.position.copy(this.position);
    this.light.intensity = 5 + Math.sin(this.pulse) * 1.5;
    if (this.position.y < 0) this.destroy();
    if (this.lifetime <= 0) this.destroy();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    if (this.mesh) this.scene.remove(this.mesh);
    this.scene.remove(this.aura);
    this.scene.remove(this.halo);
    this.scene.remove(this.light);
  }
}

export class AOEEffect {
  constructor(scene, originPos, spell, targets) {
    this.scene = scene;
    this.spell = spell;
    this.position = originPos.clone();
    this.lifetime = 0.9;
    this.maxLifetime = 0.9;
    this.alive = true;
    this.bolts = [];

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(spell.radius - 0.5, spell.radius, 96),
      new THREE.MeshBasicMaterial({
        color: spell.color,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(originPos);
    this.ring.position.y = originPos.y + 0.06;
    scene.add(this.ring);

    this.fillDisc = new THREE.Mesh(
      new THREE.CircleGeometry(spell.radius, 64),
      new THREE.MeshBasicMaterial({
        color: spell.color,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.fillDisc.rotation.x = -Math.PI / 2;
    this.fillDisc.position.copy(originPos);
    this.fillDisc.position.y = originPos.y + 0.05;
    scene.add(this.fillDisc);

    this.flashSphere = new THREE.Mesh(
      new THREE.SphereGeometry(2, 18, 18),
      new THREE.MeshBasicMaterial({
        color: spell.color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flashSphere.position.copy(originPos);
    this.flashSphere.position.y = originPos.y + 1.5;
    scene.add(this.flashSphere);

    this.light = new THREE.PointLight(spell.color, 12, spell.radius * 3);
    this.light.position.copy(originPos);
    this.light.position.y = originPos.y + 3;
    scene.add(this.light);

    for (const t of targets) {
      this._spawnBolt(t.position.clone());
    }
  }

  async _spawnBolt(pos) {
    const { root } = await cloneModel(this.spell.modelUrl);
    if (!this.alive) return;
    root.traverse((obj) => {
      if (obj.material) {
        obj.material.emissive = new THREE.Color(this.spell.color);
        obj.material.emissiveIntensity = 4;
        obj.material.toneMapped = false;
      }
    });
    root.position.copy(pos);
    root.scale.setScalar(1.5);
    this.scene.add(root);
    this.bolts.push(root);
  }

  update(dt) {
    if (!this.alive) return;
    this.lifetime -= dt;
    const t = Math.max(0, this.lifetime / this.maxLifetime);
    const growth = 1 - t;
    this.ring.material.opacity = t;
    this.ring.scale.setScalar(0.4 + growth * 0.7);
    this.fillDisc.material.opacity = 0.55 * t;
    this.fillDisc.scale.setScalar(0.3 + growth);
    this.flashSphere.material.opacity = 0.9 * Math.pow(t, 2);
    this.flashSphere.scale.setScalar(1 + growth * 3);
    this.light.intensity = 12 * t;
    for (const b of this.bolts) {
      b.scale.setScalar(1.5 * (0.6 + t * 0.6));
      b.rotation.y += dt * 8;
    }
    if (this.lifetime <= 0) this.destroy();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.scene.remove(this.ring);
    this.scene.remove(this.fillDisc);
    this.scene.remove(this.flashSphere);
    this.scene.remove(this.light);
    for (const b of this.bolts) this.scene.remove(b);
  }
}
