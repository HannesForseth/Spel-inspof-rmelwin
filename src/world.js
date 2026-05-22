import * as THREE from 'three';
import { Tree, Bush, Campfire } from './resources.js';
import { Blacksmith } from './npc.js';
import { cloneModel } from './models.js';

const PLAYER_RADIUS = 0.45;
// Hur långt spelaren får röra sig från origo. Den nya Blender-terrängen
// täcker ±725 i x/z, vi clampar lite snävare för marginal från kanten.
const WORLD_BOUND = 700;
// Var de procedurella resurserna (träd/buskar/blommor) får spawna.
// Hålls mindre än WORLD_BOUND så spelaren inte måste vandra evigt
// för att hitta något att skörda. world_props.glb fyller resten visuellt.
const SPAWN_BOUND = 145;

const TERRAIN_RAY_ORIGIN = new THREE.Vector3();
const TERRAIN_RAY_DOWN = new THREE.Vector3(0, -1, 0);

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
    // Spårning av alla statiska objekt vi lagt i scenen så vi kan
    // höja dem till terräng-y efter att Blender-världen laddats
    this._worldObjects = [];
    this._terrainReady = false;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = 600;

    // Byn (tidigare "lägret") - safezone på samma plats som gamla lägret.
    // campCenter/campRadius behålls som namn för bakåtkompabilitet med
    // creatures.js (vargar undviker camp) och resolveCollision.
    this.campCenter = new THREE.Vector3(0, 0, -14);
    this.campRadius = 25;
    // Alias som visar att det är en by nu
    this.villageCenter = this.campCenter;
    this.villageRadius = this.campRadius;

    // Ladda Blender-värld FÖRST så terrängen är på plats redan när
    // träd/byn etc skapas - om det fortfarande är async fyller vi
    // i y-värden i efterhand via _snapWorldToTerrain
    this._loadBlenderWorld();

    this.createGround();
    // createPond() borttagen - den procedurella sjön såg konstig ut
    // ovanpå Blender-terrängen. Fishing-spot är borta som följd.
    this.createCave();
    this.createVillage();
    this.createTrollLair();
    this.createArena();
    this.createPaths();
    this.createFlowers();
    this.spawnTrees();
    this.spawnBushes();
  }

  // Wrapper kring scene.add som registrerar objekt för terrain-snap.
  // ALLA scene-tillägg i World ska gå via denna (utom Blender-världen
  // själv och safety-marken som inte ska snappas).
  _addToScene(obj) {
    this.scene.add(obj);
    this._worldObjects.push(obj);
    if (this._terrainReady) this._snapObject(obj);
    return obj;
  }

  _snapObject(obj) {
    if (obj.userData._terrainSnapped) return;
    const ty = this.getTerrainY(obj.position.x, obj.position.z, 0);
    obj.position.y += ty;
    if (obj.userData?.basY !== undefined) obj.userData.basY += ty;
    obj.userData._terrainSnapped = true;
  }

  // Laddar in Blender-baserad terräng + props som ersätter den
  // platta procedurella marken. När terrängen laddats snappar vi
  // alla statiska objekt + interactables till terrängens y vid
  // deras (x,z).
  async _loadBlenderWorld() {
    try {
      const { root: terrain } = await cloneModel('/models/world_terrain.glb');
      this.terrainMeshes = [];
      terrain.traverse((o) => {
        if (o.isMesh) {
          o.receiveShadow = true;
          o.castShadow = false;
          this.terrainMeshes.push(o);
        }
      });
      this.scene.add(terrain);
      this.blenderTerrain = terrain;
      this._snapWorldToTerrain(); // sätter _terrainReady=true
      // Ta bort fallback-marken nu när terrängen är på plats
      if (this._safetyGround) {
        this.scene.remove(this._safetyGround);
        this._safetyGround.geometry.dispose();
        this._safetyGround.material.dispose();
        this._safetyGround = null;
      }
    } catch (e) {
      console.warn('[World] world_terrain.glb kunde inte laddas', e);
    }
    try {
      const { root: props } = await cloneModel('/models/world_props.glb');
      props.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.scene.add(props);
      this.blenderProps = props;
    } catch (e) {
      console.warn('[World] world_props.glb kunde inte laddas', e);
    }
  }

  // Raycastar nedåt från (x, 500, z) mot terrängens mesh. Returnerar
  // terrängens y vid (x,z), eller fallback om strålen missar / mesh
  // inte är laddad än.
  getTerrainY(x, z, fallback = 0) {
    if (!this.terrainMeshes || this.terrainMeshes.length === 0) return fallback;
    TERRAIN_RAY_ORIGIN.set(x, 500, z);
    this._raycaster.set(TERRAIN_RAY_ORIGIN, TERRAIN_RAY_DOWN);
    const hits = this._raycaster.intersectObjects(this.terrainMeshes, false);
    if (hits.length > 0) return hits[0].point.y;
    return fallback;
  }

  // Höj allt statiskt content + alla interactables till respektive
  // terrängs-y vid deras (x,z). Kallas efter att terrängen laddats.
  _snapWorldToTerrain() {
    this._terrainReady = true;
    for (const obj of this._worldObjects) this._snapObject(obj);
    for (const it of this.interactables) {
      if (!it.group || it.group.userData._terrainSnapped) continue;
      const ty = this.getTerrainY(it.position.x, it.position.z, 0);
      it.group.position.y = ty;
      if (it.position) it.position.y = ty;
      it.group.userData._terrainSnapped = true;
    }
  }

  // Trollets boplats - en stencirkel på motsatt sida av kartan
  createTrollLair() {
    this.trollLairCenter = new THREE.Vector3(70, 0, -60);
    const cx = this.trollLairCenter.x;
    const cz = this.trollLairCenter.z;

    // Stora mossiga stenar i en cirkel
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a5040, roughness: 0.95 });
    const mossyMat = new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 0.9 });

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.2;
      const r = 7;
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.6 + Math.random() * 0.8, 0),
        stoneMat,
      );
      stone.position.set(cx + Math.cos(angle) * r, 1.0, cz + Math.sin(angle) * r);
      stone.rotation.y = Math.random() * Math.PI * 2;
      stone.castShadow = true;
      stone.receiveShadow = true;
      this._addToScene(stone);
      this.obstacles.push({
        x: cx + Math.cos(angle) * r,
        z: cz + Math.sin(angle) * r,
        radius: 1.5,
      });

      // Mossa-toppar
      const moss = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 8, 5),
        mossyMat,
      );
      moss.position.set(cx + Math.cos(angle) * r, 2.0, cz + Math.sin(angle) * r);
      moss.scale.y = 0.5;
      this._addToScene(moss);
    }

    // Eld-pit i mitten (släckt)
    const ashGeo = new THREE.CircleGeometry(1.2, 16);
    const ash = new THREE.Mesh(
      ashGeo,
      new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 1 }),
    );
    ash.rotation.x = -Math.PI / 2;
    ash.position.set(cx, 0.04, cz);
    this._addToScene(ash);

    // Ben-högar - varning till spelaren
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xeceff1 });
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 2;
      const bone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.6 + Math.random() * 0.3, 6),
        boneMat,
      );
      bone.position.set(cx + Math.cos(angle) * r, 0.3, cz + Math.sin(angle) * r);
      bone.rotation.z = Math.random() * Math.PI;
      bone.rotation.x = Math.random() * 0.3;
      this._addToScene(bone);
    }

    // En stor "tron" - sten där trollet sitter ibland
    const throne = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 1.5, 1.5),
      stoneMat,
    );
    throne.position.set(cx, 0.75, cz - 4);
    throne.castShadow = true;
    this._addToScene(throne);
  }

  createGround() {
    // Den procedurella platta marken är ersatt av world_terrain.glb.
    // Som backup innan terrängen laddas hänger en stor mörkgrön "fallback"
    // vid y=0 så himlen inte syns igenom första frame. Tas bort när
    // terrängen laddats.
    const safety = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_BOUND * 4, WORLD_BOUND * 4, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x4a7c3e }),
    );
    safety.rotation.x = -Math.PI / 2;
    safety.position.y = -0.1;
    safety.receiveShadow = true;
    this.scene.add(safety); // ej via _addToScene - vi vill INTE snappa den
    this._safetyGround = safety;
  }

  // Den procedurella sjön är borta. _inPond returnerar false så
  // drunkningsmekaniken och pond-push-out aldrig triggas. Fishing-rod-
  // uppgraderingen kan inte användas men ligger kvar för senare nytt
  // fiske vid en annan plats.

  // Grottan: GLB-mesh från Blender + bevarade kollisioner och fackla
  createCave() {
    this.caveCenter = new THREE.Vector3(-50, 0, 30);
    const cx = this.caveCenter.x;
    const cz = this.caveCenter.z;

    // Kollisioner — osynliga cylindrar som approximerar bergmassan
    // (GLB-meshen själv har detaljerade former, dessa stoppar spelaren)
    const rockClusters = [
      { x: -6, z: -9, r: 5.5 },
      { x: 0, z: -10, r: 6.5 },
      { x: 6, z: -9, r: 5.5 },
      { x: -10, z: -3, r: 5 },
      { x: -10, z: 3, r: 4 },
      { x: 10, z: -3, r: 5 },
      { x: 10, z: 3, r: 4 },
      { x: -5, z: 7, r: 2.8 },
      { x: 5, z: 7, r: 2.8 },
    ];
    for (const o of rockClusters) {
      this.obstacles.push({
        x: cx + o.x,
        z: cz + o.z,
        radius: o.r * 0.78,
      });
    }

    // Ladda Blender-grottan asynkront
    cloneModel('/models/cave.glb')
      .then(({ root }) => {
        root.position.set(cx, 0, cz);
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        this._addToScene(root);
      })
      .catch((err) => console.warn('cave.glb kunde inte laddas', err));

    // Fackla inne i grottan - varmt ljus + visuell fackla
    const torchLight = new THREE.PointLight(0xff8a3d, 3, 18, 2);
    torchLight.position.set(cx, 2.8, cz - 5);
    this._addToScene(torchLight);
    const torchBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.45, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0xff5722,
        emissive: 0xff5722,
        emissiveIntensity: 1,
      }),
    );
    torchBox.position.set(cx, 2.8, cz - 7);
    this._addToScene(torchBox);
    this.caveTorch = torchBox;

    // Fackelstöd
    const torchPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x4e342e }),
    );
    torchPole.position.set(cx, 1.5, cz - 7);
    this._addToScene(torchPole);

    // Lösa stenar runt utsidan
    const looseStoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.95 });
    for (let i = 0; i < 10; i++) {
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.7, 0),
        looseStoneMat,
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
      this._addToScene(stone);
      this.obstacles.push({ x: sx, z: sz, radius: 0.7 });
    }
  }

  // Ny by - laddar village.glb och placerar interactables (smed, eld)
  // vid rätt offset i village-local space. Den gamla procedurella
  // lägervisualisering är borttagen.
  createVillage() {
    const c = this.campCenter;
    // Smedjepositioner från village.blend: smithy i +x-delen, blacksmith
    // står vid städet. Bygg in y=0 i positioner — terrain-snap höjer dem.
    const blacksmithLocal = new THREE.Vector3(12, 0, -10);
    const campfireLocal = new THREE.Vector3(0, 0, 0);

    // Wall-blocking via resolveCollision är avstängd för byn (gateAngle
    // täcker hela cirkeln). GLB-meshen har egna byggnader; obstacles
    // läggs in för de stora som smedjan så spelaren inte går igenom.
    this.gateAngleMin = 0;
    this.gateAngleMax = Math.PI * 2;

    // Ladda village.glb asynkront
    cloneModel('/models/village.glb')
      .then(({ root }) => {
        root.position.set(c.x, 0, c.z);
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        this._addToScene(root);
        this.villageRoot = root;
      })
      .catch((err) => console.warn('village.glb kunde inte laddas', err));

    // Lyktor och eld: lite varma point lights för stämning på natten
    for (const [lx, lz] of [
      [4.24, 4.24], [-4.24, 4.24], [4.24, -4.24], [-4.24, -4.24],
    ]) {
      const lantern = new THREE.PointLight(0xfff088, 1.0, 12);
      lantern.position.set(c.x + lx, 3.2, c.z + lz);
      this._addToScene(lantern);
    }
    // Eldljus
    const fireLight = new THREE.PointLight(0xff8a3d, 2.5, 14);
    fireLight.position.set(c.x, 2.2, c.z);
    this._addToScene(fireLight);

    // Campfire-interactable: gör elden interactable för matlagning.
    // Mesh ligger redan i village.glb, men vi behöver objektet för
    // canHarvest('cook') osv. Sätt visuell mesh till osynlig.
    const firePos = new THREE.Vector3(c.x + campfireLocal.x, 0, c.z + campfireLocal.z);
    const fire = new Campfire(this.scene, firePos);
    // Gör Campfire-instansens egen mesh osynlig - village.glb visar elden
    if (fire.group) fire.group.visible = false;
    this.interactables.push(fire);
    this.campfire = fire;

    // Smeden står vid städet inne i smedjan
    const blacksmithPos = new THREE.Vector3(c.x + blacksmithLocal.x, 0, c.z + blacksmithLocal.z);
    this.blacksmith = new Blacksmith(this.scene, blacksmithPos);
    this.merchant = this.blacksmith; // alias för bakåtkompabilitet
    this.interactables.push(this.blacksmith);

    // Kollisionscylinder för smedjebyggnaden (ungefär 6×5m)
    this.obstacles.push({ x: c.x + 10, z: c.z - 10, radius: 3 });
    // Watchtower
    this.obstacles.push({ x: c.x - 12, z: c.z + 12, radius: 1.2 });
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
    this._addToScene(hut);

    // Kollision för hyddan
    this.obstacles.push({ x: pos.x, z: pos.z, radius: 2.0 });
  }

  // Gurubashi-stil arena med yttervägg, åskådarplatser och hörntorn
  createArena() {
    this.arenaCenter = new THREE.Vector3(95, 0, 75);
    const cx = this.arenaCenter.x;
    const cz = this.arenaCenter.z;

    // Kollisioner — yttervägg är ~28m radie, lämna öppningar i N/S/E/W
    const wallRadius = 28;
    const segments = 28;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const deg = (angle * 180) / Math.PI;
      const nearGate = [0, 90, 180, 270].some((d) => {
        const diff = Math.abs(deg - d);
        return diff < 14 || diff > 346;
      });
      if (nearGate) continue;
      this.obstacles.push({
        x: cx + Math.cos(angle) * wallRadius,
        z: cz + Math.sin(angle) * wallRadius,
        radius: 2,
      });
    }

    cloneModel('/models/arena.glb')
      .then(({ root }) => {
        root.position.set(cx, 0, cz);
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        this._addToScene(root);
      })
      .catch((err) => console.warn('arena.glb kunde inte laddas', err));
  }

  // Bruna stigar mellan viktiga platser (stoppar vid sjö/grotta)
  createPaths() {
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.95 });
    // Beräkna gateposition från campCenter
    const gateAngle = (this.gateAngleMin + this.gateAngleMax) / 2;
    const gatePos = new THREE.Vector3(
      this.campCenter.x + Math.cos(gateAngle) * this.campRadius,
      0,
      this.campCenter.z + Math.sin(gateAngle) * this.campRadius,
    );

    const places = [
      { from: new THREE.Vector3(0, 0, 4), to: gatePos },
      { from: gatePos, to: this.caveCenter, stopAtCave: true },
      { from: gatePos, to: this.arenaCenter },
    ];
    for (const p of places) {
      this._drawPath(p.from, p.to, dirtMat, p);
    }
  }

  _drawPath(from, to, mat, options = {}) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(3, Math.floor(dist / 1.4));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = from.x + dx * t + (Math.random() - 0.5) * 0.6;
      const z = from.z + dz * t + (Math.random() - 0.5) * 0.6;
      // Stoppa innan sjön / grottan
      if (options.stopAtPond && this._inPond(x, z, 1.5)) break;
      if (options.stopAtCave && this._inCave(x, z, -3)) break;
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(0.9 + Math.random() * 0.4, 6),
        mat,
      );
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = Math.random() * Math.PI;
      patch.position.set(x, 0.025, z);
      patch.receiveShadow = true;
      this._addToScene(patch);
    }
  }

  createFlowers() {
    const flowerColors = [0xe91e63, 0xffeb3b, 0xffffff, 0xff5722, 0x9c27b0];
    for (let i = 0; i < 120; i++) {
      const x = (Math.random() - 0.5) * SPAWN_BOUND * 1.7;
      const z = (Math.random() - 0.5) * SPAWN_BOUND * 1.7;
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
      this._addToScene(flower);
      this.bobbingFlowers.push(flower);
    }
  }

  spawnTrees() {
    const positions = [];

    // Skapa kluster-center för tätare skogsområden
    const clusterCenters = [];
    while (clusterCenters.length < 9) {
      const cx = (Math.random() - 0.5) * SPAWN_BOUND * 1.5;
      const cz = (Math.random() - 0.5) * SPAWN_BOUND * 1.5;
      if (this._inPond(cx, cz, 8)) continue;
      if (this._inCamp(cx, cz, 6)) continue;
      if (this._inCave(cx, cz, 8)) continue;
      if (this._inArena(cx, cz, 12)) continue;
      if (new THREE.Vector2(cx, cz).length() < 18) continue;
      // Inte för nära varandra
      let nearOther = false;
      for (const o of clusterCenters) {
        if (new THREE.Vector2(cx - o.x, cz - o.z).length() < 25) {
          nearOther = true;
          break;
        }
      }
      if (nearOther) continue;
      clusterCenters.push({ x: cx, z: cz, radius: 8 + Math.random() * 6 });
    }

    let attempts = 0;
    while (positions.length < 320 && attempts < 8000) {
      attempts++;
      let x, z, minDist;
      // 75% chans att spawna i ett kluster (tätare där), annars utspritt
      if (Math.random() < 0.75) {
        const c = clusterCenters[Math.floor(Math.random() * clusterCenters.length)];
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * c.radius;
        x = c.x + Math.cos(angle) * r;
        z = c.z + Math.sin(angle) * r;
        minDist = 2.0; // tätare inom kluster
      } else {
        x = (Math.random() - 0.5) * SPAWN_BOUND * 1.9;
        z = (Math.random() - 0.5) * SPAWN_BOUND * 1.9;
        minDist = 3.0;
      }
      if (this._inPond(x, z, 3)) continue;
      if (this._inCamp(x, z, 2)) continue;
      if (this._inCave(x, z, 4)) continue;
      if (this._inTrollLair(x, z, 2)) continue;
      if (this._inArena(x, z, 4)) continue;
      if (new THREE.Vector2(x, z).length() < 6) continue;
      // Undvik stig-banden
      if (Math.abs(x) < 1.5 && z < 4 && z > -3) continue;
      let tooClose = false;
      for (const p of positions) {
        if (new THREE.Vector2(x - p.x, z - p.z).length() < minDist) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      positions.push({ x, z });
      const tree = new Tree(this.scene, new THREE.Vector3(x, 0, z));
      tree.swayPhase = Math.random() * Math.PI * 2;
      this.interactables.push(tree);
      this.swayingTrees.push(tree);
      this.obstacles.push({ x, z, radius: 0.6 });
    }
  }

  spawnBushes() {
    let placed = 0;
    let attempts = 0;
    while (placed < 30 && attempts < 400) {
      attempts++;
      const x = (Math.random() - 0.5) * SPAWN_BOUND * 1.7;
      const z = (Math.random() - 0.5) * SPAWN_BOUND * 1.7;
      if (this._inPond(x, z, 2)) continue;
      if (this._inCamp(x, z, 2)) continue;
      if (this._inCave(x, z, 10)) continue;
      if (this._inArena(x, z, 4)) continue;
      if (new THREE.Vector2(x, z).length() < 5) continue;
      const bush = new Bush(this.scene, new THREE.Vector3(x, 0, z));
      this.interactables.push(bush);
      placed++;
      // Buskar är gångbara - ingen kollision
    }
  }

  _inPond() {
    // Den procedurella sjön är borttagen. Lämnar funktionen kvar så
    // gameplay-kod (drunkning, creature-push-out) inte krashar - den
    // returnerar bara false så ingenting triggas.
    return false;
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

  _inTrollLair(x, z, margin = 0) {
    if (!this.trollLairCenter) return false;
    const dx = x - this.trollLairCenter.x;
    const dz = z - this.trollLairCenter.z;
    return Math.sqrt(dx * dx + dz * dz) < 9 + margin;
  }

  _inArena(x, z, margin = 0) {
    if (!this.arenaCenter) return false;
    const dx = x - this.arenaCenter.x;
    const dz = z - this.arenaCenter.z;
    return Math.sqrt(dx * dx + dz * dz) < 30 + margin;
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
