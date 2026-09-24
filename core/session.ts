import { knownEvents, type PerfEvent } from './event.ts';
import type { Bucket } from './metrics/buckets.ts';
import type { Summary, ThreadInfo, SourceRef } from './recorder.ts';
import type { Finding } from './rules/finding.ts';
import { evaluate } from './rules/engine.ts';
import { t } from './i18n/index.ts';

/** A munkamenet-rekord (27-es doksi 11.4) — ÖNÁLLÓ séma, nem a mérési napló
 *  `MeasurementRecord`-ja: a PerfLens-munkamenet kézi böngészésből is
 *  származhat, a két módszertan számai nem keveredhetnek (26-os doksi).
 *
 *  Előre kompatibilis (17.4/7): az olvasó az ismeretlen mezőt és `kind`-ot
 *  eldobja; opcionális bővítés `perflens/1` marad. */

export const SCHEMA = 'perflens/1';

export interface SessionContext {
  url: string; userAgent: string; viewport: string; dpr: number;
  mode: 'generic' | 'app-aware'; agentVersion: string;
}

export interface PerfLensSession {
  schema: typeof SCHEMA;
  label: string;
  startedAt: string;
  durationMs: number;
  context: SessionContext;
  summary: Summary;
  buckets: Bucket[];
  findings: Finding[];
  events: PerfEvent[];
  threads: ThreadInfo[];
  sources: SourceRef[];
}

export function buildSession(input: {
  label?: string; context: SessionContext; summary: Summary; buckets: Bucket[];
  events: PerfEvent[]; threads: ThreadInfo[]; sources: SourceRef[]; now?: Date;
}): PerfLensSession {
  const now = input.now ?? new Date();
  return {
    schema: SCHEMA,
    label: input.label ?? `perflens-${now.toISOString().slice(0, 19)}`,
    startedAt: new Date(now.getTime() - input.summary.elapsedMs).toISOString(),
    durationMs: input.summary.elapsedMs,
    context: input.context,
    summary: input.summary,
    buckets: input.buckets,
    // A leletek a mentés pillanatában újraszámolva — a visszatöltő ugyanezt kapja.
    findings: evaluate(input),
    events: input.events,
    threads: input.threads,
    sources: input.sources,
  };
}

/** Beolvasás: alak-ellenőrzés és előre kompatibilis szűrés. Hibás fájlra
 *  érthető hibát dob, nem félig betöltött munkamenetet ad. */
export function parseSession(json: string): PerfLensSession {
  let x: Partial<PerfLensSession>;
  const tx = t().session;
  try { x = JSON.parse(json); } catch { throw new Error(tx.notJson); }
  if (x?.schema !== SCHEMA) throw new Error(tx.unknownSchema(String(x?.schema), SCHEMA));
  if (!x.summary || !Array.isArray(x.buckets) || !Array.isArray(x.events) || !x.context) throw new Error(tx.incomplete);
  const events = knownEvents(x.events);
  return {
    schema: SCHEMA,
    label: String(x.label ?? ''),
    startedAt: String(x.startedAt ?? ''),
    durationMs: Number(x.durationMs ?? 0),
    context: x.context,
    summary: x.summary,
    buckets: x.buckets,
    // újraértékelve: egy régebbi eszköz leletei helyett a mostani szabályok
    findings: evaluate({ buckets: x.buckets, events, sources: x.sources ?? [] }),
    events,
    threads: x.threads ?? [],
    sources: x.sources ?? [],
  };
}
