"""
generer_manta.py — la raie manta (Mobula birostris)
====================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_manta.py

Cinq mètres d'envergure. Un corps central aplati, deux AILES par loft de sections
(corde et épaisseur décroissantes, bord d'attaque qui recule vers le bout), deux
lobes céphaliques à l'avant, une queue fine. Dos sombre à épaulettes claires,
ventre blanc tacheté. Rig : racine + deux os par aile + queue ; les ailes battent
lentement, le bout en retard sur l'emplanture (5 s par cycle).
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
from commun import *

nettoyer_scene()
bm = nouveau_bmesh()
registre = []

# ---------------------------------------------------------------- corps central + lobes + yeux
corps = ellipsoide(bm, (0.0, -0.05, 0.0), (0.48, 1.15, 0.21), segments=28, anneaux=18, aplatir_dessous=0.7)
for s in (+1, -1):                                  # lobes céphaliques : deux palettes vers l'avant
    corps += ellipsoide(bm, (s * 0.30, -1.28, -0.04), (0.075, 0.24, 0.05), segments=14, anneaux=10)
YEUX = [(+0.44, -1.02, 0.03), (-0.44, -1.02, 0.03)]
for oeil in YEUX:
    corps += sphere(bm, oeil, 0.035, segments=12, anneaux=8)
marquer(bm, corps, 'racine', registre)

# ---------------------------------------------------------------- les ailes
# (x, bord d'attaque, bord de fuite, demi-épaisseur) — l'attaque recule vers le bout : aile en delta
SECTIONS = [(0.35, -0.98, 0.78, 0.17), (0.90, -0.82, 0.56, 0.12), (1.50, -0.56, 0.26, 0.08),
            (2.00, -0.30, 0.02, 0.05), (2.40, -0.10, -0.06, 0.03), (2.55, 0.0, 0.0, 0.0)]
for s, nom in ((+1, 'aile_g'), (-1, 'aile_d')):
    sommets = aile(bm, [(s * x, y0, y1, e) for x, y0, y1, e in SECTIONS], segments=16)
    marquer(bm, [v for v in sommets if abs(v.co.x) < 1.40], f'{nom}_1', registre, ((s * 0.40, -0.10, 0.0), 0.45))
    marquer(bm, [v for v in sommets if abs(v.co.x) >= 1.40], f'{nom}_2', registre, ((s * 1.40, -0.15, 0.0), 0.45))

# ---------------------------------------------------------------- la queue
marquer(bm, corps_fusiforme(bm, [(0.0, 0.035, 0.03), (0.4, 0.02, 0.018), (1.0, 0.006, 0.006)],
                            y_debut=0.85, y_fin=2.3, stations=10, segments=10, aplatir_ventre=1.0),
        'queue', registre, ((0.0, 1.0, 0.0), 0.2))

manta = terminer_maillage(bm, 'Manta')
sub = manta.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- la peau
DOS = srgb(0.09, 0.10, 0.12)
EPAULETTE = srgb(0.38, 0.40, 0.42)
VENTRE = srgb(0.90, 0.92, 0.92)
TACHE = srgb(0.16, 0.17, 0.19)

def hachage(co):
    return abs(math.sin(co.x * 91.7 + co.y * 47.3 + co.z * 173.9) * 43758.5) % 1.0

def retouche(co, c):
    for oeil in YEUX:
        if (co - Vector(oeil)).length < 0.045:
            return [0.01, 0.01, 0.012]
    if co.z > 0.02 and 0.25 < abs(co.x) < 0.85 and -0.95 < co.y < -0.35:
        return list(EPAULETTE)                       # les épaulettes claires des épaules
    if co.z < -0.02 and hachage(co) < 0.10:
        return list(TACHE)                           # taches du ventre : uniques à chaque individu
    return c

colorer_ventre_dos(manta, dos=DOS, ventre=VENTRE, z_bas=-0.02, z_haut=0.02, retouche=retouche)
manta.data.materials.append(materiau_peau('Peau_Manta', rugosite=0.6))

# ---------------------------------------------------------------- squelette et vol
OS = [
    ('racine',  (0.0, 0.5, 0.0),     (0.0, -0.5, 0.0),   None),
    ('aile_g_1', (0.40, -0.10, 0.0), (1.40, -0.15, 0.0), 'racine'),
    ('aile_g_2', (1.40, -0.15, 0.0), (2.55, -0.05, 0.0), 'aile_g_1'),
    ('aile_d_1', (-0.40, -0.10, 0.0), (-1.40, -0.15, 0.0), 'racine'),
    ('aile_d_2', (-1.40, -0.15, 0.0), (-2.55, -0.05, 0.0), 'aile_d_1'),
    ('queue',   (0.0, 1.0, 0.0),     (0.0, 2.3, 0.0),    'racine'),
]
armature = squelette('Armature_Manta', OS)
peser_par_parties(manta, armature, OS, registre)
R, L = 'rotation_euler', 'location'
animer_os(armature, {
    # les ailes battent ; le bout suit l'emplanture avec un retard : l'aile ondule
    'aile_g_1': [(R, 0, 0.30, 0.0, 0.0)],  'aile_g_2': [(R, 0, 0.32, -0.7, 0.0)],
    'aile_d_1': [(R, 0, 0.30, 0.0, 0.0)],  'aile_d_2': [(R, 0, 0.32, -0.7, 0.0)],
    'racine':   [(L, 2, 0.06, 1.2, 0.0), (R, 0, 0.03, 0.9, 0.0)],   # le corps monte et descend, tangue un peu
    'queue':    [(R, 0, 0.10, -1.0, 0.0)],
}, images=120)                                       # 5 s par battement

chemin = exporter_glb('manta.glb')
inspecter_glb(chemin)
