import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

export function loadModel(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      }),
    );
  }
  return cache.get(url);
}

export async function cloneModel(url) {
  const gltf = await loadModel(url);
  const root = gltf.scene.clone(true);

  root.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh) {
      obj.castShadow = true;
      obj.receiveShadow = false;
      obj.frustumCulled = false;
      if (obj.material) {
        obj.material = obj.material.clone();
      }
    }
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of gltf.animations || []) {
    actions[clip.name] = mixer.clipAction(clip);
  }

  return { root, mixer, actions };
}
