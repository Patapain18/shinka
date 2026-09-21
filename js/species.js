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
];
