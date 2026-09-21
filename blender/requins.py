"""
requins.py — ce que les trois requins partagent : leur peau
============================================================
Requin gris, requin-marteau, requin-baleine : trois corps différents, une même
grammaire de peau — contre-ombre (dos sombre, ventre clair, limite sur le flanc),
cinq fentes branchiales, bouche ventrale, yeux, pointes de nageoires sombres,
bordure de caudale. peau_requin(cfg) renvoie les trois fonctions attendues par
peau.texturer() (couleur, hauteur, rugosite), réglées par un dictionnaire :

  dos, ventre, bronze, sombre, noir     couleurs sRGB (tuples 0…1)
  seuil_flanc                           distance angulaire au ventre où le gris commence (0,5 = le dos)
  tete_grise                            de combien la limite descend sur la tête (0 = pas du tout)
  ouies = dict(y0, pas, x_min, z_centre, demi_hauteur, inclinaison)   les cinq fentes
  bouche = dict(y_apex, courbure, x_max)                              y = y_apex + courbure·x²
  narines = [(x, y), …], narine_rx, narine_ry
  yeux = [(x, y, z), …], oeil = dict(pupille, iris, sclere)          couleurs ; angles en radians
  pointes_sombres, liseret_dorsal, caudale_noire                     forces 0…1
  motif(t, base) → (N,3)                                              optionnel : robe (points du requin-baleine)
  relief_extra(t) → (N,)                                              optionnel : crêtes, etc.
  echelle                                                             taille de l'animal / 1,8 m (grain de la peau)
"""
import numpy as np
from peau import lisser, melanger, fbm, trait, angle_vers


def peau_requin(cfg):
    k = cfg.get('echelle', 1.0)
    DOS, VENTRE = cfg['dos'], cfg['ventre']
    BRONZE = cfg.get('bronze', DOS)
    SOMBRE, NOIR = cfg.get('sombre', (0.16, 0.17, 0.18)), cfg.get('noir', (0.05, 0.05, 0.06))
    o = cfg['ouies']
    b = cfg.get('bouche')
    oe = cfg.get('oeil', dict(pupille=(0.02, 0.02, 0.02), iris=(0.12, 0.20, 0.17), sclere=(0.20, 0.22, 0.22)))

    def ouies(t):
        """Cinq fentes sur les flancs, presque verticales, le haut légèrement en avant.
        Renvoie (fente, ombre) ∈ [0, 1] : le trait lui-même et l'ombre du volet derrière."""
        fente = np.zeros(t.N, np.float32)
        ombre = np.zeros(t.N, np.float32)
        flanc = (t.zone('corps') + t.zone('tete')) * lisser(o['x_min'] * 0.6, o['x_min'], np.abs(t.x)) \
            * (1 - lisser(o['demi_hauteur'] * 0.85, o['demi_hauteur'] * 1.1, np.abs(t.z - o['z_centre'])))
        for i in range(5):
            yk = o['y0'] + o['pas'] * i - o['inclinaison'] * (t.z - o['z_centre']) / o['demi_hauteur']
            fente = np.maximum(fente, trait(t.y, yk, 0.006 * k))
            ombre = np.maximum(ombre, (1 - lisser(0.004 * k, 0.016 * k, t.y - yk)) * (t.y > yk - 0.002 * k))
        return fente * flanc, ombre * flanc

    def bouche(t):
        if b is None:                                   # pas de bouche ventrale (le requin-baleine a la sienne, terminale)
            return np.zeros(t.N, np.float32)
        ym = b['y_apex'] + b['courbure'] * t.x ** 2
        dessous = lisser(-0.2, -0.6, t.n[:, 2])
        return trait(t.y, ym, 0.007 * k) * (np.abs(t.x) < b['x_max']) * dessous * (t.zone('corps') + t.zone('tete'))

    def narines(t):
        n = np.zeros(t.N, np.float32)
        rx, ry = cfg.get('narine_rx', 0.012 * k), cfg.get('narine_ry', 0.005 * k)
        for x, y in cfg.get('narines', []):
            d = np.sqrt(((t.x - x) / rx) ** 2 + ((t.y - y) / ry) ** 2)
            n = np.maximum(n, (1 - lisser(0.6, 1.0, d)) * (t.n[:, 2] < 0.2))
        return n * (t.zone('corps') + t.zone('tete'))

    def couleur(t):
        corps_ = t.zone('corps')
        nag = t.zone('nageoires')
        caud = t.zone('caudale')
        d = np.abs(t.v - 0.75)                       # distance angulaire au ventre : 0 = ventre, 0,5 = dos
        seuil = cfg.get('seuil_flanc', 0.215) - cfg.get('tete_grise', 0.06) * lisser(0.30, 0.10, t.u) \
            + 0.015 * fbm(t.p * 7 / k, 3, graine=2)
        haut = lisser(seuil - 0.035, seuil + 0.035, d)
        base = melanger(VENTRE, DOS, haut)
        flanc = (1 - lisser(0.30, 0.42, d)) * lisser(0.18, 0.28, d)
        base = melanger(base, BRONZE, 0.5 * flanc * haut)
        base *= (1 + 0.07 * fbm(t.p * 14 / k, 3, graine=1) + 0.03 * fbm(t.p * 60 / k, 2, graine=9))[:, None]
        base = melanger(base, SOMBRE, 0.25 * lisser(0.2, 0.7, fbm(t.p * 4 / k, 2, graine=3)) * haut)
        if 'motif' in cfg:
            base = cfg['motif'](t, base, haut)

        dessus_nag = lisser(-0.3, 0.3, t.n[:, 2])
        dorsales = nag * (t.z > 0.02 * k)
        paires = nag * (t.z <= 0.02 * k)
        c_nag = melanger(VENTRE, DOS, np.maximum(dessus_nag, dorsales))
        c_nag *= (1 + 0.05 * fbm(t.p * 20 / k, 2, graine=4))[:, None]
        if 'motif' in cfg:
            c_nag = cfg['motif'](t, c_nag, np.maximum(dessus_nag, dorsales))
        pointes = cfg.get('pointes_sombres', 1.0)
        c_nag = melanger(c_nag, SOMBRE, pointes * paires * lisser(0.70, 0.95, t.u))
        c_nag = melanger(c_nag, SOMBRE, pointes * nag * (t.z < 0) * (t.y > 0.25 * k) * lisser(0.55, 0.9, t.u))
        c_nag = melanger(c_nag, (0.86, 0.87, 0.85), dorsales * lisser(0.90, 0.99, t.v) * cfg.get('liseret_dorsal', 0.6))
        c_caud = melanger(DOS, VENTRE, 0.35 * (t.z < 0.0))
        c_caud *= (1 + 0.05 * fbm(t.p * 20 / k, 2, graine=5))[:, None]
        if 'motif' in cfg:
            c_caud = cfg['motif'](t, c_caud, np.ones(t.N, np.float32))
        noir = np.maximum(lisser(0.60, 0.74, t.v), lisser(0.88, 0.97, t.u)) * cfg.get('caudale_noire', 1.0)
        c_caud = melanger(c_caud, NOIR, noir)

        # Tête à part (le marteau) : pas d'angle « autour du corps » sur ses lobes → contre-ombre par la normale
        tete = t.zone('tete')
        c_tete = melanger(VENTRE, DOS, lisser(-0.25, 0.25, t.n[:, 2]))
        c_tete *= (1 + 0.07 * fbm(t.p * 14 / k, 3, graine=1))[:, None]
        c = base * corps_[:, None] + c_nag * nag[:, None] + c_caud * caud[:, None] + c_tete * tete[:, None]
        fente, ombre = ouies(t)
        c = melanger(c, SOMBRE, 0.55 * ombre)
        c = melanger(c, NOIR, fente)
        c = melanger(c, NOIR, 0.9 * bouche(t))
        c = melanger(c, NOIR, narines(t))
        yeux = t.zone('yeux')
        if yeux.any():
            a = angle_vers(t, cfg['yeux'], lambda c_: (np.sign(c_[0]), 0.0, 0.0))
            c_oeil = melanger(oe['sclere'], oe['iris'], 1 - lisser(0.55, 0.75, a))
            c_oeil = melanger(c_oeil, oe['pupille'], 1 - lisser(0.30, 0.40, a))
            c = melanger(c, c_oeil, yeux)
        return c

    def hauteur(t):
        fente, ombre = ouies(t)
        h = -0.005 * k * fente - 0.002 * k * ombre
        h -= 0.003 * k * bouche(t)
        h -= 0.002 * k * narines(t)
        h += 0.0004 * k * fbm(t.p * 80 / k, 2, graine=7) * t.zone('corps')      # grain (denticules)
        if 'relief_extra' in cfg:
            h += cfg['relief_extra'](t)
        return h

    def rugosite(t):
        r = 0.52 - 0.10 * (1 - lisser(0.15, 0.30, np.abs(t.v - 0.75)))
        r = r + 0.05 * (t.zone('nageoires') + t.zone('caudale'))
        r = np.where(t.zone('yeux') > 0.5, 0.12, r)
        return r

    return couleur, hauteur, rugosite
