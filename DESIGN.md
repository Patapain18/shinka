# 🐋 SHINKA (進化) — Cahier de conception

> Projet « Shinka » — dossier `test2/shinka`. Créé le 2026-09-21.
> Ce fichier est la référence du projet : ce qu'on a décidé, pourquoi, et comment on s'y prend.

## 0. Le projet en une phrase

Un site 3D où l'on est debout devant la vitre d'un grand bassin, où le temps passe, où des animaux
marins traversent le champ de vision — certains souvent, d'autres presque jamais — et où l'on peut
« observer » une espèce pour l'ajouter à son carnet. La musique porte l'ambiance.

Le mot-clé : **contemplation**. On ne « joue » pas, on reste.

---

## 1. Décisions prises (2026-09-21)

| Sujet | Décision | Conséquence |
|---|---|---|
| Style visuel | **Réaliste & sombre** (grand bassin, eau profonde, rayons de lumière) | Peu d'animaux à l'écran mais soignés ; le brouillard et la lumière font 70 % du rendu |
| Modèles 3D | ~~Modélisés par Mathis~~ → **générés par des scripts Python Blender écrits par Claude** (`blender/generer_<id>.py`), riggés et animés par le script (changé le 2026-09-21) | Reproductible et versionné dans git. Les conventions du §7 sont appliquées par le script. Vérification dans `outils/visionneuse.html` |
| Musique | **Libre de droits** (CC0 / CC-BY), sélection à faire | Playlist + fondu enchaîné + couche d'ambiance sous-marine. Crédits obligatoires pour le CC-BY |
| Contexte | **Projet perso**, collection en **localStorage** | Zéro backend. Déploiement statique (GitHub Pages) |
| Animation | **Rig + cycle de nage générés par le script Blender** (export GLB) | On joue les clips avec `AnimationMixer`. Convention de nommage stricte (§7) |
| Capture | **Observer** : garder le curseur sur l'animal ~2-3 s, une jauge se remplit | Pas de clic frénétique. Un rare qui passe vite peut échapper |
| Rareté | **4 paliers** + **heure réelle** (jour/nuit du visiteur) + **événements rares** | Raison de revenir à d'autres heures |
| Caméra | **Fixe + parallaxe souris** | Cinématique. Pas de contrôle tactile complexe |
| Stack | HTML + CSS + JS modules ES, **Three.js via import map**, sans bundler | Comme `lusion_clone` et Nihongo. Serveur local Python via `lancer.command` |

---

## 2. L'expérience, pas à pas

1. **Arrivée** — écran noir, titre, barre de chargement (les modèles se chargent). Un bouton **« Entrer »**.
   (Obligatoire de toute façon : les navigateurs refusent de lancer du son sans un clic de l'utilisateur.)
2. **Fondu** — le noir s'ouvre sur la vitre. La musique monte doucement. Bruit sourd de l'eau.
3. **La vitre** — on est face au bassin. Rayons de lumière qui descendent, particules en suspension,
   sol sablonneux qui disparaît dans le bleu. La scène bouge à peine avec la souris.
4. **Les passages** — un banc de sardines file. Une tortue passe lentement. Parfois, une silhouette
   énorme dans le brouillard.
5. **Observer** — on pose le curseur sur un animal : un anneau se remplit autour du curseur.
   Quand il est plein : un léger halo sur l'animal, une note de musique, un toast
   « Nouvelle espèce observée — Raie manta ». Première fois seulement ; les fois suivantes, juste un compteur.
6. **Le carnet** — touche `C` ou bouton discret : un panneau glisse. Grille de fiches.
   Non observé = silhouette noire + « ??? ». Observé = image, nom, rareté, description,
   taille, habitat, anecdote, « première observation le … », « vu 4 fois ».
7. **Le temps** — à 23h, la lumière du bassin est presque éteinte, les méduses luisent,
   le requin-marteau sort. À midi, c'est le récif lumineux. Le site suit l'heure du visiteur.

---

## 3. Architecture technique

```
shinka/
├── index.html          canvas 3D + toute l'UI en HTML par-dessus (entrée, carnet, player, toasts)
├── lancer.command      serveur local (python http.server, port 8792)
├── DESIGN.md           ce fichier
├── css/style.css       UI, carnet, jauge d'observation, player
├── js/
│   ├── main.js         point d'entrée : init, boucle d'animation, orchestration
│   ├── scene.js        renderer, caméra, lumières, brouillard, post-processing
│   ├── water.js        rayons de lumière, particules en suspension, caustiques, sol
│   ├── glass.js        la vitre : reflets subtils, vignettage, grain
│   ├── species.js      LE CATALOGUE : une entrée par espèce (données, pas de logique)
│   ├── animal.js       classe Animal : charge le GLB, joue `swim`, suit sa trajectoire
│   ├── spawner.js      le « metteur en scène » : qui apparaît, quand, selon rareté/heure/événements
│   ├── daytime.js      heure réelle → phase (aube/jour/crépuscule/nuit) → presets de lumière
│   ├── observe.js      raycast souris → animal survolé → jauge → observation validée
│   ├── collection.js   lecture/écriture localStorage
│   ├── audio.js        playlist + fondu enchaîné, ambiance, sons
│   └── ui.js           écran d'entrée, carnet, fiches, toasts, player
├── models/             un .glb par espèce + une image .png (silhouette/vignette) par espèce
├── audio/
│   ├── music/          morceaux CC (mp3/ogg) + CREDITS.md
│   └── sfx/            ambiance sous-marine (boucle), carillon d'observation, grondement « légendaire »
└── textures/           sable, caustiques, particules
```

Raccourci de dev : `http://localhost:8792/?direct` saute l'écran d'entrée (utile pour itérer sur la scène
et pour les captures automatiques en Chrome headless, le navigateur intégré de l'app n'ayant pas de WebGL).

Principe : **`species.js` est de la donnée, tout le reste est du code générique**. Ajouter un animal
= ajouter une entrée dans le catalogue + déposer son `.glb` et son `.png`. Rien d'autre à toucher.

### Repères dans la scène (en mètres)

- Caméra : `(0, 1.6, 0)`, regarde vers `-Z`, angle 55°. C'est un humain debout devant la vitre.
- Vitre : plan à `z = -1.5`. Invisible, sauf ses effets (reflet, vignette).
- Animaux : ils nagent entre `z = -4` (proche, net) et `z = -25` (loin, silhouette dans le brouillard).
- Sol : `y = -3` (sable, roches). Surface : `y = +6` (on ne la voit pas, mais la lumière vient de là).
- Brouillard : commence vers `z = -8`, opaque vers `z = -30`. Couleur = bleu profond, varie avec l'heure.
- Parallaxe : la souris déplace la caméra de ±15 cm et incline le regard de ±2°. Lissé (lerp).

### Trajectoires

Chaque passage est une **courbe (Catmull-Rom)** à 4-6 points : entrée hors champ à gauche (ou droite),
légère ondulation verticale, sortie hors champ de l'autre côté. L'animal regarde le point suivant
(`lookAt` lissé). Vitesse par espèce (m/s) : sardine 1.0, requin 1.4, tortue 0.5, manta 0.9, requin-baleine 0.5.
Les gros passent loin et lentement ; les petits, près et vite.

---

## 4. Les espèces

### v1 — le noyau (8 espèces, une par « type » de rig)

| id | Nom | Rareté | Taille | Heures | Rig Blender | Notes |
|---|---|---|---|---|---|---|
| `sardine` | Sardine (banc) | commun | 0,2 m | jour | colonne 3-4 os | **1 seul modèle**, instancié ×150 en banc (boids simplifié) |
| `chirurgien` | Poisson-chirurgien bleu | commun | 0,3 m | jour | colonne 3-4 os | passe en petit groupe de 3-5 |
| `requin-recif` | Requin gris de récif | peu commun | 1,8 m | toutes | colonne 6-8 os | **PREMIER MODÈLE À FAIRE** (rig le plus simple) |
| `tortue` | Tortue verte | peu commun | 1,2 m | jour | 4 nageoires + cou | lente, majestueuse |
| `meduse` | Méduse lune | peu commun (commun la nuit) | 0,4 m | toutes, luit la nuit | shape keys (pulsation) | matériau translucide + émissif la nuit |
| `manta` | Raie manta | rare | 5 m (envergure) | jour | 2 chaînes d'os (ailes) | passe près, remplit l'écran |
| `marteau` | Requin-marteau | rare | 3,5 m | crépuscule + nuit | colonne 6-8 os | |
| `requin-baleine` | Requin-baleine | légendaire | 10 m | toutes | colonne 8-10 os | très lent, très loin, puis très près |

### v2 — candidats (quand la v1 tourne)

Poisson-clown (commun, banc de 3), mérou (peu commun, immobile près du sol), barracuda (peu commun),
poisson-lune / Mola mola (rare, bizarre et lent), raie pastenague (peu commun, rase le sol),
poulpe (rare, tentacules = rig lourd), baudroie abyssale (rare, **nuit seulement**, lanterne émissive),
calmar géant (légendaire, **nuit seulement**), dauphin (rare, rapide), baleine à bosse (événement, silhouette lointaine).

### Ce que contient une entrée du catalogue (`species.js`)

```js
{
  id: 'requin-recif',
  nom: 'Requin gris de récif',
  latin: 'Carcharhinus amblyrhynchos',
  rarete: 'peu-commun',            // 'commun' | 'peu-commun' | 'rare' | 'legendaire'
  heures: ['aube','jour','crepuscule','nuit'],
  taille: 1.8,                     // mètres, pour la fiche
  vitesse: 1.4,                    // m/s
  profondeur: [-1.5, 2],           // plage de y où il nage
  distance: [-6, -14],             // plage de z (proche → loin)
  groupe: 1,                       // nombre d'individus par passage (150 pour le banc)
  modele: 'models/requin-recif.glb',
  image: 'models/requin-recif.png',
  echelle: 1,                      // correctif si le GLB n'est pas à l'échelle
  description: '…3 phrases…',
  habitat: 'Récifs coralliens de l’Indo-Pacifique',
  anecdote: '…une phrase surprenante…',
}
```

---

## 5. Rareté, heure réelle, événements

### Paliers

| Palier | Poids de tirage | Couleur (carnet) | Jauge d'observation |
|---|---|---|---|
| commun | 60 | gris-bleu | 2,0 s |
| peu commun | 25 | vert d'eau | 2,5 s |
| rare | 12 | violet | 3,0 s |
| légendaire | 3 | or | 3,5 s |

### Le metteur en scène (`spawner.js`)

```
toutes les ~8 s (± hasard) :
  si trop d'animaux à l'écran (max 12, moins si le PC rame)  → on attend
  candidats = espèces actives à cette heure ET pas en « repos » (cooldown 2 min après un passage)
  si aucun rare/légendaire depuis plus de 6 min                → tirage forcé parmi rares/légendaires (« pitié »)
  sinon                                                        → tirage pondéré selon les poids ci-dessus
  on tire une trajectoire adaptée à l'espèce (côté d'entrée, profondeur, distance)
```

Le système de « pitié » évite qu'un visiteur reste 20 minutes sans rien voir de spécial.
Espérance : un légendaire toutes les ~4-5 min en moyenne, jamais plus de 6 min sans un rare.

### Heure réelle (`daytime.js`)

| Phase | Heures | Lumière | Espèces |
|---|---|---|---|
| aube | 6h–8h | bleu pâle, rayons rasants | transition |
| jour | 8h–18h | rayons forts, caustiques vives | récif : sardines, chirurgiens, tortue, manta |
| crépuscule | 18h–21h | orangé → bleu sombre | le marteau sort |
| nuit | 21h–6h | quasi noir, faible lueur, méduses émissives | marteau, méduses, (v2 : baudroie, calmar) |

Les presets (intensité/couleur du soleil, couleur du brouillard, intensité des rayons) sont
**interpolés minute par minute**, pas de bascule brutale. Une variable de debug permettra de
forcer une heure pour tester sans attendre minuit.

### Événements rares (toutes les 12-25 min, tirage au hasard)

- **Le banc** — 300 sardines envahissent tout l'écran pendant 40 s, tourbillonnent, disparaissent.
- **Le géant** — une silhouette de baleine passe très loin, très lentement, avec un son grave. Observable = légendaire spécial.
- **Trouble** — 30 s d'eau chargée : brouillard ↑, particules ↑, lumière qui vacille. Pure ambiance, rien à collecter.
- *(idée v2)* **Le plongeur** — la nuit, une lampe torche traverse le bassin.

---

## 6. Observation & collection

- Un `Raycaster` part de la souris. Chaque animal a une **hitbox invisible** un peu plus grande
  que lui (sphère englobante ×1,3) pour être indulgent.
- Tant que le curseur reste sur le même animal, un **anneau autour du curseur** se remplit
  (durée selon le palier). Si le curseur sort : la jauge se vide en 0,5 s (pas d'un coup — indulgence).
- Jauge pleine → `collection.observe(id)` :
  - première fois : halo sur l'animal, carillon, toast « Nouvelle espèce observée », fiche débloquée
  - fois suivantes : compteur +1, petit son discret
- Curseur personnalisé (réticule fin) qui s'agrandit légèrement au survol d'un animal.

### Structure localStorage (clé `shinka.v1`)

```json
{
  "version": 1,
  "observations": {
    "requin-recif": { "premiere": "2026-09-21T14:03:00Z", "compte": 3 },
    "manta":        { "premiere": "2026-09-21T14:41:00Z", "compte": 1 }
  },
  "reglages": { "volume": 0.6, "coupe": false }
}
```

---

## 7. Pipeline Blender → site

> Depuis le 2026-09-21 les modèles sont **générés par des scripts** (`blender/generer_<id>.py`, lancés avec
> `Blender --background --factory-startup --python …`). Les conventions ci-dessous restent la règle : le script
> les applique, et elles servent aussi si un jour un modèle vient d'ailleurs (asset CC0, modèle fait main).

### 7.0 Comment on fabrique un animal (état au 2026-09-21)

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_requin_recif.py
```

- `blender/commun.py` — la boîte à outils : `corps_fusiforme` (corps par anneaux), `nageoire` (plaque fine
  avec *crease* sur le contour), `sphere` (yeux), `colorer_ventre_dos` (couleurs par sommet), `materiau_peau`,
  `squelette_colonne`, `peser_colonne` (poids calculés à la main), `animer_nage` (action `swim`),
  `exporter_glb`, `inspecter_glb` (relit le fichier et résume : triangles, étendue, os, animations).
- `blender/generer_<id>.py` — la recette d'UNE espèce : profil du corps, polygones des nageoires, os, amplitudes.
- `outils/visionneuse.html?modele=<id>&vue=cote|face|dessus|trois-quarts&ambiance=atelier|bassin` —
  contrôle visuel (grille 1 m, axes : le museau doit pointer vers le bleu = +Z), animation jouée, infos à l'écran.
- Leçon : **sans crease, la subdivision de surface fond les nageoires en boudins**. `nageoire()` plie le contour.
- Fait : `requin-recif` (253 Ko, 7 292 triangles, 5 os, `swim` 2 s).

### 7.1 Unités et échelle
- **1 unité Blender = 1 mètre.** Modélise à la vraie taille (requin 1,8 m, sardine 0,2 m).
  `Scene Properties → Units → Metric, Unit Scale 1.0`.
- Avant de rigger : `Ctrl+A → All Transforms` sur le mesh. L'armature doit avoir une échelle de **1**
  (une armature à échelle ≠ 1 est LA source classique de bugs glTF).

### 7.2 Orientation
- La **tête pointe vers −Y** dans Blender, le **dos vers +Z**.
  Autrement dit : en **vue de face** (pavé numérique `1`) l'animal te regarde ;
  en **vue de droite** (pavé `3`) il nage vers la **gauche** de l'écran.
- L'exporteur glTF convertit vers Y-up : la tête arrivera vers **+Z** dans Three.js, ce qui est
  exactement ce que `lookAt()` attend. (Si tu te trompes, c'est un correctif d'une ligne dans
  le catalogue — pas de panique.)
- **Origine** du mesh au centre du corps (`Object → Set Origin → Origin to Geometry`).

### 7.3 Rig et animation
- **Une armature** par animal, un os racine à l'origine, les autres en chaîne (colonne : 6-8 os
  pour un requin, ça suffit). Parentage avec **Automatic Weights**, puis retouche des poids si besoin.
- Actions à créer (noms **exacts, en minuscules**) :
  - `swim` — **obligatoire**. Cycle de nage bouclé : la dernière frame = la première. 24 ou 30 fps, 1 à 3 s.
  - `swim_fast` — optionnel (fuite, accélération).
  - `idle` — optionnel (sur place : tortue qui flotte, mérou posé).
- **Piège n°1** : l'exporteur n'exporte que les actions qu'il « voit ». Dans le *Dope Sheet → Action Editor*,
  pour chaque action : bouton **Push Down** (ou *Stash*) pour l'envoyer dans le NLA. Sinon elle disparaît à l'export.
- Les contraintes (IK, etc.) sont *cuites* (baked) à l'export : tu peux les utiliser.

### 7.4 Matériaux
- Uniquement **Principled BSDF**. Textures via nœuds *Image Texture* (base color, roughness, normal via *Normal Map*).
- Tout nœud procédural (Noise, Voronoi, ColorRamp…) **n'est pas exporté** → le cuire (bake) en image.
- Textures : 1024² pour les petits, 2048² max pour les gros. Un seul matériau par animal si possible.
- Méduse : matériau `Alpha Blend` + `Emission` (on animera l'émission la nuit depuis le code).

### 7.5 Budget
- Petits poissons : 500-1 500 triangles (ils seront instanciés par centaines).
- Animaux moyens : 3 000-8 000. Gros (manta, requin-baleine) : 10 000-20 000 max.
- Fichier : < 2 Mo par animal, < 5 Mo pour le requin-baleine.

### 7.6 Export
`File → Export → glTF 2.0` :
- Format : **glTF Binary (.glb)**
- Include → Limit to : **Selected Objects** (sélectionner mesh + armature)
- Transform : **+Y Up** ✓ (par défaut)
- Data → Mesh : Apply Modifiers ✓, UVs ✓, Normals ✓
- Data → Material : Export ✓, Images : Automatic
- Data → Compression (Draco) : **désactivé** pour l'instant (on l'ajoutera si les fichiers sont trop lourds)
- Animation : mode **Actions**, Bake All Objects Animations ✓, Optimize ✓
- Nom du fichier = `id` du catalogue : `models/requin-recif.glb`

### 7.7 Vérifier avant de m'envoyer
Glisse le `.glb` sur **https://gltf-viewer.donmccurdy.com/** : il doit s'afficher à la bonne taille,
et la liste des animations à droite doit contenir `swim` et jouer en boucle. Si c'est bon là, c'est bon dans le site.

### 7.8 L'image du carnet
Un rendu Blender de profil, fond transparent, **`models/<id>.png` en 512×512**.
La même image sert pour la silhouette (« ??? ») via un filtre CSS, et pour la fiche débloquée.

---

## 8. Ambiance : lumière, eau, vitre

- **Lumière** : une `DirectionalLight` (le soleil filtré par la surface) + une `HemisphereLight`
  bleu/noir très faible + un `fog` exponentiel. C'est le brouillard qui fait la profondeur.
- **Rayons de lumière** : quelques plans transparents verticaux, texture dégradée additive,
  légèrement inclinés, qui oscillent lentement. Bon marché, très efficace.
- **Caustiques** : texture animée projetée sur le sol et le dos des animaux proches (une `light map` qui défile).
- **Particules** : 2 000 points en suspension (« neige marine ») qui dérivent, + bulles occasionnelles.
- **Vitre** : vignette, très léger reflet spéculaire en haut, distorsion minime aux bords,
  grain de film (comme `lusion_clone`).
- **Post-processing** : `EffectComposer` → `RenderPass` → `UnrealBloomPass` (faible, 0,3) → passe custom (vignette, grain).
- **Leçon apprise (étape 2)** : dans un `ShaderMaterial` avec `fog: true`, il FAUT les uniforms `UniformsLib.fog` (sinon Three plante au rendu),
  et l'ordre en fin de fragment est `tonemapping → colorspace → fog` (Three fournit `fogColor` déjà en sRGB).
- **Perf** : `pixelRatio` ≤ 1,5 ; max 12 animaux ; bancs en `InstancedMesh` ; modèles chargés à la
  première apparition puis mis en cache ; option « qualité » (bloom off) si ça rame.

---

## 9. Audio

- Le `AudioContext` est créé au clic sur « Entrer » (règle des navigateurs).
- **Musique** : 4-6 morceaux CC0/CC-BY (ambient, lo-fi, piano lent). Deux lecteurs en alternance
  avec `GainNode` pour un fondu enchaîné de 4 s. Ordre aléatoire sans répétition immédiate.
- **Ambiance** : une boucle « sous l'eau » (grondement sourd + bulles lointaines) à bas volume, en permanence.
- **Sons** : carillon (nouvelle espèce), tick discret (déjà vue), grondement grave (un légendaire entre en scène),
  quelques bulles aléatoires.
- **Player** discret en bas : ♪ titre — artiste, volume, mute, bouton crédits (obligatoire pour le CC-BY).
- Pistes de recherche : Pixabay Music, Free Music Archive (filtre CC), ccMixter, Incompetech (Kevin MacLeod, CC-BY).
- *(idée v2)* filtre passe-bas sur la musique pour qu'elle sonne « à travers l'eau », qui s'ouvre quand on observe.

---

## 10. Feuille de route

Chaque étape donne quelque chose de visible et qui marche. On n'attaque pas la suivante avant.

| # | Étape | Résultat visible |
|---|---|---|
| 1 | ✅ 2026-09-21 — Squelette : `index.html`, écran d'entrée, scène bleue avec brouillard + lumière, boucle, `lancer.command` | Un bassin vide, mais déjà « profond » |
| 2 | ✅ 2026-09-21 — L'eau : rayons, particules, caustiques, sol (`water.js`) | Beau sans aucun animal |
| 3 | ✅ 2026-09-21 — Les animaux : catalogue (`species.js`), chargeur + clonage de squelette (`modeles.js`), classe `Animal` (courbe Catmull-Rom + `AnimationMixer`), spawner de base, barre de chargement | Ça vit |
| 4 | Catalogue + paliers de rareté + heure réelle (lumière qui suit l'heure) | Nuit ≠ jour |
| 5 | Observation : raycast, jauge, halo, toasts ; collection localStorage | Le cœur du site |
| 6 | Carnet : panneau, grille, fiches, silhouettes | On peut « collectionner » |
| 7 | Audio : playlist, fondu, ambiance, sons, player, crédits | L'ambiance est là |
| 8 | ~~Premier vrai modèle~~ → fusionné dans l'étape 3 : le requin généré (`models/requin-recif.glb`) est disponible dès maintenant, plus besoin de placeholders | ✅ pipeline validé le 2026-09-21 |
| 9 | Événements rares (banc, géant, trouble) | Les surprises |
| 10 | Polish : post-processing, vitre, perf, version tablette/mobile minimale, déploiement GitHub Pages | En ligne |

Le premier `.glb` existe déjà : l'étape 3 charge directement le requin (GLTFLoader + AnimationMixer).

---

## 11. Questions encore ouvertes

- ~~Nom~~ → **Shinka** (décidé le 2026-09-21).
- ~~Niveau Blender~~ → Mathis ne modélise pas : les animaux sont générés par script (`blender/`). Premier : requin gris de récif.
- ~~Liste d'espèces~~ → v1 validée, premier modèle = requin gris de récif.
- ~~Git~~ → dépôt initialisé le 2026-09-21. Déploiement GitHub Pages (`Patapain18`) à l'étape 10.
- **Rythme** : pas de deadline (perso). Sessions courtes, une étape à la fois.
