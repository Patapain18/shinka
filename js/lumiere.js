/* ============================================
   LUMIERE — ce qui fait briller un animal
   ============================================
   Deux raisons de briller, combinées dans l'émissif du matériau :
   - le halo d'observation (bref, bleuté), déclenché par halo()
   - la lueur nocturne des espèces qui ont un champ `emission` (la méduse),
     qui suit facteurNuit(heure)
   Partagé par Animal (un individu) et Banc (des centaines en un objet).
   ============================================ */

import * as THREE from 'three';
import { facteurNuit } from './daytime.js';

export function creerLumiere(materiaux, emission = null, horloge = null) {
  const couleur = emission ? new THREE.Color(emission) : null;
  let haloRestant = 0;
  let haloDuree = 1.6;
  let active = false;

  return {
    halo(duree = 1.6) { haloDuree = duree; haloRestant = duree; },
    maj(dt) {
      let kHalo = 0;
      if (haloRestant > 0) {
        haloRestant = Math.max(0, haloRestant - dt);
        const t = 1 - haloRestant / haloDuree;                 // monte vite, redescend lentement
        kHalo = Math.sin(Math.PI * Math.pow(t, 0.55)) * 0.14;
      }
      const kNuit = (couleur && horloge) ? 0.05 + 0.6 * facteurNuit(horloge.heure) : 0;
      const actif = kHalo > 0 || kNuit > 0;
      if (!actif && !active) return;                           // rien à faire, rien à éteindre
      active = actif;
      for (const m of materiaux) {
        m.emissive.setRGB(0.35 * kHalo + (couleur ? couleur.r * kNuit : 0),
                          0.70 * kHalo + (couleur ? couleur.g * kNuit : 0),
                          1.00 * kHalo + (couleur ? couleur.b * kNuit : 0));
      }
    },
  };
}
