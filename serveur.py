#!/usr/bin/env python3
"""
serveur.py — le serveur local de Shinka, sans cache
====================================================
Comme `python3 -m http.server`, mais chaque réponse porte « Cache-Control: no-store » :
le navigateur redemande toujours les fichiers. Sans ça, après une mise à jour du code,
il peut garder un vieux module (ex. : daytime.js) et charger un nouveau (animal.js)
qui importe une fonction que l'ancien n'a pas → « does not provide an export named … ».
Sert le dossier où il se trouve. Usage : python3 serveur.py [port]
"""
import os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8792
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class SansCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, format, *args):      # silence : pas une ligne par fichier servi
        pass

ThreadingHTTPServer(('', PORT), SansCache).serve_forever()
