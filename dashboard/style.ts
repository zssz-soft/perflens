/** A dashboard saját stílusa — a beágyazott (lapon futó) nézethez.
 *
 *  Miért itt és nem HTML-ben: a `render.ts` osztályneveket ad ki
 *  (`band`, `finding`, `chain`…), és eddig a GAZDA hordozta hozzá a CSS-t
 *  (`extension/panel.html`). A lapba ágyazott nézetnek nincs saját HTML-je,
 *  ezért a stílust a rajzolóval együtt kell szállítani.
 *
 *  A panel `<style>`-je SZÁNDÉKOSAN a helyén marad (4.2: „hozzáadás, nem
 *  átírás" — a működő, füsttesztelt panelt ezért nem írjuk át JS-ből
 *  injektált stílusra). A két példány a sáv- és lelet-osztályokon átfed; ha
 *  a `render.ts` új osztályt ad ki, MINDKETTŐT frissíteni kell.
 *
 *  A `pl-` előtagú osztályok a beágyazott keret sajátjai, a panelen nincsenek. */

/** Színek: ugyanaz a paletta, mint a panelen, hogy a kettő egy rendszernek
 *  látsszon. A gazda oldal témájától független: shadow DOM-ban élünk, és a
 *  `prefers-color-scheme` dönt. */
const TOKENS = `
  :host {
    --pl-bg: #fff; --pl-fg: #1f1f1f; --pl-muted: #6b6b6b; --pl-line: #e3e3e3; --pl-soft: #f5f6f7;
    --pl-accent: #1a73e8; --pl-over: #d93025; --pl-info-bar: #e8710a; --pl-warn: #b06000;
    --pl-warn-bg: #fef7e0; --pl-crit-bg: #fce8e6; --pl-marker: #9334e6;
    --pl-step-loaf: #1a73e8; --pl-step-view: #c5221f; --pl-step-app: #188038;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --pl-bg: #202124; --pl-fg: #e8eaed; --pl-muted: #9aa0a6; --pl-line: #3c4043; --pl-soft: #292a2d;
      --pl-accent: #8ab4f8; --pl-over: #f28b82; --pl-info-bar: #fcad70; --pl-warn: #fdd663;
      --pl-warn-bg: #3b3322; --pl-crit-bg: #3c2524; --pl-marker: #d7aefb;
      --pl-step-loaf: #8ab4f8; --pl-step-view: #f28b82; --pl-step-app: #81c995;
      color-scheme: dark;
    }
  }`;

/** A beágyazott keret: jobb alsó sarok, összecsukható. `position: fixed`, de
 *  a gazda lapot nem mozdítja el, és `pointer-events` csak a kereten. */
const SHELL = `
  * { box-sizing: border-box; }
  .pl-panel {
    position: fixed; right: 12px; bottom: 12px; z-index: 2147483000;
    width: min(680px, calc(100vw - 24px)); max-height: calc(100vh - 24px);
    display: flex; flex-direction: column;
    border: 1px solid var(--pl-line); border-radius: 8px;
    background: var(--pl-bg); color: var(--pl-fg);
    box-shadow: 0 8px 32px rgb(0 0 0 / .28);
    font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .pl-head { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid var(--pl-line); flex: none; }
  .pl-head strong { font-size: 12px; font-weight: 600; }
  .pl-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--pl-muted); flex: none; }
  .pl-live .pl-dot { background: var(--pl-step-app); }
  .pl-meta { color: var(--pl-muted); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .pl-head button { font: inherit; font-size: 11px; padding: 3px 8px; border: 1px solid var(--pl-line); border-radius: 4px; background: var(--pl-bg); color: var(--pl-fg); cursor: pointer; flex: none; }
  .pl-head button:hover { background: var(--pl-soft); }
  .pl-body { padding: 4px 12px 14px; overflow: auto; }
  .pl-collapsed .pl-body { display: none; }
  .pl-note { margin: 8px 0 2px; padding: 6px 8px; border-left: 3px solid var(--pl-warn); background: var(--pl-warn-bg); color: var(--pl-fg); }
  .pl-h { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--pl-muted); margin: 14px 0 4px; font-weight: 600; }
  details.pl-raw > summary { cursor: pointer; color: var(--pl-muted); margin-top: 14px; }
  table.pl-counters { border-collapse: collapse; }
  table.pl-counters td { padding: 0 14px 0 0; font: 11px ui-monospace, Menlo, monospace; }
  table.pl-counters td.v { text-align: right; font-variant-numeric: tabular-nums; }`;

/** A `render.ts` osztályai. Ez a rész tükrözi a panel CSS-ét — a
 *  változónevek az egyetlen különbség (`--pl-` előtag). */
const RENDERED = `
  .band { display: grid; grid-template-columns: minmax(150px, 210px) 110px 1fr; align-items: center; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--pl-line); }
  .band-head { display: flex; flex-direction: column; min-width: 0; }
  .band-title { font-weight: 600; display: flex; align-items: center; gap: 5px; }
  .band-info { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; border: 1px solid var(--pl-muted); border-radius: 50%; color: var(--pl-muted); font: italic 700 9px/1 Georgia, serif; cursor: help; }
  .band-info:hover, .band-info:focus-visible { color: var(--pl-accent); border-color: var(--pl-accent); outline: none; }
  .band-tip { display: none; position: absolute; left: -6px; bottom: calc(100% + 7px); z-index: 3; width: 330px; max-width: 74vw; padding: 8px 10px; border: 1px solid var(--pl-line); border-radius: 5px; background: var(--pl-bg); color: var(--pl-fg); box-shadow: 0 4px 16px rgb(0 0 0 / .22); font: normal 400 11.5px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; cursor: default; }
  .band-tip::after { content: ""; position: absolute; left: 0; right: 0; bottom: -9px; height: 9px; }
  .band-info:hover .band-tip, .band-info:focus .band-tip { display: block; }
  .band-tip > span { display: block; }
  .band-tip > span + span { margin-top: 6px; }
  .band-tip .band-tip-foot { color: var(--pl-muted); border-top: 1px solid var(--pl-line); padding-top: 6px; }
  .band-q { color: var(--pl-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .band-nums { display: flex; align-items: baseline; gap: 3px; flex-wrap: wrap; font-variant-numeric: tabular-nums; }
  .band-cur { font-size: 15px; font-weight: 600; }
  .band-unit { color: var(--pl-muted); }
  .band-peak { color: var(--pl-muted); font-size: 11px; width: 100%; }
  .band-chart { width: 100%; height: 30px; display: block; background: var(--pl-soft); border-radius: 3px; }
  .bar { fill: var(--pl-accent); }
  .bar.over { fill: var(--pl-over); }
  .bar.info { fill: var(--pl-info-bar); }
  .limit { stroke: var(--pl-muted); stroke-dasharray: 3 3; stroke-width: 1; vector-effect: non-scaling-stroke; }
  .marker { stroke: var(--pl-marker); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .finding { border: 1px solid var(--pl-line); border-radius: 5px; margin: 5px 0; background: var(--pl-bg); }
  .finding summary { display: flex; gap: 10px; align-items: baseline; padding: 5px 9px; cursor: pointer; list-style: none; }
  .finding summary::-webkit-details-marker { display: none; }
  .finding.critical summary { background: var(--pl-crit-bg); }
  .finding.warn summary { background: var(--pl-warn-bg); }
  .sev { font-size: 10px; font-weight: 700; letter-spacing: .04em; min-width: 62px; }
  .critical .sev { color: var(--pl-over); } .warn .sev { color: var(--pl-warn); } .info .sev { color: var(--pl-muted); }
  .ftitle { flex: 1; font-weight: 500; }
  .ftime { color: var(--pl-muted); font-variant-numeric: tabular-nums; }
  .fbody { padding: 6px 11px 9px; }
  .chain { list-style: none; margin: 0 0 8px; padding: 0; }
  .chain li { padding: 1px 0 1px 10px; border-left: 3px solid var(--pl-line); }
  .step.loaf { border-left-color: var(--pl-step-loaf); }
  .step.view { border-left-color: var(--pl-step-view); }
  .step.app { border-left-color: var(--pl-step-app); }
  table.views { border-collapse: collapse; margin: 4px 0 10px; font-variant-numeric: tabular-nums; }
  table.views th { text-align: left; font-weight: 500; color: var(--pl-muted); padding: 0 14px 2px 0; }
  table.views td { padding: 1px 14px 1px 0; border-top: 1px solid var(--pl-line); }
  table.views td.v { text-align: right; }
  .views-cap { margin: 8px 0 2px; color: var(--pl-muted); }
  .facts td { padding: 0 14px 0 0; } .facts td:first-child { color: var(--pl-muted); } .facts td.v { font-variant-numeric: tabular-nums; }
  .hyp { margin: 6px 0 0; font-style: italic; }
  .hint { margin: 4px 0 0; color: var(--pl-muted); }
  .empty { color: var(--pl-muted); }`;

export const DASHBOARD_CSS = [TOKENS, SHELL, RENDERED].join('\n');
