import type { Bucket } from '../core/metrics/buckets.ts';
import type { Messages } from '../core/i18n/index.ts';

/** A dashboard nyolc sávja (27-es doksi 13.2/4) — másodperces vödrökből.
 *
 *  Minden sáv egy kérdésre felel a 13.1-ből. A szövegei (cím, egység,
 *  kérdés, info-súgó) a szótárban vannak (`core/i18n`, `bands.<id>`); itt
 *  csak a mérés. A `value` tiszta függvény, a rajz külön (render.ts). */

export type BandId = keyof Messages['bands'];

export interface Band {
  id: BandId;
  value(b: Bucket): number;
  /** Ahol ez fölé megy, az a sávon kiemelve (a szabály küszöbe). */
  limit?: (b: Bucket) => number;
  /** Ha van, a küszöb fölötti oszlop színét ennek a szabálynak a lelete
   *  dönti el (render.ts): így a sáv és a leletlista nem mondhat mást. */
  ruleId?: string;
}

export const BANDS: Band[] = [
  { id: 'busy', value: (b) => Math.round(b.longTaskMs / 10), limit: () => 50 },
  { id: 'longtasks', value: (b) => b.longTasks, limit: () => 0 },
  { id: 'frames', value: (b) => b.droppedFrames, limit: () => 0, ruleId: 'dropped-frames' },
  { id: 'ws', value: (b) => b.wsMessages + b.wkWsMessages },
  { id: 'worker', value: (b) => b.workerIn, limit: () => 60 },
  { id: 'store', value: (b) => b.storeUpdates, limit: (b) => b.frames || 60 },
  { id: 'inp', value: (b) => Math.round(b.worstInteraction), limit: () => 200 },
  { id: 'pipeline', value: (b) => b.pipelineP95, limit: () => 100 },
];
