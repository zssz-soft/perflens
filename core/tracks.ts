/** DevTools-sávok (27-es doksi 7.2, 15.2).
 *
 *  A Chrome Performance-panel kiterjesztés-sávokat rajzol. A 19.3 kísérlet
 *  két API-t mért; a sávok a `console.timeStamp`-et használják: rögzítés
 *  NÉLKÜL 0,14 µs/hívás, és semmit nem tart meg — a `performance.measure`
 *  1,07 µs, és minden bejegyzést a lap pufferében tartana.
 *
 *  A kimenet egy injektált `TrackSink`: a lapon a `console.timeStamp`,
 *  tesztben egy gyűjtő. A rögzítő így tiszta marad. */

import type { Locale } from './i18n/locale.ts';

export interface TrackSink {
  /** `start`/`end` a LAP óráján (ms). */
  entry(name: string, start: number, end: number, track: string, color: string): void;
}

export const TRACK_GROUP = 'PerfLens';

/** A sávok és a két fix bejegyzés neve nyelvenként. Itt, nem a szótárban
 *  (core/i18n): az ügynök a mért lapon fut, és a teljes szótárat nem hozhatja
 *  magával — ami a lapra kerül, az a mért számot rontja. */
const hu = {
  wsWorker: 'WS → worker',
  queue: 'Köteg-várakozás',
  mainWorker: 'Főszál: worker-üzenet',
  mainWs: 'Főszál: WS',
  wsMessage: 'WS-üzenet',
  waiting: 'várakozás',
  views: 'Főszál: nézetek',
};
export type TrackText = typeof hu;

export const TRACK_TEXT: Record<Locale, TrackText> = {
  hu,
  en: {
    wsWorker: 'WS → worker',
    queue: 'Batch wait',
    mainWorker: 'Main: worker message',
    mainWs: 'Main: WS',
    wsMessage: 'WS message',
    waiting: 'waiting',
    views: 'Main: views',
  },
};

/** Az alapértelmezett (magyar) nevek. */
export const TRACKS = hu;

/** A valódi kimenet. A `console.timeStamp` sáv-paraméteres alakja (label,
 *  start, end, track, trackGroup, color) a Chromium 151-en ellenőrzött
 *  (19.3); régebbi böngészőben a többlet-paramétereket figyelmen kívül hagyja. */
export function devtoolsSink(): TrackSink {
  const ts = (console as unknown as { timeStamp?: (...a: unknown[]) => void }).timeStamp;
  if (typeof ts !== 'function') return { entry() {} };
  return { entry: (name, start, end, track, color) => ts.call(console, name, start, end, track, TRACK_GROUP, color) };
}
