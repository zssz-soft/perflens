import { installAgent, type AgentOptions } from '../agent/install.ts';
import { mountPerfLens, type EmbedHandle } from '../dashboard/embed.ts';

/** DEV-ESZKÖZ EGY FÁJLBAN: ügynök + a lapba ágyazott dashboard, kiterjesztés
 *  nélkül (27-es doksi 15.6, és a 18./7. „dev-eszköz, nem termék").
 *
 *  Ez a réteg SZÁNDÉKOSAN nem az `agent/`-ben van. Az ügynök a mért lapon
 *  fut, és minden kilobájtja a mért számot rontja (4.1) — a dashboard
 *  súlyát ezért nem szabad az ügynökbe olvasztani. Aki ezt a fájlt tölti be,
 *  tudatosan vállalja a UI költségét; aki csak mérni akar, az `agent/`-et
 *  tölti, és a panelt használja.
 *
 *  Mellékhatása ennek a modulnak nincs — a belépési pontok hívják:
 *  `devtool/index.ts` — app-tudatos módhoz egy saját belépési pont, ami
 *  `startDevtool({ app })`-pel adja át az adapterét. */

/** Telepíti az ügynököt, és a DOM-ra teszi a dashboardot — CSUKVA. Csukva
 *  nincs időzítő és nincs rajz (19.10), tehát a puszta betöltés nem mér
 *  bele a mért lapba.
 *
 *  A kapaszkodó a konzolból is elérhető: `window.__perfLensUI`. */
export function startDevtool(opts: AgentOptions = {}): void {
  installAgent(opts);
  const mount = () => {
    const ui = mountPerfLens();
    (window as unknown as { __perfLensUI?: EmbedHandle | null }).__perfLensUI = ui;
  };
  // `document_start`-ban még nincs `body`; snippetből viszont már van.
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
