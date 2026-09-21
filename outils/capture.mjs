#!/usr/bin/env node
/* Photographie le site en le laissant vivre le temps demandé, et relaie sa console.
   Usage : node outils/capture.mjs "<url>" <sortie.png> [attente_s=12] [largeur=1440] [hauteur=900] */
import { piloter, dormir } from './chrome.mjs';

const [url, sortie, attente = '12', largeur = '1440', hauteur = '900'] = process.argv.slice(2);
if (!url || !sortie) {
  console.error('Usage : node outils/capture.mjs "<url>" <sortie.png> [attente_s] [largeur] [hauteur]');
  process.exit(1);
}
const chrome = await piloter({ largeur: +largeur, hauteur: +hauteur });
try {
  await chrome.naviguer(url);
  await dormir(+attente * 1000);
  await chrome.capturer(sortie);
} finally {
  await chrome.fermer();
}
