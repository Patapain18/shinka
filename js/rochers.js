/* ============================================
   ROCHERS — des blocs érodés, et des cailloux
   ============================================
   - la FORME : une boule à facettes fines déplacée par deux couches de bruit
     (grandes bosses + petites), le dessous écrasé (le rocher est enfoncé dans
     le sable, il ne flotte pas) ; chaque rocher a sa graine ;
   - la MATIÈRE, calculée point par point dans le shader à partir de la position
     dans le monde (tri-planaire, donc sans UV) : basalte gris-bleu et brun, grain
     fin, fissures sombres, ALGUES vert-olive sur les faces qui regardent le haut,
     quelques plaques roses d'algues corallines sur les flancs, relief par bruit ;
     rugosité plus faible là où c'est mouillé et glissant (les algues) ;
   - les OMBRES : ils en portent et en reçoivent ; les CAUSTIQUES partagées dansent
     sur leur dessus ;
   - des CAILLOUX : un champ de petits galets instanciés au premier plan.
   Tous se posent à la hauteur des dunes du sable (sable.js).
   ============================================ */
import * as THREE from 'three';
import { BASSIN } from './scene.js';
import { hauteurSable } from './sable.js';
import { fbm3, hachage } from './bruit.js';
import { appliquerCaustiques } from './caustiques.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const ROCHERS = [
  // [x, z, rayon] — étagés de 8 m à 35 m pour « lire » la profondeur
  [-7,  -8, 1.1], [ 9, -11, 1.6], [-14, -16, 2.2], [ 4, -19, 1.3],
  [15, -24, 2.8], [-6, -27, 1.9], [ 22, -32, 3.5], [-20, -35, 3.0],
];

/** Une boule érodée : rayon 1, bruit à deux échelles, dessous écrasé. */
function geometrieRocher(detail, graine) {
  // IcosahedronGeometry est NON indexée (chaque face a ses propres sommets) : ses normales
  // seraient plates, à facettes. mergeVertices() soude les sommets partagés → lissage.
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail));
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const relief = 1 + 0.28 * fbm3(n.x * 1.4 + graine, n.y * 1.4, n.z * 1.4, 3) + 0.05 * fbm3(n.x * 4.2, n.y * 4.2 + graine, n.z * 4.2, 2, 2, 0.5, 3);
    v.copy(n).multiplyScalar(relief);
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.35;           // le dessous, enfoncé et aplati
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const ROCHE_GLSL = /* glsl */`
  varying vec3 vPosMondeR;
  varying vec3 vNormaleMondeR;
  float hachR(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float bruitR(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hachR(i), hachR(i + vec3(1, 0, 0)), f.x), mix(hachR(i + vec3(0, 1, 0)), hachR(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hachR(i + vec3(0, 0, 1)), hachR(i + vec3(1, 0, 1)), f.x), mix(hachR(i + vec3(0, 1, 1)), hachR(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbmR(vec3 p) { return 0.5 * bruitR(p) + 0.25 * bruitR(p * 2.02 + 1.3) + 0.125 * bruitR(p * 4.05 + 2.7); }
`;

function creerMateriau() {
  const materiau = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
  materiau.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosMondeR;\nvarying vec3 vNormaleMondeR;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 pR = vec4(transformed, 1.0);
          vec3 nR = objectNormal;
          #ifdef USE_INSTANCING
            pR = instanceMatrix * pR;
            nR = mat3(instanceMatrix) * nR;
          #endif
          vPosMondeR = (modelMatrix * pR).xyz;
          vNormaleMondeR = normalize(mat3(modelMatrix) * nR);
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + ROCHE_GLSL)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          // relief par bruit : le gradient d'un bruit 3D, projeté sur le plan tangent
          vec3 p = vPosMondeR * 3.0;
          float e = 0.03;
          vec3 g = vec3(fbmR(p + vec3(e, 0, 0)) - fbmR(p - vec3(e, 0, 0)),
                        fbmR(p + vec3(0, e, 0)) - fbmR(p - vec3(0, e, 0)),
                        fbmR(p + vec3(0, 0, e)) - fbmR(p - vec3(0, 0, e))) / (2.0 * e);
          vec3 nG = normalize(vNormaleMondeR);
          g -= nG * dot(g, nG);
          vec3 nMonde = normalize(nG - 0.045 * g);
          normal = normalize((viewMatrix * vec4(nMonde, 0.0)).xyz);
          nonPerturbedNormal = normal;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 p = vPosMondeR;
          vec3 nMonde = normalize(vNormaleMondeR);
          vec3 basalte = vec3(0.13, 0.145, 0.155);
          vec3 brun    = vec3(0.24, 0.20, 0.15);
          vec3 roche = mix(basalte, brun, smoothstep(0.35, 0.75, fbmR(p * 0.8 + 3.0)));
          roche *= 0.82 + 0.18 * hachR(floor(p * 55.0));                       // le grain
          roche *= 0.90 + 0.10 * bruitR(p * 6.0);
          float fissures = 1.0 - smoothstep(0.0, 0.05, abs(fbmR(p * 2.6 + 9.0) - 0.47));   // lignes sombres
          roche *= 1.0 - 0.55 * fissures;
          // algues sur les faces tournées vers la lumière ; corallines roses sur les flancs
          float algues = smoothstep(0.35, 0.8, nMonde.y) * smoothstep(0.52, 0.72, fbmR(p * 1.7 + 5.0));
          float corail = (1.0 - algues) * smoothstep(0.66, 0.80, fbmR(p * 3.1 + 11.0)) * smoothstep(-0.2, 0.3, nMonde.y);
          roche = mix(roche, vec3(0.13, 0.19, 0.10) * (0.8 + 0.4 * bruitR(p * 20.0)), algues);
          roche = mix(roche, vec3(0.42, 0.25, 0.30), 0.85 * corail);
          diffuseColor.rgb *= roche;
          vAlguesR = algues;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.85, 0.55, vAlguesR) * (0.9 + 0.1 * bruitR(vPosMondeR * 9.0));`)
      // l'algues est calculée dans color_fragment (avant roughnessmap_fragment dans le shader standard) :
      .replace('#include <common>', '#include <common>\nfloat vAlguesR = 0.0;');
  };
  materiau.customProgramCacheKey = () => 'roche';
  appliquerCaustiques(materiau, 0.8);
  return materiau;
}

export function creerRochers(scene) {
  const materiau = creerMateriau();
  const liste = [];
  ROCHERS.forEach(([x, z, rayon], i) => {
    const rocher = new THREE.Mesh(geometrieRocher(4, i * 7.3), materiau);
    const ecrase = 0.62 + 0.25 * hachage(i, 1);
    rocher.scale.set(rayon * (0.85 + 0.3 * hachage(i, 2)), rayon * ecrase, rayon * (0.85 + 0.3 * hachage(i, 3)));
    rocher.position.set(x, BASSIN.sol + hauteurSable(x, z) + rayon * ecrase * 0.22, z);
    rocher.rotation.y = hachage(i, 4) * Math.PI * 2;
    rocher.castShadow = rocher.receiveShadow = true;
    scene.add(rocher);
    liste.push({ x, z, rayon, objet: rocher });
  });

  // Les cailloux : 90 galets instanciés au premier plan, jamais sur un rocher
  const NB = 90;
  const galet = new THREE.InstancedMesh(geometrieRocher(2, 42.0), materiau, NB);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let n = 0, essais = 0;
  while (n < NB && essais++ < 2000) {
    const x = (hachage(essais, 11) - 0.5) * 40, z = -3 - hachage(essais, 12) * 24;
    const r = 0.10 + 0.35 * hachage(essais, 13) ** 2;
    if (liste.some((ro) => Math.hypot(ro.x - x, ro.z - z) < ro.rayon * 1.3)) continue;
    e.set(hachage(essais, 14) * 0.6, hachage(essais, 15) * 6.28, hachage(essais, 16) * 0.6);
    q.setFromEuler(e);
    s.set(r * (0.8 + 0.4 * hachage(essais, 17)), r * (0.55 + 0.3 * hachage(essais, 18)), r);
    p.set(x, BASSIN.sol + hauteurSable(x, z) + s.y * 0.35, z);
    galet.setMatrixAt(n++, m.compose(p, q, s));
  }
  galet.count = n;
  galet.castShadow = galet.receiveShadow = true;
  scene.add(galet);
  return liste;
}
