/* ============================================
   RENDU — le post-processing : bloom et « vitre »
   ============================================
   Sans post-processing, la scène est dessinée directement à l'écran. Avec,
   elle est dessinée dans une image intermédiaire, que des « passes »
   retravaillent avant l'affichage :
     RenderPass      → la scène telle quelle
     UnrealBloomPass → les zones brillantes bavent un peu (rayons, méduses la nuit)
     ShaderPass      → la vitre : aberration chromatique aux bords, un reflet
                       oblique qui glisse avec la parallaxe, vignette, grain
     OutputPass      → tone mapping + conversion sRGB (le renderer ne le fait
                       plus lui-même quand on dessine dans une image intermédiaire)
   Coûteux sur une petite carte graphique : qualite.js peut le couper.
   ============================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VITRE = {
  uniforms: {
    tDiffuse: { value: null },                   // l'image à retravailler (fournie par le composer)
    uTemps:   { value: 0 },
    uSouris:  { value: new THREE.Vector2() },
    uForce:   { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTemps;
    uniform vec2  uSouris;
    uniform float uForce;
    varying vec2  vUv;

    float hachage(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 centre = vUv - 0.5;
      float d = length(centre);

      // Aberration chromatique : les trois canaux s'écartent un peu vers les bords,
      // comme à travers une vitre épaisse
      vec2 ecart = centre * d * 0.012 * uForce;
      vec3 c = vec3(texture2D(tDiffuse, vUv + ecart).r,
                    texture2D(tDiffuse, vUv).g,
                    texture2D(tDiffuse, vUv - ecart).b);

      // Un reflet : une bande claire oblique, très faible, qui glisse avec la parallaxe
      float bande = 1.0 - abs((vUv.x - vUv.y * 0.35 + 0.15 - uSouris.x * 0.08) - 0.55) * 6.0;
      c += smoothstep(0.0, 1.0, bande) * 0.010 * uForce;

      // Vignette : les bords s'assombrissent
      c *= 1.0 - smoothstep(0.35, 0.95, d) * 0.45 * uForce;

      // Grain de film, différent à chaque image
      c += (hachage(vUv * 900.0 + fract(uTemps)) - 0.5) * 0.018 * uForce;

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export function creerRendu(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.5, 0.85);   // force, rayon, seuil
  composer.addPass(bloom);
  const vitre = new ShaderPass(VITRE);
  composer.addPass(vitre);
  composer.addPass(new OutputPass());

  let actif = true;

  return {
    get actif() { return actif; },
    activer(oui) { actif = oui; },
    rendre(dt, temps, souris) {
      if (!actif) { renderer.render(scene, camera); return; }   // rendu direct : le renderer fait le tone mapping
      vitre.uniforms.uTemps.value = temps;
      vitre.uniforms.uSouris.value.copy(souris);
      composer.render(dt);
    },
    redimensionner() {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(window.innerWidth, window.innerHeight);
    },
  };
}
