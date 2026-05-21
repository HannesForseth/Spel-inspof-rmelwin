import * as THREE from 'three';
import { Tree, Bush, FishingSpot, Campfire } from './resources.js';
import { Merchant, Anvil } from './npc.js';
import { cloneModel } from './models.js';

const PLAYER_RADIUS = 0.45;
const WORLD_BOUND = 145;

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

    // Läger - större för att rymma fler NPC senare
    this.campCenter = new THREE.Vector3(0, 0, -14);
    this.campRadius = 12;

    // Ladda Blender-värld FÖRST så terrängen är på plats redan när
    // träd/camp/etc skapas - om det fortfarande är async fyller vi
    // i y-värden i efterhand via _snapWorldToTerrain
    this._loadBlenderWorld();

    this.createGround();
    this.createPond();
    this.createCave();
    this.createCamp();
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
    this._addToScene(sand);

    // Botten - mörkblå, lite mindre än vattnet och något under marknivå
    const bottom = new THREE.Mesh(
      new THREE.ShapeGeometry(makeShape(0.94)),
      new THREE.MeshStandardMaterial({ color: 0x0d3a52, roughness: 0.9 }),
    );
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(this.pondCenter.x, -0.35, this.pondCenter.z);
    this._addToScene(bottom);

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
    this._addToScene(this.water);

    // Fiskeplats - bryggan ska sticka ut över vattnet, fötter på sand
    const westPoint = samplePoints.reduce((best, p) => {
      return !best || p.x < best.x ? p : best;
    });
    // Placera vid kanten (faktor 1.02 = precis utanför vattnet)
    const fishingPos = new THREE.Vector3(
      this.pondCenter.x + westPoint.x * 1.02,
      0,
      this.pondCenter.z + westPoint.z * 1.02,
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
    this._addToScene(floor);

    // Palissad
    const logMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2a });
    const segments = 64;
    // Gate-öppning: större port nu (75-105° söderut)
    this.gateAngleMin = (75 * Math.PI) / 180;
    this.gateAngleMax = (105 * Math.PI) / 180;
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
      this._addToScene(log);
    }
    // Spetsig topp på varje stock
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      if (angle > this.gateAngleMin && angle < this.gateAngleMax) continue;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 6), logMat);
      tip.position.set(c.x + Math.cos(angle) * r, 2.4, c.z + Math.sin(angle) * r);
      this._addToScene(tip);
    }

    // Portstolpar vid gaten
    for (const gateAngle of [this.gateAngleMin, this.gateAngleMax]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.32, 2.8, 6),
        logMat,
      );
      post.position.set(c.x + Math.cos(gateAngle) * r, 1.4, c.z + Math.sin(gateAngle) * r);
      post.castShadow = true;
      this._addToScene(post);
    }

    // Hyddan - bortre delen, nu lite mer åt norr i större läger
    this._createHut(new THREE.Vector3(c.x - 4, 0, c.z - 6));

    // Lägereld - mitt i lägret (precis söder om center)
    const firePos = new THREE.Vector3(c.x, 0, c.z + 2);
    const fire = new Campfire(this.scene, firePos);
    this.interactables.push(fire);
    this.campfire = fire;
    this.obstacles.push({ x: firePos.x, z: firePos.z, radius: 0.9 });

    // Köpman + städ - nordöstra sidan
    const merchantPos = new THREE.Vector3(c.x + 4, 0, c.z - 3);
    this.merchant = new Merchant(this.scene, merchantPos);
    this.interactables.push(this.merchant);
    this.obstacles.push({ x: merchantPos.x, z: merchantPos.z, radius: 0.55 });

    const anvilPos = new THREE.Vector3(c.x + 5.5, 0, c.z - 2.5);
    this.anvil = new Anvil(this.scene, anvilPos);
    this.obstacles.push({ x: anvilPos.x, z: anvilPos.z, radius: 0.6 });

    // Plats reserverad för framtida NPC:s - markörer (synliga som "TBD")
    this._placeFutureSlots(c);
  }

  // Markörer där framtida NPC:s ska stå (pelare med tomma "slottar")
  _placeFutureSlots(c) {
    const slots = [
      { x: c.x - 5, z: c.z - 3, label: 'rustningssmed' },
      { x: c.x - 6.5, z: c.z - 2, label: 'trollkarl' },
    ];
    for (const slot of slots) {
      // Liten platta som markerar var nästa NPC ska stå
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.1, 12),
        new THREE.MeshStandardMaterial({ color: 0x6d4c2a, roughness: 0.95 }),
      );
      pad.position.set(slot.x, 0.05, slot.z);
      pad.receiveShadow = true;
      this._addToScene(pad);

      // Liten pelare/staty som platshållare
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x5d4037 }),
      );
      post.position.set(slot.x, 0.7, slot.z);
      post.castShadow = true;
      this._addToScene(post);
    }
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
      { from: gatePos, to: this.pondCenter, stopAtPond: true },
      { from: gatePos, to: this.caveCenter, stopAtCave: true },
      { from: this.arenaCenter, to: this.pondCenter, stopAtPond: true },
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
      this._addToScene(flower);
      this.bobbingFlowers.push(flower);
    }
  }

  spawnTrees() {
    const positions = [];

    // Skapa kluster-center för tätare skogsområden
    const clusterCenters = [];
    while (clusterCenters.length < 9) {
      const cx = (Math.random() - 0.5) * WORLD_BOUND * 1.5;
      const cz = (Math.random() - 0.5) * WORLD_BOUND * 1.5;
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
        x = (Math.random() - 0.5) * WORLD_BOUND * 1.9;
        z = (Math.random() - 0.5) * WORLD_BOUND * 1.9;
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
      const x = (Math.random() - 0.5) * WORLD_BOUND * 1.7;
      const z = (Math.random() - 0.5) * WORLD_BOUND * 1.7;
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
