#!/usr/bin/env node
/* ============================================
   TEST — robustesse
   ============================================
   Trois vérifications sur la même page (?direct, 13 h) :
   1) mémoire GPU — 6 groupes de chirurgiens entrent au milieu de la vitre, sont
      dessinés, puis filent hors champ à toute vitesse. Une fois partis, le nombre
      de textures GPU moins le nombre d'animaux dessinés doit être revenu à sa valeur
      d'avant : chaque animal a sa texture d'os, elle doit partir avec lui.
   2) contexte WebGL — on le perd exprès (extension WEBGL_lose_context) : le bandeau
      doit s'afficher ; on le restaure : le bandeau disparaît et le rendu repart.
   3) qualité — clic sur le bouton du HUD : niveau basculé, choix mémorisé ; re-clic :
      l'autre niveau. Le mode auto, lui, ne mémorise jamais sa propre décision.
   Usage : node outils/test-robustesse.mjs <sortie.png>
   ============================================ */
import { piloter, dormir } from './chrome.mjs';

const sortie = process.argv[2] ?? 'test-robustesse.png';
const chrome = await piloter();
const resultats = [];
const verifier = (nom, ok, detail = '') => { resultats.push(ok); console.log(`${ok ? '✓' : '✗'} ${nom}${detail ? ` — ${detail}` : ''}`); };

// Textures GPU vivantes, et animaux dont la texture d'os existe (= dessinés au moins une fois)
const SONDE = `(() => {
  const s = window.__shinka; let dessines = 0;
  s.scene.traverse((o) => { if (o.isSkinnedMesh && o.skeleton.boneTexture) dessines++; });
  return { textures: s.renderer.info.memory.textures, dessines, animaux: s.spawner.animaux.length };
})()`;

try {
  await chrome.naviguer('http://localhost:8792/?direct&heure=13');
  await chrome.attendre('window.__shinka && window.__shinka.spawner && window.__shinka.spawner.animaux.length > 0');   // le décor compile : on attend un animal
  await dormir(1000);

  /* ---------- 1) mémoire ---------- */
  // Échauffement : chaque espèce entre une fois, pour que ses textures (couleur, relief, brillance)
  // soient déjà sur le GPU. Sinon, une espèce qui entrerait PENDANT la mesure fausserait le compte :
  // ses cartes s'ajoutent aux textures sans être des textures d'os.
  await chrome.evaluer(`(() => { const s = window.__shinka; for (const e of s.especes) s.spawner.faireEntrer(e, 0.5); return true; })()`);
  await dormir(1500);
  await chrome.evaluer(`(window.__shinka.spawner.animaux.forEach((a) => { a.vitesse = 15; }), true)`);
  await dormir(4000);
  const avant = await chrome.evaluer(SONDE);
  await chrome.evaluer(`(() => { const s = window.__shinka; const e = s.especes.find((x) => x.id === 'chirurgien');
    for (let i = 0; i < 6; i++) s.spawner.faireEntrer(e, 0.5); return s.spawner.animaux.length; })()`);
  await dormir(1200);                                  // quelques frames : leurs textures d'os sont créées
  const pendant = await chrome.evaluer(SONDE);
  await chrome.evaluer(`(window.__shinka.spawner.animaux.forEach((a) => { a.vitesse = 15; }), true)`);
  await dormir(4000);                                  // à 15 m/s, tout le monde est sorti
  const apres = await chrome.evaluer(SONDE);
  console.log('mémoire :', JSON.stringify({ avant, pendant, apres }));
  verifier('les textures d’os montent avec les animaux', pendant.textures - avant.textures >= 20,
    `${pendant.textures - avant.textures} textures de plus pour ${pendant.dessines - avant.dessines} animaux dessinés`);
  verifier('et redescendent quand ils partent', apres.textures - apres.dessines === avant.textures - avant.dessines,
    `hors animaux : ${avant.textures - avant.dessines} avant, ${apres.textures - apres.dessines} après`);

  /* ---------- 2) contexte ---------- */
  await chrome.evaluer(`(window.__ext = window.__shinka.renderer.getContext().getExtension('WEBGL_lose_context'), window.__ext.loseContext(), true)`);
  await dormir(800);
  const bandeauPerdu = await chrome.evaluer(`!document.getElementById('contexte-perdu').hidden`);
  verifier('contexte perdu → bandeau affiché', bandeauPerdu);
  await chrome.capturer(sortie.replace(/\.png$/, '-perdu.png'));
  await chrome.evaluer(`(window.__ext.restoreContext(), true)`);
  await dormir(3000);
  const bandeauRevenu = await chrome.evaluer(`document.getElementById('contexte-perdu').hidden`);
  const appels = await chrome.evaluer(`window.__shinka.renderer.info.render.calls`);
  verifier('contexte restauré → bandeau caché, rendu reparti', bandeauRevenu && appels > 0, `${appels} appels de dessin sur la dernière frame`);

  /* ---------- 3) qualité ---------- */
  const lire = () => chrome.evaluer(`({ niveau: window.__shinka.qualite.niveau, auto: window.__shinka.qualite.auto,
    memorise: JSON.parse(localStorage.getItem('shinka.v1') || '{}').reglages?.qualite ?? null,
    bouton: document.getElementById('hud-qualite').textContent })`);
  const q0 = await lire();
  verifier('au départ, l’auto ne mémorise rien', q0.memorise === null || q0.memorise === 'auto', JSON.stringify(q0));
  await chrome.evaluer(`(document.getElementById('hud-qualite').click(), true)`);
  await dormir(400);
  const q1 = await lire();
  await chrome.evaluer(`(document.getElementById('hud-qualite').click(), true)`);
  await dormir(400);
  const q2 = await lire();
  verifier('clic → niveau basculé et mémorisé', q1.niveau !== q0.niveau && q1.memorise === q1.niveau && !q1.auto, JSON.stringify(q1));
  verifier('re-clic → l’autre niveau, mémorisé', q2.niveau === q0.niveau && q2.memorise === q2.niveau, JSON.stringify(q2));
  await chrome.capturer(sortie);

  const ok = resultats.every(Boolean);
  console.log(ok ? '✓ robustesse OK' : '✗ ÉCHEC robustesse');
  if (!ok) process.exitCode = 1;
} finally {
  await chrome.fermer();
}
