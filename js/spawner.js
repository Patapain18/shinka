/* ============================================
   SPAWNER — le metteur en scène
   ============================================
   Décide QUI apparaît, QUAND, et PAR OÙ. Étape 3 : tirage uniforme dans le
   catalogue, un passage toutes les 4 à 9 s, six animaux maximum à l'écran.
   Étape 4 : tirage pondéré par la rareté et l'heure réelle, cooldown, pitié.
   ============================================ */

import * as THREE from 'three';
import { Animal } from './animal.js';
import { ESPECES } from './species.js';

export function creerSpawner(scene, camera) {
  const animaux = [];
  const MAX_ANIMAUX = 6;
  let compteur = THREE.MathUtils.randFloat(2, 5);   // secondes avant le prochain passage

  /* Une trajectoire d'un bord à l'autre de la vitre, à une distance et une
     hauteur propres à l'espèce, avec de légers écarts pour que ce ne soit
     jamais une ligne droite. */
  function trajectoirePour(espece) {
    const z = THREE.MathUtils.randFloat(espece.distance[0], espece.distance[1]);
    const y = THREE.MathUtils.randFloat(espece.profondeur[0], espece.profondeur[1]);

    // Demi-largeur visible à cette distance : angle vertical de la caméra × ratio de l'écran.
    // Au-delà, on est hors champ : c'est là que l'animal apparaît et disparaît.
    const demiLargeur = Math.abs(z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const marge = espece.taille * 1.5 + 2;            // il entre entièrement hors champ
    const sens = Math.random() < 0.5 ? 1 : -1;        // 1 : de gauche à droite
    const xDepart = -sens * (demiLargeur + marge);

    const NB_POINTS = 5;
    const points = [];
    for (let i = 0; i < NB_POINTS; i++) {
      const t = i / (NB_POINTS - 1);
      const extremite = (i === 0 || i === NB_POINTS - 1);
      const ecart = extremite ? 0 : espece.ondulation;   // les bouts restent nets
      points.push(new THREE.Vector3(
        THREE.MathUtils.lerp(xDepart, -xDepart, t),
        y + THREE.MathUtils.randFloatSpread(ecart * 2),
        z + THREE.MathUtils.randFloatSpread(ecart * 3),
      ));
    }
    // Catmull-Rom : une courbe lisse qui PASSE par les points (contrairement à Bézier).
    // 'centripetal' évite les boucles quand deux points sont proches.
    return new THREE.CatmullRomCurve3(points, false, 'centripetal');
  }

  function tirer() {
    return ESPECES[Math.floor(Math.random() * ESPECES.length)];   // étape 4 : pondéré
  }

  function faireEntrer(espece, uDepart = 0) {
    const animal = new Animal(espece, trajectoirePour(espece), uDepart);
    scene.add(animal.objet);
    animaux.push(animal);
    return animal;
  }

  function retirer(indice) {
    const animal = animaux[indice];
    scene.remove(animal.objet);
    animal.mixer.stopAllAction();
    animaux.splice(indice, 1);
  }

  // Peuplement initial : quand on entre, le bassin n'est jamais vide
  for (let i = 0; i < 2; i++) faireEntrer(tirer(), THREE.MathUtils.randFloat(0.2, 0.6));

  return {
    animaux,
    maj(dt) {
      compteur -= dt;
      if (compteur <= 0) {
        compteur = THREE.MathUtils.randFloat(4, 9);
        if (animaux.length < MAX_ANIMAUX) faireEntrer(tirer());
      }
      // On parcourt à l'envers : retirer un élément ne décale pas ceux qui restent à voir
      for (let i = animaux.length - 1; i >= 0; i--) {
        animaux[i].maj(dt);
        if (animaux[i].fini) retirer(i);
      }
    },
  };
}
