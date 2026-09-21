"""
generer_meduse.py — la méduse lune (Aurelia aurita)
====================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_meduse.py

Cloche translucide de 36 cm (ellipsoïde très aplati dessous), quatre anneaux
rosés sur le dessus (les gonades), une frange de 16 filaments et quatre bras
buccaux frangés. Construite CLOCHE VERS LE HAUT (+Z Blender = +Y Three).
Rig : un os « cloche » dont on anime l'ÉCHELLE (contraction / relâchement), et
quatre chaînes de deux os pour les bras, qui traînent derrière la pulsation.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
from commun import *

nettoyer_scene()
bm = nouveau_bmesh()
registre = []

# ---------------------------------------------------------------- la cloche
marquer(bm, ellipsoide(bm, (0.0, 0.0, 0.0), (0.18, 0.18, 0.11), segments=32, anneaux=20, aplatir_dessous=0.25),
        'cloche', registre)

def chaine(angle):
    """Les quatre chaînes d'os sont à 45°, 135°, 225°, 315° : on rattache chaque
    filament à la plus proche de son angle."""
    return int(round((math.degrees(angle) - 45.0) / 90.0)) % 4

def ruban(points_axe, largeurs, epaisseur, angle, pli):
    """Un ruban qui descend : points_axe = [(r, z)…] le long du ruban, largeurs = demi-largeur
    à chaque point. Rattaché aux os bras{k}_1 (partie haute) et bras{k}_2 (partie basse)."""
    u = Vector((-math.sin(angle), math.cos(angle), 0.0))   # perpendiculaire au rayon
    axe = [Vector((r * math.cos(angle), r * math.sin(angle), z)) for r, z in points_axe]
    gauche = [a + u * w for a, w in zip(axe, largeurs)]
    droite = [a - u * w for a, w in zip(axe, largeurs)]
    sommets = nageoire(bm, [tuple(p) for p in gauche + list(reversed(droite))], epaisseur, pli=pli)
    k = chaine(angle)
    a1 = Vector((0.10 * math.cos(angle), 0.10 * math.sin(angle), -0.14))
    marquer(bm, [v for v in sommets if v.co.z > -0.14], f'bras{k}_1', registre, (tuple(axe[0]), 0.06))
    marquer(bm, [v for v in sommets if v.co.z <= -0.14], f'bras{k}_2', registre, (tuple(a1), 0.06))

# ---------------------------------------------------------------- la frange : 16 filaments fins
for k in range(16):
    a = 2 * math.pi * k / 16 + 0.1
    ruban([(0.170, -0.015), (0.185, -0.10), (0.20, -0.22)], [0.003, 0.003, 0.002], 0.004, a, 0.5)

# ---------------------------------------------------------------- quatre bras buccaux frangés
for k in range(4):
    a = math.radians(45 + 90 * k)
    n = 7
    pts = [(0.05 + 0.08 * i / (n - 1), -0.01 - 0.27 * i / (n - 1)) for i in range(n)]
    larg = [0.014 + 0.010 * abs(math.sin(i * 1.9)) for i in range(n)]
    ruban(pts, larg, 0.006, a, 0.4)

meduse = terminer_maillage(bm, 'Meduse')
sub = meduse.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- la « peau » : translucide, gonades rosées
BLANC = srgb(0.86, 0.90, 0.96)
ROSE = srgb(0.88, 0.50, 0.66)
BRAS = srgb(0.84, 0.80, 0.90)
GONADES = [(0.058 * math.cos(math.radians(45 + 90 * k)), 0.058 * math.sin(math.radians(45 + 90 * k))) for k in range(4)]

def retouche(co, c):
    if co.z > 0.03:
        for gx, gy in GONADES:
            d = math.hypot(co.x - gx, co.y - gy)
            if 0.012 < d < 0.032:               # un anneau, pas un disque
                return list(ROSE)
    if co.z < -0.02 and math.hypot(co.x, co.y) < 0.16:
        return list(BRAS)                        # les bras buccaux
    return c

colorer_ventre_dos(meduse, dos=BLANC, ventre=BLANC, retouche=retouche)
meduse.data.materials.append(materiau_peau('Cloche_Meduse', rugosite=0.35, alpha=0.45))

# ---------------------------------------------------------------- squelette et pulsation
OS = [
    ('racine', (0.0, 0.0, 0.10), (0.0, 0.0, 0.16), None),
    ('cloche', (0.0, 0.0, -0.01), (0.0, 0.0, 0.09), 'racine'),
]
for k in range(4):
    a = math.radians(45 + 90 * k)
    c, s_ = math.cos(a), math.sin(a)
    OS.append((f'bras{k}_1', (0.06 * c, 0.06 * s_, -0.01), (0.10 * c, 0.10 * s_, -0.14), 'cloche'))
    OS.append((f'bras{k}_2', (0.10 * c, 0.10 * s_, -0.14), (0.13 * c, 0.13 * s_, -0.28), f'bras{k}_1'))
bras = [nom for nom, _, _, _ in OS if nom.startswith('bras')]
armature = squelette('Armature_Meduse', OS, sans_heritage_echelle=bras)
peser_par_parties(meduse, armature, OS, registre)

R, S, L = 'rotation_euler', 'scale', 'location'
pistes = {
    # la cloche se contracte (X, Y ↓) et se relève (Z ↑) : scale = 1 + amplitude × sin
    'cloche': [(S, 0, -0.12, 0.0, 1.0), (S, 1, -0.12, 0.0, 1.0), (S, 2, 0.10, 0.0, 1.0)],
    'racine': [(L, 2, 0.02, -0.6, 0.0)],        # elle s'élève un peu à chaque contraction
}
for k in range(4):
    pistes[f'bras{k}_1'] = [(R, 0, 0.12, -1.2, 0.0), (R, 2, 0.08, -0.7, 0.0)]   # les bras traînent…
    pistes[f'bras{k}_2'] = [(R, 0, 0.18, -2.0, 0.0), (R, 2, 0.10, -1.5, 0.0)]   # …et le bout encore plus
animer_os(armature, pistes, images=72)          # 3 s par pulsation

chemin = exporter_glb('meduse.glb')
inspecter_glb(chemin)
