"""
generer_chirurgien.py — le poisson-chirurgien bleu (Paracanthurus hepatus)
==========================================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_chirurgien.py

30 cm, corps ovale très comprimé latéralement, bleu électrique avec une
« palette » noire sur le flanc et la queue jaune. Nage en petit groupe.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
from commun import *

nettoyer_scene()

# ---------------------------------------------------------------- 1) le corps
Y_MUSEAU, Y_PEDONCULE = -0.13, 0.09
# Ovale haut et fin : demi-hauteur (z) bien plus grande que demi-largeur (x)
PROFIL = [
    (0.00, 0.004, 0.006),
    (0.08, 0.016, 0.035),
    (0.20, 0.026, 0.060),
    (0.35, 0.032, 0.072),
    (0.50, 0.032, 0.070),
    (0.65, 0.028, 0.060),
    (0.80, 0.020, 0.042),
    (0.92, 0.012, 0.022),
    (1.00, 0.008, 0.014),
]
bm = bmesh.new()
corps_fusiforme(bm, PROFIL, Y_MUSEAU, Y_PEDONCULE, stations=24, segments=16, aplatir_ventre=1.0)

# ---------------------------------------------------------------- 2) les nageoires
# Dorsale et anale : longues et basses, sur presque tout le corps
nageoire(bm, [(0, -0.07, 0.045), (0, -0.04, 0.086), (0, 0.00, 0.093), (0, 0.04, 0.083), (0, 0.07, 0.060), (0, 0.078, 0.030)], 0.005)
nageoire(bm, [(0, -0.02, -0.045), (0, 0.00, -0.080), (0, 0.04, -0.076), (0, 0.07, -0.052), (0, 0.078, -0.028)], 0.005)
# Caudale en éventail, légèrement échancrée
nageoire(bm, [(0, 0.080, 0.012), (0, 0.130, 0.046), (0, 0.152, 0.040), (0, 0.136, 0.000),
              (0, 0.152, -0.040), (0, 0.130, -0.046), (0, 0.080, -0.012)], 0.005)
# Pectorales
for s in (+1, -1):
    nageoire(bm, [(s * 0.020, -0.050, -0.004), (s * 0.056, -0.012, -0.020), (s * 0.046, 0.004, -0.024), (s * 0.020, -0.018, -0.012)], 0.004)

YEUX = [(+0.023, -0.095, 0.020), (-0.023, -0.095, 0.020)]
for oeil in YEUX:
    sphere(bm, oeil, 0.006, segments=10, anneaux=6)

poisson = terminer_maillage(bm, 'Chirurgien')
sub = poisson.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 3) la peau
BLEU  = srgb(0.06, 0.36, 0.88)
NOIR  = srgb(0.02, 0.02, 0.04)
JAUNE = srgb(0.96, 0.80, 0.10)

def retouche(co, c):
    for oeil in YEUX:
        if (co - Vector(oeil)).length < 0.009:
            return list(NOIR)
    if co.y > 0.082:                                       # queue jaune
        return list(JAUNE)
    # la « palette » : une bande noire sur le flanc, de derrière l'œil jusqu'au pédoncule
    if -0.06 < co.y < 0.08 and 0.0 < co.z < 0.055 and abs(co.x) > 0.012:
        return list(NOIR)
    return c

colorer_ventre_dos(poisson, dos=BLEU, ventre=BLEU, retouche=retouche)
poisson.data.materials.append(materiau_peau('Peau_Chirurgien', rugosite=0.45))

# ---------------------------------------------------------------- 4) squelette et nage
OS = [
    ('racine',  -0.03,  0.03, None),
    ('tete',    -0.03, -0.13, 'racine'),
    ('queue_1',  0.03,  0.09, 'racine'),
    ('queue_2',  0.09,  0.16, 'queue_1'),
]
armature = squelette_colonne('Armature_Chirurgien', OS)
peser_colonne(poisson, armature, OS)
# Petit poisson = battements rapides et courts : cycle de 20 images (0,8 s)
animer_nage(armature, {
    'tete':    (0.020,  0.5),
    'racine':  (0.030,  0.0),
    'queue_1': (0.120, -1.0),
    'queue_2': (0.220, -2.0),
}, images=20)

chemin = exporter_glb('chirurgien.glb')
inspecter_glb(chemin)
