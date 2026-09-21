/* ============================================
   PLAYLIST — les morceaux du bassin
   ============================================
   Uniquement des données. Tous les morceaux sont sous licence CC0 1.0
   (domaine public), auto-publiés par leurs auteurs sur archive.org.
   Ajouter un morceau : déposer le fichier dans audio/music/ + une entrée ici.
   Le panneau « crédits » du player est généré à partir de cette liste.
   `sonie` : la sonie intégrée du morceau (EBU R128, en LUFS), mesurée une fois avec
   `node outils/sonie.mjs`. Le lecteur ramène chaque morceau à la même cible (graphe.js,
   SONIE_CIBLE) : sans ça, « Tranquility II » (−8,8) sonnait 19 dB plus fort qu'« Introduction ».
   ============================================ */

export const PLAYLIST = [
  { fichier: 'audio/music/diavatis-introduction.mp3', sonie: -27.5, titre: 'Introduction', artiste: 'Dimitris Diavatis', licence: 'CC0 1.0', source: 'https://archive.org/details/6ShortPianoPieces_415' },
  { fichier: 'audio/music/diavatis-in-the-sky.mp3', sonie: -21.6, titre: 'In The Sky', artiste: 'Dimitris Diavatis', licence: 'CC0 1.0', source: 'https://archive.org/details/6ShortPianoPieces_415' },
  { fichier: 'audio/music/steam-flow-tranquility-ii.mp3', sonie: -8.8, titre: 'Tranquility and Seclusion II', artiste: 'Steam flow', licence: 'CC0 1.0', source: 'https://archive.org/details/GT583' },
  { fichier: 'audio/music/steam-flow-mystery-of-the-cold.mp3', sonie: -17.1, titre: 'Mystery of the Cold', artiste: 'Steam flow', licence: 'CC0 1.0', source: 'https://archive.org/details/GT584' },
  { fichier: 'audio/music/la-luna-the-calling.mp3', sonie: -16.7, titre: 'The Calling', artiste: 'La Luna e Le Stelle', licence: 'CC0 1.0', source: 'https://archive.org/details/AstralMindscapes' },
  { fichier: 'audio/music/la-luna-adagio-in-space.mp3', sonie: -15.4, titre: 'Adagio in Space', artiste: 'La Luna e Le Stelle', licence: 'CC0 1.0', source: 'https://archive.org/details/AstralMindscapes' },
];
