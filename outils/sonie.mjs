#!/usr/bin/env node
/* ============================================
   SONIE — mesurer chaque morceau de la playlist
   ============================================
   La sonie intégrée (EBU R128, en LUFS) d'un morceau, c'est « à quel point il sonne
   fort » pour une oreille, tout le morceau confondu — pas sa crête. ffmpeg la mesure ;
   on reporte la valeur dans playlist.js (`sonie`), et le lecteur ramène chaque morceau
   à la même cible. À relancer quand on ajoute un morceau.
   Usage : node outils/sonie.mjs
   ============================================ */
import { spawnSync } from 'node:child_process';
import { PLAYLIST } from '../js/playlist.js';

const racine = new URL('..', import.meta.url);
for (const p of PLAYLIST) {
  const r = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', p.fichier, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8', cwd: racine });
  const m = r.stderr.match(/I:\s+(-?[\d.]+) LUFS/);
  const mesure = m ? parseFloat(m[1]) : null;
  const ecart = mesure !== null && p.sonie !== undefined ? Math.abs(mesure - p.sonie) : null;
  console.log(`${p.fichier.padEnd(46)} mesuré ${mesure ?? '?'} LUFS · playlist ${p.sonie ?? 'non renseignée'}${ecart !== null && ecart > 0.3 ? '  ← à mettre à jour' : ''}`);
}
