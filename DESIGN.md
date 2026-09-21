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
│   ├── audio.js        côté page : player, musique (deux lecteurs, sonie égalisée), relais vers le graphe
│   ├── son/            tout le son FABRIQUÉ (aucun fichier) — voir §9
│   │   ├── dsp.js      bruits, crépitement, réponse impulsionnelle, enveloppes, bulles, trémolo
│   │   ├── ambiance.js le lit d'hydrophone : houle, flux, crevettes, bulles, lointain
│   │   ├── faune.js    un souffle par coup de queue, spatialisé, budget de voix
│   │   ├── chants.js   la baleine (unités → phrase) et l'aura du requin-baleine
│   │   └── graphe.js   la table de mixage : bus, limiteur, réverbération, chants, sons d'interface
│   └── ui.js           écran d'entrée, carnet, fiches, toasts, player
├── models/             un .glb par espèce + une image .png (silhouette/vignette) par espèce
├── audio/
│   └── music/          morceaux CC0 (mp3) + CREDITS.md — le seul son enregistré du site
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
| `sardine` | Sardine (banc) | commun | 16 cm | aube-jour-crépuscule | ✅ SANS squelette : nage en vertex shader, `InstancedMesh` ×150 (`banc.js`) | rotation autour du centre du banc, rayon et hauteur qui respirent |
| `chirurgien` | Poisson-chirurgien bleu | commun | 0,3 m | aube-jour | ✅ colonne 4 os | ×4 |
| `requin-recif` | Requin gris de récif | peu commun | 1,8 m | toutes | ✅ colonne 5 os | premier modèle (2026-09-21) |
| `tortue` | Tortue verte | peu commun | 1,2 m | aube-jour-crépuscule | ✅ 4 nageoires + cou + queue (`animer_os`) | lente, majestueuse |
| `meduse` | Méduse lune | peu commun | 0,4 m | toutes, luit la nuit | ✅ échelle d'os (pulsation) + bras | translucide + émissif la nuit, ×2 |
| `manta` | Raie manta | rare | 5 m (envergure) | aube-jour-crépuscule | ✅ ailes par loft `aile()`, 2 os par aile (battement déphasé) | passe près, remplit l'écran |
| `requin-marteau` | Requin-marteau halicorne | rare | 3,2 m | crépuscule + nuit | ✅ colonne 5 os | tête en T |
| `requin-baleine` | Requin-baleine | légendaire | 10 m | toutes | ✅ colonne 5 os, cycle 6 s, damier de points par sommet | très lent, 8 à 18 m |

### v2 — candidats (quand la v1 tourne)

✅ `baleine` (baleine à bosse, 14 m, légendaire, **uniquement par l'événement « géant »**, queue qui bat de haut en bas).
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
  candidats = espèces actives à cette heure ET pas en « repos » (repos selon la rareté : commun 20 s, peu commun 45 s, rare 150 s, légendaire 420 s)
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
**interpolés en continu** entre 8 repères sur 24 h (`daytime.js`), pas de bascule brutale.
Debug : `?heure=23` fige l'heure, `?tempo=600` fait défiler une journée en 2 min 24.

### Événements rares (toutes les 12-25 min, tirage au hasard)

- **Le banc** — ✅ 300 sardines en tourbillon sur une boucle fermée devant la vitre pendant 36 s, puis elles s'en vont (souffle audio).
- **Le géant** — ✅ la baleine à bosse passe à 18-22 m (silhouette), 0,8 m/s, et chante deux fois. Observable = légendaire (`evenement: true`, jamais tirée au sort).
- **Trouble** — ✅ 30 s : `horloge.modulation` (brume ×1,8, soleil −35 % + vacillement, rayons −50 %), neige ×2,5. Pure ambiance.
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

### 7.0 Comment on fabrique un animal (v2, 2026-09-21)

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_requin_recif.py
```

Trois fichiers partagés, un script par espèce :
- `blender/commun.py` — la géométrie et le rig : `corps()` (loft le long de Y : clés `(y, demi-largeur, haut, bas,
  centre_z)`, sections super-elliptiques, interpolation Catmull-Rom, anneaux resserrés aux bouts), `nageoire_loft()`
  (une nageoire ÉPAISSE : loft de sections `(s, attaque, fuite, épaisseur)` le long de l'envergure, profil NACA,
  bout pointu ou tronqué), `sections_voile()` (dorsale/anale longue qui épouse le dos), `revolution()` (cloche),
  `nageoire()` (plaque mince, pour les tentacules), `sphere()`/`ellipsoide()`, `marquer()` (os) et `marquer_zone()`
  (peau), `squelette()`, `peser_par_parties()` (+ `colonne=` pour le corps), `animer_os()` (forme d'onde au choix),
  `exporter_glb()` (tangentes, images), `inspecter_glb()`.
- `blender/peau.py` — la PEAU, calculée point par point sur une image : `texturer(obj, nom, resolution, couleur,
  hauteur, rugosite, alpha, emission)`. Dépliage UV automatique (Smart UV Project), rasterisation UV → position 3D,
  normale, repère tangent et coordonnées « corps » (`u` le long / `v` autour, ou envergure / corde d'une nageoire),
  dilatation (jump flooding) pour les coutures, puis les fonctions de l'espèce, vectorisées numpy, décident de chaque
  texel : couleur (JPEG sRGB), relief en mètres → carte de normales tangentes (PNG), rugosité + métal (ORM JPEG),
  alpha et émission si besoin. Bruit `bruit()`/`fbm()`, Voronoï `cellules()`, `lisser()`, `melanger()`, `trait()`,
  `angle_vers()` (yeux). Résolutions : couleur 2048² (gros animaux) ou 1024², relief ÷2, ORM ÷4.
- `blender/requins.py` — la grammaire de peau commune aux trois requins (`peau_requin(cfg)` : contre-ombre,
  cinq fentes, bouche ventrale, narines, yeux, pointes, bordure de caudale, `motif`/`relief_extra` optionnels).
- `blender/generer_<id>.py` — la recette d'UNE espèce : clés du corps, sections des nageoires, fonctions de peau,
  os, amplitudes. L'en-tête de chaque script dit ce qui fait l'espèce, et où ça se voit dans le code.
- Contrôle : `outils/visionneuse.html?modele=<id>&vue=cote|face|dessus|dessous|trois-quarts[-dessous]&cible=x,y,z&zoom=3`,
  `outils/planche.html` (les neuf vignettes), `blender/verifier_relief.py` (le test de signe des cartes de normales).

**Leçons Blender / Three (v2)** :
1. `recalc_face_normals` se trompe sur les formes MINCES (une nageoire à bord de fuite effilé) : les primitives
   construisent leurs faces vers l'extérieur et les marquent (`_orienter`) ; on ne recalcule que le reste.
2. Dans `nageoire_loft`, `fuite` doit toujours dépasser `attaque` (sinon la section est retournée) : garde-fou.
3. Carte de normales : avec les tangentes exportées par Blender, Three attend les composantes X et Y INVERSÉES par
   rapport à la formule classique — vérifié par `verifier_relief.py` (une bosse géométrique et une bosse « en carte »
   doivent s'éclairer pareil). Ne pas « corriger » sans refaire ce test.
4. La rasterisation se fait sur le maillage ÉVALUÉ (subdivision comprise) : ce sont les UV que l'exporteur écrit.
5. Les zones de peau sont des attributs flottants (`zone_<nom>`, `u`, `v`) posés sur les sommets à la construction :
   la subdivision les interpole, la texture les lit. Un matériau ne s'exporte qu'avec des nœuds Image Texture.
6. Les copies de matériaux ne coûtent rien sur le GPU (voir §8 robustesse) ; les images, si : 2048² seulement pour
   les gros animaux. Total des neuf `.glb` : ≈ 15 Mo (contre 2,5 Mo en v1).

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

### 7.3 Rig et animation (v2, 2026-09-21)

- **Une armature** par animal, construite par le script (`squelette()` : os 3D, `squelette_colonne()` : os sur Y).
  Colonne de 7 os pour un requin (tête, racine, deux de tronc, deux de queue, caudale) + un os par pectorale ;
  poids par `peser_par_parties()` (parties étiquetées) avec `colonne=` pour le corps : `poids_chaine()` donne
  chaque sommet à l'os qui contient son y, avec un fondu smoothstep autour des charnières — deux os au plus par
  sommet, la peau plie net (plus d'effet caoutchouc).
- **Le mouvement est de la biomécanique** (`blender/mouvement.py`), plus des chiffres par os :
  - `Mouvement(arm, periode, cycles)` : un clip de `cycles` battements (la période est arrondie au 1/24 s
    pour que le clip fasse un nombre entier d'images — sinon la boucle saute) ;
  - `.onde(chaine, longueur, s_museau, A_tete, A_queue, exposant, longueur_onde, mode, retard_caudal)` : la
    ligne médiane ondule, h(s,t) = L·A(s)·sin(2π(s/λ − t/T) − δ(s)), A(s) = enveloppe (fractions de la longueur,
    exposant 2 = carangiforme : le tiers avant bouge à peine), λ en longueurs de corps, δ = retard de la caudale
    souple ; chaque os prend la rotation relative qui fait suivre la médiane à la chaîne (lacet Z pour un
    poisson, tangage X pour un cétacé), la racine glisse pour rester sur la médiane ;
  - `.modulation(profondeur)` : l'amplitude varie lentement sur le clip — deux battements ne sont jamais
    identiques (0,12 pour un requin, 0,30 pour la baleine : coups forts puis faibles) ;
  - `.secondaire(os, canal, axe, amplitude, cycles_par_clip, phase, base, forme, enveloppe)` : nageoires,
    tête, roulis, bobs ; formes `sinus`, `asymetrique(k)` (coup rapide, retour lent), `impulsion(p)` (pic bref,
    long plateau : la méduse) ; `rafale(centre, largeur)` = enveloppe « bouffée » (les coups de queue du chirurgien) ;
  - `.cuire('swim')` écrit les clés image par image, VÉRIFIE que chaque piste boucle, range l'action dans une
    piste NLA ; `glisse(arm, recette, periode)` fabrique l'action **`glide`** (même recette, ralentie, amplitudes × 0,2).
    L'export (`export_frame_range=False`) garde la durée de chaque action.
- Par espèce : requins = onde carangiforme + roulis + pectorales qui vrillent ; marteau = tête qui balaie ;
  requin-baleine = tout le corps (exposant 1,7), 4,5 s ; chirurgien = labriforme (pectorales qui rament en
  drapeau, rafale de queue) ; tortue = vol des nageoires avant à deux os (coup rapide, remontée lente en drapeau,
  pale qui plie), arrière en gouvernail ; méduse = deux os de cloche (sommet, marge en retard), pulsation
  asymétrique ; manta = onde d'emplanture au bout + vrillage + enroulement du bout ; baleine = onde de tangage
  à modulation forte, pectorales indépendantes ; sardines = la même onde dans le vertex shader (`banc.js`,
  fréquence propre par individu).
- **Côté site** (`animal.js`) : le tempo dérive (± 8 %) ; les espèces avec `glisse: {nage, plane}` dans le catalogue
  alternent `swim` et `glide` par fondus enchaînés (piège de Three : réactiver l'action cible et remettre son
  poids de base à 1 avant chaque fondu, sinon tout finit à zéro) ; roulis dans les virages (taux de virage →
  inclinaison, `roulis` par espèce) ; `toupie` = rotation lente sur soi (méduse).
- **Contrôle** : `outils/pellicule.html?modele=<id>&anim=swim|glide&n=8&vue=dessus|cote|face|trois-quarts`
  montre un cycle entier en une image (n poses + la dernière = t final, identique à la première si la boucle
  est propre) ; `node outils/test-animation.mjs` vérifie les fondus, la dérive du tempo et le roulis dans le site.
- Piège n°1 (toujours vrai) : l'exporteur n'exporte que les actions qu'il « voit » : celles rangées dans des
  pistes NLA (`cuire()` s'en charge) ou l'action active.

### 7.4 Matériaux
- Uniquement **Principled BSDF**. Textures via nœuds *Image Texture* (base color, roughness, normal via *Normal Map*).
- Tout nœud procédural (Noise, Voronoi, ColorRamp…) **n'est pas exporté** → c'est pour ça que `peau.py` calcule
  les images en numpy (et ne cuit rien dans Cycles).
- Textures : 1024² pour les petits, 2048² pour les gros ; relief ÷2, rugosité ÷4. Un seul matériau par animal.
- Méduse : matériau `Alpha Blend` + `Emission` (on animera l'émission la nuit depuis le code).

### 7.5 Budget
- Petits poissons : 500-1 500 triangles (ils seront instanciés par centaines).
- Animaux moyens : 3 000-8 000. Gros (manta, requin-baleine) : 10 000-20 000 max.
- Fichier : < 2 Mo par animal, < 3 Mo pour les gros (v2 : 1 à 2,6 Mo, textures comprises).

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
Générée automatiquement : `node outils/vignettes.mjs <id>` (visionneuse en mode `?vignette`, fond transparent,
profil, pose neutre) → **`models/<id>.png` en 512×512**. La même image sert pour la silhouette (« ??? »)
via un filtre CSS, et pour la fiche débloquée.

---

## 8. Ambiance : lumière, eau, vitre (v2, 2026-09-21)

Le décor est fait de modules qui ne savent rien des animaux, orchestrés par `main.js` :

- **`scene.js`** — renderer (ombres PCFSoft activées), scène, brouillard `FogExp2` (couleur = fond), caméra,
  soleil directionnel **qui porte les ombres** (caméra d'ombre orthographique 60 × 60 m, carte 2048², biais
  −0,0004 / normalBias 0,05), hémisphère, et `creerEnvironnement()` : une carte d'environnement minimale (sphère
  vue de l'intérieur, claire vers la surface, sombre vers le fond, PMREM) — sans elle, un métal (l'argent des
  sardines) ne reflète rien et devient noir.
- **`caustiques.js`** — UNE fonction GLSL (deux couches de Voronoï dont on éclaire les frontières, affûtées,
  dispersion chromatique, modulation par plaques) et un hook `appliquerCaustiques(materiau, force)` qui la greffe
  dans n'importe quel `MeshStandardMaterial` par `onBeforeCompile` : la lumière s'ajoute sur les faces tournées
  vers le haut, PAS dans l'ombre portée (on relit `getShadow` du soleil), et s'efface au loin (moiré). Compatible
  instancing (le banc). Uniforms partagés (`uTemps`, intensité modulée par l'heure).
- **`sable.js`** — le sol : un plan déplacé une fois par du bruit JS (`bruit.js` : les DUNES), normales calculées ;
  matériau standard greffé : RIDES de sable en relief (normale perturbée, phase bruitée, longueur d'onde variable),
  grain, taches, débris ronds et rares, assombrissement au pied des rochers (uniform `uRochers`), caustiques ;
  reçoit les ombres. `hauteurSable(x, z)` sert à poser rochers et cailloux.
- **`rochers.js`** — icosaèdres soudés (`mergeVertices`, sinon facettes) déplacés par deux bruits, dessous écrasé ;
  matière tri-planaire par la position dans le monde : basalte/brun, grain, fissures, ALGUES vert-olive sur le dessus,
  plaques roses d'algues corallines, relief par gradient de bruit, rugosité plus faible sur les algues ; ombres
  portées et reçues ; caustiques. + 90 CAILLOUX instanciés (`InstancedMesh`) au premier plan, jamais sur un rocher.
- **`surface.js`** — le plafond d'eau vu d'en dessous (plan à 7,5 m, `BackSide`) : FENÊTRE DE SNELL (transmission du
  ciel sous incidence raide, miroir sombre au-delà de l'angle critique), vaguelettes (quatre trains d'ondes avec la
  relation de dispersion + bruit), éclats du soleil, brouillard ; son intensité suit celle des rayons (heure).
- **`water.js`** — rayons (plans additifs qui naissent JUSTE sous la surface et s'y fondent — sinon on voit leur bord
  en levant les yeux), neige marine (2 500 points ; **sillage** : les particules proches d'un animal en mouvement
  sont écartées et entraînées, puis freinées), bulles ; `eau.regler({rayons, caustiques, neige, densiteNeige})`.
- **Interactions** : les animaux PORTENT une ombre (sable, rochers, eux-mêmes) et REÇOIVENT les caustiques sur le
  dos (`animal.js`, `banc.js` : hook enchaîné après le shader de nage) ; la neige tourbillonne à leur passage ;
  l'environnement se reflète sur leur peau mouillée.
- **`daytime.js`** — l'heure module soleil (couleur, intensité, intensité de l'OMBRE : plus molle la nuit), hémisphère,
  brume, exposition, caustiques, rayons, surface, reflets (`environmentIntensity`).
- **`rendu.js`** — post-processing : bloom léger (0,28 / seuil 0,85), passe « vitre » (aberration aux bords, reflet
  oblique lié à la parallaxe, vignette, grain), `OutputPass`. Coupé en qualité basse, avec les ombres (`qualite.js`).
- **Contrôle** : `?camera=x,y,z,cx,cy,cz` fige une caméra de contrôle (position, point visé) pour les captures du
  décor, en désactivant la parallaxe.
- **Leçon (v1, toujours vraie)** : dans un `ShaderMaterial` avec `fog: true`, il FAUT les uniforms `UniformsLib.fog` et
  l'ordre en fin de fragment est `tonemapping → colorspace → fog` (la surface et les rayons le suivent).
- **Leçons** : `IcosahedronGeometry` est non indexée → `mergeVertices()` avant `computeVertexNormals()`, sinon des
  facettes ; dans un hook `onBeforeCompile`, la position monde d'une instance passe par `instanceMatrix` ; un plan
  additif qui traverse la surface montre son bord → le fondre ; une surface trop contrastée (fenêtre de Snell
  étroite, vagues raides) fait des taches : transition large et pentes faibles.

---

## 9. Audio (v2, 2026-09-22)

Règle : **tout le son est fabriqué, sauf la musique**. Aucun enregistrement d'ambiance, d'animal ou
d'effet — Web Audio calcule tout en temps réel, et le même code rend des fichiers hors ligne pour
écouter et mesurer (le « studio »). Le `AudioContext` naît au clic sur « Entrer » (règle des navigateurs)
et se relance seul au retour d'un onglet ou d'un appel (iOS).

### La table de mixage (`son/graphe.js`)

```
ambiance (lit) ───────────────────────────┐
faune (un panner par animal proche) ──────┤
chants (un second panner, porte loin) ────┼─→ limiteur ─→ master ─→ sortie
sons d'interface (+ écho court) ──────────┤
musique ─→ passe-bas 5,2 kHz ─────────────┘   (baisse de 8 dB pendant un chant)
        envois → réverbération du bassin (un convolveur partagé, RI calculée) → retour ┘
```

Niveaux mesurés au studio (avant le master, réglé à 0,6 par défaut) : lit d'ambiance ≈ −31 LUFS ;
musique nominale −37 LUFS (cible −23 LUFS par morceau, bus −14 dB) ; souffles d'un requin à 5 m :
crêtes vers −25 dBFS ; chants ≈ 10-12 dB au-dessus du lit. Le limiteur (seuil −12 dBFS) rattrape les sommes.

### Le lit d'ambiance (`son/ambiance.js`)
Cinq couches, comme sur un vrai hydrophone : la **houle** (bruit brun < 105 Hz, deux LFO de 32 s et 21 s
qui ne se répètent jamais ensemble, sub à 38 Hz), le **flux** (bruit rose en bande médium qui se promène),
le **crépitement** des crevettes-pistolets (clics de Poisson, amplitudes en loi de puissance, colonies qui
vont et viennent), les **bulles** (chapelets du diffuseur à la fréquence de Minnaert f = 3,26 / rayon, gros
« gloup » isolés) et le **lointain** (chocs sourds rares). Les événements sont planifiés par
`planifier(maintenant, horizon)` à chaque frame — jamais de `setTimeout`, donc rendable hors ligne.

### Les animaux (`son/faune.js`)
Une **recette** par espèce (bande de fréquences, durée, force, phases du cycle, thump pour les géants ;
frottement continu pour le chirurgien, scintillement modulé pour le banc). Un souffle = bruit blanc dans un
passe-bande qui **glisse de l'aigu vers le grave**, enveloppe courte ; déclenché quand la phase de l'action
« swim » franchit 0,25 et 0,75 (la queue passe au milieu), pondéré par le poids de l'action (0 en glisse).
Spatialisation : `PannerNode` (HRTF en qualité haute, equalpower en basse) à la position de l'animal,
l'auditeur = la caméra ; atténuation par la distance ET passe-bas qui descend avec elle (l'eau avale les
aigus : le pendant du brouillard). Budget : 8 voix, les plus proches pondérées par la racine de la taille.

### Les chants (`son/chants.js`)
- **Baleine à bosse** : une voix à quatre harmoniques dont la fondamentale glisse (interpolation en log),
  vibrato commun en cents, grognement (AM ~30 Hz) sur les unités graves, deux formants, saturation douce.
  Six unités (gémissement, montée, cri, grognement, descente, whup) et trois phrases types, toutes tirées au
  sort dans des fourchettes : jamais deux fois le même chant. Elle chante en entrant, puis une seconde fois 30 s après.
- **Requin-baleine** : muet comme tous les requins — son « chant » est une aura : bourdon à 36 Hz qui
  s'épanouit en quinte/octave, souffle d'eau qui gonfle, trois cristaux très haut.
- Les rares (marteau, manta) gardent le grondement. Pendant un chant, la musique s'efface.

### La musique
Six morceaux CC0 ; chacun porte sa **sonie mesurée** (`sonie`, EBU R128 : `node outils/sonie.mjs`) et le
lecteur le ramène à la cible (`SONIE_CIBLE`). Avant : 19 dB d'écart entre le plus fort et le plus faible,
d'où « la musique prend trop de place » — un morceau sur deux écrasait l'ambiance. Deux lecteurs en
alternance, fondu de 4 s, jamais deux fois de suite le même, player discret + crédits (obligatoire).

### Le studio (`outils/studio.html`, `outils/rendre-son.mjs`)
Le graphe du site branché sur un `OfflineAudioContext` : `node outils/rendre-son.mjs <scène> sortie.wav [durée]`
(scènes `ambiance`, `fixe`, `faune`, `chants`, `musique`, `mix`, option `solo` sans le lit) écrit le .wav,
mesure la sonie (ffmpeg), encode un .mp3 et trace un spectrogramme (`outils/spectrogramme.py`, échelle log).
Pièges appris : (1) une chute exponentielle vers −80 dB est inaudible au tiers de sa durée — les souffles
sonnaient comme des clics ; l'enveloppe monte en linéaire et descend vers −40 dB ; (2) hors ligne, tout le
code tourne AVANT le rendu : un `disconnect()` est immédiat et coupe le nœud pour toute la durée — la faune
ne débranche pas en hors ligne ; (3) un LFO **ajouté** au gain d'une enveloppe fuit après l'extinction —
le trémolo est un gain **en série** ; (4) le passe-bande ne garde qu'un dixième du bruit blanc : calibration
+18 dB mesurée, une fois, dans `faune.js`. Test : `node outils/test-audio.mjs` (contexte, lecture, émetteurs,
chant, signal réel au master).

---

## 10. Feuille de route

Chaque étape donne quelque chose de visible et qui marche. On n'attaque pas la suivante avant.

| # | Étape | Résultat visible |
|---|---|---|
| 1 | ✅ 2026-09-21 — Squelette : `index.html`, écran d'entrée, scène bleue avec brouillard + lumière, boucle, `lancer.command` | Un bassin vide, mais déjà « profond » |
| 2 | ✅ 2026-09-21 — L'eau : rayons, particules, caustiques, sol (`water.js`) | Beau sans aucun animal |
| 3 | ✅ 2026-09-21 — Les animaux : catalogue (`species.js`), chargeur + clonage de squelette (`modeles.js`), classe `Animal` (courbe Catmull-Rom + `AnimationMixer`), spawner de base, barre de chargement | Ça vit |
| 4 | ✅ 2026-09-21 — `daytime.js` (heure réelle → 8 repères de lumière interpolés, `?heure=` / `?tempo=`), spawner pondéré + heures + repos + pitié + groupes, HUD heure/phase, espèces `chirurgien` (commun, jour, ×4) et `requin-marteau` (rare, crépuscule/nuit) | Nuit ≠ jour |
| 5 | ✅ 2026-09-21 — `observe.js` (sphère englobante ×1,3, jauge 2-3,5 s, vidage 0,5 s), `collection.js` (localStorage `shinka.v1`), `ui.js` (curseur-anneau SVG, toasts par rareté, compteur HUD), halo émissif par instance (`animal.js`) | Le cœur du site |
| 6 | ✅ 2026-09-21 — `carnet.js` (panneau touche C / bouton, grille triée par rareté, silhouettes CSS, fiches complètes), vignettes générées par `outils/vignettes.mjs` (visionneuse `?vignette`), observation en pause quand le carnet est ouvert | On peut « collectionner » |
| 7 | ✅ 2026-09-21 — `audio.js` : ambiance et sons **générés** (Web Audio : bruit brun filtré qui respire, sub, bulles, carillon, tic, grondement), 6 morceaux CC0 d'archive.org (`playlist.js`, `audio/music/CREDITS.md`), deux lecteurs à fondu enchaîné de 4 s, filtre « sous l'eau », player + crédits, volume/mute persistés | L'ambiance est là |
| 8 | ~~Premier vrai modèle~~ → fusionné dans l'étape 3 : le requin généré (`models/requin-recif.glb`) est disponible dès maintenant, plus besoin de placeholders | ✅ pipeline validé le 2026-09-21 |
| 9 | ✅ 2026-09-21 — `evenements.js` (toutes les 12-25 min, `?evenement=banc\|geant\|trouble`) : banc de 300 sardines en tourbillon (`banc.js` : InstancedMesh + nage en vertex shader + rotation autour d'un centre), baleine à bosse au loin avec son chant, eau trouble (modulation brume/soleil/rayons/neige) ; sardine en espèce commune (banc de 150) ; `lumiere.js` partagé | Les surprises |
| 10 | ✅ 2026-09-21 — `rendu.js` (EffectComposer : bloom 0,28 / seuil 0,85, passe « vitre » : aberration chromatique, reflet oblique lié à la parallaxe, vignette, grain, OutputPass), `qualite.js` (haute/basse, auto : médiane < 36 fps → basse pour la visite, bouton du HUD mémorisé, `?qualite=`), tactile (toucher et maintenir, `touch-action: none`), mise en page ≤ 640 px, README, `.nojekyll`. Publication GitHub Pages : à faire avec l'accord de Mathis | En ligne |
| 11 | ✅ 2026-09-22 — **Son v2** : `js/son/` (dsp, ambiance à cinq couches, faune spatialisée calée sur l'animation, chants de la baleine et du requin-baleine, graphe avec limiteur + réverbération), musique égalisée en sonie et 14 dB sous le lit, studio hors ligne (`outils/rendre-son.mjs`, spectrogrammes) | On entend le bassin |

Le premier `.glb` existe déjà : l'étape 3 charge directement le requin (GLTFLoader + AnimationMixer).

---

## 11. Outils de développement (`outils/`)

Le navigateur intégré de l'app n'a pas de WebGL, et `chrome --screenshot` fige la page avant de la
photographier (pas de `requestAnimationFrame`). D'où ces outils, qui pilotent Chrome headless par le
protocole DevTools : la page vit, on attend, on capture, et la console de la page est relayée.

- `node outils/capture.mjs "<url>" sortie.png [attente_s]` — une capture après N secondes de vie.
- `node outils/test-observation.mjs sortie.png` — scénario bout-en-bout : la souris suit un animal
  3,5 s, on vérifie compteur + toast. Écrit aussi `sortie-jauge.png` (anneau en cours).
- `node outils/test-carnet.mjs sortie.png` — scénario : touche C, capture de la grille, ouverture d'une fiche.
- `node outils/test-robustesse.mjs sortie.png` — mémoire GPU (textures d'os libérées au départ des animaux),
  contexte WebGL perdu/restauré (`WEBGL_lose_context`), bouton de qualité (bascule + mémorisation).
- `node outils/vignettes.mjs [id …]` — génère `models/<id>.png` (512×512, fond transparent, profil) pour le carnet.
  À relancer après chaque nouveau modèle. La silhouette « ??? » est la même image noircie en CSS.
- `node outils/test-audio.mjs sortie.png` — clic → contexte actif, lecture qui avance, émetteurs d'animaux, chant, signal au master.
- `node outils/rendre-son.mjs <scène> sortie.wav [durée] [graine] [piste] [solo]` — le studio : rend une scène sonore
  hors ligne (.wav + .mp3 + spectrogramme .png + sonie). `node outils/sonie.mjs` mesure la sonie des morceaux (voir §9).
- `outils/chrome.mjs` — la bibliothèque commune (`piloter()` : naviguer, evaluer, attendre, souris, capturer).
- `serveur.py` — le serveur local (utilisé par `lancer.command` et la config preview) : comme `http.server` mais
  avec `Cache-Control: no-store`, sinon le navigateur garde de vieux modules après une mise à jour
  (« does not provide an export named … »). En cas de doute : rechargement forcé (⌘⇧R).
- `outils/visionneuse.html?modele=<id>` — contrôle d'un modèle (voir §7.0).
- Modes d'URL du site : `?direct` (sans écran d'entrée), `?parade` (toutes les espèces à la file, une toutes les 3-6 s,
  sans heure ni rareté ni repos, baleine comprise, événements toutes les 45-90 s — pour voir tout le catalogue), `?heure=23` / `?tempo=600` (horloge),
  `?demo=observer` (valide un animal toutes les 2,5 s + ligne de debug en haut à gauche),
  `?forcer=meduse` (cette espèce entre d'emblée, quelle que soit l'heure),
  `?evenement=banc|geant|trouble` (l'événement démarre 2 s après l'entrée).
- Visionneuse : `&temps=1.5` fige la pose à cet instant (pour comparer des phases d'animation).
- `window.__shinka` — poignée lecture seule (camera, spawner, observation, horloge) pour les scénarios.

## 12. Questions encore ouvertes

- ~~Nom~~ → **Shinka** (décidé le 2026-09-21).
- ~~Niveau Blender~~ → Mathis ne modélise pas : les animaux sont générés par script (`blender/`). Premier : requin gris de récif.
- ~~Liste d'espèces~~ → v1 validée, premier modèle = requin gris de récif.
- ~~Git~~ → dépôt initialisé le 2026-09-21. Déploiement GitHub Pages (`Patapain18`) à l'étape 10.
- **Rythme** : pas de deadline (perso). Sessions courtes, une étape à la fois.
