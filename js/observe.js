/* ============================================
   OBSERVE — poser son regard sur un animal
   ============================================
   Le curseur reste sur un animal → une jauge se remplit (2 s pour un commun,
   3,5 s pour un légendaire). Pleine → l'observation est validée. Si le curseur
   sort, la jauge se vide en 0,5 s : on a le droit de trembler un peu.

   Détection : pas de raycast sur les milliers de triangles des modèles, mais
   sur une SPHÈRE englobante par animal, un peu plus grande que lui (indulgence).
   ============================================ */

import * as THREE from 'three';
import { observer as enregistrer } from './collection.js';

const DUREE = { 'commun': 2.0, 'peu-commun': 2.5, 'rare': 3.0, 'legendaire': 3.5 };
const DUREE_VIDAGE = 0.5;   // s pour que la jauge se vide quand on quitte l'animal

export function creerObservation({ camera, animauxVisibles, ui, surObservation }) {
  const raycaster = new THREE.Raycaster();
  const souris = new THREE.Vector2(0, 0);      // en coordonnées normalisées (-1 → 1)
  const sphere = new THREE.Sphere();
  const impact = new THREE.Vector3();
  let sourisDedans = false;

  let cible = null;          // l'animal sous le curseur (ou celui qu'on vient de quitter)
  let progression = 0;       // 0 → 1
  let actif = true;          // faux quand le carnet est ouvert : on ne « regarde » plus le bassin

  function suivre(e) {
    souris.x = (e.clientX / window.innerWidth) * 2 - 1;
    souris.y = -(e.clientY / window.innerHeight) * 2 + 1;
    sourisDedans = true;
    ui.curseur.deplacer(e.clientX, e.clientY);
    ui.curseur.visible(true);
  }
  window.addEventListener('pointermove', suivre);
  // Tactile : pas de survol. « Garder le curseur » devient « toucher et maintenir » —
  // l'anneau se remplit tant que le doigt reste sur l'animal (et le suit).
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') suivre(e); });
  const lacher = (e) => { if (e.pointerType === 'touch') { sourisDedans = false; ui.curseur.visible(false); } };
  window.addEventListener('pointerup', lacher);
  window.addEventListener('pointercancel', lacher);
  document.addEventListener('pointerleave', () => { sourisDedans = false; ui.curseur.visible(false); });

  /** L'animal le plus proche dont la sphère est traversée par le rayon de la souris. */
  function animalSousCurseur() {
    raycaster.setFromCamera(souris, camera);
    let plusProche = null;
    let distanceMin = Infinity;
    for (const animal of animauxVisibles()) {
      if (animal.observe) continue;                            // déjà validé pendant ce passage
      sphere.center.copy(animal.objet.position);
      sphere.radius = animal.rayonHitbox ?? Math.max(0.25, animal.espece.taille * 0.5 * 1.3);   // un banc a la sienne
      if (raycaster.ray.intersectSphere(sphere, impact)) {
        const d = impact.distanceTo(camera.position);
        if (d < distanceMin) { distanceMin = d; plusProche = animal; }
      }
    }
    return plusProche;
  }

  function valider(animal) {
    animal.observe = true;
    animal.halo();
    const resultat = enregistrer(animal.espece.id);
    surObservation({ animal, ...resultat });
  }

  return {
    valider,   // exposé pour le mode démo
    actif(oui) {
      actif = oui;
      if (!oui) { cible = null; progression = 0; ui.curseur.progression(0); ui.curseur.survol(false); }
    },
    maj(dt) {
      const dessus = (actif && sourisDedans) ? animalSousCurseur() : null;
      ui.curseur.survol(dessus !== null);

      if (dessus && dessus !== cible) {          // nouvel animal : on repart de zéro
        cible = dessus;
        progression = 0;
      }
      if (dessus && dessus === cible) {          // on reste dessus : la jauge monte
        progression += dt / DUREE[cible.espece.rarete];
        if (progression >= 1) {
          valider(cible);
          cible = null;
          progression = 0;
        }
      } else if (cible) {                        // on l'a quitté : la jauge redescend
        progression -= dt / DUREE_VIDAGE;
        if (progression <= 0) { progression = 0; cible = null; }
      }
      ui.curseur.progression(progression);
    },
  };
}
