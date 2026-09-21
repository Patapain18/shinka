"""
mouvement.py — le mouvement des animaux, écrit comme de la biomécanique
========================================================================
Jusqu'ici chaque os recevait « amplitude × sin(t + phase) », réglé à la main.
Ici on décrit le mouvement comme les biologistes le mesurent, et le module en
déduit les os :

  Mouvement(arm, periode, cycles)      un clip qui dure `cycles` battements
  .onde(chaine, ...)                   la LIGNE MÉDIANE ondule :
        h(s, t) = L · A(s) · sin(2π (s/λ − t/T) − δ(s))
        s = position le long du corps (0 museau → 1 bout de la queue), L = longueur,
        A(s) = enveloppe d'amplitude (fraction de L) : A_tete + (A_queue − A_tete)·s^p,
        λ = longueur d'onde (en longueurs de corps), T = période, δ(s) = retard de la
        nageoire caudale (elle est souple : elle suit la queue avec un temps de retard).
        Chaque os de la chaîne reçoit la rotation RELATIVE qui fait suivre la médiane à
        la chaîne (lacet Z pour un poisson, tangage X pour un mammifère), et l'os racine
        se déplace latéralement pour que sa charnière reste sur la médiane.
  .secondaire(os, canal, axe, ...)     un mouvement ajouté (nageoire, tête, roulis) :
        base + amplitude × forme(2π · cycles_par_clip · t / duree + phase) — cycles_par_clip
        entier, donc la boucle reste propre ; forme = sinus, ou asymetrique(k), ou impulsion(p)
  .modulation(...)                     l'amplitude de l'onde varie lentement sur le clip
        (deux battements ne sont jamais identiques), toujours périodique sur le clip
  .cuire(nom)                          écrit les images clés et range l'action dans le NLA
  glisse(mouvement_de_nage, ...)       le même mouvement au ralenti, à faible amplitude,
        exporté comme action « glide » : le site fait des fondus entre nage et glisse.

Toutes les valeurs sont échantillonnées image par image (24 im/s) : n'importe
quelle fonction du temps convient, pourvu qu'elle soit périodique sur le clip.
"""
import math
import bpy
import numpy as np


# ---------------------------------------------------------------- formes d'onde
def sinus(t):
    return math.sin(t)


def asymetrique(k=0.4):
    """Un sinus « penché » : une demi-période plus rapide que l'autre (coup de nageoire
    puissant, retour lent). k ∈ [0, 0.6] : 0 = sinus."""
    return lambda t: math.sin(t + k * math.sin(t))


def impulsion(p=3.0):
    """Un pic bref puis un long plateau, dans [-1, 1] : 2·((1 + cos t)/2)^p − 1.
    Une méduse qui se contracte, une queue qui donne un coup."""
    return lambda t: 2 * ((1 + math.cos(t)) / 2) ** p - 1


def cosinus(t):
    return math.cos(t)


# ---------------------------------------------------------------- le clip
class Mouvement:
    def __init__(self, arm, periode, cycles=4, fps=24):
        """periode = durée d'un battement (s) ; cycles = battements par clip (entier)."""
        self.arm = arm
        self.cycles = cycles
        self.fps = fps
        # Le clip doit durer un nombre ENTIER d'images, sinon la dernière image ne retombe
        # pas sur la première : on arrondit, et la période s'ajuste de quelques millièmes.
        self.images = max(2, int(round(periode * cycles * fps)))
        self.duree = self.images / fps
        self.periode = self.duree / cycles
        self.temps = np.arange(self.images + 1) / fps            # image 1 … images+1 → t = 0 … duree
        self.pistes = {}                                           # (os, canal, axe) → tableau de valeurs
        self._modulation = np.ones(self.images + 1)

    # -------- outils
    def _ajouter(self, os, canal, axe, valeurs):
        """Empile une piste : les rotations/translations s'additionnent, les échelles
        s'additionnent autour de 1."""
        cle = (os, canal, axe)
        v = np.asarray(valeurs, dtype=float)
        if canal == 'scale':
            self.pistes[cle] = self.pistes.get(cle, np.ones(self.images + 1)) + (v - 1.0)
        else:
            self.pistes[cle] = self.pistes.get(cle, np.zeros(self.images + 1)) + v

    def modulation(self, profondeur=0.12, harmoniques=((1, 0.0), (2, 1.3)), graine=0):
        """Facteur lent appliqué à l'amplitude de l'onde : 1 + profondeur × Σ sin(2π k t/duree + φ)/k.
        Périodique sur le clip par construction. À appeler AVANT onde()."""
        m = np.zeros(self.images + 1)
        for k, phi in harmoniques:
            m += np.sin(2 * math.pi * k * self.temps / self.duree + phi + graine) / k
        self._modulation = 1.0 + profondeur * m / max(1e-6, np.max(np.abs(m)))
        return self

    # -------- l'onde de nage
    def onde(self, chaine, longueur, s_museau, A_tete, A_queue, exposant=2.0, longueur_onde=1.0,
             mode='lacet', retard_caudal=0.0, s_caudal=0.85, recul_racine=1.0):
        """chaine = [(nom_os, y_tete, y_queue), …] : les os de la colonne, y_tete = charnière
        côté parent (l'os « tete » va vers -Y : y_tete > y_queue). longueur = du museau au
        bout de la queue (m), s_museau = y du museau. A en fractions de longueur.
        mode 'lacet' : ondulation gauche-droite (rotation Z, déplacement X) ;
        mode 'tangage' : haut-bas (rotation X, déplacement Z) — cétacés."""
        L = longueur
        T = self.periode
        lam = longueur_onde

        def s_de(y):
            return (y - s_museau) / L

        def h(s, t):
            A = A_tete + (A_queue - A_tete) * np.clip(s, 0, 1) ** exposant
            delta = retard_caudal * np.clip((s - s_caudal) / max(1e-6, 1 - s_caudal), 0, 1)
            return L * A * np.sin(2 * math.pi * (s / lam - t / T) - delta)

        # sens des rotations : la charnière d'un os qui pointe vers -Y a son X local retourné
        axe = 2 if mode == 'lacet' else 0
        parents = {nom: None for nom, _, _ in chaine}
        for os in self.arm.data.bones:
            if os.name in parents and os.parent is not None:
                parents[os.name] = os.parent.name
        infos = {nom: (y0, y1) for nom, y0, y1 in chaine}

        def angle_monde(nom, t):
            """Angle (autour de l'axe choisi) de l'os par rapport à sa direction de repos."""
            y0, y1 = infos[nom]
            d_lat = h(s_de(y1), t) - h(s_de(y0), t)
            d_long = y1 - y0
            if mode == 'lacet':
                # rotation ψ autour de +Z : +Y → (−sin ψ, cos ψ) ; −Y → (sin ψ, −cos ψ)
                return np.arctan2(-d_lat, d_long) if d_long > 0 else np.arctan2(d_lat, -d_long)
            # rotation φ autour de +X : +Y → (0, cos φ, sin φ) ; −Y → (0, −cos φ, −sin φ)
            return np.arctan2(d_lat, d_long) if d_long > 0 else np.arctan2(-d_lat, -d_long)

        t = self.temps
        angles = {nom: angle_monde(nom, t) for nom, _, _ in chaine}
        for nom, y0, y1 in chaine:
            parent = parents[nom]
            local = angles[nom] - (angles[parent] if parent in angles else 0.0)
            if mode == 'tangage' and y1 < y0:
                local = -local                                        # X local retourné pour l'os qui va vers -Y
            self._ajouter(nom, 'rotation_euler', axe, local * self._modulation)
        # la racine (le premier os de la liste) glisse latéralement : sa charnière suit la médiane
        racine, y0, _ = chaine[0]
        self._ajouter(racine, 'location', 0 if mode == 'lacet' else 2, recul_racine * h(s_de(y0), t) * self._modulation)
        return self

    # -------- mouvements ajoutés
    def secondaire(self, os, canal, axe, amplitude, cycles_par_clip=None, phase=0.0, base=0.0, forme=sinus, enveloppe=None):
        """Un mouvement périodique ajouté à un os : base + amplitude × forme(2π n t/duree + phase),
        n = cycles_par_clip (entier ; défaut = les battements du clip). enveloppe(t) optionnelle
        (tableau ou fonction), périodique elle aussi."""
        n = self.cycles if cycles_par_clip is None else cycles_par_clip
        assert abs(n - round(n)) < 1e-9, "cycles_par_clip doit être entier : sinon la boucle saute"
        arg = 2 * math.pi * n * self.temps / self.duree + phase
        v = np.array([forme(a) for a in arg]) * amplitude
        if enveloppe is not None:
            v = v * (enveloppe(self.temps) if callable(enveloppe) else np.asarray(enveloppe))
        self._ajouter(os, canal, axe, v + base)
        return self

    def rafale(self, centre, largeur):
        """Une enveloppe « bouffée » : 1 autour de centre (fraction du clip), 0 ailleurs, bords doux."""
        c = (self.temps / self.duree - centre + 0.5) % 1.0 - 0.5
        return np.clip(1 - np.abs(c) / largeur, 0, 1) ** 2 * (3 - 2 * np.clip(1 - np.abs(c) / largeur, 0, 1))

    # -------- écriture
    def cuire(self, nom='swim', pas=1):
        """Écrit les images clés (toutes les `pas` images) dans une action nommée, la range
        dans une piste NLA (l'exporteur glTF exporte chaque piste), et vérifie la boucle."""
        arm = self.arm
        scene = bpy.context.scene
        scene.frame_start = 1
        scene.frame_end = self.images
        bpy.context.view_layer.update()
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        if arm.animation_data:
            arm.animation_data.action = None
        bpy.ops.object.mode_set(mode='POSE')
        for pb in arm.pose.bones:
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = (0.0, 0.0, 0.0)
            pb.location = (0.0, 0.0, 0.0)
            pb.scale = (1.0, 1.0, 1.0)
        for (os, canal, axe), valeurs in self.pistes.items():
            ecart = abs(valeurs[0] - valeurs[-1])
            if ecart > 1e-4:
                raise ValueError(f"{nom} : {os}.{canal}[{axe}] ne boucle pas (écart {ecart:.4f})")
        for f in range(1, self.images + 2, pas):
            i = f - 1
            for (os, canal, axe), valeurs in self.pistes.items():
                pb = arm.pose.bones[os]
                getattr(pb, canal)[axe] = float(valeurs[i])
                pb.keyframe_insert(canal, index=axe, frame=f)
        bpy.ops.object.mode_set(mode='OBJECT')
        action = arm.animation_data.action
        action.name = nom
        piste = arm.animation_data.nla_tracks.new()
        piste.name = nom
        strip = piste.strips.new(nom, 1, action)
        try:
            strip.action_slot = action.slots[0]
        except Exception:
            pass
        arm.animation_data.action = None
        print(f"  action « {nom} » : {self.duree:.2f} s, {self.cycles} cycles, {len(self.pistes)} pistes")
        return action


def glisse(arm, recette, periode, facteur_amplitude=0.22, facteur_periode=1.7, cycles=2):
    """L'action « glide » : applique recette(mouvement) — la même recette que la nage —
    à un Mouvement plus lent (periode × facteur_periode), puis réduit toutes les
    amplitudes (les échelles autour de 1, les autres autour de 0). Le site fait des
    fondus entre « swim » et « glide » : un requin qui plane entre deux coups de queue."""
    m = Mouvement(arm, periode * facteur_periode, cycles)
    recette(m)
    for cle, v in m.pistes.items():
        if cle[1] == 'scale':
            m.pistes[cle] = 1.0 + (v - 1.0) * facteur_amplitude
        else:
            m.pistes[cle] = v * facteur_amplitude
    return m.cuire('glide')
