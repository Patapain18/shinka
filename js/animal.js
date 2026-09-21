/* ============================================
   ANIMAL — un individu qui traverse le bassin
   ============================================
   Un Animal, c'est : une copie du modèle de son espèce, son animation de
   nage, et une trajectoire (courbe) qu'il parcourt à vitesse constante.
   Quand il arrive au bout, il se déclare « fini » et le spawner le retire.
   ============================================ */

import * as THREE from 'three';
import { instancier } from './modeles.js';
import { facteurNuit } from './daytime.js';

const _cible = new THREE.Vector3();   // vecteur de travail, réutilisé (pas d'allocation à chaque frame)

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
    this.haloRestant = 0;      // secondes de halo encore à jouer
    this.horloge = horloge;
    this.emission = espece.emission ? new THREE.Color(espece.emission) : null;   // luit la nuit
    this.lumiereActive = false;

    // Chaque individu nage un peu plus vite ou plus lentement que la moyenne…
    this.vitesse = vitesse ?? espece.vitesse * THREE.MathUtils.randFloat(0.85, 1.15);
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
    this.majLumiere(dt);
  }

  /** Une lueur brève sur l'animal : il vient d'être observé. */
  halo(duree = 1.6) {
    this.haloDuree = duree;
    this.haloRestant = duree;
  }

  /** L'émissif du matériau = le halo d'observation + (pour une espèce qui luit) la nuit. */
  majLumiere(dt) {
    let kHalo = 0;
    if (this.haloRestant > 0) {
      this.haloRestant = Math.max(0, this.haloRestant - dt);
      // Monte vite, redescend lentement : sin(π·t) déformé vers le début
      const t = 1 - this.haloRestant / this.haloDuree;
      kHalo = Math.sin(Math.PI * Math.pow(t, 0.55)) * 0.14;
    }
    const kNuit = (this.emission && this.horloge) ? 0.05 + 0.6 * facteurNuit(this.horloge.heure) : 0;
    const actif = kHalo > 0 || kNuit > 0;
    if (!actif && !this.lumiereActive) return;          // rien à faire, rien à éteindre
    this.lumiereActive = actif;
    const e = this.emission;
    for (const m of this.materiaux) {
      m.emissive.setRGB(0.35 * kHalo + (e ? e.r * kNuit : 0),
                        0.70 * kHalo + (e ? e.g * kNuit : 0),
                        1.00 * kHalo + (e ? e.b * kNuit : 0));
    }
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
