/* ============================================
   COLLECTION — ce que le visiteur a observé
   ============================================
   Sauvegardé dans le navigateur (localStorage) sous la clé « shinka.v1 » :
   {
     version: 1,
     observations: { 'requin-recif': { premiere: '2026-09-21T14:03:00.000Z', compte: 3 }, … },
     reglages: { volume: 0.6, coupe: false }
   }
   localStorage peut être indisponible (navigation privée, stockage bloqué) :
   chaque accès est protégé, et le site marche quand même — sans mémoire.
   ============================================ */

const CLE = 'shinka.v1';

function vierge() {
  return { version: 1, observations: {}, reglages: { volume: 0.6, coupe: false } };
}

function charger() {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) {
      const donnees = JSON.parse(brut);
      if (donnees && donnees.version === 1) return donnees;   // plus tard : migrer les vieilles versions ici
    }
  } catch (erreur) {
    console.warn('Collection : lecture impossible, on repart de zéro.', erreur);
  }
  return vierge();
}

const donnees = charger();

function sauver() {
  try {
    localStorage.setItem(CLE, JSON.stringify(donnees));
  } catch (erreur) {
    console.warn('Collection : sauvegarde impossible (stockage bloqué ?).', erreur);
  }
}

/** Enregistre une observation. Renvoie { premiere: true si c'est la première fois, compte }. */
export function observer(id) {
  const existante = donnees.observations[id];
  if (existante) {
    existante.compte += 1;
    sauver();
    return { premiere: false, compte: existante.compte };
  }
  donnees.observations[id] = { premiere: new Date().toISOString(), compte: 1 };
  sauver();
  return { premiere: true, compte: 1 };
}

export function estObservee(id) {
  return id in donnees.observations;
}

export function observationDe(id) {
  return donnees.observations[id] ?? null;
}

export function nombreObservees() {
  return Object.keys(donnees.observations).length;
}

export function reglages() {
  return donnees.reglages;
}

export function sauverReglages(nouveaux) {
  Object.assign(donnees.reglages, nouveaux);
  sauver();
}
