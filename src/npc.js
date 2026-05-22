import * as THREE from 'three';

// Smed i den nya byn - byggd in i village.glb visuellt, så denna
// interactable är "osynlig" (en tom Group). Funktionen är samma som
// Merchant: tryck E för att öppna butiken.
export class Blacksmith {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position.clone();
    this.label = 'smeden';
    this.actionLabel = 'Prata med';
    this.actionType = 'trade';
    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);
  }
  isActive() { return true; }
  canHarvest() { return true; }
  getHarvestDuration() { return 0.1; }
  harvest() { return { type: 'trade' }; }
  update() {}
}

// Köpman - står i lägret bredvid sitt städ.
// Spelaren går till honom och trycker E för att öppna butiken.
export class Merchant {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position.clone();
    this.label = 'köpmannen';
    this.actionLabel = 'Prata med';
    this.actionType = 'trade';
    this.bobTime = Math.random() * Math.PI * 2;

    this.group = new THREE.Group();

    // Kropp - röd skjorta (skiljer från spelaren)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.95, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xc62828 }),
    );
    body.position.y = 1.25;
    body.castShadow = true;
    this.group.add(body);

    // Förkläde
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x6d4c2a }),
    );
    apron.position.set(0, 1.1, 0.26);
    this.group.add(apron);

    // Huvud
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.62, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xffdbac }),
    );
    head.position.y = 2.05;
    head.castShadow = true;
    this.headMesh = head;
    this.group.add(head);

    // Hatt - bra trä-kille har en mössa
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.4, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0x4e342e }),
    );
    hat.position.y = 2.5;
    this.group.add(hat);
    const hatBrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0x3e2723 }),
    );
    hatBrim.position.y = 2.38;
    this.group.add(hatBrim);

    // Skägg
    const beard = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.35, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x6d4c2a }),
    );
    beard.position.set(0, 1.85, 0.28);
    this.group.add(beard);

    // Ögon
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    le.position.set(-0.14, 2.13, 0.32);
    this.group.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    re.position.set(0.14, 2.13, 0.32);
    this.group.add(re);

    // Armar (statiska)
    const armMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const armGeo = new THREE.BoxGeometry(0.24, 0.9, 0.32);
    const lArm = new THREE.Mesh(armGeo, armMat);
    lArm.position.set(-0.6, 1.25, 0);
    lArm.castShadow = true;
    this.group.add(lArm);
    const rArm = new THREE.Mesh(armGeo, armMat);
    rArm.position.set(0.6, 1.25, 0);
    rArm.castShadow = true;
    this.group.add(rArm);

    // Ben
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3e2723 });
    const legGeo = new THREE.BoxGeometry(0.32, 0.85, 0.38);
    const ll = new THREE.Mesh(legGeo, legMat);
    ll.position.set(-0.2, 0.4, 0);
    ll.castShadow = true;
    this.group.add(ll);
    const rl = new THREE.Mesh(legGeo, legMat);
    rl.position.set(0.2, 0.4, 0);
    rl.castShadow = true;
    this.group.add(rl);

    this.group.position.copy(position);
    // Vänd köpmannen mot porten (söderut, mot +z) - där spelaren kommer ifrån
    this.group.rotation.y = 0;
    scene.add(this.group);
  }

  isActive() {
    return true;
  }

  // Köpmannen är inte "skördbar" på vanligt sätt - game.js öppnar butiken
  canHarvest() {
    return true;
  }

  getHarvestDuration() {
    return 0.1;
  }

  harvest() {
    return { type: 'trade' };
  }

  update(dt) {
    this.bobTime += dt;
    // Lätt andnings-bob
    this.headMesh.position.y = 2.05 + Math.sin(this.bobTime * 1.5) * 0.02;
  }
}

// Städ - smedjeplats där köpmannen uppgraderar saker
export class Anvil {
  constructor(scene, position) {
    this.scene = scene;
    this.group = new THREE.Group();

    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x37474f,
      metalness: 0.7,
      roughness: 0.4,
    });

    // Fot (bredare bas)
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5), ironMat);
    base.position.y = 0.15;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    // Hals (smalare midja)
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.35), ironMat);
    neck.position.y = 0.45;
    neck.castShadow = true;
    this.group.add(neck);

    // Topp (där man slår)
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.45), ironMat);
    top.position.y = 0.7;
    top.castShadow = true;
    this.group.add(top);

    // Horn (spetsig sida)
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 6), ironMat);
    horn.position.set(-0.7, 0.7, 0);
    horn.rotation.z = Math.PI / 2;
    horn.castShadow = true;
    this.group.add(horn);

    // Hammare på toppen
    const hammerHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x6d4c2a }),
    );
    hammerHandle.position.set(0.2, 0.95, 0);
    hammerHandle.rotation.z = -0.4;
    this.group.add(hammerHandle);
    const hammerHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.15, 0.12),
      ironMat,
    );
    hammerHead.position.set(0.42, 1.04, 0);
    this.group.add(hammerHead);

    this.group.position.copy(position);
    scene.add(this.group);
  }
}
