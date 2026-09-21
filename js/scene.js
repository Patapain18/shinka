/* ============================================
   SCENE — le bassin vide
   ============================================
   Ce module crée et exporte tout ce qui est « le décor » :
   renderer, caméra, lumières, brouillard, rochers. (L'eau : sol, rayons,
   particules — vit dans water.js.)
   Il ne sait rien des animaux, de la souris ou de l'UI : c'est main.js
   qui orchestre. Règle du projet : un module = une responsabilité.
   ============================================ */

import * as THREE from 'three';

/* ---------- Repères du bassin (en mètres, voir DESIGN.md §3) ---------- */
export const BASSIN = {
  hauteurYeux: 1.6,      // la caméra est à hauteur d'un humain debout
  sol: -3,               // le sable
  couleurEau: 0x03111d,  // bleu très profond : c'est AUSSI la couleur du brouillard
  densiteBrume: 0.055,   // plus c'est grand, plus vite les objets disparaissent au loin
};

/* ---------- 1) Renderer : le moteur qui dessine dans le canvas ---------- */
// C'est une FONCTION et pas une constante, contrairement au reste du module :
// créer un renderer peut ÉCHOUER (vieux PC, GPU désactivé, navigateur bridé).
// main.js l'appelle dans un try/catch et affiche un message propre en cas d'échec.
// Tout le reste (scène, caméra, lumières) n'a pas besoin de WebGL pour exister.
export function creerRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  // Sur un écran Retina, devicePixelRatio = 2 → 4 fois plus de pixels à calculer.
  // On plafonne à 1.5 : quasi invisible à l'œil, énorme gain de perf.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Le tone mapping compresse les hautes lumières comme une pellicule photo :
  // les futurs rayons de lumière pourront « brûler » sans virer au blanc plat.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

/* ---------- 2) Scène + brouillard ---------- */
export const scene = new THREE.Scene();
scene.background = new THREE.Color(BASSIN.couleurEau);
// FogExp2 = brouillard exponentiel : la visibilité baisse doucement, puis très vite.
// C'est LUI qui fabrique la profondeur : un objet à 25 m n'est plus qu'une
// silhouette, à 40 m il a disparu. Le fond du bassin n'existe pas — c'est de la brume.
scene.fog = new THREE.FogExp2(BASSIN.couleurEau, BASSIN.densiteBrume);

/* ---------- 3) Caméra : un humain debout devant la vitre ---------- */
export const camera = new THREE.PerspectiveCamera(
  55,                                       // angle de vue vertical, en degrés
  window.innerWidth / window.innerHeight,   // ratio largeur / hauteur
  0.1,                                      // on ne dessine rien à moins de 10 cm…
  120                                       // …ni au-delà de 120 m (la brume a tout mangé bien avant)
);
camera.position.set(0, BASSIN.hauteurYeux, 0);
// Le point que la caméra fixe. On le garde en mémoire : la parallaxe déplacera
// la caméra, mais elle continuera de regarder CE point-là.
export const pointRegarde = new THREE.Vector3(0, BASSIN.hauteurYeux - 0.4, -12);
camera.lookAt(pointRegarde);

/* ---------- 4) Lumières ---------- */
// Le soleil filtré par 6 m d'eau : bleuté, vient d'en haut, un peu de face.
const soleil = new THREE.DirectionalLight(0x9fd4ff, 2.6);
soleil.position.set(2, 14, -6);
scene.add(soleil);

// Lumière d'ambiance à deux couleurs : « ciel » (bleu sombre) en haut, « sol » (noir) en bas.
// Sans elle, tout ce qui n'est pas face au soleil serait d'un noir absolu.
const ambiance = new THREE.HemisphereLight(0x0e3a5c, 0x000000, 0.9);
scene.add(ambiance);

// Exportées pour daytime.js, qui les fait varier avec l'heure
export const lumieres = { soleil, ambiance };

/* ---------- 5) Des rochers, pour donner des repères de profondeur ---------- */
// Sans objets étagés en distance, le brouillard n'a rien à révéler.
// IcosahedronGeometry(rayon, 1) : une boule à 80 facettes, parfaite en rocher low-poly.
const materiauRoche = new THREE.MeshStandardMaterial({
  color: 0x14242e,
  roughness: 0.95,
  flatShading: true,             // garde les facettes visibles au lieu de les lisser
});

const ROCHERS = [
  // [x, z, rayon] — étagés de 8 m à 35 m pour « lire » la profondeur
  [-7,  -8, 1.1], [ 9, -11, 1.6], [-14, -16, 2.2], [ 4, -19, 1.3],
  [15, -24, 2.8], [-6, -27, 1.9], [ 22, -32, 3.5], [-20, -35, 3.0],
];

for (const [x, z, rayon] of ROCHERS) {
  const rocher = new THREE.Mesh(new THREE.IcosahedronGeometry(rayon, 1), materiauRoche);
  rocher.scale.set(1, 0.6 + Math.random() * 0.3, 1);          // un peu écrasé
  rocher.position.set(x, BASSIN.sol + rayon * 0.45, z);        // enfoncé dans le sable
  rocher.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
  scene.add(rocher);
}

/* ---------- 6) Redimensionnement de la fenêtre ---------- */
/* ---------- L'environnement : ce que la peau reflète ---------- */
// Un matériau « standard » reflète son environnement : sans carte d'environnement, un
// métal (l'argent des sardines) ne reflète RIEN et devient noir dans l'eau sombre.
// On fabrique donc une carte minimale : une sphère vue de l'intérieur, claire vers le
// haut (la surface), sombre vers le bas, passée au PMREM (les flous pré-calculés par
// rugosité). Toute peau mouillée y gagne un reflet doux sur le dos.
export function creerEnvironnement(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const monde = new THREE.Scene();
  const geometrie = new THREE.SphereGeometry(50, 32, 16);
  const materiau = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      haut:   { value: new THREE.Color(0x8fc4e6) },      // la surface, lumineuse
      milieu: { value: new THREE.Color(0x0e3c5c) },      // l'horizon sous-marin
      bas:    { value: new THREE.Color(0x02070c) },      // le fond
    },
    vertexShader: /* glsl */`
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 haut, milieu, bas;
      varying vec3 vPos;
      void main() {
        float y = normalize(vPos).y;
        vec3 c = y > 0.0 ? mix(milieu, haut, pow(y, 1.4)) : mix(milieu, bas, pow(-y, 0.8));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  monde.add(new THREE.Mesh(geometrie, materiau));
  const environnement = pmrem.fromScene(monde, 0.04).texture;
  pmrem.dispose(); geometrie.dispose(); materiau.dispose();
  return environnement;
}

export function redimensionner(renderer) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();     // obligatoire après avoir touché aspect ou fov
  renderer.setSize(window.innerWidth, window.innerHeight);
}
