import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

/** A PerfLens fordítása. Minifikálás NINCS: fejlesztői eszköz, a lapon
 *  olvashatónak kell lennie, ha valaki a DevTools-ban belenéz.
 *
 *  Kimenet:
 *    dist/agent.js        az ügynök — csak a mérés, felület nélkül
 *    dist/devtool.js      ügynök + a LAPBA ágyazott dashboard, egy fájlban
 *    dist/extension/      a kiterjesztés — „Kicsomagolt bővítmény betöltése"
 *    dist/extension-test/ ugyanaz, loopback host-engedéllyel (füstteszt)
 *
 *  App-tudatos módhoz (saját adapterrel) készíts egy belépési pontot a
 *  `agent/sportsbook.ts` mintájára, és fordítsd azt az `agent/index.ts`
 *  helyett — a mag és a felület változatlan marad.
 *
 *      node build.mjs */

const common = { bundle: true, target: 'es2022', logLevel: 'warning', legalComments: 'none' };
const EXT = 'dist/extension';

await build({ ...common, entryPoints: ['agent/index.ts'], format: 'iife', outfile: 'dist/agent.js' });
await build({ ...common, entryPoints: ['devtool/index.ts'], format: 'iife', outfile: 'dist/devtool.js' });

// Takarítás: egy átnevezett vagy áthelyezett fájl régi példánya különben
// bent maradna a betöltött kiterjesztésben.
rmSync(EXT, { recursive: true, force: true });
mkdirSync(EXT, { recursive: true });
await build({ ...common, entryPoints: ['extension/background.ts'], format: 'esm', outfile: `${EXT}/background.js` });
await build({
  ...common, format: 'iife', outdir: EXT,
  entryPoints: {
    relay: 'extension/relay.ts', popup: 'extension/popup.ts',
    panel: 'extension/panel.ts', devtools: 'extension/devtools.ts',
  },
});
cpSync('dist/agent.js', `${EXT}/agent.js`);
for (const f of ['manifest.json', 'popup.html', 'panel.html', 'devtools.html']) cpSync(`extension/${f}`, `${EXT}/${f}`);
cpSync('extension/_locales', `${EXT}/_locales`, { recursive: true });

// A füstteszt nem tud a böngésző engedély-párbeszédére kattintani; a valódi
// kiterjesztés host-engedélye üres, a teszt-buildé a loopback.
const TEST = 'dist/extension-test';
cpSync(EXT, TEST, { recursive: true });
const m = JSON.parse(readFileSync(`${EXT}/manifest.json`, 'utf-8'));
m.name += ' — TESZT (loopback)';
m.host_permissions = ['http://127.0.0.1/*'];
writeFileSync(`${TEST}/manifest.json`, JSON.stringify(m, null, 2));

console.log('dist: agent.js, devtool.js, extension/, extension-test/ kész');
