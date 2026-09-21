"""
generer_requin_recif.py — le requin gris de récif (Carcharhinus amblyrhynchos)
==============================================================================
Lancer depuis la racine du projet :
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_requin_recif.py

Résultat : models/requin-recif.glb (corps + nageoires, couleurs par sommet,
squelette de 5 os, action « swim » de 2 s en boucle).

Pourquoi un script plutôt qu'un fichier .blend ? Reproductible (on relance, on
obtient le même requin — ou un meilleur en changeant trois chiffres), lisible et
versionnable dans git, et toutes les conventions de DESIGN.md §7 sont appliquées
automatiquement.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
from commun import *

nettoyer_scene()

# ---------------------------------------------------------------- 1) le corps
# 1,8 m du museau au bout de la queue. Tête vers -Y (DESIGN.md §7.2).
Y_MUSEAU, Y_PEDONCULE = -0.90, 0.56
# (t, demi-largeur, demi-hauteur) — t = 0 au museau, 1 au pédoncule caudal.
# Un requin : museau pointu et aplati, corps le plus épais au tiers avant,
# qui s'affine longuement vers la queue.
PROFIL = [
    (0.00, 0.006, 0.005),
    (0.04, 0.045, 0.036),
    (0.10, 0.082, 0.070),
    (0.18, 0.112, 0.105),
    (0.28, 0.132, 0.135),
    (0.40, 0.140, 0.150),
    (0.52, 0.130, 0.145),
    (0.64, 0.110, 0.125),
    (0.76, 0.085, 0.095),
    (0.88, 0.060, 0.065),
    (1.00, 0.040, 0.045),
]
bm = nouveau_bmesh()
corps_fusiforme(bm, PROFIL, Y_MUSEAU, Y_PEDONCULE, stations=32, segments=20)

# ---------------------------------------------------------------- 2) les nageoires
# Polygones (x, y, z) dont la base est légèrement dans le corps. Épaisseurs en m.
# Caudale hétérocerque : lobe supérieur long et relevé, lobe inférieur court, échancrure.
nageoire(bm, [(0, 0.47, 0.04), (0, 0.62, 0.16), (0, 0.80, 0.32), (0, 0.94, 0.44), (0, 0.90, 0.30),
              (0, 0.78, 0.12), (0, 0.76, 0.02), (0, 0.82, -0.08), (0, 0.78, -0.22), (0, 0.66, -0.15),
              (0, 0.55, -0.06), (0, 0.47, -0.04)], 0.02)
# Première dorsale : haute, en faucille, bord d'attaque bombé, bord de fuite concave
nageoire(bm, [(0, -0.28, 0.08), (0, -0.22, 0.20), (0, -0.14, 0.31), (0, -0.04, 0.39), (0, 0.02, 0.40),
              (0, 0.04, 0.33), (0, 0.06, 0.24), (0, 0.09, 0.16), (0, 0.12, 0.08)], 0.024)
# Seconde dorsale et anale : petites, près de la queue
nageoire(bm, [(0, 0.32, 0.05), (0, 0.40, 0.15), (0, 0.45, 0.14), (0, 0.47, 0.08), (0, 0.47, 0.03)], 0.016)
nageoire(bm, [(0, 0.34, -0.04), (0, 0.42, -0.14), (0, 0.46, -0.12), (0, 0.48, -0.06), (0, 0.48, -0.02)], 0.016)
# Pectorales (grandes ailes vers le bas et l'arrière) et pelviennes, à droite et à gauche
for s in (+1, -1):
    nageoire(bm, [(s * 0.09, -0.38, -0.03), (s * 0.20, -0.30, -0.08), (s * 0.44, -0.04, -0.19),
                  (s * 0.36, 0.04, -0.15), (s * 0.18, -0.08, -0.07), (s * 0.09, -0.14, -0.05)], 0.02)
    nageoire(bm, [(s * 0.05, 0.18, -0.04), (s * 0.12, 0.26, -0.10), (s * 0.16, 0.35, -0.12), (s * 0.05, 0.33, -0.04)], 0.014)

# Les yeux : deux petites sphères qui affleurent de chaque côté de la tête
YEUX = [(+0.095, -0.66, 0.03), (-0.095, -0.66, 0.03)]
for oeil in YEUX:
    sphere(bm, oeil, 0.014)

requin = terminer_maillage(bm, 'Requin')

# Subdivision de surface : arrondit le corps et les bords des nageoires.
# Appliquée à l'export (export_apply), donc le .glb est déjà lissé.
sub = requin.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 3) la peau
def retouche(co, c):
    for oeil in YEUX:                                # les yeux : presque noirs
        if (co - Vector(oeil)).length < 0.02:
            return [0.01, 0.01, 0.012]
    if co.y > 0.84:                                  # bord de fuite de la caudale : sombre
        return [x * 0.35 for x in c]
    return c

colorer_ventre_dos(requin,
                   dos=srgb(0.24, 0.29, 0.33),        # gris-bleu
                   ventre=srgb(0.80, 0.82, 0.80),     # blanc cassé
                   z_bas=-0.07, z_haut=0.07, retouche=retouche)
requin.data.materials.append(materiau_peau('Peau_Requin', rugosite=0.55))

# ---------------------------------------------------------------- 4) squelette et nage
# Une colonne de 5 os : la racine au niveau des pectorales, la tête vers l'avant,
# trois segments vers la queue. Les amplitudes croissent vers l'arrière et les
# phases se décalent : l'onde part de la tête et court jusqu'à la caudale.
OS = [
    ('racine',  -0.30,  0.10, None),
    ('tete',    -0.30, -0.90, 'racine'),
    ('corps',    0.10,  0.42, 'racine'),
    ('queue_1',  0.42,  0.68, 'corps'),
    ('queue_2',  0.68,  0.95, 'queue_1'),
]
armature = squelette_colonne('Armature_Requin', OS)
peser_colonne(requin, armature, OS)
animer_nage(armature, {
    'tete':    (0.030,  0.6),
    'racine':  (0.035,  0.0),
    'corps':   (0.090, -0.8),
    'queue_1': (0.170, -1.6),
    'queue_2': (0.250, -2.4),
}, images=48)                                          # 48 images à 24 fps = un cycle de 2 s

# ---------------------------------------------------------------- 5) export et contrôle
chemin = exporter_glb('requin-recif.glb')
inspecter_glb(chemin)
