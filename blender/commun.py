"""
commun.py — boîte à outils partagée par tous les générateurs d'animaux
=======================================================================
Chaque animal a son script `generer_<id>.py` qui décrit SA forme (profil du
corps, nageoires, os, nage). Tout ce qui est générique vit ici :

  nettoyer_scene()        vide la scène par défaut de Blender
  corps_fusiforme()       un corps « poisson » par anneaux le long de l'axe Y (v1)
  corps()                 le loft général : super-ellipses, Catmull-Rom, u/v (v2)
  nageoire()              une plaque fine à partir d'un polygone
  nageoire_loft()         une nageoire épaisse à profil d'aile (v2)
  revolution()            une surface de révolution (cloche, dôme) (v2)
  marquer_zone()          étiquette de PEAU : zone + coordonnées u/v (v2, voir peau.py)
  terminer_maillage()     bmesh → objet Blender lissé
  colorer_ventre_dos()    couleurs par sommet : dos sombre, ventre clair
  materiau_peau()         un Principled BSDF qui lit ces couleurs
  squelette_colonne()     une chaîne d'os le long de l'axe Y
  peser_colonne()         poids de peau calculés à la main (pas d'opérateur capricieux)
  animer_nage()           l'action « swim » : ondulation qui court vers la queue
  exporter_glb()          export glTF binaire selon DESIGN.md §7
  inspecter_glb()         relit le fichier et affiche ce qu'il contient

Conventions (DESIGN.md §7) : 1 unité = 1 m, tête vers -Y, dos vers +Z.
L'export « +Y up » de glTF transforme -Y Blender en +Z Three.js : le museau
arrive exactement là où `Object3D.lookAt()` l'attend.
"""
import bpy, bmesh, math, os, json, struct
from mathutils import Vector

COUCHE_PARTIE = 'partie'
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER_MODELES = os.path.join(RACINE, 'models')


# ---------------------------------------------------------------- scène
def nettoyer_scene():
    """Vide la scène par défaut (cube, caméra, lampe) : on part de zéro."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for bloc in list(collection):
            collection.remove(bloc)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = 24
    bpy.context.view_layer.update()      # sinon la view layer garde des entrées fantômes


def _activer(obj):
    """Rend l'objet actif et sélectionné : les opérateurs (mode_set…) l'exigent."""
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects:
        if o is not None:
            o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# ---------------------------------------------------------------- géométrie
def nouveau_bmesh(zones=()):
    """Crée le bmesh ET ses couches de données AVANT toute géométrie. Ajouter une
    couche après coup réorganise les données internes : toutes les références
    Python aux sommets deviennent invalides (« BMesh data … has been removed »)
    et l'ordre des sommets n'est plus fiable.
    Couches : « partie » (entier : l'os qui porte le sommet), « crease_edge »
    (pli des arêtes), « u » et « v » (coordonnées « corps » : t le long du corps
    et angle autour, ou envergure et corde d'une nageoire — la peau s'en sert
    pour placer ses motifs), et une couche « zone_<nom> » par zone demandée
    (1 = le sommet appartient à cette partie : corps, nageoires, yeux…)."""
    bm = bmesh.new()
    bm.verts.layers.int.new(COUCHE_PARTIE)
    bm.edges.layers.float.new('crease_edge')
    bm.faces.layers.int.new('oriente')       # 1 = face construite déjà tournée vers l'extérieur (voir terminer_maillage)
    bm.verts.layers.float.new('u')
    bm.verts.layers.float.new('v')
    for z in zones:
        bm.verts.layers.float.new(f'zone_{z}')
    return bm


def marquer_zone(bm, sommets, zone, u=None, v=None):
    """Étiquette des sommets pour la PEAU (pas pour le rig, voir marquer()) :
    zone = nom d'une zone passée à nouveau_bmesh(), u/v = coordonnées « corps »
    optionnelles (une valeur pour tous, ou une liste alignée sur `sommets`)."""
    couche = bm.verts.layers.float.get(f'zone_{zone}')
    if couche is None:
        raise KeyError(f"zone « {zone} » : la déclarer dans nouveau_bmesh(zones=…)")
    cu, cv = bm.verts.layers.float.get('u'), bm.verts.layers.float.get('v')
    for i, s in enumerate(sommets):
        s[couche] = 1.0
        if u is not None:
            s[cu] = u[i] if hasattr(u, '__len__') else u
        if v is not None:
            s[cv] = v[i] if hasattr(v, '__len__') else v


def _orienter(bm, faces):
    """Marque des faces comme construites vers l'extérieur : terminer_maillage() ne
    les confiera pas à recalc_face_normals(), qui se trompe sur les formes minces
    (une nageoire à bord de fuite effilé : il retourne une partie des faces)."""
    couche = bm.faces.layers.int.get('oriente')
    if couche is not None:
        for f in faces:
            f[couche] = 1


def _orienter_autour(bm, sommets):
    """Idem pour toutes les faces qui touchent ces sommets (primitives bmesh.ops)."""
    faces = set()
    for v in sommets:
        faces.update(v.link_faces)
    _orienter(bm, faces)


def _catmull(cles, t):
    """Interpolation de Catmull-Rom : passe par chaque clé (x, valeurs…) avec une
    courbe douce, sans les plats du smoothstep. cles triées par x ; t = un x."""
    xs = [c[0] for c in cles]
    if t <= xs[0]:
        return list(cles[0][1:])
    if t >= xs[-1]:
        return list(cles[-1][1:])
    i = max(j for j in range(len(xs) - 1) if xs[j] <= t)
    p0, p1, p2, p3 = cles[max(i - 1, 0)], cles[i], cles[i + 1], cles[min(i + 2, len(cles) - 1)]
    u = (t - p1[0]) / (p2[0] - p1[0])
    res = []
    for k in range(1, len(p1)):
        a, b, c, d = p0[k], p1[k], p2[k], p3[k]
        res.append(0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u ** 3))
    return res


def corps(bm, cles, anneaux=36, segments=24, exposant=2.0, zone=None):
    """Loft général d'un corps le long de Y (tête vers -Y) : cles = [(y, demi_largeur,
    haut, bas, centre_z), …] triées par y — haut = hauteur du dos au-dessus de
    l'axe (centre_z), bas = profondeur du ventre. Chaque section est une
    super-ellipse : exposant 2 = ellipse, 2.5-3 = flancs plus pleins (thon,
    baleine), 1.5 = plus anguleux. Interpolation Catmull-Rom entre les clés,
    anneaux resserrés aux deux bouts (là où la forme change vite).
    Couches : u = position le long du corps (0 museau → 1 queue), v = angle
    autour (0 = flanc droit +X, 0,25 = dos, 0,5 = flanc gauche, 0,75 = ventre).
    Une clé de demi-largeur nulle aux bouts fait une pointe. Renvoie les sommets."""
    y0, y1 = cles[0][0], cles[-1][0]
    cu, cv = bm.verts.layers.float.get('u'), bm.verts.layers.float.get('v')
    couche_zone = bm.verts.layers.float.get(f'zone_{zone}') if zone else None
    rings = []
    sommets = []
    for i in range(1, anneaux):
        s = i / anneaux
        t = 0.5 - 0.5 * math.cos(math.pi * s)            # espacement en cosinus : dense aux extrémités
        y = y0 + t * (y1 - y0)
        rx, haut, bas, cz = _catmull(cles, y)[:4]
        rx, haut, bas = max(rx, 1e-4), max(haut, 1e-4), max(bas, 1e-4)
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            ca, sa = math.cos(a), math.sin(a)
            cs = math.copysign(abs(ca) ** (2 / exposant), ca)
            sn = math.copysign(abs(sa) ** (2 / exposant), sa)
            z = cz + (haut if sn >= 0 else bas) * sn
            vtx = bm.verts.new((rx * cs, y, z))
            vtx[cu], vtx[cv] = t, a / (2 * math.pi)
            if couche_zone is not None:
                vtx[couche_zone] = 1.0
            ring.append(vtx)
        rings.append(ring)
        sommets += ring
    avant = bm.verts.new((0.0, y0, cles[0][4]))
    arriere = bm.verts.new((0.0, y1, cles[-1][4]))
    for vtx, uu in ((avant, 0.0), (arriere, 1.0)):
        vtx[cu], vtx[cv] = uu, 0.25
        if couche_zone is not None:
            vtx[couche_zone] = 1.0
    n = segments
    faces = []
    # Ordre des sommets choisi pour que chaque face regarde DEHORS (règle de la main droite)
    for k in range(n):
        faces.append(bm.faces.new((avant, rings[0][k], rings[0][(k + 1) % n])))
    for A, B in zip(rings, rings[1:]):
        for k in range(n):
            faces.append(bm.faces.new((A[k], B[k], B[(k + 1) % n], A[(k + 1) % n])))
    for k in range(n):
        faces.append(bm.faces.new((arriere, rings[-1][(k + 1) % n], rings[-1][k])))
    _orienter(bm, faces)
    return [avant, arriere] + sommets


def _naca(c):
    """Épaisseur relative d'un profil d'aile symétrique (NACA 00xx) le long de la
    corde c ∈ [0,1] : bord d'attaque rond, bord de fuite effilé. Max ≈ 1 vers c = 0,3."""
    return 5.0 * (0.2969 * math.sqrt(c) - 0.1260 * c - 0.3516 * c ** 2 + 0.2843 * c ** 3 - 0.1015 * c ** 4)


def nageoire_loft(bm, origine, envergure, corde, sections, segments=12, zone=None, pointe=True):
    """Une nageoire ÉPAISSE par loft de sections le long de l'envergure — une vraie
    aile, pas une plaque : bord d'attaque rond, bord de fuite fin (profil NACA).
    origine : point 3D de départ (dans le corps) ; envergure, corde : vecteurs
    unitaires (de la racine vers le bout ; du bord d'attaque vers le bord de fuite).
    sections = [(s, attaque, fuite, demi_epaisseur), …] : à la distance s le long
    de l'envergure, le bord d'attaque est à `attaque` et le bord de fuite à `fuite`
    le long de la corde (mesurés depuis l'origine). La dernière section donne le
    bout : un point à mi-corde (pointe=True), ou — pointe=False — une dernière
    section entière refermée par une face plate (caudale tronquée, bout carré).
    Couches : u = envergure (0 racine → 1 bout), v = corde (0 attaque → 1 fuite)."""
    E, C = Vector(envergure).normalized(), Vector(corde).normalized()
    Nn = E.cross(C).normalized()
    O = Vector(origine)
    cu, cv = bm.verts.layers.float.get('u'), bm.verts.layers.float.get('v')
    couche_zone = bm.verts.layers.float.get(f'zone_{zone}') if zone else None
    s_max = sections[-1][0]
    for s, attaque, fuite, e in sections[:-1]:
        if fuite <= attaque:                        # sinon la section est retournée : nageoire à l'envers
            raise ValueError(f"nageoire_loft : à s={s}, bord de fuite ({fuite}) ≤ bord d'attaque ({attaque})")
    rings = []
    sommets = []
    for s, attaque, fuite, e in sections[:-1]:
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            c = (1 - math.cos(a)) / 2                     # 0 au bord d'attaque, 1 au bord de fuite
            ep = e * _naca(c) * math.sin(a)               # + dessus, - dessous
            pos = O + E * s + C * (attaque + c * (fuite - attaque)) + Nn * ep
            vtx = bm.verts.new(pos)
            vtx[cu], vtx[cv] = s / s_max, c
            if couche_zone is not None:
                vtx[couche_zone] = 1.0
            ring.append(vtx)
        rings.append(ring)
        sommets += ring
    s, attaque, fuite, e = sections[-1]
    n = segments
    extremite = []
    if pointe:
        bout = bm.verts.new(O + E * s + C * ((attaque + fuite) / 2))
        bout[cu], bout[cv] = 1.0, 0.5
        if couche_zone is not None:
            bout[couche_zone] = 1.0
        extremite = [bout]
    else:                                                     # dernière section entière (bout tronqué)
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n
            c = (1 - math.cos(a)) / 2
            pos = O + E * s + C * (attaque + c * (fuite - attaque)) + Nn * (max(e, 1e-4) * _naca(c) * math.sin(a))
            vtx = bm.verts.new(pos)
            vtx[cu], vtx[cv] = 1.0, c
            if couche_zone is not None:
                vtx[couche_zone] = 1.0
            ring.append(vtx)
        rings.append(ring)
        extremite = ring
    faces = []
    for A, B in zip(rings, rings[1:]):
        for k in range(n):
            faces.append(bm.faces.new((A[k], B[k], B[(k + 1) % n], A[(k + 1) % n])))
    if pointe:
        for k in range(n):
            faces.append(bm.faces.new((rings[-1][(k + 1) % n], rings[-1][k], bout)))
    else:
        faces.append(bm.faces.new(rings[-1]))                 # la face du bout (regarde vers +E)
    faces.append(bm.faces.new(list(reversed(rings[0]))))      # l'emplanture, fermée (elle est dans le corps)
    _orienter(bm, faces)
    return extremite + sommets


def sections_voile(bord, y0, y1, z_base, e_base, n=8):
    """Les sections d'une nageoire « voile » (dorsale ou anale longue) pour
    nageoire_loft(origine=(0, 0, z_base), envergure=±Z, corde=+Y) : bord(y) = hauteur
    du bord libre au-dessus de z_base (positive), pour y ∈ [y0, y1]. À la hauteur s,
    la corde va du premier au dernier y où bord(y) ≥ s : la nageoire épouse la
    courbe du dos, plus haute là où le dos est haut. Épaisseur qui s'effile."""
    ys = [y0 + (y1 - y0) * i / 300 for i in range(301)]
    zs = [bord(y) for y in ys]
    s_max = max(zs)
    sections = []
    for k in range(n):
        s = s_max * (k / n) ** 1.3                    # sections resserrées près de la base
        dedans = [y for y, z in zip(ys, zs) if z >= s]
        e = e_base * (1 - s / s_max) ** 0.6 + 1e-4
        sections.append((s, min(dedans), max(dedans), e))
    y_top = ys[zs.index(s_max)]
    sections.append((s_max, y_top - 0.002, y_top + 0.002, 0.0))
    return sections


def revolution(bm, profil, segments=32, centre=(0.0, 0.0, 0.0), zone=None):
    """Surface de révolution autour de Z : profil = [(rayon, z), …] du haut vers le
    bas (une cloche de méduse, un œil, un dôme). Un rayon nul fait un pôle.
    Couches : u = position le long du profil (0 → 1), v = angle."""
    cu, cv = bm.verts.layers.float.get('u'), bm.verts.layers.float.get('v')
    couche_zone = bm.verts.layers.float.get(f'zone_{zone}') if zone else None
    cx, cy, cz = centre
    rings = []
    sommets = []
    for i, (r, z) in enumerate(profil):
        uu = i / (len(profil) - 1)
        if r < 1e-5:
            vtx = bm.verts.new((cx, cy, cz + z))
            vtx[cu], vtx[cv] = uu, 0.0
            if couche_zone is not None:
                vtx[couche_zone] = 1.0
            rings.append([vtx])
            sommets.append(vtx)
            continue
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            vtx = bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), cz + z))
            vtx[cu], vtx[cv] = uu, a / (2 * math.pi)
            if couche_zone is not None:
                vtx[couche_zone] = 1.0
            ring.append(vtx)
        rings.append(ring)
        sommets += ring
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


def lisser(t):
    """smoothstep : 0 → 1 avec départ et arrivée en douceur."""
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def srgb(r, g, b):
    """Couleur pensée « à l'écran » (sRGB) → valeurs linéaires que Blender attend."""
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b))


def interpoler_profil(profil, t):
    """profil = [(t, demi_largeur, demi_hauteur), …] trié par t. Interpolation douce."""
    if t <= profil[0][0]:
        return profil[0][1], profil[0][2]
    for (t0, a0, b0), (t1, a1, b1) in zip(profil, profil[1:]):
        if t0 <= t <= t1:
            u = lisser((t - t0) / (t1 - t0)) if t1 > t0 else 0.0
            return a0 + (a1 - a0) * u, b0 + (b1 - b0) * u
    return profil[-1][1], profil[-1][2]


def corps_fusiforme(bm, profil, y_debut, y_fin, stations=30, segments=18, aplatir_ventre=0.88, decalage=(0.0, 0.0)):
    """Un corps de poisson par « loft » : des anneaux elliptiques échelonnés le long
    de Y, une pointe à chaque bout. profil donne la demi-largeur (x) et la
    demi-hauteur (z) en fonction de t (0 = y_debut, 1 = y_fin)."""
    anneaux = []
    for s in range(1, stations):
        t = s / stations
        y = y_debut + t * (y_fin - y_debut)
        rx, rz = interpoler_profil(profil, t)
        anneau = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            x = rx * math.cos(a)
            z = rz * math.sin(a)
            if z < 0:
                z *= aplatir_ventre          # le ventre est un peu plus plat que le dos
            anneau.append(bm.verts.new((x + decalage[0], y, z + decalage[1])))
        anneaux.append(anneau)

    pointe_avant = bm.verts.new((decalage[0], y_debut, decalage[1]))
    pointe_arriere = bm.verts.new((decalage[0], y_fin, decalage[1]))
    n = segments
    for k in range(n):
        bm.faces.new((pointe_avant, anneaux[0][(k + 1) % n], anneaux[0][k]))
    for i in range(len(anneaux) - 1):
        A, B = anneaux[i], anneaux[i + 1]
        for k in range(n):
            bm.faces.new((A[k], B[k], B[(k + 1) % n], A[(k + 1) % n]))
    for k in range(n):
        bm.faces.new((pointe_arriere, anneaux[-1][k], anneaux[-1][(k + 1) % n]))
    return [pointe_avant, pointe_arriere] + [v for anneau in anneaux for v in anneau]


def aile(bm, sections, segments=14):
    """Une aile par « loft » de sections elliptiques le long de X, de l'emplanture
    au bout : sections = [(x, y_avant, y_arriere, demi_epaisseur), …]. La dernière
    section n'est qu'un point (la pointe). Pour l'aile gauche, donner des x négatifs.
    Renvoie les sommets créés."""
    anneaux = []
    for x, y0, y1, e in sections[:-1]:
        cy, ry = (y0 + y1) / 2, abs(y1 - y0) / 2
        anneau = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            anneau.append(bm.verts.new((x, cy + ry * math.cos(a), e * math.sin(a))))
        anneaux.append(anneau)
    xt, y0, y1, _ = sections[-1]
    pointe = bm.verts.new((xt, (y0 + y1) / 2, 0.0))
    n = segments
    for A, B in zip(anneaux, anneaux[1:]):
        for k in range(n):
            bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]))
    for k in range(n):
        bm.faces.new((anneaux[-1][k], anneaux[-1][(k + 1) % n], pointe))
    bm.faces.new(list(reversed(anneaux[0])))        # l'emplanture, fermée (elle est dans le corps)
    return [pointe] + [v for anneau in anneaux for v in anneau]


def nageoire(bm, points, epaisseur, pli=1.0):
    """Une plaque fine : le polygone `points` (liste de (x, y, z) coplanaires)
    est dupliqué de part et d'autre de sa normale, puis refermé sur les côtés.
    La base du polygone doit être un peu À L'INTÉRIEUR du corps (pas de trou).
    Les arêtes du contour reçoivent un « pli » (crease) : sans ça, la subdivision
    de surface fond une plaque fine en boudin."""
    pts = [Vector(p) for p in points]
    # Normale de Newell : celle du sens de parcours du polygone entier (fiable même concave)
    normale = Vector((0.0, 0.0, 0.0))
    for a, b in zip(pts, pts[1:] + pts[:1]):
        normale += a.cross(b)
    normale.normalize()
    dessus = [bm.verts.new(p + normale * epaisseur / 2) for p in pts]
    dessous = [bm.verts.new(p - normale * epaisseur / 2) for p in pts]
    face_dessus = bm.faces.new(dessus)
    face_dessous = bm.faces.new(list(reversed(dessous)))
    faces = [face_dessus, face_dessous]
    m = len(pts)
    for i in range(m):
        j = (i + 1) % m
        faces.append(bm.faces.new((dessus[i], dessous[i], dessous[j], dessus[j])))
    _orienter(bm, faces)
    couche_pli = bm.edges.layers.float.get('crease_edge')   # créée par nouveau_bmesh()
    for face in (face_dessus, face_dessous):
        for e in face.edges:
            e[couche_pli] = pli
    return dessus + dessous


def ellipsoide(bm, centre, rayons, segments=24, anneaux=16, aplatir_dessous=1.0):
    """Une sphère étirée (rayons = (rx, ry, rz)), le dessous éventuellement aplati
    (carapace, cloche de méduse…). Renvoie ses sommets."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=anneaux, radius=1.0)
    for v in res['verts']:
        x, y, z = v.co.x * rayons[0], v.co.y * rayons[1], v.co.z * rayons[2]
        if z < 0:
            z *= aplatir_dessous
        v.co = (centre[0] + x, centre[1] + y, centre[2] + z)
    _orienter_autour(bm, res['verts'])
    return res['verts']


def sphere(bm, centre, rayon, segments=12, anneaux=8):
    """Une petite sphère (œil, ventouse…) centrée en `centre`."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=anneaux, radius=rayon)
    for v in res['verts']:
        v.co += Vector(centre)
    _orienter_autour(bm, res['verts'])
    return res['verts']


def terminer_maillage(bm, nom):
    """bmesh → objet Blender lissé, ajouté à la scène. L'ordre des sommets est
    conservé : les indices relevés pendant la construction restent valables."""
    bm.verts.index_update()
    couche = bm.faces.layers.int.get('oriente')
    deja = {f for f in bm.faces if couche is not None and f[couche] == 1}
    res = bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])   # n-gones concaves → triangles
    if couche is not None:                       # les triangles issus d'une face marquée héritent de la marque
        for f in res['faces']:
            if f[couche] == 1:
                deja.add(f)
    # recalc_face_normals se trompe sur les formes minces : on ne lui donne que les faces
    # dont l'orientation n'a pas été fixée à la construction (anciennes primitives)
    a_recalculer = [f for f in bm.faces if f not in deja]
    if a_recalculer:
        bmesh.ops.recalc_face_normals(bm, faces=a_recalculer)
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(nom, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------- couleur
def colorer_ventre_dos(obj, dos, ventre, z_bas=-0.06, z_haut=0.08, retouche=None):
    """Couleur par sommet selon la hauteur : `ventre` en dessous de z_bas,
    `dos` au-dessus de z_haut, fondu entre les deux. `retouche(co, couleur)`
    permet des exceptions locales (bout de nageoire sombre, etc.)."""
    me = obj.data
    attr = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    for i, v in enumerate(me.vertices):
        u = lisser((v.co.z - z_bas) / (z_haut - z_bas))
        c = [ventre[k] + (dos[k] - ventre[k]) * u for k in range(3)]
        if retouche:
            c = retouche(v.co, c)
        attr.data[i].color = (c[0], c[1], c[2], 1.0)
    for nom_prop in ('active_color', ):
        try:
            setattr(me.color_attributes, nom_prop, attr)
        except Exception:
            pass
    try:
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception:
        pass
    return attr


def materiau_peau(nom, rugosite=0.55, alpha=1.0):
    """Principled BSDF dont la couleur de base vient de l'attribut « Col ».
    Seul le Principled s'exporte en glTF (DESIGN.md §7.4).
    alpha < 1 : matière translucide (méduse), rendue des deux côtés."""
    mat = bpy.data.materials.new(nom)
    mat.use_nodes = True
    arbre = mat.node_tree
    bsdf = arbre.nodes.get('Principled BSDF')
    noeud_couleur = arbre.nodes.new('ShaderNodeVertexColor')
    noeud_couleur.layer_name = 'Col'
    arbre.links.new(noeud_couleur.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rugosite
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        for attribut, valeur in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
            try:
                setattr(mat, attribut, valeur)      # le nom a changé selon les versions de Blender
            except Exception:
                pass
        mat.use_backface_culling = False            # → glTF doubleSided : on voit l'intérieur
    return mat


# ---------------------------------------------------------------- squelette
def squelette_colonne(nom, os_defs):
    """os_defs = [(nom, y_debut, y_fin, nom_parent)] : des os posés sur l'axe Y."""
    arm_data = bpy.data.armatures.new(nom + '_data')
    arm = bpy.data.objects.new(nom, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    _activer(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for nom_os, y0, y1, parent in os_defs:
        eb = arm_data.edit_bones.new(nom_os)
        eb.head = (0.0, y0, 0.0)
        eb.tail = (0.0, y1, 0.0)
        if parent:
            eb.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def squelette(nom, os_defs, sans_heritage_echelle=()):
    """Comme squelette_colonne, mais chaque os a sa tête et sa queue en 3D :
    os_defs = [(nom, (hx, hy, hz), (tx, ty, tz), nom_parent)].
    sans_heritage_echelle : os qui ne doivent PAS suivre l'échelle de leur parent
    (les bras d'une méduse dont la cloche se contracte)."""
    arm_data = bpy.data.armatures.new(nom + '_data')
    arm = bpy.data.objects.new(nom, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    _activer(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for nom_os, tete, queue, parent in os_defs:
        eb = arm_data.edit_bones.new(nom_os)
        eb.head = tete
        eb.tail = queue
        if parent:
            eb.parent = arm_data.edit_bones[parent]
        if nom_os in sans_heritage_echelle:
            eb.inherit_scale = 'NONE'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def marquer(bm, sommets, nom_os, registre, fondu=None):
    """Étiquette des sommets avec l'os qui les portera. L'étiquette est une couche
    entière du bmesh : elle SUIT chaque sommet jusque dans le maillage final, quel
    que soit l'ordre dans lequel Blender les range. registre = liste partagée
    [(nom_os, fondu)] ; fondu = None ou ((x, y, z), rayon) : à moins de `rayon` du
    point de jonction, le poids glisse vers l'os parent (attache souple)."""
    couche = bm.verts.layers.int.get(COUCHE_PARTIE)          # créée par nouveau_bmesh()
    registre.append((nom_os, fondu))
    etiquette = len(registre)                  # 0 = pas d'étiquette
    for v in sommets:
        v[couche] = etiquette


def peser_par_parties(obj, arm, os_defs, registre, colonne=None, fondu_chaine=0.6):
    """Lit l'étiquette « partie » de chaque sommet et lui donne le poids de son os
    (avec fondu vers le parent près de la jonction). Voir marquer().
    colonne = [(nom_os, y_debut, y_fin), …] : les sommets SANS étiquette (le corps)
    sont pesés comme dans peser_colonne(), en tente le long de Y — pratique quand
    seules les nageoires ont leurs propres os."""
    me = obj.data
    attr = me.attributes.get(COUCHE_PARTIE)
    if attr is None:
        raise RuntimeError("aucune étiquette « partie » : appeler marquer() pendant la construction")
    groupes = {nom: obj.vertex_groups.new(name=nom) for nom, _, _, _ in os_defs}
    parents = {nom: parent for nom, _, _, parent in os_defs}
    for i, v in enumerate(me.vertices):
        etiquette = attr.data[i].value
        if etiquette == 0:
            if colonne:
                for nom, w in poids_chaine(v.co.y, colonne, fondu_chaine).items():
                    if w > 1e-4:
                        groupes[nom].add([i], w, 'REPLACE')
            continue
        nom_os, fondu = registre[etiquette - 1]
        w = 1.0
        if fondu:
            base, rayon = fondu
            w = max(0.0, min(1.0, (v.co - Vector(base)).length / rayon))
        groupes[nom_os].add([i], w, 'REPLACE')
        if w < 1.0 and parents[nom_os]:
            groupes[parents[nom_os]].add([i], 1.0 - w, 'REPLACE')
    me.attributes.remove(attr)                 # l'étiquette a fait son travail : pas dans le .glb
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    obj.parent = arm


def animer_os(arm, pistes, images=48, nom_action='swim', pas=2):
    """Animation générique : pistes = {nom_os: [(canal, axe, amplitude, phase, base[, forme]), …]}
    avec canal ∈ 'rotation_euler' | 'scale' | 'location', axe ∈ 0 (X) | 1 (Y) | 2 (Z).
    Chaque valeur = base + amplitude × forme(t + phase), forme = sin par défaut —
    ou toute fonction périodique 2π → [-1, 1] (une méduse se contracte vite et se
    relâche lentement : ce n'est pas un sinus). Boucle propre (image 1 = image images+1)."""
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = images
    _activer(arm)
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    for f in range(1, images + 2, pas):
        t = 2 * math.pi * (f - 1) / images
        for nom, canaux in pistes.items():
            pb = arm.pose.bones[nom]
            for piste in canaux:
                canal, axe, amplitude, phase, base = piste[:5]
                forme = piste[5] if len(piste) > 5 else math.sin
                valeur = base + amplitude * forme(t + phase)
                getattr(pb, canal)[axe] = valeur
                pb.keyframe_insert(canal, index=axe, frame=f)
    bpy.ops.object.mode_set(mode='OBJECT')
    action = arm.animation_data.action
    action.name = nom_action
    return action


def poids_chaine(y, colonne, fondu=0.6):
    """Les poids d'un sommet à la hauteur y le long d'une chaîne d'os posés sur Y :
    colonne = [(nom, y_debut, y_fin), …]. Le sommet appartient à l'os dont l'intervalle
    le contient ; près d'une charnière il glisse en douceur (smoothstep) vers le voisin,
    sur une largeur = fondu × la moitié du plus court des deux os. Au-delà des bouts :
    l'os extrême. Deux os au plus par sommet : la peau plie net, sans effet caoutchouc."""
    segments = sorted(((min(y0, y1), max(y0, y1), nom) for nom, y0, y1 in colonne), key=lambda s: s[0])
    if y <= segments[0][0]:
        return {segments[0][2]: 1.0}
    if y >= segments[-1][1]:
        return {segments[-1][2]: 1.0}
    for i, (a, b, nom) in enumerate(segments):
        if a <= y <= b:
            poids = {nom: 1.0}
            if i > 0:                                                    # charnière avec le précédent
                pa, pb, pnom = segments[i - 1]
                largeur = fondu * 0.5 * min(b - a, pb - pa)
                d = y - a
                if d < largeur:
                    u = d / largeur
                    w = 0.5 * (1 - u * u * (3 - 2 * u))                   # 0,5 sur la charnière → 0 à `largeur`
                    poids[pnom] = w
                    poids[nom] = 1 - w
            if i < len(segments) - 1:
                na, nb, nnom = segments[i + 1]
                largeur = fondu * 0.5 * min(b - a, nb - na)
                d = b - y
                if d < largeur:
                    u = d / largeur
                    w = 0.5 * (1 - u * u * (3 - 2 * u))
                    poids[nnom] = poids.get(nnom, 0.0) + w
                    poids[nom] = poids[nom] - w
            return poids
    return {segments[-1][2]: 1.0}


def peser_colonne(obj, arm, os_defs, fondu=0.6):
    """Poids de peau « à la main » pour une colonne d'os posés sur Y : voir poids_chaine().
    Déterministe et sans opérateur, contrairement à Automatic Weights."""
    me = obj.data
    groupes = {nom: obj.vertex_groups.new(name=nom) for nom, _, _, _ in os_defs}
    colonne = [(nom, y0, y1) for nom, y0, y1, _ in os_defs]
    for v in me.vertices:
        for nom, w in poids_chaine(v.co.y, colonne, fondu).items():
            if w > 1e-4:
                groupes[nom].add([v.index], w, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    obj.parent = arm


def animer_nage(arm, mouvements, images=48, nom_action='swim', pas=2):
    """mouvements = {nom_os: (amplitude_rad, phase_rad)}. Chaque os tourne autour de
    son Z local (lacet = gauche/droite) selon un sinus ; les phases décalées font
    courir l'onde vers la queue. Image 1 = image `images`+1 : la boucle est propre."""
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = images
    _activer(arm)
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    for f in range(1, images + 2, pas):
        t = 2 * math.pi * (f - 1) / images
        for nom, (amplitude, phase) in mouvements.items():
            pb = arm.pose.bones[nom]
            pb.rotation_euler = (0.0, 0.0, amplitude * math.sin(t + phase))
            pb.keyframe_insert('rotation_euler', index=2, frame=f)
    bpy.ops.object.mode_set(mode='OBJECT')
    action = arm.animation_data.action
    action.name = nom_action
    try:
        for fc in action.fcurves:
            fc.modifiers.new('CYCLES')       # boucle infinie dans Blender (l'export s'en fiche)
    except Exception:
        pass
    return action


# ---------------------------------------------------------------- export
def exporter_glb(nom_fichier):
    """Export glTF binaire selon DESIGN.md §7.6. Les noms d'options varient selon
    les versions de Blender : on essaie du plus précis au plus simple."""
    os.makedirs(DOSSIER_MODELES, exist_ok=True)
    chemin = os.path.join(DOSSIER_MODELES, nom_fichier)
    base = dict(filepath=chemin, export_format='GLB', export_apply=True, export_yup=True,
                export_animations=True, export_skins=True, export_normals=True,
                export_texcoords=True, export_materials='EXPORT', export_frame_range=False,   # chaque action garde SA durée
                export_force_sampling=True, export_tangents=True, export_image_format='AUTO',
                export_jpeg_quality=90)
    variantes = [
        dict(base, export_animation_mode='ACTIONS', export_vertex_color='ACTIVE'),
        dict(base, export_animation_mode='ACTIONS'),
        base,
    ]
    erreur = None
    for kw in variantes:
        try:
            bpy.ops.export_scene.gltf(**kw)
            return chemin
        except TypeError as e:              # option inconnue dans cette version
            erreur = e
    raise erreur


def inspecter_glb(chemin):
    """Relit le .glb (en-tête + chunk JSON) et résume son contenu. Le contrôle
    qualité de DESIGN.md §7.7, sans ouvrir de navigateur."""
    with open(chemin, 'rb') as f:
        data = f.read()
    magic, _version, _longueur = struct.unpack('<4sII', data[:12])
    assert magic == b'glTF', 'pas un fichier GLB'
    taille_json, _type = struct.unpack('<II', data[12:20])
    j = json.loads(data[20:20 + taille_json])
    print(f"\n=== {os.path.basename(chemin)} : {len(data) / 1024:.0f} Ko")
    for m in j.get('meshes', []):
        for p in m['primitives']:
            tris = j['accessors'][p['indices']]['count'] // 3 if 'indices' in p else '?'
            pos = j['accessors'][p['attributes']['POSITION']]
            mn, mx = pos.get('min'), pos.get('max')
            print(f"  mesh « {m.get('name')} » : {tris} triangles, attributs {sorted(p['attributes'])}")
            if mn and mx:
                print(f"    étendue (m) : X {mn[0]:.2f}→{mx[0]:.2f}  Y {mn[1]:.2f}→{mx[1]:.2f}  Z {mn[2]:.2f}→{mx[2]:.2f}")
    for img in j.get('images', []):
        bv = j['bufferViews'][img['bufferView']] if 'bufferView' in img else None
        print(f"  image « {img.get('name')} » : {img.get('mimeType')}, {bv['byteLength'] // 1024 if bv else '?'} Ko")
    for m in j.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        print(f"  matériau « {m.get('name')} » : couleur {'texture' if 'baseColorTexture' in pbr else 'unie'}, "
              f"normales {'oui' if 'normalTexture' in m else 'non'}, rugosité {'texture' if 'metallicRoughnessTexture' in pbr else pbr.get('roughnessFactor')}, "
              f"alpha {m.get('alphaMode', 'OPAQUE')}{', émission' if 'emissiveTexture' in m else ''}")
    print("  nœuds :", [n.get('name') for n in j.get('nodes', [])])
    print("  skins :", [len(s['joints']) for s in j.get('skins', [])], "os")
    for a in j.get('animations', []):
        duree = max(j['accessors'][s['input']]['max'][0] for s in a['samplers'])
        print(f"  animation « {a.get('name')} » : {duree:.2f} s, {len(a['channels'])} canaux")
    if not j.get('animations'):
        print("  ⚠ AUCUNE animation exportée")
    return j
