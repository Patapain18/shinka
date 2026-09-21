/* ============================================
   UI — tout ce qui est HTML par-dessus la 3D
   ============================================
   Le curseur-anneau (jauge d'observation), les toasts, le compteur du HUD.
   Ce module ne sait rien de Three.js : il reçoit des ordres simples
   (« déplace le curseur », « remplis la jauge à 40 % », « affiche ce toast »).
   ============================================ */

const CIRCONFERENCE = 2 * Math.PI * 20;   // rayon 20 dans le viewBox du SVG

export function creerUI() {
  const curseur = document.getElementById('curseur');
  const anneau = curseur.querySelector('.curseur-anneau');
  const jauge = curseur.querySelector('.curseur-jauge');
  const toasts = document.getElementById('toasts');
  const hudCollection = document.getElementById('hud-collection');

  jauge.style.strokeDasharray = CIRCONFERENCE;
  jauge.style.strokeDashoffset = CIRCONFERENCE;   // vide au départ

  return {
    curseur: {
      deplacer(x, y) { curseur.style.transform = `translate3d(${x}px, ${y}px, 0)`; },
      visible(oui) { curseur.classList.toggle('actif', oui); },
      survol(oui) { anneau.classList.toggle('sur-animal', oui); },
      // p de 0 à 1 : on « découvre » le trait du cercle en réduisant le décalage du pointillé
      progression(p) { jauge.style.strokeDashoffset = CIRCONFERENCE * (1 - Math.max(0, Math.min(1, p))); },
    },

    /** Un toast en bas de l'écran. discret = version compacte pour les observations répétées. */
    toast({ titre, nom, rarete, discret = false, duree = discret ? 1800 : 4500 }) {
      const el = document.createElement('div');
      el.className = `toast rarete-${rarete}${discret ? ' discret' : ''}`;
      el.innerHTML = `<span class="toast-sur"></span><span class="toast-nom"></span>`;
      el.querySelector('.toast-sur').textContent = titre;    // textContent : jamais d'HTML injecté
      el.querySelector('.toast-nom').textContent = nom;
      toasts.appendChild(el);
      setTimeout(() => {
        el.classList.add('sortie');
        el.addEventListener('animationend', () => el.remove(), { once: true });
      }, duree);
    },

    majCompteur(observees, total) {
      hudCollection.textContent = `${observees} / ${total} espèces`;
    },
  };
}
