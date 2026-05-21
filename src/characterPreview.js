import * as THREE from 'three';
import { cloneModel } from './models.js';

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
        this._attach('/models/sword.glb', handR, 'sword');
        this._attach('/models/axe.glb', handR, 'axe');
      }
      if (handL) {
        this._attach('/models/bow.glb', handL, 'bow');
        this._attach('/models/shield.glb', handL, 'shield');
      }
    } catch (err) {
      console.warn('[CharacterPreview] model error', err);
    }
  }

  async _attach(url, bone, key) {
    const { root } = await cloneModel(url);
    for (const name of ['Weapon_Sword', 'Weapon_Bow', 'Weapon_Axe', 'Weapon_Shield']) {
      const obj = root.getObjectByName(name);
      if (obj) {
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, 0, 0);
        break;
      }
    }
    bone.add(root);
    root.visible = false;
    this.weapons[key] = root;
  }

  _refreshEquipped() {
    const eq = this.player?.equipped || {};
    if (this.weapons.sword) this.weapons.sword.visible = !!eq.sword;
    if (this.weapons.bow) this.weapons.bow.visible = !!eq.bow;
    if (this.weapons.shield) this.weapons.shield.visible = !!eq.shield;
    if (this.weapons.axe) this.weapons.axe.visible = false;
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
    this.renderer.dispose();
  }
}
