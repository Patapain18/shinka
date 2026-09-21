"""
generer_requin_baleine.py — le requin-baleine (Rhincodon typus)
================================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_requin_baleine.py

Dix mètres. La même architecture que le requin gris (corps fuselé, colonne de 5
os, nage codée), mais un museau large et plat, un corps massif, une dorsale
reculée, et la fameuse robe : dos gris-bleu à damier de points blancs. Très lent :
6 s par ondulation.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
from commun import *

nettoyer_scene()
K = 10.0 / 1.8                                       # les cotes sont celles d'un requin de 1,8 m, mises à 10 m
def E(pts):
    return [(x * K, y * K, z * K) for (x, y, z) in pts]

Y_MUSEAU, Y_PEDONCULE = -0.90 * K, 0.56 * K
PROFIL = [(t, rx * K, rz * K) for (t, rx, rz) in [
    (0.00, 0.030, 0.014),      # museau large et plat, pas pointu
    (0.03, 0.085, 0.040),
    (0.08, 0.122, 0.078),
    (0.16, 0.142, 0.112),
    (0.28, 0.152, 0.146),
    (0.40, 0.152, 0.156),
    (0.52, 0.142, 0.150),
    (0.64, 0.118, 0.128),
    (0.76, 0.088, 0.098),
    (0.88, 0.058, 0.066),
    (1.00, 0.036, 0.042),
]]
bm = nouveau_bmesh()
corps_fusiforme(bm, PROFIL, Y_MUSEAU, Y_PEDONCULE, stations=40, segments=24, aplatir_ventre=0.8)

# ---------------------------------------------------------------- nageoires (cotes « 1,8 m », mises à l'échelle)
nageoire(bm, E([(0, 0.47, 0.04), (0, 0.62, 0.17), (0, 0.80, 0.34), (0, 0.94, 0.46), (0, 0.90, 0.31),
                (0, 0.78, 0.12), (0, 0.76, 0.02), (0, 0.82, -0.08), (0, 0.78, -0.22), (0, 0.66, -0.15),
                (0, 0.55, -0.06), (0, 0.47, -0.04)]), 0.06)
# première dorsale : reculée, large à la base
nageoire(bm, E([(0, -0.10, 0.12), (0, -0.03, 0.26), (0, 0.06, 0.33), (0, 0.13, 0.24), (0, 0.18, 0.10)]), 0.08)
nageoire(bm, E([(0, 0.34, 0.05), (0, 0.41, 0.13), (0, 0.46, 0.12), (0, 0.48, 0.07), (0, 0.48, 0.03)]), 0.05)
nageoire(bm, E([(0, 0.35, -0.04), (0, 0.42, -0.12), (0, 0.46, -0.10), (0, 0.48, -0.05), (0, 0.48, -0.02)]), 0.05)
for s in (+1, -1):
    # pectorales : grandes, en aile
    nageoire(bm, E([(s * 0.11, -0.36, -0.04), (s * 0.26, -0.30, -0.09), (s * 0.50, -0.08, -0.20),
                    (s * 0.42, 0.02, -0.16), (s * 0.20, -0.06, -0.08), (s * 0.11, -0.14, -0.06)]), 0.07)
    nageoire(bm, E([(s * 0.06, 0.20, -0.05), (s * 0.13, 0.28, -0.11), (s * 0.17, 0.36, -0.13), (s * 0.06, 0.35, -0.05)]), 0.04)
YEUX = [(0.13 * K, -0.80 * K, -0.005 * K), (-0.13 * K, -0.80 * K, -0.005 * K)]
for oeil in YEUX:
    sphere(bm, oeil, 0.11, segments=10, anneaux=6)

requin = terminer_maillage(bm, 'RequinBaleine')
sub = requin.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- la robe à damier
DOS = srgb(0.20, 0.26, 0.33)
POINT = srgb(0.74, 0.80, 0.85)
VENTRE = srgb(0.84, 0.86, 0.86)

def hachage(cx, cy, cz):
    return abs(math.sin(cx * 91.7 + cy * 47.3 + cz * 173.9) * 43758.5) % 1.0

def retouche(co, c):
    for oeil in YEUX:
        if (co - Vector(oeil)).length < 0.16:
            return [0.01, 0.01, 0.012]
    # hors du corps (sur les côtés, au-dessus, derrière, ou en dessous mais écarté) : une nageoire
    nageoire_ = abs(co.x) > 0.16 * K or co.z > 0.16 * K or co.y > 0.58 * K or (co.z < -0.25 and abs(co.x) > 0.6)
    if nageoire_:
        c = list(DOS)                                # les nageoires sont sombres, comme le dos
    # des points clairs en grille à peu près régulière (cases de 28 cm), sauf sur le ventre
    if nageoire_ or co.z > -0.35:
        case = (round(co.x / 0.28), round(co.y / 0.28), round(co.z / 0.28))
        if hachage(*case) < 0.22:
            return list(POINT)
    return c

colorer_ventre_dos(requin, dos=DOS, ventre=VENTRE, z_bas=-0.55, z_haut=-0.15, retouche=retouche)
requin.data.materials.append(materiau_peau('Peau_RequinBaleine', rugosite=0.65))

# ---------------------------------------------------------------- squelette et nage
OS = [(nom, y0 * K, y1 * K, parent) for (nom, y0, y1, parent) in [
    ('racine',  -0.30,  0.10, None),
    ('tete',    -0.30, -0.90, 'racine'),
    ('corps',    0.10,  0.42, 'racine'),
    ('queue_1',  0.42,  0.68, 'corps'),
    ('queue_2',  0.68,  0.95, 'queue_1'),
]]
armature = squelette_colonne('Armature_RequinBaleine', OS)
peser_colonne(requin, armature, OS)
animer_nage(armature, {
    'tete':    (0.015,  0.6),
    'racine':  (0.020,  0.0),
    'corps':   (0.060, -0.8),
    'queue_1': (0.120, -1.6),
    'queue_2': (0.190, -2.4),
}, images=144)                                       # 6 s par ondulation : un géant tranquille

chemin = exporter_glb('requin-baleine.glb')
inspecter_glb(chemin)
