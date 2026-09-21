/* ============================================
   MODELES — chargement et instanciation des .glb
   ============================================
   Un fichier .glb est chargé UNE fois (cache), puis chaque animal à l'écran
   en reçoit une copie. Piège : un modèle animé par squelette (SkinnedMesh) ne
   se copie pas avec .clone() — les os de la copie resteraient liés à
   l'original et l'animation casserait. On passe par SkeletonUtils.clone().
   ============================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as clonerAvecSquelette } from 'three/addons/utils/SkeletonUtils.js';

const cache = new Map();   // id d'espèce → gltf chargé { scene, animations }

/**
 * Charge tous les modèles du catalogue. Renvoie une promesse qui se résout
 * quand tout est là ; surProgression(0 → 1) sert à la barre de chargement.
 */
export function chargerModeles(especes, surProgression) {
  // Le LoadingManager compte les fichiers chargés / attendus, tous chargeurs confondus
  const gestionnaire = new THREE.LoadingManager();
  gestionnaire.onProgress = (url, charges, total) => surProgression?.(charges / total);
  const chargeur = new GLTFLoader(gestionnaire);

  return Promise.all(especes.map((espece) => new Promise((resoudre, rejeter) => {
    chargeur.load(
      espece.modele,
      (gltf) => { cache.set(espece.id, gltf); resoudre(gltf); },
      undefined,                                   // progression par fichier : pas utile ici
      (erreur) => rejeter(new Error(`Impossible de charger ${espece.modele}`)),
    );
  })));
}

/** Le modèle tel que chargé (pour le banc, qui instancie la géométrie lui-même). */
export function brut(id) {
  const gltf = cache.get(id);
  if (!gltf) throw new Error(`Modèle non chargé : ${id}`);
  return gltf;
}

/** Une copie indépendante du modèle, prête à être animée. */
export function instancier(id) {
  const gltf = cache.get(id);
  if (!gltf) throw new Error(`Modèle non chargé : ${id}`);
  const objet = clonerAvecSquelette(gltf.scene);
  const mixer = new THREE.AnimationMixer(objet);   // un mixer PAR animal : chacun a son propre temps
  return { objet, mixer, clips: gltf.animations };  // les clips, eux, sont partagés (lecture seule)
}
