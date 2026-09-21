#!/usr/bin/env node
/* ============================================
   TEST — le carnet
   ============================================
   Scénario : le bassin en mode démo (une observation toutes les 2,5 s), on
   appuie sur C, on capture la grille, on ouvre la fiche d'une espèce connue.
   Usage : node outils/test-carnet.mjs <sortie.png>   (écrit aussi <sortie>-fiche.png)
   ============================================ */
import { piloter, dormir } from './chrome.mjs';

const sortie = process.argv[2] ?? 'test-carnet.png';
const chrome = await piloter();
try {
  await chrome.naviguer('http://localhost:8792/?direct&heure=13&demo=observer');
  await dormir(5500);

  // La touche C, comme un visiteur
  await chrome.envoyer('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', text: 'c' });
  await chrome.envoyer('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC' });
  await dormir(900);
  const ouvert = await chrome.evaluer("document.getElementById('carnet').classList.contains('ouvert')");
  const cartes = await chrome.evaluer("document.querySelectorAll('.carte').length");
  const connues = await chrome.evaluer("document.querySelectorAll('.carte:not(.inconnue)').length");
  console.log(`carnet ouvert : ${ouvert} · cartes : ${cartes} · connues : ${connues}`);
  await chrome.capturer(sortie);

  await chrome.evaluer("document.querySelector('.carte:not(.inconnue)')?.click()");
  await dormir(500);
  const nom = await chrome.evaluer("document.querySelector('.fiche-nom')?.textContent ?? null");
  console.log(`fiche ouverte : ${nom}`);
  await chrome.capturer(sortie.replace('.png', '-fiche.png'));

  if (!ouvert || !cartes || !nom) { console.log('✗ ÉCHEC'); process.exitCode = 1; }
  else console.log('✓ carnet OK');
} finally {
  await chrome.fermer();
}
