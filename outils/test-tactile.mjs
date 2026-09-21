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
  await chrome.attendre(`window.__shinka && window.__shinka.spawner && window.__shinka.spawner.animaux.length > 0`);   // le décor compile ses shaders : on attend qu'un animal soit là
  await dormir(1500);
  // La cible : l'animal non observé le plus proche PARMI CEUX QUI SONT À L'ÉCRAN (un animal
  // qui entre par le bord est hors champ), et on garde le même pendant tout le geste (marque __cible).
  const ecran = `(() => {
    const s = window.__shinka; if (!s.spawner) return null;
    let a = s.spawner.animaux.find((x) => x.__cible && !x.fini);
    if (!a) {
      const v = s.spawner.animaux.filter((x) => !x.observe)
        .map((x) => ({ x, p: x.objet.position.clone().project(s.camera) }))
        .filter((o) => Math.abs(o.p.x) < 0.8 && Math.abs(o.p.y) < 0.8 && o.p.z < 1);
      if (!v.length) return null;
      v.sort((m, n) => n.x.objet.position.z - m.x.objet.position.z);
      a = v[0].x; a.__cible = true;
    }
    const p = a.objet.position.clone().project(s.camera);
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
