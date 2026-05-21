import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

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
  const root = cloneSkeleton(gltf.scene);

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

// Nollställer transforms på alla container-noder (icke-bones, icke-meshes)
// i hierarkin. Behövs när Blender-exporter har lagt en authoring-offset
// på rig-noden (typ WolfRig vid [-25,0,0] eller PlayerRig vid [-55,0,0])
// som annars förskjuter hela modellen från sin logiska position.
export function resetContainerTransforms(root) {
  const resetOne = (obj) => {
    if (!obj.isBone && !obj.isMesh && !obj.isSkinnedMesh) {
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(1, 1, 1);
    }
  };
  resetOne(root);
  root.traverse(resetOne);
  root.updateMatrixWorld(true);
}

// Laddar en utrustnings-GLB (typ rustning) och rebindar dess skinned meshes
// till värdens skelett genom att matcha bone-namn. Returnerar en Group som
// innehåller alla armor-meshes - toggla synlighet via group.visible.
//
// Hanterar armor-modeller som är authorade med en root-translation (typ
// shadow-rustningen vid x=-55.6) genom att nollställa container-transforms
// och räkna om boneInverses från armorens egna bones (alltid i bind pose
// eftersom inget animerar dem). Då matchar bind pose host-rigen vid
// origin oavsett authoring-position.
export async function loadArmorOntoSkeleton(url, hostRoot) {
  const { root: armorRoot } = await cloneModel(url);
  resetContainerTransforms(armorRoot);

  const group = new THREE.Group();
  group.visible = false;
  hostRoot.add(group);

  const skinned = [];
  armorRoot.traverse((obj) => {
    if (obj.isSkinnedMesh) skinned.push(obj);
  });

  for (const mesh of skinned) {
    const newBones = mesh.skeleton.bones.map((bone) => {
      return hostRoot.getObjectByName(bone.name) || bone;
    });
    const boneInverses = mesh.skeleton.bones.map((bone) =>
      bone.matrixWorld.clone().invert(),
    );
    const newSkeleton = new THREE.Skeleton(newBones, boneInverses);
    mesh.bind(newSkeleton, new THREE.Matrix4());
    group.add(mesh);
  }
  return group;
}
