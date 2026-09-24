/** Az esemény-boríték (27-es doksi 11.1).
 *
 *  Minden forrás ugyanebbe ír. Fix alak, szám-mezőkkel: a gyűrűs pufferben
 *  olcsó, a sorosítás egyetlen `JSON.stringify`. TARTALOM SOHA nem kerül
 *  bele (17. fejezet, adatvédelem): a `label` rövid, fix szótárú címke. */

export interface PerfEvent {
  /** A LAP óráján, ms. Minden forrás ide van normalizálva (`clock.ts`). */
  t: number;
  /** Monoton sorszám a munkameneten belül — a lyukai a puffer-veszteséget
   *  mutatják. */
  seq: number;
  src: 'main' | 'worker' | 'shared-worker' | 'ext' | 'lab';
  kind: PerfEventKind;
  /** Időtartam ms-ban, ha értelmezett. */
  dur?: number;
  /** Típusfüggő, LAPOS mezők — a jelentésük a 11.2 táblázatában. */
  a?: number;
  b?: number;
  /** Rövid címke. Sosem tartalom. */
  label?: string;
  /** Láncolás (17.4/2). */
  id?: number;
  parent?: number;
  /** A munkamenet `threads` táblájának indexe (17.4/3). */
  thread?: number;
  /** A munkamenet `sources` táblájának indexe (17.4/4). */
  source?: number;
}

/** Az olvasó az ismeretlen `kind`-ot figyelmen kívül hagyja (17.4/7) — a
 *  későbbi `hot-function`, `gc`, `microtasks` így nem töri a régi olvasót. */
export type PerfEventKind =
  | 'longtask' | 'loaf' | 'script' | 'interaction' | 'frame-gap'
  | 'layout-shift' | 'paint' | 'resource' | 'navigation'
  | 'ws-message' | 'ws-open' | 'ws-close'
  | 'worker-msg-in' | 'worker-msg-out' | 'worker-work'
  | 'store-update' | 'render' | 'mark' | 'measure'
  | 'view-run' | 'view' | 'dom' | 'dom-area';

export const KNOWN_KINDS: ReadonlySet<string> = new Set<PerfEventKind>([
  'longtask', 'loaf', 'script', 'interaction', 'frame-gap',
  'layout-shift', 'paint', 'resource', 'navigation',
  'ws-message', 'ws-open', 'ws-close',
  'worker-msg-in', 'worker-msg-out', 'worker-work',
  'store-update', 'render', 'mark', 'measure',
  'view-run', 'view', 'dom', 'dom-area',
]);

/** Előre kompatibilis szűrés: egy későbbi eszköz munkamenetéből csak azt
 *  tartjuk meg, amit ez a verzió ért — a többit csendben átugorjuk. */
export function knownEvents(events: readonly PerfEvent[]): PerfEvent[] {
  return events.filter((e) => KNOWN_KINDS.has(e.kind));
}
