"""
verifier_relief.py — le test de signe des cartes de normales
=============================================================
Lancer : /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/verifier_relief.py
puis :   http://localhost:8792/outils/visionneuse.html?modele=_essais/bosses&vue=dessus

Une plaque avec deux bosses identiques : l'une est de la VRAIE géométrie, l'autre
n'existe que dans la carte de normales (peau.py). Les deux doivent s'éclairer du
même côté. Si elles s'éclairent à l'opposé, la convention de _normales() dans
peau.py ne correspond plus à ce que fait la chaîne exporteur glTF → Three.js
(ça peut changer avec une version de Blender ou de Three).
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, bmesh
from commun import *
from peau import *

nettoyer_scene()
bm = nouveau_bmesh(zones=('plaque',))
res = bmesh.ops.create_grid(bm, x_segments=64, y_segments=64, size=0.5)
cz = bm.verts.layers.float.get('zone_plaque')
for v in res['verts']:
    v.co.z += 0.05 * math.exp(-((v.co.x + 0.25) ** 2 + v.co.y ** 2) / 0.01)     # la bosse géométrique, en x < 0
    v[cz] = 1.0
plaque = terminer_maillage(bm, 'Plaque')

def couleur(t):
    return couleur_unie((0.6, 0.6, 0.6), t.N)

def hauteur(t):                                                                  # la bosse « en carte », en x > 0
    return 0.05 * np.exp(-((t.x - 0.25) ** 2 + t.y ** 2) / 0.01)

texturer(plaque, 'Peau_Plaque', resolution=512, couleur=couleur, hauteur=hauteur)
os.makedirs(os.path.join(DOSSIER_MODELES, '_essais'), exist_ok=True)
inspecter_glb(exporter_glb('_essais/bosses.glb'))
