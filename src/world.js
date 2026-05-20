import * as THREE from 'three';
import { Tree, Bush, FishingSpot, Campfire } from './resources.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.interactables = [];

    // Lägrets center & radie - används för säker zon mot vargar
    this.campCenter = new THREE.Vector3(0, 0, -8);
    this.campRadius = 7;

    this.createGround();
    this.createCamp();
    this.createPond();
    this.createCave();
    this.createFlowers();
    this.spawnTrees();
    this.spawnBushes();
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x6fbf4b }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    for (let i = 0; i < 20; i++) {
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(2 + Math.random() * 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a9b2e }),
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set((Math.random() - 0.5) * 160, 0.01, (Math.random() - 0.5) * 160);
      patch.receiveShadow = true;
      this.scene.add(patch);
    }
  }

  // Litet läger: trämur runt, hydda, eld i mitten
  createCamp() {
    const c = this.campCenter;
    const r = this.campRadius;

    // Stenring runt elden / golv av jord
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(r, 32),
      new THREE.MeshStandardMaterial({ color: 0x8d6e63 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(c.x, 0.02, c.z);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Trämur runt lägret - palissad av stockar med en öppning i söder
    const logMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2a });
    const segments = 40;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      // Lämna en öppning rakt fram (söderut, mot +z)
      const angleDeg = (angle * 180) / Math.PI;
      if (angleDeg > 70 && angleDeg < 110) continue;
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.2, 2.0, 6),
        logMat,
      );
      log.position.set(c.x + Math.cos(angle) * r, 1.0, c.z + Math.sin(angle) * r);
      log.rotation.y = angle;
      // Tillsätt liten variation i höjd
      log.position.y += Math.random() * 0.2;
      log.castShadow = true;
      log.receiveShadow = true;
      this.scene.add(log);
    }

    // Hyddan i bortre änden av lägret
    this._createHut(new THREE.Vector3(c.x - 2, 0, c.z - 4));

    // Lägereld i mitten
    const fire = new Campfire(this.scene, new THREE.Vector3(c.x, 0, c.z));
    this.interactables.push(fire);
    this.campfire = fire;
  }

  _createHut(pos) {
    const hut = new THREE.Group();

    // Väggar - brun låda
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x8d6e63 }),
    );
    walls.position.y = 1;
    walls.castShadow = true;
    walls.receiveShadow = true;
    hut.add(walls);

    // Tak - kon
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 1.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x5d3a1a }),
    );
    roof.position.y = 2.75;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    hut.add(roof);

    // Dörr
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.3, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x4e342e }),
    );
    door.position.set(0, 0.65, 1.27);
    hut.add(door);

    // Fönster
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x90caf9, emissive: 0x90caf9, emissiveIntensity: 0.2 }),
    );
    win.position.set(0.9, 1.2, 1.27);
    hut.add(win);

    hut.position.copy(pos);
    this.scene.add(hut);
  }

  createPond() {
    this.pondCenter = new THREE.Vector3(22, 0, 22);
    this.pondRadius = 8;

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(this.pondRadius, 32),
      new THREE.MeshStandardMaterial({
        color: 0x2196f3,
        transparent: true,
        opacity: 0.85,
        metalness: 0.3,
        roughness: 0.2,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(this.pondCenter.x, 0.05, this.pondCenter.z);
    this.scene.add(water);

    const sand = new THREE.Mesh(
      new THREE.RingGeometry(this.pondRadius, this.pondRadius + 1.5, 32),
      new THREE.MeshStandardMaterial({ color: 0xc8a965 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(this.pondCenter.x, 0.02, this.pondCenter.z);
    this.scene.add(sand);

    const fishingPos = new THREE.Vector3(
      this.pondCenter.x - this.pondRadius - 0.5,
      0,
      this.pondCenter.z,
    );
    const spot = new FishingSpot(this.scene, fishingPos);
    spot.group.rotation.y = Math.PI / 2;
    this.interactables.push(spot);
  }

  // Stor mörk grotta i utkanten - hyser björnen
  createCave() {
    this.caveCenter = new THREE.Vector3(-30, 0, 18);

    // Grottberg - tre mörka sfärer som bildar en kulle med öppning
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.95 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 10), stoneMat);
    dome.position.set(this.caveCenter.x, 4, this.caveCenter.z - 2);
    dome.castShadow = true;
    dome.receiveShadow = true;
    this.scene.add(dome);

    const side1 = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 10), stoneMat);
    side1.position.set(this.caveCenter.x - 5, 2.5, this.caveCenter.z - 1);
    side1.castShadow = true;
    this.scene.add(side1);

    const side2 = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 10), stoneMat);
    side2.position.set(this.caveCenter.x + 5, 2.5, this.caveCenter.z - 1);
    side2.castShadow = true;
    this.scene.add(side2);

    // Mörk öppning
    const opening = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 3.5, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    opening.position.set(this.caveCenter.x, 1.75, this.caveCenter.z + 2.5);
    this.scene.add(opening);

    // Stenar runt
    for (let i = 0; i < 6; i++) {
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.6, 0),
        stoneMat,
      );
      const angle = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 3;
      stone.position.set(
        this.caveCenter.x + Math.cos(angle) * r,
        0.4,
        this.caveCenter.z + Math.sin(angle) * r,
      );
      stone.rotation.y = Math.random() * Math.PI;
      stone.castShadow = true;
      this.scene.add(stone);
    }
  }

  createFlowers() {
    const flowerColors = [0xe91e63, 0xffeb3b, 0xffffff, 0xff5722];
    for (let i = 0; i < 80; i++) {
      const x = (Math.random() - 0.5) * 170;
      const z = (Math.random() - 0.5) * 170;
      if (this._inPond(x, z, 2)) continue;
      if (this._inCamp(x, z, 1)) continue;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 5, 4),
        new THREE.MeshStandardMaterial({
          color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
        }),
      );
      flower.position.set(x, 0.15, z);
      this.scene.add(flower);
    }
  }

  spawnTrees() {
    const positions = [];
    let attempts = 0;
    while (positions.length < 35 && attempts < 500) {
      attempts++;
      const x = (Math.random() - 0.5) * 170;
      const z = (Math.random() - 0.5) * 170;
      if (this._inPond(x, z, 4)) continue;
      if (this._inCamp(x, z, 2)) continue;
      if (this._inCave(x, z, 5)) continue;
      if (new THREE.Vector2(x, z).length() < 6) continue;
      let tooClose = false;
      for (const p of positions) {
        if (new THREE.Vector2(x - p.x, z - p.z).length() < 5) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      positions.push({ x, z });
      const tree = new Tree(this.scene, new THREE.Vector3(x, 0, z));
      this.interactables.push(tree);
    }
  }

  spawnBushes() {
    let placed = 0;
    let attempts = 0;
    while (placed < 18 && attempts < 200) {
      attempts++;
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;
      if (this._inPond(x, z, 3)) continue;
      if (this._inCamp(x, z, 2)) continue;
      if (this._inCave(x, z, 5)) continue;
      if (new THREE.Vector2(x, z).length() < 5) continue;
      const bush = new Bush(this.scene, new THREE.Vector3(x, 0, z));
      this.interactables.push(bush);
      placed++;
    }
  }

  _inPond(x, z, margin = 0) {
    const dx = x - this.pondCenter.x;
    const dz = z - this.pondCenter.z;
    return Math.sqrt(dx * dx + dz * dz) < this.pondRadius + margin;
  }

  _inCamp(x, z, margin = 0) {
    const dx = x - this.campCenter.x;
    const dz = z - this.campCenter.z;
    return Math.sqrt(dx * dx + dz * dz) < this.campRadius + margin;
  }

  _inCave(x, z, margin = 0) {
    const dx = x - this.caveCenter.x;
    const dz = z - this.caveCenter.z;
    return Math.sqrt(dx * dx + dz * dz) < 7 + margin;
  }

  isInCamp(position) {
    return this._inCamp(position.x, position.z, 0);
  }

  getNearestInteractable(position, maxDistance) {
    let nearest = null;
    let minDist = maxDistance;
    for (const obj of this.interactables) {
      if (!obj.isActive || !obj.isActive()) continue;
      const dist = obj.position.distanceTo(position);
      if (dist < minDist) {
        minDist = dist;
        nearest = obj;
      }
    }
    return nearest;
  }

  update(dt) {
    for (const obj of this.interactables) obj.update(dt);
  }
}
