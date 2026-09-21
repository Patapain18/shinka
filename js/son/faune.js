/* ============================================
   FAUNE — le bruit que font les animaux en nageant
   ============================================
   Un poisson ne « fait » presque pas de bruit… mais l'eau qu'il déplace, si : le
   coup de queue d'un requin est un souffle bref et grave, l'aile de la manta un
   long balayage, la palme de la tortue un clapot, un banc de sardines un scintil-
   lement continu. Chaque espèce a sa RECETTE (bande de fréquences, durée, force).
   Chaque son est SPATIALISÉ : un PannerNode place la source à la position 3D de
   l'animal par rapport à l'auditeur (la caméra). L'éloignement l'atténue ET
   l'assombrit — l'eau avale les aigus : c'est le pendant sonore du brouillard.
   Les coups de queue sont calés sur l'ANIMATION : la phase de l'action « swim »
   (0 → 1 par cycle) déclenche un souffle à chaque passage de la queue au milieu.
   Budget : au plus VOIX animaux sonores à la fois, les plus proches (pondérés par
   leur taille : un géant s'entend de plus loin), à moins de PORTEE mètres.
   ============================================ */

import { alea, entre, dB, tamponBruit, sourceBruit, filtre, gain, enveloppe } from './dsp.js';

export const VOIX = 8;      // animaux sonores au plus (chaque voix = un PannerNode)
export const PORTEE = 26;   // mètres : au-delà, plus rien (le brouillard sonore)

/* La recette de chaque espèce.
   bande      : le filtre glisse de bande[1] (aigu) à bande[0] (grave) pendant le souffle
   duree      : longueur d'un souffle (s)
   force      : niveau d'un souffle à 2 m, en dB (avant l'atténuation par la distance)
   phases     : instants du cycle de nage (0 → 1) où la queue ou l'aile passe au milieu, vite
   alternance : le second battement d'un cycle est un peu plus faible (l'aller et le retour)
   masse      : les géants déplacent de l'eau : un « thump » grave (Hz) sous le souffle
   continu    : pas de battements distincts mais un frottement permanent (petits poissons, banc)
   scintille  : le frottement tremble (des milliers de reflets sonores : le banc) */
export const RECETTES = {
  'requin-recif':   { bande: [450, 2600], duree: 0.32, force: -21, phases: [0.25, 0.75], alternance: 0.65 },
  'requin-marteau': { bande: [380, 2200], duree: 0.4,  force: -19, phases: [0.25, 0.75], alternance: 0.7 },
  'requin-baleine': { bande: [110, 900],  duree: 0.95, force: -15, phases: [0.25, 0.75], alternance: 0.8, masse: 58 },
  'baleine':        { bande: [80, 700],   duree: 1.3,  force: -13, phases: [0.25, 0.75], alternance: 0.85, masse: 46 },
  'manta':          { bande: [180, 1500], duree: 0.75, force: -17, phases: [0.2, 0.7],   alternance: 0.8 },
  'tortue':         { bande: [600, 3200], duree: 0.2,  force: -24, phases: [0.15, 0.65], alternance: 0.9 },
  'meduse':         { bande: [140, 800],  duree: 0.55, force: -28, phases: [0.12],       alternance: 1 },
  'chirurgien':     { continu: true, bande: [2500, 7000], force: -50 },
  'sardine':        { continu: true, bande: [1800, 7000], force: -38, scintille: true },
};
const RECETTE_MUETTE = { bande: [200, 2000], duree: 0.5, force: -20, phases: [], alternance: 1 };
// Le passe-bande ne garde qu'une fraction du bruit blanc, et la distance divise encore par trois :
// on compense ici, une fois (mesuré au studio : la parade sortait 18 dB trop bas), pour que
// `force` reste lisible — « le niveau d'un souffle entendu à 2 m ».
const CALIBRATION = dB(18);

/** La phase `seuil` a-t-elle été franchie entre `avant` et `apres` ? (en tenant compte du retour à 0) */
const franchi = (avant, apres, seuil) =>
  (avant < seuil && apres >= seuil) || (apres < avant && (avant < seuil || apres >= seuil));

export function creerFaune(ctx, { sortie, reverb, spatial = 'hrtf', graine = 11 }) {
  const tirage = alea(graine);
  const tamponBlanc = tamponBruit(ctx, { duree: 4, couleur: 'blanc', graine: graine + 1 });
  const tamponLent = tamponBruit(ctx, { duree: 5, couleur: 'blanc', graine: graine + 2 });
  const emetteurs = new Map();      // animal → émetteur
  const liberes = [];               // émetteurs en train de s'éteindre : { e, quand }
  let modele = spatial === 'hrtf' ? 'HRTF' : 'equalpower';
  let souffles = 0;                 // compteur, pour les tests et le studio
  // Hors ligne (le studio), tout le code tourne AVANT le rendu : un disconnect() serait immédiat et
  // couperait l'émetteur pour toute la durée, y compris avant sa libération. On se contente alors
  // d'arrêter les sources à l'heure prévue et de laisser les nœuds muets.
  const horsLigne = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

  // setTargetAtTime plutôt que « .value = » : lisse les sauts (pas de craquement) ET fonctionne
  // hors ligne, où la valeur doit être écrite sur la ligne de temps, pas dans le présent.
  const lisser = (param, v, t, tau = 0.04) => param.setTargetAtTime(v, t, tau);

  /* ---------- L'auditeur : la caméra ---------- */
  // Position et orientation lues dans la matrice monde de la caméra (colonnes : X, Y, Z, position).
  // Three regarde vers −Z local : l'avant de l'auditeur est l'opposé de la 3e colonne.
  function placerAuditeur(t, camera) {
    const m = camera.matrixWorld.elements;
    const L = ctx.listener;
    const avant = [-m[8], -m[9], -m[10]], haut = [m[4], m[5], m[6]];
    if (L.positionX) {
      lisser(L.positionX, m[12], t); lisser(L.positionY, m[13], t); lisser(L.positionZ, m[14], t);
      lisser(L.forwardX, avant[0], t); lisser(L.forwardY, avant[1], t); lisser(L.forwardZ, avant[2], t);
      lisser(L.upX, haut[0], t); lisser(L.upY, haut[1], t); lisser(L.upZ, haut[2], t);
    } else {                          // vieux Safari : les méthodes historiques
      L.setPosition(m[12], m[13], m[14]);
      L.setOrientation(avant[0], avant[1], avant[2], haut[0], haut[1], haut[2]);
    }
  }

  /* ---------- Un émetteur par animal sonore ---------- */
  function panner(refDistance, rolloffFactor) {
    const p = ctx.createPanner();
    p.panningModel = modele;
    p.distanceModel = 'inverse';     // niveau = ref / (ref + rolloff × (d − ref))
    p.refDistance = refDistance;
    p.rolloffFactor = rolloffFactor;
    p.maxDistance = 100;
    return p;
  }
  function creerEmetteur(animal, recette, t) {
    // Les mouvements : à 2 m niveau nominal, moitié à 4 m, un dixième à 20 m
    const pan = panner(2, 1.1);
    const absorption = filtre(ctx, 'lowpass', 5000, 0.5);
    const niveau = gain(ctx, 1);
    niveau.connect(absorption).connect(pan).connect(sortie);
    const versReverb = gain(ctx, 0.3);
    pan.connect(versReverb).connect(reverb);
    const e = {
      animal, recette, pan, absorption, niveau, sources: [],
      tirage: alea(Math.floor(tirage() * 1e9)),
      phasePrecedente: null, reserve: 0, continu: null, profondeur: null, voix: null,
    };
    if (recette.continu) {
      const s = sourceBruit(ctx, tamponBlanc);
      const f = filtre(ctx, 'bandpass', Math.sqrt(recette.bande[0] * recette.bande[1]), 0.7);
      const g = gain(ctx, 0);
      s.connect(f).connect(g).connect(niveau);
      s.start(t, entre(e.tirage, 0, 3));
      e.sources.push(s);
      if (recette.scintille) {
        // Un bruit lent (filtré à 6 Hz) module le niveau : le frottement tremble au lieu d'être plat
        const lent = sourceBruit(ctx, tamponLent);
        const fl = filtre(ctx, 'lowpass', 6, 0.7);
        const prof = gain(ctx, 0);
        lent.connect(fl).connect(prof).connect(g.gain);
        lent.start(t, entre(e.tirage, 0, 4));
        e.sources.push(lent);
        e.profondeur = prof;
      }
      e.continu = g;
    }
    return e;
  }
  function placer(e, a, t, d) {
    const p = a.objet.position;
    lisser(e.pan.positionX, p.x, t); lisser(e.pan.positionY, p.y, t); lisser(e.pan.positionZ, p.z, t);
    if (e.voix) { lisser(e.voix.pan.positionX, p.x, t); lisser(e.voix.pan.positionY, p.y, t); lisser(e.voix.pan.positionZ, p.z, t); }
    // L'eau avale les aigus avec la distance : 5,3 kHz tout près, ~2 kHz à 10 m, ~800 Hz à 25 m
    lisser(e.absorption.frequency, 300 + 5000 * Math.exp(-d / 11), t, 0.1);
  }

  /** Un souffle : du bruit blanc dans un filtre passe-bande qui GLISSE de l'aigu vers le grave
      (le « vvvouh » d'une masse d'eau qui passe), enveloppe courte. Les géants ajoutent un thump. */
  function souffle(e, t, force, vigueur) {
    souffles++;
    const r = e.recette;
    const duree = r.duree / (0.8 + 0.2 * vigueur);
    const s = sourceBruit(ctx, tamponBlanc);
    const f = filtre(ctx, 'bandpass', r.bande[1], 0.9);
    f.frequency.setValueAtTime(r.bande[1], t);
    f.frequency.exponentialRampToValueAtTime(r.bande[0], t + duree);
    const g = gain(ctx);
    const fin = enveloppe(g.gain, t, { attaque: duree * 0.3, chute: duree * 0.7, niveau: force * CALIBRATION });
    s.connect(f).connect(g).connect(e.niveau);
    s.start(t, entre(e.tirage, 0, 3.5));
    s.stop(fin + 0.2);
    if (r.masse) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(r.masse, t);
      o.frequency.exponentialRampToValueAtTime(r.masse * 0.6, t + duree * 0.6);
      const go = gain(ctx);
      enveloppe(go.gain, t, { attaque: 0.05, chute: duree * 0.7, niveau: force * 0.35 });   // une sinusoïde pure sonne bien plus fort qu'un bruit filtré
      o.connect(go).connect(e.niveau);
      o.start(t); o.stop(t + duree + 0.3);
    }
  }

  function majEmetteur(e, a, d, t) {
    placer(e, a, t, d);
    const r = e.recette;
    const vigueur = (a.vitesse ?? a.espece.vitesse) / a.espece.vitesse;    // 0,85 → 1,15 : pressé ou nonchalant
    if (r.continu) {
      let niv = dB(r.force) * CALIBRATION * vigueur;
      if (a.nombre) niv *= Math.min(2, a.nombre / 150) * (a.tourbillon ? 1.6 : 1);   // un banc : selon sa taille
      lisser(e.continu.gain, niv, t, 0.2);
      if (e.profondeur) lisser(e.profondeur.gain, niv * 30, t, 0.2);   // le filtre à 6 Hz laisse très peu passer : on compense
      return;
    }
    const action = a.actions?.nage;
    if (!action) return;
    const phase = (action.time / action.getClip().duration) % 1;
    const poids = action.getEffectiveWeight ? action.getEffectiveWeight() : 1;   // 0 pendant la glisse : queue immobile
    if (e.phasePrecedente !== null && poids > 0.05) {
      r.phases.forEach((seuil, i) => {
        if (!franchi(e.phasePrecedente, phase, seuil)) return;
        const force = dB(r.force) * poids * (0.7 + 0.3 * vigueur) * (i % 2 ? r.alternance : 1) * entre(e.tirage, 0.85, 1.15);
        souffle(e, t + 0.005, force, vigueur);
      });
    }
    e.phasePrecedente = phase;
  }

  function liberer(a, e, t) {
    lisser(e.niveau.gain, 0, t, 0.15);
    if (e.voix) lisser(e.voix.niveau.gain, 0, t, 0.15);
    emetteurs.delete(a);
    liberes.push({ e, quand: t + 1 });
  }
  function debrancher(e, t) {
    for (const s of e.sources) { try { s.stop(t); } catch { /* déjà arrêtée */ } }
    if (horsLigne) return;
    e.pan.disconnect(); e.niveau.disconnect();
    if (e.voix) { e.voix.pan.disconnect(); e.voix.niveau.disconnect(); }
  }

  /* ---------- Chaque frame ---------- */
  function maj(t, dt, animaux, camera) {
    placerAuditeur(t, camera);
    const m = camera.matrixWorld.elements;
    const cx = m[12], cy = m[13], cz = m[14];
    const candidats = [];
    for (const a of animaux) {
      if (a.fini || !RECETTES[a.espece.id]) continue;
      const p = a.objet.position;
      const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      // Rang : la distance, divisée par la racine de la taille — un géant compte de plus loin
      if (d < PORTEE) candidats.push({ a, d, rang: d / Math.sqrt(a.espece.taille) });
    }
    candidats.sort((u, v) => u.rang - v.rang);
    const retenus = candidats.slice(0, VOIX);
    const garder = new Set(retenus.map((c) => c.a));
    for (const [a, e] of emetteurs) {
      if (garder.has(a)) continue;
      if (e.reserve > t) { placer(e, a, t, PORTEE); continue; }   // un chant est en cours dessus : on le suit
      liberer(a, e, t);
    }
    for (const { a, d } of retenus) {
      let e = emetteurs.get(a);
      if (!e) { e = creerEmetteur(a, RECETTES[a.espece.id], t); emetteurs.set(a, e); }
      majEmetteur(e, a, d, t);
    }
    for (let i = liberes.length - 1; i >= 0; i--) {
      if (liberes[i].quand <= t) { debrancher(liberes[i].e, t); liberes.splice(i, 1); }
    }
  }

  /* ---------- La voix d'un animal (pour les chants) ---------- */
  /** Renvoie le nœud d'entrée où brancher un chant : un second panner, presque insensible à la
      distance (une voix qui porte loin), à la position de l'animal, avec plus de réverbération. */
  function voixPour(animal, t, duree) {
    let e = emetteurs.get(animal);
    if (!e) {
      e = creerEmetteur(animal, RECETTES[animal.espece.id] ?? RECETTE_MUETTE, t);
      emetteurs.set(animal, e);
    }
    if (!e.voix) {
      const pan = panner(4, 0.2);
      const niveau = gain(ctx, 1);
      niveau.connect(pan).connect(sortie);
      const versReverb = gain(ctx, 0.5);
      pan.connect(versReverb).connect(reverb);
      e.voix = { pan, niveau };
    }
    placer(e, animal, t, 0);
    e.reserve = Math.max(e.reserve, t + duree);
    return e.voix.niveau;
  }

  return {
    maj, voixPour,
    reserver(animal, jusqua) { const e = emetteurs.get(animal); if (e) e.reserve = Math.max(e.reserve, jusqua); },
    /** 'hrtf' (relief binaural, plus coûteux) ou 'simple' (equalpower) — la qualité basse choisit simple. */
    regler({ spatial }) {
      if (!spatial) return;
      modele = spatial === 'hrtf' ? 'HRTF' : 'equalpower';
      for (const e of emetteurs.values()) { e.pan.panningModel = modele; if (e.voix) e.voix.pan.panningModel = modele; }
    },
    get nombre() { return emetteurs.size; },
    get souffles() { return souffles; },
  };
}
