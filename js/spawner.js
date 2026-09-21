/* ============================================
   SPAWNER — le metteur en scène
   ============================================
   Décide QUI apparaît, QUAND, et PAR OÙ (DESIGN.md §5) :
   - toutes les 4 à 9 s, un tirage ; huit animaux maximum à l'écran
   - candidats = espèces actives à cette heure ET sorties de leur temps de repos
   - « pitié » : aucun rare/légendaire depuis 6 min → on force le tirage parmi eux
   - tirage pondéré : commun 60 / peu commun 25 / rare 12 / légendaire 3
   - les espèces grégaires (groupe > 1) entrent en formation lâche
   Mode PARADE (?parade dans l'adresse, pour tester) : plus d'heure, de rareté ni de
   repos — toutes les espèces défilent à la file, mélangées, une toutes les 3 à 6 s,
   la baleine comprise ; l'éclairage, lui, reste celui de l'heure réelle.
   ============================================ */

import * as THREE from 'three';
import { Animal } from './animal.js';
import { Banc } from './banc.js';
import { ESPECES } from './species.js';

export const POIDS = { 'commun': 60, 'peu-commun': 25, 'rare': 12, 'legendaire': 3 };
// Temps de repos après un passage, en secondes. Plus c'est rare, plus on attend :
// revoir un légendaire trois fois de suite tuerait la magie.
const REPOS = { 'commun': 20, 'peu-commun': 45, 'rare': 150, 'legendaire': 420 };
const PITIE = 360;            // s sans rare ni légendaire avant d'en forcer un
const MAX_ANIMAUX = 8;
const RARE = (e) => e.rarete === 'rare' || e.rarete === 'legendaire';

export function creerSpawner(scene, camera, horloge, { surEntree } = {}) {
  const parade = new URLSearchParams(location.search).has('parade');
  let file = [];                      // parade : les espèces qui restent à faire passer dans ce tour
  const animaux = [];
  const dernierPassage = new Map();   // id d'espèce → instant (s) de son dernier passage
  let dernierRare = 0;
  let maintenant = 0;                 // secondes écoulées depuis l'ouverture
  let compteur = THREE.MathUtils.randFloat(2, 5);

  /* Les points d'une trajectoire d'un bord à l'autre de la vitre, à une distance
     et une hauteur propres à l'espèce, avec de légers écarts pour que ce ne soit
     jamais une ligne droite. */
  function pointsPour(espece) {
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
    return points;
  }

  // Catmull-Rom : une courbe lisse qui PASSE par les points (contrairement à Bézier).
  // 'centripetal' évite les boucles quand deux points sont proches.
  function courbe(points, decalage) {
    return new THREE.CatmullRomCurve3(points.map((p) => p.clone().add(decalage)), false, 'centripetal');
  }

  function candidats() {
    const phase = horloge.phase;
    return ESPECES.filter((e) =>
      e.heures.includes(phase) &&
      maintenant - (dernierPassage.get(e.id) ?? -Infinity) >= REPOS[e.rarete]);
  }

  /** Parade : chaque tour fait passer toutes les espèces une fois, dans un ordre mélangé. */
  function defiler() {
    if (!file.length) file = [...ESPECES].sort(() => Math.random() - 0.5);
    return file.pop();
  }

  function tirer() {
    if (parade) return defiler();
    let liste = candidats();
    if (liste.length === 0) return null;
    if (maintenant - dernierRare > PITIE) {
      const rares = liste.filter(RARE);
      if (rares.length) liste = rares;              // la pitié : on force un rare
    }
    // Tirage pondéré : un nombre entre 0 et la somme des poids, puis on avance dans
    // la liste en retranchant chaque poids. Une espèce de poids 60 a 60 chances
    // sur (60 + 25 + 12 + 3) de sortir — quand toutes sont candidates.
    const total = liste.reduce((somme, e) => somme + POIDS[e.rarete], 0);
    let r = Math.random() * total;
    for (const e of liste) {
      r -= POIDS[e.rarete];
      if (r <= 0) return e;
    }
    return liste[liste.length - 1];
  }

  function faireEntrer(espece, uDepart = 0) {
    const points = pointsPour(espece);
    const nb = espece.groupe;
    const vitesse = espece.vitesse * THREE.MathUtils.randFloat(0.85, 1.15);
    const rien = new THREE.Vector3();
    let dernier = null;
    if (espece.banc) {                                   // un banc : un seul objet pour tous
      dernier = new Banc(espece, courbe(points, rien), { nombre: nb, uDepart, vitesse, horloge });
      scene.add(dernier.objet);
      animaux.push(dernier);
    } else for (let i = 0; i < nb; i++) {
      // En groupe : même trajectoire un peu décalée, même vitesse (sinon ils se dispersent)
      const decalage = nb > 1
        ? new THREE.Vector3(THREE.MathUtils.randFloatSpread(1.6), THREE.MathUtils.randFloatSpread(0.8), THREE.MathUtils.randFloatSpread(1.2))
            .multiplyScalar(espece.taille * 2)
        : rien;
      const animal = new Animal(espece, courbe(points, decalage), uDepart, vitesse * (nb > 1 ? THREE.MathUtils.randFloat(0.97, 1.03) : 1), horloge);
      scene.add(animal.objet);
      animaux.push(animal);
      dernier = animal;
    }
    dernierPassage.set(espece.id, maintenant);
    if (RARE(espece)) dernierRare = maintenant;
    surEntree?.(espece, dernier);   // qui, et lequel (le son part de sa position)
    console.info(`→ ${espece.nom} (${espece.rarete}${nb > 1 ? `, ×${nb}` : ''}) — ${horloge.phase}`);
    return dernier;
  }

  function retirer(indice) {
    const animal = animaux[indice];
    scene.remove(animal.objet);
    animal.detruire();   // chacun libère ce qu'il possède en propre (Animal : squelette ; Banc : géométrie)
    animaux.splice(indice, 1);
  }

  // Peuplement initial : quand on entre, le bassin n'est jamais vide.
  // Dev : ?forcer=meduse fait entrer cette espèce d'emblée, quelle que soit l'heure.
  const forcee = ESPECES.find((e) => e.id === new URLSearchParams(location.search).get('forcer'));
  for (let i = 0; i < (parade ? 3 : 2); i++) {
    const espece = forcee ?? tirer();
    // forcée : en pleine vitre (0,4 et 0,6), pour qu'une capture la voie à coup sûr
    if (espece) faireEntrer(espece, forcee ? 0.4 + 0.2 * i : THREE.MathUtils.randFloat(0.2, 0.6));
  }

  return {
    animaux,
    faireEntrer,
    /** Un objet animé venu d'ailleurs (un événement) : le spawner le fait vivre et le retire à la fin.
        Contrat : { objet, maj(dt), fini, detruire() } — comme Animal et Banc. */
    ajouter(objetAnime) { scene.add(objetAnime.objet); animaux.push(objetAnime); },
    maj(dt) {
      maintenant += dt;
      compteur -= dt;
      if (compteur <= 0) {
        compteur = parade ? THREE.MathUtils.randFloat(3, 6) : THREE.MathUtils.randFloat(4, 9);
        if (animaux.length < (parade ? MAX_ANIMAUX + 4 : MAX_ANIMAUX)) {
          const espece = tirer();
          if (espece) faireEntrer(espece);
        }
      }
      // On parcourt à l'envers : retirer un élément ne décale pas ceux qui restent à voir
      for (let i = animaux.length - 1; i >= 0; i--) {
        animaux[i].maj(dt);
        if (animaux[i].fini) retirer(i);
      }
    },
  };
}
