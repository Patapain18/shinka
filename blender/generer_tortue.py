"""
generer_tortue.py — la tortue verte (Chelonia mydas)
=====================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_tortue.py

1,2 m du museau au bout des nageoires arrière. Carapace bombée (ellipsoïde au
dessous aplati), cou et tête vers -Y, quatre nageoires en plaques, une petite
queue. Rig : racine + cou + tête + une os par nageoire + queue.
Nage : les nageoires avant « rament » (battement vertical + balayage en
quadrature = un mouvement en huit), les arrière en opposition, plus lentement.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
from commun import *

nettoyer_scene()
bm = nouveau_bmesh()
registre = []                                  # les parties étiquetées, pour le pesage

# ---------------------------------------------------------------- carapace + plastron
marquer(bm, ellipsoide(bm, (0.0, 0.0, 0.02), (0.40, 0.50, 0.17), segments=28, anneaux=18, aplatir_dessous=0.45),
        'racine', registre)

# ---------------------------------------------------------------- cou et tête (vers -Y)
marquer(bm, corps_fusiforme(bm, [(0.0, 0.045, 0.045), (0.5, 0.06, 0.055), (1.0, 0.05, 0.05)],
                            y_debut=-0.63, y_fin=-0.36, stations=8, segments=14, aplatir_ventre=1.0, decalage=(0.0, -0.01)),
        'cou', registre, ((0.0, -0.40, -0.01), 0.10))
YEUX = [(+0.063, -0.72, 0.018), (-0.063, -0.72, 0.018)]
tete = ellipsoide(bm, (0.0, -0.70, -0.005), (0.075, 0.115, 0.065), segments=18, anneaux=12)
for oeil in YEUX:
    tete += sphere(bm, oeil, 0.014, segments=10, anneaux=6)
marquer(bm, tete, 'tete', registre, ((0.0, -0.62, -0.01), 0.06))

# ---------------------------------------------------------------- nageoires
for s, nom in ((+1, 'nag_av_g'), (-1, 'nag_av_d')):
    marquer(bm, nageoire(bm, [(s * 0.30, -0.30, -0.02), (s * 0.52, -0.42, -0.03), (s * 0.78, -0.36, -0.05),
                              (s * 0.90, -0.20, -0.07), (s * 0.74, -0.04, -0.06), (s * 0.48, 0.02, -0.04),
                              (s * 0.30, -0.10, -0.02)], 0.035, pli=0.8),
            nom, registre, ((s * 0.32, -0.20, -0.02), 0.14))
for s, nom in ((+1, 'nag_ar_g'), (-1, 'nag_ar_d')):
    marquer(bm, nageoire(bm, [(s * 0.24, 0.30, -0.03), (s * 0.42, 0.38, -0.04), (s * 0.52, 0.54, -0.06),
                              (s * 0.40, 0.62, -0.06), (s * 0.24, 0.48, -0.04)], 0.03, pli=0.8),
            nom, registre, ((s * 0.26, 0.40, -0.03), 0.10))

# ---------------------------------------------------------------- queue
marquer(bm, corps_fusiforme(bm, [(0.0, 0.03, 0.02), (1.0, 0.008, 0.006)], y_debut=0.42, y_fin=0.64,
                            stations=6, segments=10, aplatir_ventre=1.0, decalage=(0.0, -0.03)),
        'queue', registre, ((0.0, 0.46, -0.03), 0.06))

tortue = terminer_maillage(bm, 'Tortue')
sub = tortue.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- la peau
OLIVE   = srgb(0.36, 0.35, 0.20)
CARAPACE = srgb(0.30, 0.27, 0.15)
SOMBRE  = srgb(0.16, 0.14, 0.08)
PLASTRON = srgb(0.82, 0.78, 0.62)

def hachage(co):                                # un « hasard » stable par sommet
    return abs(math.sin(co.x * 91.7 + co.y * 47.3 + co.z * 173.9) * 43758.5) % 1.0

def retouche(co, c):
    for oeil in YEUX:
        if (co - Vector(oeil)).length < 0.02:
            return [0.01, 0.01, 0.012]
    dans_carapace = abs(co.y) < 0.52 and abs(co.x) < 0.42 and co.z > -0.03 and (co.x / 0.40) ** 2 + (co.y / 0.50) ** 2 < 1.05
    if dans_carapace:
        # écailles : des taches sombres, plus denses vers le bord
        bord = (co.x / 0.40) ** 2 + (co.y / 0.50) ** 2
        return list(SOMBRE) if hachage(co) < 0.25 + 0.35 * bord else list(CARAPACE)
    if co.z < -0.04 and abs(co.x) < 0.30 and abs(co.y) < 0.45:
        return list(PLASTRON)                    # le ventre
    return list(SOMBRE) if hachage(co) < 0.3 else list(OLIVE)   # peau mouchetée

colorer_ventre_dos(tortue, dos=OLIVE, ventre=OLIVE, retouche=retouche)
tortue.data.materials.append(materiau_peau('Peau_Tortue', rugosite=0.65))

# ---------------------------------------------------------------- squelette et nage
OS = [
    ('racine',   (0.0, 0.05, 0.0),      (0.0, 0.30, 0.0),      None),
    ('cou',      (0.0, -0.40, -0.01),   (0.0, -0.62, -0.01),   'racine'),
    ('tete',     (0.0, -0.62, -0.01),   (0.0, -0.80, -0.01),   'cou'),
    ('nag_av_g', (0.32, -0.20, -0.02),  (0.88, -0.20, -0.06),  'racine'),
    ('nag_av_d', (-0.32, -0.20, -0.02), (-0.88, -0.20, -0.06), 'racine'),
    ('nag_ar_g', (0.26, 0.40, -0.03),   (0.50, 0.58, -0.06),   'racine'),
    ('nag_ar_d', (-0.26, 0.40, -0.03),  (-0.50, 0.58, -0.06),  'racine'),
    ('queue',    (0.0, 0.46, -0.03),    (0.0, 0.64, -0.03),    'racine'),
]
armature = squelette('Armature_Tortue', OS)
peser_par_parties(tortue, armature, OS, registre)
R = 'rotation_euler'
animer_os(armature, {
    # avant : battement vertical (X) + balayage (Z) en quadrature → un « huit » qui rame
    'nag_av_g': [(R, 0, 0.55, 0.0, 0.0), (R, 2, 0.20, 1.57, 0.0)],
    'nag_av_d': [(R, 0, 0.55, 0.0, 0.0), (R, 2, -0.20, 1.57, 0.0)],
    # arrière : en opposition, plus discret
    'nag_ar_g': [(R, 0, 0.22, 3.14, 0.0), (R, 2, 0.10, 4.71, 0.0)],
    'nag_ar_d': [(R, 0, 0.22, 3.14, 0.0), (R, 2, -0.10, 4.71, 0.0)],
    'cou':      [(R, 0, 0.06, 0.4, 0.0)],
    'tete':     [(R, 0, 0.05, 0.9, 0.0)],
    'racine':   [(R, 0, 0.025, 0.0, 0.0)],
    'queue':    [(R, 2, 0.15, 1.0, 0.0)],
}, images=96)                                   # 4 s par cycle : majestueux

chemin = exporter_glb('tortue.glb')
inspecter_glb(chemin)
