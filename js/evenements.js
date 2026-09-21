/* ============================================
   EVENEMENTS — les surprises du bassin
   ============================================
   Toutes les 12 à 25 minutes, l'une de ces trois choses (DESIGN.md §5) :
   - le banc     : 300 sardines en tourbillon devant la vitre, puis elles s'en vont
   - le géant    : une baleine à bosse passe très loin, très lentement, et chante
   - le trouble  : 30 s d'eau chargée — brume, particules, lumière qui vacille
   Dev : ?evenement=banc|geant|trouble le déclenche 2 s après l'entrée.
   ============================================ */

import * as THREE from 'three';
import { ESPECES } from './species.js';
import { Banc } from './banc.js';

const INTERVALLE = new URLSearchParams(location.search).has('parade')
  ? [45, 90]                             // parade (tests) : un événement toutes les 45 à 90 s
  : [12 * 60, 25 * 60];                  // secondes entre deux événements

export function creerEvenements({ camera, horloge, eau, audio, spawner }) {
  const force = new URLSearchParams(location.search).get('evenement');
  const sardine = ESPECES.find((e) => e.id === 'sardine');
  const baleine = ESPECES.find((e) => e.id === 'baleine');
  let temps = 0;
  let prochain = force ? 2 : THREE.MathUtils.randFloat(...INTERVALLE);
  let actif = null;

  /* Une boucle fermée devant la vitre : le tourbillon tourne autour d'elle */
  function boucleDevantLaVitre() {
    const points = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      points.push(new THREE.Vector3(4.5 * Math.cos(a), 1.4 + 0.8 * Math.sin(2 * a), -6.5 + 2.0 * Math.sin(a)));
    }
    return new THREE.CatmullRomCurve3(points, true, 'centripetal');   // true = fermée
  }

  /* Depuis un point, une sortie vers le bord le plus proche, hors champ */
  function sortie(depuis) {
    const sens = depuis.x >= 0 ? 1 : -1;
    const demiLargeur = 10 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    return new THREE.CatmullRomCurve3([
      depuis.clone(),
      new THREE.Vector3(depuis.x + sens * 6, depuis.y + 0.5, depuis.z - 2),
      new THREE.Vector3(sens * (demiLargeur + 10), depuis.y + 1, -10),
    ], false, 'centripetal');
  }

  const EVENEMENTS = {
    banc: {
      duree: 50,
      demarrer(e) {
        e.banc = new Banc(sardine, boucleDevantLaVitre(), { nombre: 300, uDepart: Math.random(), vitesse: 0.5, horloge, tourbillon: true });
        spawner().ajouter(e.banc);
        audio.souffle(6);
      },
      maj(e) {
        if (e.t > 36 && !e.parti) {                          // après 36 s, le banc s'en va
          e.parti = true;
          e.banc.changerTrajectoire(sortie(e.banc.objet.position));
          e.banc.vitesse = 1.6;
        }
      },
      finir() {},
    },
    geant: {
      duree: 130,
      demarrer(e) {
        e.animal = spawner().faireEntrer(baleine, 0.25);     // déjà presque dans le champ ; elle chante en entrant (spawner → audio.arrivee)
      },
      maj(e) {
        if (e.t > 30 && !e.second) { e.second = true; audio.chant('baleine', e.animal); }
      },
      finir() {},
    },
    trouble: {
      duree: 30,
      demarrer() { audio.grondement(0.6); },
      maj(e) {
        const env = Math.sin(Math.PI * e.t / 30);            // 0 → 1 → 0 sur 30 s
        const vacillement = Math.sin(e.t * 23) * Math.sin(e.t * 7.3);
        horloge.modulation.brume = 1 + 0.8 * env;
        horloge.modulation.soleil = 1 - 0.35 * env + 0.12 * env * vacillement;
        horloge.modulation.rayons = 1 - 0.5 * env;
        eau.regler({ neige: 1 + 1.5 * env });
      },
      finir() {
        Object.assign(horloge.modulation, { brume: 1, soleil: 1, rayons: 1 });
        eau.regler({ neige: 1 });
      },
    },
  };

  function lancer(nom) {
    const def = EVENEMENTS[nom];
    if (!def) return;
    actif = { nom, def, t: 0 };
    def.demarrer(actif);
    console.info(`✦ événement : ${nom}`);
  }

  function tirage() {
    const noms = Object.keys(EVENEMENTS);
    return noms[Math.floor(Math.random() * noms.length)];
  }

  return {
    lancer,
    get actif() { return actif ? actif.nom : null; },
    maj(dt) {
      temps += dt;
      if (actif) {
        actif.t += dt;
        actif.def.maj(actif, dt);
        if (actif.t >= actif.def.duree) {
          actif.def.finir(actif);
          actif = null;
          prochain = force ? Infinity : temps + THREE.MathUtils.randFloat(...INTERVALLE);
        }
      } else if (temps >= prochain && spawner()) {
        lancer(force ?? tirage());
      }
    },
  };
}
