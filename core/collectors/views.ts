/** Nézet-szintű idő-hozzárendelés: MELYIK komponens, és azon belül melyik
 *  nézet-rész vitte el a főszál idejét.
 *
 *  A LoAF `scripts[]` csak a belépési pontot adja. Egy zoneless Angular-appban
 *  ez szinte mindig az ütemező — a `tick` egyetlen scriptként látszik, akár
 *  80 ms-ig is, és nem derül ki, hogy a lista vagy a fejléc volt drága. A
 *  keretrendszer saját profiler-horga (adapters/angular) viszont minden
 *  sablon-, életciklus- és komponens-futás elejét és végét jelzi.
 *
 *  Ez a fájl a keretrendszer-FÜGGETLEN fele: egymásba ágyazott szakaszokat
 *  kap (`begin`/`end`), és mindegyik SAJÁT idejét (a gyermekei nélkül) a
 *  címkéjére könyveli. A legkülső szakasz egy „futás" (pl. egy `tick`); a
 *  végén egyetlen összesítés megy ki. Eseményt szakaszonként NEM termel —
 *  egy lista egy tickben több ezer sablont futtathat.
 *
 *  TISZTA: az időt paraméterként kapja, Node-ban tesztelhető. */

/** Hogyan könyvelődik egy szakasz saját ideje.
 *  - `run`: futás-keret (change detection, bootstrap) — saját ideje a
 *    keretrendszeré (`FRAMEWORK`).
 *  - `pass`: átlátszó keret (szinkronizálás, defer) — szintén a keretrendszeré.
 *  - `view`: nézet-munka — a saját ideje a címkéjére megy. */
export type SpanKind = 'run' | 'pass' | 'view';

/** A keretrendszer saját, komponenshez nem köthető ideje. */
export const FRAMEWORK = '(framework)';

export interface ViewCost { label: string; ms: number; count: number }

export interface ViewRun {
  start: number;
  dur: number;
  /** A legkülső szakasz neve: `tick`, `output`, `bootstrap`, … */
  kind: string;
  /** Címkénként, csökkenő saját idő szerint. */
  views: ViewCost[];
}

interface Open { kind: SpanKind; label: string; t: number; child: number }

/** A címke első szava a komponens: `LiveScreen @for[8]` → `LiveScreen`. */
export const componentOf = (label: string): string => {
  const i = label.indexOf(' ');
  return i < 0 ? label : label.slice(0, i);
};

export class ViewSpans {
  private stack: Open[] = [];
  private costs = new Map<string, ViewCost>();
  private runKind = '';

  private readonly onRun: (run: ViewRun) => void;

  /** @param onRun a legkülső szakasz végén hívódik. */
  constructor(onRun: (run: ViewRun) => void) { this.onRun = onRun; }

  get depth(): number { return this.stack.length; }

  /** A címke lehet üres, és az `end`-nél is megadható — az Angular a
   *  komponens-példányt csak a szakasz VÉGÉN adja át. A `runName` a futás
   *  neve, ha ez a szakasz nyit futást (alapból a fajtája). */
  begin(kind: SpanKind, t: number, label = '', runName: string = kind): void {
    if (!this.stack.length) { this.costs.clear(); this.runKind = runName; }
    this.stack.push({ kind, label, t, child: 0 });
  }

  /** `count`: számít-e egy előfordulásnak (a komponens-ellenőrzés igen, a
   *  gyökérsablon — ami ugyanahhoz a komponenshez könyvel — nem). */
  end(t: number, label?: string, count = true): void {
    const s = this.stack.pop();
    if (!s) return;
    const dur = Math.max(0, t - s.t);
    const self = Math.max(0, dur - s.child);
    const parent = this.stack[this.stack.length - 1];
    if (parent) parent.child += dur;
    const name = s.kind === 'view' ? (label ?? s.label) || FRAMEWORK : FRAMEWORK;
    let c = this.costs.get(name);
    if (!c) this.costs.set(name, (c = { label: name, ms: 0, count: 0 }));
    c.ms += self;
    if (s.kind === 'view' && count) c.count++;
    if (!parent) {
      const views = [...this.costs.values()].filter((v) => v.ms > 0 || v.count > 0).sort((a, b) => b.ms - a.ms);
      this.onRun({ start: s.t, dur, kind: this.runKind, views });
      this.costs.clear();
    }
  }

  /** Egy félbeszakadt állapot (pl. futás KÖZBEN telepített horog) eldobása. */
  reset(): void { this.stack = []; this.costs.clear(); }
}

/** Munkamenet-szintű összesítés: címkénként a teljes saját idő és darab.
 *  Korlátos: `max` címke fölött az újak a `FRAMEWORK`-höz mennek (egy
 *  dinamikus név ne fújhassa fel a memóriát). */
export class ViewTotals {
  private map = new Map<string, ViewCost>();
  runs = 0;
  runMs = 0;

  private readonly max: number;

  constructor(max = 2000) { this.max = max; }

  add(run: ViewRun): void {
    this.runs++;
    this.runMs += run.dur;
    for (const v of run.views) {
      const key = this.map.has(v.label) || this.map.size < this.max ? v.label : FRAMEWORK;
      let c = this.map.get(key);
      if (!c) this.map.set(key, (c = { label: key, ms: 0, count: 0 }));
      c.ms += v.ms; c.count += v.count;
    }
  }

  top(n: number): ViewCost[] {
    return [...this.map.values()].sort((a, b) => b.ms - a.ms).slice(0, n).map((c) => ({ ...c, ms: Math.round(c.ms * 10) / 10 }));
  }

  reset(): void { this.map.clear(); this.runs = 0; this.runMs = 0; }
}
