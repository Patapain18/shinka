"""
generer_requin_recif.py — le requin gris de récif (Carcharhinus amblyrhynchos), v2
==================================================================================
Lancer depuis la racine du projet :
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_requin_recif.py

Résultat : models/requin-recif.glb — 1,8 m, corps par loft super-elliptique
(corps()), nageoires épaisses à profil d'aile (nageoire_loft()), peau calculée
point par point (peau.py : couleur 2048², relief 1024², rugosité), colonne de
6 os, action « swim » de 2 s.

Ce qui fait un requin gris de récif, et où ça se voit ici :
- museau modérément long, arrondi vu de dessus, APLATI (haut < bas dans les clés du corps) ;
- bouche en croissant SOUS la tête, cinq fentes branchiales dont les deux
  dernières au-dessus de la base des pectorales (peau : traits + rainures) ;
- première dorsale haute et falciforme, à l'aplomb du bord interne des pectorales ;
  seconde dorsale et anale petites, en face l'une de l'autre ;
- pectorales grandes, en faucille ; caudale hétérocerque (lobe supérieur long,
  encoche sous-terminale) avec sa LARGE BORDURE NOIRE postérieure : la signature
  de l'espèce ; pointes des pectorales et de l'anale sombres ;
- gris à reflet bronze sur le dos, blanc en dessous, la limite sur le flanc.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector
from commun import *
from peau import *
from requins import peau_requin
from mouvement import Mouvement, glisse

nettoyer_scene()
bm = nouveau_bmesh(zones=('corps', 'nageoires', 'caudale', 'yeux'))
registre = []                                   # les parties qui ont leur propre os (pectorales)

# ---------------------------------------------------------------- 1) le corps
# (y, demi-largeur, haut, bas, centre_z) : 1,8 m du museau (-0,90) au bout de la caudale (+0,96).
# La tête est déprimée (haut < bas, centre sous l'axe), le tronc est le plus épais
# sous la première dorsale, le pédoncule caudal est fin et un peu relevé.
CLES = [
    (-0.900, 0.004, 0.003, 0.003, -0.028),
    (-0.885, 0.028, 0.012, 0.012, -0.028),      # museau court, large et arrondi vu de dessus
    (-0.860, 0.048, 0.020, 0.020, -0.026),
    (-0.820, 0.066, 0.031, 0.030, -0.023),
    (-0.760, 0.083, 0.044, 0.043, -0.018),
    (-0.700, 0.093, 0.058, 0.056, -0.012),
    (-0.620, 0.104, 0.075, 0.072, -0.006),
    (-0.500, 0.117, 0.102, 0.095,  0.000),
    (-0.380, 0.128, 0.126, 0.115,  0.002),
    (-0.240, 0.135, 0.150, 0.130,  0.005),
    (-0.080, 0.130, 0.148, 0.128,  0.005),
    ( 0.080, 0.118, 0.135, 0.115,  0.005),
    ( 0.240, 0.095, 0.110, 0.092,  0.005),
    ( 0.380, 0.062, 0.076, 0.062,  0.006),
    ( 0.480, 0.036, 0.048, 0.038,  0.008),
    ( 0.550, 0.026, 0.040, 0.030,  0.010),
    ( 0.610, 0.010, 0.020, 0.012,  0.014),
]
corps(bm, CLES, anneaux=52, segments=28, exposant=2.2, zone='corps')

# ---------------------------------------------------------------- 2) les nageoires (lofts épais)
# Chaque nageoire : origine (dans le corps), direction d'envergure, direction de corde,
# sections (s, bord d'attaque, bord de fuite, demi-épaisseur) — voir nageoire_loft().
# Première dorsale : falciforme, haute (~20 cm au-dessus du dos), pointe libre arrière
nageoire_loft(bm, (0, 0, 0.12), (0, 0, 1), (0, 1, 0), [
    (0.00, -0.300, 0.100, 0.020), (0.04, -0.290, 0.050, 0.018), (0.07, -0.270, -0.010, 0.015),
    (0.11, -0.240, -0.050, 0.012), (0.15, -0.200, -0.075, 0.009), (0.19, -0.155, -0.085, 0.006),
    (0.22, -0.115, -0.085, 0.004), (0.24, -0.090, -0.085, 0.0)], segments=14, zone='nageoires')
# Seconde dorsale et anale : petites, en vis-à-vis, pointe libre arrière
nageoire_loft(bm, (0, 0, 0.07), (0, 0, 1), (0, 1, 0), [
    (0.00, 0.290, 0.440, 0.010), (0.03, 0.300, 0.420, 0.009), (0.05, 0.315, 0.380, 0.007),
    (0.08, 0.340, 0.375, 0.004), (0.10, 0.360, 0.370, 0.0)], segments=12, zone='nageoires')
nageoire_loft(bm, (0, 0, -0.06), (0, 0, -1), (0, 1, 0), [
    (0.00, 0.300, 0.460, 0.010), (0.03, 0.310, 0.440, 0.009), (0.05, 0.325, 0.400, 0.007),
    (0.08, 0.350, 0.390, 0.004), (0.10, 0.370, 0.380, 0.0)], segments=12, zone='nageoires')
for s in (+1, -1):
    # Pectorales : grandes, falciformes, inclinées vers le bas et l'arrière ; chacune a son os
    v = nageoire_loft(bm, (s * 0.10, 0, -0.04), (s * 1.0, 0.12, -0.45), (0, 1, 0), [
        (0.00, -0.460, -0.120, 0.018), (0.04, -0.455, -0.150, 0.016), (0.09, -0.440, -0.210, 0.013),
        (0.15, -0.400, -0.250, 0.010), (0.21, -0.345, -0.250, 0.008), (0.27, -0.280, -0.215, 0.005),
        (0.31, -0.235, -0.185, 0.003), (0.33, -0.215, -0.175, 0.0)], segments=14, zone='nageoires')
    marquer(bm, v, 'pec_g' if s > 0 else 'pec_d', registre, ((s * 0.10, -0.29, -0.04), 0.10))
    # Pelviennes : petites, vers le bas et l'extérieur
    nageoire_loft(bm, (s * 0.06, 0, -0.07), (s * 1.0, 0.35, -0.5), (0, 1, 0), [
        (0.00, 0.160, 0.300, 0.008), (0.03, 0.170, 0.300, 0.007), (0.07, 0.200, 0.310, 0.005),
        (0.11, 0.240, 0.320, 0.003), (0.14, 0.280, 0.320, 0.0)], segments=10, zone='nageoires')
# Caudale hétérocerque : lobe supérieur long (37° au-dessus de l'axe) avec encoche
# sous-terminale, lobe inférieur court (56° en dessous). La corde de chaque lobe va
# de son bord d'attaque (dorsal / ventral) vers son bord de fuite (postérieur).
nageoire_loft(bm, (0, 0.50, 0.0), (0, 0.80, 0.60), (0, 0.60, -0.80), [
    (0.00, -0.060, 0.070, 0.020), (0.06, -0.050, 0.120, 0.017), (0.14, -0.045, 0.170, 0.014),
    (0.24, -0.040, 0.180, 0.011), (0.34, -0.035, 0.150, 0.008), (0.42, -0.030, 0.100, 0.006),
    (0.46, -0.025, 0.055, 0.005), (0.50, -0.020, 0.075, 0.004), (0.55, -0.010, 0.050, 0.002),
    (0.58, 0.000, 0.020, 0.0)], segments=14, zone='caudale')
nageoire_loft(bm, (0, 0.50, -0.01), (0, 0.55, -0.83), (0, 0.83, 0.55), [
    (0.00, -0.050, 0.050, 0.018), (0.05, -0.045, 0.080, 0.014), (0.12, -0.040, 0.100, 0.011),
    (0.20, -0.030, 0.080, 0.007), (0.26, -0.020, 0.050, 0.004), (0.30, -0.010, 0.020, 0.0)],
    segments=12, zone='caudale')

# ---------------------------------------------------------------- 3) les yeux
YEUX = [(+0.084, -0.705, 0.006), (-0.084, -0.705, 0.006)]      # affleurent la tête (9 mm dehors)
for oeil in YEUX:
    marquer_zone(bm, sphere(bm, oeil, 0.016, segments=16, anneaux=10), 'yeux')

requin = terminer_maillage(bm, 'RequinRecif')
sub = requin.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 4) la peau
# La grammaire commune aux requins est dans requins.py ; ici, seulement les réglages
# de l'espèce : couleurs, position des fentes, de la bouche, des narines, des yeux.
couleur, hauteur, rugosite = peau_requin(dict(
    dos=(0.40, 0.43, 0.44), bronze=(0.47, 0.45, 0.40), ventre=(0.90, 0.90, 0.87),
    seuil_flanc=0.215, tete_grise=0.06,
    ouies=dict(y0=-0.520, pas=0.030, x_min=0.075, z_centre=0.005, demi_hauteur=0.062, inclinaison=0.025),
    bouche=dict(y_apex=-0.765, courbure=3.5, x_max=0.09),
    narines=[(0.036, -0.855), (-0.036, -0.855)],
    yeux=YEUX, pointes_sombres=1.0, liseret_dorsal=0.6, caudale_noire=1.0,
))
texturer(requin, 'Peau_RequinRecif', resolution=2048, resolution_relief=1024, resolution_orm=512,
         couleur=couleur, hauteur=hauteur, rugosite=rugosite)

# ---------------------------------------------------------------- 5) squelette et nage
# Une colonne de 7 os (tête, racine, deux de tronc, deux de queue, caudale) + un os par
# pectorale. Le mouvement est décrit comme de la biomécanique (mouvement.py) : la ligne
# médiane ondule avec une enveloppe d'amplitude qui grandit vers la queue (nage
# carangiforme : le tiers avant bouge à peine, la caudale bat à 10 % de la longueur),
# une longueur d'onde d'un corps, la caudale souple qui suit avec retard ; quatre
# battements par clip, dont l'amplitude varie lentement — jamais deux fois le même.
CHAINE = [('racine', -0.30, 0.02), ('tete', -0.30, -0.90), ('corps_1', 0.02, 0.28), ('corps_2', 0.28, 0.48),
          ('queue_1', 0.48, 0.62), ('queue_2', 0.62, 0.76), ('caudale', 0.76, 0.96)]
OS = [('racine',  (0, -0.30, 0), (0, 0.02, 0), None),
      ('tete',    (0, -0.30, 0), (0, -0.90, 0), 'racine'),
      ('corps_1', (0, 0.02, 0), (0, 0.28, 0), 'racine'),
      ('corps_2', (0, 0.28, 0), (0, 0.48, 0), 'corps_1'),
      ('queue_1', (0, 0.48, 0), (0, 0.62, 0), 'corps_2'),
      ('queue_2', (0, 0.62, 0), (0, 0.76, 0), 'queue_1'),
      ('caudale', (0, 0.76, 0), (0, 0.96, 0), 'queue_2'),
      ('pec_g',   (0.10, -0.29, -0.04), (0.42, -0.14, -0.19), 'racine'),
      ('pec_d',   (-0.10, -0.29, -0.04), (-0.42, -0.14, -0.19), 'racine')]
armature = squelette('Armature_RequinRecif', OS)
peser_par_parties(requin, armature, OS, registre, colonne=CHAINE)

PERIODE = 1.4                                          # un battement de queue (s) à la vitesse de croisière

def nage(m):
    m.modulation(0.12)
    m.onde(CHAINE, longueur=1.86, s_museau=-0.90, A_tete=0.012, A_queue=0.10, exposant=2.2,
           longueur_onde=1.05, retard_caudal=0.5, s_caudal=0.82)
    m.secondaire('racine', 'rotation_euler', 1, 0.025, phase=1.2)                 # léger roulis avec le battement
    for nom, s in (('pec_g', 1), ('pec_d', -1)):
        m.secondaire(nom, 'rotation_euler', 1, 0.05 * s, phase=0.6)               # les pectorales vrillent un peu
        m.secondaire(nom, 'rotation_euler', 0, 0.04, cycles_par_clip=1, phase=0.4 * s)   # …et ajustent lentement leur assiette

m = Mouvement(armature, PERIODE, cycles=4)
nage(m)
m.cuire('swim')
glisse(armature, nage, PERIODE)                        # l'action « glide » : le requin plane

# ---------------------------------------------------------------- 6) export et contrôle
chemin = exporter_glb('requin-recif.glb')
inspecter_glb(chemin)
