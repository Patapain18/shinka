"""
generer_requin_baleine.py — le requin-baleine (Rhincodon typus), v2
====================================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_requin_baleine.py

Dix mètres. Ce qui fait un requin-baleine :
- une tête LARGE et PLATE, la bouche TERMINALE (tout devant, 1,4 m de large), des
  yeux minuscules aux commissures ; cinq fentes branchiales immenses ;
- trois CRÊTES longitudinales de chaque côté (dans la carte de normales), la plus
  basse se prolongeant en carène sur le pédoncule ;
- la robe : fond gris-bleu sombre, DAMIER de points clairs et de lignes claires
  (colonnes et rangées) — petits et denses sur la tête, grands sur le corps — ventre blanc ;
- première dorsale grande et reculée, pectorales en aile, caudale presque en
  croissant (lobe inférieur bien développé). Six secondes par ondulation.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from commun import *
from peau import *
from peau import _hachage
from requins import peau_requin

nettoyer_scene()
bm = nouveau_bmesh(zones=('corps', 'nageoires', 'caudale', 'yeux'))

# ---------------------------------------------------------------- 1) le corps
# Le front est une large section plate (la bouche) refermée par un éventail : la
# subdivision en fait un museau camus. Flancs pleins (exposant 2,5).
CLES = [
    (-5.00, 0.60, 0.16, 0.20, -0.20),
    (-4.85, 0.72, 0.24, 0.28, -0.18),
    (-4.60, 0.80, 0.34, 0.38, -0.14),
    (-4.20, 0.86, 0.48, 0.50, -0.08),
    (-3.60, 0.90, 0.66, 0.66,  0.00),
    (-2.80, 0.92, 0.82, 0.78,  0.05),
    (-1.80, 0.90, 0.90, 0.82,  0.08),
    (-0.80, 0.86, 0.90, 0.80,  0.08),
    ( 0.20, 0.76, 0.82, 0.72,  0.08),
    ( 1.20, 0.60, 0.66, 0.58,  0.08),
    ( 2.10, 0.42, 0.48, 0.42,  0.08),
    ( 2.80, 0.26, 0.30, 0.26,  0.09),
    ( 3.30, 0.16, 0.20, 0.17,  0.10),
    ( 3.65, 0.06, 0.09, 0.08,  0.12),
]
corps(bm, CLES, anneaux=60, segments=32, exposant=2.5, zone='corps')

# ---------------------------------------------------------------- 2) les nageoires
# Première dorsale : grande, triangulaire, reculée (apex vers l'arrière)
nageoire_loft(bm, (0, 0, 0.55), (0, 0, 1), (0, 1, 0), [
    (0.00, 0.50, 1.55, 0.080), (0.12, 0.55, 1.45, 0.070), (0.25, 0.62, 1.30, 0.060),
    (0.42, 0.72, 1.20, 0.050), (0.62, 0.86, 1.15, 0.040), (0.82, 1.02, 1.14, 0.030),
    (0.98, 1.12, 1.13, 0.0)], segments=14, zone='nageoires')
nageoire_loft(bm, (0, 0, 0.25), (0, 0, 1), (0, 1, 0), [
    (0.00, 2.35, 2.85, 0.040), (0.08, 2.42, 2.78, 0.030), (0.18, 2.52, 2.70, 0.020), (0.28, 2.62, 2.66, 0.0)],
    segments=12, zone='nageoires')
nageoire_loft(bm, (0, 0, -0.15), (0, 0, -1), (0, 1, 0), [
    (0.00, 2.40, 2.90, 0.040), (0.08, 2.47, 2.83, 0.030), (0.18, 2.57, 2.75, 0.020), (0.26, 2.66, 2.70, 0.0)],
    segments=12, zone='nageoires')
for s in (+1, -1):
    nageoire_loft(bm, (s * 0.75, 0, -0.25), (s * 1.0, 0.15, -0.35), (0, 1, 0), [
        (0.00, -3.50, -2.30, 0.100), (0.15, -3.46, -2.45, 0.090), (0.40, -3.35, -2.70, 0.080),
        (0.70, -3.15, -2.80, 0.060), (1.00, -2.88, -2.62, 0.045), (1.30, -2.55, -2.35, 0.030),
        (1.55, -2.25, -2.12, 0.015), (1.70, -2.05, -2.02, 0.0)], segments=14, zone='nageoires')
    nageoire_loft(bm, (s * 0.45, 0, -0.45), (s * 1.0, 0.40, -0.50), (0, 1, 0), [
        (0.00, 0.80, 1.60, 0.050), (0.15, 0.85, 1.60, 0.045), (0.35, 0.98, 1.65, 0.035),
        (0.55, 1.15, 1.70, 0.020), (0.70, 1.32, 1.68, 0.0)], segments=10, zone='nageoires')
# Caudale presque en croissant : lobe supérieur à 44°, inférieur à 52°, bien développé
nageoire_loft(bm, (0, 3.50, 0.10), (0, 0.72, 0.69), (0, 0.69, -0.72), [
    (0.00, -0.30, 0.35, 0.100), (0.30, -0.28, 0.65, 0.085), (0.65, -0.25, 0.85, 0.070),
    (1.05, -0.22, 0.78, 0.055), (1.45, -0.18, 0.55, 0.040), (1.75, -0.14, 0.30, 0.030),
    (1.95, -0.10, 0.20, 0.020), (2.10, -0.05, 0.10, 0.010), (2.20, 0.00, 0.05, 0.0)],
    segments=14, zone='caudale')
nageoire_loft(bm, (0, 3.50, 0.00), (0, 0.62, -0.78), (0, 0.78, 0.62), [
    (0.00, -0.25, 0.25, 0.090), (0.25, -0.24, 0.50, 0.075), (0.55, -0.22, 0.62, 0.060),
    (0.90, -0.18, 0.52, 0.045), (1.20, -0.14, 0.35, 0.030), (1.45, -0.08, 0.18, 0.015),
    (1.60, 0.00, 0.06, 0.0)], segments=12, zone='caudale')

# ---------------------------------------------------------------- 3) les yeux (minuscules, aux commissures)
YEUX = [(+0.74, -4.55, -0.12), (-0.74, -4.55, -0.12)]
for oeil in YEUX:
    marquer_zone(bm, sphere(bm, oeil, 0.055, segments=12, anneaux=8), 'yeux')

requin = terminer_maillage(bm, 'RequinBaleine')
sub = requin.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 4) la peau
POINT = (0.82, 0.86, 0.84)
NOIR = (0.05, 0.05, 0.06)
LONGUEUR, TOUR = 8.7, 5.6          # longueur du loft du corps, circonférence moyenne (pour le damier)

def bouche_terminale(t):
    """La fente de la bouche, en travers du front : là où la normale pointe vers l'avant (-Y)."""
    front = lisser(-0.35, -0.8, t.n[:, 1])
    zm = -0.22 + 0.05 * (t.x / 0.6) ** 2
    return trait(t.z, zm, 0.07) * (np.abs(t.x) < 0.78) * front * t.zone('corps')

def hachage2(i, j, graine):
    return _hachage(i.astype(np.int64), j.astype(np.int64), np.zeros_like(i, dtype=np.int64), graine)

def damier(t):
    """Points et lignes claires. Corps : un réseau (u le long, v autour) — grands
    points espacés de 36 cm, colonnes et rangées de lignes faibles entre eux ;
    tête : petits points denses. Nageoires : points irréguliers (Voronoï 3D)."""
    corps_ = t.zone('corps')
    # grands points du corps
    a, b = t.u * LONGUEUR / 0.27, t.v * TOUR / 0.25
    ia, ib = np.floor(a + 0.5), np.floor(b + 0.5)
    jx, jy = 0.3 * (hachage2(ia, ib, 11) - 0.5), 0.3 * (hachage2(ia, ib, 12) - 0.5)
    d = np.sqrt(((a - ia - jx) * 0.27) ** 2 + ((b - ib - jy) * 0.25) ** 2)
    rayon = 0.045 + 0.03 * hachage2(ia, ib, 13)
    grands = (1 - lisser(rayon - 0.012, rayon + 0.01, d)) * lisser(0.10, 0.20, t.u)
    # petits points de la tête
    a2, b2 = t.u * LONGUEUR / 0.15, t.v * TOUR / 0.13
    ia2, ib2 = np.floor(a2 + 0.5), np.floor(b2 + 0.5)
    jx2, jy2 = 0.4 * (hachage2(ia2, ib2, 21) - 0.5), 0.4 * (hachage2(ia2, ib2, 22) - 0.5)
    d2 = np.sqrt(((a2 - ia2 - jx2) * 0.15) ** 2 + ((b2 - ib2 - jy2) * 0.13) ** 2)
    petits = (1 - lisser(0.028, 0.040, d2)) * (1 - lisser(0.12, 0.22, t.u))
    # lignes : colonnes (entre les points, derrière la tête) et rangées (le long des crêtes)
    colonnes = np.exp(-(((a + 0.5) % 1.0 - 0.5) / 0.05) ** 2) * 0.55 * lisser(0.12, 0.2, t.u) * (1 - lisser(0.50, 0.62, t.u))
    rangees = np.exp(-(((b + 0.5) % 1.0 - 0.5) / 0.045) ** 2) * 0.40 * lisser(0.15, 0.25, t.u) * (1 - lisser(0.85, 0.92, t.u))
    motif_corps = np.clip(np.maximum(grands, petits) + colonnes + rangees, 0, 1) * corps_
    # nageoires : Voronoï
    F1, _, _ = cellules(t.p / 0.22, graine=5)
    motif_nag = (1 - lisser(0.20, 0.27, F1)) * (t.zone('nageoires') + t.zone('caudale'))
    return np.clip(motif_corps + motif_nag, 0, 1)

def motif(t, base, haut):
    c = melanger(base, POINT, damier(t) * haut)
    return melanger(c, NOIR, 0.85 * bouche_terminale(t))

def relief_extra(t):
    """Trois crêtes par flanc (0,07 / 0,15 / 0,23 de tour au-dessus du flanc, depuis le dos)
    + la rainure de la bouche."""
    corps_ = t.zone('corps')
    fondu = lisser(0.12, 0.22, t.u) * (1 - lisser(0.90, 0.97, t.u))
    h = np.zeros(t.N, np.float32)
    for dv in (0.07, 0.15, 0.23):
        for s in (+1, -1):
            h += 0.03 * np.exp(-((t.v - (0.25 + s * dv)) / 0.012) ** 2)
    h *= fondu * corps_
    return h - 0.03 * bouche_terminale(t)

couleur, hauteur, rugosite = peau_requin(dict(
    echelle=5.5, dos=(0.24, 0.30, 0.36), bronze=(0.30, 0.34, 0.36), ventre=(0.86, 0.87, 0.84),
    seuil_flanc=0.20, tete_grise=0.04,
    ouies=dict(y0=-3.55, pas=0.22, x_min=0.55, z_centre=0.0, demi_hauteur=0.55, inclinaison=0.10),
    bouche=None, narines=[],
    yeux=YEUX, oeil=dict(pupille=(0.02, 0.02, 0.02), iris=(0.06, 0.07, 0.07), sclere=(0.15, 0.16, 0.16)),
    pointes_sombres=0.0, liseret_dorsal=0.0, caudale_noire=0.0,
    motif=motif, relief_extra=relief_extra,
))
texturer(requin, 'Peau_RequinBaleine', resolution=2048, resolution_relief=1024, resolution_orm=512,
         couleur=couleur, hauteur=hauteur, rugosite=rugosite)

# ---------------------------------------------------------------- 5) squelette et nage
OS = [
    ('racine',  -1.80,  0.20, None),
    ('tete',    -1.80, -5.00, 'racine'),
    ('corps_1',  0.20,  1.40, 'racine'),
    ('queue_1',  1.40,  2.50, 'corps_1'),
    ('queue_2',  2.50,  3.50, 'queue_1'),
    ('queue_3',  3.50,  4.40, 'queue_2'),
    ('queue_4',  4.40,  5.20, 'queue_3'),
]
armature = squelette_colonne('Armature_RequinBaleine', OS)
peser_colonne(requin, armature, OS)
animer_nage(armature, {
    'tete':    (0.012,  0.6),
    'racine':  (0.015,  0.0),
    'corps_1': (0.040, -0.7),
    'queue_1': (0.075, -1.4),
    'queue_2': (0.110, -2.1),
    'queue_3': (0.150, -2.8),
    'queue_4': (0.190, -3.5),
}, images=144)                                         # 6 s par ondulation : un géant tranquille

chemin = exporter_glb('requin-baleine.glb')
inspecter_glb(chemin)
