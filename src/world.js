import * as THREE from 'three';
import { Tree, Bush, FishingSpot } from './resources.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.interactables = [];

    this.createGround();
    this.createPond();
    this.createFlowers();
    this.spawnTrees();
    this.spawnBushes();
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x6fbf4b }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Mörkare cirklar för variation
    for (let i = 0; i < 20; i++) {
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(2 + Math.random() * 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a9b2e }),
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(
        (Math.random() - 0.5) * 160,
        0.01,
        (Math.random() - 0.5) * 160,
      );
      patch.receiveShadow = true;
      this.scene.add(patch);
    }
  }

  createPond() {
    this.pondCenter = new THREE.Vector3(22, 0, 22);
    this.pondRadius = 8;

    // Vatten
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

    // Strand (mörkare ring under vattnet)
    const sand = new THREE.Mesh(
      new THREE.RingGeometry(this.pondRadius, this.pondRadius + 1.5, 32),
      new THREE.MeshStandardMaterial({ color: 0xc8a965 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(this.pondCenter.x, 0.02, this.pondCenter.z);
    this.scene.add(sand);

    // Fiskeplats vid kanten - bryggan står på land men "pekar" mot vattnet
    const fishingPos = new THREE.Vector3(
      this.pondCenter.x - this.pondRadius - 0.5,
      0,
      this.pondCenter.z,
    );
    const spot = new FishingSpot(this.scene, fishingPos);
    spot.group.rotation.y = Math.PI / 2; // vrid bryggan
    this.interactables.push(spot);
  }

  createFlowers() {
    const flowerColors = [0xe91e63, 0xffeb3b, 0xffffff, 0xff5722];
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;
      if (this._inPond(x, z, 2)) continue;
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
    while (positions.length < 30 && attempts < 400) {
      attempts++;
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;
      if (this._inPond(x, z, 4)) continue;
      if (new THREE.Vector2(x, z).length() < 8) continue; // håll spawn fritt
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
      const x = (Math.random() - 0.5) * 150;
      const z = (Math.random() - 0.5) * 150;
      if (this._inPond(x, z, 3)) continue;
      if (new THREE.Vector2(x, z).length() < 6) continue;
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

  getNearestInteractable(position, maxDistance) {
    let nearest = null;
    let minDist = maxDistance;
    for (const obj of this.interactables) {
      if (!obj.isActive()) continue;
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
