import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

/** PerfLens határőr (27-es doksi 4.1, 16.4).
 *
 *  A függőségi szabályok nem stílus kérdései: mindegyik mögött konkrét hiba
 *  áll, amit megelőznek. Ugyanazzal a regexes import-kiolvasással, mint az
 *  `arch-map.mjs` — a meglévő eszközt nem bővítjük.
 *
 *      node tools/perflens-boundary.mjs     # eltérésre 1-es kilépőkód */

const ROOT = process.cwd();
const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === 'node_modules' || n === 'dist' || n === 'www' || n.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(m?ts|tsx|m?js)$/.test(n) && !n.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const importsOf = (file) => [...readFileSync(file, 'utf-8').matchAll(IMPORT_RE)].map((m) => m[1]);
const target = (file, spec) => spec.startsWith('.') ? rel(resolve(dirname(file), spec)) : spec;
const isTest = (f) => /\.test\.m?ts$/.test(f);

const violations = [];
const bad = (file, rule, detail) => violations.push(`${rel(file)}: ${rule}${detail ? ` — ${detail}` : ''}`);

// 1–2. a mag: csak önmagát importálja, és nem ismeri a chrome-ot és a process-t
for (const f of walk('core')) {
  const code = readFileSync(f, 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');   // kommentek nélkül
  for (const spec of importsOf(f)) {
    const t = target(f, spec);
    if (isTest(f) && spec.startsWith('node:')) continue;
    if (!t.startsWith('core/')) bad(f, 'a mag csak a magot importálhatja (4.1)', spec);
  }
  if (!isTest(f) && /\bchrome\s*\./.test(code)) bad(f, 'a mag nem hivatkozhat chrome.*-ra (4.1, 2.3)');
  if (!isTest(f) && /\bprocess\s*\./.test(code)) bad(f, 'a mag nem hivatkozhat process-re (4.1)');
}
// 3. adapterek egymást nem importálják
for (const f of walk('adapters')) {
  const own = rel(f).split('/')[1];
  for (const spec of importsOf(f)) {
    const t = target(f, spec);
    if (t.startsWith('adapters/') && t.split('/')[1] !== own) bad(f, 'adapter nem importálhat másik adaptert (4.1)', spec);
  }
}
// 5. az ügynök a MÉRT lapon fut — az elemzés soha nem kerülhet bele (17.4/9)
for (const f of walk('agent')) for (const spec of importsOf(f)) {
  if (target(f, spec).startsWith('analysis/')) bad(f, 'az ügynökbe nem kerülhet az analysis/ (4.1)', spec);
}
// 5b. a dashboard gazdafüggetlen — később önálló HTML-riportként is futhat
for (const f of walk('dashboard')) for (const spec of importsOf(f)) {
  const t = target(f, spec);
  if (t.startsWith('extension/') || t.startsWith('agent/') || t.startsWith('devtool/')) bad(f, 'a dashboard nem importálhat gazdából (extension/, agent/, devtool/) (4.1)', spec);
}
// 5c. az ügynök NEM hízhat el a felülettel. Ugyanaz az érv, mint az
//     `analysis/`-nál: az ügynök a MÉRT lapon fut, minden kilobájtja a mért
//     számot rontja. A dashboard súlyát csak az veszi magára, aki a
//     `devtool/`-t tölti be — ott ez tudatos csere.
for (const f of walk('agent')) for (const spec of importsOf(f)) {
  const t = target(f, spec);
  if (t.startsWith('dashboard/') || t.startsWith('devtool/')) bad(f, 'az ügynökbe nem kerülhet a felület (dashboard/, devtool/) (4.1)', spec);
}
// 5d. a `devtool/` levél: ő importál, őt senki. Így marad opcionális — a
//     kiterjesztés és a labor útja nem tud véletlenül UI-t behúzni.
for (const dir of ['core', 'adapters', 'agent', 'dashboard', 'extension', 'worker', 'tools']) {
  for (const f of walk(dir)) for (const spec of importsOf(f)) {
    if (target(f, spec).startsWith('devtool/')) bad(f, 'a devtool/ levél — őt nem importálja senki (4.1)', spec);
  }
}
// 6. a labor a magot használja, nem a kiterjesztést
for (const f of walk('tools')) for (const spec of importsOf(f)) {
  if (target(f, spec).startsWith('extension/')) bad(f, 'a tools/ nem importálhat a kiterjesztésből (4.1)', spec);
}
// 7. a HORDOZHATÓ halmaz nem tud az alkalmazásról (4.1). A keretrendszer-
//    adapterek (angular) mennek a maggal; az alkalmazás-adapterről csak a
//    saját belépési pontod tudhat. Ha valaki a generic ügynökbe vagy a magba
//    behúzza az app-adaptert, a hordozhatóság csendben elromlik — ezért gépi
//    szabály.
// Ide kerüljön az ALKALMAZÁS-adapter, ha bekötsz egyet (pl. 'adapters/<app>/'):
// a keretrendszer-adapterek (angular) mehetnek a maggal, az app-tudás nem.
const APP_ADAPTERS = [];
const PORTABLE = ['core', 'dashboard', 'agent/install.ts', 'agent/index.ts',
  'devtool/start.ts', 'devtool/index.ts', 'worker/hooks.ts'];
for (const p of PORTABLE) {
  const files = p.endsWith('.ts') ? (existsSync(p) ? [p] : []) : walk(p);
  if (!files.length) bad(p, 'a kivágható halmaz eleme nem létezik (4.1) — átnevezés után a szabályt is frissítsd');
  for (const f of files) for (const spec of importsOf(f)) {
    const t = target(f, spec);
    if (APP_ADAPTERS.some((a) => t.startsWith(a))) bad(f, 'a kivágható halmaz nem importálhat alkalmazás-adaptert (4.1)', spec);
  }
}

if (violations.length) {
  console.error(`HATÁRSÉRTÉS (${violations.length}):\n  ${violations.join('\n  ')}`);
  process.exit(1);
}
console.log('perflens-boundary: a 4.1 határai rendben.');
