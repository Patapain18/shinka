#!/usr/bin/env node
/* ============================================
   TEST — l'audio
   ============================================
   Scénario : le bassin en ?direct, un clic (le geste qui autorise le son),
   puis on vérifie : contexte audio « running », un morceau en lecture dont la
   position avance, les sons déclenchables sans erreur, le player visible, des animaux
   sonores suivis (émetteurs), un chant lancé, et du signal qui sort réellement du master.
   Usage : node outils/test-audio.mjs <sortie.png>
   ============================================ */
import { piloter, dormir } from './chrome.mjs';

const sortie = process.argv[2] ?? 'test-audio.png';
const chrome = await piloter();
try {
  await chrome.naviguer('http://localhost:8792/?direct&heure=13&qualite=basse');
  await chrome.attendre('window.__shinka && window.__shinka.spawner && window.__shinka.spawner.animaux.length > 0');   // le décor compile : on attend un animal
  await dormir(500);
  // Un vrai clic au centre : c'est lui qui débloque l'audio
  await chrome.envoyer('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 450, button: 'left', clickCount: 1 });
  await chrome.envoyer('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 450, button: 'left', clickCount: 1 });
  await dormir(2500);
  const etat1 = await chrome.evaluer('window.__shinka.audio.etat()');
  console.log('après le clic :', JSON.stringify(etat1));
  await chrome.evaluer('(window.__shinka.audio.carillon(), window.__shinka.audio.grondement(), window.__shinka.audio.tic(), true)');
  // Un légendaire entre : son chant part de l'animal le plus proche (n'importe lequel fera l'affaire ici)
  await chrome.evaluer(`(() => { const s = window.__shinka; const a = s.spawner.animaux[0]; s.audio.arrivee(s.especes.find((e) => e.id === 'requin-baleine'), a); return true; })()`);
  await dormir(2000);
  const etat2 = await chrome.evaluer('window.__shinka.audio.etat()');
  console.log('2 s plus tard  :', JSON.stringify(etat2));
  const erreurPage = await chrome.evaluer("document.getElementById('erreur-globale').textContent");
  if (erreurPage) console.log('erreur affichée :', erreurPage);
  const playerVisible = await chrome.evaluer("!document.getElementById('player').hidden");
  await chrome.evaluer("document.getElementById('player-credits').click()");
  await dormir(400);
  await chrome.capturer(sortie);
  // Attendu : contexte actif, morceau qui avance, player visible, des animaux qui sonnent (émetteurs),
  // un chant en cours, et un vrai signal qui sort du master (niveau RMS > 0)
  const ok = etat2.contexte === 'running' && !etat2.enPause && etat2.position > etat1.position && playerVisible
    && etat2.emetteurs > 0 && etat2.chant === true && etat2.niveau > 0.001;
  console.log(ok ? '✓ audio OK' : '✗ ÉCHEC audio');
  if (!ok) process.exitCode = 1;
} finally {
  await chrome.fermer();
}
