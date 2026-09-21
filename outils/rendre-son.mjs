#!/usr/bin/env node
/* ============================================
   RENDRE UN SON — le studio en ligne de commande
   ============================================
   Rend une scène sonore du bassin en .wav (outils/studio.html dans Chrome headless,
   OfflineAudioContext), puis : mesure la sonie (ffmpeg, EBU R128), encode un .mp3
   d'écoute et trace un spectrogramme .png avec les repères de la scène.
   Usage : node outils/rendre-son.mjs <scene> <sortie.wav> [duree=30] [graine=7] [piste=2] [solo]
   Scènes : ambiance | fixe (un requin immobile, pour régler) | faune (la parade) | chants | musique | mix
   ============================================ */
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { piloter } from './chrome.mjs';

const [scene = 'ambiance', sortie = `studio-${scene}.wav`, duree = '30', graine = '7', piste = '2', solo = ''] = process.argv.slice(2);
const chrome = await piloter({ largeur: 800, hauteur: 600 });
try {
  await chrome.naviguer(`http://localhost:8792/outils/studio.html?spatial=${process.env.SPATIAL ?? 'hrtf'}&scene=${scene}&duree=${duree}&graine=${graine}&piste=${piste}${solo ? '&solo' : ''}`);
  await chrome.attendre('window.__pret === true || window.__erreur != null', 300000);   // != null : undefined tant que le module n'a pas démarré
  const erreur = await chrome.evaluer('window.__erreur');
  if (erreur) throw new Error(erreur);
  // Le .wav en base64, par tranches d'1 Mo (multiple de 4 : une tranche = des octets entiers)
  const longueur = await chrome.evaluer('window.__wav.length');
  const morceaux = [];
  const PAS = 1 << 20;
  for (let i = 0; i < longueur; i += PAS) morceaux.push(Buffer.from(await chrome.evaluer(`window.__wav.slice(${i}, ${i + PAS})`), 'base64'));
  await writeFile(sortie, Buffer.concat(morceaux));
  await writeFile(sortie.replace(/\.wav$/, '.json'), await chrome.evaluer('window.__reperes ?? "[]"'));
  console.log(`✓ ${sortie}`);
} finally {
  await chrome.fermer();
}

/* ---------- Mesure (EBU R128), mp3 d'écoute, spectrogramme ---------- */
const ff = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', sortie, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
const lire = (motif) => (ff.stderr.match(motif) ?? [, '?'])[1];
console.log(`sonie intégrée : ${lire(/I:\s+(-?[\d.]+ LUFS)/)} | plage : ${lire(/LRA:\s+([\d.]+ LU)/)} | crête vraie : ${lire(/Peak:\s+(-?[\d.]+ dBFS)/)}`);
spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', sortie, '-codec:a', 'libmp3lame', '-q:a', '3', sortie.replace(/\.wav$/, '.mp3')]);
const py = spawnSync('python3', [new URL('./spectrogramme.py', import.meta.url).pathname, sortie, sortie.replace(/\.wav$/, '.png')], { encoding: 'utf8' });
process.stdout.write(py.stdout);
if (py.status) console.error(py.stderr);
