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
    (0.00, 0.003, 0.006),
    (0.08, 0.012, 0.040),
    (0.20, 0.019, 0.066),
    (0.35, 0.023, 0.080),
    (0.50, 0.023, 0.080),
    (0.65, 0.020, 0.068),
    (0.80, 0.015, 0.046),
    (0.92, 0.009, 0.024),
    (1.00, 0.006, 0.014),
]
bm = nouveau_bmesh()
corps_fusiforme(bm, PROFIL, Y_MUSEAU, Y_PEDONCULE, stations=24, segments=16, aplatir_ventre=1.0)

# ---------------------------------------------------------------- 2) les nageoires
# Dorsale et anale : longues et basses, sur presque tout le corps
nageoire(bm, [(0, -0.075, 0.040), (0, -0.05, 0.100), (0, -0.01, 0.118), (0, 0.03, 0.112), (0, 0.06, 0.088), (0, 0.078, 0.040)], 0.004)
nageoire(bm, [(0, -0.025, -0.040), (0, 0.00, -0.098), (0, 0.035, -0.096), (0, 0.06, -0.072), (0, 0.078, -0.035)], 0.004)
# Caudale en éventail, légèrement échancrée
nageoire(bm, [(0, 0.080, 0.012), (0, 0.130, 0.046), (0, 0.152, 0.040), (0, 0.136, 0.000),
              (0, 0.152, -0.040), (0, 0.130, -0.046), (0, 0.080, -0.012)], 0.005)
# Pectorales
for s in (+1, -1):
    nageoire(bm, [(s * 0.020, -0.050, -0.004), (s * 0.056, -0.012, -0.020), (s * 0.046, 0.004, -0.024), (s * 0.020, -0.018, -0.012)], 0.004)

YEUX = [(+0.016, -0.098, 0.022), (-0.016, -0.098, 0.022)]
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
    if -0.07 < co.y < 0.08 and 0.005 < co.z < 0.06 and abs(co.x) > 0.008:
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
