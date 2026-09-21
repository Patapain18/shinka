"""
generer_tortue.py — la tortue verte (Chelonia mydas), v2
=========================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_tortue.py

1,2 m du bec au bout des nageoires arrière. Ce qui fait une tortue verte :
- une carapace ovale, lisse (pas de carène), bombée, à bord un peu débordant :
  une coque fermée (dôme + plastron) construite en anneaux de la forme du bord ;
  ses ÉCUSSONS — 5 vertébraux au milieu, 4 costaux de chaque côté, 12 marginaux
  par côté — dessinés en sillons (relief) et en couleurs : brun olive à stries
  rayonnantes claires, chaque écusson avec sa teinte ;
- un plastron crème ; une tête ronde à bec, deux grandes écailles préfrontales,
  de grands yeux sombres ; peau à écailles polygonales sombres à liserés clairs
  (Voronoï) sur la tête, le cou et les nageoires ;
- des nageoires avant longues (des ailes : elle « vole » sous l'eau, avec un
  vrillage au bout de chaque coup), des arrière courtes en palette, une petite queue.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector
from commun import *
from commun import _orienter
from peau import *

nettoyer_scene()
bm = nouveau_bmesh(zones=('carapace', 'plastron', 'peau', 'yeux'))
registre = []

# ---------------------------------------------------------------- 1) la coque
RX, RY = 0.35, 0.45                      # demi-largeur, demi-longueur du bord de la carapace
def bord(a):
    """Le contour de la carapace vu de dessus : ovale un peu plus large vers l'arrière (+Y)."""
    x = RX * math.cos(a) * (1 + 0.10 * math.sin(a) - 0.06 * math.sin(a) ** 3)
    y = RY * math.sin(a) * (1 - 0.04 * math.cos(2 * a))
    return x, y

def coque(bm, anneaux_defs, segments=40, zone_par_anneau=None):
    """Une coque fermée par anneaux du contour `bord`, mis à l'échelle f et posés à la
    hauteur z : anneaux_defs = [(f, z), …] du pôle du dessus (f=0) au pôle du dessous.
    Même orientation des faces que revolution(). Couches : u = f, v = angle."""
    cu, cv = bm.verts.layers.float.get('u'), bm.verts.layers.float.get('v')
    rings, sommets = [], []
    for i, (f, z) in enumerate(anneaux_defs):
        zone = zone_par_anneau(i) if zone_par_anneau else None
        couche_zone = bm.verts.layers.float.get(f'zone_{zone}') if zone else None
        if f < 1e-5:
            vtx = bm.verts.new((0.0, 0.0, z))
            vtx[cu], vtx[cv] = 0.0, 0.0
            if couche_zone is not None:
                vtx[couche_zone] = 1.0
            rings.append([vtx]); sommets.append(vtx)
            continue
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            x, y = bord(a)
            vtx = bm.verts.new((x * f, y * f, z))
            vtx[cu], vtx[cv] = f, a / (2 * math.pi)
            if couche_zone is not None:
                vtx[couche_zone] = 1.0
            ring.append(vtx)
        rings.append(ring); sommets += ring
    n = segments
    faces = []
    for A, B in zip(rings, rings[1:]):
        if len(A) == 1:
            for k in range(n):
                faces.append(bm.faces.new((A[0], B[k], B[(k + 1) % n])))
        elif len(B) == 1:
            for k in range(n):
                faces.append(bm.faces.new((A[(k + 1) % n], A[k], B[0])))
        else:
            for k in range(n):
                faces.append(bm.faces.new((A[(k + 1) % n], A[k], B[k], B[(k + 1) % n])))
    _orienter(bm, faces)
    return sommets

# dôme : z(f) = 0,20 (1 − f²)^0,6 ; bord débordant ; plastron plat en dessous
ANNEAUX = [(0.0, 0.200)] + [(f, 0.20 * (1 - f * f) ** 0.6) for f in (0.12, 0.26, 0.40, 0.54, 0.67, 0.78, 0.87, 0.94, 0.985, 1.0)]
ANNEAUX += [(1.01, -0.018), (0.98, -0.040), (0.92, -0.058), (0.75, -0.078), (0.50, -0.092), (0.25, -0.100), (0.0, -0.102)]
N_DOME = 11
coque_sommets = coque(bm, ANNEAUX, segments=44, zone_par_anneau=lambda i: 'carapace' if i <= N_DOME else 'plastron')
marquer(bm, coque_sommets, 'racine', registre)

# ---------------------------------------------------------------- 2) la tête et le cou (vers -Y)
TETE = [
    (-0.720, 0.006, 0.006, 0.004, -0.020),
    (-0.700, 0.030, 0.020, 0.018, -0.015),
    (-0.660, 0.052, 0.040, 0.035, -0.008),
    (-0.600, 0.065, 0.058, 0.050,  0.000),
    (-0.540, 0.066, 0.062, 0.055,  0.000),
    (-0.470, 0.058, 0.055, 0.050,  0.000),
    (-0.400, 0.055, 0.055, 0.050,  0.000),
    (-0.340, 0.050, 0.050, 0.045,  0.000),
]
tete = corps(bm, TETE, anneaux=26, segments=20, exposant=2.2, zone='peau')
marquer(bm, [v for v in tete if v.co.y <= -0.56], 'tete', registre, ((0.0, -0.56, 0.0), 0.05))
marquer(bm, [v for v in tete if v.co.y > -0.56], 'cou', registre, ((0.0, -0.40, 0.0), 0.08))
YEUX = [(+0.056, -0.625, 0.020), (-0.056, -0.625, 0.020)]
for oeil in YEUX:
    o = sphere(bm, oeil, 0.018, segments=14, anneaux=9)
    marquer_zone(bm, o, 'yeux')
    marquer(bm, o, 'tete', registre)

# ---------------------------------------------------------------- 3) les nageoires
for s, nom in ((+1, 'nag_av_g'), (-1, 'nag_av_d')):
    v = nageoire_loft(bm, (s * 0.30, -0.22, -0.03), (s * 1.0, -0.35, -0.15), (0, 1, 0), [
        (0.00, -0.14, 0.12, 0.030), (0.08, -0.15, 0.13, 0.028), (0.20, -0.15, 0.12, 0.024),
        (0.32, -0.13, 0.10, 0.018), (0.44, -0.10, 0.06, 0.012), (0.54, -0.06, 0.02, 0.006),
        (0.60, -0.03, 0.00, 0.0)], segments=14, zone='peau')
    marquer(bm, v, nom, registre, ((s * 0.30, -0.22, -0.03), 0.12))
for s, nom in ((+1, 'nag_ar_g'), (-1, 'nag_ar_d')):
    v = nageoire_loft(bm, (s * 0.22, 0.32, -0.04), (s * 0.8, 0.55, -0.2), (0, 1, 0), [
        (0.00, -0.10, 0.10, 0.025), (0.08, -0.10, 0.12, 0.022), (0.18, -0.08, 0.13, 0.016),
        (0.26, -0.04, 0.11, 0.010), (0.32, 0.00, 0.07, 0.004), (0.35, 0.02, 0.04, 0.0)], segments=12, zone='peau')
    marquer(bm, v, nom, registre, ((s * 0.22, 0.32, -0.04), 0.10))
queue = corps(bm, [(0.40, 0.030, 0.020, 0.018, -0.055), (0.50, 0.020, 0.014, 0.012, -0.060), (0.60, 0.006, 0.005, 0.005, -0.065)],
              anneaux=8, segments=10, exposant=2.0, zone='peau')
marquer(bm, queue, 'queue', registre, ((0.0, 0.44, -0.055), 0.06))

tortue = terminer_maillage(bm, 'Tortue')
sub = tortue.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 4) la peau
OLIVE_SOMBRE = (0.24, 0.22, 0.12)
OLIVE = (0.40, 0.36, 0.20)
TAN = (0.66, 0.58, 0.34)
PLASTRON = (0.86, 0.81, 0.62)
CREME = (0.82, 0.78, 0.60)
PEAU_SOMBRE = (0.30, 0.29, 0.20)
NOIR = (0.03, 0.03, 0.03)

def ecussons(t):
    """Renvoie (sillon, ecusson_id, centre) : le masque des sillons entre écussons, un
    identifiant d'écusson (pour sa teinte) et le point d'où rayonnent ses stries —
    le tout en coordonnées normalisées du plan de la carapace."""
    xn, yn = t.x / RX, t.y / RY
    f = t.u                                                       # 0 au sommet, 1 au bord
    sillon = np.zeros(t.N, np.float32)
    def ligne(d, largeur=0.012):
        return 1 - lisser(largeur * 0.4, largeur, np.abs(d))
    # anneau des marginaux
    sillon = np.maximum(sillon, ligne(f - 0.82, 0.02))
    # vertébraux / costaux : la bande centrale, plus étroite aux deux bouts
    demi = 0.24 * (1 - 0.35 * yn ** 2)
    sillon = np.maximum(sillon, ligne(np.abs(xn) - demi, 0.03) * (f < 0.82))
    # sutures transversales : vertébrales et costales décalées
    for y0 in (-0.62, -0.22, 0.20, 0.60):
        sillon = np.maximum(sillon, ligne(yn - y0, 0.025) * (np.abs(xn) < demi) * (f < 0.82))
    for y0 in (-0.50, -0.05, 0.42):
        sillon = np.maximum(sillon, ligne(yn - y0, 0.025) * (np.abs(xn) >= demi) * (f < 0.82))
    # marginaux : 24 secteurs
    ang = t.v * 24
    sillon = np.maximum(sillon, ligne((ang + 0.5) % 1.0 - 0.5, 0.06) * (f >= 0.82) * (f < 1.02))
    # identifiant et centre de l'écusson
    ident = np.where(f >= 0.82, 100 + np.floor(ang),
                     np.where(np.abs(xn) < demi, np.digitize(yn, [-0.62, -0.22, 0.20, 0.60]),
                              10 + 10 * np.sign(xn) + np.digitize(yn, [-0.50, -0.05, 0.42])))
    cy = np.where(np.abs(xn) < demi, np.select([yn < -0.62, yn < -0.22, yn < 0.20, yn < 0.60], [-0.80, -0.42, 0.0, 0.40], 0.80),
                  np.select([yn < -0.50, yn < -0.05, yn < 0.42], [-0.72, -0.28, 0.18], 0.66))
    cx = np.where(np.abs(xn) < demi, 0.0, np.sign(xn) * 0.55)
    return sillon, ident, cx, cy

def couleur(t):
    car = t.zone('carapace')
    sillon, ident, cx, cy = ecussons(t)
    teinte = _hachage_id(ident)
    base = melanger(OLIVE_SOMBRE, OLIVE, teinte)
    # stries rayonnant depuis l'arrière de chaque écusson
    ang = np.arctan2(t.y / RY - cy - 0.12, t.x / RX - cx)
    stries = 0.5 + 0.5 * np.cos(ang * 14 + 3 * fbm(t.p * 12, 2, graine=4))
    base = melanger(base, TAN, 0.55 * lisser(0.35, 0.9, stries) * (1 - 0.5 * teinte))
    base = melanger(base, OLIVE_SOMBRE, 0.5 * lisser(0.2, 0.7, fbm(t.p * 25, 3, graine=5)))
    c_car = melanger(base, (0.16, 0.15, 0.09), sillon * 0.85)
    # plastron crème, sutures pâles
    c_pla = melanger(PLASTRON, (0.72, 0.66, 0.46), 0.5 * lisser(0.3, 0.8, fbm(t.p * 10, 2, graine=6)))
    # peau : écailles polygonales sombres à liserés crème (Voronoï, ~2,5 cm)
    F1, F2, idc = cellules(t.p / 0.028, graine=7)
    ecaille = melanger(PEAU_SOMBRE, OLIVE, idc * 0.8)
    liseret = 1 - lisser(0.04, 0.12, F2 - F1)
    c_peau = melanger(ecaille, CREME, liseret * 0.85)
    c = c_car * car[:, None] + c_pla * t.zone('plastron')[:, None] + c_peau * t.zone('peau')[:, None]
    # le bec : corne claire au bout du museau, ligne de la bouche
    bec = lisser(-0.69, -0.71, -t.y * -1) * 0  # (placeholder neutre)
    bec = (t.y < -0.685) * t.zone('peau')
    c = melanger(c, (0.62, 0.56, 0.40), 0.8 * bec)
    c = melanger(c, NOIR, 0.7 * trait(t.z, -0.022 + 0.6 * (t.y + 0.70), 0.006) * (t.y < -0.665) * (t.y > -0.72) * t.zone('peau'))
    a = angle_vers(t, YEUX, lambda c_: (np.sign(c_[0]), 0.0, 0.0))
    c_oeil = melanger((0.10, 0.08, 0.05), (0.32, 0.22, 0.10), 1 - lisser(0.60, 0.72, a))
    c_oeil = melanger(c_oeil, NOIR, 1 - lisser(0.42, 0.52, a))
    return melanger(c, c_oeil, t.zone('yeux'))

def _hachage_id(ident):
    x = (ident.astype(np.int64) * 7919 + 13) % 977
    return (x / 977.0).astype(np.float32)

def hauteur(t):
    car = t.zone('carapace')
    sillon, _, _, _ = ecussons(t)
    h = -0.004 * sillon * car + 0.0015 * fbm(t.p * 30, 3, graine=8) * car
    F1, F2, _ = cellules(t.p / 0.028, graine=7)
    h -= 0.0015 * (1 - lisser(0.04, 0.12, F2 - F1)) * t.zone('peau')
    h += 0.0004 * fbm(t.p * 60, 2, graine=9) * t.zone('peau')
    return h

def rugosite(t):
    r = 0.40 * t.zone('carapace') + 0.55 * t.zone('plastron') + 0.62 * t.zone('peau')
    return np.where(t.zone('yeux') > 0.5, 0.10, r)

texturer(tortue, 'Peau_Tortue', resolution=2048, resolution_relief=1024, resolution_orm=512,
         couleur=couleur, hauteur=hauteur, rugosite=rugosite)

# ---------------------------------------------------------------- 5) squelette et nage
OS = [
    ('racine',   (0.0, 0.05, 0.0),      (0.0, 0.30, 0.0),      None),
    ('cou',      (0.0, -0.40, 0.0),     (0.0, -0.56, 0.0),     'racine'),
    ('tete',     (0.0, -0.56, 0.0),     (0.0, -0.72, -0.01),   'cou'),
    ('nag_av_g', (0.30, -0.22, -0.03),  (0.86, -0.42, -0.12),  'racine'),
    ('nag_av_d', (-0.30, -0.22, -0.03), (-0.86, -0.42, -0.12), 'racine'),
    ('nag_ar_g', (0.22, 0.32, -0.04),   (0.50, 0.51, -0.11),   'racine'),
    ('nag_ar_d', (-0.22, 0.32, -0.04),  (-0.50, 0.51, -0.11),  'racine'),
    ('queue',    (0.0, 0.44, -0.055),   (0.0, 0.60, -0.065),   'racine'),
]
armature = squelette('Armature_Tortue', OS)
peser_par_parties(tortue, armature, OS, registre)
R = 'rotation_euler'
animer_os(armature, {
    # avant : battement vertical (X) + balayage (Z) en quadrature + vrillage (Y) : le « vol » sous-marin
    'nag_av_g': [(R, 0, 0.55, 0.0, 0.0), (R, 2, 0.18, 1.57, 0.0), (R, 1, 0.30, 0.8, 0.0)],
    'nag_av_d': [(R, 0, 0.55, 0.0, 0.0), (R, 2, -0.18, 1.57, 0.0), (R, 1, -0.30, 0.8, 0.0)],
    'nag_ar_g': [(R, 0, 0.18, 3.14, 0.0), (R, 2, 0.08, 4.71, 0.0)],
    'nag_ar_d': [(R, 0, 0.18, 3.14, 0.0), (R, 2, -0.08, 4.71, 0.0)],
    'cou':      [(R, 0, 0.05, 0.4, 0.0)],
    'tete':     [(R, 0, 0.05, 0.9, 0.0), (R, 2, 0.04, 2.0, 0.0)],
    'racine':   [(R, 0, 0.025, 0.0, 0.0), ('location', 2, 0.02, 0.3, 0.0)],
    'queue':    [(R, 2, 0.12, 1.0, 0.0)],
}, images=96)                                   # 4 s par cycle : majestueux

chemin = exporter_glb('tortue.glb')
inspecter_glb(chemin)
