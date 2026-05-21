import * as THREE from 'three';

const SHIRT_COLORS = [0x4caf50, 0x2196f3, 0xff9800, 0xe91e63, 0x9c27b0, 0x607d8b];
const PANTS = 0x6d4c2a;
const SKIN = 0xffdbac;
const HAIR = 0x4e342e;

function hashColor(userId) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0;
  }
  return SHIRT_COLORS[Math.abs(h) % SHIRT_COLORS.length];
}

function makeLimb(x, y, w, h, d, color) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.position.y = -h / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

function makeNameSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 32px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = 'white';
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.4, 0.6, 1);
  sprite.position.y = 2.4;
  sprite.renderOrder = 999;
  return sprite;
}

function shortAngle(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class RemotePlayer {
  constructor(scene, userId, username) {
    this.scene = scene;
    this.userId = userId;
    this.username = username;

    this.position = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.facing = 0;
    this.targetFacing = 0;
    this.action = 'idle';
    this.walkTime = 0;
    this.attackTime = 0;
    this.isGhost = false;

    const shirt = hashColor(userId);

    this.group = new THREE.Group();

    this.torsoPivot = new THREE.Group();
    this.torsoPivot.position.y = 0.8;
    this.group.add(this.torsoPivot);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.9, 0.45),
      new THREE.MeshStandardMaterial({ color: shirt }),
    );
    body.position.y = 0.45;
    body.castShadow = true;
    this.bodyMesh = body;
    this.torsoPivot.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: SKIN }),
    );
    head.position.y = 1.2;
    head.castShadow = true;
    this.torsoPivot.add(head);

    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.18, 0.65),
      new THREE.MeshStandardMaterial({ color: HAIR }),
    );
    hair.position.y = 1.56;
    this.torsoPivot.add(hair);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const le = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    le.position.set(-0.13, 1.25, 0.31);
    this.torsoPivot.add(le);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    re.position.set(0.13, 1.25, 0.31);
    this.torsoPivot.add(re);

    this.leftArmPivot = makeLimb(-0.55, 0.85, 0.22, 0.9, 0.3, SKIN);
    this.rightArmPivot = makeLimb(0.55, 0.85, 0.22, 0.9, 0.3, SKIN);
    this.torsoPivot.add(this.leftArmPivot, this.rightArmPivot);

    this.leftLegPivot = makeLimb(-0.2, 0.8, 0.32, 0.85, 0.38, PANTS);
    this.rightLegPivot = makeLimb(0.2, 0.8, 0.32, 0.85, 0.38, PANTS);
    this.group.add(this.leftLegPivot, this.rightLegPivot);

    this.nameTag = makeNameSprite(username);
    this.group.add(this.nameTag);

    this.materials = [body.material, head.material, hair.material];
    for (const limb of [
      this.leftArmPivot,
      this.rightArmPivot,
      this.leftLegPivot,
      this.rightLegPivot,
    ]) {
      this.materials.push(limb.children[0].material);
    }

    scene.add(this.group);
  }

  setTargetState({ x, y, z, facing, action, hp }) {
    this.targetPosition.set(x, y, z);
    this.targetFacing = facing;
    if (action) this.action = action;
    const ghost = typeof hp === 'number' && hp <= 0;
    if (ghost !== this.isGhost) {
      this.isGhost = ghost;
      for (const m of this.materials) {
        m.transparent = ghost;
        m.opacity = ghost ? 0.35 : 1;
      }
    }
  }

  update(dt) {
    const lerpFactor = Math.min(dt * 12, 1);
    this.position.lerp(this.targetPosition, lerpFactor);
    this.facing += shortAngle(this.facing, this.targetFacing) * lerpFactor;

    this.group.position.copy(this.position);
    this.group.rotation.y = this.facing;

    const moving = this.action === 'walk' || this.action === 'run';
    if (moving) {
      this.walkTime += dt * (this.action === 'run' ? 10 : 7);
      const swing = Math.sin(this.walkTime) * 0.7;
      this.leftLegPivot.rotation.x = swing;
      this.rightLegPivot.rotation.x = -swing;
      this.leftArmPivot.rotation.x = -swing * 0.6;
      this.rightArmPivot.rotation.x = swing * 0.6;
    } else {
      this.walkTime = 0;
      this.leftLegPivot.rotation.x *= 1 - lerpFactor;
      this.rightLegPivot.rotation.x *= 1 - lerpFactor;
      this.leftArmPivot.rotation.x *= 1 - lerpFactor;
      this.rightArmPivot.rotation.x *= 1 - lerpFactor;
    }

    if (this.action === 'attack') {
      this.attackTime = Math.min(this.attackTime + dt * 5, 1);
      this.rightArmPivot.rotation.x = -Math.PI / 2 * Math.sin(this.attackTime * Math.PI);
    } else if (this.attackTime > 0) {
      this.attackTime = Math.max(0, this.attackTime - dt * 5);
    }
  }

  destroy() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }
}
