/* ============================================
   GRAPHE — la table de mixage du bassin
   ============================================
   Le « graphe » Web Audio : des nœuds reliés comme une chaîne d'effets. Un seul
   endroit décide qui passe par quoi, et à quel niveau :

      ambiance (lit) ─────────────────────────┐
      faune (spatialisée par animal) ─────────┤
      chants (spatialisés, portent loin) ─────┼─→ limiteur ─→ master ─→ haut-parleurs
      sons d'interface (+ écho court) ────────┤
      musique ─→ passe-bas « sous l'eau » ────┘   (la musique baisse pendant un chant)
                       ↑ envois → réverbération du bassin (un seul convolveur) → retour ┘

   Le module est PUR (pas de DOM, pas de fichier, pas de setTimeout) : audio.js
   l'utilise avec le vrai AudioContext, outils/studio.html avec un
   OfflineAudioContext pour rendre les mêmes sons en .wav et les mesurer.
   ============================================ */

import { alea, dB, reponseImpulsionnelle, tamponBruit, sourceBruit, filtre, gain, enveloppe } from './dsp.js';
import { creerAmbiance } from './ambiance.js';
import { creerFaune } from './faune.js';
import { CHANTS } from './chants.js';

// Les niveaux des bus, en dB. La hiérarchie voulue (mesurée au studio) : le lit d'ambiance
// autour de −31 LUFS, la musique 4 dB DESSOUS, les animaux proches et les chants au-dessus.
// Le visiteur règle le master (curseur du player, 0,6 par défaut).
export const NIVEAUX = { musique: -14, ambiance: 0, faune: -3, sons: -6, retourReverb: -9 };
/** Sonie cible d'un morceau, en LUFS : chaque morceau y est ramené (playlist.js : `sonie`). */
export const SONIE_CIBLE = -23;

export function creerGraphe(ctx, { debut = 0, graine = 7, spatial = 'hrtf' } = {}) {
  const tirage = alea(graine + 100);

  /* ---------- Master et limiteur ---------- */
  // Un compresseur rapide et ferme : il rattrape les sommes trop fortes (un chant + trois
  // requins + la musique) avant qu'elles ne saturent. Au repos, il ne fait rien.
  const master = gain(ctx, 1);
  const limiteur = ctx.createDynamicsCompressor();
  limiteur.threshold.value = -12;
  limiteur.knee.value = 8;
  limiteur.ratio.value = 6;
  limiteur.attack.value = 0.004;
  limiteur.release.value = 0.25;
  limiteur.connect(master).connect(ctx.destination);

  /* ---------- La réverbération du bassin ---------- */
  // Un seul convolveur partagé : chaque source y envoie une part (« envoi »), le retour
  // revient dans le mix. C'est l'espace commun qui fait que tout sonne dans le MÊME lieu.
  const reverb = ctx.createConvolver();
  reverb.buffer = reponseImpulsionnelle(ctx, { duree: 2.8, graine: graine + 20 });
  const retour = gain(ctx, dB(NIVEAUX.retourReverb));
  reverb.connect(retour).connect(limiteur);

  /* ---------- Les bus ---------- */
  const busAmbiance = gain(ctx, dB(NIVEAUX.ambiance));
  busAmbiance.connect(limiteur);
  const busFaune = gain(ctx, dB(NIVEAUX.faune));
  busFaune.connect(limiteur);
  const busSons = gain(ctx, dB(NIVEAUX.sons));
  busSons.connect(limiteur);
  // La musique passe par un filtre doux : les aigus atténués, comme à travers l'eau
  const busMusique = gain(ctx, dB(NIVEAUX.musique));
  const eau = filtre(ctx, 'lowpass', 5200, 0.5);
  busMusique.connect(eau).connect(limiteur);
  // L'écho court en boucle de rétroaction des sons d'interface : de l'espace pour le carillon
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.27;
  const retourEcho = gain(ctx, 0.32);
  echo.connect(filtre(ctx, 'lowpass', 2200, 1)).connect(retourEcho).connect(echo);
  busSons.connect(echo);
  echo.connect(gain(ctx, 0.35)).connect(limiteur);

  /* ---------- Les couches ---------- */
  const ambiance = creerAmbiance(ctx, { sortie: busAmbiance, reverb, graine, debut });
  const faune = creerFaune(ctx, { sortie: busFaune, reverb, spatial, graine: graine + 4 });
  const tamponBrun = tamponBruit(ctx, { duree: 4, couleur: 'brun', graine: graine + 9 });

  /* ---------- Les sons d'interface ---------- */
  function note(freq, quand, duree, niveau, type = 'sine') {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = gain(ctx);
    enveloppe(g.gain, quand, { attaque: 0.015, chute: duree, niveau });
    o.connect(g).connect(busSons);
    o.start(quand); o.stop(quand + duree + 0.05);
  }
  /** Nouvelle espèce : un arpège mi – sol♯ – si – mi, comme des gouttes. */
  function carillon(t) {
    [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => {
      note(f, t + i * 0.13, 1.8, 0.16);
      note(f * 2, t + i * 0.13, 0.9, 0.03, 'triangle');
    });
  }
  /** Déjà vue : une seule note, discrète. */
  function tic(t) { note(987.77, t, 0.4, 0.07); }
  /** Un souffle : le bruit de fond filtré qui gonfle puis retombe (un banc qui passe). */
  function souffle(duree, t) {
    const s = sourceBruit(ctx, tamponBrun);
    const f = filtre(ctx, 'bandpass', 700, 0.5);
    const g = gain(ctx);
    enveloppe(g.gain, t, { attaque: duree * 0.4, chute: duree * 0.6, niveau: 0.12 });
    s.connect(f).connect(g).connect(busSons);
    s.start(t); s.stop(t + duree + 0.1);
  }
  /** Un rare entre en scène : un grondement grave qui descend (intensite : 1 = plein). */
  function grondement(intensite, t) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(52, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 2.6);
    const g = gain(ctx);
    enveloppe(g.gain, t, { attaque: 0.9, chute: 2.5, niveau: 0.3 * intensite });
    o.connect(g).connect(busSons);
    o.start(t); o.stop(t + 3.5);
    const s = sourceBruit(ctx, tamponBrun);
    const f = filtre(ctx, 'lowpass', 90, 1);
    const gs = gain(ctx);
    enveloppe(gs.gain, t, { attaque: 1.0, chute: 2.2, niveau: 0.22 * intensite });
    s.connect(f).connect(gs).connect(busSons);
    s.start(t); s.stop(t + 3.4);
  }

  /* ---------- Les chants ---------- */
  let chantJusqua = 0;
  /** Pendant un chant, la musique s'efface (−8 dB) puis remonte vers la fin. */
  function baisserMusique(t, duree) {
    const g = busMusique.gain, plein = dB(NIVEAUX.musique);
    g.cancelScheduledValues(t);
    g.setTargetAtTime(plein * 0.4, t, 0.8);
    g.setTargetAtTime(plein, t + duree - 1.5, 1.5);
    chantJusqua = Math.max(chantJusqua, t + duree);
  }
  /** Le chant d'un légendaire, à la position de l'animal (ou au centre s'il n'y en a pas). */
  function chant(id, animal, t) {
    const fabrique = CHANTS[id];
    if (!fabrique) return 0;
    const sortie = animal ? faune.voixPour(animal, t, 20) : busSons;
    const duree = fabrique(ctx, sortie, t, { graine: Math.floor(tirage() * 1e9) });
    if (animal) faune.reserver(animal, t + duree);
    baisserMusique(t, duree);
    return duree;
  }
  /** Une espèce entre en scène : les légendaires chantent, les rares grondent. */
  function arrivee(espece, animal, t) {
    if (espece.rarete === 'legendaire' && CHANTS[espece.id]) return chant(espece.id, animal, t);
    if (espece.rarete === 'rare' || espece.rarete === 'legendaire') grondement(1, t);
    return 0;
  }

  return {
    master, limiteur, busAmbiance, busMusique, busSons, reverb, ambiance, faune,
    carillon, tic, souffle, grondement, chant, arrivee, baisserMusique,
    /** Chaque frame : planifie les événements d'ambiance, suit les animaux. */
    maj(t, dt, animaux, camera) {
      ambiance.planifier(t, 0.6);
      if (camera) faune.maj(t, dt, animaux, camera);
    },
    regler(options) { faune.regler(options); },
    chantEnCours: (t) => t < chantJusqua,
  };
}
