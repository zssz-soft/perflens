/** DOM-változások a nézet-területek szerint: HOL változott a képernyő.
 *
 *  A nézet-horog (views.ts, adapters/angular) csak fejlesztői buildben él.
 *  Éles buildben és idegen oldalon ez marad: egy `MutationObserver`, ami
 *  megszámolja, melyik komponens-gazdaelem alatt hány változás történt. Időt
 *  nem mér (a DOM-írás költsége a LoAF render- és elrendezés-idejében van),
 *  de megmondja, hogy egy hosszú képkocka alatt a lista 380 sora változott,
 *  nem a fejléc.
 *
 *  A gazdaelem a legközelebbi EGYEDI elem (a neve kötőjeles: `app-event-row`,
 *  `tv-odds-button`) — az Angular-, a Stencil- és minden web component-alapú
 *  lap így jelöli a komponenseit. A címke a legközelebbi kettő
 *  (`app-event-row › app-odds-button`): a sor és a gomb együtt mondja meg,
 *  hol járunk. Egyedi elem nélkül a legközelebbi tájékozódási elem
 *  (`main`, `nav`, `table`, …). TARTALOM nem kerül a címkébe: csak tagnév —
 *  az `id` és az osztály a lap szövegéből is jöhet (17. fejezet).
 *
 *  Az observer visszahívása a mutáló feladat utáni mikrotaszk-ponton fut —
 *  UGYANABBAN a képkockában, így az időbélyege a képkockán belülre esik. */

/** A DOM-ból csak ennyit olvasunk: Node-ban kitalált fával tesztelhető. */
export interface NodeLike { nodeType: number; nodeName: string; parentNode: NodeLike | null }

const LANDMARKS = new Set(['MAIN', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'SECTION', 'ARTICLE', 'FORM', 'TABLE', 'UL', 'OL', 'DIALOG']);
const ELEMENT = 1;

/** Legfeljebb ennyi szintet megyünk fölfelé: egy mély fán se legyen drága. */
const MAX_DEPTH = 64;

export function hostLabel(node: NodeLike | null): string {
  const hosts: string[] = [];
  let landmark = '';
  let n = node;
  for (let i = 0; n && i < MAX_DEPTH && hosts.length < 2; i++, n = n.parentNode) {
    if (n.nodeType !== ELEMENT) continue;
    const name = n.nodeName;
    if (name.includes('-')) hosts.push(name.toLowerCase());
    else if (!landmark && LANDMARKS.has(name)) landmark = name.toLowerCase();
  }
  if (hosts.length) return hosts.reverse().join(' › ').slice(-64);
  return landmark || 'document';
}

/** Egy visszahívás összesítése: gazdaelemenként a változások száma. */
export interface DomBatch { t: number; total: number; hosts: [string, number][] }

export class DomTally {
  /** Elemenként a címke — ugyanaz a sor ezerszer változik, a fát egyszer
   *  járjuk be. Gyenge hivatkozás: a törölt elem kiesik. */
  private cache = new WeakMap<object, string>();

  /** `targets`: a rekordok célpontjai (a szöveg-csomópontnak a szülője). */
  count(t: number, targets: Iterable<NodeLike | null>): DomBatch {
    const by = new Map<string, number>();
    let total = 0;
    for (const target of targets) {
      if (!target) continue;
      let label = this.cache.get(target);
      if (label === undefined) { label = hostLabel(target); this.cache.set(target, label); }
      by.set(label, (by.get(label) ?? 0) + 1);
      total++;
    }
    return { t, total, hosts: [...by.entries()].sort((a, b) => b[1] - a[1]) };
  }
}

export function watchDom(onBatch: (b: DomBatch) => void, now: () => number = () => performance.now()): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {};
  const tally = new DomTally();
  const o = new MutationObserver((records) => {
    const t = now();
    onBatch(tally.count(t, records.map((r) => (r.target.nodeType === ELEMENT ? r.target : r.target.parentNode) as NodeLike | null)));
  });
  // A `document`, nem a `documentElement`: `document_start`-ban a <html> még
  // nem létezik, és az `observe(null)` kivétele az ügynök `start()`-ját is
  // félbeszakította — a már bekötött observerek bent ragadtak, és minden
  // hosszú feladat kétszer számolódott.
  o.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  return () => o.disconnect();
}
