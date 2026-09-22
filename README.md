# Shinka 進化

**En ligne : https://patapain18.github.io/shinka/** (casque conseillé).

Un site 3D contemplatif : on est debout devant la vitre d'un grand bassin, et on regarde
passer la vie. Des animaux marins traversent le champ de vision — certains souvent, d'autres
presque jamais. On peut « observer » une espèce (garder le curseur dessus, ou le doigt sur
téléphone) pour l'ajouter à son carnet et lire sa fiche. Le bassin suit l'heure réelle du
visiteur : la nuit, d'autres espèces sortent, et les méduses luisent.

- **Technique** : HTML/CSS/JS sans bundler, [Three.js](https://threejs.org) via import map,
  Web Audio pour tout le son hors musique — généré, sans aucun enregistrement : ambiance d'hydrophone à cinq
  couches, souffles des animaux spatialisés (calés sur leur animation), chant de la baleine et aura du
  requin-baleine, réverbération du bassin ; musique CC0 égalisée en sonie (EBU R128).
- **Les animaux** sont générés par des scripts Python pour Blender (`blender/`), exportés en glTF :
  géométrie par lofts, une peau calculée point par point (couleur, relief, brillance) en numpy, et un mouvement
  écrit comme de la biomécanique (onde de nage sur la ligne médiane, nage et glisse) — voir `DESIGN.md` §7.
- Tout le projet est décrit dans [DESIGN.md](DESIGN.md).

## Publier

Le site est servi par GitHub Pages depuis la branche `main` du dépôt `Patapain18/shinka` : chaque
`git push` met le site à jour en une à deux minutes. Rien à construire, pas de bundler.

## Lancer en local

```bash
python3 serveur.py
```

puis ouvrir `http://localhost:8792` (ou double-cliquer `lancer.command` sur Mac).
Un serveur est nécessaire : les modules ES ne se chargent pas depuis `file://`.

## Paramètres d'URL utiles

`?direct` (sans écran d'entrée) · `?parade` (**pour tester : toutes les espèces défilent à la file, sans
heure ni rareté, baleine comprise, événements toutes les 45-90 s**) · `?heure=23` / `?tempo=600` (horloge) ·
`?forcer=meduse` (faire entrer une espèce) · `?evenement=banc|geant|trouble` · `?qualite=haute|basse` ·
`?camera=x,y,z,cx,cy,cz` (caméra de contrôle du décor, parallaxe figée).

## Le son

Tout ce qui n'est pas la musique est fabriqué en temps réel (`js/son/`) : le lit d'ambiance (houle, flux,
crépitement des crevettes, bulles, chocs lointains), un souffle par coup de queue pour chaque animal proche
(spatialisé à sa position, assombri avec la distance), un chant pour l'arrivée de chaque légendaire, et une
réverbération commune. La musique est ramenée à la même sonie pour chaque morceau et reste sous l'ambiance ;
elle s'efface pendant un chant. Pour ÉCOUTER ou MESURER sans ouvrir le site :

```bash
node outils/rendre-son.mjs mix apercu.wav 60
```

(scènes : `ambiance`, `fixe`, `faune`, `chants`, `musique`, `mix` — sortie .wav + .mp3 + spectrogramme .png + sonie).

## Qualité du rendu

Le site démarre en qualité haute (bloom, vitre) et passe seul en basse si la machine ne suit pas,
pour la visite en cours. Le bouton « qualité » en bas à gauche bascule entre haute et basse ;
ce choix-là est mémorisé.

## Crédits

- Musique : six morceaux CC0 (domaine public), voir [audio/music/CREDITS.md](audio/music/CREDITS.md).
- Ambiance sous-marine, sons des animaux, chants et effets : générés en temps réel (Web Audio), aucun enregistrement.
- Modèles 3D, code, textes : Mathis Soupizon, avec Claude.
