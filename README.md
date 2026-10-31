# PerfLens

Böngésző-oldali teljesítmény-elemző: **élőben** mutatja a hosszú feladatokat,
az INP-t, a képkocka-kieséseket, a worker- és WS-forgalmat, és szabályokkal
kiemeli, ami gyanús. Nem utólag jelent, mint a labor (Playwright) vagy a mező
(RUM-beacon) — akkor mutat, amikor a baj történik.

Csak szabvány böngésző-API-kra épül: **LoAF** (`long-animation-frame`),
`longtask`, Event Timing, `layout-shift`, `PerformanceObserver`. Nincs
függősége; a mag (`core/`) semmit nem importál.

## Két gazda, ugyanaz a mag

|  | Mikor |
|---|---|
| **Chrome-kiterjesztés** (DevTools-panel) | Ha telepíthetsz kicsomagolt bővítményt. Originenként kapcsolható, `<all_urls>` nincs. |
| **A lapba ágyazva** (`devtool/`) | Ha **nem** telepíthetsz — felügyelt (céges) Chrome-ban a „Fejlesztői mód" policyből tiltható. Ez csak forráskód: engedély nem kell hozzá. |

Mindkettő ugyanazt a `perflens/1` munkamenetet menti, tehát a panel betölti a
beágyazott nézet mentését is, és a regresszió-kapu (`npm run diff`) mindkettőt
elfogadja.

## Indulás

```bash
npm install
npm run build          # → dist/agent.js, dist/devtool.js, dist/extension/

# A) kiterjesztés
# chrome://extensions → Fejlesztői mód → „Kicsomagolt bővítmény betöltése"
#   → dist/extension; a popupban „Bekapcsolás ezen az originen"; DevTools → PerfLens

# B) a lapba ágyazva — a gazda app DEV buildjében:
#   if (isDev) await import('perflens/devtool/index.ts');
# vagy kézzel: DevTools → Sources → Snippets → dist/devtool.js beillesztve
```

A beágyazott nézet **csukva indul**, és csukva nincs időzítője: a puszta
betöltés nem mér bele a mért lapba. A szabálymotor sem fut élőben — a
„Kiértékelés" indítja, egyszer. Mindkettő szándékos: ami a mért lapon fut, az
a mért számot rontja.

```bash
npm test               # határőr + tsc + 89 egységteszt
npm run smoke          # fixture-ök és a beágyazott nézet, valódi böngészőben
npm run diff -- --base=alap.json --new=uj.json    # regresszió-kapu, 1-es kilépőkód
```

## Rétegek

```
core/        framework- és chrome-mentes mag: gyűjtők, rögzítő, szabálymotor,
             munkamenet, összevetés — NULLA importtal
adapters/    keretrendszer-tudás (angular: komponens-profil a ng.ɵsetProfiler-ből)
agent/       a lapba injektált ügynök: install.ts a telepítő, index.ts a belépési pont
dashboard/   a sávok, a leletlista és a nézet-tábla; embed.ts + style.ts a lapba ágyazva
devtool/     ügynök + beágyazott dashboard egy fájlban — őt nem importálja senki
extension/   MV3: háttér, relay, popup, DevTools-panel
worker/      worker-oldali csomagolók (B szint): a workert nem módosítja, becsomagolja
fixtures/    determinisztikus tesztlapok, TUDOTT terheléssel
```

A `tools/boundary.mjs` ezeket **gépileg** őrzi: a mag csak magát importálhatja
és nem ismeri a `chrome`-ot; az ügynökbe nem kerülhet felület; a `devtool/`
levél. A `npm test` ezzel kezd.

## Saját alkalmazás bekötése

A mag szándékosan nem tud semmit az alkalmazásodról. Ha a saját
csővezetékedet is látni akarod (store-írások, üzenet-kötegek, WS → render
latencia), írj egy adaptert, ami a te felületedet olvassa, és add át a
belépési pontodban:

```ts
installAgent({ app: watchMyApp });     // agent/install.ts
startDevtool({ app: watchMyApp });     // devtool/start.ts
```

Az adapter egyetlen dolga, hogy `PerfEvent`-eket termeljen a `Recorder`-be; a
magban nincs `if (myApp)`. A `boundary.mjs` `APP_ADAPTERS` listájába vedd fel
az adaptered könyvtárát — onnantól őrzi, hogy az app-tudás ne szivárogjon a
magba.

A worker belsejéhez (SharedWorker: oda egyetlen kiterjesztés-API sem lát be) a
`worker/hooks.ts` `installWorkerHooks()`-ja kell, a worker belépési pontja
ELŐTT kiértékelve.

## Megjegyzések

- **Chrome/Chromium 128+.** A LoAF, az Event Timing és a `registerContentScripts`
  (`world: 'MAIN'`) nélkül a fél eszköz üres — Firefoxon nem megy.
- **Nem küld sehova semmit.** Nincs hálózat; a gyűjtők méretet, számot és időt
  rögzítenek, tartalmat soha (WS-törzs, `postMessage` payload, DOM-szöveg nem
  kerül a pufferbe). Az URL-ből a query és a fragment törlődik.
- **A felület a böngésző nyelvén** van: magyar böngészőben magyar, minden
  másban angol (`core/i18n/`).
- A `playwright` pontos verzióra van rögzítve (nem `^`), hogy a füstteszt a már
  letöltött böngészőt használja; emeléskor `npx playwright install chromium` kell.

## Eredet

Egy nagyobb alkalmazás-repóból kivágva (2026-09-24), annak hordozható
részeként. A kódban a `27-es doksi N.N` hivatkozások az ottani tervdokumentum
fejezeteire mutatnak (döntésnapló); ez a dokumentum nem része ennek a repónak.

## Licenc

[MIT](LICENSE)
