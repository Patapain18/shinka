# Shinka 進化

Un site 3D contemplatif : on est debout devant la vitre d'un grand bassin, et on regarde
passer la vie. Des animaux marins traversent le champ de vision — certains souvent, d'autres
presque jamais. On peut « observer » une espèce (garder le curseur dessus, ou le doigt sur
téléphone) pour l'ajouter à son carnet et lire sa fiche. Le bassin suit l'heure réelle du
visiteur : la nuit, d'autres espèces sortent, et les méduses luisent.

- **Technique** : HTML/CSS/JS sans bundler, [Three.js](https://threejs.org) via import map,
  Web Audio pour l'ambiance et les sons (générés), musique CC0.
- **Les animaux** sont générés par des scripts Python pour Blender (`blender/`), exportés en glTF :
  géométrie par lofts, une peau calculée point par point (couleur, relief, brillance) en numpy, et un mouvement
  écrit comme de la biomécanique (onde de nage sur la ligne médiane, nage et glisse) — voir `DESIGN.md` §7.
- Tout le projet est décrit dans [DESIGN.md](DESIGN.md).

## Lancer en local

```bash
python3 serveur.py
```

puis ouvrir `http://localhost:8792` (ou double-cliquer `lancer.command` sur Mac).
Un serveur est nécessaire : les modules ES ne se chargent pas depuis `file://`.

## Paramètres d'URL utiles

`?direct` (sans écran d'entrée) · `?heure=23` / `?tempo=600` (horloge) · `?forcer=meduse`
(faire entrer une espèce) · `?evenement=banc|geant|trouble` · `?qualite=haute|basse`.

## Qualité du rendu

Le site démarre en qualité haute (bloom, vitre) et passe seul en basse si la machine ne suit pas,
pour la visite en cours. Le bouton « qualité » en bas à gauche bascule entre haute et basse ;
ce choix-là est mémorisé.

## Crédits

- Musique : six morceaux CC0 (domaine public), voir [audio/music/CREDITS.md](audio/music/CREDITS.md).
- Ambiance sous-marine et effets sonores : générés en temps réel (Web Audio).
- Modèles 3D, code, textes : Mathis Soupizon, avec Claude.
