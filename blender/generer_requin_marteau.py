"""
generer_requin_marteau.py — le requin-marteau halicorne (Sphyrna lewini)
========================================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_requin_marteau.py

3,2 m. Même architecture que le requin gris (corps fuselé, colonne de 5 os),
mais 1,78 fois plus grand, avec la tête en marteau (une plaque horizontale
épaisse, les yeux au bout) et une première dorsale très haute.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
from commun import *

nettoyer_scene()

K = 1.78                                   # facteur d'échelle par rapport au requin gris (1,8 m → 3,2 m)
def E(pts):                                # met à l'échelle une liste de points
    return [(x * K, y * K, z * K) for (x, y, z) in pts]

Y_MUSEAU, Y_PEDONCULE = -0.90 * K, 0.56 * K
PROFIL = [
    (0.00, 0.006, 0.005),
    (0.04, 0.045, 0.036),
    (0.10, 0.080, 0.066),
    (0.18, 0.108, 0.100),
    (0.28, 0.128, 0.130),
    (0.40, 0.136, 0.145),
    (0.52, 0.126, 0.140),
    (0.64, 0.106, 0.120),
    (0.76, 0.082, 0.092),
    (0.88, 0.058, 0.063),
    (1.00, 0.038, 0.043),
]
PROFIL = [(t, rx * K, rz * K) for (t, rx, rz) in PROFIL]

bm = nouveau_bmesh()
corps_fusiforme(bm, PROFIL, Y_MUSEAU, Y_PEDONCULE, stations=36, segments=22)

# ---------------------------------------------------------------- la tête en marteau
# Une plaque horizontale (plan z = 0) large de 0,84 m, épaisse de 13 cm, aux angles
# adoucis (pli à 0,5 : la subdivision arrondit un peu les bords).
nageoire(bm, [(-0.42, -1.62, 0.0), (-0.41, -1.44, 0.0), (-0.22, -1.37, 0.0), (0.22, -1.37, 0.0),
              (0.41, -1.44, 0.0), (0.42, -1.62, 0.0), (0.16, -1.67, 0.0), (-0.16, -1.67, 0.0)], 0.13, pli=0.5)
YEUX = [(+0.40, -1.53, 0.0), (-0.40, -1.53, 0.0)]
for oeil in YEUX:
    sphere(bm, oeil, 0.03)

# ---------------------------------------------------------------- les nageoires (celles du requin gris, agrandies)
nageoire(bm, E([(0, 0.47, 0.04), (0, 0.62, 0.16), (0, 0.80, 0.32), (0, 0.94, 0.44), (0, 0.90, 0.30),
                (0, 0.78, 0.12), (0, 0.76, 0.02), (0, 0.82, -0.08), (0, 0.78, -0.22), (0, 0.66, -0.15),
                (0, 0.55, -0.06), (0, 0.47, -0.04)]), 0.03)
# Première dorsale : haute chez le marteau (× 1,15 en hauteur)
nageoire(bm, [(0, y * K, z * K * 1.15) for (_, y, z) in
              [(0, -0.28, 0.08), (0, -0.22, 0.20), (0, -0.14, 0.31), (0, -0.04, 0.39), (0, 0.02, 0.40),
               (0, 0.04, 0.33), (0, 0.06, 0.24), (0, 0.09, 0.16), (0, 0.12, 0.08)]], 0.035)
nageoire(bm, E([(0, 0.32, 0.05), (0, 0.40, 0.15), (0, 0.45, 0.14), (0, 0.47, 0.08), (0, 0.47, 0.03)]), 0.025)
nageoire(bm, E([(0, 0.34, -0.04), (0, 0.42, -0.14), (0, 0.46, -0.12), (0, 0.48, -0.06), (0, 0.48, -0.02)]), 0.025)
for s in (+1, -1):
    nageoire(bm, E([(s * 0.09, -0.38, -0.03), (s * 0.20, -0.30, -0.08), (s * 0.44, -0.04, -0.19),
                    (s * 0.36, 0.04, -0.15), (s * 0.18, -0.08, -0.07), (s * 0.09, -0.14, -0.05)]), 0.03)
    nageoire(bm, E([(s * 0.05, 0.18, -0.04), (s * 0.12, 0.26, -0.10), (s * 0.16, 0.35, -0.12), (s * 0.05, 0.33, -0.04)]), 0.02)

requin = terminer_maillage(bm, 'RequinMarteau')
sub = requin.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- la peau
def retouche(co, c):
    for oeil in YEUX:
        if (co - Vector(oeil)).length < 0.04:
            return [0.01, 0.01, 0.012]
    return c

colorer_ventre_dos(requin, dos=srgb(0.36, 0.34, 0.30), ventre=srgb(0.85, 0.84, 0.80),
                   z_bas=-0.10, z_haut=0.10, retouche=retouche)
requin.data.materials.append(materiau_peau('Peau_Marteau', rugosite=0.6))

# ---------------------------------------------------------------- squelette et nage
OS = [(nom, y0 * K, y1 * K, parent) for (nom, y0, y1, parent) in [
    ('racine',  -0.30,  0.10, None),
    ('tete',    -0.30, -0.90, 'racine'),
    ('corps',    0.10,  0.42, 'racine'),
    ('queue_1',  0.42,  0.68, 'corps'),
    ('queue_2',  0.68,  0.95, 'queue_1'),
]]
armature = squelette_colonne('Armature_Marteau', OS)
peser_colonne(requin, armature, OS)
# Grand animal = mouvement lent : 72 images (3 s par cycle)
animer_nage(armature, {
    'tete':    (0.025,  0.6),
    'racine':  (0.030,  0.0),
    'corps':   (0.080, -0.8),
    'queue_1': (0.160, -1.6),
    'queue_2': (0.240, -2.4),
}, images=72)

chemin = exporter_glb('requin-marteau.glb')
inspecter_glb(chemin)
