import type { RuleContext } from './context.ts';
import type { Finding } from './finding.ts';
import { t } from '../i18n/index.ts';
import { FRAMEWORK, componentOf } from '../collectors/views.ts';

/** Gazdagítók (27-es doksi 17.4/8): a detektor leletéhez magyarázó
 *  lépéseket fűznek — ha az adatrétegük jelen van. Az MVP-ben kettő volt: a
 *  LoAF és az alkalmazás-réteg; a nézet-réteg (komponens, DOM-terület) utána
 *  jött. A profil- és a trace-gazdagító később ide
 *  jön, a detektorokhoz nem kell nyúlni. */

export type Enricher = (f: Finding, ctx: RuleContext) => void;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A leletet átfedő leghosszabb LoAF: kiváltó, script/többi, belépési pont. */
export const loafEnricher: Enricher = (f, ctx) => {
  const frames = ctx.range('loaf', f.t - 1000, f.t + f.windowMs + 50).filter((l) => l.t <= f.t + f.windowMs && l.t + (l.dur ?? 0) >= f.t);
  if (!frames.length) return;
  const loaf = frames.reduce((m, x) => ((x.dur ?? 0) > (m.dur ?? 0) ? x : m));
  const tx = t().enrich;
  if (loaf.label) f.steps.push({ text: tx.invoker(loaf.label), layer: 'loaf', event: loaf.seq });
  if (loaf.b !== undefined) {
    f.steps.push({ text: tx.script(round1(loaf.b)), layer: 'loaf', value: round1(loaf.b), unit: 'ms' });
    const rest = (loaf.dur ?? 0) - loaf.b;
    if (rest > 1) f.steps.push({ text: tx.rest(round1(rest)), layer: 'loaf', value: round1(rest), unit: 'ms' });
  }
  const scripts = ctx.events.filter((e) => e.kind === 'script' && e.parent === loaf.id);
  const top = scripts.reduce<typeof scripts[number] | undefined>((m, x) => (!m || (x.dur ?? 0) > (m.dur ?? 0) ? x : m), undefined);
  const src = top?.source !== undefined ? ctx.sources[top.source] : undefined;
  if (top && src) {
    const where = src.fn ? `${src.fn}()` : tx.anonymous;
    const file = src.url.split('/').pop() || src.url;
    f.steps.push({ text: tx.top(round1(top.dur ?? 0), where, file), layer: 'loaf', value: round1(top.dur ?? 0), unit: 'ms', event: top.seq });
  }
};

/** A leletet átfedő események — a szülőjükkel együtt, ha láncoltak. */
const overlapping = (ctx: RuleContext, f: Finding, kind: 'view-run' | 'dom', slackMs: number) =>
  ctx.range(kind, f.t - 1000, f.t + f.windowMs + slackMs).filter((e) => e.t + (e.dur ?? 0) >= f.t);
const childrenOf = (ctx: RuleContext, kind: 'view' | 'dom-area', parents: readonly { id?: number; t: number }[]) => {
  const ids = new Set(parents.map((p) => p.id));
  const t0 = Math.min(...parents.map((p) => p.t));
  const t1 = Math.max(...parents.map((p) => p.t)) + 1;
  return ctx.range(kind, t0, t1).filter((e) => ids.has(e.parent));
};

/** A nézet-réteg: MELYIK komponens vitte az időt (Angular-profil, csak
 *  fejlesztői build), és HOL változott a DOM (minden buildben). */
export const viewEnricher: Enricher = (f, ctx) => {
  const tx = t().enrich;
  const runs = overlapping(ctx, f, 'view-run', 1);
  if (runs.length) {
    const total = runs.reduce((s, r) => s + (r.dur ?? 0), 0);
    f.steps.push({ text: tx.viewRuns(round1(total), runs.length), layer: 'view', value: round1(total), unit: 'ms', event: runs[0].seq });
    const comps = new Map<string, { ms: number; checks: number; parts: Map<string, number> }>();
    for (const v of childrenOf(ctx, 'view', runs)) {
      if (!v.label || v.label === FRAMEWORK) continue;
      const name = componentOf(v.label);
      let c = comps.get(name);
      if (!c) comps.set(name, (c = { ms: 0, checks: 0, parts: new Map() }));
      c.ms += v.dur ?? 0;
      if (v.label === name) c.checks += v.a ?? 0;
      else c.parts.set(v.label.slice(name.length + 1), (c.parts.get(v.label.slice(name.length + 1)) ?? 0) + (v.dur ?? 0));
    }
    const top = [...comps.entries()].filter(([, c]) => c.ms >= 1).sort((a, b) => b[1].ms - a[1].ms).slice(0, 3);
    for (const [name, c] of top) {
      const part = [...c.parts.entries()].reduce<[string, number] | null>((m, x) => (!m || x[1] > m[1] ? x : m), null);
      const main = part && part[1] >= c.ms * 0.4 ? part : null;
      f.steps.push({ text: tx.component(name, round1(c.ms), c.checks, main ? main[0] : '', main ? round1(main[1]) : 0), layer: 'view', value: round1(c.ms), unit: 'ms' });
    }
  }
  const batches = overlapping(ctx, f, 'dom', 20);
  if (batches.length) {
    const total = batches.reduce((s, b) => s + (b.a ?? 0), 0);
    const hosts = new Map<string, number>();
    for (const a of childrenOf(ctx, 'dom-area', batches)) hosts.set(a.label ?? '', (hosts.get(a.label ?? '') ?? 0) + (a.a ?? 0));
    const where = [...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([h, n]) => `${h} (${n})`).join(', ');
    f.steps.push({ text: tx.dom(total, where), layer: 'view', value: total, event: batches[0].seq });
  }
};

/** Az alkalmazás-réteg: mi érkezett és mi íródott a lelet ELŐTTI 500 ms-ban. */
export const appEnricher: Enricher = (f, ctx) => {
  const t0 = f.t - 500;
  const worker = ctx.range('worker-msg-in', t0, f.t + f.windowMs).length;
  const ws = ctx.range('ws-message', t0, f.t + f.windowMs).length;
  const tx = t().enrich;
  if (worker) f.steps.push({ text: tx.workerBefore(worker), layer: 'app', value: worker });
  if (ws) f.steps.push({ text: tx.wsPage(ws), layer: 'app', value: ws });
  const b = ctx.buckets.find((x) => f.t >= x.t0 && f.t < x.t0 + 1000);
  if (b?.storeUpdates) f.steps.push({ text: tx.storeWrites(b.storeUpdates), layer: 'app', value: b.storeUpdates });
  if (b?.wkWsMessages) f.steps.push({ text: tx.wsWorker(b.wkWsMessages), layer: 'app', value: b.wkWsMessages });
};

export const ENRICHERS: Enricher[] = [loafEnricher, viewEnricher, appEnricher];
