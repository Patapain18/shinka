/* ============================================
   QUALITE — s'adapter à la machine
   ============================================
   Deux niveaux : « haute » (post-processing, pixel ratio 1,5, toute la neige)
   et « basse » (rendu direct, pixel ratio 1, moitié de la neige).

   Qui décide, par ordre de priorité :
   1. l'URL — ?qualite=haute|basse fige le niveau pour cette visite (dev, captures)
      et efface le choix mémorisé ;
   2. le visiteur — le bouton « qualité » du HUD bascule le niveau, et CE choix est
      mémorisé (localStorage) : lui sait si sa machine tient ou pas ;
   3. sinon l'auto — on démarre en haute, on mesure la durée des frames, et si la
      MÉDIANE passe sous 36 images par seconde on descend… pour cette visite seulement.

   Deux leçons derrière ces choix :
   - la médiane, pas la moyenne : une saccade de quelques secondes (un shader qui
     compile, une autre appli qui prend le GPU) tire la moyenne vers le haut, mais
     pas la médiane — il faudrait que PLUS DE LA MOITIÉ des frames soient lentes ;
   - ne pas mémoriser la décision de l'auto : une machine encombrée un soir n'est
     pas une machine lente. Avant, une seule mauvaise mesure condamnait toutes les
     visites suivantes à la qualité basse, sans bouton pour revenir.
   ============================================ */

const SEUIL_FPS = 36;
const FENETRE = 240;   // frames gardées pour la mesure (4 s à 60 fps)
const DELAI = 5;       // s de vie minimum avant de juger (le temps que tout se mette en place)
const CADENCE = 60;    // on ne trie la fenêtre (pour la médiane) qu'une frame sur 60

export function creerQualite({ rendu, renderer, eau, redimensionner, reglages, sauverReglages, bouton, surBascule }) {
  const params = new URLSearchParams(location.search);
  const forcee = params.get('qualite');
  if (forcee) sauverReglages({ qualite: 'auto' });                       // un ?qualite= efface le choix mémorisé
  const memorise = ['haute', 'basse'].includes(reglages.qualite) ? reglages.qualite : null;

  let niveau = forcee ?? memorise ?? 'haute';
  if (niveau !== 'basse') niveau = 'haute';                              // tout ce qui n'est pas « basse » est « haute »
  let auto = !forcee && !memorise;                                       // seule l'auto mesure ; l'URL et le visiteur figent
  let descendu = false;                                                  // l'auto a-t-elle baissé le niveau pendant cette visite ?

  const fenetre = [];   // les dernières durées de frame (s)
  let depuis = 0;
  let frames = 0;

  function appliquer() {
    const haute = niveau === 'haute';
    rendu.activer(haute);
    renderer.setPixelRatio(haute ? Math.min(window.devicePixelRatio, 1.5) : 1);
    redimensionner();
    eau.regler({ densiteNeige: haute ? 1 : 0.5 });
    bouton.textContent = `qualité ${niveau}${descendu ? ' (auto)' : ''}`;
    bouton.title = haute ? 'Passer en qualité basse (sans bloom, moins de particules)' : 'Passer en qualité haute';
    console.info(`qualité : ${niveau}${auto ? ' (auto)' : ''}`);
  }

  /** Le visiteur choisit : ce niveau est appliqué, mémorisé, et l'auto ne mesure plus. */
  function choisir(nouveau) {
    niveau = nouveau === 'basse' ? 'basse' : 'haute';
    auto = false;
    descendu = false;
    sauverReglages({ qualite: niveau });
    appliquer();
  }

  bouton.addEventListener('click', () => choisir(niveau === 'haute' ? 'basse' : 'haute'));
  appliquer();

  return {
    get niveau() { return niveau; },
    get auto() { return auto; },
    choisir,
    maj(dt) {
      if (!auto || niveau === 'basse') return;       // rien à mesurer : niveau figé, ou déjà en bas
      depuis += dt;
      fenetre.push(dt);
      if (fenetre.length > FENETRE) fenetre.shift();
      frames++;
      if (depuis < DELAI || fenetre.length < FENETRE / 2 || frames % CADENCE !== 0) return;
      // La médiane : on trie une copie de la fenêtre et on prend la valeur du milieu
      const triee = [...fenetre].sort((a, b) => a - b);
      const mediane = triee[Math.floor(triee.length / 2)];
      if (mediane > 1 / SEUIL_FPS) {
        niveau = 'basse';
        descendu = true;
        appliquer();
        surBascule?.();
      }
    },
  };
}
