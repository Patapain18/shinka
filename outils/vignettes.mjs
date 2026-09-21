#!/usr/bin/env node
/* ============================================
   VIGNETTES — une image par espèce pour le carnet
   ============================================
   Pour chaque espèce du catalogue (ou celles passées en argument), ouvre la
   visionneuse en mode vignette (fond transparent, vue de profil, pose neutre)
   et capture un PNG 512×512 dans models/<id>.png.
   Usage : node outils/vignettes.mjs [id …]
   ============================================ */
import path from 'node:path';
import { piloter, dormir } from './chrome.mjs';
import { ESPECES } from '../js/species.js';

const racine = new URL('..', import.meta.url).pathname;
const ids = process.argv.length > 2 ? process.argv.slice(2) : ESPECES.map((e) => e.id);

const chrome = await piloter({ largeur: 512, hauteur: 512 });
try {
  // Sans ça, la capture aurait un fond blanc opaque même si la page est transparente
  await chrome.envoyer('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const id of ids) {
    await chrome.naviguer(`http://localhost:8792/outils/visionneuse.html?modele=${id}&vue=cote&vignette=1`);
    await dormir(3500);
    await chrome.capturer(path.join(racine, 'models', `${id}.png`));
  }
} finally {
  await chrome.fermer();
}
