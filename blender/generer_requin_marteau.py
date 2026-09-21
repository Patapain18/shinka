"""
generer_requin_marteau.py — le requin-marteau halicorne (Sphyrna lewini), v2
============================================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_requin_marteau.py

3,3 m. Ce qui fait un halicorne (« scalloped hammerhead ») :
- le céphalofoil : une tête en aile, large de 86 cm (27 % de la longueur), au bord
  d'attaque FESTONNÉ — une encoche médiane et une de chaque côté — les yeux au bout
  des lobes ; construit comme deux ailes plates (nageoire_loft) plantées dans une
  tête aplatie ;
- la bouche petite et arquée, SOUS la tête, en arrière du céphalofoil ;
- une première dorsale très haute et falciforme ; une seconde dorsale basse à
  longue pointe libre ; des pectorales courtes à pointe sombre ;
- gris-brun bronze dessus, blanc dessous. Grand animal : 3 s par ondulation, la
  tête balaie latéralement (c'est un radar à raies enfouies).
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from commun import *
from peau import *
from requins import peau_requin
from mouvement import Mouvement, glisse

nettoyer_scene()
bm = nouveau_bmesh(zones=('corps', 'tete', 'nageoires', 'caudale', 'yeux'))
registre = []

# ---------------------------------------------------------------- 1) le corps
# Plus élancé que le requin gris ; la tête est une plaque : très large, très plate.
CLES = [
    (-1.540, 0.070, 0.028, 0.032, -0.050),      # le corps s'arrête DANS l'encoche médiane du céphalofoil
    (-1.520, 0.130, 0.040, 0.044, -0.050),
    (-1.490, 0.180, 0.058, 0.062, -0.046),
    (-1.390, 0.190, 0.080, 0.088, -0.040),
    (-1.260, 0.180, 0.102, 0.112, -0.030),
    (-1.100, 0.172, 0.132, 0.138, -0.020),
    (-0.900, 0.186, 0.172, 0.166, -0.010),
    (-0.600, 0.200, 0.216, 0.200,  0.000),
    (-0.350, 0.205, 0.245, 0.220,  0.000),
    (-0.050, 0.195, 0.240, 0.210,  0.000),
    ( 0.250, 0.170, 0.200, 0.175,  0.000),
    ( 0.550, 0.130, 0.150, 0.130,  0.000),
    ( 0.800, 0.090, 0.105, 0.090,  0.005),
    ( 0.980, 0.056, 0.070, 0.056,  0.010),
    ( 1.080, 0.040, 0.055, 0.045,  0.015),
    ( 1.160, 0.015, 0.025, 0.020,  0.020),
]
corps(bm, CLES, anneaux=56, segments=28, exposant=2.2, zone='corps')

# ---------------------------------------------------------------- 2) le céphalofoil
# Deux ailes plates depuis le centre de la tête ; le bord d'attaque (attaque) ondule :
# bombé au milieu de chaque lobe, creusé entre (l'encoche médiane est au centre,
# là où les deux ailes se rejoignent en retrait).
for s in (+1, -1):
    nageoire_loft(bm, (0, -1.45, -0.035), (s * 1.0, 0.0, 0.0), (0, 1, 0), [
        (0.00, -0.115, 0.160, 0.052), (0.06, -0.140, 0.140, 0.050), (0.12, -0.150, 0.125, 0.048),
        (0.19, -0.128, 0.105, 0.045), (0.25, -0.138, 0.080, 0.042), (0.31, -0.140, 0.055, 0.040),
        (0.37, -0.120, 0.025, 0.036), (0.41, -0.090, 0.000, 0.030), (0.44, -0.060, -0.020, 0.0)],
        segments=16, zone='tete')
YEUX = [(+0.415, -1.500, -0.035), (-0.415, -1.500, -0.035)]
for oeil in YEUX:
    marquer_zone(bm, sphere(bm, oeil, 0.034, segments=16, anneaux=10), 'yeux')

# ---------------------------------------------------------------- 3) les nageoires
# Première dorsale : très haute (≈ 40 cm au-dessus du dos), falciforme
nageoire_loft(bm, (0, 0, 0.20), (0, 0, 1), (0, 1, 0), [
    (0.00, -0.550, 0.120, 0.030), (0.06, -0.540, 0.050, 0.027), (0.11, -0.520, -0.060, 0.023),
    (0.18, -0.480, -0.130, 0.018), (0.26, -0.420, -0.170, 0.013), (0.34, -0.340, -0.190, 0.009),
    (0.42, -0.250, -0.200, 0.006), (0.48, -0.190, -0.190, 0.0)], segments=14, zone='nageoires')
# Seconde dorsale : basse, longue pointe libre arrière ; anale en vis-à-vis
nageoire_loft(bm, (0, 0, 0.12), (0, 0, 1), (0, 1, 0), [
    (0.00, 0.500, 0.850, 0.014), (0.03, 0.520, 0.820, 0.012), (0.06, 0.550, 0.740, 0.009),
    (0.09, 0.580, 0.680, 0.006), (0.12, 0.620, 0.660, 0.0)], segments=12, zone='nageoires')
nageoire_loft(bm, (0, 0, -0.10), (0, 0, -1), (0, 1, 0), [
    (0.00, 0.480, 0.800, 0.014), (0.03, 0.500, 0.780, 0.012), (0.06, 0.530, 0.700, 0.009),
    (0.10, 0.570, 0.660, 0.006), (0.13, 0.610, 0.640, 0.0)], segments=12, zone='nageoires')
for s in (+1, -1):
    v = nageoire_loft(bm, (s * 0.17, 0, -0.06), (s * 1.0, 0.12, -0.40), (0, 1, 0), [
        (0.00, -0.800, -0.300, 0.030), (0.06, -0.790, -0.360, 0.027), (0.14, -0.760, -0.450, 0.022),
        (0.24, -0.700, -0.500, 0.017), (0.34, -0.600, -0.480, 0.013), (0.43, -0.490, -0.400, 0.008),
        (0.50, -0.400, -0.330, 0.004), (0.54, -0.350, -0.310, 0.0)], segments=14, zone='nageoires')
    marquer(bm, v, 'pec_g' if s > 0 else 'pec_d', registre, ((s * 0.17, -0.55, -0.06), 0.16))
    nageoire_loft(bm, (s * 0.10, 0, -0.12), (s * 1.0, 0.35, -0.50), (0, 1, 0), [
        (0.00, 0.280, 0.520, 0.014), (0.05, 0.300, 0.520, 0.012), (0.11, 0.350, 0.540, 0.009),
        (0.17, 0.420, 0.560, 0.005), (0.21, 0.480, 0.550, 0.0)], segments=10, zone='nageoires')
# Caudale : lobe supérieur long, encoche sous-terminale ; lobe inférieur court
nageoire_loft(bm, (0, 1.02, 0.0), (0, 0.80, 0.60), (0, 0.60, -0.80), [
    (0.00, -0.105, 0.125, 0.036), (0.10, -0.088, 0.215, 0.030), (0.24, -0.080, 0.300, 0.025),
    (0.41, -0.070, 0.320, 0.020), (0.58, -0.062, 0.265, 0.014), (0.72, -0.053, 0.175, 0.011),
    (0.79, -0.045, 0.095, 0.009), (0.86, -0.036, 0.130, 0.007), (0.94, -0.018, 0.085, 0.004),
    (1.00, 0.000, 0.035, 0.0)], segments=14, zone='caudale')
nageoire_loft(bm, (0, 1.02, -0.02), (0, 0.55, -0.83), (0, 0.83, 0.55), [
    (0.00, -0.090, 0.090, 0.032), (0.09, -0.080, 0.140, 0.025), (0.21, -0.070, 0.180, 0.020),
    (0.36, -0.053, 0.140, 0.012), (0.46, -0.036, 0.090, 0.007), (0.53, -0.018, 0.036, 0.0)],
    segments=12, zone='caudale')

requin = terminer_maillage(bm, 'RequinMarteau')
sub = requin.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 4) la peau
couleur, hauteur, rugosite = peau_requin(dict(
    echelle=1.8, dos=(0.44, 0.42, 0.37), bronze=(0.50, 0.45, 0.36), ventre=(0.90, 0.89, 0.85),
    seuil_flanc=0.215, tete_grise=0.05,
    ouies=dict(y0=-1.05, pas=0.05, x_min=0.13, z_centre=-0.01, demi_hauteur=0.11, inclinaison=0.04),
    bouche=dict(y_apex=-1.27, courbure=6.0, x_max=0.125),
    narines=[(0.30, -1.585), (-0.30, -1.585)], narine_rx=0.02, narine_ry=0.006,
    yeux=YEUX, oeil=dict(pupille=(0.02, 0.02, 0.02), iris=(0.10, 0.12, 0.10), sclere=(0.22, 0.22, 0.20)),
    pointes_sombres=0.8, liseret_dorsal=0.3, caudale_noire=0.55,
))
texturer(requin, 'Peau_RequinMarteau', resolution=2048, resolution_relief=1024, resolution_orm=512,
         couleur=couleur, hauteur=hauteur, rugosite=rugosite)

# ---------------------------------------------------------------- 5) squelette et nage
# Colonne de 7 os + un os par pectorale. Onde de nage carangiforme (mouvement.py) : le
# marteau balaie la tête un peu plus qu'un requin gris (A_tete 2 %) — il « scanne » le
# sable —, la caudale suit avec retard ; 2 s par battement, quatre battements par clip.
CHAINE = [('racine', -0.55, 0.05), ('tete', -0.55, -1.54), ('corps_1', 0.05, 0.45), ('corps_2', 0.45, 0.80),
          ('queue_1', 0.80, 1.05), ('queue_2', 1.05, 1.35), ('caudale', 1.35, 1.85)]
OS = [('racine',  (0, -0.55, 0), (0, 0.05, 0), None),
      ('tete',    (0, -0.55, 0), (0, -1.54, 0), 'racine'),
      ('corps_1', (0, 0.05, 0), (0, 0.45, 0), 'racine'),
      ('corps_2', (0, 0.45, 0), (0, 0.80, 0), 'corps_1'),
      ('queue_1', (0, 0.80, 0), (0, 1.05, 0), 'corps_2'),
      ('queue_2', (0, 1.05, 0), (0, 1.35, 0), 'queue_1'),
      ('caudale', (0, 1.35, 0), (0, 1.85, 0), 'queue_2'),
      ('pec_g',   (0.17, -0.55, -0.06), (0.62, -0.40, -0.26), 'racine'),
      ('pec_d',   (-0.17, -0.55, -0.06), (-0.62, -0.40, -0.26), 'racine')]
armature = squelette('Armature_Marteau', OS)
peser_par_parties(requin, armature, OS, registre, colonne=CHAINE)

PERIODE = 2.0

def nage(m):
    m.modulation(0.12, graine=1)
    m.onde(CHAINE, longueur=3.39, s_museau=-1.54, A_tete=0.02, A_queue=0.10, exposant=2.0,
           longueur_onde=1.0, retard_caudal=0.5, s_caudal=0.80)
    m.secondaire('racine', 'rotation_euler', 1, 0.02, phase=1.2)
    m.secondaire('tete', 'rotation_euler', 1, 0.03, phase=0.4)                      # la tête roule un peu en balayant
    for nom, s in (('pec_g', 1), ('pec_d', -1)):
        m.secondaire(nom, 'rotation_euler', 1, 0.05 * s, phase=0.6)
        m.secondaire(nom, 'rotation_euler', 0, 0.04, cycles_par_clip=1, phase=0.4 * s)

m = Mouvement(armature, PERIODE, cycles=4)
nage(m)
m.cuire('swim')
glisse(armature, nage, PERIODE)

chemin = exporter_glb('requin-marteau.glb')
inspecter_glb(chemin)
