import * as THREE from 'three';
import { Tree, Bush, FishingSpot, Campfire } from './resources.js';
import { Merchant, Anvil } from './npc.js';

const PLAYER_RADIUS = 0.45;
const WORLD_BOUND = 145;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.interactables = [];
    // Hinder för kollision: { x, z, radius }
    this.obstacles = [];
    // Lugnt-animerade meshar (vinden gungar)
    this.swayingTrees = [];
    this.bobbingFlowers = [];
    this.time = 0;

    // Läger - flyttat något så det finns plats omkring
    this.campCenter = new THREE.Vector3(0, 0, -8);
    this.campRadius = 8;

    this.createGround();
    this.createPond();
    this.createCave();
    this.createCamp();
    this.createPaths();
    this.createFlowers();
    this.spawnTrees();
    this.spawnBushes();
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_BOUND * 2.2, WORLD_BOUND * 2.2, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x6fbf4b }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Patches av mörkare grönt
    for (let i = 0; i < 50; i++) {
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(2 + Math.random() * 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a9b2e }),
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(
        (Math.random() - 0.5) * WORLD_BOUND * 1.8,
        0.01,
        (Math.random() - 0.5) * WORLD_BOUND * 1.8,
      );
      patch.receiveShadow = true;
      this.scene.add(patch);
    }
  }

  // Slät, organisk sjö via CatmullRom-kurva genom anchors
  createPond() {
    this.pondCenter = new THREE.Vector3(35, 0, 30);
    this.pondAvgRadius = 14;

    // Anchor-punkter med varierande radie för organisk form
    const numAnchors = 14;
    const anchors = [];
    for (let i = 0; i < numAnchors; i++) {
      const angle = (i / numAnchors) * Math.PI * 2;
      const r =
        this.pondAvgRadius +
        Math.sin(angle * 2.3) * 2.8 +
        Math.cos(angle * 1.7) * 2.2;
      anchors.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
    }
    this.pondAnchors = anchors;

    // Slät kurva genom alla anchors (closed)
    const curve = new THREE.CatmullRomCurve3(anchors, true, 'catmullrom', 0.5);
    const samplePoints = curve.getPoints(96);
    this.pondSamplePoints = samplePoints;

    // Hjälp-funktion för att bygga en shape från skalade punkter
    const makeShape = (scale) => {
      const s = new THREE.Shape();
      s.moveTo(samplePoints[0].x * scale, samplePoints[0].z * scale);
      for (let i = 1; i < samplePoints.length; i++) {
        s.lineTo(samplePoints[i].x * scale, samplePoints[i].z * scale);
      }
      s.closePath();
      return s;
    };

    // Sand-strand: lite större än vattnet
    const sand = new THREE.Mesh(
      new THREE.ShapeGeometry(makeShape(1.13)),
      new THREE.MeshStandardMaterial({ color: 0xd4b487, roughness: 0.95 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(this.pondCenter.x, 0.015, this.pondCenter.z);
    sand.receiveShadow = true;
    this.scene.add(sand);

    // Botten - mörkblå, lite mindre än vattnet och något under marknivå
    const bottom = new THREE.Mesh(
      new THREE.ShapeGeometry(makeShape(0.94)),
      new THREE.MeshStandardMaterial({ color: 0x0d3a52, roughness: 0.9 }),
    );
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(this.pondCenter.x, -0.35, this.pondCenter.z);
    this.scene.add(bottom);

    // Vattenyta - halvtransparent över botten
    this.water = new THREE.Mesh(
      new THREE.ShapeGeometry(makeShape(1)),
      new THREE.MeshStandardMaterial({
        color: 0x2196f3,
        transparent: true,
        opacity: 0.72,
        metalness: 0.4,
        roughness: 0.15,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(this.pondCenter.x, 0.05, this.pondCenter.z);
    this.scene.add(this.water);

    // Fiskeplats - på sandens kant västerut
    const westPoint = samplePoints.reduce((best, p) => {
      // Hitta punkt med minsta x-värde (västligaste)
      return !best || p.x < best.x ? p : best;
    });
    const fishingPos = new THREE.Vector3(
      this.pondCenter.x + westPoint.x * 1.12,
      0,
      this.pondCenter.z + westPoint.z * 1.12,
    );
    const spot = new FishingSpot(this.scene, fishingPos);
    // Rotera bryggan så den pekar in mot sjön
    const inDx = -westPoint.x;
    const inDz = -westPoint.z;
    spot.group.rotation.y = Math.atan2(inDx, inDz);
    this.interactables.push(spot);

    // Kollisionspunkter längs sjökanten - var 4:e samplepunkt
    for (let i = 0; i < samplePoints.length; i += 4) {
      const p = samplePoints[i];
      this.obstacles.push({
        x: this.pondCenter.x + p.x,
        z: this.pondCenter.z + p.z,
        radius: 0.8,
      });
    }
  }

  // Grottan: U-formad bergmassa med tydlig öppning på framsidan
  createCave() {
    this.caveCenter = new THREE.Vector3(-50, 0, 30);
    const cx = this.caveCenter.x;
    const cz = this.caveCenter.z;

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.95 });
    const darkInsideMat = new THREE.MeshStandardMaterial({
      color: 0x2e2e2e,
      side: THREE.BackSide,
      roughness: 1,
    });

    // Bergmassa - flera stenar i U-form, lämnar öppning åt söder (+z)
    // Ingången är vid x≈0, z≈+7 (mellan två pelare)
    const rockClusters = [
      // Bakre rad (norr)
      { x: -6, z: -9, r: 5.5 },
      { x: 0, z: -10, r: 6.5 },
      { x: 6, z: -9, r: 5.5 },
      // Vänster sida
      { x: -10, z: -3, r: 5 },
      { x: -10, z: 3, r: 4 },
      // Höger sida
      { x: 10, z: -3, r: 5 },
      { x: 10, z: 3, r: 4 },
      // Pelare runt ingången - tillräckligt mellanrum för att gå in
      { x: -5, z: 7, r: 2.8 },
      { x: 5, z: 7, r: 2.8 },
    ];
    for (const o of rockClusters) {
      const rock = new THREE.Mesh(new THREE.SphereGeometry(o.r, 14, 10), stoneMat);
      // Lite slumpmässig variation så de inte ser identiska ut
      rock.position.set(
        cx + o.x + (Math.random() - 0.5) * 0.4,
        o.r * 0.6 + (Math.random() - 0.5) * 0.3,
        cz + o.z + (Math.random() - 0.5) * 0.4,
      );
      rock.scale.set(1, 0.95 + Math.random() * 0.15, 1);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
      // Kollision - lite mindre radie så det inte överlappar grannar
      this.obstacles.push({
        x: cx + o.x,
        z: cz + o.z,
        radius: o.r * 0.78,
      });
    }

    // Insida - bagformad kammare bakom bergmassan
    // Använd cylinder med BackSide-material för väggar
    const interior = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 5.5, 5, 18, 1, true),
      darkInsideMat,
    );
    interior.position.set(cx, 2.5, cz - 3);
    this.scene.add(interior);

    // Golv inuti grottan - jord/sten
    const caveFloor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 18),
      new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.95 }),
    );
    caveFloor.rotation.x = -Math.PI / 2;
    caveFloor.position.set(cx, 0.04, cz - 3);
    caveFloor.receiveShadow = true;
    this.scene.add(caveFloor);

    // Tak ovanför kammaren - mörk skiva
    const caveRoof = new THREE.Mesh(
      new THREE.CircleGeometry(6, 18),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide }),
    );
    caveRoof.rotation.x = Math.PI / 2;
    caveRoof.position.set(cx, 5, cz - 3);
    this.scene.add(caveRoof);

    // Stalaktiter från taket för känsla
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 4;
      const stal = new THREE.Mesh(
        new THREE.ConeGeometry(0.15 + Math.random() * 0.1, 0.6 + Math.random() * 0.4, 6),
        stoneMat,
      );
      stal.position.set(cx + Math.cos(angle) * r, 4.6, cz - 3 + Math.sin(angle) * r);
      stal.rotation.x = Math.PI;
      this.scene.add(stal);
    }

    // Fackla inne i grottan - varmt ljus + visuell fackla
    const torchLight = new THREE.PointLight(0xff8a3d, 3, 18, 2);
    torchLight.position.set(cx, 2.8, cz - 5);
    this.scene.add(torchLight);
    const torchBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.45, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0xff5722,
        emissive: 0xff5722,
        emissiveIntensity: 1,
      }),
    );
    torchBox.position.set(cx, 2.8, cz - 7);
    this.scene.add(torchBox);
    this.caveTorch = torchBox;

    // Fackelstöd
    const torchPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x4e342e }),
    );
    torchPole.position.set(cx, 1.5, cz - 7);
    this.scene.add(torchPole);

    // Lösa stenar runt utsidan
    for (let i = 0; i < 10; i++) {
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.7, 0),
        stoneMat,
      );
      const angle = Math.random() * Math.PI * 2;
      const r = 13 + Math.random() * 4;
      // Hoppa över zone framför ingången
      if (Math.abs(Math.cos(angle)) < 0.4 && Math.sin(angle) > 0.3) continue;
      const sx = cx + Math.cos(angle) * r;
      const sz = cz + Math.sin(angle) * r;
      stone.position.set(sx, 0.4, sz);
      stone.rotation.y = Math.random() * Math.PI;
      stone.castShadow = true;
      this.scene.add(stone);
      this.obstacles.push({ x: sx, z: sz, radius: 0.7 });
    }
  }

  createCamp() {
    const c = this.campCenter;
    const r = this.campRadius;

    // Markgolv
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(r, 32),
      new THREE.MeshStandardMaterial({ color: 0x8d6e63 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(c.x, 0.02, c.z);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Palissad
    const logMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2a });
    const segments = 48;
    // Gate-öppning: skippa stockar i 70°-110° (söderut)
    this.gateAngleMin = (70 * Math.PI) / 180;
    this.gateAngleMax = (110 * Math.PI) / 180;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      if (angle > this.gateAngleMin && angle < this.gateAngleMax) continue;
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.22, 2.2, 6),
        logMat,
      );
      log.position.set(c.x + Math.cos(angle) * r, 1.1 + Math.random() * 0.15, c.z + Math.sin(angle) * r);
      log.rotation.y = angle;
      log.rotation.z = (Math.random() - 0.5) * 0.05;
      log.castShadow = true;
      log.receiveShadow = true;
      this.scene.add(log);
    }
    // Spetsig topp på varje stock
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      if (angle > this.gateAngleMin && angle < this.gateAngleMax) continue;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 6), logMat);
      tip.position.set(c.x + Math.cos(angle) * r, 2.4, c.z + Math.sin(angle) * r);
      this.scene.add(tip);
    }

    // Portstolpar vid gaten
    for (const gateAngle of [this.gateAngleMin, this.gateAngleMax]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.32, 2.8, 6),
        logMat,
      );
      post.position.set(c.x + Math.cos(gateAngle) * r, 1.4, c.z + Math.sin(gateAngle) * r);
      post.castShadow = true;
      this.scene.add(post);
    }

    // Hyddan - i bortre änden
    this._createHut(new THREE.Vector3(c.x - 2.5, 0, c.z - 4.5));

    // Lägereld - mitt i lägret
    const firePos = new THREE.Vector3(c.x + 1, 0, c.z + 1);
    const fire = new Campfire(this.scene, firePos);
    this.interactables.push(fire);
    this.campfire = fire;
    this.obstacles.push({ x: firePos.x, z: firePos.z, radius: 0.9 });

    // Köpman med städ - vänster sida
    const merchantPos = new THREE.Vector3(c.x + 3.5, 0, c.z - 2);
    this.merchant = new Merchant(this.scene, merchantPos);
    this.interactables.push(this.merchant);
    this.obstacles.push({ x: merchantPos.x, z: merchantPos.z, radius: 0.55 });

    // Städ bredvid köpmannen
    const anvilPos = new THREE.Vector3(c.x + 4.7, 0, c.z - 1.5);
    this.anvil = new Anvil(this.scene, anvilPos);
    this.obstacles.push({ x: anvilPos.x, z: anvilPos.z, radius: 0.6 });
  }

  _createHut(pos) {
    const hut = new THREE.Group();

    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.2, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x8d6e63 }),
    );
    walls.position.y = 1.1;
    walls.castShadow = true;
    walls.receiveShadow = true;
    hut.add(walls);

    // Lägg en till lager för synlig "stockstruktur"
    const logRing = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.25, 2.8),
      new THREE.MeshStandardMaterial({ color: 0x6d4c2a }),
    );
    logRing.position.y = 0.5;
    hut.add(logRing);
    const logRing2 = logRing.clone();
    logRing2.position.y = 1.5;
    hut.add(logRing2);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 1.6, 4),
      new THREE.MeshStandardMaterial({ color: 0x5d3a1a }),
    );
    roof.position.y = 3;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    hut.add(roof);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 1.4, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x4e342e }),
    );
    door.position.set(0, 0.7, 1.33);
    hut.add(door);
    // Dörrhandtag
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xffc107, metalness: 0.6 }),
    );
    handle.position.set(0.25, 0.75, 1.38);
    hut.add(handle);

    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x90caf9, emissive: 0x90caf9, emissiveIntensity: 0.2 }),
    );
    win.position.set(0.95, 1.4, 1.33);
    hut.add(win);

    hut.position.copy(pos);
    this.scene.add(hut);

    // Kollision för hyddan
    this.obstacles.push({ x: pos.x, z: pos.z, radius: 2.0 });
  }

  // Bruna stigar mellan viktiga platser
  createPaths() {
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.95 });
    const places = [
      { from: new THREE.Vector3(0, 0, 0), to: new THREE.Vector3(0, 0, -3) }, // gate-stig
      { from: new THREE.Vector3(0, 0, -3), to: this.pondCenter },
      { from: new THREE.Vector3(0, 0, -3), to: this.caveCenter.clone().setZ(this.caveCenter.z + 5) },
    ];
    for (const p of places) {
      this._drawPath(p.from, p.to, dirtMat);
    }
  }

  _drawPath(from, to, mat) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(3, Math.floor(dist / 1.5));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = from.x + dx * t + (Math.random() - 0.5) * 0.6;
      const z = from.z + dz * t + (Math.random() - 0.5) * 0.6;
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(0.9 + Math.random() * 0.4, 6),
        mat,
      );
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = Math.random() * Math.PI;
      patch.position.set(x, 0.025, z);
      patch.receiveShadow = true;
      this.scene.add(patch);
    }
  }

  createFlowers() {
    const flowerColors = [0xe91e63, 0xffeb3b, 0xffffff, 0xff5722, 0x9c27b0];
    for (let i = 0; i < 120; i++) {
      const x = (Math.random() - 0.5) * WORLD_BOUND * 1.7;
      const z = (Math.random() - 0.5) * WORLD_BOUND * 1.7;
      if (this._inPond(x, z, 1)) continue;
      if (this._inCamp(x, z, 1)) continue;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 5, 4),
        new THREE.MeshStandardMaterial({
          color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
        }),
      );
      flower.position.set(x, 0.18, z);
      flower.userData.basY = 0.18;
      flower.userData.phase = Math.random() * Math.PI * 2;
      this.scene.add(flower);
      this.bobbingFlowers.push(flower);
    }
  }

  spawnTrees() {
    const positions = [];
    let attempts = 0;
    // Tät skog
    while (positions.length < 180 && attempts < 4000) {
      attempts++;
      const x = (Math.random() - 0.5) * WORLD_BOUND * 1.85;
      const z = (Math.random() - 0.5) * WORLD_BOUND * 1.85;
      if (this._inPond(x, z, 3)) continue;
      if (this._inCamp(x, z, 2)) continue;
      if (this._inCave(x, z, 4)) continue;
      if (new THREE.Vector2(x, z).length() < 6) continue;
      // Undvik stigar (grovt - undvik smala band)
      if (Math.abs(x) < 1.5 && z < 0 && z > -3) continue;
      let tooClose = false;
      for (const p of positions) {
        if (new THREE.Vector2(x - p.x, z - p.z).length() < 2.6) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      positions.push({ x, z });
      const tree = new Tree(this.scene, new THREE.Vector3(x, 0, z));
      // Spara fas för vinden
      tree.swayPhase = Math.random() * Math.PI * 2;
      this.interactables.push(tree);
      this.swayingTrees.push(tree);
      // Kollision
      this.obstacles.push({ x, z, radius: 0.6 });
    }
  }

  spawnBushes() {
    let placed = 0;
    let attempts = 0;
    while (placed < 30 && attempts < 400) {
      attempts++;
      const x = (Math.random() - 0.5) * WORLD_BOUND * 1.7;
      const z = (Math.random() - 0.5) * WORLD_BOUND * 1.7;
      if (this._inPond(x, z, 2)) continue;
      if (this._inCamp(x, z, 2)) continue;
      if (this._inCave(x, z, 10)) continue;
      if (new THREE.Vector2(x, z).length() < 5) continue;
      const bush = new Bush(this.scene, new THREE.Vector3(x, 0, z));
      this.interactables.push(bush);
      placed++;
      // Buskar är gångbara - ingen kollision
    }
  }

  _inPond(x, z, margin = 0) {
    const dx = x - this.pondCenter.x;
    const dz = z - this.pondCenter.z;
    const ang = Math.atan2(dz, dx);
    // Använder samma formel som genererar anchors
    const r = this.pondAvgRadius + Math.sin(ang * 2.3) * 2.8 + Math.cos(ang * 1.7) * 2.2;
    return Math.sqrt(dx * dx + dz * dz) < r + margin;
  }

  _inCamp(x, z, margin = 0) {
    const dx = x - this.campCenter.x;
    const dz = z - this.campCenter.z;
    return Math.sqrt(dx * dx + dz * dz) < this.campRadius + margin;
  }

  _inCave(x, z, margin = 0) {
    const dx = x - this.caveCenter.x;
    const dz = z - this.caveCenter.z;
    return Math.sqrt(dx * dx + dz * dz) < 14 + margin;
  }

  isInCamp(position) {
    return this._inCamp(position.x, position.z, 0);
  }

  // Returnerar justerad position efter att ha kollat mot hinder + palissad
  resolveCollision(from, to) {
    const adjusted = to.clone();

    // Kolla varje hinder
    for (const obs of this.obstacles) {
      const dx = adjusted.x - obs.x;
      const dz = adjusted.z - obs.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = obs.radius + PLAYER_RADIUS;
      if (dist < minDist && dist > 0.001) {
        // Knuffa ut spelaren
        const factor = minDist / dist;
        adjusted.x = obs.x + dx * factor;
        adjusted.z = obs.z + dz * factor;
      }
    }

    // Palissad: blockera passage genom väggen utom genom porten
    const cx = this.campCenter.x;
    const cz = this.campCenter.z;
    const dxFrom = from.x - cx;
    const dzFrom = from.z - cz;
    const dxTo = adjusted.x - cx;
    const dzTo = adjusted.z - cz;
    const distFrom = Math.sqrt(dxFrom * dxFrom + dzFrom * dzFrom);
    const distTo = Math.sqrt(dxTo * dxTo + dzTo * dzTo);
    const r = this.campRadius;

    const insideThreshold = r - 0.3;
    const outsideThreshold = r + 0.3;

    // Är vi på väg att korsa muren?
    const startedInside = distFrom < r;
    const willBeInside = distTo < r;

    if (startedInside !== willBeInside) {
      // Korsar muren - kolla angle vid korsningspunkten
      const targetAngle = Math.atan2(dzTo, dxTo);
      const normAngle = ((targetAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const inGate = normAngle > this.gateAngleMin && normAngle < this.gateAngleMax;
      if (!inGate) {
        // Stoppa vid muren på sidan vi startade på
        const targetDist = startedInside ? insideThreshold : outsideThreshold;
        if (distTo > 0.001) {
          adjusted.x = cx + (dxTo / distTo) * targetDist;
          adjusted.z = cz + (dzTo / distTo) * targetDist;
        }
      }
    }

    // Världs-gränser
    adjusted.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, adjusted.x));
    adjusted.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, adjusted.z));

    return adjusted;
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
    this.time += dt;
    for (const obj of this.interactables) obj.update(dt);

    // Träd som svajar i vinden
    const windStrength = 0.04;
    for (const tree of this.swayingTrees) {
      const t = this.time + (tree.swayPhase || 0);
      const sway = Math.sin(t * 1.3) * windStrength;
      tree.group.rotation.z = sway;
      tree.group.rotation.x = Math.cos(t * 0.9) * windStrength * 0.5;
    }

    // Blommor som bobbar lätt
    for (const f of this.bobbingFlowers) {
      f.position.y = f.userData.basY + Math.sin(this.time * 2 + f.userData.phase) * 0.03;
    }

    // Vattnet skiftar lätt
    if (this.water) {
      this.water.material.opacity = 0.65 + Math.sin(this.time * 1.5) * 0.05;
    }

    // Fackla i grottan flimrar
    if (this.caveTorch) {
      this.caveTorch.material.emissiveIntensity = 0.8 + Math.sin(this.time * 8) * 0.3;
    }
  }
}
