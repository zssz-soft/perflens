import type { Messages } from './hu.ts';

/** The PerfLens English texts. The shape comes from `hu.ts` (the source):
 *  tsc rejects a missing key or a wrong template signature. */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const en: Messages = {
  units: { count: '', perSec: '/s', perMin: '/min', ms: 'ms', pct: '%' },

  panel: {
    static: {
      waiting: 'waiting',
      waitingMeta: 'Waiting for the agent… (enable the origin in the popup, then reload the page)',
      backToLive: 'Back to live',
      save: 'Save',
      load: 'Load',
      timeline: 'Timeline — per second (last 120 s at most)',
      findingsHeading: 'Findings',
      legendIntro: 'The chain of a finding, by data layer:',
      legendLoaf: 'LoAF (browser)',
      legendView: 'view (component, DOM)',
      legendApp: 'app (worker, store).',
      legendNote: 'The chain shows evidence, not the cause — the cause is confirmed by an A/B measurement.',
      viewsHeading: 'Views — which component and which area did the work?',
      rawCounters: 'Raw counters',
    },
    modeLive: 'live',
    modeLoaded: 'loaded',
    modeDetached: 'detached',
    detached: 'The extension was reloaded or updated — close and reopen DevTools.',
    events: (n) => `${n} ${plural(n, 'event', 'events')}`,
    reportsDropped: (n) => `${n} ${plural(n, 'report', 'reports')} dropped`,
    eventsDropped: (n) => `${n} ${plural(n, 'event', 'events')} lost from the buffer`,
    findings: (n) => `Findings (${n})`,
    loadError: (why) => `The file cannot be loaded: ${why}`,
    notPainted: 'not painted',
  },

  embed: {
    live: 'Live',
    pause: 'Pause',
    evaluate: 'Evaluate',
    collapse: 'Collapse',
    expand: 'Expand',
    close: 'Close',
    paused: 'paused',
    cost: 'This view runs on the MEASURED page, so it costs main-thread work itself: collapse it while measuring - collapsed it neither draws nor schedules. The rule engine does not run live; "Evaluate" runs it once.',
    rulesIdle: 'Findings do not run live - use "Evaluate" to compute them.',
    noAgent: 'No PerfLens agent on this page (window.__perfLens). Load the agent in your dev build, or use the extension.',
  },

  dashboard: {
    severity: { critical: 'CRITICAL', warn: 'WARNING', info: 'INFO' },
    peak: (value) => `peak ${value}`,
    whatIsIt: (title) => `${title}: what does it mean?`,
    tipFoot: 'One bar = 1 second. The big number is the last full second, the peak is the maximum of the visible window.',
    barInfo: 'informational: no main-thread evidence',
    noFindings: 'No findings. (A quiet state is a result too — the rules do not raise alarms without a reason.)',
    layer: (layer) => `data layer: ${layer}`,
    views: {
      components: (runs, ms) => `Components — ${runs} view ${plural(runs, 'run', 'runs')}, ${ms} ms in total (Angular profile, dev build: the ranking is reliable, production times are lower)`,
      noComponents: 'The profiler hook is installed, but no component events arrived — all time went to the framework. This Angular version probably uses different (internal) profiler events.',
      noProfile: 'No component profile: Angular\'s profiler hook only exists in dev builds (e.g. ng serve). DOM areas are shown for every build.',
      cols: { component: 'component', ms: 'self time (ms)', checks: 'checks', part: 'most expensive part' },
      dom: (n) => `DOM areas — ${n} ${plural(n, 'change', 'changes')} (where the screen changed)`,
      domCols: { area: 'area', changes: 'changes' },
      empty: 'No view data yet.',
    },
    cause: {
      probable: (text) => `Probable cause: ${text}`,
      possible: (text) => `Possible cause: ${text}`,
    },
  },

  bands: {
    busy: {
      title: 'Main thread busy', unit: '%', question: 'Is the main thread blocked?',
      info: 'Total time of the long (over 50 ms) tasks that started in this second, as a percentage: 500 ms = 50%. No standard API reports short tasks, so the real load can be higher.\n'
        + 'Dashed line: 50%, red above it. It only becomes a finding when the 5-second average crosses it too; a single spiking second is not enough.',
    },
    longtasks: {
      title: 'Long tasks', unit: '', question: 'Are there long tasks?',
      info: 'How many main-thread tasks longer than 50 ms started in this second (Long Tasks API). While one runs, the page neither responds nor paints.\n'
        + 'Every bar is red: a single long task is already a finding.',
    },
    frames: {
      title: 'Dropped frames', unit: '', question: 'Is the screen stuttering?',
      info: 'ESTIMATE from the gaps between requestAnimationFrame callbacks: a gap N frames long means N − 1 dropped. The frame time is learned from recent frames (16.7 ms at 60 Hz, 8.3 ms at 120 Hz). A gap over 250 ms is a pause (hidden tab, sleeping machine), not a drop.\n'
        + 'Red: a long task ran during the gap, or at least 3 frames were dropped.\n'
        + 'Orange: informational, no trace on the main thread. JavaScript did not block; the suspects are garbage collection, the compositor, another tab or the system.',
    },
    ws: {
      title: 'WS messages', unit: '/s', question: 'How often do live events arrive?',
      info: 'Incoming WebSocket messages per second: sockets opened on the main thread and in the instrumented worker combined. Without instrumentation the worker sockets are not visible.\n'
        + 'No threshold: this is the load the peaks of the other bands can be read against.',
    },
    worker: {
      title: 'Worker → main', unit: '/s', question: 'How many messages reach the main thread?',
      info: 'Messages arriving on the main thread from a worker (or a MessagePort) per second. Each message is a separate main-thread task.\n'
        + 'Dashed line: 60/s, roughly one message per frame. Red above it: sending more often is wasted, the screen cannot refresh any faster.',
    },
    store: {
      title: 'Store writes', unit: '/s', question: 'Are we writing more than can be painted?',
      info: 'Store writes per second, from the app-aware adapter (always 0 without one, e.g. on other sites).\n'
        + 'Dashed line: the number of frames in that second (60 if unknown). Red above it: more writes than frames, so nobody sees the intermediate states — they only cost work.',
    },
    inp: {
      title: 'Slowest interaction', unit: 'ms', question: 'Does expensive work follow the interaction?',
      info: 'Duration of the slowest interaction (click, key press, tap) that started in this second, per the Event Timing API: from the input to the next paint, including the handler. Interactions under 16 ms are not reported.\n'
        + 'Above 100 ms it is already a finding (warning). Dashed line: 200 ms, critical and red above it.',
    },
    pipeline: {
      title: 'WS → render p95', unit: 'ms', question: 'How long until fresh data reaches the screen? (since start)',
      info: 'The 95th percentile of the time from a WebSocket message arriving to it being painted, from the app-aware adapter (0 without one, e.g. on other sites).\n'
        + 'CUMULATIVE: the p95 since recording started, not per second, so it moves slowly and an old peak stays in it for a long time.\n'
        + 'Dashed line: 100 ms, red above it.',
    },
  },

  rules: {
    longTask: {
      title: (ms) => `Long task: ${ms} ms`,
      facts: { duration: 'task duration (ms)', blocking: 'blocking part (ms)' },
      hint: 'Check what ran in this task — the LoAF steps show the entry point.',
    },
    busy: {
      title: (pct, seconds) => `Main thread ${pct}% busy over ${seconds} s`,
      facts: { pct: 'busy (%)', longTasks: 'long tasks' },
      hint: 'The UI stutters in this window. Check the long tasks and the messages arriving at the same time.',
    },
    slowInteraction: {
      title: (name, ms) => `Slow interaction (${name}): ${ms} ms`,
      facts: { latency: 'latency (ms)', event: 'event' },
      hint: 'The user waited this long for feedback. Check what ran in the handler and after it.',
    },
    inputDelay: {
      title: (ms) => `Input delay: ${ms} ms`,
      facts: { delay: 'delay (ms)', event: 'event' },
      hint: 'The handler could not even start — the main thread was busy. This is NOT a slow handler: check what ran before it.',
    },
    workerBurst: {
      title: (n, ms) => `${n} worker messages in ${ms} ms`,
      facts: { messages: 'messages', mainMs: 'main-thread time (ms)' },
      hint: 'More than one message per frame never shows on screen anyway. Check whether the worker batches its sends.',
      rateTitle: (n) => `${n} worker messages/s`,
      rateFacts: { rate: 'messages/s' },
      rateHint: 'Consistently more messages than frames. Check the worker\'s send rate.',
    },
    storeChurn: {
      title: (writes, frames) => `${writes} store ${plural(writes, 'write', 'writes')}, ${frames} ${plural(frames, 'frame', 'frames')}`,
      facts: { writes: 'store writes/s', frames: 'frames/s' },
      hint: 'Writing what cannot be painted is wasted work. Check whether the bridge merges the batches (NODE 27).',
      hypothesis: 'the store is written more often than the screen can refresh',
    },
    wsBurst: {
      title: (n, ms) => `${ms} ms task after a WS burst (${n} messages/s)`,
      facts: { peak: 'WS messages in the burst second', average: 'previous 10 s average', task: 'task duration (ms)' },
      hint: 'Check whether the page processes the burst\'s messages one by one or merged.',
      hypothesis: 'synchronous processing after a burst of live events',
    },
    interactionThenWork: {
      title: (name, ms) => `${ms} ms task after ${name}`,
      unnamed: 'interaction',
      facts: { interaction: 'interaction (ms)', task: 'task duration (ms)' },
      hint: 'Check what this interaction starts synchronously.',
      hypothesis: 'the interaction handler, or work it started, blocks the main thread',
    },
    droppedFrames: {
      title: (n, gapMs) => `${n} dropped ${plural(n, 'frame', 'frames')} (${gapMs} ms gap)`,
      facts: { dropped: 'dropped frames', gap: 'gap (ms)', evidence: 'main-thread evidence' },
      evidenceTask: (ms) => `long task, ${ms} ms`,
      evidenceNone: 'none',
      hintTask: 'A long task ran during the gap — the chain shows what started it.',
      hintNone: 'There was NO long task on the main thread (LoAF only reports above 50 ms, too): the gap does not come from JavaScript blocking. The suspects are garbage collection, the compositor, another tab or the system — only a trace can tell (chapter 17).',
      hypothesis: 'the frame was not dropped because the main thread was blocked',
    },
    pipelineSlow: {
      title: (ms) => `WS → render p95: ${ms} ms`,
      facts: { p95: 'p95 (ms), since recording started' },
      hint: 'This is how long fresh odds take to reach the screen. Check the batch-wait and main-thread tracks.',
    },
    merged: {
      title: (title, n, seconds) => `${title} — ${n}×, over ${seconds} s`,
      facts: { count: 'occurrences', duration: 'duration (s)' },
    },
  },

  enrich: {
    invoker: (label) => `invoker: ${label}`,
    script: (ms) => `${ms} ms of JavaScript`,
    rest: (ms) => `rest of the frame (render, layout, idle): ${ms} ms`,
    anonymous: 'anonymous function',
    top: (ms, where, file) => `of which ${ms} ms: ${where}${file ? ` — ${file}` : ''}`,
    workerBefore: (n) => `${n} worker ${plural(n, 'message', 'messages')} in the 500 ms before and during the finding`,
    wsPage: (n) => `${n} WS ${plural(n, 'message', 'messages')} on the page in the same window`,
    storeWrites: (n) => `${n} store ${plural(n, 'write', 'writes')} in this second`,
    wsWorker: (n) => `${n} WS ${plural(n, 'message', 'messages')} in the worker in this second`,
    viewRuns: (ms, runs) => `${ms} ms of view updates (${runs} ${plural(runs, 'run', 'runs')}, Angular profile — dev build)`,
    component: (name, ms, checks, part, partMs) =>
      `of which ${ms} ms: ${name}${checks ? ` (checked ${checks}×)` : ''}${part ? ` — mostly ${part}: ${partMs} ms` : ''}`,
    dom: (n, where) => `${n} DOM ${plural(n, 'change', 'changes')}${where ? `; most of them: ${where}` : ''}`,
  },

  session: {
    notJson: 'Not JSON.',
    unknownSchema: (got, want) => `Unknown schema: ${got} (expected: ${want}).`,
    incomplete: 'Incomplete session.',
  },

  diff: {
    metrics: {
      worstTask: 'Longest task', longTasks: 'Long tasks', busy: 'Main thread busy', inp: 'INP',
      dropped: 'Dropped frames', pipelineP95: 'WS → render p95', workerIn: 'Worker → main messages',
      store: 'Store writes', storePerBatch: 'Store write per batch', critical: 'Critical findings',
    },
    otherPage: (a, b) => `different page: ${a} → ${b}`,
    otherMode: (a, b) => `different mode: ${a} → ${b} (the app-aware metrics exist in only one of them)`,
    otherLength: (a, b) => `different length: ${a} s → ${b} s (counts are gated per minute)`,
    otherLoad: (a, b) => `different load: ${a} → ${b} WS messages/s — the difference is partly about the input, not the code`,
    otherView: (a, b) => `different view: ${a} → ${b}`,
    otherAgent: (a, b) => `different agent version: ${a} → ${b}`,
    base: 'base: ',
    next: 'new:  ',
    warning: (w) => `WARNING: ${w}`,
    regressed: (n) => `PERFORMANCE REGRESSION (${n} ${plural(n, 'metric', 'metrics')} over the threshold)`,
    noRegression: 'No regression by the thresholds.',
    threshold: 'threshold',
    allMetrics: 'All metrics:',
    percentPoints: 'pp',
    verdict: { improved: '↑ better', regressed: '↓ WORSE', stable: '· stable', 'n/a': '  n/a' },
  },

  popup: {
    unusable: 'Not available on this page.',
    enabled: 'Enabled on this origin.',
    disabled: 'Disabled.',
    disable: 'Disable',
    enable: 'Enable on this origin',
    note: 'After enabling, the page reloads: the agent has to load BEFORE the app. The measurement shows up in the DevTools "PerfLens" panel — if the panel was already open, close and reopen DevTools.',
  },

  cli: {
    usage: 'Usage: node tools/perflens-diff.mts --base=base.json --new=new.json [--json]',
    unreadable: (why) => `Cannot read the session: ${why}`,
  },
};
