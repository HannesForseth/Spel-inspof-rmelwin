import * as THREE from 'three';
import { cloneModel, loadArmorOntoSkeleton } from './models.js';

export class CharacterPreview {
  constructor(canvas, upgrades, player) {
    this.canvas = canvas;
    this.upgrades = upgrades;
    this.player = player;
    this.equipped = player?.equipped || {};
    this.weapons = {};
    this.rotation = 0;
    this.running = false;
    this.lastTime = 0;

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(38, canvas.width / canvas.height, 0.1, 50);
    this.camera.position.set(0, 1.6, 4.2);
    this.camera.lookAt(0, 1.1, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(3, 6, 4);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0xb0c0ff, 0.4);
    fill.position.set(-3, 2, -2);
    this.scene.add(fill);

    this._loadModel();
  }

  async _loadModel() {
    try {
      const { root, mixer, actions } = await cloneModel('/models/player.glb');
      this.model = root;
      this.mixer = mixer;
      this.actions = actions;
      root.position.set(0, 0, 0);
      this.scene.add(root);
      if (actions?.Idle) {
        actions.Idle.reset().play();
      }
      this._rootBone = root.getObjectByName('root');
      this._hipsBone = root.getObjectByName('hips');
      this._rootRest = this._rootBone?.position.clone();
      this._hipsRest = this._hipsBone?.position.clone();

      const handR = root.getObjectByName('hand.R');
      const handL = root.getObjectByName('hand.L');
      if (handR) {
        this._attach('/models/weapon_sword.glb', handR, 'sword');
        this._attach('/models/weapon_axe.glb', handR, 'axe');
        this._attach('/models/weapon_shadow_sword.glb', handR, 'shadowSword', { boostEmissive: true });
      }
      if (handL) {
        this._attach('/models/weapon_bow.glb', handL, 'bow');
        this._attach('/models/weapon_shield.glb', handL, 'shield');
        this._attach('/models/weapon_shadow_shield.glb', handL, 'shadowShield', { boostEmissive: true });
      }
      loadArmorOntoSkeleton('/models/armor_silver.glb', root).then((g) => {
        this.armorGroup = g;
      });
      loadArmorOntoSkeleton('/models/armor_shadow.glb', root).then((g) => {
        this.shadowArmorGroup = g;
      });
    } catch (err) {
      console.warn('[CharacterPreview] model error', err);
    }
  }

  async _attach(url, bone, key, opts = {}) {
    const { root } = await cloneModel(url);
    let weaponNode = null;
    root.traverse((obj) => {
      if (!weaponNode && obj.name && obj.name.startsWith('Weapon_')) {
        weaponNode = obj;
      }
    });
    if (weaponNode) {
      weaponNode.position.set(0, 0, 0);
      weaponNode.rotation.set(0, 0, 0);
    }
    if (opts.boostEmissive) {
      root.traverse((m) => {
        if (m.isMesh && m.material && m.material.emissive) {
          m.material.emissiveIntensity = (m.material.emissiveIntensity || 1) * 2.5;
        }
      });
    }
    bone.add(root);
    root.visible = false;
    this.weapons[key] = root;
  }

  _refreshEquipped() {
    const eq = this.player?.equipped || {};
    const shadow = !!this.player?.forceShadowArmor;
    if (this.weapons.sword) this.weapons.sword.visible = !shadow && !!eq.sword;
    if (this.weapons.shadowSword) this.weapons.shadowSword.visible = shadow && !!eq.sword;
    if (this.weapons.bow) this.weapons.bow.visible = !!eq.bow;
    if (this.weapons.shield) this.weapons.shield.visible = !shadow && !!eq.shield;
    if (this.weapons.shadowShield) this.weapons.shadowShield.visible = shadow && !!eq.shield;
    if (this.weapons.axe) this.weapons.axe.visible = false;
    if (this.shadowArmorGroup) this.shadowArmorGroup.visible = shadow;
    if (this.armorGroup) this.armorGroup.visible = !shadow && !!eq.armor;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this._tick();
  }

  stop() {
    this.running = false;
  }

  _tick = () => {
    if (!this.running) return;
    const now = performance.now() / 1000;
    const dt = Math.min(now - this.lastTime, 0.1);
    this.lastTime = now;

    this.rotation += dt * 0.5;
    if (this.model) this.model.rotation.y = this.rotation;
    if (this.mixer) {
      this.mixer.update(dt);
      if (this._rootBone && this._rootRest) {
        this._rootBone.position.copy(this._rootRest);
      }
      if (this._hipsBone && this._hipsRest) {
        this._hipsBone.position.x = this._hipsRest.x;
        this._hipsBone.position.z = this._hipsRest.z;
      }
    }
    this._refreshEquipped();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._tick);
  };

  dispose() {
    this.stop();
    const disposeTree = (g) => {
      if (!g) return;
      g.traverse((obj) => {
        if (obj.geometry?.dispose) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) m.dispose?.();
        }
      });
    };
    disposeTree(this.armorGroup);
    disposeTree(this.shadowArmorGroup);
    for (const w of Object.values(this.weapons)) disposeTree(w);
    disposeTree(this.model);
    this.renderer.dispose();
  }
}
