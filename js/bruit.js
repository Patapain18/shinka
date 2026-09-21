/* ============================================
   BRUIT — du hasard lisse, côté JavaScript
   ============================================
   Le même bruit de valeur que peau.py (Blender), mais en JS : il sert à
   FABRIQUER des formes une fois pour toutes (les dunes du sable, l'érosion
   des rochers). Déterministe : même entrée → même sortie, à chaque visite.
   ============================================ */

/** Entiers → [0, 1). Mélange 32 bits (les débordements sont voulus, d'où Math.imul et >>> 0). */
export function hachage(ix, iy, iz = 0, graine = 0) {
  let h = (Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ Math.imul(iz, 0xcb1ab31f) ^ Math.imul(graine, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return (h & 0xffffff) / 0x1000000;
}

const lisser = (t) => t * t * (3 - 2 * t);

/** Bruit de valeur 2D lisse, dans [-1, 1]. */
export function bruit2(x, y, graine = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = lisser(x - ix), fy = lisser(y - iy);
  const a = hachage(ix, iy, 0, graine), b = hachage(ix + 1, iy, 0, graine);
  const c = hachage(ix, iy + 1, 0, graine), d = hachage(ix + 1, iy + 1, 0, graine);
  return 2 * ((a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy) - 1;
}

/** Bruit de valeur 3D lisse, dans [-1, 1]. */
export function bruit3(x, y, z, graine = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = lisser(x - ix), fy = lisser(y - iy), fz = lisser(z - iz);
  const c = (dx, dy, dz) => hachage(ix + dx, iy + dy, iz + dz, graine);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * fx;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * fx;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * fx;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * fx;
  const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
  return 2 * (y0 + (y1 - y0) * fz) - 1;
}

/** Somme d'octaves : grand relief doux + petit grain. Dans [-1, 1]. */
export function fbm2(x, y, octaves = 4, lacunarite = 2, gain = 0.5, graine = 0) {
  let somme = 0, amplitude = 1, total = 0;
  for (let k = 0; k < octaves; k++) {
    somme += amplitude * bruit2(x, y, graine + 31 * k);
    total += amplitude;
    x = x * lacunarite + 17.31; y = y * lacunarite + 17.31;
    amplitude *= gain;
  }
  return somme / total;
}

export function fbm3(x, y, z, octaves = 4, lacunarite = 2, gain = 0.5, graine = 0) {
  let somme = 0, amplitude = 1, total = 0;
  for (let k = 0; k < octaves; k++) {
    somme += amplitude * bruit3(x, y, z, graine + 31 * k);
    total += amplitude;
    x = x * lacunarite + 17.31; y = y * lacunarite + 17.31; z = z * lacunarite + 17.31;
    amplitude *= gain;
  }
  return somme / total;
}
