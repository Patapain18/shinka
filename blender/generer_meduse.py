"""
generer_meduse.py — la méduse lune (Aurelia aurita), v2
========================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_meduse.py

Cloche de 36 cm, CONSTRUITE CLOCHE VERS LE HAUT (+Z Blender = +Y Three).
Ce qui fait une méduse lune :
- une cloche translucide en forme de soucoupe, épaisse au centre, mince au bord :
  une surface de révolution fermée (dessus + dessous) ;
- quatre gonades en fer à cheval, roses, visibles à travers la cloche ; des canaux
  radiaux à peine plus clairs ; le bord un peu plus lumineux ;
- une frange de tentacules courts et fins tout autour ; quatre bras buccaux
  froncés qui pendent ;
- une pulsation ASYMÉTRIQUE : contraction brève, relâchement long (forme d'onde
  dédiée), les bras et les tentacules traînant derrière.
La texture porte l'ALPHA (transparence) et une carte d'ÉMISSION : le site l'allume
la nuit (lumiere.js) et ce sont les gonades et le bord qui luisent le plus.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector
from commun import *
from peau import *

nettoyer_scene()
bm = nouveau_bmesh(zones=('cloche', 'bras', 'tentacules'))
registre = []

# ---------------------------------------------------------------- 1) la cloche
PROFIL = [(0.000, 0.110), (0.050, 0.107), (0.100, 0.094), (0.140, 0.070), (0.165, 0.040), (0.178, 0.012),
          (0.181, -0.004), (0.174, -0.007), (0.150, 0.014), (0.110, 0.035), (0.060, 0.048), (0.000, 0.052)]
cloche = revolution(bm, PROFIL, segments=48, zone='cloche')
marquer(bm, cloche, 'cloche', registre)

def chaine(angle):
    """Les quatre chaînes d'os sont à 45°, 135°, 225°, 315° : chaque appendice suit la plus proche."""
    return int(round((math.degrees(angle) - 45.0) / 90.0)) % 4

def ruban(points_axe, largeurs, epaisseur, angle, pli, zone):
    """Un ruban qui pend : points_axe = [(r, z), …], largeurs = demi-largeur à chaque
    point. Rattaché aux os bras{k}_1 (haut) et bras{k}_2 (bas) de sa chaîne."""
    u = Vector((-math.sin(angle), math.cos(angle), 0.0))
    axe = [Vector((r * math.cos(angle), r * math.sin(angle), z)) for r, z in points_axe]
    gauche = [a + u * w for a, w in zip(axe, largeurs)]
    droite = [a - u * w for a, w in zip(axe, largeurs)]
    sommets = nageoire(bm, [tuple(p) for p in gauche + list(reversed(droite))], epaisseur, pli=pli)
    n = len(points_axe)
    marquer_zone(bm, sommets, zone, u=[i / (n - 1) for i in range(n)] + [i / (n - 1) for i in reversed(range(n))] +
                 [i / (n - 1) for i in range(n)] + [i / (n - 1) for i in reversed(range(n))])
    k = chaine(angle)
    a1 = Vector((0.10 * math.cos(angle), 0.10 * math.sin(angle), -0.14))
    marquer(bm, [v for v in sommets if v.co.z > -0.14], f'bras{k}_1', registre, (tuple(axe[0]), 0.06))
    marquer(bm, [v for v in sommets if v.co.z <= -0.14], f'bras{k}_2', registre, (tuple(a1), 0.06))

# ---------------------------------------------------------------- 2) la frange : 64 tentacules fins
for k in range(64):
    a = 2 * math.pi * k / 64 + 0.05
    L = 0.16 + 0.06 * math.sin(k * 2.3)
    ruban([(0.176, -0.004), (0.183, -0.03 - L * 0.25), (0.190, -0.03 - L * 0.6), (0.196, -0.03 - L)],
          [0.0022, 0.0018, 0.0014, 0.0008], 0.0025, a, 0.5, 'tentacules')

# ---------------------------------------------------------------- 3) quatre bras buccaux froncés
for k in range(4):
    a = math.radians(45 + 90 * k)
    n = 9
    pts = [(0.045 + 0.075 * i / (n - 1), 0.02 - 0.30 * i / (n - 1)) for i in range(n)]
    larg = [0.016 + 0.011 * abs(math.sin(i * 1.7 + k)) for i in range(n)]
    ruban(pts, larg, 0.006, a, 0.4, 'bras')

meduse = terminer_maillage(bm, 'Meduse')
sub = meduse.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 4) la peau : translucide, gonades, canaux
BLANC = (0.86, 0.91, 0.97)
ROSE = (0.88, 0.52, 0.70)
VIOLET = (0.70, 0.45, 0.72)
GONADES = [math.radians(45 + 90 * k) for k in range(4)]

def gonades(t):
    """Quatre fers à cheval : un anneau (rayon 2,6 cm) autour d'un point à 6 cm du centre,
    ouvert vers l'extérieur."""
    g = np.zeros(t.N, np.float32)
    for a in GONADES:
        cx, cy = 0.062 * math.cos(a), 0.062 * math.sin(a)
        rl = (t.x - cx) * math.cos(a) + (t.y - cy) * math.sin(a)         # coordonnée radiale locale
        d = np.sqrt((t.x - cx) ** 2 + (t.y - cy) ** 2)
        anneau = 1 - lisser(0.006, 0.010, np.abs(d - 0.026))
        g = np.maximum(g, anneau * (1 - lisser(0.010, 0.020, rl)))     # ouvert vers l'extérieur (rl > 0)
    return g * t.zone('cloche') * (t.z > 0.02)

def canaux(t):
    r = np.sqrt(t.x ** 2 + t.y ** 2)
    ang = np.arctan2(t.y, t.x)
    fins = 0.5 + 0.5 * np.cos(ang * 16)
    return lisser(0.94, 0.985, fins) * lisser(0.03, 0.06, r) * t.zone('cloche')

def couleur(t):
    r = np.sqrt(t.x ** 2 + t.y ** 2)
    c = couleur_unie(BLANC, t.N)
    c = melanger(c, VIOLET, 0.35 * gonades(t))
    c = melanger(c, ROSE, 0.8 * gonades(t))
    c = melanger(c, (0.95, 0.97, 1.0), 0.5 * canaux(t))
    c = melanger(c, (0.80, 0.86, 0.96), 0.6 * lisser(0.165, 0.181, r) * t.zone('cloche'))   # le bord
    c = melanger(c, (0.90, 0.88, 0.96), t.zone('bras'))
    c = melanger(c, (0.92, 0.94, 0.98), t.zone('tentacules'))
    return c

def alpha(t):
    r = np.sqrt(t.x ** 2 + t.y ** 2)
    a = 0.55 - 0.30 * lisser(0.06, 0.17, r)                             # épaisse au centre, mince au bord
    a = a + 0.30 * gonades(t) + 0.10 * canaux(t)
    a = np.where(t.zone('bras') > 0.5, 0.62 - 0.25 * lisser(0.5, 1.0, t.u), a)
    a = np.where(t.zone('tentacules') > 0.5, 0.55 - 0.30 * lisser(0.3, 1.0, t.u), a)
    return a

def emission(t):
    r = np.sqrt(t.x ** 2 + t.y ** 2)
    e = couleur_unie((0.30, 0.38, 0.48), t.N)
    e = melanger(e, (0.95, 0.60, 0.80), gonades(t))
    e = melanger(e, (0.70, 0.80, 0.95), 0.6 * canaux(t) + 0.7 * lisser(0.165, 0.181, r) * t.zone('cloche'))
    e = melanger(e, (0.45, 0.42, 0.55), t.zone('bras'))
    e = melanger(e, (0.55, 0.60, 0.72), t.zone('tentacules'))
    return e

def rugosite(t):
    return 0.22 + 0.15 * (t.zone('bras') + t.zone('tentacules'))

texturer(meduse, 'Peau_Meduse', resolution=1024, resolution_relief=512, resolution_orm=256,
         couleur=couleur, alpha=alpha, emission=emission, rugosite=rugosite,
         hauteur=lambda t: 0.0006 * fbm(t.p * 40, 2, graine=3) * t.zone('cloche') - 0.0012 * canaux(t))

# ---------------------------------------------------------------- 5) squelette et pulsation
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

def pulsation(t):
    """Contraction brève (pic) puis long relâchement : 2·((1 + cos t)/2)^3 − 1, dans [-1, 1]."""
    return 2 * ((1 + math.cos(t)) / 2) ** 3 - 1

R, S, L = 'rotation_euler', 'scale', 'location'
pistes = {
    # contraction : la cloche se resserre (X, Y) et se relève (Z) — base 0,94/1,05, amplitude ±0,06/0,05
    'cloche': [(S, 0, -0.06, 0.0, 0.94, pulsation), (S, 1, -0.06, 0.0, 0.94, pulsation), (S, 2, 0.05, 0.0, 1.05, pulsation)],
    'racine': [(L, 2, 0.025, -0.5, 0.0, pulsation)],
}
for k in range(4):
    pistes[f'bras{k}_1'] = [(R, 0, 0.10, -1.0, 0.0, pulsation), (R, 2, 0.06, -0.6, 0.0)]
    pistes[f'bras{k}_2'] = [(R, 0, 0.16, -1.8, 0.0, pulsation), (R, 2, 0.08, -1.3, 0.0)]
animer_os(armature, pistes, images=72)          # 3 s par pulsation

chemin = exporter_glb('meduse.glb')
inspecter_glb(chemin)
