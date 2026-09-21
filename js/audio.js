/* ============================================
   AUDIO — l'ambiance, les sons, la musique
   ============================================
   Trois couches sur un même « master » :
   1) l'ambiance, GÉNÉRÉE : un grondement sourd (bruit brun filtré qui respire),
      un sub très grave, quelques bulles — aucun fichier
   2) les sons, générés aussi, par des oscillateurs : carillon (nouvelle espèce),
      tic (déjà vue), grondement (un rare entre en scène)
   3) la musique : les morceaux de playlist.js, deux lecteurs en alternance avec
      fondu enchaîné, légèrement filtrés pour sonner « à travers l'eau »

   Règle des navigateurs : pas de son avant un geste de l'utilisateur. Tout se
   crée dans demarrer(), appelé au clic sur « Entrer ».
   ============================================ */

import { PLAYLIST } from './playlist.js';
import { reglages, sauverReglages } from './collection.js';

const FONDU = 4;            // secondes de fondu enchaîné entre deux morceaux
const NIVEAU_MUSIQUE = 0.8; // la musique un peu sous le master, pour laisser respirer les sons

export function creerAudio() {
  let ctx = null;
  let master, busMusique, busSons;
  const lecteurs = [];      // deux { element, gain } qui se relaient
  let lecteurActif = -1;
  let pisteActuelle = null;
  let enchainementLance = false;
  let bruitCache = null;
  const prefs = reglages();  // { volume, coupe } — persistés avec la collection

  /* ---------- Le player (DOM) ---------- */
  const player = document.getElementById('player');
  const titre = document.getElementById('player-titre');
  const btnMute = document.getElementById('player-mute');
  const curseurVolume = document.getElementById('player-volume');
  const btnCredits = document.getElementById('player-credits');
  const credits = document.getElementById('credits');

  curseurVolume.value = prefs.volume;
  btnMute.classList.toggle('coupe', prefs.coupe);
  curseurVolume.addEventListener('input', () => volume(parseFloat(curseurVolume.value)));
  curseurVolume.addEventListener('change', () => sauverReglages({ volume: parseFloat(curseurVolume.value) }));
  btnMute.addEventListener('click', () => couper(!prefs.coupe));
  btnCredits.addEventListener('click', () => { credits.hidden = !credits.hidden; });
  remplirCredits();

  function remplirCredits() {
    const h = document.createElement('h3'); h.textContent = 'Musique';
    const liste = document.createElement('ul');
    for (const p of PLAYLIST) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = p.source; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = `${p.titre} — ${p.artiste}`;
      li.append(a, ` · ${p.licence}`);
      liste.append(li);
    }
    const note = document.createElement('p');
    note.textContent = 'Ambiance sous-marine et effets sonores : générés en temps réel par le site (Web Audio).';
    credits.replaceChildren(h, liste, note);
  }

  /* ---------- Réglages ---------- */
  function volume(v) {
    prefs.volume = v;
    if (master && !prefs.coupe) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }
  function couper(oui) {
    prefs.coupe = oui;
    btnMute.classList.toggle('coupe', oui);
    if (master) master.gain.setTargetAtTime(oui ? 0 : prefs.volume, ctx.currentTime, 0.05);
    sauverReglages({ coupe: oui });
  }

  /* ---------- 1) L'ambiance ---------- */
  // Bruit « brun » : une marche aléatoire, riche en graves, comme l'eau qui gronde.
  // La fin est fondue dans le début pour que la boucle n'ait pas de « clic ».
  function bruitBrun(duree = 6) {
    if (bruitCache) return bruitCache;
    const n = Math.floor(ctx.sampleRate * duree);
    const L = Math.floor(ctx.sampleRate * 0.5);
    const brut = new Float32Array(n + L);
    let v = 0;
    for (let i = 0; i < n + L; i++) { v = (v + 0.02 * (Math.random() * 2 - 1)) / 1.02; brut[i] = v * 3.5; }
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = i < L ? brut[i] * (i / L) + brut[n + i] * (1 - i / L) : brut[i];
    return (bruitCache = buffer);
  }

  function creerAmbiance() {
    const source = ctx.createBufferSource();
    source.buffer = bruitBrun();
    source.loop = true;
    const filtre = ctx.createBiquadFilter();       // on ne garde que le grave
    filtre.type = 'lowpass';
    filtre.frequency.value = 170;
    filtre.Q.value = 0.8;
    // La « respiration » : un oscillateur très lent (un cycle toutes les 22 s)
    // qui fait monter et descendre la fréquence de coupure du filtre
    const respiration = ctx.createOscillator();
    respiration.frequency.value = 0.045;
    const amplitudeResp = ctx.createGain();
    amplitudeResp.gain.value = 70;
    respiration.connect(amplitudeResp).connect(filtre.frequency);
    const niveau = ctx.createGain();
    niveau.gain.value = 0.32;
    source.connect(filtre).connect(niveau).connect(master);
    source.start();
    respiration.start();

    // Un sub à 41 Hz, à peine audible, avec un lent trémolo
    const sub = ctx.createOscillator();
    sub.frequency.value = 41;
    const niveauSub = ctx.createGain();
    niveauSub.gain.value = 0.045;
    const tremolo = ctx.createOscillator();
    tremolo.frequency.value = 0.07;
    const amplitudeTrem = ctx.createGain();
    amplitudeTrem.gain.value = 0.025;
    tremolo.connect(amplitudeTrem).connect(niveauSub.gain);
    sub.connect(niveauSub).connect(master);
    sub.start();
    tremolo.start();
  }

  function bulle(quand) {
    const o = ctx.createOscillator();
    const f0 = 400 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, quand);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.2, quand + 0.12);   // la bulle « monte »
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, quand);
    g.gain.exponentialRampToValueAtTime(0.035, quand + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, quand + 0.14);
    o.connect(g).connect(master);
    o.start(quand);
    o.stop(quand + 0.16);
  }
  function programmerBulles() {
    setTimeout(() => {
      if (!ctx) return;
      const nb = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < nb; i++) bulle(ctx.currentTime + i * 0.13);
      programmerBulles();
    }, 4000 + Math.random() * 7000);
  }

  /* ---------- 2) Les sons ---------- */
  function creerSons() {
    busSons = ctx.createGain();
    busSons.connect(master);
    // Un écho court en boucle de rétroaction : donne de l'espace au carillon
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.27;
    const retour = ctx.createGain();
    retour.gain.value = 0.32;
    const filtreEcho = ctx.createBiquadFilter();
    filtreEcho.frequency.value = 2200;
    echo.connect(filtreEcho).connect(retour).connect(echo);
    const niveauEcho = ctx.createGain();
    niveauEcho.gain.value = 0.35;
    busSons.connect(echo);
    echo.connect(niveauEcho).connect(master);
  }

  function note(freq, quand, duree, gain, type = 'sine') {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, quand);
    g.gain.exponentialRampToValueAtTime(gain, quand + 0.015);      // attaque franche
    g.gain.exponentialRampToValueAtTime(0.0001, quand + duree);     // longue extinction
    o.connect(g).connect(busSons);
    o.start(quand);
    o.stop(quand + duree + 0.05);
  }

  /** Nouvelle espèce : un arpège mi – sol♯ – si – mi, comme des gouttes. */
  function carillon() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => {
      note(f, t + i * 0.13, 1.8, 0.16);
      note(f * 2, t + i * 0.13, 0.9, 0.03, 'triangle');   // un peu d'harmonique
    });
  }
  /** Déjà vue : une seule note, discrète. */
  function tic() {
    if (!ctx) return;
    note(987.77, ctx.currentTime, 0.4, 0.07);
  }
  /** Le chant d'une baleine : deux voix qui glissent, très doucement, dans l'écho. */
  function chant() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [f0, f1, f2, depart, gain] of [[160, 380, 240, 0, 0.05], [240, 520, 330, 1.8, 0.03]]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f0, t + depart);
      o.frequency.exponentialRampToValueAtTime(f1, t + depart + 2.6);
      o.frequency.exponentialRampToValueAtTime(f2, t + depart + 4.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + depart);
      g.gain.exponentialRampToValueAtTime(gain, t + depart + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + depart + 5.0);
      o.connect(g).connect(busSons);
      o.start(t + depart);
      o.stop(t + depart + 5.1);
    }
  }
  /** Un souffle : le bruit de fond filtré qui gonfle puis retombe (un banc qui passe). */
  function souffle(duree = 4) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = bruitBrun();
    source.loop = true;
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'bandpass';
    filtre.frequency.value = 700;
    filtre.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + duree * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    source.connect(filtre).connect(g).connect(master);
    source.start(t);
    source.stop(t + duree + 0.1);
  }
  /** Un rare entre en scène : un grondement grave qui descend (intensite : 1 = plein). */
  function grondement(intensite = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(52, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 2.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * intensite, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 3.5);
    // et un souffle grave par-dessus
    const souffle = ctx.createBufferSource();
    souffle.buffer = bruitBrun();
    const filtre = ctx.createBiquadFilter();
    filtre.frequency.value = 90;
    const gs = ctx.createGain();
    gs.gain.setValueAtTime(0.0001, t);
    gs.gain.exponentialRampToValueAtTime(0.22 * intensite, t + 1.0);
    gs.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    souffle.connect(filtre).connect(gs).connect(master);
    souffle.start(t);
    souffle.stop(t + 3.4);
  }

  /* ---------- 3) La musique ---------- */
  function creerLecteur() {
    const element = new Audio();
    element.preload = 'auto';
    const source = ctx.createMediaElementSource(element);   // l'élément <audio> devient une source du graphe
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(busMusique);
    const lecteur = { element, gain };
    // FONDU secondes avant la fin, on lance le morceau suivant : les deux se chevauchent
    element.addEventListener('timeupdate', () => {
      if (lecteurs[lecteurActif] !== lecteur || enchainementLance) return;
      if (element.duration && element.duration - element.currentTime < FONDU) { enchainementLance = true; suivante(); }
    });
    element.addEventListener('ended', () => {
      if (lecteurs[lecteurActif] === lecteur && !enchainementLance) { enchainementLance = true; suivante(); }
    });
    return lecteur;
  }

  function tirerPiste() {
    if (PLAYLIST.length <= 1) return PLAYLIST[0] ?? null;
    let piste;
    do { piste = PLAYLIST[Math.floor(Math.random() * PLAYLIST.length)]; } while (piste === pisteActuelle);
    return piste;   // au hasard, jamais deux fois de suite le même
  }

  function suivante() {
    const piste = tirerPiste();
    if (!piste) return;
    const t = ctx.currentTime;
    const ancien = lecteurs[lecteurActif];
    lecteurActif = (lecteurActif + 1) % lecteurs.length;
    const nouveau = lecteurs[lecteurActif];

    nouveau.element.src = piste.fichier;
    nouveau.element.currentTime = 0;
    nouveau.gain.gain.cancelScheduledValues(t);
    nouveau.gain.gain.setValueAtTime(0.0001, t);
    nouveau.gain.gain.exponentialRampToValueAtTime(1, t + FONDU);       // le nouveau monte…
    nouveau.element.play().catch((e) => console.warn('Lecture impossible :', e.message));

    if (ancien) {                                                         // …pendant que l'ancien descend
      ancien.gain.gain.cancelScheduledValues(t);
      ancien.gain.gain.setValueAtTime(Math.max(ancien.gain.gain.value, 0.0001), t);
      ancien.gain.gain.exponentialRampToValueAtTime(0.0001, t + FONDU);
      setTimeout(() => ancien.element.pause(), FONDU * 1000 + 100);
    }
    pisteActuelle = piste;
    enchainementLance = false;
    titre.textContent = `${piste.titre} — ${piste.artiste}`;
  }

  /* ---------- Démarrage (après un geste de l'utilisateur) ---------- */
  async function demarrer() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = prefs.coupe ? 0 : prefs.volume;
    master.connect(ctx.destination);

    // La musique passe par un filtre doux : les aigus atténués, comme à travers l'eau
    busMusique = ctx.createGain();
    busMusique.gain.value = NIVEAU_MUSIQUE;
    const eau = ctx.createBiquadFilter();
    eau.type = 'lowpass';
    eau.frequency.value = 5200;
    eau.Q.value = 0.5;
    busMusique.connect(eau).connect(master);

    creerAmbiance();
    creerSons();
    lecteurs.push(creerLecteur(), creerLecteur());
    if (ctx.state === 'suspended') await ctx.resume();

    player.hidden = false;
    if (PLAYLIST.length) suivante();
    programmerBulles();
  }

  return {
    demarrer, carillon, tic, grondement, chant, souffle, volume, couper,
    get pret() { return ctx !== null; },
    /** Pour les tests : l'état courant en clair. */
    etat() {
      const l = lecteurs[lecteurActif];
      return {
        contexte: ctx ? ctx.state : 'absent',
        piste: pisteActuelle ? pisteActuelle.titre : null,
        position: l ? l.element.currentTime : 0,
        enPause: l ? l.element.paused : true,
        volume: master ? master.gain.value : null,
      };
    },
  };
}
