/* ============================================
   CHROME — piloter Chrome headless par le protocole DevTools
   ============================================
   Bibliothèque partagée par capture.mjs et les scénarios de test.
   Le mode `chrome --screenshot` fige la page avant de la photographier (pas de
   requestAnimationFrame) : ici la page VIT, on peut attendre, bouger la souris,
   évaluer du JS dedans, lire sa console, puis capturer.
   ============================================ */
import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function piloter({ largeur = 1440, hauteur = 900 } = {}) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profil = await mkdtemp(path.join(tmpdir(), 'shinka-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, '--no-first-run',
    '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    `--window-size=${largeur},${hauteur}`, '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  let onglets = null;
  for (let i = 0; i < 60 && !onglets; i++) {
    try { onglets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); }
    catch { await dormir(250); }
  }
  if (!onglets) { chrome.kill(); throw new Error('Chrome ne répond pas sur le port de debug'); }

  const page = onglets.find((o) => o.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });

  let compteur = 0;
  const enAttente = new Map();
  const envoyer = (method, params = {}) => new Promise((r) => {
    const id = ++compteur;
    enAttente.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const texte = (arg) => (arg.value !== undefined ? String(arg.value) : (arg.description ?? arg.type));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && enAttente.has(m.id)) { enAttente.get(m.id)(m.result ?? m.error); enAttente.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') console.log(`  [${m.params.type}] ${m.params.args.map(texte).join(' ')}`);
    if (m.method === 'Runtime.exceptionThrown') console.log(`  [EXCEPTION] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  };
  await envoyer('Runtime.enable');
  await envoyer('Page.enable');
  await envoyer('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: false });

  return {
    envoyer,
    async naviguer(url) { console.log(`→ ${url}`); await envoyer('Page.navigate', { url }); },
    /** Évalue une expression dans la page et renvoie sa valeur (JSON). */
    async evaluer(expression) {
      const r = await envoyer('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'erreur dans la page');
      return r.result.value;
    },
    async souris(x, y) { await envoyer('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); },
    async capturer(sortie) {
      const { data } = await envoyer('Page.captureScreenshot', { format: 'png' });
      await writeFile(sortie, Buffer.from(data, 'base64'));
      console.log(`✓ ${sortie}`);
    },
    async fermer() {
      ws.close();
      // Attendre que Chrome soit vraiment sorti : sinon il écrit encore dans son profil
      // pendant qu'on l'efface (ENOTEMPTY)
      const sorti = new Promise((r) => chrome.once('exit', r));
      chrome.kill();
      await Promise.race([sorti, dormir(4000)]);
      for (let essai = 0; essai < 5; essai++) {
        try { await rm(profil, { recursive: true, force: true }); break; }
        catch { await dormir(300); }
      }
    },
  };
}
