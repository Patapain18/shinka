/* ============================================
   QUALITE — s'adapter à la machine
   ============================================
   Deux niveaux : « haute » (post-processing, pixel ratio 1,5, toute la neige)
   et « basse » (rendu direct, pixel ratio 1, moitié de la neige).
   Mode auto : on démarre en haute, on mesure la durée des frames pendant
   quelques secondes, et si on tombe sous 36 images par seconde on descend —
   et on s'en souvient (localStorage) pour les prochaines visites.
   Dev : ?qualite=haute|basse fige le niveau (et efface le souvenir).
   ============================================ */

const SEUIL_FPS = 36;

export function creerQualite({ rendu, renderer, eau, redimensionner, reglages, sauverReglages, hud }) {
  const params = new URLSearchParams(location.search);
  const forcee = params.get('qualite');
  if (forcee) sauverReglages({ qualite: 'auto' });                 // un ?qualite= efface la mémoire
  let niveau = forcee || reglages.qualite || 'haute';
  if (niveau !== 'basse') niveau = 'haute';
  const verrou = forcee !== null;

  const fenetre = [];
  let cumul = 0;
  let depuis = 0;

  function appliquer() {
    const haute = niveau === 'haute';
    rendu.activer(haute);
    renderer.setPixelRatio(haute ? Math.min(window.devicePixelRatio, 1.5) : 1);
    redimensionner();
    eau.regler({ densiteNeige: haute ? 1 : 0.5 });
    hud.textContent = haute ? '' : 'qualité basse';
    console.info(`qualité : ${niveau}`);
  }
  appliquer();

  return {
    get niveau() { return niveau; },
    maj(dt) {
      if (verrou || niveau === 'basse') return;
      depuis += dt;
      fenetre.push(dt);
      cumul += dt;
      if (fenetre.length > 240) cumul -= fenetre.shift();
      // au moins 5 s de vie et 120 frames mesurées avant de juger
      if (depuis > 5 && fenetre.length >= 120 && cumul / fenetre.length > 1 / SEUIL_FPS) {
        niveau = 'basse';
        appliquer();
        sauverReglages({ qualite: 'basse' });
      }
    },
  };
}
