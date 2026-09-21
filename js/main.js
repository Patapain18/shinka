/* ============================================
   MAIN — point d'entrée et boucle
   ============================================
   Rôle : brancher les modules entre eux et faire tourner la boucle.
   Étape 1 : écran d'entrée, parallaxe souris, rendu du bassin vide.
   Étape 2 : l'eau (water.js) mise à jour à chaque frame.
   ============================================ */

import * as THREE from 'three';
import { creerRenderer, scene, camera, pointRegarde, redimensionner, BASSIN } from './scene.js';
import { creerEau } from './water.js';

/* ---------- Le renderer, avec filet de sécurité ---------- */
// Si WebGL est indisponible, on le dit au visiteur au lieu de lui laisser un écran noir.
const entree    = document.getElementById('entree');
const btnEntrer = document.getElementById('btn-entrer');

let renderer;
try {
  renderer = creerRenderer(document.getElementById('scene'));
} catch (err) {
  console.error(err);
  btnEntrer.replaceWith(Object.assign(document.createElement('p'), {
    className: 'entree-erreur',
    textContent: 'Ton navigateur ne peut pas afficher la 3D (WebGL indisponible). Essaie avec Chrome, Firefox ou Safari, GPU activé.',
  }));
  throw err;   // on arrête tout ici : rien d'autre n'a de sens sans renderer
}

/* ---------- L'eau : sol, rayons, particules ---------- */
const eau = creerEau(scene, camera);

/* ---------- Écran d'entrée ---------- */
// Raccourci de développement : http://localhost:8792/?direct saute l'écran d'entrée.
// Pratique quand on retouche la scène 50 fois de suite (et pour les captures automatiques).
if (new URLSearchParams(location.search).has('direct')) entree.remove();

btnEntrer.addEventListener('click', () => {
  entree.classList.add('cache');   // le CSS fait le fondu de 2,5 s
  // (étape 7 : c'est ICI qu'on démarrera l'audio — le clic vient d'avoir lieu)
}, { once: true });                // l'écouteur se retire tout seul après le 1er clic

/* ---------- Parallaxe : la souris incline légèrement la tête ---------- */
// Position souris normalisée : -1 (gauche / bas) → +1 (droite / haut). 0 = centre.
const souris = new THREE.Vector2(0, 0);

window.addEventListener('pointermove', (e) => {
  souris.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  souris.y = -(e.clientY / window.innerHeight) * 2 + 1;   // à l'écran y descend, en 3D y monte
});

const AMPLITUDE_X = 0.15;   // 15 cm de déplacement latéral max
const AMPLITUDE_Y = 0.08;   //  8 cm en hauteur
const SOUPLESSE   = 3;      // plus grand = la caméra rattrape la souris plus vite

function majParallaxe(dt) {
  // Cible : là où la caméra DEVRAIT être d'après la souris
  const cibleX = souris.x * AMPLITUDE_X;
  const cibleY = BASSIN.hauteurYeux + souris.y * AMPLITUDE_Y;

  // damp() rapproche la valeur actuelle de la cible d'une fraction qui dépend du
  // temps écoulé (dt). Résultat : mouvement doux, ET identique à 30 ou 144 fps.
  camera.position.x = THREE.MathUtils.damp(camera.position.x, cibleX, SOUPLESSE, dt);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, cibleY, SOUPLESSE, dt);

  // La caméra a bougé, mais elle fixe toujours le même point : c'est ça qui crée
  // la parallaxe (les rochers proches glissent plus que les lointains).
  camera.lookAt(pointRegarde);
}

/* ---------- Boucle ---------- */
const horloge = new THREE.Clock();

function boucle() {
  // dt = secondes écoulées depuis la frame précédente (~0.016 à 60 fps).
  // On borne à 0.1 s : si l'onglet est resté 30 s en arrière-plan, on ne veut
  // pas qu'au retour tout « saute » de 30 s d'un coup.
  const dt = Math.min(horloge.getDelta(), 0.1);

  const temps = horloge.elapsedTime;   // secondes depuis le lancement (pour les shaders)

  majParallaxe(dt);
  eau.maj(dt, temps);
  renderer.render(scene, camera);

  requestAnimationFrame(boucle);   // « rappelle-moi à la prochaine image »
}

window.addEventListener('resize', () => redimensionner(renderer));
boucle();
