/* ============================================
   DAYTIME — l'heure réelle pilote la lumière
   ============================================
   Le bassin suit l'horloge du visiteur : à midi, récif lumineux ; à 3 h du
   matin, presque noir. Quatre PHASES servent au spawner (quelles espèces
   sortent) ; huit REPÈRES sur 24 h servent à la lumière, interpolés en
   continu — jamais de bascule brutale, juste le jour qui tourne.

   Debug (paramètres d'URL) :
     ?heure=22.5   fige l'heure (décimale)
     ?tempo=600    accélère : 1 s réelle = 10 min, une journée en 2 min 24
   ============================================ */

import * as THREE from 'three';
import { BASSIN } from './scene.js';

/* Les phases de DESIGN.md §5, en heures décimales */
export function phaseDe(heure) {
  if (heure >= 6 && heure < 8)   return 'aube';
  if (heure >= 8 && heure < 18)  return 'jour';
  if (heure >= 18 && heure < 21) return 'crepuscule';
  return 'nuit';
}

/* 0 en plein jour, 1 en pleine nuit, transitions douces : pour ce qui luit dans le noir */
export function facteurNuit(h) {
  if (h >= 8 && h < 18) return 0;
  if (h >= 22 || h < 5) return 1;
  if (h >= 18) return (h - 18) / 4;          // 18 h → 22 h : 0 → 1
  return 1 - (h - 5) / 3;                    //  5 h →  8 h : 1 → 0
}

/* Repères de lumière. brume = couleur du brouillard ET du fond ; soleil = couleur de
   la lumière directionnelle ; le reste = multiplicateurs des réglages « plein jour »
   définis dans scene.js et water.js (1 = inchangé). */
const NUIT = { brume: 0x020810, soleil: 0x5b83b0, intensiteSoleil: 0.38, ambiance: 0.34, rayons: 0.12, caustiques: 0.15, exposition: 0.9 };
const JOUR = { brume: 0x03111d, soleil: 0x9fd4ff, intensiteSoleil: 2.6,  ambiance: 0.9,  rayons: 1.0,  caustiques: 1.0,  exposition: 1.0 };
const REPERES = [
  { heure: 0,    ...NUIT },
  { heure: 5,    ...NUIT },
  { heure: 7,    brume: 0x0a1c2c, soleil: 0xc9d9e8, intensiteSoleil: 1.3, ambiance: 0.6, rayons: 0.5,  caustiques: 0.55, exposition: 0.95 },   // aube
  { heure: 9,    ...JOUR },
  { heure: 17,   ...JOUR },
  { heure: 19.5, brume: 0x08131c, soleil: 0xd9b48c, intensiteSoleil: 1.1, ambiance: 0.5, rayons: 0.45, caustiques: 0.4,  exposition: 0.92 },   // crépuscule
  { heure: 22,   ...NUIT },
  { heure: 24,   ...NUIT },
].map((r) => ({ ...r, brume: new THREE.Color(r.brume), soleil: new THREE.Color(r.soleil) }));

function heureReelle() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export function creerHorloge({ scene, lumieres, eau, renderer, surface = null }) {
  const params = new URLSearchParams(location.search);
  const heureForcee = params.has('heure') ? parseFloat(params.get('heure')) : null;
  const tempo = parseFloat(params.get('tempo') || '1');
  let heure = heureForcee ?? heureReelle();

  const brume = new THREE.Color();   // objets de travail : pas d'allocation à chaque frame
  // Multiplicateurs que les événements peuvent pousser (eau trouble) : 1 = normal
  const modulation = { brume: 1, soleil: 1, rayons: 1 };

  function appliquer() {
    // Trouver les deux repères qui encadrent l'heure, et où on en est entre les deux (t : 0 → 1)
    let i = 0;
    while (i < REPERES.length - 2 && heure >= REPERES[i + 1].heure) i++;
    const a = REPERES[i], b = REPERES[i + 1];
    const t = THREE.MathUtils.clamp((heure - a.heure) / (b.heure - a.heure), 0, 1);
    const entre = (cle) => THREE.MathUtils.lerp(a[cle], b[cle], t);

    brume.lerpColors(a.brume, b.brume, t);
    scene.fog.color.copy(brume);
    scene.fog.density = BASSIN.densiteBrume * modulation.brume;
    scene.background.copy(brume);                 // fond ET brouillard : même couleur, sinon on voit la couture
    lumieres.soleil.color.lerpColors(a.soleil, b.soleil, t);
    lumieres.soleil.intensity = entre('intensiteSoleil') * modulation.soleil;
    lumieres.soleil.shadow.intensity = 0.55 + 0.45 * (entre('intensiteSoleil') / JOUR.intensiteSoleil);   // ombres plus molles la nuit
    lumieres.ambiance.intensity = entre('ambiance');
    eau.regler({ rayons: entre('rayons') * modulation.rayons, caustiques: entre('caustiques') });
    renderer.toneMappingExposure = entre('exposition');
    scene.environmentIntensity = 0.5 * entre('ambiance') / JOUR.ambiance;   // les reflets suivent la lumière du jour
    surface?.()?.regler(entre('rayons') * modulation.rayons);                // la surface s'éteint avec les rayons
  }
  appliquer();

  return {
    modulation,
    get heure() { return heure; },
    get phase() { return phaseDe(heure); },
    maj(dt) {
      if (tempo !== 1) heure = (heure + (dt * tempo) / 3600) % 24;
      else if (heureForcee === null) heure = heureReelle();
      appliquer();
    },
  };
}
