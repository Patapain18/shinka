/* ============================================
   ANIMAL — un individu qui traverse le bassin
   ============================================
   Un Animal, c'est : une copie du modèle de son espèce, son animation de
   nage, et une trajectoire (courbe) qu'il parcourt à vitesse constante.
   Quand il arrive au bout, il se déclare « fini » et le spawner le retire.

   La vie du mouvement (v2) :
   - le tempo de l'animation dérive lentement (± 8 %) : jamais deux passages identiques ;
   - les espèces qui ont une action « glide » alternent nage et glisse (fondus
     enchaînés) : un requin plane entre deux séries de battements ;
   - dans un virage, le corps s'incline (roulis) proportionnellement au taux de virage ;
   - une espèce peut tourner lentement sur elle-même (la méduse : `toupie`).
   ============================================ */

import * as THREE from 'three';
import { instancier } from './modeles.js';
import { creerLumiere } from './lumiere.js';

const _cible = new THREE.Vector3();   // vecteur de travail, réutilisé (pas d'allocation à chaque frame)
const _tangente = new THREE.Vector3();
const _croix = new THREE.Vector3();
const tirer = ([a, b]) => THREE.MathUtils.randFloat(a, b);

export class Animal {
  /**
   * @param espece      entrée du catalogue
   * @param trajectoire THREE.Curve (CatmullRomCurve3) à parcourir de u = 0 à u = 1
   * @param uDepart     0 = entre par le bord ; 0.5 = apparaît déjà au milieu (peuplement initial)
   * @param vitesse     m/s imposée (les membres d'un groupe partagent la même) ; sinon tirée au sort
   * @param horloge     l'horloge du jour (pour les espèces qui luisent la nuit)
   */
  constructor(espece, trajectoire, uDepart = 0, vitesse = null, horloge = null) {
    this.espece = espece;
    this.fini = false;

    const { objet, mixer, clips } = instancier(espece.id);
    this.objet = objet;
    this.mixer = mixer;
    this.objet.scale.setScalar(espece.echelle);

    // Le clonage partage les matériaux entre tous les individus d'une espèce.
    // Pour faire briller CE requin sans allumer les autres, chacun reçoit sa copie.
    this.materiaux = [];
    this.objet.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); this.materiaux.push(o.material); }
    });
    this.observe = false;      // validé pendant ce passage ?
    this.lumiere = creerLumiere(this.materiaux, espece.emission, horloge);   // halo + lueur nocturne

    // Chaque individu nage un peu plus vite ou plus lentement que la moyenne…
    this.vitesse = vitesse ?? espece.vitesse * THREE.MathUtils.randFloat(0.85, 1.15);
    // …et son animation suit : un requin pressé bat plus vite de la queue.
    this.tempo = this.vitesse / espece.vitesse;
    this.mixer.timeScale = this.tempo;
    this.chrono = 0;
    this.dephasage = Math.random() * 100;   // chacun dérive à son rythme

    this.actions = {};
    const nage = THREE.AnimationClip.findByName(clips, 'swim');
    if (nage) {
      const action = this.mixer.clipAction(nage);
      action.play();
      action.time = Math.random() * nage.duration;   // pas tous synchronisés
      this.actions.nage = action;
    }
    // La glisse : présente si le modèle a une action « glide » ET si le catalogue décrit
    // le comportement (durées de nage et de glisse) ; sinon l'animal nage sans s'arrêter.
    const plane = THREE.AnimationClip.findByName(clips, 'glide');
    if (nage && plane && espece.glisse) {
      this.actions.plane = this.mixer.clipAction(plane);   // pas encore jouée : elle entrera par un fondu
      this.etat = 'nage';
      this.prochainChangement = tirer(espece.glisse.nage) * Math.random();   // le premier changement peut venir vite
    }
    this.roulis = 0;
    this.angleToupie = 0;
    this.tangentePrecedente = null;

    this.trajectoire = trajectoire;
    this.longueur = trajectoire.getLength();          // en mètres
    this.u = uDepart;                                 // 0 → 1 le long de la courbe
    this.placer();
  }

  maj(dt) {
    // Avancer de (vitesse × dt) mètres = de (vitesse × dt / longueur) en u.
    // getPointAt() est paramétré par la longueur d'arc : la vitesse reste
    // constante même là où la courbe est plus « serrée ».
    this.u += (this.vitesse * dt) / this.longueur;
    if (this.u >= 1) { this.fini = true; return; }
    this.chrono += dt;
    this.placer(dt);
    this.comportement(dt);
    // Le tempo dérive lentement autour de sa valeur : ± 8 %, période ~ 20 s
    this.mixer.timeScale = this.tempo * (1 + 0.08 * Math.sin(this.chrono * 0.31 + this.dephasage));
    this.mixer.update(dt);
    this.lumiere.maj(dt);
  }

  /** Nage ↔ glisse : au bout d'un temps tiré au sort, un fondu enchaîné vers l'autre action.
      Piège de Three : quand un fondu sortant arrive à zéro, l'action est DÉSACTIVÉE, et un fondu
      entrant multiplie le poids de base de l'action — il faut donc réactiver la cible et remettre
      son poids de base à 1 avant chaque fondu, sinon les deux poids finissent à zéro (animal figé). */
  comportement(dt) {
    if (!this.actions.plane) return;
    this.prochainChangement -= dt;
    if (this.prochainChangement > 0) return;
    const g = this.espece.glisse;
    const [de, vers, duree, delai] = this.etat === 'nage'
      ? [this.actions.nage, this.actions.plane, 0.9, g.plane]
      : [this.actions.plane, this.actions.nage, 0.7, g.nage];
    this.etat = this.etat === 'nage' ? 'plane' : 'nage';
    vers.enabled = true;
    vers.setEffectiveWeight(1);
    if (!vers.isRunning()) { vers.time = Math.random() * vers.getClip().duration; vers.play(); }
    de.crossFadeTo(vers, duree, false);
    this.prochainChangement = tirer(delai);
  }

  /** Une lueur brève sur l'animal : il vient d'être observé. */
  halo(duree) { this.lumiere.halo(duree); }

  /** À appeler quand il quitte la scène : libérer ce que CET individu possède en propre. */
  detruire() {
    this.mixer.stopAllAction();
    // Géométrie et matériaux : rien à libérer. La géométrie est partagée avec le modèle en
    // cache (le clone n'en fait pas de copie). Les matériaux sont des copies, mais une copie
    // de matériau ne possède rien sur le GPU — et la « disposer » détruirait le programme de
    // shader qu'elle partage avec les autres, recompilé au prochain animal (une saccade).
    // Le squelette, lui, est propre à chaque copie : les matrices de ses os sont envoyées au
    // GPU sous forme de texture. Sans dispose(), une texture par animal passé resterait
    // allouée à jamais — un site qu'on laisse ouvert des heures finirait par ramer.
    this.objet.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
  }

  placer(dt = 0) {
    const u = Math.min(this.u, 1);
    this.trajectoire.getPointAt(u, this.objet.position);
    // Regarder dans la direction du mouvement : la tangente de la courbe.
    // lookAt() oriente le +Z de l'objet vers la cible — et le museau est en +Z
    // (c'est pour ça que la convention Blender « tête vers -Y » est importante).
    this.trajectoire.getTangentAt(u, _tangente);
    _cible.copy(this.objet.position).add(_tangente);
    this.objet.lookAt(_cible);
    // Roulis dans les virages : taux de virage (rad/s, > 0 = vers la gauche vu de dessus)
    // → le corps s'incline vers l'intérieur, en douceur (damp). Puis la toupie (méduse).
    if (dt > 0 && this.tangentePrecedente) {
      const angle = this.tangentePrecedente.angleTo(_tangente);
      const sens = Math.sign(_croix.crossVectors(this.tangentePrecedente, _tangente).y);
      const taux = sens * angle / dt;
      const cible = THREE.MathUtils.clamp(-(this.espece.roulis ?? 0.6) * taux, -0.35, 0.35);
      this.roulis = THREE.MathUtils.damp(this.roulis, cible, 2.5, dt);
    }
    this.tangentePrecedente = (this.tangentePrecedente ?? new THREE.Vector3()).copy(_tangente);
    if (this.roulis) this.objet.rotateZ(this.roulis);          // Z local = l'axe du corps
    if (this.espece.toupie) {
      this.angleToupie += this.espece.toupie * dt;
      this.objet.rotateY(this.angleToupie);                     // Y local = l'axe de la cloche
    }
  }
}
