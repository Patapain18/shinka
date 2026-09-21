/* ============================================
   ANIMAL — un individu qui traverse le bassin
   ============================================
   Un Animal, c'est : une copie du modèle de son espèce, son animation de
   nage, et une trajectoire (courbe) qu'il parcourt à vitesse constante.
   Quand il arrive au bout, il se déclare « fini » et le spawner le retire.
   ============================================ */

import * as THREE from 'three';
import { instancier } from './modeles.js';

const _cible = new THREE.Vector3();   // vecteur de travail, réutilisé (pas d'allocation à chaque frame)

export class Animal {
  /**
   * @param espece      entrée du catalogue
   * @param trajectoire THREE.Curve (CatmullRomCurve3) à parcourir de u = 0 à u = 1
   * @param uDepart     0 = entre par le bord ; 0.5 = apparaît déjà au milieu (peuplement initial)
   */
  constructor(espece, trajectoire, uDepart = 0) {
    this.espece = espece;
    this.fini = false;

    const { objet, mixer, clips } = instancier(espece.id);
    this.objet = objet;
    this.mixer = mixer;
    this.objet.scale.setScalar(espece.echelle);

    // Chaque individu nage un peu plus vite ou plus lentement que la moyenne…
    this.vitesse = espece.vitesse * THREE.MathUtils.randFloat(0.85, 1.15);
    // …et son animation suit : un requin pressé bat plus vite de la queue.
    this.mixer.timeScale = this.vitesse / espece.vitesse;

    const nage = THREE.AnimationClip.findByName(clips, 'swim');
    if (nage) {
      const action = this.mixer.clipAction(nage);
      action.play();
      action.time = Math.random() * nage.duration;   // pas tous synchronisés
    }

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
    this.placer();
    this.mixer.update(dt);
  }

  placer() {
    const u = Math.min(this.u, 1);
    this.trajectoire.getPointAt(u, this.objet.position);
    // Regarder dans la direction du mouvement : la tangente de la courbe.
    // lookAt() oriente le +Z de l'objet vers la cible — et le museau est en +Z
    // (c'est pour ça que la convention Blender « tête vers -Y » est importante).
    const tangente = this.trajectoire.getTangentAt(u);
    _cible.copy(this.objet.position).add(tangente);
    this.objet.lookAt(_cible);
  }
}
