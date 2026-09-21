/* ============================================
   AUDIO — le son du bassin, côté page
   ============================================
   Ce module fait le lien entre la page et la table de mixage (son/graphe.js) :
   - il crée l'AudioContext au premier geste (règle des navigateurs) ;
   - il tient le player (titre, volume, mute, crédits) et les préférences ;
   - il lit la musique : deux lecteurs en alternance avec fondu enchaîné, chaque
     morceau ramené à la MÊME sonie (playlist.js : `sonie`, mesurée en LUFS) ;
   - il relaie les événements du site vers le graphe : arrivée d'une espèce
     (chant ou grondement), observation (carillon / tic), et à chaque frame la
     caméra et les animaux (la spatialisation).
   Tout ce qui FABRIQUE du son vit dans js/son/ : dsp, ambiance, faune, chants, graphe.
   ============================================ */

import { PLAYLIST } from './playlist.js';
import { reglages, sauverReglages } from './collection.js';
import { creerGraphe, SONIE_CIBLE } from './son/graphe.js';
import { dB } from './son/dsp.js';

const FONDU = 4;            // secondes de fondu enchaîné entre deux morceaux

export function creerAudio() {
  let ctx = null;
  let graphe = null;
  let analyseur = null;
  const lecteurs = [];      // deux { element, gain } qui se relaient
  let lecteurActif = -1;
  let pisteActuelle = null;
  let enchainementLance = false;
  let spatial = 'hrtf';     // le modèle de spatialisation demandé (qualite.js peut le baisser)
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
    note.textContent = 'Ambiance sous-marine, sons des animaux et chants : générés en temps réel par le site (Web Audio), sans aucun enregistrement.';
    credits.replaceChildren(h, liste, note);
  }

  /* ---------- Réglages ---------- */
  function volume(v) {
    prefs.volume = v;
    if (graphe && !prefs.coupe) graphe.master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }
  function couper(oui) {
    prefs.coupe = oui;
    btnMute.classList.toggle('coupe', oui);
    if (graphe) graphe.master.gain.setTargetAtTime(oui ? 0 : prefs.volume, ctx.currentTime, 0.05);
    sauverReglages({ coupe: oui });
  }

  /* ---------- La musique ---------- */
  function creerLecteur() {
    const element = new Audio();
    element.preload = 'auto';
    const source = ctx.createMediaElementSource(element);   // l'élément <audio> devient une source du graphe
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(graphe.busMusique);
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

    // Chaque morceau a sa propre sonie (mesurée une fois : node outils/sonie.mjs). On le ramène
    // à la cible : « Introduction » (−27,5 LUFS) remonte de 4,5 dB, « Tranquility II » (−8,8 LUFS)
    // descend de 14 dB. Sans ça, un morceau sur deux écrasait l'ambiance.
    const norme = dB(SONIE_CIBLE - (piste.sonie ?? SONIE_CIBLE));
    nouveau.element.src = piste.fichier;
    nouveau.element.currentTime = 0;
    nouveau.gain.gain.cancelScheduledValues(t);
    nouveau.gain.gain.setValueAtTime(0.0001, t);
    nouveau.gain.gain.exponentialRampToValueAtTime(norme, t + FONDU);   // le nouveau monte…
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
    graphe = creerGraphe(ctx, { spatial, graine: Math.floor(Math.random() * 1e6) });
    graphe.master.gain.value = prefs.coupe ? 0 : prefs.volume;
    // Une sonde sur le master : les tests lisent le niveau réel (RMS) qui sort
    analyseur = ctx.createAnalyser();
    analyseur.fftSize = 1024;
    graphe.master.connect(analyseur);
    lecteurs.push(creerLecteur(), creerLecteur());
    if (ctx.state === 'suspended') await ctx.resume();

    player.hidden = false;
    if (PLAYLIST.length) suivante();
  }
  // Sur un téléphone, un appel, Siri ou un changement d'onglet suspendent le contexte sans
  // prévenir. Au retour (onglet visible, premier geste), on le relance : sinon, silence à vie.
  function reprendre() { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reprendre(); });
  window.addEventListener('pointerdown', reprendre);

  const maintenant = () => ctx.currentTime;

  return {
    demarrer, volume, couper,
    carillon() { graphe?.carillon(maintenant()); },
    tic() { graphe?.tic(maintenant()); },
    grondement(intensite = 1) { graphe?.grondement(intensite, maintenant()); },
    souffle(duree = 4) { graphe?.souffle(duree, maintenant()); },
    /** Le chant d'un légendaire (id d'espèce), à la position de l'animal. Renvoie sa durée. */
    chant(id = 'baleine', animal = null) { return graphe ? graphe.chant(id, animal, maintenant()) : 0; },
    /** Une espèce entre en scène (spawner) : chant, grondement, ou rien. */
    arrivee(espece, animal) { graphe?.arrivee(espece, animal, maintenant()); },
    /** Chaque frame : la caméra devient l'auditeur, les animaux proches sonnent. */
    maj(dt, animaux, camera) { if (graphe) graphe.maj(maintenant(), dt, animaux, camera); },
    /** { spatial: 'hrtf' | 'simple' } — la qualité basse prend le modèle simple. */
    regler(options) { if (options.spatial) spatial = options.spatial; graphe?.regler(options); },
    get pret() { return ctx !== null; },
    /** Pour les tests : l'état courant en clair. */
    etat() {
      const l = lecteurs[lecteurActif];
      let niveau = null;
      if (analyseur) {
        const d = new Float32Array(analyseur.fftSize);
        analyseur.getFloatTimeDomainData(d);
        let somme = 0;
        for (const x of d) somme += x * x;
        niveau = Math.sqrt(somme / d.length);
      }
      return {
        contexte: ctx ? ctx.state : 'absent',
        piste: pisteActuelle ? pisteActuelle.titre : null,
        position: l ? l.element.currentTime : 0,
        enPause: l ? l.element.paused : true,
        volume: graphe ? graphe.master.gain.value : null,
        niveau,
        emetteurs: graphe ? graphe.faune.nombre : 0,
        chant: graphe ? graphe.chantEnCours(maintenant()) : false,
      };
    },
  };
}
