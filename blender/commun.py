"""
commun.py — boîte à outils partagée par tous les générateurs d'animaux
=======================================================================
Chaque animal a son script `generer_<id>.py` qui décrit SA forme (profil du
corps, nageoires, os, nage). Tout ce qui est générique vit ici :

  nettoyer_scene()        vide la scène par défaut de Blender
  corps_fusiforme()       un corps « poisson » par anneaux le long de l'axe Y
  nageoire()              une plaque fine à partir d'un polygone
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
def nouveau_bmesh():
    """Crée le bmesh ET ses couches de données (étiquette « partie », plis d'arêtes)
    AVANT toute géométrie. Ajouter une couche après coup réorganise les données
    internes : toutes les références Python aux sommets deviennent invalides
    (« BMesh data … has been removed ») et l'ordre des sommets n'est plus fiable."""
    bm = bmesh.new()
    bm.verts.layers.int.new(COUCHE_PARTIE)
    bm.edges.layers.float.new('crease_edge')
    return bm


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


def nageoire(bm, points, epaisseur, pli=1.0):
    """Une plaque fine : le polygone `points` (liste de (x, y, z) coplanaires)
    est dupliqué de part et d'autre de sa normale, puis refermé sur les côtés.
    La base du polygone doit être un peu À L'INTÉRIEUR du corps (pas de trou).
    Les arêtes du contour reçoivent un « pli » (crease) : sans ça, la subdivision
    de surface fond une plaque fine en boudin."""
    pts = [Vector(p) for p in points]
    normale = (pts[1] - pts[0]).cross(pts[2] - pts[0]).normalized()
    dessus = [bm.verts.new(p + normale * epaisseur / 2) for p in pts]
    dessous = [bm.verts.new(p - normale * epaisseur / 2) for p in pts]
    face_dessus = bm.faces.new(dessus)
    face_dessous = bm.faces.new(list(reversed(dessous)))
    m = len(pts)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((dessus[i], dessus[j], dessous[j], dessous[i]))
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
    return res['verts']


def sphere(bm, centre, rayon, segments=12, anneaux=8):
    """Une petite sphère (œil, ventouse…) centrée en `centre`."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=anneaux, radius=rayon)
    for v in res['verts']:
        v.co += Vector(centre)
    return res['verts']


def terminer_maillage(bm, nom):
    """bmesh → objet Blender lissé, ajouté à la scène. L'ordre des sommets est
    conservé : les indices relevés pendant la construction restent valables."""
    bm.verts.index_update()
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])   # n-gones concaves → triangles
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
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


def peser_par_parties(obj, arm, os_defs, registre):
    """Lit l'étiquette « partie » de chaque sommet et lui donne le poids de son os
    (avec fondu vers le parent près de la jonction). Voir marquer()."""
    me = obj.data
    attr = me.attributes.get(COUCHE_PARTIE)
    if attr is None:
        raise RuntimeError("aucune étiquette « partie » : appeler marquer() pendant la construction")
    groupes = {nom: obj.vertex_groups.new(name=nom) for nom, _, _, _ in os_defs}
    parents = {nom: parent for nom, _, _, parent in os_defs}
    for i, v in enumerate(me.vertices):
        etiquette = attr.data[i].value
        if etiquette == 0:
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
    """Animation générique : pistes = {nom_os: [(canal, axe, amplitude, phase, base), …]}
    avec canal ∈ 'rotation_euler' | 'scale' | 'location', axe ∈ 0 (X) | 1 (Y) | 2 (Z).
    Chaque valeur = base + amplitude × sin(t + phase). Boucle propre (image 1 = image images+1)."""
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
            for canal, axe, amplitude, phase, base in canaux:
                valeur = base + amplitude * math.sin(t + phase)
                getattr(pb, canal)[axe] = valeur
                pb.keyframe_insert(canal, index=axe, frame=f)
    bpy.ops.object.mode_set(mode='OBJECT')
    action = arm.animation_data.action
    action.name = nom_action
    return action


def peser_colonne(obj, arm, os_defs, recouvrement=1.5):
    """Poids de peau « à la main » : chaque os influence les sommets proches de son
    centre (fonction en tente), les influences voisines se recouvrent, puis on
    normalise. Déterministe et sans opérateur, contrairement à Automatic Weights."""
    me = obj.data
    groupes = {nom: obj.vertex_groups.new(name=nom) for nom, _, _, _ in os_defs}
    infos = [(nom, (y0 + y1) / 2, abs(y1 - y0) / 2) for nom, y0, y1, _ in os_defs]
    for v in me.vertices:
        y = v.co.y
        poids = {}
        for nom, yc, demi in infos:
            w = max(0.0, 1.0 - abs(y - yc) / (demi * recouvrement))
            if w > 0:
                poids[nom] = w
        if not poids:                                   # au-delà des extrémités
            nom = min(infos, key=lambda o: abs(y - o[1]))[0]
            poids = {nom: 1.0}
        total = sum(poids.values())
        for nom, w in poids.items():
            groupes[nom].add([v.index], w / total, 'REPLACE')
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
                export_texcoords=True, export_materials='EXPORT', export_frame_range=True,
                export_force_sampling=True)
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
    print("  nœuds :", [n.get('name') for n in j.get('nodes', [])])
    print("  skins :", [len(s['joints']) for s in j.get('skins', [])], "os")
    for a in j.get('animations', []):
        duree = max(j['accessors'][s['input']]['max'][0] for s in a['samplers'])
        print(f"  animation « {a.get('name')} » : {duree:.2f} s, {len(a['channels'])} canaux")
    if not j.get('animations'):
        print("  ⚠ AUCUNE animation exportée")
    return j
