#!/usr/bin/env node
/* ============================================
   TEST — l'audio
   ============================================
   Scénario : le bassin en ?direct, un clic (le geste qui autorise le son),
   puis on vérifie : contexte audio « running », un morceau en lecture dont la
   position avance, les sons déclenchables sans erreur, le player visible.
   Usage : node outils/test-audio.mjs <sortie.png>
   ============================================ */
import { piloter, dormir } from './chrome.mjs';

const sortie = process.argv[2] ?? 'test-audio.png';
const chrome = await piloter();
try {
  await chrome.naviguer('http://localhost:8792/?direct&heure=13');
  await dormir(3500);
  // Un vrai clic au centre : c'est lui qui débloque l'audio
  await chrome.envoyer('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 450, button: 'left', clickCount: 1 });
  await chrome.envoyer('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 450, button: 'left', clickCount: 1 });
  await dormir(2500);
  const etat1 = await chrome.evaluer('window.__shinka.audio.etat()');
  console.log('après le clic :', JSON.stringify(etat1));
  await chrome.evaluer('(window.__shinka.audio.carillon(), window.__shinka.audio.grondement(), window.__shinka.audio.tic(), true)');
  await dormir(2000);
  const etat2 = await chrome.evaluer('window.__shinka.audio.etat()');
  console.log('2 s plus tard  :', JSON.stringify(etat2));
  const playerVisible = await chrome.evaluer("!document.getElementById('player').hidden");
  await chrome.evaluer("document.getElementById('player-credits').click()");
  await dormir(400);
  await chrome.capturer(sortie);
  const ok = etat2.contexte === 'running' && !etat2.enPause && etat2.position > etat1.position && playerVisible;
  console.log(ok ? '✓ audio OK' : '✗ ÉCHEC audio');
  if (!ok) process.exitCode = 1;
} finally {
  await chrome.fermer();
}
