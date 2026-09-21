/* ============================================
   WATER — l'eau elle-même
   ============================================
   Tout ce qui fait qu'on se sent SOUS l'eau et pas dans une pièce bleue :
   1) le sol de sable et ses caustiques (la lumière qui danse au fond)
   2) les rayons de lumière qui descendent de la surface
   3) la « neige marine » : particules en suspension qui dérivent
   4) quelques bulles qui montent

   Deux techniques différentes, exprès :
   - sol et rayons = ShaderMaterial (le GPU calcule chaque pixel, on écrit le GLSL)
   - neige et bulles = Points + tableau de positions qu'on déplace en JS chaque frame
   ============================================ */

import * as THREE from 'three';
import { BASSIN } from './scene.js';
import { creerSable } from './sable.js';
import { uniformsCaustiques } from './caustiques.js';

/* ============================================
   1) LE SOL : voir sable.js (dunes, rides, grain, ombres, caustiques partagées)
   ============================================ */

/* ============================================
   2) LES RAYONS DE LUMIÈRE
   ============================================
   Astuce classique : des plans verticaux transparents, tournés vers la caméra,
   avec un dégradé additif (fort en haut, éteint en bas, doux sur les côtés).
   Ils oscillent lentement et pulsent chacun à leur rythme.
   ============================================ */

const RAYON_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RAYON_FRAGMENT = /* glsl */`
  uniform vec3  uCouleur;
  uniform float uIntensite;
  uniform float uTemps;
  uniform float uPhase;
  varying vec2  vUv;

  void main() {
    // uv.x : 0 à gauche du plan, 1 à droite → bords fondus
    float bords = smoothstep(0.0, 0.45, vUv.x) * smoothstep(1.0, 0.55, vUv.x);
    // uv.y : 0 en bas, 1 en haut → le rayon s'éteint en descendant, et se fond dans la
    // surface tout en haut (sinon on verrait le bord du plan quand on lève les yeux)
    float hauteur = pow(vUv.y, 1.7) * smoothstep(1.0, 0.80, vUv.y);
    float pulsation = 0.6 + 0.4 * sin(uTemps * 0.35 + uPhase);
    float a = bords * hauteur * uIntensite * pulsation;
    gl_FragColor = vec4(uCouleur, a);   // en blending additif : couleur × a s'AJOUTE au fond
    #include <colorspace_fragment>
  }
`;

function creerRayons(scene, camera) {
  const geometrie = new THREE.PlaneGeometry(1, 1);   // partagée, chaque rayon la met à l'échelle
  const rayons = [];
  const NOMBRE = 14;

  for (let i = 0; i < NOMBRE; i++) {
    const x = THREE.MathUtils.randFloatSpread(28);        // entre -14 et +14
    const z = THREE.MathUtils.randFloat(-22, -5);
    const distance = Math.hypot(x, z);
    // Le ShaderMaterial ne connaît pas le brouillard : on reproduit sa formule
    // (exp(-(densité·distance)²)) pour que les rayons lointains soient plus faibles.
    const attenuation = Math.exp(-Math.pow(BASSIN.densiteBrume * distance, 2));

    const materiau = new THREE.ShaderMaterial({
      uniforms: {
        uCouleur:   { value: new THREE.Color(0x7fc4ff) },
        uIntensite: { value: THREE.MathUtils.randFloat(0.10, 0.22) * attenuation },
        uTemps:     { value: 0 },
        uPhase:     { value: Math.random() * Math.PI * 2 },
      },
      vertexShader: RAYON_VERTEX,
      fragmentShader: RAYON_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,   // s'ajoute à ce qu'il y a derrière = lumière
      depthWrite: false,                  // ne bouche pas les objets derrière lui
      side: THREE.DoubleSide,
    });

    const rayon = new THREE.Mesh(geometrie, materiau);
    rayon.position.set(x, 1.55, z);                             // de y = -4,2 (sous le sable) à 7,3 (juste sous la surface)
    rayon.scale.set(THREE.MathUtils.randFloat(1.2, 3.8), 11.5, 1);
    rayon.userData.inclinaison = THREE.MathUtils.randFloatSpread(0.35);
    rayon.userData.phase = Math.random() * Math.PI * 2;
    rayon.userData.intensiteBase = materiau.uniforms.uIntensite.value;   // pour le réglage jour / nuit
    scene.add(rayon);
    rayons.push(rayon);
  }

  const cible = new THREE.Vector3();
  return {
    maj(dt, temps) {
      for (const rayon of rayons) {
        rayon.material.uniforms.uTemps.value = temps;
        // face à la caméra (sans se pencher en avant : on garde la hauteur du rayon)…
        cible.set(camera.position.x, rayon.position.y, camera.position.z);
        rayon.lookAt(cible);
        // …puis incliné, avec un balancement lent propre à chaque rayon
        rayon.rotateZ(rayon.userData.inclinaison + Math.sin(temps * 0.18 + rayon.userData.phase) * 0.05);
      }
    },
    regler(facteur) {
      for (const rayon of rayons) rayon.material.uniforms.uIntensite.value = rayon.userData.intensiteBase * facteur;
    },
  };
}

/* ============================================
   3) et 4) NEIGE MARINE ET BULLES
   ============================================
   Un objet Points dessine un sprite par sommet : parfait pour des milliers de
   particules. On déplace les positions en JS et on prévient Three (needsUpdate).
   ============================================ */

// Dessine un disque flou dans un canvas → texture. Aucune image à charger.
function textureDisque(taille = 64, creux = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = taille;
  const ctx = canvas.getContext('2d');
  const r = taille / 2;
  const degrade = ctx.createRadialGradient(r, r, 0, r, r, r);
  if (creux) {
    // une bulle : centre transparent, anneau lumineux, bord fondu
    degrade.addColorStop(0.00, 'rgba(255,255,255,0)');
    degrade.addColorStop(0.62, 'rgba(255,255,255,0.05)');
    degrade.addColorStop(0.82, 'rgba(255,255,255,0.9)');
    degrade.addColorStop(1.00, 'rgba(255,255,255,0)');
  } else {
    degrade.addColorStop(0.00, 'rgba(255,255,255,1)');
    degrade.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    degrade.addColorStop(1.00, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = degrade;
  ctx.fillRect(0, 0, taille, taille);
  return new THREE.CanvasTexture(canvas);
}

function creerNeige(scene) {
  const NOMBRE = 2500;
  const ZONE = { x: 22, yMin: BASSIN.sol, yMax: 9, zMin: -34, zMax: -2 };

  // Un seul grand tableau : x0 y0 z0 x1 y1 z1 … (c'est ce que le GPU attend)
  const positions = new Float32Array(NOMBRE * 3);
  const vitesses  = new Float32Array(NOMBRE);   // vitesse de chute, m/s
  const phases    = new Float32Array(NOMBRE);   // pour que chacune dérive à son rythme

  for (let i = 0; i < NOMBRE; i++) {
    positions[i * 3]     = THREE.MathUtils.randFloatSpread(ZONE.x * 2);
    positions[i * 3 + 1] = THREE.MathUtils.randFloat(ZONE.yMin, ZONE.yMax);
    positions[i * 3 + 2] = THREE.MathUtils.randFloat(ZONE.zMin, ZONE.zMax);
    vitesses[i] = THREE.MathUtils.randFloat(0.03, 0.12);
    phases[i]   = Math.random() * Math.PI * 2;
  }

  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const materiau = new THREE.PointsMaterial({
    size: 0.07,                      // en mètres, puisque sizeAttenuation est actif
    map: textureDisque(),
    color: 0xcfe9ff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,           // plus petit quand c'est loin
  });

  scene.add(new THREE.Points(geometrie, materiau));

  // Le SILLAGE : chaque particule garde une vitesse propre (élan) ; un animal qui passe
  // pousse celles qui sont dans son rayon, elles s'écartent puis retombent dans la dérive.
  const elans = new Float32Array(NOMBRE * 3);
  const precedentes = new Map();                            // animal → sa position à la frame d'avant
  const v = new THREE.Vector3();
  return {
    maj(dt, temps, animaux = []) {
      const vivants = new Set();
      for (const animal of animaux) {
        const p = animal.objet.position;
        const rayon = Math.max(0.35, (animal.rayonHitbox ?? animal.espece.taille * 0.45));
        const avant = precedentes.get(animal);
        if (avant) v.subVectors(p, avant).divideScalar(Math.max(dt, 1e-3)); else v.set(0, 0, 0);
        precedentes.set(animal, (avant ?? new THREE.Vector3()).copy(p));
        vivants.add(animal);
        const vitesse = v.length();
        if (vitesse < 0.05) continue;
        const r2 = rayon * rayon;
        for (let i = 0; i < NOMBRE; i++) {
          const dx = positions[i * 3] - p.x, dy = positions[i * 3 + 1] - p.y, dz = positions[i * 3 + 2] - p.z;
          if (dx > rayon || dx < -rayon || dy > rayon || dy < -rayon || dz > rayon || dz < -rayon) continue;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2 || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const force = (1 - d / rayon) * vitesse * 0.9 * dt;             // plus fort près du corps, et vite
          elans[i * 3]     += (dx / d) * force + v.x * 0.25 * dt;          // écartée… et un peu entraînée
          elans[i * 3 + 1] += (dy / d) * force + v.y * 0.25 * dt;
          elans[i * 3 + 2] += (dz / d) * force + v.z * 0.25 * dt;
        }
      }
      for (const animal of precedentes.keys()) if (!vivants.has(animal)) precedentes.delete(animal);
      const frein = Math.exp(-1.8 * dt);                                   // l'élan s'amortit (l'eau freine)
      for (let i = 0; i < NOMBRE; i++) {
        positions[i * 3 + 1] -= vitesses[i] * dt;                                   // chute lente
        positions[i * 3]     += Math.sin(temps * 0.4 + phases[i]) * 0.12 * dt;      // dérive latérale
        positions[i * 3]     += elans[i * 3] * dt;                                  // le sillage
        positions[i * 3 + 1] += elans[i * 3 + 1] * dt;
        positions[i * 3 + 2] += elans[i * 3 + 2] * dt;
        elans[i * 3] *= frein; elans[i * 3 + 1] *= frein; elans[i * 3 + 2] *= frein;
        if (positions[i * 3 + 1] < ZONE.yMin) positions[i * 3 + 1] = ZONE.yMax;     // recyclage en haut
      }
      geometrie.attributes.position.needsUpdate = true;   // « j'ai modifié le tableau, renvoie-le au GPU »
    },
    regler(facteur) {                                       // eau trouble : plus dense, plus visible
      materiau.opacity = 0.55 * facteur;
      materiau.size = 0.07 * (1 + 0.35 * (facteur - 1));
    },
    densite(fraction) {                                     // qualité basse : on n'en dessine qu'une partie
      geometrie.setDrawRange(0, Math.floor(NOMBRE * fraction));
    },
  };
}

function creerBulles(scene) {
  const NOMBRE = 40;
  const positions = new Float32Array(NOMBRE * 3);
  const vitesses  = new Float32Array(NOMBRE);
  const phases    = new Float32Array(NOMBRE);

  const naitre = (i) => {
    positions[i * 3]     = THREE.MathUtils.randFloatSpread(20);
    positions[i * 3 + 1] = BASSIN.sol + Math.random() * 0.5;
    positions[i * 3 + 2] = THREE.MathUtils.randFloat(-16, -4);
    vitesses[i] = THREE.MathUtils.randFloat(0.35, 0.7);
    phases[i]   = Math.random() * Math.PI * 2;
  };
  for (let i = 0; i < NOMBRE; i++) {
    naitre(i);
    positions[i * 3 + 1] = THREE.MathUtils.randFloat(BASSIN.sol, 8);   // au départ, réparties sur la hauteur
  }

  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const materiau = new THREE.PointsMaterial({
    size: 0.13,
    map: textureDisque(64, true),
    color: 0xdff2ff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(geometrie, materiau));

  return {
    maj(dt, temps) {
      for (let i = 0; i < NOMBRE; i++) {
        positions[i * 3 + 1] += vitesses[i] * dt;
        positions[i * 3]     += Math.sin(temps * 2.2 + phases[i]) * 0.25 * dt;   // zigzag d'une bulle
        if (positions[i * 3 + 1] > 8) naitre(i);
      }
      geometrie.attributes.position.needsUpdate = true;
    },
  };
}

/* ============================================
   Point d'entrée du module
   ============================================ */
const CAUSTIQUES_BASE = uniformsCaustiques.uCausticsIntensite.value;

export function creerEau(scene, camera, rochers = []) {
  const sable  = creerSable(scene, rochers);
  const rayons = creerRayons(scene, camera);
  const neige  = creerNeige(scene);
  const bulles = creerBulles(scene);

  return {
    maj(dt, temps, animaux = []) {
      uniformsCaustiques.uTemps.value = temps;
      rayons.maj(dt, temps);
      neige.maj(dt, temps, animaux);
      bulles.maj(dt, temps);
    },
    // Multiplicateurs (1 = plein jour), appliqués par daytime.js (heure) et evenements.js (trouble).
    // Chaque clé est optionnelle : on ne touche qu'à ce qu'on reçoit.
    regler({ rayons: fRayons, caustiques: fCaustiques, neige: fNeige, densiteNeige } = {}) {
      if (fRayons !== undefined) rayons.regler(fRayons);
      if (fCaustiques !== undefined) uniformsCaustiques.uCausticsIntensite.value = CAUSTIQUES_BASE * fCaustiques;
      if (fNeige !== undefined) neige.regler(fNeige);
      if (densiteNeige !== undefined) neige.densite(densiteNeige);
    },
  };
}
