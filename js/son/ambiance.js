/* ============================================
   AMBIANCE — ce qu'entend un hydrophone dans le bassin
   ============================================
   Un vrai enregistrement sous-marin, ce n'est pas « un grondement + des bulles ».
   C'est un lit de plusieurs couches, toutes très douces :
   1) la HOULE : le grave qui gonfle et retombe par vagues lentes et irrégulières ;
   2) le FLUX : l'eau qui circule (le brassage du bassin), un souffle médium ;
   3) le CRÉPITEMENT des crevettes-pistolets, qui va et vient par colonies ;
   4) les BULLES : des chapelets du diffuseur, et parfois une grosse bulle isolée ;
   5) le LOINTAIN : de rares chocs sourds, très loin, presque imaginés.
   Deux régimes : le lit (1-3) est un graphe qui tourne tout seul ; les événements
   (4-5) sont PLANIFIÉS par planifier(maintenant, horizon), appelée à chaque frame
   avec l'heure du contexte — et par le studio hors ligne avec un temps simulé.
   Jamais de setTimeout : le son ne dépend pas de l'horloge du navigateur.
   ============================================ */

import { alea, entre, dB, tamponBruit, tamponCrepitement, sourceBruit, filtre, gain, lfo, bulle, enveloppe } from './dsp.js';

// Le niveau de chaque couche, en dB sous la pleine échelle (avant le master). Réglés au
// studio (node outils/rendre-son.mjs ambiance) : le lit entier vise −31 LUFS.
export const NIVEAUX = { houle: -22, sub: -34, flux: -38, crepitement: -37, bulles: -30, lointain: -30 };

// Les fenêtres d'attente entre deux événements, en secondes [min, max]
const FENETRES = { chapelet: [5, 16], gloup: [18, 45], lointain: [25, 70] };

export function creerAmbiance(ctx, { sortie, reverb, graine = 7, debut = 0 }) {
  const tirage = alea(graine);
  const bus = gain(ctx, 1);
  bus.connect(sortie);
  const versReverb = gain(ctx, 0.45);     // les bulles et les chocs résonnent dans le bassin
  versReverb.connect(reverb);

  /* ---------- 1) La houle ---------- */
  // Du bruit brun filtré très grave, dont le niveau et la coupure gonflent et retombent.
  // Deux LFO de périodes différentes (32 s et 21 s) : leur somme ne se répète presque
  // jamais — une houle irrégulière, pas un métronome.
  const tamponBrun = tamponBruit(ctx, { duree: 7, couleur: 'brun', graine: graine + 1, canaux: 2 });
  const brun = sourceBruit(ctx, tamponBrun);
  const houleF = filtre(ctx, 'lowpass', 105, 0.7);
  const houleG = gain(ctx, dB(NIVEAUX.houle));
  brun.connect(houleF).connect(houleG).connect(bus);
  lfo(ctx, houleG.gain, 1 / 32, dB(NIVEAUX.houle) * 0.55, debut);
  lfo(ctx, houleG.gain, 1 / 21, dB(NIVEAUX.houle) * 0.30, debut);
  lfo(ctx, houleF.frequency, 1 / 32, 45, debut);
  brun.start(debut);
  // Le sub : 38 Hz, plus senti qu'entendu, avec un lent trémolo
  const sub = ctx.createOscillator();
  sub.frequency.value = 38;
  const subG = gain(ctx, dB(NIVEAUX.sub));
  lfo(ctx, subG.gain, 0.07, dB(NIVEAUX.sub) * 0.6, debut);
  sub.connect(subG).connect(bus);
  sub.start(debut);

  /* ---------- 2) Le flux ---------- */
  // Du bruit rose dans une bande médium large ; le centre de la bande se promène (le souffle
  // « bouge ») et le niveau respire avec la houle.
  const rose = sourceBruit(ctx, tamponBruit(ctx, { duree: 9, couleur: 'rose', graine: graine + 2, canaux: 2 }));
  const fluxF = filtre(ctx, 'bandpass', 520, 0.45);
  const fluxG = gain(ctx, dB(NIVEAUX.flux));
  rose.connect(fluxF).connect(fluxG).connect(bus);
  lfo(ctx, fluxG.gain, 1 / 27, dB(NIVEAUX.flux) * 0.6, debut);
  lfo(ctx, fluxF.frequency, 0.19, 140, debut);
  rose.start(debut);

  /* ---------- 3) Le crépitement ---------- */
  // Les colonies de crevettes s'animent et se taisent (période 1 min 30).
  const crep = sourceBruit(ctx, tamponCrepitement(ctx, { duree: 9, densite: 28, graine: graine + 3 }));
  const crepF = filtre(ctx, 'highpass', 2200, 0.7);
  const crepG = gain(ctx, dB(NIVEAUX.crepitement));
  crep.connect(crepF).connect(crepG).connect(bus);
  lfo(ctx, crepG.gain, 1 / 90, dB(NIVEAUX.crepitement) * 0.5, debut);
  crep.start(debut);

  /* ---------- 4) Les bulles ---------- */
  /** Un chapelet du diffuseur : 2 à 6 bulles serrées, de plus en plus petites (donc de plus en
      plus aiguës), quelque part à gauche ou à droite, proche (claire) ou lointaine (sourde). */
  function chapelet(t) {
    const n = 2 + Math.floor(tirage() * 5);
    const loin = entre(tirage, 0.35, 1);
    const pan = ctx.createStereoPanner();
    pan.pan.value = entre(tirage, -0.7, 0.7);
    const f = filtre(ctx, 'lowpass', 1200 + 4000 * loin, 0.7);
    pan.connect(f).connect(bus);
    f.connect(versReverb);
    let rayon = entre(tirage, 0.004, 0.007);
    let quand = t;
    for (let i = 0; i < n; i++) {
      bulle(ctx, pan, quand, { rayon, niveau: dB(NIVEAUX.bulles) * loin, montee: 1.3 });
      quand += entre(tirage, 0.08, 0.16);
      rayon *= entre(tirage, 0.8, 0.95);
    }
  }
  /** Une grosse bulle isolée qui se décroche : un « gloup » grave. */
  function gloup(t) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = entre(tirage, -0.5, 0.5);
    pan.connect(bus);
    pan.connect(versReverb);
    bulle(ctx, pan, t, { rayon: entre(tirage, 0.008, 0.013), niveau: dB(NIVEAUX.bulles + 3), montee: 1.12 });
  }

  /* ---------- 5) Le lointain ---------- */
  /** Un choc sourd, très loin : une sinusoïde grave amortie qui descend + une bouffée de bruit
      grave. On ne sait pas ce que c'est — c'est ça qui fait la profondeur. */
  function lointain(t) {
    const f0 = entre(tirage, 55, 85);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 1.4);
    const g = gain(ctx);
    enveloppe(g.gain, t, { attaque: 0.04, chute: 1.6, niveau: dB(NIVEAUX.lointain) });
    o.connect(g).connect(bus);
    g.connect(versReverb);
    o.start(t); o.stop(t + 1.8);
    const s = sourceBruit(ctx, tamponBrun);
    const fb = filtre(ctx, 'lowpass', 220, 0.8);
    const gb = gain(ctx);
    enveloppe(gb.gain, t, { attaque: 0.02, chute: 0.9, niveau: dB(NIVEAUX.lointain - 2) });
    s.connect(fb).connect(gb).connect(bus);
    s.start(t, entre(tirage, 0, 5)); s.stop(t + 1);
  }

  /* ---------- La planification ---------- */
  const declencheurs = { chapelet, gloup, lointain };
  const prochains = {
    chapelet: debut + entre(tirage, 2, 6),
    gloup: debut + entre(tirage, 12, 30),
    lointain: debut + entre(tirage, 20, 50),
  };
  /** Programme tous les événements qui tombent dans [maintenant, maintenant + horizon[. */
  function planifier(maintenant, horizon = 0.6) {
    for (const nom of Object.keys(prochains)) {
      const [a, b] = FENETRES[nom];
      // L'onglet est resté en arrière-plan (la boucle s'est arrêtée) : on ne rattrape pas
      // d'un coup tous les événements manqués, on repart de maintenant.
      if (prochains[nom] < maintenant - 0.5) prochains[nom] = maintenant + entre(tirage, 0.5, b - a);
      while (prochains[nom] < maintenant + horizon) {
        declencheurs[nom](Math.max(prochains[nom], maintenant));
        prochains[nom] += entre(tirage, a, b);
      }
    }
  }

  return {
    planifier,
    /** Le niveau global du lit (1 = nominal), en douceur. */
    regler(niveau, t) { bus.gain.setTargetAtTime(niveau, t, 1.5); },
  };
}
