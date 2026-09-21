/* ============================================
   SPECIES — le catalogue des espèces
   ============================================
   Ici : uniquement des DONNÉES. Aucune logique. Ajouter un animal au site,
   c'est ajouter une entrée ici (+ son .glb dans models/). Rien d'autre à toucher.

   Champs (voir DESIGN.md §4) :
     rarete       'commun' | 'peu-commun' | 'rare' | 'legendaire'   (étape 4)
     heures       phases de la journée où l'espèce sort               (étape 4)
     taille       longueur en mètres, pour la fiche et les marges de trajectoire
     vitesse      m/s de croisière ; l'animation « swim » est calée dessus
     profondeur   [yMin, yMax] plage de hauteur où il nage (le sol est à -3, l'œil à 1,6)
     distance     [zProche, zLoin] plage de distance à la vitre (négatif = devant nous)
     ondulation   amplitude (m) des écarts de la trajectoire : 0 = ligne droite
     groupe       nombre d'individus par passage
     echelle      correctif si le .glb n'est pas à l'échelle (1 = déjà en mètres)
   ============================================ */

export const ESPECES = [
  {
    id: 'requin-recif',
    nom: 'Requin gris de récif',
    latin: 'Carcharhinus amblyrhynchos',
    rarete: 'peu-commun',
    heures: ['aube', 'jour', 'crepuscule', 'nuit'],
    taille: 1.8,
    vitesse: 1.3,
    profondeur: [-1.2, 2.4],
    distance: [-4, -13],
    ondulation: 0.6,
    groupe: 1,
    modele: 'models/requin-recif.glb',
    image: 'models/requin-recif.png',
    echelle: 1,
    description: "Élégant et nerveux, le requin gris de récif patrouille les tombants coralliens en petits groupes. Il dépasse rarement deux mètres et se reconnaît à la large bordure sombre de sa nageoire caudale. Curieux, il s'approche des plongeurs, puis s'éloigne d'un coup de queue.",
    habitat: "Récifs et tombants de l'Indo-Pacifique, de la mer Rouge à la Polynésie",
    anecdote: "Menacé, il adopte une posture d'intimidation célèbre : dos arqué, pectorales abaissées, nage en zigzag exagéré.",
  },
  {
    id: 'chirurgien',
    nom: 'Poisson-chirurgien bleu',
    latin: 'Paracanthurus hepatus',
    rarete: 'commun',
    heures: ['aube', 'jour'],
    taille: 0.3,
    vitesse: 0.45,
    profondeur: [-0.6, 2.0],
    distance: [-2.5, -6],
    ondulation: 0.5,
    groupe: 4,
    modele: 'models/chirurgien.glb',
    image: 'models/chirurgien.png',
    echelle: 1,
    description: "Bleu électrique barré d'une « palette » noire, la queue jaune vif : impossible de le confondre. Il vit en petits groupes dans les récifs, toujours près d'une anfractuosité où se cacher. Herbivore, il broute les algues des coraux du matin au soir.",
    habitat: "Récifs coralliens de l'Indo-Pacifique, entre 2 et 40 m",
    anecdote: "Le « scalpel » qui lui vaut son nom est une lame rétractable de chaque côté de la queue, qu'il dresse quand on l'importune.",
  },
  {
    id: 'requin-marteau',
    nom: 'Requin-marteau halicorne',
    latin: 'Sphyrna lewini',
    rarete: 'rare',
    heures: ['crepuscule', 'nuit'],
    taille: 3.2,
    vitesse: 1.1,
    profondeur: [-1.0, 2.6],
    distance: [-6, -14],
    ondulation: 0.8,
    groupe: 1,
    modele: 'models/requin-marteau.glb',
    image: 'models/requin-marteau.png',
    echelle: 1,
    description: "Sa tête aplatie en T lui donne un champ de vision presque total et une sensibilité électrique hors norme, qu'il balaie sur le sable pour débusquer les raies enfouies. Le jour, il se rassemble parfois par centaines autour des monts sous-marins ; c'est la nuit qu'il chasse, seul.",
    habitat: "Eaux tempérées et tropicales du globe, du littoral jusqu'à 275 m de profondeur",
    anecdote: "Ses bancs de plusieurs centaines d'individus, aux Galápagos ou à l'île Cocos, restent l'un des grands mystères du comportement des requins.",
  },
  {
    id: 'tortue',
    nom: 'Tortue verte',
    latin: 'Chelonia mydas',
    rarete: 'peu-commun',
    heures: ['aube', 'jour', 'crepuscule'],
    taille: 1.2,
    vitesse: 0.45,
    profondeur: [-1.2, 2.2],
    distance: [-3.5, -10],
    ondulation: 0.7,
    groupe: 1,
    modele: 'models/tortue.glb',
    image: 'models/tortue.png',
    echelle: 1,
    description: "Lente et paisible, la tortue verte doit son nom à la couleur de sa graisse, pas à sa carapace. Elle broute les herbiers et peut rester plus de quatre heures sous l'eau au repos. Adulte, elle n'a plus grand-chose à craindre — sauf les filets, et les sacs plastique qu'elle confond avec des méduses.",
    habitat: "Eaux tropicales et subtropicales, herbiers et récifs peu profonds",
    anecdote: "Elle revient pondre sur la plage même où elle est née, parfois à des milliers de kilomètres, guidée par le champ magnétique terrestre.",
  },
  {
    id: 'meduse',
    nom: 'Méduse lune',
    latin: 'Aurelia aurita',
    rarete: 'peu-commun',
    heures: ['aube', 'jour', 'crepuscule', 'nuit'],
    taille: 0.4,
    vitesse: 0.18,
    profondeur: [0.3, 4.0],
    distance: [-2.5, -7],
    ondulation: 1.2,
    groupe: 2,
    emission: 0x86c5ee,                    // elle luit la nuit (voir animal.js)
    modele: 'models/meduse.glb',
    image: 'models/meduse.png',
    echelle: 1,
    description: "Un disque translucide de la taille d'une assiette, quatre anneaux rosés qui transparaissent : ses gonades. Elle ne nage pas vraiment, elle pulse — et se laisse porter par le courant. Sans cerveau ni cœur, elle existe depuis plus de cinq cents millions d'années.",
    habitat: "Toutes les mers tempérées du globe, près des côtes et dans les ports",
    anecdote: "Ses tentacules sont trop courts pour percer la peau humaine : c'est l'une des rares méduses qu'on peut toucher sans dommage.",
  },
];
