import { makeContext, type RuleContext } from './context.ts';
import type { Finding } from './finding.ts';
import { RULES, type Rule } from './rules.ts';
import { ENRICHERS, type Enricher } from './enrich.ts';
import type { PerfEvent } from '../event.ts';
import type { Bucket } from '../metrics/buckets.ts';
import type { SourceRef } from '../recorder.ts';
import { t } from '../i18n/index.ts';

/** A szabálymotor (27-es doksi 12. fejezet): detektorok, aztán gazdagítók.
 *
 *  TISZTA, és a PANELEN fut (vagy Node-ban) — soha nem a mért lapon, mert ami
 *  ott fut, az a mért számot rontja. Egy teljes munkameneten újraértékelve
 *  ugyanazt adja: a leletek azonosítója szabály + idő. */

const ORDER = { critical: 0, warn: 1, info: 2 } as const;

/** A „hűtés": egy rátaszabály másodpercenként szólna, és a leletlista
 *  húsz egyforma sorrá esne szét. Az egymást követő (legfeljebb 1 s-os
 *  réssel) leleteket egyetlen leletté vonjuk össze — a legrosszabb tagjuk
 *  címével és tényeivel, plusz az előfordulás és az időtartam. */
export function mergeAdjacent(list: Finding[]): Finding[] {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  const groups: Finding[][] = [];
  for (const f of sorted) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    if (prev && f.t <= prev.t + prev.windowMs + 1000) g.push(f); else groups.push([f]);
  }
  const m = t().rules.merged;
  return groups.map((g) => {
    if (g.length === 1) return g[0];
    const score = (f: Finding) => Number(Object.values(f.facts).find((v) => typeof v === 'number') ?? 0);
    const worst = g.reduce((m, f) => (score(f) > score(m) ? f : m));
    const end = Math.max(...g.map((f) => f.t + f.windowMs));
    const secs = Math.round((end - g[0].t) / 100) / 10;
    return {
      ...worst,
      id: g[0].id,
      t: g[0].t,
      windowMs: end - g[0].t,
      severity: g.reduce((m, f) => (ORDER[f.severity] < ORDER[m] ? f.severity : m), worst.severity),
      title: m.title(worst.title, g.length, secs),
      facts: { ...worst.facts, [m.facts.count]: g.length, [m.facts.duration]: secs },
      steps: [],
    };
  });
}

export function evaluate(
  input: { buckets: readonly Bucket[]; events: readonly PerfEvent[]; sources?: readonly SourceRef[] },
  rules: Rule[] = RULES, enrichers: Enricher[] = ENRICHERS,
): Finding[] {
  const ctx: RuleContext = makeContext(input.buckets, input.events, input.sources ?? []);
  const findings = rules.flatMap((r) => (r.merge ? mergeAdjacent(r.detect(ctx)) : r.detect(ctx)));
  for (const f of findings) for (const e of enrichers) e(f, ctx);
  return findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.t - b.t);
}
