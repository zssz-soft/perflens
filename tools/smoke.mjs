import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';
import { evaluate } from '../core/rules/engine.ts';
import { parseSession } from '../core/session.ts';

/** PerfLens füstteszt — állításokat ír ki (`✓`/`✗`), nem számokat.
 *
 *  FIXTURE-ÖK: determinisztikus tesztlapok, pontosan TUDOTT terheléssel. Az
 *  ügynöknek PONTOSAN azt kell megszámolnia, amit a lap előállított
 *  (3 × 120 ms = 3 hosszú task, 87 üzenet = 87). A `quiet.html` a hamis
 *  pozitív őr: ott mindennek nullának kell lennie.
 *
 *  BEÁGYAZOTT DASHBOARD: a kiterjesztés NÉLKÜLI út — csukva indul, kinyitva
 *  rajzol, a szabálymotor csak kérésre fut, és a mentése ugyanaz a
 *  `perflens/1` munkamenet, amit a panel és a diff-kapu is elfogad.
 *
 *  Az ügynököt `addInitScript`-tel töltjük be — a dokumentum előtt, ahogy a
 *  kiterjesztés MAIN-world content scriptje is (`document_start`).
 *
 *      node tools/smoke.mjs [--part=fixtures|embed] */

const PART = process.argv.find((a) => a.startsWith('--part='))?.split('=')[1];
const FIX_PORT = 4332, FIX_WS_PORT = 8332, EMBED_PORT = 4334;

execFileSync('node', ['build.mjs'], { stdio: 'inherit' });

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const serveFixtures = (port) => createServer((req, res) => {
  const p = join('fixtures', (req.url ?? '/').split('?')[0]);
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(port);

// ════════════════════════════════════════════════════════════ FIXTURE-ÖK

async function fixtures() {
  const http = serveFixtures(FIX_PORT);
  // A ws-burst szervere: pontosan n db, size bájtos üzenet, window ms alatt.
  const wss = new WebSocketServer({ port: FIX_WS_PORT });
  wss.on('connection', (sock, req) => {
    const q = new URL(req.url ?? '/', 'http://x').searchParams;
    const n = Number(q.get('n')), size = Number(q.get('size')), win = Number(q.get('window'));
    const payload = 'x'.repeat(size);
    for (let i = 0; i < n; i++) setTimeout(() => sock.send(payload), (win * i) / n);
  });

  const browser = await chromium.launch();
  const run = async (path, interact) => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript({ path: 'dist/agent.js' });
    await page.goto(`http://127.0.0.1:${FIX_PORT}/${path}`);
    await page.waitForFunction(() => '__perfLens' in window && 'run' in window);
    // A run() RENDES taskban indul (setTimeout) — nem az evaluate törzsében.
    await page.evaluate(() => { window.__perfLens.start(); setTimeout(window.run, 0); });
    if (interact) await interact(page);
    await page.waitForFunction(() => window.__fixture.done, null, { timeout: 15_000 });
    const r = await page.evaluate(() => ({
      s: window.__perfLens.stop(), events: window.__perfLens.events(), buckets: window.__perfLens.buckets(),
      threads: window.__perfLens.threads(), sources: window.__perfLens.sources(),
    }));
    await page.close();
    check('nincs JS-hiba a lapon', errors.length === 0, errors.slice(0, 2).join(' | '));
    r.findings = evaluate(r);
    r.rule = (id) => r.findings.filter((f) => f.ruleId === id);
    return r;
  };

  try {
    console.log('\nfixture: long-task.html?ms=120&count=3');
    {
      const { s, events, sources, rule } = await run('long-task.html?ms=120&count=3&gap=300');
      check('pontosan 3 hosszú task', s.longTaskCount === 3, `${s.longTaskCount}`);
      check('a leghosszabb ≥ 120 ms', s.longTaskMaxMs >= 120, `${s.longTaskMaxMs} ms`);
      check('pontosan 3 LoAF', s.loafCount === 3, `${s.loafCount}`);
      const loafs = events.filter((e) => e.kind === 'loaf');
      const attributed = loafs.filter((l) => events.some((e) => e.kind === 'script' && e.parent === l.id
        && e.label === 'user-callback' && sources[e.source]?.fn === 'step'));
      check('mindhárom LoAF-nak van `step` nevű, user-callback script-gyermeke', attributed.length === 3, `${attributed.length}/3`);
      check('szabály: pontosan 3 `long-task` lelet', rule('long-task').length === 3, `${rule('long-task').length}`);
    }

    for (const kind of ['dedicated', 'shared']) {
      console.log(`\nfixture: worker-burst.html?kind=${kind}&n=87`);
      const { s, events, threads, rule } = await run(`worker-burst.html?kind=${kind}&n=87&window=100`);
      check('pontosan 87 bejövő worker-üzenet', s.workerIn === 87, `${s.workerIn}`);
      check('pontosan 1 kimenő (a hello)', s.workerOut === 1, `${s.workerOut}`);
      check('a MessageChannel-zaj (20 üzenet) NEM számít bele', s.workerIn === 87 && s.workerOut === 1);
      const th = new Set(events.filter((e) => e.kind === 'worker-msg-in').map((e) => e.thread));
      check(`minden üzenet egy ${kind} szálhoz kötve`, th.size === 1 && threads[[...th][0]]?.kind === kind,
        [...th].map((i) => threads[i]?.kind).join(','));
      check('szabály: `worker-msg-burst` szól (87 üzenet 100 ms alatt)', rule('worker-msg-burst').length >= 1, `${rule('worker-msg-burst').length}`);
    }

    console.log('\nfixture: ws-burst.html?n=50&size=512');
    {
      const { s } = await run(`ws-burst.html?n=50&size=512&window=1000&ws=ws://127.0.0.1:${FIX_WS_PORT}`);
      check('pontosan 50 WS-üzenet', s.wsMessages === 50, `${s.wsMessages}`);
      check('pontosan 25 600 bájt', s.wsBytes === 25_600, `${s.wsBytes}`);
    }

    console.log('\nfixture: interaction.html?ms=120');
    {
      const { s: sum, rule } = await run('interaction.html?ms=120', (page) => page.click('#b'));
      check('pontosan 1 interakció', sum.interactions === 1, `${sum.interactions}`);
      check('INP ≥ 120 ms', sum.inp >= 120, `${sum.inp} ms`);
      check('a kezelő hosszú taskot okozott', sum.longTaskCount >= 1, `${sum.longTaskCount}`);
      check('szabály: `interaction-then-work` kritikus',
        rule('interaction-then-work').length === 1 && rule('interaction-then-work')[0].severity === 'critical');
      check('szabály: `slow-interaction` (100–200 ms → figyelmeztetés)',
        rule('slow-interaction').length === 1 && rule('slow-interaction')[0].severity === 'warn');
    }

    console.log('\nfixture: quiet.html — hamis pozitív őr');
    {
      const { s, findings } = await run('quiet.html');
      const zero = { longTaskCount: s.longTaskCount, loafCount: s.loafCount, workerIn: s.workerIn, wsMessages: s.wsMessages, interactions: s.interactions };
      check('minden nulla', Object.values(zero).every((v) => v === 0), JSON.stringify(zero));
      check('szabály: NULLA riasztás (info megengedett)', findings.every((f) => f.severity === 'info'), `${findings.length} lelet`);
    }
  } finally {
    await browser.close();
    wss.close();
    http.close();
  }
}

// ═══════════════════════════════════════════════ BEÁGYAZOTT DASHBOARD

async function embed() {
  const http = serveFixtures(EMBED_PORT);
  const browser = await chromium.launch();
  try {
    console.log('\nbeágyazott dashboard: long-task.html (kiterjesztés nélkül)');
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Egyetlen fájl: ügynök + felület. Ez az, amit egy dev build betölt,
    // vagy amit DevTools-snippetként be lehet illeszteni.
    await page.addInitScript({ path: 'dist/devtool.js' });
    await page.goto(`http://127.0.0.1:${EMBED_PORT}/long-task.html?ms=120&count=3&gap=300`);
    await page.waitForFunction(() => '__perfLens' in window && '__perfLensUI' in window);

    check('a keret a lapon van', await page.locator('[data-perflens="embed"]').count() === 1);
    check('csukva indul — mérés alatt nem rajzol', !(await page.locator('.pl-body').isVisible()));

    await page.evaluate(() => { window.__perfLens.start(); setTimeout(window.run, 0); });
    await page.waitForFunction(() => window.__fixture.done, null, { timeout: 15_000 });

    // A gombok a shadow DOM-ban vannak — a Playwright CSS-motorja átlátja.
    const btn = (re) => page.getByRole('button', { name: re });
    await btn(/Kinyitás|Expand/).click();
    check('kinyitva látszik a törzs', await page.locator('.pl-body').isVisible());
    const bands = await page.locator('.band').count();
    check('mind a 8 sáv kirajzolódott', bands === 8, `${bands}`);
    const idle = (await page.locator('.pl-body .empty').first().textContent()) ?? '';
    check('a szabálymotor élőben NEM fut', /Kiértékelés|Evaluate/.test(idle), idle.slice(0, 54));

    await btn(/Kiértékelés|Evaluate/).click();
    const titles = await page.locator('.finding .ftitle').allTextContents();
    check('kiértékelésre megjön a 3 hosszú feladat', titles.filter((x) => /Hossz|Long/.test(x)).length === 3, titles.slice(0, 4).join(' | '));

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      btn(/Mentés|Save/).click(),
    ]);
    const saved = readFileSync(await download.path(), 'utf-8');
    let session = null, why = '';
    try { session = parseSession(saved); } catch (e) { session = null; why = e.message; }
    check('a mentett JSON ugyanaz a séma — a panel és a diff is beolvassa', !!session,
      session ? `${session.schema} · ${session.findings.length} lelet · ${session.context.mode}` : why);
    check('a munkamenetben ott a mért 3 hosszú task', session?.summary?.longTaskCount === 3, `longTaskCount=${session?.summary?.longTaskCount}`);

    await btn(/Összecsukás|Collapse/).click();
    check('összecsukva eltűnik a törzs', !(await page.locator('.pl-body').isVisible()));
    check('nincs JS-hiba a lapon', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  } finally {
    await browser.close();
    http.close();
  }
}

if (!PART || PART === 'fixtures') await fixtures();
if (!PART || PART === 'embed') await embed();

console.log(failed ? `\n${failed} állítás bukott.` : '\nMinden állítás teljesült.');
process.exit(failed ? 1 : 0);
