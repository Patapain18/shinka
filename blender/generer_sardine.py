"""
generer_sardine.py — la sardine (Sardina pilchardus), v2
=========================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_sardine.py

20 cm. PAS de squelette : elle est instanciée par centaines (InstancedMesh) et
l'animation par squelette ne s'instancie pas — sa nage est un vertex shader côté
site (banc.js). Pas de subdivision non plus : ~900 triangles, c'est le budget
d'un banc de 300. Une seule texture 512², partagée par tout le banc.
Ce qui fait une sardine : un fuseau comprimé, le dos bleu-vert, les flancs
d'ARGENT (matériau métallique), le ventre blanc, une rangée de points sombres
derrière l'opercule, un grand œil, l'opercule strié, la caudale fourchue.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from commun import *
from peau import *

nettoyer_scene()
bm = nouveau_bmesh(zones=('corps', 'nageoires', 'yeux'))

CLES = [
    (-0.090, 0.0026, 0.003, 0.003, -0.002),
    (-0.080, 0.0068, 0.011, 0.010, -0.001),
    (-0.060, 0.013, 0.018, 0.016,  0.000),
    (-0.030, 0.015, 0.021, 0.019,  0.000),
    ( 0.000, 0.015, 0.021, 0.019,  0.000),
    ( 0.030, 0.013, 0.019, 0.017,  0.000),
    ( 0.060, 0.009, 0.013, 0.012,  0.000),
    ( 0.075, 0.005, 0.007, 0.006,  0.000),
    ( 0.082, 0.003, 0.004, 0.004,  0.000),
]
corps(bm, CLES, anneaux=18, segments=12, exposant=2.0, zone='corps')
_ys = np.array([c[0] for c in CLES])
# caudale fourchue : deux lobes fins
for sz in (+1, -1):
    nageoire_loft(bm, (0, 0.080, 0.0), (0, 0.72, sz * 0.69), (0, 0.69, -sz * 0.72), [
        (0.000, -0.006, 0.006, 0.0008), (0.010, -0.005, 0.010, 0.0006), (0.022, -0.004, 0.008, 0.0004),
        (0.030, -0.002, 0.004, 0.0002), (0.035, 0.000, 0.002, 0.0)], segments=8, zone='nageoires')
# dorsale unique à mi-corps, anale petite
nageoire_loft(bm, (0, 0, 0.012), (0, 0, 1), (0, 1, 0), [
    (0.000, -0.032, 0.000, 0.0008), (0.008, -0.030, -0.006, 0.0006), (0.016, -0.024, -0.012, 0.0004),
    (0.022, -0.018, -0.015, 0.0)], segments=8, zone='nageoires')
nageoire_loft(bm, (0, 0, -0.010), (0, 0, -1), (0, 1, 0), [
    (0.000, 0.035, 0.060, 0.0006), (0.006, 0.037, 0.055, 0.0004), (0.010, 0.040, 0.050, 0.0)],
    segments=8, zone='nageoires')
for s in (+1, -1):
    nageoire_loft(bm, (s * 0.010, -0.048, -0.008), (s * 1.0, 0.5, -0.3), (0, 1, 0), [
        (0.000, -0.006, 0.006, 0.0006), (0.008, -0.004, 0.008, 0.0004), (0.016, 0.000, 0.008, 0.0002),
        (0.020, 0.004, 0.006, 0.0)], segments=8, zone='nageoires')
    nageoire_loft(bm, (s * 0.006, 0.000, -0.016), (s * 0.6, 0.6, -0.5), (0, 1, 0), [
        (0.000, -0.004, 0.004, 0.0005), (0.006, -0.002, 0.005, 0.0003), (0.010, 0.001, 0.004, 0.0)],
        segments=6, zone='nageoires')
YEUX = [(+0.0095, -0.066, 0.004), (-0.0095, -0.066, 0.004)]
for oeil in YEUX:
    marquer_zone(bm, sphere(bm, oeil, 0.0055, segments=10, anneaux=7), 'yeux')

sardine = terminer_maillage(bm, 'Sardine')      # pas de subdivision, volontairement

DOS = (0.13, 0.32, 0.40)
ARGENT = (0.84, 0.87, 0.87)
VENTRE = (0.93, 0.95, 0.94)
TACHE = (0.14, 0.19, 0.24)
OR = (0.88, 0.80, 0.58)

def zn_de(t):
    h = np.interp(t.y, _ys, [c[2] for c in CLES]); b = np.interp(t.y, _ys, [c[3] for c in CLES])
    cz = np.interp(t.y, _ys, [c[4] for c in CLES]); z = t.z - cz
    return np.where(z >= 0, z / np.maximum(h, 1e-4), z / np.maximum(b, 1e-4))

def couleur(t):
    corps_ = t.zone('corps')
    zn = zn_de(t)
    c = melanger(ARGENT, DOS, lisser(0.30, 0.60, zn + 0.04 * fbm(t.p * 120, 2, graine=1)))
    c = melanger(c, VENTRE, 1 - lisser(-0.75, -0.35, zn))
    c = melanger(c, OR, 0.35 * trait(zn, 0.22, 0.14) * lisser(-0.05, 0.02, t.y))           # reflet doré du flanc
    opercule = lisser(-0.075, -0.068, t.y) * (1 - lisser(-0.048, -0.042, t.y)) * (np.abs(zn) < 0.8)
    c = melanger(c, OR, 0.25 * opercule)
    taches = np.zeros(t.N, np.float32)
    for k in range(7):
        d = np.sqrt(((t.y + 0.050 - 0.011 * k) / 0.0024) ** 2 + ((zn - 0.42) / 0.09) ** 2)
        taches = np.maximum(taches, 1 - lisser(0.7, 1.1, d))
    c = melanger(c, TACHE, taches * (np.abs(t.x) > 0.004))
    c = c * corps_[:, None] + couleur_unie((0.74, 0.78, 0.78), t.N) * t.zone('nageoires')[:, None]
    c = melanger(c, (0.20, 0.22, 0.24), 0.4 * (0.5 + 0.5 * np.cos(t.v * 2 * np.pi * 14)) * t.zone('nageoires'))   # rayons
    a = angle_vers(t, YEUX, lambda c_: (np.sign(c_[0]), 0.0, 0.0))
    c_oeil = melanger((0.55, 0.58, 0.58), (0.86, 0.86, 0.80), 1 - lisser(0.55, 0.65, a))
    c_oeil = melanger(c_oeil, (0.02, 0.02, 0.03), 1 - lisser(0.36, 0.44, a))
    return melanger(c, c_oeil, t.zone('yeux'))

def hauteur(t):
    corps_ = t.zone('corps')
    opercule = lisser(-0.075, -0.068, t.y) * (1 - lisser(-0.048, -0.042, t.y)) * (np.abs(zn_de(t)) < 0.8)
    stries = 0.5 + 0.5 * np.cos(np.arctan2(t.z, t.y + 0.075) * 22)               # stries rayonnantes de l'opercule
    h = 0.00015 * stries * opercule * corps_
    F1, F2, _ = cellules(t.p / 0.004, graine=2)
    h -= 0.00008 * (1 - lisser(0.02, 0.10, F2 - F1)) * corps_ * (t.y > -0.045)  # écailles
    h += 0.00015 * (0.5 + 0.5 * np.cos(t.v * 2 * np.pi * 14)) * t.zone('nageoires')
    return h

def rugosite(t):
    r = 0.22 + 0.20 * lisser(0.3, 0.7, zn_de(t)) * t.zone('corps') + 0.30 * t.zone('nageoires')
    return np.where(t.zone('yeux') > 0.5, 0.08, r)

texturer(sardine, 'Peau_Sardine', resolution=512, resolution_relief=256, resolution_orm=128,
         couleur=couleur, hauteur=hauteur, rugosite=rugosite, metal=0.55)
chemin = exporter_glb('sardine.glb')
inspecter_glb(chemin)
