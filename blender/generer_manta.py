"""
generer_manta.py — la raie manta géante (Mobula birostris), v2
===============================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_manta.py

Cinq mètres d'envergure. Ce qui fait une manta :
- un disque : corps central aplati + deux AILES en delta (bord d'attaque qui
  recule, bord de fuite concave, pointes effilées), trois os par aile pour une
  onde de battement qui court de l'emplanture au bout ;
- deux LOBES CÉPHALIQUES en avant de la bouche (terminale, large) ; les yeux sur
  les côtés de la tête ; cinq paires de fentes branchiales SOUS le disque ;
- dos noir à deux ÉPAULETTES blanches en T (M. birostris), ventre blanc à taches
  sombres sur l'abdomen, bordure sombre sous le bord de fuite ; une queue en fouet
  avec une petite dorsale à sa base. Cinq secondes par battement.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector
from commun import *
from peau import *
from mouvement import Mouvement, glisse

nettoyer_scene()
bm = nouveau_bmesh(zones=('corps', 'ailes', 'lobes', 'yeux'))
registre = []

# ---------------------------------------------------------------- 1) le corps central (plat) et la queue
CLES = [
    (-1.35, 0.30, 0.050, 0.050, -0.020),
    (-1.25, 0.36, 0.090, 0.080, -0.010),
    (-1.05, 0.42, 0.140, 0.120,  0.000),
    (-0.70, 0.48, 0.200, 0.170,  0.000),
    (-0.30, 0.50, 0.230, 0.190,  0.000),
    ( 0.10, 0.46, 0.210, 0.170,  0.000),
    ( 0.50, 0.36, 0.150, 0.120,  0.000),
    ( 0.85, 0.22, 0.090, 0.070,  0.000),
    ( 1.05, 0.10, 0.050, 0.040,  0.000),
    ( 1.15, 0.03, 0.020, 0.020,  0.000),
]
corps_v = corps(bm, CLES, anneaux=40, segments=32, exposant=2.4, zone='corps')
marquer(bm, corps_v, 'racine', registre)
queue = corps(bm, [(1.08, 0.050, 0.040, 0.035, 0.0), (1.40, 0.030, 0.025, 0.020, 0.0), (2.00, 0.015, 0.012, 0.012, 0.0), (2.60, 0.004, 0.004, 0.004, 0.0)],
              anneaux=16, segments=10, exposant=2.0, zone='corps')
marquer(bm, [v for v in queue if v.co.y < 1.8], 'queue_1', registre, ((0.0, 1.1, 0.0), 0.25))
marquer(bm, [v for v in queue if v.co.y >= 1.8], 'queue_2', registre, ((0.0, 1.8, 0.0), 0.25))
# petite dorsale à la base de la queue
d = nageoire_loft(bm, (0, 0, 0.02), (0, 0, 1), (0, 1, 0), [
    (0.00, 0.85, 1.15, 0.030), (0.06, 0.90, 1.10, 0.025), (0.14, 0.98, 1.08, 0.015), (0.20, 1.05, 1.07, 0.0)],
    segments=10, zone='corps')
marquer(bm, d, 'racine', registre)

# ---------------------------------------------------------------- 2) les ailes (delta), trois os chacune
for s, nom in ((+1, 'aile_g'), (-1, 'aile_d')):
    v = nageoire_loft(bm, (s * 0.20, 0, 0.0), (s * 1.0, 0.0, 0.0), (0, 1, 0), [
        (0.00, -1.15, 0.70, 0.200), (0.20, -1.08, 0.60, 0.170), (0.50, -0.95, 0.42, 0.130),
        (0.85, -0.78, 0.22, 0.100), (1.25, -0.55, 0.02, 0.070), (1.65, -0.30, -0.10, 0.045),
        (1.95, -0.12, -0.02, 0.028), (2.15, 0.00, 0.08, 0.015), (2.30, 0.06, 0.09, 0.0)], segments=16, zone='ailes')
    marquer(bm, [p for p in v if abs(p.co.x) < 1.0], f'{nom}_1', registre, ((s * 0.35, -0.2, 0.0), 0.45))
    marquer(bm, [p for p in v if 1.0 <= abs(p.co.x) < 1.75], f'{nom}_2', registre, ((s * 1.0, -0.35, 0.0), 0.35))
    marquer(bm, [p for p in v if abs(p.co.x) >= 1.75], f'{nom}_3', registre, ((s * 1.75, -0.30, 0.0), 0.30))
    # lobes céphaliques : des palettes vers l'avant, un peu vers le bas
    lobe = nageoire_loft(bm, (s * 0.26, -1.22, -0.02), (s * 0.08, -0.95, -0.30), (s * 1.0, 0, 0), [
        (0.00, -0.10, 0.10, 0.050), (0.15, -0.11, 0.11, 0.045), (0.30, -0.10, 0.10, 0.040),
        (0.42, -0.08, 0.08, 0.030), (0.50, -0.04, 0.04, 0.015), (0.54, -0.01, 0.01, 0.0)], segments=12, zone='lobes')
    marquer(bm, lobe, f'lobe_{nom[-1]}', registre, ((s * 0.26, -1.22, -0.02), 0.12))

# ---------------------------------------------------------------- 3) les yeux
YEUX = [(+0.47, -1.05, 0.05), (-0.47, -1.05, 0.05)]
for oeil in YEUX:
    o = sphere(bm, oeil, 0.040, segments=14, anneaux=9)
    marquer_zone(bm, o, 'yeux')
    marquer(bm, o, 'racine', registre)

manta = terminer_maillage(bm, 'Manta')
sub = manta.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 4) la peau
DOS = (0.06, 0.08, 0.11)
EPAULETTE = (0.72, 0.74, 0.74)
VENTRE = (0.90, 0.91, 0.90)
TACHE = (0.12, 0.13, 0.15)
NOIR = (0.03, 0.03, 0.04)

def fentes(t):
    f = np.zeros(t.N, np.float32)
    for k in range(5):
        yk = -0.92 + 0.13 * k + 0.12 * (np.abs(t.x) - 0.12)           # légèrement obliques
        f = np.maximum(f, trait(t.y, yk, 0.02) * (np.abs(t.x) > 0.10) * (np.abs(t.x) < 0.36))
    return f * (t.n[:, 2] < -0.3) * t.zone('corps')

def couleur(t):
    dessus = lisser(-0.25, 0.25, t.n[:, 2])
    corps_, ailes, lobes = t.zone('corps'), t.zone('ailes'), t.zone('lobes')
    disque = corps_ + ailes
    c_dos = melanger(DOS, (0.10, 0.12, 0.15), 0.5 * lisser(0.2, 0.8, fbm(t.p * 3, 3, graine=1)))
    # épaulettes en T : deux triangles clairs sur les épaules + la barre le long du front
    ax = np.abs(t.x)
    flou = 0.06 * fbm(t.p * 2.5, 3, graine=4)                                      # bords organiques
    yb = -1.12 + 0.62 * np.clip((ax - 0.22) / 0.73, 0, 1) ** 1.3 + flou
    epaulette = lisser(0.18, 0.28, ax + flou) * (1 - lisser(0.88, 0.98, ax)) * (1 - lisser(yb - 0.06, yb + 0.06, t.y))
    barre = (1 - lisser(-1.26, -1.16, t.y + flou)) * (1 - lisser(0.36, 0.50, ax))
    c_dos = melanger(c_dos, EPAULETTE, np.clip(epaulette + barre, 0, 1) * disque * (t.y < -0.5))
    # ventre blanc, taches sombres sur l'abdomen, bordure sombre sous le bord de fuite des ailes
    c_ventre = melanger(VENTRE, (0.80, 0.82, 0.82), 0.4 * lisser(0.2, 0.8, fbm(t.p * 4, 2, graine=2)))
    F1, _, _ = cellules(t.p / 0.16, graine=3)
    abdomen = lisser(-0.35, -0.1, t.y) * (1 - lisser(0.75, 0.95, t.y)) * (1 - lisser(0.45, 0.75, ax))
    c_ventre = melanger(c_ventre, TACHE, (1 - lisser(0.18, 0.26, F1)) * abdomen)
    c_ventre = melanger(c_ventre, TACHE, ailes * lisser(0.80, 0.95, t.v) * 0.85)
    c_ventre = melanger(c_ventre, TACHE, ailes * lisser(0.88, 1.0, t.u) * 0.7)
    c = melanger(c_ventre, c_dos, dessus) * (disque + lobes)[:, None]
    c = melanger(c, NOIR, fentes(t))
    # la bouche : une large fente sombre en travers du front, entre les lobes
    front = lisser(-0.35, -0.8, t.n[:, 1])
    c = melanger(c, NOIR, 0.85 * trait(t.z, -0.02, 0.07) * front * (np.abs(t.x) < 0.30) * corps_)
    a = angle_vers(t, YEUX, lambda c_: (np.sign(c_[0]), 0.0, 0.0))
    c_oeil = melanger((0.10, 0.10, 0.10), (0.05, 0.05, 0.06), 1 - lisser(0.5, 0.7, a))
    c_oeil = melanger(c_oeil, NOIR, 1 - lisser(0.35, 0.45, a))
    return melanger(c, c_oeil, t.zone('yeux'))

def hauteur(t):
    h = -0.012 * fentes(t)
    h += 0.0015 * fbm(t.p * 12, 3, graine=5) * (t.zone('corps') + t.zone('ailes'))
    front = lisser(-0.35, -0.8, t.n[:, 1])
    h -= 0.02 * trait(t.z, -0.02, 0.07) * front * (np.abs(t.x) < 0.30) * t.zone('corps')
    return h

def rugosite(t):
    return np.where(t.zone('yeux') > 0.5, 0.15, 0.58 - 0.06 * lisser(-0.25, 0.25, -t.n[:, 2]))

texturer(manta, 'Peau_Manta', resolution=2048, resolution_relief=1024, resolution_orm=512,
         couleur=couleur, hauteur=hauteur, rugosite=rugosite)

# ---------------------------------------------------------------- 5) squelette et vol
# Les ailes battent comme celles d'un oiseau lent : une onde court de l'emplanture au
# bout (chaque os suit le précédent avec retard), le bout s'enroule en fin de course
# (harmonique 2) et l'aile VRILLE — le bord de fuite se relève sur la remontée — pour
# garder de la portance. Le disque tangue et monte avec chaque battement ; les lobes
# céphaliques ondulent ; la queue suit. 5 s par battement, deux par clip, et une glisse.
OS = [
    ('racine',   (0.0, 0.5, 0.0),     (0.0, -0.5, 0.0),   None),
    ('aile_g_1', (0.35, -0.20, 0.0),  (1.0, -0.35, 0.0),  'racine'),
    ('aile_g_2', (1.0, -0.35, 0.0),   (1.75, -0.30, 0.0), 'aile_g_1'),
    ('aile_g_3', (1.75, -0.30, 0.0),  (2.45, -0.10, 0.0), 'aile_g_2'),
    ('aile_d_1', (-0.35, -0.20, 0.0), (-1.0, -0.35, 0.0), 'racine'),
    ('aile_d_2', (-1.0, -0.35, 0.0),  (-1.75, -0.30, 0.0), 'aile_d_1'),
    ('aile_d_3', (-1.75, -0.30, 0.0), (-2.45, -0.10, 0.0), 'aile_d_2'),
    ('lobe_g',   (0.26, -1.22, -0.02), (0.30, -1.70, -0.17), 'racine'),
    ('lobe_d',   (-0.26, -1.22, -0.02), (-0.30, -1.70, -0.17), 'racine'),
    ('queue_1',  (0.0, 1.1, 0.0),     (0.0, 1.8, 0.0),    'racine'),
    ('queue_2',  (0.0, 1.8, 0.0),     (0.0, 2.6, 0.0),    'queue_1'),
]
armature = squelette('Armature_Manta', OS)
peser_par_parties(manta, armature, OS, registre)

PERIODE = 5.0
R, L = 'rotation_euler', 'location'
enroule = lambda t: math.sin(t) + 0.25 * math.sin(2 * t)         # le bout s'enroule en fin de course

def vol(m):
    m.modulation(0.12, graine=6)
    for cote, s in (('g', 1), ('d', -1)):
        # battement (X local = autour de l'axe du corps) : une onde de l'emplanture au bout
        m.secondaire(f'aile_{cote}_1', R, 0, 0.24, phase=0.0)
        m.secondaire(f'aile_{cote}_2', R, 0, 0.30, phase=-0.55)
        m.secondaire(f'aile_{cote}_3', R, 0, 0.36, phase=-1.10, forme=enroule)
        # vrillage (Y local = autour de l'axe de l'aile) : en quadrature, plus fort vers le bout
        m.secondaire(f'aile_{cote}_2', R, 1, 0.08 * s, phase=1.2)
        m.secondaire(f'aile_{cote}_3', R, 1, 0.16 * s, phase=1.0)
        m.secondaire(f'lobe_{cote}', R, 1, 0.10 * s, phase=0.5)
        m.secondaire(f'lobe_{cote}', R, 0, 0.06, cycles_par_clip=1, phase=0.3 * s)
    m.secondaire('racine', L, 2, 0.08, phase=1.2)                     # le disque monte et descend…
    m.secondaire('racine', R, 0, 0.03, phase=0.9)                     # …et tangue
    m.secondaire('queue_1', R, 0, 0.08, phase=-1.0)
    m.secondaire('queue_2', R, 0, 0.14, phase=-1.8)
    m.secondaire('queue_1', R, 2, 0.04, cycles_par_clip=1, phase=0.7)

m = Mouvement(armature, PERIODE, cycles=2)
vol(m)
m.cuire('swim')
glisse(armature, vol, PERIODE, facteur_amplitude=0.25, facteur_periode=1.5, cycles=1)

chemin = exporter_glb('manta.glb')
inspecter_glb(chemin)
