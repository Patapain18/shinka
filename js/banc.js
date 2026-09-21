/* ============================================
   BANC — des centaines de poissons en UN objet
   ============================================
   Un InstancedMesh : une seule géométrie (la sardine), une seule commande de
   dessin, N matrices. Deux différences avec Animal :
   - la nage n'est pas un squelette (ça ne s'instancie pas) mais un VERTEX
     SHADER : chaque sommet ondule selon sa position sur le corps et une phase
     propre à l'individu (attribut d'instance aPhase)
   - le comportement : chaque poisson tourne autour du centre du banc à son
     rythme, avec un rayon et une hauteur qui « respirent ». Le centre suit une
     trajectoire, comme un Animal. En mode tourbillon, la rotation est rapide :
     une boule de sardines qui tourne sur elle-même.
   ============================================ */

import * as THREE from 'three';
import { brut } from './modeles.js';
import { creerLumiere } from './lumiere.js';

const _fantome = new THREE.Object3D();   // sert à calculer chaque matrice d'instance
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _cible = new THREE.Vector3();

export class Banc {
  constructor(espece, trajectoire, { nombre = 100, uDepart = 0, vitesse = null, horloge = null, tourbillon = false } = {}) {
    this.espece = espece;
    this.fini = false;
    this.observe = false;
    this.nombre = nombre;
    this.tourbillon = tourbillon;
    this.temps = 0;

    // La géométrie et le matériau du modèle chargé, clonés pour ce banc
    const gltf = brut(espece.id);
    let source = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !source) source = o; });
    const geometrie = source.geometry.clone();
    const materiau = source.material.clone();

    // Une phase de nage par individu, lue par le vertex shader
    const phases = new Float32Array(nombre);
    for (let i = 0; i < nombre; i++) phases[i] = Math.random() * Math.PI * 2;
    geometrie.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));

    this.uTemps = { value: 0 };
    // onBeforeCompile : on greffe notre ondulation dans le shader standard de Three
    // (on garde ses lumières, son brouillard, ses couleurs par sommet)
    materiau.onBeforeCompile = (shader) => {
      shader.uniforms.uTemps = this.uTemps;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTemps;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          // ondulation latérale, plus ample vers la queue (le museau est en +Z)
          float versQueue = smoothstep(0.03, -0.08, position.z);
          transformed.x += sin(uTemps * 14.0 + aPhase + position.z * 40.0) * 0.006 * (0.25 + versQueue);`);
    };
    materiau.customProgramCacheKey = () => 'banc';   // ce shader modifié a droit à son propre programme

    this.maillage = new THREE.InstancedMesh(geometrie, materiau, nombre);
    this.maillage.frustumCulled = false;   // la boîte englobante ne suit pas les instances : on ne la laisse pas décider
    this.objet = new THREE.Group();        // objet.position = le centre du banc (c'est lui que vise l'observation)
    this.objet.add(this.maillage);
    this.materiaux = [materiau];
    this.rayonHitbox = tourbillon ? 3.2 : 2.2;
    this.lumiere = creerLumiere(this.materiaux, espece.emission, horloge);

    // Les individus : rayon, angle, hauteur, vitesse angulaire, déphasage
    this.rayon = new Float32Array(nombre);
    this.angle = new Float32Array(nombre);
    this.hauteur = new Float32Array(nombre);
    this.omega = new Float32Array(nombre);
    this.dephasage = new Float32Array(nombre);
    this.precedentes = new Float32Array(nombre * 3);   // positions locales de la frame d'avant → vitesse → orientation
    for (let i = 0; i < nombre; i++) {
      const sens = Math.random() < 0.9 ? 1 : -1;        // quelques-uns à contre-courant
      this.rayon[i] = tourbillon ? THREE.MathUtils.randFloat(0.6, 2.4) : THREE.MathUtils.randFloat(0.3, 2.0);
      this.angle[i] = Math.random() * Math.PI * 2;
      this.hauteur[i] = THREE.MathUtils.randFloatSpread(tourbillon ? 2.2 : 1.4);
      this.omega[i] = sens * (tourbillon ? THREE.MathUtils.randFloat(0.7, 1.3) : THREE.MathUtils.randFloat(0.05, 0.2));
      this.dephasage[i] = Math.random() * Math.PI * 2;
    }

    this.trajectoire = trajectoire;
    this.longueur = trajectoire.getLength();
    this.u = uDepart;
    this.vitesse = vitesse ?? espece.vitesse * THREE.MathUtils.randFloat(0.9, 1.1);
    this.placer(0);
  }

  /** Nouvelle trajectoire (ex. : le banc quitte son tourbillon et s'en va). */
  changerTrajectoire(courbe, tourbillon = false) {
    this.trajectoire = courbe;
    this.longueur = courbe.getLength();
    this.u = 0;
    if (this.tourbillon && !tourbillon) {
      for (let i = 0; i < this.nombre; i++) { this.omega[i] *= 0.25; this.rayon[i] *= 0.7; }   // il se resserre et se calme
    }
    this.tourbillon = tourbillon;
  }

  maj(dt) {
    this.temps += dt;
    this.uTemps.value = this.temps;
    this.u += (this.vitesse * dt) / this.longueur;
    if (this.u >= 1) {
      if (this.trajectoire.closed) this.u -= 1;          // une boucle fermée : on repart
      else { this.fini = true; return; }
    }
    this.placer(dt);
    this.lumiere.maj(dt);
  }

  placer(dt) {
    const u = Math.min(this.u, 1);
    this.trajectoire.getPointAt(u, this.objet.position);
    const tangente = this.trajectoire.getTangentAt(u);

    for (let i = 0; i < this.nombre; i++) {
      this.angle[i] += this.omega[i] * dt;
      const r = this.rayon[i] * (1 + 0.15 * Math.sin(this.temps * 0.7 + this.dephasage[i]));
      const h = this.hauteur[i] + 0.25 * Math.sin(this.temps * 0.9 + this.dephasage[i] * 2);
      _p.set(r * Math.cos(this.angle[i]), h, r * Math.sin(this.angle[i]));

      // Sa vitesse = son mouvement autour du centre + celui du centre → il regarde où il va
      const j = i * 3;
      if (dt > 0) _v.set((_p.x - this.precedentes[j]) / dt, (_p.y - this.precedentes[j + 1]) / dt, (_p.z - this.precedentes[j + 2]) / dt);
      else _v.set(0, 0, 0);
      _v.addScaledVector(tangente, this.vitesse);
      this.precedentes[j] = _p.x; this.precedentes[j + 1] = _p.y; this.precedentes[j + 2] = _p.z;

      _fantome.position.copy(_p);
      if (_v.lengthSq() > 1e-6) { _cible.copy(_p).add(_v); _fantome.lookAt(_cible); }
      _fantome.updateMatrix();
      this.maillage.setMatrixAt(i, _fantome.matrix);
    }
    this.maillage.instanceMatrix.needsUpdate = true;   // « les matrices ont changé, renvoie-les au GPU »
  }

  halo(duree) { this.lumiere.halo(duree); }

  /** À appeler quand le banc quitte la scène : libérer ce qu'il possède en propre. */
  detruire() {
    // La géométrie est une copie propre à ce banc (elle porte l'attribut aPhase) : ses
    // tampons GPU sont à libérer. dispose() sur le maillage libère EN PLUS le tampon des
    // matrices d'instances, qui n'appartient pas à la géométrie mais à l'InstancedMesh.
    // Le matériau, lui, ne possède rien sur le GPU : le « disposer » ne ferait que détruire
    // le programme de shader partagé, recompilé au banc suivant (une saccade pour rien).
    this.maillage.geometry.dispose();
    this.maillage.dispose();
  }
}
