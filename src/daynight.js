import * as THREE from 'three';

// Dag/natt-cykel: styr himmelsfärg, solriktning, ljusstyrka
// och returnerar 'day' eller 'night' så spelet vet när vargar ska komma.
const DAY_LENGTH = 90; // sekunder för en hel dag (kort så Melwin märker)

export class DayNight {
  constructor(scene, sunLight, ambientLight) {
    this.scene = scene;
    this.sun = sunLight;
    this.ambient = ambientLight;
    this.elapsed = 20; // starta tidig morgon
    this.isNight = false;

    // Skapa stjärnor som syns på natten
    this._createStars();
  }

  _createStars() {
    const starsGeo = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < 400; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45 + Math.PI * 0.05; // bara övre halvan
      const r = 250;
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
    }
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false }),
    );
    this.stars.visible = false;
    this.scene.add(this.stars);

    // Måne
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xeceff1 }),
    );
    this.moon.visible = false;
    this.scene.add(this.moon);
  }

  // Returnerar fas 0..1: 0=midnatt, 0.25=soluppgång, 0.5=middag, 0.75=solnedgång
  getPhase() {
    return (this.elapsed % DAY_LENGTH) / DAY_LENGTH;
  }

  update(dt) {
    this.elapsed += dt;
    const phase = this.getPhase();

    // sunAngle: 0 vid soluppgång, π vid solnedgång (sol över horisonten 0.25..0.75)
    const sunAngle = (phase - 0.25) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunZ = Math.cos(sunAngle);

    this.sun.position.set(20, sunY * 60, sunZ * 60);

    // Är det natt?
    const wasNight = this.isNight;
    this.isNight = sunY < -0.1;
    const justChanged = wasNight !== this.isNight;

    // Ljus och färg
    if (sunY > 0.05) {
      // Dag
      const dayStrength = Math.min(1, sunY * 2);
      this.sun.intensity = 0.6 + dayStrength * 0.5;
      this.ambient.intensity = 0.35 + dayStrength * 0.25;
      this.sun.color.setHex(0xfff4d6);
      const skyR = 0x87, skyG = 0xce, skyB = 0xeb;
      this.scene.background = new THREE.Color(skyR / 255, skyG / 255, skyB / 255);
      this.scene.fog.color.set(skyR / 255, skyG / 255, skyB / 255);
      this.stars.visible = false;
      this.moon.visible = false;
    } else if (sunY > -0.1) {
      // Skymning/gryning - orange/rosa
      const t = (sunY + 0.1) / 0.15; // 0..1 över skymningen
      this.sun.intensity = 0.2 + t * 0.4;
      this.ambient.intensity = 0.25;
      this.sun.color.setHex(0xff8a50);
      const r = 0.5 + t * 0.05;
      const g = 0.3 + t * 0.5;
      const b = 0.35 + t * 0.55;
      this.scene.background = new THREE.Color(r, g, b);
      this.scene.fog.color.set(r, g, b);
      this.stars.visible = false;
      this.moon.visible = false;
    } else {
      // Natt
      this.sun.intensity = 0.05;
      this.ambient.intensity = 0.18;
      this.scene.background = new THREE.Color(0.04, 0.05, 0.12);
      this.scene.fog.color.set(0.04, 0.05, 0.12);
      this.stars.visible = true;
      this.moon.visible = true;
      // Månen rör sig motsatt solen
      this.moon.position.set(20, -sunY * 80, -sunZ * 80);
    }
  }

  isNighttime() {
    return this.isNight;
  }

  getTimeLabel() {
    const phase = this.getPhase();
    if (phase < 0.2) return '🌙 Natt';
    if (phase < 0.3) return '🌅 Gryning';
    if (phase < 0.7) return '☀️ Dag';
    if (phase < 0.8) return '🌇 Skymning';
    return '🌙 Natt';
  }
}
