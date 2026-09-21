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

/* ============================================
   1) LE SOL ET SES CAUSTIQUES
   ============================================
   Les caustiques, c'est la surface ondulée qui concentre la lumière en filaments
   mouvants sur le fond. On ne simule pas la physique : on découpe le sol en
   « cellules » (Voronoï) dont les centres tournent lentement, et on éclaire les
   FRONTIÈRES entre cellules. Ça donne exactement ce réseau de lignes brillantes.
   ============================================ */

const SOL_VERTEX = /* glsl */`
  varying vec3 vPosMonde;
  #include <fog_pars_vertex>

  void main() {
    // position du vertex dans le monde (pas dans l'objet) : le motif est
    // ainsi accroché au bassin, pas au plan
    vPosMonde = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const SOL_FRAGMENT = /* glsl */`
  uniform float uTemps;
  uniform vec3  uCouleurSable;
  uniform vec3  uCouleurLumiere;
  uniform float uIntensite;
  varying vec3  vPosMonde;
  #include <fog_pars_fragment>

  // Un « hasard » déterministe : même entrée → même sortie. Indispensable sur GPU,
  // où chaque pixel est calculé indépendamment sans mémoire partagée.
  vec2 hachage2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                          dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }

  // Renvoie 1 sur une frontière entre deux cellules, 0 au centre d'une cellule.
  float caustiques(vec2 p, float t) {
    vec2 cellule = floor(p);
    vec2 local   = fract(p);
    float d1 = 8.0;   // distance à la cellule la plus proche…
    float d2 = 8.0;   // …et à la deuxième : la frontière est là où d1 ≈ d2
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 voisine = vec2(float(x), float(y));
        vec2 h = hachage2(cellule + voisine);
        // le centre de chaque cellule tourne en rond, à sa propre vitesse
        vec2 centre = voisine + 0.5 + 0.38 * sin(t + 6.2831 * h);
        vec2 ecart  = local - centre;
        float d = dot(ecart, ecart);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    float frontiere = sqrt(d2) - sqrt(d1);
    return pow(1.0 - smoothstep(0.0, 0.34, frontiere), 1.5);
  }

  void main() {
    vec2 p = vPosMonde.xz;
    // deux échelles superposées : grandes cellules lentes + petites rapides
    float c = 0.65 * caustiques(p * 0.55, uTemps * 0.45)
            + 0.35 * caustiques(p * 1.30 + 7.3, uTemps * 0.7);
    // par plaques : la lumière n'arrive pas partout à la fois (grandes ondes lentes)
    float plaques = 0.35 + 0.65 * (0.5 + 0.5 * sin(p.x * 0.17 + uTemps * 0.12) * sin(p.y * 0.13 - uTemps * 0.09));
    c *= plaques;
    // grain du sable : une valeur aléatoire par « grain » de 15 cm
    float grain = 0.90 + 0.10 * hachage2(floor(p * 6.5)).x;

    vec3 couleur = uCouleurSable * grain + uCouleurLumiere * c * uIntensite;
    gl_FragColor = vec4(couleur, 1.0);
    // ORDRE IMPORTANT (c'est celui des matériaux de Three) : tone mapping, puis
    // conversion vers l'espace de sortie (sRGB), puis SEULEMENT le brouillard.
    // Three fournit fogColor déjà en sRGB : mélangé avant, le lointain ressortait
    // plus clair que le fond au lieu de s'y fondre.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function creerSol(scene) {
  const materiau = new THREE.ShaderMaterial({
    // UniformsLib.fog ajoute fogColor / fogDensity : le renderer les remplit
    // tout seul à chaque frame, à condition de mettre fog: true plus bas.
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTemps:          { value: 0 },
        uCouleurSable:   { value: new THREE.Color(0x1f3038) },
        uCouleurLumiere: { value: new THREE.Color(0x8fd3ff) },
        uIntensite:      { value: 0.13 },
      },
    ]),
    vertexShader: SOL_VERTEX,
    fragmentShader: SOL_FRAGMENT,
    fog: true,
  });

  const sol = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), materiau);
  sol.rotation.x = -Math.PI / 2;   // un plan est vertical par défaut : on le couche
  sol.position.y = BASSIN.sol;
  sol.userData.intensiteBase = materiau.uniforms.uIntensite.value;
  scene.add(sol);
  return sol;
}

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
    // uv.y : 0 en bas, 1 en haut → le rayon s'éteint en descendant
    float hauteur = pow(vUv.y, 1.7);
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
    rayon.position.set(x, 3.5, z);                              // de y = -6.5 à y = 13.5
    rayon.scale.set(THREE.MathUtils.randFloat(1.2, 3.8), 20, 1);
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

  return {
    maj(dt, temps) {
      for (let i = 0; i < NOMBRE; i++) {
        positions[i * 3 + 1] -= vitesses[i] * dt;                                   // chute lente
        positions[i * 3]     += Math.sin(temps * 0.4 + phases[i]) * 0.12 * dt;      // dérive latérale
        if (positions[i * 3 + 1] < ZONE.yMin) positions[i * 3 + 1] = ZONE.yMax;     // recyclage en haut
      }
      geometrie.attributes.position.needsUpdate = true;   // « j'ai modifié le tableau, renvoie-le au GPU »
    },
    regler(facteur) {                                       // eau trouble : plus dense, plus visible
      materiau.opacity = 0.55 * facteur;
      materiau.size = 0.07 * (1 + 0.35 * (facteur - 1));
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
export function creerEau(scene, camera) {
  const sol    = creerSol(scene);
  const rayons = creerRayons(scene, camera);
  const neige  = creerNeige(scene);
  const bulles = creerBulles(scene);

  return {
    maj(dt, temps) {
      sol.material.uniforms.uTemps.value = temps;
      rayons.maj(dt, temps);
      neige.maj(dt, temps);
      bulles.maj(dt, temps);
    },
    // Multiplicateurs (1 = plein jour), appliqués par daytime.js (heure) et evenements.js (trouble).
    // Chaque clé est optionnelle : on ne touche qu'à ce qu'on reçoit.
    regler({ rayons: fRayons, caustiques: fCaustiques, neige: fNeige } = {}) {
      if (fRayons !== undefined) rayons.regler(fRayons);
      if (fCaustiques !== undefined) sol.material.uniforms.uIntensite.value = sol.userData.intensiteBase * fCaustiques;
      if (fNeige !== undefined) neige.regler(fNeige);
    },
  };
}
