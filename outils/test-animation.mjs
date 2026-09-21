#!/usr/bin/env node
/* ============================================
   TEST — la vie du mouvement (animal.js)
   ============================================
   Sur un requin gris forcé : les deux actions (swim, glide) existent, l'état bascule
   par fondu quand on force l'échéance, le tempo dérive, le roulis reste borné.
   Usage : node outils/test-animation.mjs
   ============================================ */
import { piloter, dormir } from './chrome.mjs';

const chrome = await piloter();
const resultats = [];
const verifier = (nom, ok, detail = '') => { resultats.push(ok); console.log(`${ok ? '✓' : '✗'} ${nom}${detail ? ` — ${detail}` : ''}`); };
const LIRE = `(() => { const a = window.__shinka.spawner.animaux.find((x) => x.espece.id === 'requin-recif');
  return a ? { etat: a.etat, nage: a.actions.nage.getEffectiveWeight(), plane: a.actions.plane ? a.actions.plane.getEffectiveWeight() : null,
               tempo: a.mixer.timeScale, roulis: a.roulis, chrono: a.chrono } : null; })()`;
try {
  await chrome.naviguer('http://localhost:8792/?direct&heure=13&forcer=requin-recif&qualite=basse');
  await chrome.attendre(`window.__shinka && window.__shinka.spawner && window.__shinka.spawner.animaux.length > 0`);
  await dormir(1500);
  const e0 = await chrome.evaluer(LIRE);
  verifier('un requin gris avec ses deux actions', e0 && e0.plane !== null, JSON.stringify(e0));
  await chrome.evaluer(`(window.__shinka.spawner.animaux.find((x) => x.espece.id === 'requin-recif').prochainChangement = 0, true)`);
  await dormir(1800);
  const e1 = await chrome.evaluer(LIRE);
  verifier('échéance forcée → il plane (fondu vers glide)', e1.etat === 'plane' && e1.plane > 0.9 && e1.nage < 0.1, JSON.stringify(e1));
  await chrome.evaluer(`(window.__shinka.spawner.animaux.find((x) => x.espece.id === 'requin-recif').prochainChangement = 0, true)`);
  await dormir(1800);
  const e2 = await chrome.evaluer(LIRE);
  verifier('échéance forcée → il nage à nouveau', e2.etat === 'nage' && e2.nage > 0.9 && e2.plane < 0.1, JSON.stringify(e2));
  verifier('le tempo dérive', Math.abs(e2.tempo - e0.tempo) > 1e-4, `${e0.tempo.toFixed(3)} → ${e2.tempo.toFixed(3)}`);
  verifier('le roulis est fini et borné', Number.isFinite(e2.roulis) && Math.abs(e2.roulis) <= 0.35, `roulis ${e2.roulis.toFixed(3)}`);
  const ok = resultats.every(Boolean);
  console.log(ok ? '✓ animation OK' : '✗ ÉCHEC animation');
  if (!ok) process.exitCode = 1;
} finally {
  await chrome.fermer();
}
