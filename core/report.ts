import type { PerfEvent } from './event.ts';
import type { Bucket } from './metrics/buckets.ts';
import type { Summary, ThreadInfo, SourceRef } from './recorder.ts';
import type { SessionContext } from './session.ts';

/** Az ügynök → relay → háttér → panel jelentés sémája (27-es doksi 5.1).
 *
 *  A magban van, nem a kiterjesztésben: adat, mint a worker-telemetria
 *  (`telemetry.ts`) — az ügynök (termelő) és a kiterjesztés (fogyasztó) is
 *  innen veszi, így egyik gazda sem importál a másikból (4.1).
 *
 *  BIZALOM: a jelentés a MAIN worldből jön, azaz a LAP saját JS-
 *  környezetéből. A lap bármit megtehet az ügynökkel, akár hamis jelentést is
 *  küldhet — egy munkamenet-token ez ellen nem véd (bármilyen csatorna a
 *  MAIN és az ISOLATED world között a lap számára is látható). Ami véd:
 *  séma- és méret-ellenőrzés (`validReport`), ütemkorlát a relayben, és a
 *  panelen kizárólag `textContent` — a lap szövege soha nem lesz HTML. */

export const MAX_EVENTS_PER_REPORT = 2000;
export const MAX_BUCKETS_PER_REPORT = 10;

export interface AgentReport {
  v: 1;
  source: 'perflens-agent';
  type: 'report';
  /** Ügynök-példányonként sorsolt azonosító: új betöltés = új munkamenet. */
  session: string;
  url: string;
  /** Mi futott — a munkamenet-rekordba kerül (11.4). */
  context: SessionContext;
  summary: Summary & { clampedStamps: number };
  buckets: Bucket[];
  events: PerfEvent[];
  threads: ThreadInfo[];
  /** Csak az új forrás-bejegyzések, `sourcesFrom` indextől. */
  sources: SourceRef[];
  sourcesFrom: number;
}

export type RelayHello = { v: 1; source: 'perflens-relay'; type: 'hello' };

const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const shortStr = (x: unknown, max = 256) => typeof x === 'string' && x.length <= max;

/** Szigorú, de olcsó ellenőrzés: alak, típus, méret. Ami nem fér bele,
 *  eldobjuk — a panel inkább hiányos, mint megtévesztett. */
export function validReport(r: unknown): r is AgentReport {
  const x = r as AgentReport;
  if (!x || x.v !== 1 || x.source !== 'perflens-agent' || x.type !== 'report') return false;
  if (!shortStr(x.session, 64) || !shortStr(x.url, 2048)) return false;
  const c = x.context;
  if (!c || !shortStr(c.userAgent, 512) || !shortStr(c.viewport, 32) || !isNum(c.dpr) || !shortStr(c.agentVersion, 32)
    || (c.mode !== 'generic' && c.mode !== 'app-aware') || !shortStr(c.url, 2048)) return false;
  if (!x.summary || typeof x.summary !== 'object' || !isNum(x.summary.longTaskCount) || !isNum(x.summary.elapsedMs)) return false;
  if (!Array.isArray(x.buckets) || x.buckets.length > MAX_BUCKETS_PER_REPORT || !x.buckets.every((b) => b && isNum(b.t0))) return false;
  if (!Array.isArray(x.events) || x.events.length > MAX_EVENTS_PER_REPORT) return false;
  if (!x.events.every((e) => e && isNum(e.t) && isNum(e.seq) && shortStr(e.kind, 32) && (e.label === undefined || shortStr(e.label, 64)))) return false;
  if (!Array.isArray(x.threads) || x.threads.length > 256) return false;
  if (!Array.isArray(x.sources) || x.sources.length > 5000 || !isNum(x.sourcesFrom)) return false;
  return true;
}
