"""
peau.py — la peau des animaux : textures calculées point par point
===================================================================
Jusqu'ici, la couleur d'un animal était posée sommet par sommet : un motif ne
pouvait pas être plus fin que le maillage. Ici, la peau est une IMAGE (une
texture) : pour chaque texel on sait où il tombe sur l'animal (position 3D,
normale, repère tangent, coordonnées « corps »), et une fonction Python décide
de sa couleur, de son relief (carte de normales) et de sa brillance.

Ce que fait texturer(obj, …) :
  1. deplier()     Blender découpe le maillage en îlots UV (Smart UV Project).
  2. rasteriser()  pour chaque texel : position 3D, normale, tangente, et les
                   attributs « u », « v », « zone_* » posés à la construction
                   (interpolés dans les triangles du maillage FINAL, subdivision
                   comprise — donc exactement ce que le .glb contiendra) ;
                   puis dilatation : chaque texel hors îlot prend la valeur du
                   texel plein le plus proche (sinon, liserés aux coutures et
                   dans les mipmaps).
  3. les fonctions de l'espèce, vectorisées numpy :
       couleur(t)  → RGB « à l'écran » (sRGB, 0…1)
       hauteur(t)  → relief en mètres (dérivé le long des tangentes → carte de
                     normales dans l'espace tangent, convention glTF/OpenGL)
       rugosite(t) → 0 (miroir) … 1 (mat) ; alpha(t) → opacité ; emission(t)
     t est un Texels : t.p (N,3) positions, t.n normales, t.u, t.v, t.zone(nom).
  4. images JPEG/PNG écrites sur disque, matériau Principled qui les lit ;
     l'export glTF les embarque dans le .glb.

Le bruit (bruit(), fbm(), cellules()) est écrit ici en numpy pour que les
scripts d'espèces puissent moucheter, rayer, écailler sans dépendre des nœuds
de Blender — qui, eux, ne s'exportent pas.
"""
import bpy, math, os, time
import numpy as np
from mathutils import kdtree

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER_TEXTURES = os.path.join(RACINE, 'blender', '_textures')   # généré, ignoré par git


# ================================================================ bruit
def _hachage(ix, iy, iz, graine):
    """Entiers → [0, 1), déterministe. Arithmétique 32 bits non signée : les
    débordements font le mélange (c'est voulu)."""
    with np.errstate(over='ignore'):
        h = (ix.astype(np.uint32) * np.uint32(0x8da6b343)) ^ (iy.astype(np.uint32) * np.uint32(0xd8163841)) \
            ^ (iz.astype(np.uint32) * np.uint32(0xcb1ab31f)) ^ np.uint32((graine * 0x9e3779b1) & 0xffffffff)
        h ^= h >> np.uint32(15)
        h *= np.uint32(0x2c1b3c6d)
        h ^= h >> np.uint32(12)
        h *= np.uint32(0x297a2d39)
        h ^= h >> np.uint32(15)
    return (h & np.uint32(0xffffff)).astype(np.float32) / np.float32(0x1000000)


def bruit(p, graine=0):
    """Bruit de valeur 3D lisse, dans [-1, 1]. p : (N, 3)."""
    i = np.floor(p).astype(np.int64)
    f = (p - i).astype(np.float32)
    f = f * f * (3 - 2 * f)                                   # smoothstep : pas d'angles aux mailles
    ix, iy, iz = i[:, 0], i[:, 1], i[:, 2]
    def c(dx, dy, dz):
        return _hachage(ix + dx, iy + dy, iz + dz, graine)
    fx, fy, fz = f[:, 0], f[:, 1], f[:, 2]
    x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * fx
    x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * fx
    x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * fx
    x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * fx
    y0 = x00 + (x10 - x00) * fy
    y1 = x01 + (x11 - x01) * fy
    return 2.0 * (y0 + (y1 - y0) * fz) - 1.0


def fbm(p, octaves=4, lacunarite=2.0, gain=0.5, graine=0):
    """Somme d'octaves de bruit : du grand relief doux + du petit grain. Dans [-1, 1]."""
    somme = np.zeros(len(p), np.float32)
    amplitude, total = 1.0, 0.0
    q = np.asarray(p, np.float32)
    for k in range(octaves):
        somme += amplitude * bruit(q, graine + 31 * k)
        total += amplitude
        q = q * lacunarite + 17.31
        amplitude *= gain
    return somme / total


def cellules(p, graine=0):
    """Voronoï 3D (Worley) : (F1, F2, identifiant) — F1 = distance au point-graine
    le plus proche, F2 au deuxième (F2 − F1 ≈ 0 sur les frontières), identifiant
    ∈ [0, 1) propre à chaque cellule (pour lui donner SA teinte)."""
    i = np.floor(p).astype(np.int64)
    f = (p - i).astype(np.float32)
    F1 = np.full(len(p), np.inf, np.float32)
    F2 = np.full(len(p), np.inf, np.float32)
    ident = np.zeros(len(p), np.float32)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cy, cz = i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz
                gx = dx + _hachage(cx, cy, cz, graine)
                gy = dy + _hachage(cx, cy, cz, graine + 1)
                gz = dz + _hachage(cx, cy, cz, graine + 2)
                d = np.sqrt((f[:, 0] - gx) ** 2 + (f[:, 1] - gy) ** 2 + (f[:, 2] - gz) ** 2)
                plus_pres = d < F1
                F2 = np.where(plus_pres, F1, np.minimum(F2, d))
                ident = np.where(plus_pres, _hachage(cx, cy, cz, graine + 3), ident)
                F1 = np.where(plus_pres, d, F1)
    return F1, F2, ident


def lisser(a, b, x):
    """smoothstep vectorisé : 0 avant a, 1 après b, doux entre les deux."""
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def melanger(c1, c2, t):
    """Fondu entre deux couleurs (tuples ou tableaux (N,3)) selon t (N,)."""
    c1 = np.asarray(c1, np.float32)
    c2 = np.asarray(c2, np.float32)
    t = np.asarray(t, np.float32)[:, None]
    return c1 + (c2 - c1) * t


def couleur_unie(c, n):
    """Un tableau (n, 3) rempli de la couleur c."""
    return np.tile(np.asarray(c, np.float32), (n, 1))


def trait(x, centre, largeur):
    """1 au centre d'un trait de largeur donnée, 0 au-delà, bords doux."""
    return 1 - lisser(largeur * 0.35, largeur * 0.5, np.abs(x - centre))


def angle_vers(t, centres, axe):
    """Pour chaque texel, l'angle (rad) entre la direction « centre → texel » et l'axe
    donné, pour le centre le plus proche. Sert aux yeux : pupille = petit angle avec
    l'axe qui sort de la tête. axe = (x, y, z) ou une fonction centre → axe."""
    angle = np.full(t.N, np.pi, np.float32)
    for c in centres:
        d = t.p - np.asarray(c, np.float32)
        d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)
        a = np.asarray(axe(c) if callable(axe) else axe, np.float32)
        a = a / max(np.linalg.norm(a), 1e-6)
        angle = np.minimum(angle, np.arccos(np.clip(d @ a, -1, 1)))
    return angle


def reduire(image, facteur):
    """Sous-échantillonne une image (R, R, k) par moyenne de blocs facteur × facteur."""
    if facteur <= 1:
        return image
    R = image.shape[0] // facteur
    return image[:R * facteur, :R * facteur].reshape(R, facteur, R, facteur, -1).mean(axis=(1, 3))


# ================================================================ dépliage
def deplier(obj, angle=66.0, marge=0.02):
    """Smart UV Project : Blender découpe le maillage en îlots plats (les faces
    dont les normales divergent de plus de `angle` degrés changent d'îlot).
    Comme la peau est calculée en 3D, la découpe n'a aucune importance visuelle :
    seule compte la densité de texels, uniforme ici."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=marge)
    bpy.ops.object.mode_set(mode='OBJECT')


# ================================================================ rasterisation
class Texels:
    """Ce que les fonctions d'espèce reçoivent : un lot de texels avec, pour chacun,
    p (N,3) position, n (N,3) normale, u, v (N,) coordonnées « corps » posées à la
    construction, et zone(nom) (N,) ∈ [0,1] : appartenance à une partie."""
    def __init__(self, p, n, u, v, zones):
        self.p, self.n, self.u, self.v, self._zones = p, n, u, v, zones
        self.x, self.y, self.z = p[:, 0], p[:, 1], p[:, 2]
        self.N = len(p)

    def zone(self, nom):
        return self._zones.get(nom, np.zeros(self.N, np.float32))

    def decale(self, d):
        """Le même lot, déplacé de d (N,3) : pour dériver le relief le long des tangentes."""
        return Texels(self.p + d, self.n, self.u, self.v, self._zones)


def _attributs_flottants(me, nb, noms):
    """Lit les attributs flottants par sommet du maillage évalué. Si la subdivision
    ne les a pas propagés (tous nuls), on les recopie depuis le sommet d'origine le
    plus proche (kd-tree) : plus grossier, mais jamais faux."""
    res = {}
    for nom in noms:
        attr = me.attributes.get(nom)
        if attr is None or attr.domain != 'POINT':
            continue
        a = np.empty(nb, np.float32)
        attr.data.foreach_get('value', a)
        res[nom] = a
    return res


def rasteriser(obj, resolution):
    """Pour chaque texel de l'image resolution², le point de peau qu'il représente.
    Travaille sur le maillage ÉVALUÉ (modificateurs appliqués) : c'est celui que
    l'exporteur glTF écrira, donc ses UV sont les bonnes."""
    t0 = time.time()
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    nv, nl, nt = len(me.vertices), len(me.loops), len(me.loop_triangles)
    pos = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', pos); pos = pos.reshape(-1, 3)
    nrm = np.empty(nv * 3, np.float32); me.vertex_normals.foreach_get('vector', nrm); nrm = nrm.reshape(-1, 3)
    uv = np.empty(nl * 2, np.float32)
    couche = me.uv_layers.active
    if hasattr(couche, 'uv'):
        couche.uv.foreach_get('vector', uv)
    else:
        couche.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    tl = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('loops', tl); tl = tl.reshape(-1, 3)
    tv = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('vertices', tv); tv = tv.reshape(-1, 3)
    noms_attr = ['u', 'v'] + [a.name for a in me.attributes if a.name.startswith('zone_')]
    attrs = _attributs_flottants(me, nv, noms_attr)
    ev.to_mesh_clear()

    # Repère tangent par triangle : dP/du et dP/dv (comment la peau s'étire sur l'image)
    P0, P1, P2 = pos[tv[:, 0]], pos[tv[:, 1]], pos[tv[:, 2]]
    U0, U1, U2 = uv[tl[:, 0]], uv[tl[:, 1]], uv[tl[:, 2]]
    e1, e2 = P1 - P0, P2 - P0
    d1, d2 = U1 - U0, U2 - U0
    det = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]
    det = np.where(np.abs(det) < 1e-12, 1e-12, det)
    dPdu = (e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) / det[:, None]
    dPdv = (e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) / det[:, None]
    # taille d'un texel en mètres : pour les dérivées du relief
    aire_uv = np.abs(det) / 2 * resolution ** 2
    aire_3d = np.linalg.norm(np.cross(e1, e2), axis=1) / 2
    ok = aire_uv > 1e-6
    texel = float(np.median(np.sqrt(aire_3d[ok] / aire_uv[ok]))) if ok.any() else 1e-3

    R = resolution
    nb_canaux = 3 + 3 + 3 + 3 + len(attrs)         # pos, nrm, dPdu, dPdv, attributs
    carte = np.zeros((R, R, nb_canaux), np.float32)
    plein = np.zeros((R, R), bool)
    valeurs_sommets = np.concatenate([pos, nrm] + [attrs[n][:, None] for n in attrs], axis=1)   # (nv, 6 + k)
    for k in range(nt):
        l0, l1, l2 = tl[k]
        v0, v1, v2 = tv[k]
        p = uv[[l0, l1, l2]] * R
        x0, y0 = np.floor(p.min(0)).astype(int) - 1
        x1, y1 = np.ceil(p.max(0)).astype(int) + 1
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, R - 1), min(y1, R - 1)
        if x1 < x0 or y1 < y0:
            continue
        d = (p[1, 0] - p[0, 0]) * (p[2, 1] - p[0, 1]) - (p[2, 0] - p[0, 0]) * (p[1, 1] - p[0, 1])
        if abs(d) < 1e-9:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w1 = ((xs - p[0, 0]) * (p[2, 1] - p[0, 1]) - (p[2, 0] - p[0, 0]) * (ys - p[0, 1])) / d
        w2 = ((p[1, 0] - p[0, 0]) * (ys - p[0, 1]) - (xs - p[0, 0]) * (p[1, 1] - p[0, 1])) / d
        w0 = 1 - w1 - w2
        marge = -0.0015 * R / max(1.0, min(x1 - x0, y1 - y0))    # un demi-texel d'indulgence
        dedans = (w0 >= marge) & (w1 >= marge) & (w2 >= marge)
        if not dedans.any():
            continue
        V = valeurs_sommets[[v0, v1, v2]]
        val = w0[..., None] * V[0] + w1[..., None] * V[1] + w2[..., None] * V[2]
        bloc = carte[y0:y1 + 1, x0:x1 + 1]
        sel = dedans & ~plein[y0:y1 + 1, x0:x1 + 1]
        bloc[sel, :6] = val[sel][:, :6]
        bloc[sel, 12:] = val[sel][:, 6:]
        bloc[sel, 6:9] = dPdu[k]
        bloc[sel, 9:12] = dPdv[k]
        plein[y0:y1 + 1, x0:x1 + 1] |= dedans
    couverture = plein.mean()

    # Dilatation par « jump flooding » : chaque texel vide reçoit le plus proche texel plein
    yy, xx = np.mgrid[0:R, 0:R]
    ny = np.where(plein, yy, -1)
    nx = np.where(plein, xx, -1)
    meilleur = np.where(plein, 0.0, np.inf).astype(np.float32)
    pas = R // 2
    while pas >= 1:
        for dy in (-pas, 0, pas):
            for dx in (-pas, 0, pas):
                if dy == 0 and dx == 0:
                    continue
                cy = np.roll(ny, (dy, dx), (0, 1))
                cx = np.roll(nx, (dy, dx), (0, 1))
                valide = cy >= 0
                dist = ((cy - yy) ** 2 + (cx - xx) ** 2).astype(np.float32)
                dist = np.where(valide, dist, np.inf)
                mieux = dist < meilleur
                ny = np.where(mieux, cy, ny)
                nx = np.where(mieux, cx, nx)
                meilleur = np.where(mieux, dist, meilleur)
        pas //= 2
    carte = carte[ny, nx]

    # Repère tangent orthonormé par texel, convention MikkTSpace : T le long de dP/du,
    # B = signe × (N × T) avec le signe qui met B du côté de dP/dv (poignée de main des UV)
    N = carte[..., 3:6]
    N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-9)
    T = carte[..., 6:9]
    T = T - N * np.sum(T * N, axis=-1, keepdims=True)
    T /= np.maximum(np.linalg.norm(T, axis=-1, keepdims=True), 1e-9)
    B = np.cross(N, T)
    signe = np.sign(np.sum(B * carte[..., 9:12], axis=-1, keepdims=True))
    signe = np.where(signe == 0, 1.0, signe)
    B *= signe
    zones = {n[5:]: carte[..., 12 + i] for i, n in enumerate(attrs) if n.startswith('zone_')}   # « zone_corps » → « corps »
    u = carte[..., 12 + list(attrs).index('u')] if 'u' in attrs else np.zeros((R, R), np.float32)
    v = carte[..., 12 + list(attrs).index('v')] if 'v' in attrs else np.zeros((R, R), np.float32)
    print(f"  rasterisation {R}² : {nt} triangles, couverture {couverture * 100:.0f} %, "
          f"texel ≈ {texel * 1000:.2f} mm, {time.time() - t0:.1f} s")
    return dict(p=carte[..., 0:3], n=N, T=T, B=B, u=u, v=v, zones=zones, texel=texel, plein=plein)


# ================================================================ images
def _image(nom, rgba, chemin, fmt, couleur=True):
    """Écrit un tableau (R, R, 4) de flottants 0…1 dans un fichier image.
    couleur=True : ce sont des valeurs sRGB (une couleur « à l'écran ») ;
    False : des données brutes (normales, rugosité) — Non-Color."""
    R = rgba.shape[0]
    img = bpy.data.images.new(nom, R, R, alpha=(fmt == 'PNG'))
    img.colorspace_settings.name = 'sRGB' if couleur else 'Non-Color'
    img.pixels.foreach_set(np.ascontiguousarray(rgba, np.float32).ravel())
    img.filepath_raw = chemin
    img.file_format = fmt
    img.save()
    img.colorspace_settings.name = 'sRGB' if couleur else 'Non-Color'
    return img


def _normales(carte, hauteur, texels, relief):
    """Carte de normales tangentes à partir d'une fonction de relief h(p) en mètres :
    on dérive h le long de T et de B (différences finies d'un texel), la pente
    donne l'inclinaison. Convention glTF : +X vers +U, +Y vers +V, +Z hors surface."""
    eps = max(carte['texel'], 1e-4)
    T, B = carte['T'].reshape(-1, 3), carte['B'].reshape(-1, 3)
    dT = (hauteur(texels.decale(T * eps)) - hauteur(texels.decale(-T * eps))) / (2 * eps) * relief
    dB = (hauteur(texels.decale(B * eps)) - hauteur(texels.decale(-B * eps))) / (2 * eps) * relief
    # Le signe des deux premières composantes est INVERSÉ par rapport à la formule
    # classique (−∂h/∂T, −∂h/∂B, 1) : c'est ce qu'attend Three.js une fois passées
    # les tangentes exportées par Blender (qui retourne V à l'export). Vérifié
    # empiriquement avec blender/verifier_relief.py : une bosse géométrique et une
    # bosse « en carte » s'éclairent alors pareil. Ne pas « corriger » sans refaire ce test.
    n = np.stack([dT, dB, np.ones_like(dT)], axis=1)
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    return n * 0.5 + 0.5


def texturer(obj, nom, resolution=1024, couleur=None, hauteur=None, rugosite=None, alpha=None, emission=None,
             relief=1.0, metal=None, angle=66.0, marge=0.02, resolution_relief=None, resolution_orm=None):
    """Déplie, rasterise, calcule la peau, écrit les images et pose le matériau.
    couleur(t) → (N,3) sRGB ; hauteur(t) → (N,) mètres ; rugosite(t) → (N,) ;
    alpha(t) → (N,) (déclenche le mode transparent) ; emission(t) → (N,3) sRGB ;
    metal : constante 0…1 (facteur métallique du matériau).
    Tout est calculé à `resolution`, puis les cartes de relief et de rugosité sont
    réduites (moyenne de blocs) à resolution_relief (défaut : la moitié) et
    resolution_orm (défaut : le quart) : elles varient lentement, inutile de leur
    payer la mémoire GPU d'une carte de couleur."""
    os.makedirs(DOSSIER_TEXTURES, exist_ok=True)
    deplier(obj, angle, marge)
    carte = rasteriser(obj, resolution)
    R = resolution
    texels = Texels(carte['p'].reshape(-1, 3), carte['n'].reshape(-1, 3), carte['u'].ravel(), carte['v'].ravel(),
                    {k: z.ravel() for k, z in carte['zones'].items()})
    un = np.ones((R * R, 1), np.float32)

    mat = bpy.data.materials.new(nom)
    mat.use_nodes = True
    arbre = mat.node_tree
    bsdf = arbre.nodes.get('Principled BSDF')

    for nom_zone, z in carte['zones'].items():
        print(f"  zone {nom_zone} : {np.mean(z[carte['plein']] > 0.5) * 100:.0f} % des texels pleins")
    t0 = time.time()
    rgb = couleur(texels)
    nan = int(np.isnan(rgb).any(axis=1).sum())
    print(f"  couleur : min {np.nanmin(rgb):.2f} max {np.nanmax(rgb):.2f} moyenne {np.nanmean(rgb):.2f}"
          + (f" — ⚠ {nan} texels NaN (mis en gris)" if nan else ""))
    rgb = np.clip(np.nan_to_num(rgb, nan=0.5), 0, 1).astype(np.float32)
    a = np.clip(alpha(texels), 0, 1).astype(np.float32)[:, None] if alpha else un
    fmt = 'PNG' if alpha else 'JPEG'
    img_c = _image(f'{nom}_couleur', np.concatenate([rgb, a], 1).reshape(R, R, 4),
                   os.path.join(DOSSIER_TEXTURES, f'{nom}_couleur.{"png" if alpha else "jpg"}'), fmt, couleur=True)
    noeud_c = arbre.nodes.new('ShaderNodeTexImage')
    noeud_c.image = img_c
    arbre.links.new(noeud_c.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha:
        arbre.links.new(noeud_c.outputs['Alpha'], bsdf.inputs['Alpha'])
        for attribut, valeur in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try:
                setattr(mat, attribut, valeur)
            except Exception:
                pass
        mat.use_backface_culling = False
    print(f"  couleur : {time.time() - t0:.1f} s")

    if hauteur:
        t0 = time.time()
        Rr = resolution_relief or resolution // 2
        nrm = _normales(carte, hauteur, texels, relief).reshape(R, R, 3)
        nrm = reduire(nrm * 2 - 1, R // Rr)                               # moyenne des normales, puis renormalisation
        nrm /= np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-6)
        nrm = (nrm * 0.5 + 0.5).astype(np.float32)
        img_n = _image(f'{nom}_normales', np.concatenate([nrm, np.ones((Rr, Rr, 1), np.float32)], -1),
                       os.path.join(DOSSIER_TEXTURES, f'{nom}_normales.png'), 'PNG', couleur=False)
        noeud_n = arbre.nodes.new('ShaderNodeTexImage')
        noeud_n.image = img_n
        carte_n = arbre.nodes.new('ShaderNodeNormalMap')
        carte_n.space = 'TANGENT'
        arbre.links.new(noeud_n.outputs['Color'], carte_n.inputs['Color'])
        arbre.links.new(carte_n.outputs['Normal'], bsdf.inputs['Normal'])
        print(f"  relief : {time.time() - t0:.1f} s")

    if rugosite:
        Ro = resolution_orm or resolution // 4
        r = np.clip(rugosite(texels), 0, 1).astype(np.float32)
        m = np.full_like(r, metal or 0.0)
        # image « ORM » : rouge = occlusion (1), vert = rugosité, bleu = métal — le rangement de glTF
        orm = np.stack([np.ones_like(r), r, m, np.ones_like(r)], 1).reshape(R, R, 4)
        orm = reduire(orm, R // Ro).astype(np.float32)
        img_r = _image(f'{nom}_orm', orm, os.path.join(DOSSIER_TEXTURES, f'{nom}_orm.jpg'), 'JPEG', couleur=False)
        noeud_r = arbre.nodes.new('ShaderNodeTexImage')
        noeud_r.image = img_r
        separer = arbre.nodes.new('ShaderNodeSeparateColor')
        arbre.links.new(noeud_r.outputs['Color'], separer.inputs['Color'])
        arbre.links.new(separer.outputs['Green'], bsdf.inputs['Roughness'])
        arbre.links.new(separer.outputs['Blue'], bsdf.inputs['Metallic'])
    else:
        bsdf.inputs['Roughness'].default_value = 0.5
        if metal:
            bsdf.inputs['Metallic'].default_value = metal

    if emission:
        e = np.clip(emission(texels), 0, 1).astype(np.float32)
        img_e = _image(f'{nom}_emission', np.concatenate([e, un], 1).reshape(R, R, 4),
                       os.path.join(DOSSIER_TEXTURES, f'{nom}_emission.jpg'), 'JPEG', couleur=True)
        noeud_e = arbre.nodes.new('ShaderNodeTexImage')
        noeud_e.image = img_e
        arbre.links.new(noeud_e.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0

    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat
