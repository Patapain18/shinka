/* ============================================
   CAUSTIQUES — la lumière qui danse, partagée par tout le monde
   ============================================
   Les caustiques, c'est la surface ondulée qui concentre la lumière du soleil
   en filaments mouvants. Ici : UNE fonction GLSL, un seul jeu d'uniforms, et un
   hook qui greffe cette lumière dans n'importe quel matériau standard de Three
   (le sable, les rochers, la peau des animaux) — via onBeforeCompile, donc en
   gardant les ombres, le brouillard, les reflets du matériau.

   Le motif : deux couches de Voronoï dont on éclaire les FRONTIÈRES (là où deux
   cellules sont à égale distance), à des échelles et des vitesses différentes,
   affûtées par une puissance ; et une petite dispersion chromatique (les canaux
   rouge et bleu lisent le motif un peu décalé) — les vrais caustiques ont ces
   franges colorées. Une modulation lente « par plaques » : la lumière n'arrive
   pas partout à la fois.
   ============================================ */
import * as THREE from 'three';

/** Uniforms partagés : un seul objet, référencé par tous les programmes. */
export const uniformsCaustiques = {
  uTemps:             { value: 0 },
  uCausticsIntensite: { value: 0.75 },                    // ×(facteur du jour) par daytime.js
  uCausticsCouleur:   { value: new THREE.Color(0x9fdcff) },
};

export const CAUSTIQUES_GLSL = /* glsl */`
  uniform float uTemps;
  uniform float uCausticsIntensite;
  uniform vec3  uCausticsCouleur;

  vec2 hachageC(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }
  // 1 sur une frontière entre deux cellules de Voronoï, 0 au centre d'une cellule
  float frontieres(vec2 p, float t) {
    vec2 cellule = floor(p);
    vec2 local = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 voisine = vec2(float(x), float(y));
        vec2 h = hachageC(cellule + voisine);
        vec2 centre = voisine + 0.5 + 0.38 * sin(t + 6.2831 * h);
        vec2 ecart = local - centre;
        float d = dot(ecart, ecart);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    float f = sqrt(d2) - sqrt(d1);
    return pow(1.0 - smoothstep(0.0, 0.30, f), 2.0);
  }
  float caustique(vec2 p, float t) {
    float c = 0.62 * frontieres(p * 0.55, t * 0.45) + 0.38 * frontieres(p * 1.35 + 7.3, t * 0.7);
    float plaques = 0.35 + 0.65 * (0.5 + 0.5 * sin(p.x * 0.17 + t * 0.12) * sin(p.y * 0.13 - t * 0.09));
    return pow(c, 1.6) * plaques;
  }
  // dispersion : rouge et bleu lisent le motif un peu décalé → franges colorées
  vec3 caustiquesRGB(vec2 p, float t) {
    float k = 0.018;
    return vec3(caustique(p + vec2(k, 0.0), t), caustique(p, t), caustique(p - vec2(k, k), t));
  }
`;

/**
 * Greffe les caustiques dans un matériau standard de Three : la lumière s'ajoute
 * sur les surfaces tournées vers le haut, et pas dans l'ombre portée.
 * force : multiplicateur propre à ce matériau (1 = plein).
 */
export function appliquerCaustiques(materiau, force = 1.0) {
  const precedent = materiau.onBeforeCompile;
  const cle = materiau.customProgramCacheKey ? materiau.customProgramCacheKey() : '';
  materiau.onBeforeCompile = (shader, renderer) => {
    if (precedent) precedent(shader, renderer);
    shader.uniforms.uTemps = uniformsCaustiques.uTemps;
    shader.uniforms.uCausticsIntensite = uniformsCaustiques.uCausticsIntensite;
    shader.uniforms.uCausticsCouleur = uniformsCaustiques.uCausticsCouleur;
    shader.uniforms.uCausticsForce = { value: force };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosMondeC;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 pC = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            pC = instanceMatrix * pC;                    // un banc : chaque sardine a sa matrice
          #endif
          vPosMondeC = (modelMatrix * pC).xyz;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosMondeC;\nuniform float uCausticsForce;\n' + CAUSTIQUES_GLSL)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float ombreC = 1.0;
          #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
            ombreC = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity,
                               directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
          #endif
          vec3 nMondeC = inverseTransformDirection(normal, viewMatrix);
          float versLeHaut = smoothstep(-0.15, 0.55, nMondeC.y);
          vec3 caustC = caustiquesRGB(vPosMondeC.xz, uTemps);
          // au loin, le motif devient plus fin que les pixels (moiré) : on le fond vers sa moyenne
          float loinC = smoothstep(16.0, 40.0, distance(vPosMondeC, cameraPosition));
          caustC = mix(caustC, vec3(0.30), loinC) * uCausticsCouleur * (uCausticsIntensite * uCausticsForce);
          reflectedLight.directDiffuse += diffuseColor.rgb * caustC * versLeHaut * ombreC;
        }`);
  };
  materiau.customProgramCacheKey = () => cle + '|caustiques' + force;
  materiau.needsUpdate = true;
  return materiau;
}
