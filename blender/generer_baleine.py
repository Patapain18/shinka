"""
generer_baleine.py — la baleine à bosse (Megaptera novaeangliae), v2
=====================================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_baleine.py

14 m. Elle ne passe qu'en événement, loin — mais sa silhouette doit être juste :
- un corps massif, une tête plate (rostre) à TUBERCULES, la mâchoire inférieure
  bombée, la ligne de la bouche qui remonte vers l'œil ;
- des SILLONS ventraux du menton au nombril ;
- d'immenses pectorales (un tiers du corps) au bord d'attaque noueux, blanches
  dessous ; une petite dorsale sur une bosse ; une caudale horizontale en deux
  lobes, noire dessus, à motif blanc dessous — elle bat DE HAUT EN BAS (rotation
  X : un mammifère) ; huit secondes par battement.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector
from commun import *
from peau import *

nettoyer_scene()
bm = nouveau_bmesh(zones=('corps', 'nageoires', 'pectorales', 'caudale', 'yeux'))
registre = []

# ---------------------------------------------------------------- 1) le corps
CLES = [
    (-7.00, 0.20, 0.10, 0.18, -0.30),
    (-6.60, 0.55, 0.28, 0.50, -0.25),
    (-6.00, 0.85, 0.50, 0.80, -0.15),
    (-5.20, 1.10, 0.80, 1.05, -0.05),
    (-4.20, 1.30, 1.10, 1.25,  0.00),
    (-3.00, 1.40, 1.30, 1.35,  0.05),
    (-1.50, 1.42, 1.35, 1.35,  0.08),
    ( 0.00, 1.35, 1.28, 1.25,  0.10),
    ( 1.50, 1.15, 1.10, 1.05,  0.12),
    ( 2.80, 0.85, 0.85, 0.80,  0.14),
    ( 3.80, 0.55, 0.60, 0.55,  0.16),
    ( 4.60, 0.32, 0.40, 0.32,  0.20),
    ( 5.20, 0.18, 0.28, 0.20,  0.24),
    ( 5.60, 0.06, 0.12, 0.08,  0.28),
]
corps(bm, CLES, anneaux=56, segments=30, exposant=2.3, zone='corps')

# ---------------------------------------------------------------- 2) les nageoires
# Caudale : deux lobes horizontaux, échancrure médiane (les deux lofts partent du pédoncule)
for s in (+1, -1):
    nageoire_loft(bm, (0, 5.30, 0.25), (s * 1.0, 0.35, 0.0), (0, 1, 0), [
        (0.00, -0.45, 0.65, 0.160), (0.40, -0.40, 0.80, 0.130), (0.90, -0.25, 0.90, 0.100),
        (1.40, -0.05, 0.85, 0.070), (1.90, 0.20, 0.70, 0.045), (2.20, 0.40, 0.55, 0.020),
        (2.35, 0.50, 0.52, 0.0)], segments=14, zone='caudale')
    # pectorales : immenses, vers le bas et l'arrière ; les os pec_g / pec_d les portent
    v = nageoire_loft(bm, (s * 1.00, -3.20, -0.70), (s * 0.93, 0.15, -0.33), (0, 1, 0), [
        (0.00, -0.55, 0.55, 0.160), (0.50, -0.52, 0.45, 0.140), (1.20, -0.45, 0.32, 0.110),
        (2.00, -0.35, 0.20, 0.080), (2.80, -0.22, 0.10, 0.055), (3.50, -0.10, 0.04, 0.030),
        (4.00, -0.02, 0.02, 0.012), (4.30, 0.00, 0.01, 0.0)], segments=14, zone='pectorales')
    marquer(bm, v, 'pec_g' if s > 0 else 'pec_d', registre, ((s * 1.0, -3.2, -0.7), 0.9))
# dorsale : petite, sur une bosse
nageoire_loft(bm, (0, 0, 1.15), (0, 0, 1), (0, 1, 0), [
    (0.00, 0.80, 2.20, 0.150), (0.15, 0.95, 2.00, 0.120), (0.30, 1.15, 1.85, 0.090),
    (0.45, 1.40, 1.75, 0.050), (0.55, 1.55, 1.68, 0.0)], segments=12, zone='nageoires')

# ---------------------------------------------------------------- 3) les yeux (minuscules, à la commissure)
YEUX = [(+1.15, -4.60, -0.35), (-1.15, -4.60, -0.35)]
for oeil in YEUX:
    marquer_zone(bm, sphere(bm, oeil, 0.08, segments=12, anneaux=8), 'yeux')

baleine = terminer_maillage(bm, 'Baleine')
sub = baleine.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 4) la peau
DOS = (0.14, 0.15, 0.16)
VENTRE = (0.76, 0.76, 0.73)
BLANC = (0.90, 0.90, 0.88)
NOIR = (0.03, 0.03, 0.03)

def tubercules(t):
    F1, _, _ = cellules(t.p / 0.42, graine=4)
    tete = 1 - lisser(0.12, 0.20, t.u)
    haut_ou_machoire = np.maximum(lisser(0.15, 0.22, t.v) * (1 - lisser(0.28, 0.35, t.v)),   # sur le rostre
                                  lisser(0.62, 0.68, t.v) * (1 - lisser(0.82, 0.88, t.v)))    # sur la mâchoire
    return (1 - lisser(0.14, 0.22, F1)) * tete * haut_ou_machoire * t.zone('corps')

def sillons(t):
    """Les plis ventraux : lignes longitudinales sous la gorge et le ventre."""
    ondes = 0.5 + 0.5 * np.cos(t.v * 2 * np.pi * 60)
    zone = lisser(0.60, 0.66, t.v) * (1 - lisser(0.84, 0.90, t.v)) * lisser(0.04, 0.10, t.u) * (1 - lisser(0.45, 0.55, t.u))
    return lisser(0.6, 0.95, ondes) * zone * t.zone('corps')

def bouche(t):
    """La ligne de la bouche : du bout du rostre vers la commissure (près de l'œil), sur le flanc."""
    zm = -0.42 + 0.06 * (t.y + 4.6)                                  # remonte vers l'arrière
    return trait(t.z - zm, 0.0, 0.10) * (t.y < -4.5) * (t.y > -6.95) * (np.abs(t.x) > 0.15) * t.zone('corps')

def couleur(t):
    corps_ = t.zone('corps')
    d = np.abs(t.v - 0.75)
    seuil = 0.16 + 0.03 * fbm(t.p * 1.5, 3, graine=2)
    c = melanger(VENTRE, DOS, lisser(seuil - 0.03, seuil + 0.03, d))
    c = melanger(c, BLANC, 0.5 * lisser(0.3, 0.8, fbm(t.p * 2.5, 2, graine=3)) * (1 - lisser(0.10, 0.20, d)))
    c = melanger(c, (0.32, 0.33, 0.34), 0.35 * lisser(0.45, 0.85, fbm(t.p * 1.2, 3, graine=11)) * lisser(0.15, 0.3, d))   # marbrures grises du flanc
    c *= (1 + 0.06 * fbm(t.p * 6, 3, graine=1))[:, None]
    c = melanger(c, (0.30, 0.30, 0.28), 0.6 * sillons(t))
    c = melanger(c, (0.80, 0.80, 0.76), 0.5 * tubercules(t))               # tubercules (et leurs balanes) plus clairs
    # pectorales : blanches dessous, sombres à taches blanches dessus ; bord d'attaque noueux clair
    pec = t.zone('pectorales')
    dessus = lisser(-0.25, 0.25, t.n[:, 2])
    F1, _, _ = cellules(t.p / 0.9, graine=6)
    c_pec = melanger(BLANC, melanger(DOS, BLANC, 0.6 * (1 - lisser(0.2, 0.35, F1))), dessus)
    c_pec = melanger(c_pec, (0.85, 0.85, 0.82), (1 - lisser(0.04, 0.10, t.v)) * 0.6)
    # caudale : noire dessus, blanche à taches noires dessous ; bord de fuite dentelé plus sombre
    caud = t.zone('caudale')
    F1c, _, _ = cellules(t.p / 0.6, graine=7)
    c_caud = melanger(melanger(BLANC, NOIR, 0.7 * (1 - lisser(0.25, 0.4, F1c))), DOS, dessus)
    c_caud = melanger(c_caud, DOS, lisser(0.9, 0.98, t.v))
    c_dors = couleur_unie(DOS, t.N)
    c = c * corps_[:, None] + c_pec * pec[:, None] + c_caud * caud[:, None] + c_dors * t.zone('nageoires')[:, None]
    c = melanger(c, NOIR, 0.8 * bouche(t))
    a = angle_vers(t, YEUX, lambda c_: (np.sign(c_[0]), 0.0, 0.0))
    c_oeil = melanger((0.15, 0.13, 0.10), NOIR, 1 - lisser(0.4, 0.55, a))
    return melanger(c, c_oeil, t.zone('yeux'))

def hauteur(t):
    h = 0.05 * tubercules(t) - 0.025 * sillons(t) - 0.03 * bouche(t)
    h += 0.004 * fbm(t.p * 4, 3, graine=8) * t.zone('corps')
    h += 0.03 * (0.5 + 0.5 * np.cos(t.u * 2 * np.pi * 9)) * (1 - lisser(0.03, 0.09, t.v)) * t.zone('pectorales')   # bord noueux
    return h

def rugosite(t):
    return np.where(t.zone('yeux') > 0.5, 0.12, 0.60)

texturer(baleine, 'Peau_Baleine', resolution=2048, resolution_relief=1024, resolution_orm=512,
         couleur=couleur, hauteur=hauteur, rugosite=rugosite)

# ---------------------------------------------------------------- 5) squelette et nage (tangage : un mammifère)
OS = [
    ('racine',  (0, -2.0, 0), (0, 0.8, 0), None),
    ('tete',    (0, -2.0, 0), (0, -7.0, -0.3), 'racine'),
    ('corps_1', (0, 0.8, 0), (0, 3.0, 0.15), 'racine'),
    ('queue_1', (0, 3.0, 0.15), (0, 4.6, 0.2), 'corps_1'),
    ('queue_2', (0, 4.6, 0.2), (0, 5.5, 0.25), 'queue_1'),
    ('queue_3', (0, 5.5, 0.25), (0, 6.6, 0.3), 'queue_2'),
    ('pec_g',   (1.0, -3.2, -0.7), (4.7, -2.6, -2.0), 'racine'),
    ('pec_d',   (-1.0, -3.2, -0.7), (-4.7, -2.6, -2.0), 'racine'),
]
armature = squelette('Armature_Baleine', OS)
peser_par_parties(baleine, armature, OS, registre,
                  colonne=[('racine', -2.0, 0.8), ('tete', -2.0, -7.0), ('corps_1', 0.8, 3.0), ('queue_1', 3.0, 4.6), ('queue_2', 4.6, 5.5), ('queue_3', 5.5, 6.6)])
R = 'rotation_euler'
animer_os(armature, {                              # axe X = tangage : la queue monte et descend
    'racine':  [(R, 0, 0.015, 0.0, 0.0)],
    'tete':    [(R, 0, 0.012, 0.5, 0.0)],
    'corps_1': [(R, 0, 0.040, -0.8, 0.0)],
    'queue_1': [(R, 0, 0.090, -1.6, 0.0)],
    'queue_2': [(R, 0, 0.140, -2.4, 0.0)],
    'queue_3': [(R, 0, 0.180, -3.2, 0.0)],
    'pec_g':   [(R, 0, 0.06, 0.6, 0.0), (R, 1, 0.05, 1.2, 0.0)],
    'pec_d':   [(R, 0, 0.06, 0.6, 0.0), (R, 1, -0.05, 1.2, 0.0)],
}, images=192)                                     # 8 s par battement
chemin = exporter_glb('baleine.glb')
inspecter_glb(chemin)
