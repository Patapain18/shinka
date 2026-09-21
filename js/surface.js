/* ============================================
   SURFACE — le plafond d'eau, vu d'en dessous
   ============================================
   Ce qu'on voit quand on lève les yeux sous l'eau : une nappe qui ondule, très
   lumineuse juste au-dessus de soi et de plus en plus sombre vers l'horizon.
   Deux phénomènes, écrits dans le shader :
   - la FENÊTRE DE SNELL : sous un angle raide, la surface laisse passer le ciel
     (clair) ; au-delà de l'angle critique (~49°), elle se comporte en miroir et
     ne renvoie que l'eau sombre (réflexion totale) ;
   - le SCINTILLEMENT : des vaguelettes (somme de sinus dirigés + bruit) dont les
     normales, quand elles regardent le soleil, allument des éclats.
   Le brouillard fait le reste : la surface s'efface avec la distance.
   ============================================ */
import * as THREE from 'three';
import { BASSIN } from './scene.js';

const HAUTEUR = 7.5;                 // la surface, en mètres (la caméra est à 1,6 m)

const VERTEX = /* glsl */`
  varying vec3 vPosMonde;
  #include <fog_pars_vertex>
  void main() {
    vPosMonde = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAGMENT = /* glsl */`
  uniform float uTemps;
  uniform float uIntensite;
  uniform vec3  uCiel;
  uniform vec3  uEau;
  uniform vec3  uSoleil;
  varying vec3  vPosMonde;
  #include <fog_pars_fragment>

  float hachSf(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float bruitSf(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hachSf(i), hachSf(i + vec2(1, 0)), f.x), mix(hachSf(i + vec2(0, 1)), hachSf(i + vec2(1, 1)), f.x), f.y);
  }
  // hauteur des vaguelettes et sa pente : quatre trains d'ondes + un bruit qui dérive
  vec2 penteVagues(vec2 p, float t) {
    vec2 pente = vec2(0.0);
    vec2 dirs[4]; dirs[0] = vec2(1.0, 0.3); dirs[1] = vec2(-0.5, 1.0); dirs[2] = vec2(0.8, -0.9); dirs[3] = vec2(0.2, 1.0);
    float longs[4]; longs[0] = 1.6; longs[1] = 0.9; longs[2] = 0.55; longs[3] = 2.8;
    float amps[4]; amps[0] = 0.014; amps[1] = 0.008; amps[2] = 0.004; amps[3] = 0.022;
    for (int i = 0; i < 4; i++) {
      vec2 d = normalize(dirs[i]);
      float k = 6.2831 / longs[i];
      float w = sqrt(9.81 * k);                                   // relation de dispersion des vagues
      pente += amps[i] * k * cos(dot(p, d) * k - w * t) * d;
    }
    float e = 0.15;
    vec2 pb = p * 0.7 + vec2(0.05, 0.03) * t;
    pente += 0.025 * vec2(bruitSf(pb + vec2(e, 0)) - bruitSf(pb - vec2(e, 0)), bruitSf(pb + vec2(0, e)) - bruitSf(pb - vec2(0, e))) / (2.0 * e);
    return pente;
  }

  void main() {
    vec3 V = normalize(vPosMonde - cameraPosition);               // de l'œil vers la surface (monte)
    vec2 pente = penteVagues(vPosMonde.xz, uTemps);
    vec3 nHaut = normalize(vec3(-pente.x, 1.0, -pente.y));         // normale de la surface, vers le ciel
    float cosI = max(dot(V, nHaut), 0.0);                          // 1 = on regarde droit vers le haut
    // fenêtre de Snell : transmission du ciel sous incidence raide, miroir sombre au-delà
    float fenetre = smoothstep(0.38, 0.92, cosI);                 // transition large : pas de bascule brutale
    vec3 reflet = uEau * 1.25;
    // le ciel vu à travers : sa clarté ondule doucement (la réfraction concentre et disperse)
    float ondes = 0.80 + 0.20 * bruitSf(vPosMonde.xz * 0.9 + vec2(0.06, -0.04) * uTemps);
    vec3 couleur = mix(reflet, uCiel * ondes, fenetre);
    // les éclats du soleil : là où la pente renvoie le soleil vers nous (miroir sous la surface)
    vec3 R = reflect(V, -nHaut);
    float eclat = pow(max(dot(R, -normalize(uSoleil)), 0.0), 60.0);
    couleur += uCiel * eclat * 0.5 * (0.4 + 0.6 * fenetre);
    // de grandes plages lentes : la houle module la clarté
    float plages = 0.80 + 0.20 * sin(vPosMonde.x * 0.09 + uTemps * 0.10) * sin(vPosMonde.z * 0.07 - uTemps * 0.08);
    gl_FragColor = vec4(couleur * uIntensite * plages, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function creerSurface(scene, soleil) {
  const materiau = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTemps:     { value: 0 },
      uIntensite: { value: 0.55 },
      uCiel:      { value: new THREE.Color(0x8fd0ff) },
      uEau:       { value: new THREE.Color(BASSIN.couleurEau) },
      uSoleil:    { value: new THREE.Vector3(0, -1, 0) },
    }]),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
    side: THREE.BackSide,                // vue de dessous
  });
  const geometrie = new THREE.PlaneGeometry(300, 300, 1, 1);
  geometrie.rotateX(-Math.PI / 2);
  const surface = new THREE.Mesh(geometrie, materiau);
  surface.position.set(0, HAUTEUR, -40);
  scene.add(surface);
  const base = materiau.uniforms.uIntensite.value;
  const direction = new THREE.Vector3();
  return {
    maj(temps) {
      materiau.uniforms.uTemps.value = temps;
      // la direction dans laquelle le soleil ÉCLAIRE (de la lampe vers sa cible)
      direction.subVectors(soleil.target.position, soleil.position).normalize();
      materiau.uniforms.uSoleil.value.copy(direction);
      materiau.uniforms.uEau.value.copy(scene.fog.color);
    },
    regler(facteur) { materiau.uniforms.uIntensite.value = base * facteur; },
  };
}
