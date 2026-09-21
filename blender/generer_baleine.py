"""
generer_baleine.py — la baleine à bosse (Megaptera novaeangliae)
=================================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_baleine.py

14 m. Elle ne passe qu'en événement, très loin : une silhouette. Ce qui doit se
lire : le corps massif, les immenses pectorales (un tiers du corps), la petite
bosse dorsale, et la queue horizontale qui bat DE HAUT EN BAS — un mammifère,
pas un poisson : la colonne tangue (rotation X), elle n'ondule pas (Z).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
from commun import *

nettoyer_scene()
bm = nouveau_bmesh()
PROFIL = [(0.00, 0.15, 0.10), (0.06, 0.60, 0.45), (0.15, 0.95, 0.85), (0.30, 1.20, 1.25), (0.42, 1.25, 1.35),
          (0.55, 1.15, 1.25), (0.68, 0.90, 1.00), (0.80, 0.62, 0.72), (0.90, 0.40, 0.48), (1.00, 0.28, 0.32)]
corps_fusiforme(bm, PROFIL, -7.0, 5.2, stations=36, segments=22, aplatir_ventre=0.85)
# la queue horizontale (fluke), 4,8 m d'envergure, échancrée
nageoire(bm, [(0, 5.0, 0.05), (1.8, 5.6, 0.05), (2.4, 6.6, 0.05), (0.9, 6.5, 0.05), (0, 6.9, 0.05),
              (-0.9, 6.5, 0.05), (-2.4, 6.6, 0.05), (-1.8, 5.6, 0.05)], 0.25)
# les pectorales : 4,5 m, inclinées vers le bas
for s in (+1, -1):
    nageoire(bm, [(s * 0.9, -3.2, -0.6), (s * 2.5, -3.4, -1.0), (s * 4.6, -2.6, -1.5), (s * 5.2, -1.9, -1.6),
                  (s * 3.8, -1.6, -1.2), (s * 1.8, -1.8, -0.8), (s * 0.9, -2.2, -0.6)], 0.28, pli=0.8)
nageoire(bm, [(0, 0.8, 0.95), (0, 1.3, 1.35), (0, 1.9, 1.3), (0, 2.1, 0.9)], 0.3)      # la bosse dorsale
YEUX = [(+0.85, -5.6, -0.1), (-0.85, -5.6, -0.1)]
for oeil in YEUX:
    sphere(bm, oeil, 0.1, segments=10, anneaux=6)

baleine = terminer_maillage(bm, 'Baleine')
sub = baleine.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

DOS = srgb(0.08, 0.09, 0.10)
VENTRE = srgb(0.84, 0.85, 0.85)
def retouche(co, c):
    for oeil in YEUX:
        if (co - Vector(oeil)).length < 0.14:
            return [0.01, 0.01, 0.012]
    if co.z < -0.7 and abs(co.x) > 1.2:
        return list(VENTRE)                          # le dessous des pectorales est blanc
    return c
colorer_ventre_dos(baleine, dos=DOS, ventre=VENTRE, z_bas=-0.5, z_haut=0.2, retouche=retouche)
baleine.data.materials.append(materiau_peau('Peau_Baleine', rugosite=0.7))

OS = [
    ('racine',  -2.0,  0.8, None),
    ('tete',    -2.0, -7.0, 'racine'),
    ('corps',    0.8,  3.0, 'racine'),
    ('queue_1',  3.0,  5.0, 'corps'),
    ('queue_2',  5.0,  7.0, 'queue_1'),
]
armature = squelette_colonne('Armature_Baleine', OS)
peser_colonne(baleine, armature, OS)
R = 'rotation_euler'
animer_os(armature, {                              # axe X = tangage : la queue monte et descend
    'racine':  [(R, 0, 0.015, 0.0, 0.0)],
    'tete':    [(R, 0, 0.012, 0.5, 0.0)],
    'corps':   [(R, 0, 0.045, -0.8, 0.0)],
    'queue_1': [(R, 0, 0.10, -1.6, 0.0)],
    'queue_2': [(R, 0, 0.16, -2.4, 0.0)],
}, images=192)                                     # 8 s par battement
chemin = exporter_glb('baleine.glb')
inspecter_glb(chemin)
