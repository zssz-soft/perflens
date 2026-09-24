import type { Recorder } from '../../core/recorder.ts';
import { ViewSpans } from '../../core/collectors/views.ts';

/** Angular nézet-profil: melyik komponens és melyik sablon-rész vitte el az
 *  időt (a mag fele: core/collectors/views.ts).
 *
 *  A forrás az Angular saját profiler-horga, `ng.ɵsetProfiler` — ugyanaz,
 *  amire az Angular DevTools profilere és az `enableProfiling()` épül. A
 *  hívásai az Angular kódjában `ngDevMode` mögött vannak, és az ÉLES buildből
 *  kiesnek; az `ng` globális is csak fejlesztői módban létezik. Tehát:
 *   - éles buildben ez a gyűjtő NEM települ, és nulla költségű;
 *   - fejlesztői buildben a mért idők a fejlesztői build idői (az
 *     `ngDevMode`-ellenőrzésekkel) — a SORREND megbízható, az abszolút ms
 *     nagyobb, mint élesben.
 *
 *  A `ng` globális a bootstrap alatt jelenik meg, az ügynök viszont
 *  `document_start`-ban indul: ezért rövid ideig figyeljük, hogy megjelent-e.
 *
 *  A lap kódjához nem nyúl (4.2): a horgot a nyilvános dev-felületen át
 *  kapcsolja be és ki. */

/** Az Angular `ɵProfilerEvent` értékei (@angular/core 22). Belső (ɵ) API: egy
 *  Angular-frissítés után a fejlesztői buildön ellenőrizendő, hogy jönnek-e
 *  címkék (27-es doksi 7.5). A füstteszt az éles buildet méri, ott a horog
 *  nem létezik. */
const E = {
  TemplateCreateStart: 0, TemplateCreateEnd: 1, TemplateUpdateStart: 2, TemplateUpdateEnd: 3,
  LifecycleHookStart: 4, LifecycleHookEnd: 5, OutputStart: 6, OutputEnd: 7,
  BootstrapApplicationStart: 8, BootstrapApplicationEnd: 9, BootstrapComponentStart: 10, BootstrapComponentEnd: 11,
  ChangeDetectionStart: 12, ChangeDetectionEnd: 13, ChangeDetectionSyncStart: 14, ChangeDetectionSyncEnd: 15,
  AfterRenderHooksStart: 16, AfterRenderHooksEnd: 17, ComponentStart: 18, ComponentEnd: 19,
  DeferBlockStateStart: 20, DeferBlockStateEnd: 21, DynamicComponentStart: 22, DynamicComponentEnd: 23,
  HostBindingsUpdateStart: 24, HostBindingsUpdateEnd: 25,
} as const;

type Profiler = (event: number, instance?: unknown, fn?: unknown) => void;
interface NgGlobal { ɵsetProfiler?: (p: Profiler | null) => () => void }

/** A blokk-nevek a fordító elnevezéséből (`LiveScreen_Conditional_12_For_8_Template`). */
const BLOCKS: Record<string, string> = {
  Conditional: '@if', For: '@for', ForEmpty: '@empty', Case: '@case',
  Defer: '@defer', DeferPlaceholder: '@placeholder', DeferLoading: '@loading', DeferError: '@error',
};

/** Az esbuild a dekorált osztályt `_EventRowComponent`-ként nevezi el. */
export const className = (instance: unknown): string => {
  const name = (instance as { constructor?: { name?: string } } | null)?.constructor?.name ?? '';
  return name.replace(/^_+/, '') || '?';
};

/** Sablonfüggvény neve → címke.
 *  `EventRowComponent_Template` → `EventRowComponent`
 *  `LiveScreen_Conditional_12_For_8_Template` → `LiveScreen @if[12] › @for[8]`
 *  `X_Conditional_11_ng_template_1_Template` → `X @if[11] › <ng-template>[1]`
 *  Csak az utolsó két blokk marad: a címke rövid (64 karakter). */
export function templateLabel(fnName: string): string {
  const m = /^(.+?)_Template(?:_.*)?$/.exec(fnName);
  if (!m) return '';
  const [comp, ...rest] = m[1].split('_');
  const parts: string[] = [];
  let tag: string[] = [];
  for (const tok of rest) {
    if (/^\d+$/.test(tok) && tag.length) {
      const name = tag.join('_');
      parts.push(`${BLOCKS[name] ?? `<${name.replace(/_/g, '-')}>`}[${tok}]`);
      tag = [];
    } else tag.push(tok);
  }
  const label = parts.length ? `${comp} ${parts.slice(-2).join(' › ')}` : comp;
  return label.slice(0, 64);
}

const fnName = (fn: unknown): string => (typeof fn === 'function' ? fn.name : '');

/** Életciklus-horog neve; az `ngOnChanges` egy belső csomagolón át fut. */
const hookName = (fn: unknown): string => {
  const n = fnName(fn);
  return n === 'rememberChangeHistoryAndInvokeOnChangesHook' ? 'ngOnChanges' : n || 'hook';
};

/** A kiválasztott profiler-események → szakaszok. Tiszta: Node-ban
 *  kitalált eseménysorral tesztelhető. */
export function angularProfiler(spans: ViewSpans, now: () => number): Profiler {
  return (event, instance, fn) => {
    const t = now();
    switch (event) {
      case E.ChangeDetectionStart: spans.begin('run', t, '', 'tick'); break;
      case E.BootstrapApplicationStart: spans.begin('run', t, '', 'bootstrap'); break;
      case E.ChangeDetectionSyncStart: case E.DeferBlockStateStart: case E.DynamicComponentStart: case E.BootstrapComponentStart:
        spans.begin('pass', t); break;
      case E.AfterRenderHooksStart: spans.begin('view', t, '(afterRender)', 'afterRender'); break;
      case E.ComponentStart: spans.begin('view', t, '', 'component'); break;
      case E.TemplateCreateStart: case E.TemplateUpdateStart: spans.begin('view', t, '', 'template'); break;
      case E.LifecycleHookStart: spans.begin('view', t, '', 'hook'); break;
      case E.HostBindingsUpdateStart: spans.begin('view', t, '', 'host'); break;
      case E.OutputStart: spans.begin('view', t, '', 'output'); break;

      case E.ChangeDetectionEnd: case E.BootstrapApplicationEnd:
      case E.ChangeDetectionSyncEnd: case E.DeferBlockStateEnd: case E.DynamicComponentEnd: case E.BootstrapComponentEnd:
      case E.AfterRenderHooksEnd:
        spans.end(t); break;
      case E.ComponentEnd: spans.end(t, className(instance)); break;
      case E.TemplateCreateEnd: case E.TemplateUpdateEnd: {
        // A gyökérsablon ugyanahhoz a komponenshez könyvel, de nem új
        // előfordulás — a komponens-szakasz már számolt.
        const label = templateLabel(fnName(fn)) || className(instance);
        spans.end(t, label, label.includes(' '));
        break;
      }
      case E.LifecycleHookEnd: spans.end(t, `${className(instance)} ${hookName(fn)}()`); break;
      case E.HostBindingsUpdateEnd: spans.end(t, `${className(instance)} (host)`); break;
      case E.OutputEnd: {
        const label = templateLabel(fnName(fn));
        spans.end(t, `${label || className(instance)} (listener)`.slice(0, 64));
        break;
      }
    }
  };
}

/** @returns leállít: leveszi a horgot és abbahagyja a várakozást. */
export function watchAngularViews(rec: Recorder, now: () => number, waitMs = 15_000): () => void {
  const spans = new ViewSpans((run) => rec.viewRun(run));
  let remove: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = now() + waitMs;
  const tryInstall = () => {
    const ng = (globalThis as unknown as { ng?: NgGlobal }).ng;
    const set = ng?.ɵsetProfiler;
    if (typeof set === 'function') {
      spans.reset();
      const r = set(angularProfiler(spans, now));
      // Régebbi Angular nem ad vissza eltávolítót: ott a null mindet leveszi.
      remove = typeof r === 'function' ? r : () => set(null);
      rec.viewsSource = 'angular-dev';
      return;
    }
    if (now() < deadline) timer = setTimeout(tryInstall, 100);
  };
  tryInstall();
  return () => { clearTimeout(timer); remove?.(); remove = null; };
}
