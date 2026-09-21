"""
generer_chirurgien.py — le poisson-chirurgien bleu (Paracanthurus hepatus), v2
==============================================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_chirurgien.py

30 cm. Ce qui fait un chirurgien bleu (le « Dory » des récifs) :
- un corps ovale très comprimé, front bombé, petite bouche terminale, œil haut ;
- la PALETTE : un dessin noir — une bande depuis l'œil le long du haut du flanc
  jusqu'au pédoncule, d'où une seconde bande revient vers l'avant à mi-flanc et
  s'effile en pointe, enfermant une fenêtre bleu roi ;
- la caudale JAUNE bordée de deux coins noirs, le pédoncule jaune (le scalpel),
  les pectorales à moitié jaunes ; dorsale et anale longues (des voiles qui
  suivent la courbe du corps), bleues à liseré noir ;
- nage labriforme : les pectorales rament, la queue ne bat que peu.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector
from commun import *
from peau import *
from mouvement import Mouvement, asymetrique

nettoyer_scene()
bm = nouveau_bmesh(zones=('corps', 'nageoires', 'pectorales', 'caudale', 'yeux'))
registre = []

# ---------------------------------------------------------------- 1) le corps
CLES = [
    (-0.135, 0.004, 0.006, 0.006, -0.005),
    (-0.125, 0.012, 0.022, 0.018, -0.004),
    (-0.105, 0.018, 0.040, 0.032, -0.002),
    (-0.080, 0.022, 0.052, 0.044,  0.000),
    (-0.040, 0.025, 0.058, 0.052,  0.000),
    ( 0.000, 0.025, 0.057, 0.052,  0.000),
    ( 0.040, 0.023, 0.050, 0.046,  0.000),
    ( 0.075, 0.017, 0.032, 0.030,  0.000),
    ( 0.095, 0.011, 0.016, 0.015,  0.000),
    ( 0.105, 0.008, 0.012, 0.011,  0.000),
]
corps(bm, CLES, anneaux=40, segments=24, exposant=2.0, zone='corps')
_ys = np.array([c[0] for c in CLES])
def dos(y):
    return float(np.interp(y, _ys, [c[2] + c[4] for c in CLES]))
def ventre(y):
    return float(np.interp(y, _ys, [-c[3] + c[4] for c in CLES]))

# ---------------------------------------------------------------- 2) les nageoires
# Dorsale et anale : des voiles qui épousent le dos et le ventre, 1,8 cm au-delà
nageoire_loft(bm, (0, 0, 0.012), (0, 0, 1), (0, 1, 0),
              sections_voile(lambda y: dos(y) + 0.015 - 0.012, -0.098, 0.088, 0.012, 0.0020, n=8), segments=10, zone='nageoires')
nageoire_loft(bm, (0, 0, -0.010), (0, 0, -1), (0, 1, 0),
              sections_voile(lambda y: -ventre(y) + 0.014 - 0.010, -0.040, 0.088, -0.010, 0.0020, n=8), segments=10, zone='nageoires')
# Caudale tronquée : envergure vers l'arrière, corde du haut vers le bas
nageoire_loft(bm, (0, 0.095, 0.0), (0, 1, 0), (0, 0, -1), [
    (0.000, -0.020, 0.020, 0.0030), (0.010, -0.026, 0.026, 0.0026), (0.025, -0.036, 0.036, 0.0020),
    (0.040, -0.046, 0.046, 0.0014), (0.052, -0.054, 0.054, 0.0008), (0.056, -0.056, 0.056, 0.0004)],
    segments=12, zone='caudale', pointe=False)
# Pectorales : petites, arrondies ; elles ont un os (elles rament)
for s, nom in ((+1, 'pec_g'), (-1, 'pec_d')):
    v = nageoire_loft(bm, (s * 0.022, -0.045, -0.005), (s * 1.0, 0.30, -0.15), (0, 1, 0), [
        (0.000, -0.012, 0.012, 0.0020), (0.010, -0.011, 0.014, 0.0018), (0.020, -0.008, 0.015, 0.0014),
        (0.030, -0.002, 0.013, 0.0010), (0.036, 0.004, 0.009, 0.0)], segments=10, zone='pectorales')
    marquer(bm, v, nom, registre, ((s * 0.022, -0.045, -0.005), 0.012))
    # Pelviennes : petites, sous le corps
    nageoire_loft(bm, (s * 0.008, -0.030, -0.045), (s * 0.4, 0.5, -0.75), (0, 1, 0), [
        (0.000, -0.005, 0.010, 0.0015), (0.010, -0.003, 0.012, 0.0012), (0.020, 0.002, 0.012, 0.0008),
        (0.026, 0.006, 0.010, 0.0)], segments=8, zone='nageoires')

# ---------------------------------------------------------------- 3) les yeux
YEUX = [(+0.0195, -0.100, 0.028), (-0.0195, -0.100, 0.028)]
for oeil in YEUX:
    marquer_zone(bm, sphere(bm, oeil, 0.0075, segments=14, anneaux=9), 'yeux')

poisson = terminer_maillage(bm, 'Chirurgien')
sub = poisson.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 1

# ---------------------------------------------------------------- 4) la peau
BLEU   = (0.10, 0.34, 0.82)
BLEU_CLAIR = (0.40, 0.60, 0.92)
NOIR   = (0.03, 0.03, 0.05)
JAUNE  = (0.98, 0.80, 0.10)

def zn_de(t):
    """Hauteur normalisée dans le corps : +1 = ligne du dos, -1 = ligne du ventre."""
    h = np.interp(t.y, _ys, [c[2] for c in CLES])
    b = np.interp(t.y, _ys, [c[3] for c in CLES])
    cz = np.interp(t.y, _ys, [c[4] for c in CLES])
    z = t.z - cz
    return np.where(z >= 0, z / np.maximum(h, 1e-4), z / np.maximum(b, 1e-4))

def palette(t):
    """Le dessin noir, en (y, hauteur normalisée)."""
    y, zn = t.y, zn_de(t)
    fin = 1 - lisser(0.078, 0.086, y)                                     # tout s'arrête avant le pédoncule jaune
    sup = lisser(0.42, 0.50, zn) * (1 - lisser(0.80, 0.86, zn)) * lisser(-0.112, -0.100, y) * fin
    ped = lisser(0.050, 0.062, y) * lisser(-0.20, -0.12, zn) * (1 - lisser(0.80, 0.86, zn)) * fin
    w = 0.175 * np.clip((y + 0.032) / 0.045, 0, 1) ** 0.8               # bande basse effilée vers l'avant
    inf = (1 - lisser(w - 0.02, w + 0.02, np.abs(zn - 0.03))) * lisser(-0.034, -0.028, y) * fin
    oeil_noir = np.zeros(t.N, np.float32)
    for cx, cy, cz in YEUX:
        d = np.sqrt(((t.y - cy) / 0.016) ** 2 + ((t.z - cz) / 0.014) ** 2)
        oeil_noir = np.maximum(oeil_noir, 1 - lisser(0.8, 1.1, d))
    return np.clip(sup + ped + inf + oeil_noir, 0, 1) * t.zone('corps')

def couleur(t):
    corps_ = t.zone('corps')
    zn = zn_de(t)
    c = melanger(BLEU, BLEU_CLAIR, (1 - lisser(-0.75, -0.35, zn)) * 0.7)
    c *= (1 + 0.05 * fbm(t.p * 90, 3, graine=1))[:, None]
    c = melanger(c, JAUNE, lisser(0.080, 0.090, t.y) * corps_)                 # pédoncule : le scalpel
    c = melanger(c, NOIR, palette(t))
    # dorsale, anale, pelviennes : bleues, liseré noir au bord libre, rayons plus sombres
    nag = t.zone('nageoires')
    c_nag = melanger(BLEU, NOIR, lisser(0.80, 0.96, t.u))
    c_nag = melanger(c_nag, (0.06, 0.22, 0.60), 0.35 * (0.5 + 0.5 * np.cos(t.v * 2 * np.pi * 55)) * (1 - lisser(0.8, 0.9, t.u)))
    # pectorales : bleues à la base, jaunes au-delà de la moitié
    pec = t.zone('pectorales')
    c_pec = melanger(BLEU, JAUNE, lisser(0.35, 0.60, t.u))
    # caudale : jaune, deux coins noirs (haut et bas) qui s'élargissent vers l'arrière
    caud = t.zone('caudale')
    coin = np.maximum(1 - lisser(0.06 + 0.24 * t.u, 0.10 + 0.24 * t.u, t.v), lisser(0.90 - 0.24 * t.u, 0.94 - 0.24 * t.u, t.v))
    c_caud = melanger(JAUNE, NOIR, coin)
    c_caud = melanger(c_caud, (0.85, 0.66, 0.06), 0.3 * (0.5 + 0.5 * np.cos(t.v * 2 * np.pi * 26)))   # rayons
    c = c * corps_[:, None] + c_nag * nag[:, None] + c_pec * pec[:, None] + c_caud * caud[:, None]
    # bouche : un petit trait sombre au bout du museau
    c = melanger(c, NOIR, 0.7 * trait(t.z, -0.006, 0.004) * (t.y < -0.128) * corps_)
    # œil : pupille noire, iris doré fin, globe sombre
    a = angle_vers(t, YEUX, lambda c_: (np.sign(c_[0]), 0.0, 0.0))
    c_oeil = melanger((0.05, 0.08, 0.16), (0.60, 0.48, 0.20), 1 - lisser(0.52, 0.62, a))
    c_oeil = melanger(c_oeil, NOIR, 1 - lisser(0.36, 0.44, a))
    return melanger(c, c_oeil, t.zone('yeux'))

def hauteur(t):
    corps_ = t.zone('corps')
    F1, F2, _ = cellules(t.p / 0.0035, graine=3)                                # écailles fines
    h = -0.00015 * (1 - lisser(0.02, 0.10, F2 - F1)) * corps_ * (t.y > -0.09)
    d = np.sqrt((t.y + 0.03) ** 2 + (t.z * 1.05) ** 2)                          # bord de l'opercule (un arc)
    h -= 0.0008 * trait(d, 0.046, 0.003) * (t.y < -0.045) * corps_
    rayons = 0.5 + 0.5 * np.cos(t.v * 2 * np.pi * 55)
    h += 0.00025 * rayons * (t.zone('nageoires') + t.zone('pectorales'))
    h += 0.00025 * (0.5 + 0.5 * np.cos(t.v * 2 * np.pi * 26)) * t.zone('caudale')
    return h

def rugosite(t):
    r = 0.32 + 0.12 * (t.zone('nageoires') + t.zone('pectorales') + t.zone('caudale'))
    return np.where(t.zone('yeux') > 0.5, 0.10, r)

texturer(poisson, 'Peau_Chirurgien', resolution=1024, resolution_relief=512, resolution_orm=256,
         couleur=couleur, hauteur=hauteur, rugosite=rugosite)

# ---------------------------------------------------------------- 5) squelette et nage
# Nage LABRIFORME : ce sont les pectorales qui propulsent — elles rament (balayage
# avant-arrière, coup rapide et retour lent) en se mettant « en drapeau » au retour
# (vrillage en quadrature). Le corps ne fait qu'une petite onde et se balance ; la
# queue ne sert que par bouffées : une rafale de coups par clip, puis rien.
OS = [
    ('racine',  (0, -0.03, 0), (0, 0.03, 0), None),
    ('tete',    (0, -0.03, 0), (0, -0.135, 0), 'racine'),
    ('queue_1', (0, 0.03, 0), (0, 0.09, 0), 'racine'),
    ('queue_2', (0, 0.09, 0), (0, 0.155, 0), 'queue_1'),
    ('pec_g',   (0.022, -0.045, -0.005), (0.056, -0.035, -0.010), 'racine'),
    ('pec_d',   (-0.022, -0.045, -0.005), (-0.056, -0.035, -0.010), 'racine'),
]
CHAINE = [('racine', -0.03, 0.03), ('tete', -0.03, -0.135), ('queue_1', 0.03, 0.09), ('queue_2', 0.09, 0.155)]
armature = squelette('Armature_Chirurgien', OS)
peser_par_parties(poisson, armature, OS, registre, colonne=CHAINE)

PERIODE = 0.625                                         # un coup de pectorales : 1,6 Hz
R = 'rotation_euler'
m = Mouvement(armature, PERIODE, cycles=8)              # 5 s par clip
m.modulation(0.10, graine=3)
m.onde(CHAINE, longueur=0.29, s_museau=-0.135, A_tete=0.004, A_queue=0.035, exposant=2.5, longueur_onde=1.0)
for nom, s in (('pec_g', 1), ('pec_d', -1)):
    m.secondaire(nom, R, 2, 0.55 * s, phase=0.0, forme=asymetrique(0.35))      # balayage : coup rapide, retour lent
    m.secondaire(nom, R, 1, 0.35 * s, phase=1.57)                              # vrillage « en drapeau » au retour
    m.secondaire(nom, R, 0, 0.12, phase=0.8)                                   # léger battement haut-bas
m.secondaire('racine', R, 1, 0.03, phase=0.5)                                  # le corps se balance avec les coups
m.secondaire('racine', R, 0, 0.02, phase=1.2)
m.secondaire('racine', 'location', 1, 0.003, phase=-0.4)                       # et avance par à-coups (Y local = axe du corps)
# la rafale de queue : une bouffée de trois coups vers le tiers du clip, amortie
m.secondaire('queue_1', R, 2, 0.12, phase=0.0, enveloppe=m.rafale(0.35, 0.16))
m.secondaire('queue_2', R, 2, 0.28, phase=-1.0, enveloppe=m.rafale(0.35, 0.16))
m.cuire('swim')

chemin = exporter_glb('chirurgien.glb')
inspecter_glb(chemin)
