import * as THREE from 'three';

// Pris för försäljning - inställt centralt så det är lätt att justera
export const PRICES = {
  wood: 2,
  berry: 1,
  fish: 5,
  hide: 8,
  meat: 6,
  cookedMeat: 12,
};

// Bas-klass: gemensam logik för allt man kan interagera med
class Harvestable {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position.clone();
    this.active = true;
    this.respawnTimer = 0;
  }

  isActive() {
    return this.active;
  }

  canHarvest(upgrades, inventory) {
    return this.active && !inventory.isFull();
  }

  update(dt) {
    if (!this.active) {
      this.respawnTimer += dt;
      if (this.respawnTimer >= this.respawnTime) {
        this.respawn();
      }
    }
  }
}

// Träd - tre staplade koner som julgranar (enligt Melwins koncept)
export class Tree extends Harvestable {
  constructor(scene, position) {
    super(scene, position);
    this.respawnTime = 8;
    this.label = 'trädet';
    this.actionLabel = 'Hugg';
    this.actionType = 'chop';

    this.group = new THREE.Group();

    // Slumpa storlek lite för variation
    const scale = 0.85 + Math.random() * 0.4;
    this.group.scale.setScalar(scale);

    // Stam
    this.trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x6d4c2a }),
    );
    this.trunk.position.y = 1.1;
    this.trunk.castShadow = true;
    this.group.add(this.trunk);

    // Tre koner ovanpå varandra (julgransstil)
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
    this.cones = [];
    const coneData = [
      { radius: 1.6, height: 1.6, y: 2.3 },
      { radius: 1.3, height: 1.4, y: 3.0 },
      { radius: 0.95, height: 1.2, y: 3.6 },
    ];
    for (const c of coneData) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(c.radius, c.height, 8), coneMat);
      cone.position.y = c.y;
      cone.castShadow = true;
      this.group.add(cone);
      this.cones.push(cone);
    }

    // Stubbe (visas när trädet är hugget)
    this.stump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x5d3a1a }),
    );
    this.stump.position.y = 0.18;
    this.stump.castShadow = true;
    this.stump.visible = false;
    this.group.add(this.stump);

    this.group.position.copy(position);
    this.group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(this.group);
  }

  getHarvestDuration(upgrades) {
    return upgrades.getAxeChopTime();
  }

  harvest() {
    this.active = false;
    this.trunk.visible = false;
    this.cones.forEach((c) => (c.visible = false));
    this.stump.visible = true;
    this.respawnTimer = 0;
    return { type: 'wood', amount: 1 };
  }

  respawn() {
    this.active = true;
    this.trunk.visible = true;
    this.cones.forEach((c) => (c.visible = true));
    this.stump.visible = false;
  }
}

// Bärbuske - grön sfär med små blå bär
export class Bush extends Harvestable {
  constructor(scene, position) {
    super(scene, position);
    this.respawnTime = 5;
    this.label = 'busken';
    this.actionLabel = 'Plocka';
    this.actionType = 'pick';

    this.group = new THREE.Group();

    this.bush = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x388e3c }),
    );
    this.bush.position.y = 0.7;
    this.bush.castShadow = true;
    this.group.add(this.bush);

    // Blå bär (enligt skissen)
    this.berries = [];
    const berryMat = new THREE.MeshStandardMaterial({ color: 0x1565c0 });
    for (let i = 0; i < 8; i++) {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), berryMat);
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const radius = 0.78;
      berry.position.set(
        Math.cos(angle) * radius,
        0.7 + (Math.random() - 0.5) * 0.5,
        Math.sin(angle) * radius,
      );
      this.berries.push(berry);
      this.group.add(berry);
    }

    this.group.position.copy(position);
    scene.add(this.group);
  }

  getHarvestDuration(_upgrades) {
    return 0.5;
  }

  harvest() {
    this.active = false;
    this.berries.forEach((b) => (b.visible = false));
    this.bush.material.color.setHex(0x5d4a36);
    this.respawnTimer = 0;
    return { type: 'berry', amount: 1 };
  }

  respawn() {
    this.active = true;
    this.berries.forEach((b) => (b.visible = true));
    this.bush.material.color.setHex(0x388e3c);
  }
}

// Lägereld - laga rått kött till tillagat kött
export class Campfire {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position.clone();
    this.label = 'lägerelden';
    this.actionLabel = 'Laga mat';
    this.actionType = 'cook';
    this.flickerTime = 0;
    this.active = true;

    this.group = new THREE.Group();

    // Stenring
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.22, 0),
        stoneMat,
      );
      stone.position.set(Math.cos(angle) * 0.7, 0.15, Math.sin(angle) * 0.7);
      stone.rotation.y = Math.random() * Math.PI;
      stone.castShadow = true;
      this.group.add(stone);
    }

    // Korsade stockar
    const logMat = new THREE.MeshStandardMaterial({ color: 0x5d3a1a });
    const log1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6), logMat);
    log1.rotation.z = Math.PI / 2;
    log1.position.y = 0.1;
    this.group.add(log1);
    const log2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6), logMat);
    log2.rotation.x = Math.PI / 2;
    log2.position.y = 0.1;
    this.group.add(log2);

    // Lågor - två koner som flimrar
    this.flame1 = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.9, 6),
      new THREE.MeshStandardMaterial({
        color: 0xff5722,
        emissive: 0xff5722,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.flame1.position.y = 0.55;
    this.group.add(this.flame1);

    this.flame2 = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.6, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffeb3b,
        emissive: 0xffeb3b,
        emissiveIntensity: 1,
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.flame2.position.y = 0.7;
    this.group.add(this.flame2);

    // Ljus från elden (ger fin atmosfär på natten)
    this.light = new THREE.PointLight(0xff8a3d, 2.5, 14, 2);
    this.light.position.y = 1.5;
    this.group.add(this.light);

    this.group.position.copy(position);
    scene.add(this.group);
  }

  isActive() {
    return true;
  }

  canHarvest(_upgrades, inventory) {
    return inventory.meat > 0;
  }

  getHarvestDuration() {
    return 1.5;
  }

  harvest() {
    return { type: 'cook', amount: 1 };
  }

  update(dt) {
    this.flickerTime += dt * 8;
    const flicker = 0.85 + Math.sin(this.flickerTime) * 0.15;
    this.flame1.scale.set(flicker, 0.85 + Math.cos(this.flickerTime * 1.3) * 0.15, flicker);
    this.flame2.scale.set(
      0.9 + Math.sin(this.flickerTime * 1.7) * 0.1,
      0.9 + Math.cos(this.flickerTime * 2.1) * 0.1,
      0.9 + Math.sin(this.flickerTime * 1.7) * 0.1,
    );
    this.light.intensity = 2.2 + Math.sin(this.flickerTime * 1.5) * 0.4;
  }
}

// Fiskeplats - en träbrygga vid sjön
export class FishingSpot extends Harvestable {
  constructor(scene, position) {
    super(scene, position);
    this.respawnTime = 0.5;
    this.label = 'sjön';
    this.actionLabel = 'Fiska';
    this.actionType = 'fish';

    this.group = new THREE.Group();

    // Brygga
    const dock = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.25, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x8d6e63 }),
    );
    dock.position.y = 0.12;
    dock.castShadow = true;
    dock.receiveShadow = true;
    this.group.add(dock);

    // Stolpar
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    for (const [x, z] of [
      [-0.9, -0.6],
      [0.9, -0.6],
      [-0.9, 0.6],
      [0.9, 0.6],
    ]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), postMat);
      post.position.set(x, 0.0, z);
      this.group.add(post);
    }

    this.group.position.copy(position);
    scene.add(this.group);
  }

  getHarvestDuration(upgrades) {
    return upgrades.getFishTime();
  }

  harvest() {
    this.active = false;
    this.respawnTimer = 0;
    return { type: 'fish', amount: 1 };
  }

  respawn() {
    this.active = true;
  }
}
