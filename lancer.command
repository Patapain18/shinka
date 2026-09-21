#!/bin/zsh
# ═══════════════════════════════════════════════════════════════
# LANCER.COMMAND — double-clique ce fichier dans le Finder pour
# ouvrir Shinka 進化
#
# Pourquoi un serveur et pas un simple double-clic sur index.html ?
# Le site utilise des « modules ES » (import / export) et un import map.
# Les navigateurs refusent de charger des modules depuis file:// (sécurité).
# Il faut donc un vrai serveur, même local.
#
# 1. se place dans le dossier du projet (où qu'il soit)
# 2. démarre le serveur S'IL NE TOURNE PAS DÉJÀ (nohup + disown = survit au Terminal)
# 3. ouvre le navigateur
# ═══════════════════════════════════════════════════════════════

cd "$(dirname "$0")"

PORT=8792

if ! lsof -i :$PORT >/dev/null 2>&1; then
  echo "Démarrage du serveur sur le port $PORT…"
  nohup /usr/bin/python3 -m http.server $PORT >/dev/null 2>&1 &
  disown
  sleep 1
else
  echo "Le serveur tourne déjà ✓"
fi

open "http://localhost:$PORT"
echo "Bonne plongée. Tu peux fermer cette fenêtre de Terminal."
