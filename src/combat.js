import * as THREE from 'three';

// Pilar med autosikte. Skapas av game.js, flyger mot target.
export class Arrow {
  constructor(scene, fromPos, target, damage) {
    this.scene = scene;
    this.target = target;
    this.damage = damage;
    this.speed = 35;
    this.alive = true;
    this.lifetime = 0;
    this.maxLifetime = 3;

    const group = new THREE.Group();

    // Skaft
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: 0xa1887f }),
    );
    shaft.rotation.z = Math.PI / 2;
    group.add(shaft);

    // Spets
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.7 }),
    );
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.4;
    group.add(tip);

    // Fjäder
    const fletch = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.15, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xffeb3b }),
    );
    fletch.position.x = -0.3;
    group.add(fletch);

    group.position.copy(fromPos);
    // fromPos är redan player y + 1.5 från Game._aboveSource, ingen override
    this.group = group;
    scene.add(group);
  }

  update(dt) {
    if (!this.alive) return;
    this.lifetime += dt;
    if (this.lifetime > this.maxLifetime) {
      this._destroy();
      return;
    }

    // Hitta riktningen till målet
    let targetPos;
    if (this.target && this.target.alive) {
      targetPos = this.target.position.clone();
      // Sikta på målets bröstkorg (relativt dess terräng-y, inte absolut)
      targetPos.y = this.target.position.y + 1;
    } else {
      // Mål dödat eller borta — fortsätt rakt fram
      this._destroy();
      return;
    }

    const dir = new THREE.Vector3().subVectors(targetPos, this.group.position);
    const dist = dir.length();
    if (dist < 0.6) {
      // Träff!
      this.target.takeDamage(this.damage, this.group.position);
      this._destroy();
      return;
    }

    dir.normalize();
    this.group.position.addScaledVector(dir, this.speed * dt);

    // Rikta pilen mot färdriktningen
    const yaw = Math.atan2(dir.x, dir.z);
    this.group.rotation.y = yaw - Math.PI / 2;
  }

  _destroy() {
    this.alive = false;
    this.scene.remove(this.group);
  }
}

// Hitta närmaste levande djur inom range (för autosikte)
export function findNearestTarget(playerPos, creatures, maxRange) {
  let nearest = null;
  let minDist = maxRange;
  for (const c of creatures) {
    if (!c.alive) continue;
    const dx = c.position.x - playerPos.x;
    const dz = c.position.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < minDist) {
      minDist = dist;
      nearest = c;
    }
  }
  return nearest;
}

// Visuell effekt: blod-/skadepartiklar
export class HitEffect {
  constructor(scene, pos, color = 0xff5722) {
    this.scene = scene;
    this.alive = true;
    this.lifetime = 0;
    this.maxLifetime = 0.5;

    this.group = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 4, 3),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
      );
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.3;
      p.position.set(Math.cos(angle) * r, 0.5 + Math.random() * 0.5, Math.sin(angle) * r);
      p.userData.vel = new THREE.Vector3(
        Math.cos(angle) * 2 * Math.random(),
        2 + Math.random() * 2,
        Math.sin(angle) * 2 * Math.random(),
      );
      this.group.add(p);
    }
    this.group.position.copy(pos);
    scene.add(this.group);
  }

  update(dt) {
    if (!this.alive) return;
    this.lifetime += dt;
    if (this.lifetime > this.maxLifetime) {
      this.alive = false;
      this.scene.remove(this.group);
      return;
    }
    for (const p of this.group.children) {
      p.userData.vel.y -= 8 * dt;
      p.position.x += p.userData.vel.x * dt;
      p.position.y += p.userData.vel.y * dt;
      p.position.z += p.userData.vel.z * dt;
      p.scale.setScalar(1 - this.lifetime / this.maxLifetime);
    }
  }
}
