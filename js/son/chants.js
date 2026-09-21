/* ============================================
   CHANTS — l'arrivée d'un légendaire
   ============================================
   Un son par espèce légendaire, joué à SA position dans le bassin :
   - la baleine à bosse CHANTE. Son chant est fait d'« unités » (gémissement,
     montée, cri, grognement, descente, « whup ») enchaînées en une phrase — comme
     les vrais, transcrits par les biologistes. Une unité : une fondamentale qui
     glisse, quatre harmoniques qui la suivent (une voix, pas un sifflet), un
     vibrato commun, un « grognement » (modulation à ~30 Hz, la voix qui râpe) sur
     les unités graves, deux formants, une légère saturation. Chaque phrase est
     tirée au sort dans des fourchettes : jamais deux fois la même ;
   - le requin-baleine est MUET, comme tous les requins. Son « chant », c'est le
     bassin qui retient son souffle : un bourdon très grave qui s'épanouit en
     harmoniques, un souffle d'eau qui gonfle, trois cristaux très haut. Une aura,
     pas une voix — pour qu'on ne le confonde jamais avec la baleine.
   Chaque fonction renvoie la DURÉE du son : le graphe baisse la musique d'autant.
   ============================================ */

import { alea, entre, dB, glisse, filtre, gain, lfo, enveloppe, tremolo, tamponBruit, sourceBruit } from './dsp.js';

export const NIVEAUX = { baleine: -17, requinBaleine: -19 };   // dB, à l'entrée de la voix spatialisée

/* ---------- La voix de la baleine ---------- */
// points : la fondamentale au début, au milieu et à la fin de l'unité (Hz) ; duree en s ;
// niveau relatif ; vibrato en cents ; partiels = amplitudes des harmoniques 1, 2, 3, 4… ;
// grognement = profondeur de la modulation râpeuse ; attaque / chute de l'enveloppe.
const UNITES = {
  gemissement: { points: [180, 250, 215], duree: 2.4, niveau: 1.0, vibrato: 10 },
  montee:      { points: [140, 320, 560], duree: 1.1, niveau: 0.9, vibrato: 6 },
  cri:         { points: [640, 900, 700], duree: 1.7, niveau: 0.5, vibrato: 22, partiels: [1, 0.35, 0.12] },
  grognement:  { points: [95, 112, 84],   duree: 2.2, niveau: 1.1, vibrato: 4, grognement: 0.6, partiels: [1, 0.7, 0.5, 0.35, 0.2] },
  descente:    { points: [420, 300, 170], duree: 1.6, niveau: 0.8, vibrato: 9 },
  whup:        { points: [110, 180, 330], duree: 0.45, niveau: 0.85, vibrato: 0, attaque: 0.06, chute: 0.15 },
};
// Trois phrases types ; la vraie baleine répète et varie les siennes pendant des heures
const PHRASES = [
  ['gemissement', 'montee', 'cri', 'grognement', 'gemissement', 'whup', 'whup'],
  ['grognement', 'gemissement', 'descente', 'montee', 'cri', 'whup'],
  ['montee', 'montee', 'gemissement', 'grognement', 'descente', 'whup', 'whup'],
];

function unite(ctx, sortie, t, u, tirage) {
  const { partiels = [1, 0.5, 0.28, 0.14], grognement = 0, vibrato = 8, attaque = 0.25, chute = 0.5 } = u;
  const facteur = entre(tirage, 0.9, 1.1);                 // la même transposition pour toute l'unité
  const duree = u.duree * entre(tirage, 0.85, 1.15);
  const n = 48;
  const courbe = new Float32Array(n);
  for (let i = 0; i < n; i++) courbe[i] = glisse(u.points, i / (n - 1)) * facteur;

  const somme = gain(ctx, 1);
  // Le vibrato : un seul LFO, en cents, vers le detune de TOUS les partiels — ils tremblent ensemble
  const vib = ctx.createOscillator();
  vib.frequency.value = entre(tirage, 4.2, 6.5);
  const vibG = gain(ctx, vibrato);
  vib.connect(vibG);
  vib.start(t); vib.stop(t + duree + 0.1);
  partiels.forEach((amp, k) => {
    const o = ctx.createOscillator();
    o.frequency.setValueCurveAtTime(courbe.map((f) => f * (k + 1)), t, duree);
    vibG.connect(o.detune);
    const g = gain(ctx, amp);
    o.connect(g).connect(somme);
    o.start(t); o.stop(t + duree + 0.05);
  });
  let noeud = somme;
  if (grognement) {
    const am = gain(ctx, 1 - grognement * 0.5);
    lfo(ctx, am.gain, entre(tirage, 26, 38), grognement * 0.5, t).stop(t + duree + 0.1);
    noeud.connect(am);
    noeud = am;
  }
  const env = gain(ctx);
  enveloppe(env.gain, t, { attaque, tenue: Math.max(0, duree - attaque - chute), chute, niveau: u.niveau });
  noeud.connect(env).connect(sortie);
  return t + duree;
}

/** Une courbe de saturation douce (tanh) : les harmoniques s'enrichissent sans écrêter. */
function courbeSaturation(n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
  return c;
}

export function chantBaleine(ctx, sortie, t0, { graine = 1 } = {}) {
  const tirage = alea(graine);
  const bus = gain(ctx, 0.35);
  const f1 = filtre(ctx, 'peaking', 380, 1.8, 6);      // deux formants : la « gorge » de la voix
  const f2 = filtre(ctx, 'peaking', 1100, 2.5, 4);
  const sat = ctx.createWaveShaper();
  sat.curve = courbeSaturation();
  sat.oversample = '2x';
  const niveau = gain(ctx, dB(NIVEAUX.baleine));
  bus.connect(f1).connect(f2).connect(sat).connect(niveau).connect(sortie);
  const phrase = PHRASES[Math.floor(tirage() * PHRASES.length)];
  let t = t0 + 0.3;
  phrase.forEach((nom, i) => {
    t = unite(ctx, bus, t, UNITES[nom], tirage);
    t += nom === 'whup' && phrase[i + 1] === 'whup' ? 0.3 : entre(tirage, 0.35, 0.9);
  });
  return t - t0 + 2.5;    // + la queue de réverbération
}

/* ---------- L'aura du requin-baleine ---------- */
export function auraRequinBaleine(ctx, sortie, t0, { graine = 2 } = {}) {
  const tirage = alea(graine);
  const duree = 13;
  const bus = gain(ctx, dB(NIVEAUX.requinBaleine));
  bus.connect(sortie);
  // 1) Le bourdon : 36 Hz, puis sa quinte, son octave, sa double octave, qui s'épanouissent
  //    l'une après l'autre, chacune avec un lent trémolo
  [[36, 0, 1], [54, 2.5, 0.5], [72, 4.5, 0.38], [108, 6.5, 0.2]].forEach(([f, retard, amp]) => {
    const o = ctx.createOscillator();
    o.frequency.value = f * entre(tirage, 0.995, 1.005);
    const g = gain(ctx);
    const debut = t0 + retard;
    enveloppe(g.gain, debut, { attaque: 2.5, tenue: Math.max(0.5, duree - retard - 6), chute: 3.5, niveau: amp });
    o.connect(g).connect(tremolo(ctx, 0.35, 0.12, debut, t0 + duree + 0.5)).connect(bus);
    o.start(debut); o.stop(t0 + duree + 0.5);
  });
  // 2) Le souffle : du bruit rose passe-bas dont la coupure gonfle (180 → 700 → 180 Hz) —
  //    l'eau déplacée par dix mètres de poisson
  const s = sourceBruit(ctx, tamponBruit(ctx, { duree: 4, couleur: 'rose', graine: graine + 5, canaux: 2 }));
  const f = filtre(ctx, 'lowpass', 180, 0.9);
  const courbe = new Float32Array(32);
  for (let i = 0; i < 32; i++) courbe[i] = 180 + 520 * Math.sin(Math.PI * i / 31) ** 2;
  f.frequency.setValueCurveAtTime(courbe, t0 + 1, 9);
  const gs = gain(ctx);
  enveloppe(gs.gain, t0 + 1, { attaque: 3.5, tenue: 2, chute: 3.5, niveau: 0.9 });
  s.connect(f).connect(gs).connect(bus);
  s.start(t0 + 1); s.stop(t0 + 11);
  // 3) Les cristaux : trois sinus très haut (do, sol, do), à peine là, qui tremblent
  [1046.5, 1568, 2093].forEach((fr, i) => {
    const o = ctx.createOscillator();
    o.frequency.value = fr;
    const g = gain(ctx);
    const debut = t0 + 5 + i * 0.8;
    enveloppe(g.gain, debut, { attaque: 1.5, tenue: 2.5, chute: 2.5, niveau: 0.028 });
    o.connect(g).connect(tremolo(ctx, 5.2 + i * 0.7, 0.4, debut, t0 + duree)).connect(bus);
    o.start(debut); o.stop(t0 + duree);
  });
  return duree + 2;
}

/** Le chant de chaque légendaire, par identifiant d'espèce. */
export const CHANTS = { baleine: chantBaleine, 'requin-baleine': auraRequinBaleine };
