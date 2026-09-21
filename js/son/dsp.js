/* ============================================
   DSP — la boîte à outils du son généré
   ============================================
   Tout le son du bassin (hors musique) est FABRIQUÉ : aucun fichier. Ce module
   rassemble les briques : générateur aléatoire à graine, tampons de bruit qui
   bouclent sans clic, crépitement, réponse impulsionnelle d'une réverbération,
   enveloppes, bulles. Règle : chaque fonction reçoit le contexte audio en
   paramètre et ne touche ni au DOM, ni à setTimeout, ni à l'horloge du
   navigateur. C'est ce qui permet de rendre exactement les mêmes sons en
   fichier, hors ligne, avec un OfflineAudioContext (outils/studio.html).
   ============================================ */

/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine → même suite → même son.
    Indispensable au studio pour comparer deux rendus, et pour que deux bulles ne se copient pas. */
export function alea(graine = 1) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Un nombre au hasard entre a et b, avec le tirage donné. */
export const entre = (tirage, a, b) => a + (b - a) * tirage();
/** Décibels → facteur d'amplitude : −6 dB ≈ ×0,5 ; −20 dB = ×0,1 ; −40 dB = ×0,01. */
export const dB = (x) => Math.pow(10, x / 20);

/* ---------- Bruits ---------- */
// Trois « couleurs », comme en photo : BLANC = toutes les fréquences à égalité (un souffle
// dur), ROSE = les graves renforcés de 3 dB par octave (une cascade, la pluie), BRUN = 6 dB
// par octave (le grondement de la mer). Le rose sort de trois filtres à un pôle en parallèle
// (l'approximation de Paul Kellet) ; le brun d'une intégration qui fuit (une marche aléatoire
// retenue, sinon elle dériverait à l'infini).
function remplirBruit(d, couleur, tirage) {
  let b0 = 0, b1 = 0, b2 = 0, v = 0;
  for (let i = 0; i < d.length; i++) {
    const w = tirage() * 2 - 1;
    if (couleur === 'blanc') d[i] = w;
    else if (couleur === 'rose') {
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    } else { v = (v + 0.02 * w) / 1.02; d[i] = v * 3.5; }
  }
}

/** Un tampon de bruit qui BOUCLE sans clic : on génère 0,5 s de trop et on fond cette queue
    dans le début. Stéréo (canaux = 2) = deux bruits indépendants : de la largeur, pas un point. */
export function tamponBruit(ctx, { duree = 6, couleur = 'blanc', graine = 1, canaux = 1 } = {}) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * duree), L = Math.floor(sr * 0.5);
  const tampon = ctx.createBuffer(canaux, n, sr);
  for (let c = 0; c < canaux; c++) {
    const brut = new Float32Array(n + L);
    remplirBruit(brut, couleur, alea(graine * 31 + c));
    const d = tampon.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = i < L ? brut[i] * (i / L) + brut[n + i] * (1 - i / L) : brut[i];
  }
  return tampon;
}

/** Le crépitement des crevettes-pistolets. Sur un récif, un hydrophone entend un grésillement
    permanent : des milliers de claquements minuscules (la bulle de cavitation d'une pince qui
    implose). On sème des clics à des instants de Poisson (intervalles exponentiels) ; chaque
    clic est une sinusoïde amortie de 1 à 3 ms, d'amplitude très inégale (loi en puissance :
    beaucoup de petits, quelques gros). Stéréo décorrélée : le récif est partout. */
export function tamponCrepitement(ctx, { duree = 8, densite = 30, graine = 3, canaux = 2 } = {}) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * duree);
  const tampon = ctx.createBuffer(canaux, n, sr);
  for (let c = 0; c < canaux; c++) {
    const d = tampon.getChannelData(c);
    const tirage = alea(graine * 17 + c);
    let t = 0;
    for (;;) {
      t += -Math.log(1 - tirage()) / densite;
      if (t >= duree) break;
      const debut = Math.floor(t * sr);
      const amp = Math.pow(tirage(), 3) * 0.9 + 0.02;
      const f = entre(tirage, 2500, 7500);
      const tau = entre(tirage, 0.0006, 0.0025) * sr;
      const longueur = Math.min(Math.floor(tau * 6), n - debut);
      const signe = tirage() < 0.5 ? -1 : 1;
      for (let i = 0; i < longueur; i++) d[debut + i] += signe * amp * Math.exp(-i / tau) * Math.sin(2 * Math.PI * f * i / sr);
    }
  }
  return tampon;
}

/** La réponse impulsionnelle d'une réverbération sous-marine : ce qu'on entendrait dans le
    bassin après un claquement. Du bruit qui s'éteint exponentiellement (−60 dB au bout de
    `duree`, c'est la définition du RT60), assombri au fil du temps (l'eau et les parois avalent
    les aigus avant les graves : un passe-bas à un pôle dont la coupure descend), en stéréo
    décorrélée pour l'espace, après 12 ms de pré-délai (le son direct arrive d'abord). */
export function reponseImpulsionnelle(ctx, { duree = 2.8, coupure = 2200, graine = 5 } = {}) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * duree);
  const tampon = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = tampon.getChannelData(c);
    const tirage = alea(graine * 7 + c);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const fc = coupure * Math.exp(-t * 1.1) + 150;
      const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
      y += a * ((tirage() * 2 - 1) - y);
      d[i] = t < 0.012 ? 0 : y * Math.exp(-6.91 * t / duree);
    }
  }
  return tampon;
}

/* ---------- Briques d'une ligne ---------- */
export function sourceBruit(ctx, tampon) { const s = ctx.createBufferSource(); s.buffer = tampon; s.loop = true; return s; }
export function filtre(ctx, type, frequence, Q = 1, gainDb = 0) {
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequence; f.Q.value = Q; f.gain.value = gainDb; return f;
}
export function gain(ctx, valeur = 1) { const g = ctx.createGain(); g.gain.value = valeur; return g; }
/** Un LFO (oscillateur lent) branché sur un paramètre : param += amplitude × sin(2π·f·t). */
export function lfo(ctx, param, frequence, amplitude, debut = 0, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = frequence;
  const g = ctx.createGain(); g.gain.value = amplitude;
  o.connect(g).connect(param); o.start(debut);
  return o;
}

/** Enveloppe : attaque LINÉAIRE jusqu'à `niveau` (audible dès le départ), tenue, puis chute
    EXPONENTIELLE jusqu'à −40 dB au bout de `chute` (une décroissance naturelle est linéaire en dB),
    et extinction rapide ensuite. Piège rencontré : une chute exponentielle visant −80 dB passe
    sous le seuil audible au tiers de sa durée — les souffles sonnaient comme des clics.
    Renvoie l'instant où la chute atteint −40 dB (arrêter la source ≥ 50 ms plus tard). */
export function enveloppe(param, t, { attaque = 0.01, tenue = 0, chute = 0.3, niveau = 1 }) {
  const cible = Math.max(niveau, 0.0001);
  param.value = 0.0001;               // AVANT le premier événement : sinon la valeur par défaut (1) fuit un instant
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(cible, t + attaque);
  const debutChute = t + attaque + tenue;
  if (tenue > 0) param.setValueAtTime(cible, debutChute);
  param.exponentialRampToValueAtTime(Math.max(cible * 0.01, 0.0001), debutChute + chute);
  param.setTargetAtTime(0.0001, debutChute + chute, 0.02);
  return debutChute + chute;
}

/** Un trémolo MULTIPLICATIF : un gain qui oscille entre 1 − 2·profondeur et 1. À brancher en série
    (source → enveloppe → trémolo → sortie) : quand l'enveloppe est à zéro, le produit l'est aussi —
    alors qu'un LFO ajouté au gain de l'enveloppe continuerait à « fuir » après l'extinction. */
export function tremolo(ctx, frequence, profondeur, debut = 0, fin = null) {
  const g = ctx.createGain();
  g.gain.value = 1 - profondeur;
  const o = lfo(ctx, g.gain, frequence, profondeur, debut);
  if (fin !== null) o.stop(fin);
  return g;
}

/** Une bulle : une sinusoïde amortie à la fréquence de Minnaert, f ≈ 3,26 / rayon (en mètres).
    Une bulle de 3 mm sonne vers 1,1 kHz, une de 10 mm vers 330 Hz : plus elle est grosse, plus
    elle est grave. En montant, elle glisse un peu vers l'aigu (`montee`). */
export function bulle(ctx, sortie, t, { rayon = 0.003, niveau = 0.03, montee = 1.25 } = {}) {
  const f0 = 3.26 / rayon;
  const duree = 0.05 + rayon * 14;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * montee, t + duree);
  const g = ctx.createGain();
  enveloppe(g.gain, t, { attaque: 0.003, chute: duree, niveau });
  o.connect(g).connect(sortie);
  o.start(t); o.stop(t + duree + 0.02);
}

/** Interpolation géométrique lissée entre des fréquences données à x = 0, 1/2, 1 : le glissé
    d'une voix se fait en log (les octaves sont égales à l'oreille), pas en Hz. */
export function glisse(points, x) {
  const n = points.length - 1;
  const pos = Math.min(Math.max(x, 0), 1) * n;
  const i = Math.min(Math.floor(pos), n - 1);
  const u = pos - i;
  const s = 0.5 - 0.5 * Math.cos(Math.PI * u);      // lissage en cosinus : pas de cassure aux points
  return Math.exp(Math.log(points[i]) * (1 - s) + Math.log(points[i + 1]) * s);
}
