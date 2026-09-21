#!/usr/bin/env python3
"""
SPECTROGRAMME — voir un son
Trace le spectrogramme d'un .wav 16 bits (mono ou stéréo, mixé en mono) : le temps de gauche
à droite, les fréquences de bas en haut sur une échelle LOGARITHMIQUE (comme l'oreille :
une octave = la même hauteur, de 30 Hz à 16 kHz), l'énergie en couleur (noir → violet →
orange → jaune, sur 70 dB). Les repères (fichier .json à côté du .wav : [{t, nom}]) sont
tracés en traits verticaux. Usage : python3 outils/spectrogramme.py entree.wav sortie.png
"""
import json, os, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

entree, sortie = sys.argv[1], sys.argv[2]
with wave.open(entree, 'rb') as w:
    sr, canaux, n = w.getframerate(), w.getnchannels(), w.getnframes()
    x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
x = x.reshape(-1, canaux).mean(axis=1)
duree = len(x) / sr

# La transformée de Fourier à court terme : des fenêtres de 2048 échantillons (43 ms) tous les 512
N, saut = 2048, 512
fenetre = np.hanning(N)
nb = max(1, (len(x) - N) // saut)
S = np.empty((N // 2 + 1, nb), np.float32)
for i in range(nb):
    S[:, i] = np.abs(np.fft.rfft(x[i * saut:i * saut + N] * fenetre))
db = 20 * np.log10(S / (N / 4) + 1e-9)          # normalisé : un sinus pleine échelle ≈ 0 dB

# Axe des fréquences en log : H lignes, de fmin à fmax
H, W = 400, min(1500, nb)
freqs = np.fft.rfftfreq(N, 1 / sr)
fmin, fmax = 30, 16000
cibles = np.exp(np.linspace(np.log(fmin), np.log(fmax), H))
idx = np.clip(np.searchsorted(freqs, cibles), 0, len(freqs) - 1)
img = db[idx, :][::-1]                            # les aigus en haut
cols = np.linspace(0, nb - 1, W).astype(int)
img = img[:, cols]

# Couleurs : 70 dB de plage, palette façon « magma »
lo, hi = -85, -15
v = np.clip((img - lo) / (hi - lo), 0, 1)
arrets = [(0.0, (0, 0, 4)), (0.25, (60, 15, 110)), (0.5, (183, 55, 121)), (0.75, (251, 136, 61)), (1.0, (252, 253, 191))]
xs = [a for a, _ in arrets]
rgb = np.stack([np.interp(v, xs, [c[k] for _, c in arrets]) for k in range(3)], axis=-1).astype(np.uint8)

# La planche : marges pour les axes et les repères
G, B, Hh = 54, 26, 22                             # marge gauche, bas, haut
planche = Image.new('RGB', (W + G + 8, H + B + Hh), (6, 17, 26))
planche.paste(Image.fromarray(rgb), (G, Hh))
d = ImageDraw.Draw(planche)
try:
    police = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 11)
except OSError:
    police = ImageFont.load_default()
gris = (150, 175, 190)
for f, nom in [(50, '50'), (100, '100'), (200, '200'), (500, '500'), (1000, '1k'), (2000, '2k'), (5000, '5k'), (10000, '10k')]:
    y = Hh + H - 1 - int(round((np.log(f) - np.log(fmin)) / (np.log(fmax) - np.log(fmin)) * (H - 1)))
    d.line([(G - 4, y), (G, y)], fill=gris)
    d.text((4, y - 6), nom + ' Hz' if f < 1000 else nom, fill=gris, font=police)
pas_t = 5 if duree <= 60 else 10
for t in range(0, int(duree) + 1, pas_t):
    xx = G + int(t / duree * (W - 1))
    d.line([(xx, Hh + H), (xx, Hh + H + 4)], fill=gris)
    d.text((xx - 6, Hh + H + 7), f'{t}s', fill=gris, font=police)
chemin_reperes = os.path.splitext(entree)[0] + '.json'
if os.path.exists(chemin_reperes):
    for r in json.load(open(chemin_reperes)):
        xx = G + int(r['t'] / duree * (W - 1))
        d.line([(xx, Hh), (xx, Hh + H)], fill=(120, 220, 255), width=1)
        d.text((xx + 3, 4), r['nom'], fill=(160, 230, 255), font=police)
planche.save(sortie)
print(f'✓ {sortie} ({duree:.1f} s, {W}×{H})')
