#!/usr/bin/env node
/* ============================================
   TEST — l'observation au doigt (tactile)
   ============================================
   Sur un écran de téléphone émulé : on pose le doigt sur un animal et on le
   suit 3,5 s (touchStart / touchMove). Attendu : validation (compteur + toast).
   Usage : node outils/test-tactile.mjs <sortie.png>
   ============================================ */
import { piloter, dormir } from './chrome.mjs';

const sortie = process.argv[2] ?? 'test-tactile.png';
const chrome = await piloter({ largeur: 390, hauteur: 844 });
try {
  await chrome.envoyer('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await chrome.naviguer('http://localhost:8792/?direct&heure=13&qualite=basse');
  await dormir(4000);
  const ecran = `(() => {
    const s = window.__shinka; if (!s.spawner) return null;
    const v = s.spawner.animaux.filter(a => !a.observe);
    if (!v.length) return null;
    v.sort((a, b) => b.objet.position.z - a.objet.position.z);
    const a = v[0]; const p = a.objet.position.clone().project(s.camera);
    return { id: a.espece.id, x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  })()`;
  let cible = await chrome.evaluer(ecran);
  if (!cible) throw new Error('aucun animal');
  console.log(`doigt sur ${cible.id} à (${cible.x.toFixed(0)}, ${cible.y.toFixed(0)})`);
  const avant = await chrome.evaluer("document.getElementById('hud-collection').textContent");
  await chrome.envoyer('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cible.x, y: cible.y }] });
  for (let i = 0; i < 35; i++) {
    cible = (await chrome.evaluer(ecran)) ?? cible;
    await chrome.envoyer('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cible.x, y: cible.y }] });
    await dormir(100);
    if (i === 15) await chrome.capturer(sortie.replace('.png', '-doigt.png'));
  }
  await chrome.envoyer('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await dormir(300);
  await chrome.capturer(sortie);
  const apres = await chrome.evaluer("document.getElementById('hud-collection').textContent");
  const toast = await chrome.evaluer("document.querySelector('.toast .toast-nom')?.textContent ?? null");
  console.log(`compteur : « ${avant} » → « ${apres} » ; toast : ${toast}`);
  if (avant === apres && !toast) { console.log('✗ ÉCHEC tactile'); process.exitCode = 1; } else console.log('✓ tactile OK');
} finally {
  await chrome.fermer();
}
