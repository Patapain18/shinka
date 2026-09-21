"""
generer_sardine.py — la sardine (Sardina pilchardus)
=====================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/generer_sardine.py

16 cm. PAS de squelette : elle est instanciée par centaines (InstancedMesh) et
l'animation par squelette ne s'instancie pas. Sa nage est codée dans un vertex
shader côté site (banc.js). Pas de subdivision non plus : ~300 triangles, c'est
le budget pour un banc de 300.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
from commun import *

nettoyer_scene()
bm = nouveau_bmesh()
PROFIL = [(0.0, 0.002, 0.003), (0.10, 0.009, 0.013), (0.30, 0.013, 0.019), (0.50, 0.013, 0.019),
          (0.70, 0.010, 0.016), (0.90, 0.005, 0.008), (1.0, 0.003, 0.005)]
corps_fusiforme(bm, PROFIL, -0.085, 0.075, stations=14, segments=10, aplatir_ventre=0.9)
nageoire(bm, [(0, 0.070, 0.004), (0, 0.100, 0.022), (0, 0.088, 0.0), (0, 0.100, -0.022), (0, 0.070, -0.004)], 0.002)   # caudale fourchue
nageoire(bm, [(0, -0.020, 0.016), (0, -0.005, 0.030), (0, 0.012, 0.015)], 0.002)                                        # dorsale
for s in (+1, -1):
    nageoire(bm, [(s * 0.011, -0.040, -0.004), (s * 0.030, -0.020, -0.012), (s * 0.012, -0.020, -0.006)], 0.0015)
YEUX = [(+0.0085, -0.062, 0.004), (-0.0085, -0.062, 0.004)]
for oeil in YEUX:
    sphere(bm, oeil, 0.003, segments=8, anneaux=5)

sardine = terminer_maillage(bm, 'Sardine')      # pas de subdivision, volontairement

def retouche(co, c):
    for oeil in YEUX:
        if (co - Vector(oeil)).length < 0.0045:
            return [0.01, 0.01, 0.012]
    return c

colorer_ventre_dos(sardine, dos=srgb(0.16, 0.34, 0.46), ventre=srgb(0.86, 0.90, 0.90), z_bas=-0.004, z_haut=0.010, retouche=retouche)
sardine.data.materials.append(materiau_peau('Peau_Sardine', rugosite=0.3))
chemin = exporter_glb('sardine.glb')
inspecter_glb(chemin)
