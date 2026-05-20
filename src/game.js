import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { Inventory } from './inventory.js';
import { Upgrades } from './upgrades.js';
import { UI } from './ui.js';
import { Save } from './save.js';

const INTERACT_RANGE = 3.0;

export class Game {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 180);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this._setupLights();
    this._setupCamera();

    this.save = new Save();
    this.inventory = new Inventory();
    this.upgrades = new Upgrades();
    this.world = new World(this.scene);
    this.player = new Player(this.scene);
    this.controls = new Controls();
    this.ui = new UI(this);

    this.save.load(this.inventory, this.upgrades, this.player);

    this.clock = new THREE.Clock();
    this.interactingWith = null;
    this.interactProgress = 0;

    window.addEventListener('resize', () => this._onResize());
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff4d6, 0.95);
    sun.position.set(40, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  _setupCamera() {
    this.cameraAngle = 0;
    this.cameraDistance = 13;
    this.cameraHeight = 9;
    this.mouseDown = false;
    this.lastMouseX = 0;

    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.lastMouseX = e.clientX;
    });
    window.addEventListener('mouseup', () => (this.mouseDown = false));
    window.addEventListener('mousemove', (e) => {
      if (this.mouseDown) {
        const dx = e.clientX - this.lastMouseX;
        this.cameraAngle -= dx * 0.005;
        this.lastMouseX = e.clientX;
      }
    });

    // Pinch/touch rotation för mobil/iPad
    let lastTouchX = 0;
    dom.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) lastTouchX = e.touches[0].clientX;
    });
    dom.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchX;
        this.cameraAngle -= dx * 0.005;
        lastTouchX = e.touches[0].clientX;
      }
    });
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start() {
    this._animate();
    // Auto-spara var 5:e sekund
    setInterval(() => {
      this.save.save(this.inventory, this.upgrades, this.player);
    }, 5000);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const speed = this.upgrades.getMoveSpeed();
    const moveVec = this.controls.getMovementVector(this.cameraAngle);

    if (moveVec.lengthSq() > 0 && !this.ui.shopOpen) {
      this.player.move(moveVec, speed * dt);
      if (this.interactingWith) this._cancelInteraction();
    } else {
      this.player.idle(dt);
    }

    // Kameran följer spelaren
    const px = this.player.position.x;
    const pz = this.player.position.z;
    this.camera.position.set(
      px + Math.sin(this.cameraAngle) * this.cameraDistance,
      this.cameraHeight,
      pz + Math.cos(this.cameraAngle) * this.cameraDistance,
    );
    this.camera.lookAt(px, 1.2, pz);

    const nearest = this.world.getNearestInteractable(this.player.position, INTERACT_RANGE);

    if (
      !this.ui.shopOpen &&
      this.controls.isInteractPressed() &&
      nearest &&
      nearest.canHarvest(this.upgrades, this.inventory)
    ) {
      if (this.interactingWith !== nearest) {
        this.interactingWith = nearest;
        this.interactProgress = 0;
        // Vänd gubben mot resursen
        const dx = nearest.position.x - px;
        const dz = nearest.position.z - pz;
        this.player.group.rotation.y = Math.atan2(dx, dz);
        if (nearest.actionType === 'chop') this.player.startChop();
      }
      const duration = nearest.getHarvestDuration(this.upgrades);
      this.interactProgress += dt / duration;
      this.player.updateChop(dt);
      if (this.interactProgress >= 1) {
        const reward = this.interactingWith.harvest();
        this.inventory.add(reward.type, reward.amount);
        this.ui.showToast(this._rewardEmoji(reward.type) + ' +' + reward.amount);
        this.interactProgress = 0;
        // Avbryt om resursen är borta eller ryggsäcken är full
        if (!this.interactingWith.canHarvest(this.upgrades, this.inventory)) {
          this._cancelInteraction();
        }
      }
    } else if (this.interactingWith && !this.controls.isInteractPressed()) {
      this._cancelInteraction();
    } else if (this.interactingWith && nearest !== this.interactingWith) {
      this._cancelInteraction();
    }

    this.world.update(dt);

    this.ui.update({
      nearest,
      interactingWith: this.interactingWith,
      progress: this.interactProgress,
      inventory: this.inventory,
      upgrades: this.upgrades,
    });
  }

  _cancelInteraction() {
    this.interactingWith = null;
    this.interactProgress = 0;
    this.player.stopChop();
  }

  _rewardEmoji(type) {
    return { wood: '🪵', berry: '🫐', fish: '🐟' }[type] || '';
  }
}
