/* ============================================
   CARNET — la collection, vue par le visiteur
   ============================================
   Un panneau qui glisse depuis la droite (touche C ou bouton en bas à droite).
   Grille : une carte par espèce du catalogue — silhouette noire + « ??? » tant
   qu'elle n'a pas été observée. Clic → la fiche (description, taille, habitat,
   anecdote, première observation, nombre de fois).
   Tout est construit avec createElement + textContent : aucun HTML injecté.
   ============================================ */

import { ESPECES } from './species.js';
import { estObservee, observationDe, nombreObservees } from './collection.js';

const ORDRE_RARETE = ['commun', 'peu-commun', 'rare', 'legendaire'];
const LIBELLE_RARETE = { 'commun': 'Commun', 'peu-commun': 'Peu commun', 'rare': 'Rare', 'legendaire': 'Légendaire' };
const LIBELLE_HEURE = { aube: "l’aube", jour: 'le jour', crepuscule: 'le crépuscule', nuit: 'la nuit' };

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function formatTaille(metres) {
  return metres >= 1 ? `${metres.toLocaleString('fr-FR')} m` : `${Math.round(metres * 100)} cm`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function heuresTexte(espece) {
  if (espece.evenement) return 'lors d’un événement rare';
  if (espece.heures.length === 4) return 'à toute heure';
  return espece.heures.map((h) => LIBELLE_HEURE[h]).join(', ');
}

export function creerCarnet({ surOuverture, surFermeture } = {}) {
  const carnet = document.getElementById('carnet');
  const grille = document.getElementById('carnet-grille');
  const fiche = document.getElementById('carnet-fiche');
  const compte = document.getElementById('carnet-compte');
  const btnOuvrir = document.getElementById('btn-carnet');
  const btnFermer = document.getElementById('carnet-fermer');
  let ouvert = false;

  // Tri : par rareté croissante, puis par nom (localeCompare gère les accents)
  const especes = [...ESPECES].sort((a, b) =>
    ORDRE_RARETE.indexOf(a.rarete) - ORDRE_RARETE.indexOf(b.rarete) || a.nom.localeCompare(b.nom, 'fr'));

  function rendreGrille() {
    compte.textContent = `${nombreObservees()} / ${ESPECES.length}`;
    grille.replaceChildren();
    for (const espece of especes) {
      const connue = estObservee(espece.id);
      const carte = el('button', `carte rarete-${espece.rarete}${connue ? '' : ' inconnue'}`);
      carte.type = 'button';
      const img = el('img', 'carte-image');
      img.src = espece.image;
      img.alt = connue ? espece.nom : 'Espèce non observée';
      img.loading = 'lazy';
      carte.append(img, el('span', 'carte-nom', connue ? espece.nom : '???'), el('span', 'carte-rarete', LIBELLE_RARETE[espece.rarete]));
      carte.addEventListener('click', () => montrerFiche(espece));
      grille.append(carte);
    }
  }

  function montrerFiche(espece) {
    const connue = estObservee(espece.id);
    fiche.replaceChildren();

    const retour = el('button', 'fiche-retour', '← Toutes les espèces');
    retour.type = 'button';
    retour.addEventListener('click', montrerGrille);

    const img = el('img', `fiche-image${connue ? '' : ' inconnue'}`);
    img.src = espece.image;
    img.alt = '';

    fiche.append(retour, img,
      el('p', `fiche-rarete rarete-${espece.rarete}`, LIBELLE_RARETE[espece.rarete]),
      el('h3', 'fiche-nom', connue ? espece.nom : '???'));

    const infos = el('dl', 'fiche-infos');
    const ligne = (cle, valeur) => infos.append(el('dt', null, cle), el('dd', null, valeur));

    if (connue) {
      const obs = observationDe(espece.id);
      fiche.append(el('p', 'fiche-latin', espece.latin), el('p', 'fiche-texte', espece.description));
      ligne('Taille', formatTaille(espece.taille));
      ligne('Habitat', espece.habitat);
      ligne('Se montre', heuresTexte(espece));
      fiche.append(infos, el('blockquote', 'fiche-anecdote', espece.anecdote),
        el('p', 'fiche-observation',
          `Première observation le ${formatDate(obs.premiere)} · ${obs.compte > 1 ? `vue ${obs.compte} fois` : 'vue une fois'}`));
    } else {
      fiche.append(el('p', 'fiche-texte', 'Pas encore observée. Garde le curseur sur elle quand elle passe — le temps que l’anneau se remplisse.'));
      ligne('Se montre', heuresTexte(espece));
      fiche.append(infos);
    }
    grille.hidden = true;
    fiche.hidden = false;
    fiche.scrollTop = 0;
  }

  function montrerGrille() {
    fiche.hidden = true;
    grille.hidden = false;
  }

  function ouvrir() {
    if (ouvert) return;
    ouvert = true;
    rendreGrille();
    montrerGrille();
    carnet.classList.add('ouvert');
    carnet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('carnet-ouvert');
    surOuverture?.();
  }

  function fermer() {
    if (!ouvert) return;
    ouvert = false;
    carnet.classList.remove('ouvert');
    carnet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('carnet-ouvert');
    surFermeture?.();
  }

  const basculer = () => (ouvert ? fermer() : ouvrir());

  btnOuvrir.addEventListener('click', basculer);
  btnFermer.addEventListener('click', fermer);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'c' || e.key === 'C') basculer();
    else if (e.key === 'Escape' && ouvert) (fiche.hidden ? fermer() : montrerGrille());
  });

  return {
    ouvrir, fermer, basculer,
    get ouvert() { return ouvert; },
    /** À appeler après une observation : si le carnet est ouvert sur la grille, on la redessine. */
    rafraichir() { if (ouvert && !grille.hidden) rendreGrille(); },
  };
}
