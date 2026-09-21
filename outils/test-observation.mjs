#!/usr/bin/env node
/* ============================================
   TEST — la mécanique d'observation, avec une vraie souris
   ============================================
   Scénario : on ouvre le bassin, on attend qu'un animal soit là, on pose la
   souris dessus et on l'y garde (en la suivant) pendant 3,5 s. Attendu :
   l'anneau se remplit, l'observation est validée (toast + compteur).
   Usage : node outils/test-observation.mjs <sortie.png>
   ============================================ */
import { piloter, dormir } from './chrome.mjs';

const sortie = process.argv[2] ?? 'test-observation.png';
const chrome = await piloter();
try {
  await chrome.naviguer('http://localhost:8792/?direct&heure=13');
  await dormir(4000);

  // Position à l'écran de l'animal le plus proche (calculée DANS la page, avec sa caméra)
  const ecran = `(() => {
    const s = window.__shinka; if (!s.spawner) return null;
    const visibles = s.spawner.animaux.filter(a => !a.observe);
    if (!visibles.length) return null;
    visibles.sort((a, b) => b.objet.position.z - a.objet.position.z);
    const a = visibles[0];
    const v = a.objet.position.clone().project(s.camera);
    return { id: a.espece.id, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  })()`;

  let cible = await chrome.evaluer(ecran);
  if (!cible) throw new Error('aucun animal à observer');
  console.log(`souris sur ${cible.id} à (${cible.x.toFixed(0)}, ${cible.y.toFixed(0)})`);

  const avant = await chrome.evaluer("document.getElementById('hud-collection').textContent");
  // On suit l'animal pendant 3,5 s (il bouge), 10 fois par seconde
  for (let i = 0; i < 35; i++) {
    cible = (await chrome.evaluer(ecran)) ?? cible;
    await chrome.souris(cible.x, cible.y);
    await dormir(100);
    if (i === 20) await chrome.capturer(sortie.replace('.png', '-jauge.png'));   // anneau en cours de remplissage
  }
  await dormir(300);
  await chrome.capturer(sortie);
  const apres = await chrome.evaluer("document.getElementById('hud-collection').textContent");
  const toast = await chrome.evaluer("document.querySelector('.toast .toast-nom')?.textContent ?? null");
  console.log(`compteur : « ${avant} » → « ${apres} » ; toast : ${toast}`);
  if (avant === apres && !toast) { console.log('✗ ÉCHEC : rien n’a été observé'); process.exitCode = 1; }
  else console.log('✓ observation validée');
} finally {
  await chrome.fermer();
}
