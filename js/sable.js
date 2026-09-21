/* ============================================
   SABLE — le sol du bassin
   ============================================
   Un vrai sable, pas un plan bleu :
   - des DUNES : la géométrie est déplacée une fois (bruit JS), avec ses normales ;
   - des RIDES de sable (les vaguelettes que laisse la houle), en relief dans le
     shader : une normale perturbée, calculée point par point ;
   - un GRAIN fin, des taches de teinte, des débris sombres (bouts de coquilles) ;
   - la matière est un MeshStandardMaterial : il reçoit les OMBRES des animaux et
     des rochers, le brouillard, les reflets ; on y greffe (onBeforeCompile) les
     rides, la teinte, l'assombrissement au pied des rochers, et les caustiques
     partagées (caustiques.js), qui n'éclairent pas là où il y a de l'ombre.
   ============================================ */
import * as THREE from 'three';
import { BASSIN } from './scene.js';
import { fbm2 } from './bruit.js';
import { appliquerCaustiques } from './caustiques.js';

/** La hauteur du sable en (x, z) : de grandes dunes molles + de petites bosses. */
export function hauteurSable(x, z) {
  return 0.55 * fbm2(x * 0.045 + 3.1, z * 0.045 - 1.7, 3) + 0.12 * fbm2(x * 0.2, z * 0.2, 2, 2, 0.5, 5);
}

const SABLE_UNIFORMS = {
  uRochers: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) },   // (x, z, rayon, 0)
  uNbRochers: { value: 0 },
};

export function creerSable(scene, rochers = []) {
  const TAILLE = 240, SEGMENTS = 240;
  const geometrie = new THREE.PlaneGeometry(TAILLE, TAILLE, SEGMENTS, SEGMENTS);
  geometrie.rotateX(-Math.PI / 2);                       // couché : x, z au sol, y vers le haut
  geometrie.translate(0, 0, -40);                        // centré devant la vitre
  const pos = geometrie.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, BASSIN.sol + hauteurSable(pos.getX(i), pos.getZ(i)));
  }
  geometrie.computeVertexNormals();

  const materiau = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0 });
  materiau.onBeforeCompile = (shader) => {
    shader.uniforms.uRochers = SABLE_UNIFORMS.uRochers;
    shader.uniforms.uNbRochers = SABLE_UNIFORMS.uNbRochers;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosMondeS;\nvarying vec3 vNormaleMondeS;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vPosMondeS = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vNormaleMondeS = normalize(mat3(modelMatrix) * objectNormal);`);   // (le sable n'est pas instancié)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPosMondeS;
        varying vec3 vNormaleMondeS;
        uniform vec4 uRochers[16];
        uniform int uNbRochers;
        float hachS(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float bruitS(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hachS(i), hachS(i + vec2(1, 0)), f.x), mix(hachS(i + vec2(0, 1)), hachS(i + vec2(1, 1)), f.x), f.y);
        }
        float fbmS(vec2 p) { return 0.5 * bruitS(p) + 0.25 * bruitS(p * 2.03 + 3.7) + 0.125 * bruitS(p * 4.1 + 9.2); }
        // Les rides : des crêtes presque parallèles (la houle vient d'une direction), qui
        // ondulent et se dédoublent grâce à un bruit dans la phase. Renvoie la pente (dh/dx, dh/dz).
        vec2 penteRides(vec2 p) {
          vec2 dir = normalize(vec2(0.35, 1.0));
          float freq = 2.0 * 3.14159 / (0.22 + 0.10 * bruitS(p * 0.05));   // une ride tous les 22 à 32 cm
          float phase = dot(p, dir) * freq + 4.0 * fbmS(p * 0.35) + 1.2 * bruitS(p * 1.7);   // elles serpentent et se dédoublent
          float amp = 0.010 * (0.45 + 0.55 * bruitS(p * 0.08));   // 1 cm de relief, par plages
          float c = cos(phase);
          // dérivée de amp·sin(phase) : amp·cos(phase)·∂phase (on néglige la dérivée du bruit)
          return amp * c * freq * dir;
        }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          vec2 pente = penteRides(vPosMondeS.xz);
          vec3 nMonde = normalize(vNormaleMondeS + vec3(-pente.x, 0.0, -pente.y));
          normal = normalize((viewMatrix * vec4(nMonde, 0.0)).xyz);
          nonPerturbedNormal = normal;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vPosMondeS.xz;
          vec3 clair  = vec3(0.46, 0.44, 0.36);                    // sable beige-gris (valeurs linéaires)
          vec3 sombre = vec3(0.24, 0.25, 0.20);                    // sable gris-olive, plus dense
          float teinte = fbmS(p * 0.09);
          vec3 sable = mix(sombre, clair, smoothstep(0.30, 0.75, teinte));
          sable *= 0.86 + 0.14 * hachS(floor(p * 45.0));         // le grain : 2 cm
          sable *= 0.93 + 0.07 * bruitS(p * 3.0);                 // des taches douces
          // bouts de coquilles et brindilles : rares, petits (3-4 cm), RONDS — pas des cases
          vec2 cellD = floor(p * 7.0);
          vec2 centreD = cellD + 0.5 + 0.6 * (vec2(hachS(cellD + 3.0), hachS(cellD + 5.0)) - 0.5);
          float rayonD = 0.10 + 0.08 * hachS(cellD + 9.0);
          float debris = step(0.975, hachS(cellD + 11.0)) * (1.0 - smoothstep(rayonD * 0.6, rayonD, distance(p * 7.0, centreD)));
          sable = mix(sable, mix(sable * 0.45, vec3(0.55, 0.50, 0.42), 0.5 * step(0.5, hachS(cellD + 13.0))), debris);
          // au pied des rochers : le sable est plus sombre (ombre, matières)
          float ao = 1.0;
          for (int i = 0; i < 16; i++) {
            if (i >= uNbRochers) break;
            float d = distance(p, uRochers[i].xy);
            ao *= smoothstep(uRochers[i].z * 0.85, uRochers[i].z * 1.7, d);
          }
          diffuseColor.rgb *= sable * (0.45 + 0.55 * ao);
        }`);
  };
  materiau.customProgramCacheKey = () => 'sable';
  appliquerCaustiques(materiau, 1.0);

  const sable = new THREE.Mesh(geometrie, materiau);
  sable.receiveShadow = true;
  scene.add(sable);
  poserRochers(rochers);
  return sable;
}

/** Les rochers dont le sable doit assombrir le pied : [{x, z, rayon}, …]. */
export function poserRochers(rochers) {
  const n = Math.min(rochers.length, 16);
  for (let i = 0; i < n; i++) SABLE_UNIFORMS.uRochers.value[i].set(rochers[i].x, rochers[i].z, rochers[i].rayon, 0);
  SABLE_UNIFORMS.uNbRochers.value = n;
}
