import { startDevtool } from './start.ts';

/** GENERIC dev-eszköz — bármelyik alkalmazáshoz (27-es doksi 6. fejezet).
 *
 *  Két használat:
 *
 *  1. A gazda app DEV buildjében — ez a felügyelt (céges) gépek útja, mert
 *     ez csak forráskód: se kiterjesztés, se fejlesztői mód nem kell hozzá.
 *
 *         if (isDevBuild) await import('perflens/devtool/index.ts');
 *
 *  2. Kézzel, DevTools → Sources → Snippets: a `dist/devtool.js`
 *     tartalmát beillesztve. Ilyenkor az ügynök a betöltés UTÁN indul, tehát
 *     a `document_start`-hoz kötött részek (a MÁR létező workerek és
 *     WS-kapcsolatok csomagolása) kimaradnak — a LoAF, a longtask, az INP, a
 *     képkockák és a DOM viszont a beillesztés pillanatától mérnek. */

startDevtool();
