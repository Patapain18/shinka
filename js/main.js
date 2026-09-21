/* ============================================
   MAIN — point d'entrée et boucle
   ============================================
   Rôle : brancher les modules entre eux et faire tourner la boucle.
   Étape 1 : écran d'entrée, parallaxe souris, rendu du bassin vide.
   Étape 2 : l'eau (water.js) mise à jour à chaque frame.
   Étape 3 : chargement des modèles, puis le spawner fait passer les animaux.
   Étape 4 : l'horloge (heure réelle) règle la lumière et renseigne le spawner.
   Étape 5 : observation (curseur-jauge), collection, toasts, halo.
   Étape 6 : le carnet (panneau, grille, fiches).
   Étape 7 : l'audio (ambiance générée, sons, musique CC0).
   Étape 9 : les événements rares (banc de sardines, géant, eau trouble).
   Étape 10 : post-processing (rendu.js), qualité adaptative (qualite.js), tactile.
   Robustesse : contexte WebGL perdu (bandeau), libération GPU des animaux retirés
   (animal.js, banc.js), qualité au choix du visiteur (bouton du HUD).
   ============================================ */

import * as THREE from 'three';
import { creerRenderer, creerEnvironnement, scene, camera, pointRegarde, redimensionner, BASSIN, lumieres } from './scene.js';
import { creerEau } from './water.js';
import { ESPECES } from './species.js';
import { chargerModeles } from './modeles.js';
import { creerSpawner } from './spawner.js';
import { creerHorloge } from './daytime.js';
import { creerUI } from './ui.js';
import { creerObservation } from './observe.js';
import { nombreObservees } from './collection.js';
import { creerCarnet } from './carnet.js';
import { creerAudio } from './audio.js';
import { creerEvenements } from './evenements.js';
import { creerRendu } from './rendu.js';
import { creerQualite } from './qualite.js';
import { reglages, sauverReglages } from './collection.js';

/* ---------- Le renderer, avec filet de sécurité ---------- */
// Si WebGL est indisponible, on le dit au visiteur au lieu de lui laisser un écran noir.
const entree    = document.getElementById('entree');
const btnEntrer = document.getElementById('btn-entrer');

const canvas    = document.getElementById('scene');

let renderer;
try {
  renderer = creerRenderer(canvas);
} catch (err) {
  console.error(err);
  btnEntrer.replaceWith(Object.assign(document.createElement('p'), {
    className: 'entree-erreur',
    textContent: 'Ton navigateur ne peut pas afficher la 3D (WebGL indisponible). Essaie avec Chrome, Firefox ou Safari, GPU activé.',
  }));
  throw err;   // on arrête tout ici : rien d'autre n'a de sens sans renderer
}

/* ---------- Perte du contexte WebGL ---------- */
// Mise en veille, pilote graphique qui redémarre, trop d'onglets 3D ouverts : le navigateur
// peut retirer le contexte WebGL sans prévenir. Three cesse alors de dessiner (image figée
// ou noire) et demande au navigateur de le restaurer — ce qui arrive parfois, pas toujours.
// Entre les deux, le visiteur doit savoir ce qui se passe, et pouvoir recharger.
const bandeauContexte = document.getElementById('contexte-perdu');
canvas.addEventListener('webglcontextlost', () => { bandeauContexte.hidden = false; });
canvas.addEventListener('webglcontextrestored', () => { bandeauContexte.hidden = true; });   // Three a tout recréé : la boucle repart seule
document.getElementById('contexte-recharger').addEventListener('click', () => location.reload());

/* ---------- L'environnement (reflets) puis l'eau : sol, rayons, particules ---------- */
scene.environment = creerEnvironnement(renderer);
scene.environmentIntensity = 0.5;            // l'horloge le module ensuite (daytime.js)
const eau = creerEau(scene, camera);

/* ---------- Post-processing (bloom, vitre) ---------- */
const rendu = creerRendu(renderer, scene, camera);
function redimensionnerTout() {
  redimensionner(renderer);
  rendu.redimensionner();
}

/* ---------- L'heure réelle → la lumière ---------- */
const horloge = creerHorloge({ scene, lumieres, eau, renderer });
const hudHeure = document.getElementById('hud-heure');
const params = new URLSearchParams(location.search);
function majHud() {
  const h = Math.floor(horloge.heure);
  const m = Math.floor((horloge.heure - h) * 60);
  hudHeure.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${params.has('parade') ? 'parade' : horloge.phase}`;
}
majHud();
setInterval(majHud, 1000);

/* ---------- Chargement des modèles, puis écran d'entrée ---------- */
// Raccourci de développement : http://localhost:8792/?direct saute l'écran d'entrée.
// Pratique quand on retouche la scène 50 fois de suite (et pour les captures automatiques).
const direct = params.has('direct');
const barre = document.getElementById('barre-chargement');

/* ---------- Audio (démarre au premier geste : règle des navigateurs) ---------- */
const audio = creerAudio();

/* ---------- UI (curseur, toasts, compteur) et observation ---------- */
const ui = creerUI();
ui.majCompteur(nombreObservees(), ESPECES.length);

/* ---------- Qualité : haute / basse — l'URL, le visiteur (bouton du HUD), sinon l'auto ---------- */
const qualite = creerQualite({
  rendu, renderer, eau, redimensionner: redimensionnerTout,
  reglages: reglages(), sauverReglages,
  bouton: document.getElementById('hud-qualite'),
  // L'auto vient de descendre : on le dit (si on est entré : avant, l'écran d'entrée cache tout)
  surBascule: () => {
    if (document.body.classList.contains('entre')) {
      ui.toast({ titre: 'Qualité réduite pour rester fluide', nom: 'le bouton « qualité » du HUD permet de revenir', discret: true, duree: 6000 });
    }
  },
});

const observation = creerObservation({
  camera,
  ui,
  animauxVisibles: () => (spawner ? spawner.animaux : []),
  surObservation({ animal, premiere, compte }) {
    const { nom, rarete } = animal.espece;
    if (premiere) {
      ui.toast({ titre: 'Nouvelle espèce observée', nom, rarete });
      ui.majCompteur(nombreObservees(), ESPECES.length);
    } else {
      ui.toast({ titre: `vu ${compte} fois`, nom, rarete, discret: true });
    }
    carnet.rafraichir();
    if (premiere) audio.carillon(); else audio.tic();
  },
});

/* ---------- Les événements rares (banc, géant, trouble) ---------- */
const evenements = creerEvenements({ camera, horloge, eau, audio, spawner: () => spawner });

/* ---------- Le carnet (touche C) ---------- */
// Quand il est ouvert, on arrête d'observer : la souris est sur le panneau, pas sur le bassin.
const carnet = creerCarnet({
  surOuverture: () => observation.actif(false),
  surFermeture: () => observation.actif(true),
});

let spawner = null;   // n'existe qu'une fois les modèles chargés

chargerModeles(ESPECES, (progression) => { barre.style.width = `${Math.round(progression * 100)}%`; })
  .then(() => {
    spawner = creerSpawner(scene, camera, horloge, {
      surEntree: (espece) => { if (espece.rarete === 'rare' || espece.rarete === 'legendaire') audio.grondement(); },
    });
    if (direct) {
      entree.remove();
      document.body.classList.add('entre');
      // pas de clic « Entrer » : l'audio démarrera au premier geste, quel qu'il soit
      window.addEventListener('pointerdown', () => audio.demarrer(), { once: true });
      window.addEventListener('keydown', () => audio.demarrer(), { once: true });
      return;
    }
    btnEntrer.disabled = false;
    btnEntrer.textContent = 'Entrer';
  })
  .catch((erreur) => {
    console.error(erreur);
    btnEntrer.textContent = 'Les modèles n’ont pas pu être chargés';
  });

btnEntrer.addEventListener('click', () => {
  entree.classList.add('cache');   // le CSS fait le fondu de 2,5 s
  document.body.classList.add('entre');   // curseur système masqué : le nôtre prend le relais
  audio.demarrer();                       // LE geste qui autorise le son
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

/* ---------- Mode démo : ?demo=observer ---------- */
// Toutes les 2,5 s, on valide l'animal le plus proche de la vitre, sans souris.
// Sert aux captures automatiques (vérifier toast, halo, compteur). Dans la boucle
// plutôt qu'en setInterval : les timers peuvent être bridés, pas la boucle de rendu.
const enDemo = params.get('demo') === 'observer';
let prochaineDemo = 1;
let validationsDemo = 0;
const debug = enDemo ? Object.assign(document.createElement('pre'), { id: 'debug' }) : null;
if (debug) document.body.appendChild(debug);
function demo(temps) {
  if (!enDemo) return;
  const animaux = spawner ? spawner.animaux : [];
  const candidats = animaux.filter((a) => !a.observe);
  debug.textContent = `démo · t=${temps.toFixed(1)} · spawner=${!!spawner} · animaux=${animaux.length} · candidats=${candidats.length} · validations=${validationsDemo} · prochaine=${prochaineDemo.toFixed(1)}`;
  if (!spawner || temps < prochaineDemo || !candidats.length) return;
  prochaineDemo = temps + 2.5;
  candidats.sort((a, b) => b.objet.position.z - a.objet.position.z);
  try {
    observation.valider(candidats[0]);
    validationsDemo++;
  } catch (erreur) {
    debug.textContent += `\nERREUR valider : ${erreur.message}\n${erreur.stack}`;
  }
}

/* ---------- Poignée pour les outils de test (outils/*.mjs) ---------- */
window.__shinka = { renderer, scene, camera, especes: ESPECES, get spawner() { return spawner; }, observation, horloge, carnet, audio, evenements, qualite, rendu };

/* ---------- Boucle ---------- */
const chrono = new THREE.Clock();   // le chronomètre de la boucle (l'horloge du jour, c'est `horloge`)

function boucle() {
  // dt = secondes écoulées depuis la frame précédente (~0.016 à 60 fps).
  // On borne à 0.1 s : si l'onglet est resté 30 s en arrière-plan, on ne veut
  // pas qu'au retour tout « saute » de 30 s d'un coup.
  const dt = Math.min(chrono.getDelta(), 0.1);

  const temps = chrono.elapsedTime;   // secondes depuis le lancement (pour les shaders)

  majParallaxe(dt);
  horloge.maj(dt);
  eau.maj(dt, temps);
  spawner?.maj(dt);               // « ?. » : ne fait rien tant que spawner vaut null
  evenements.maj(dt);
  observation.maj(dt);
  demo(temps);
  qualite.maj(dt);
  rendu.rendre(dt, temps, souris);

  requestAnimationFrame(boucle);   // « rappelle-moi à la prochaine image »
}

window.addEventListener('resize', redimensionnerTout);
boucle();
