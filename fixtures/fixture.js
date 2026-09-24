// PerfLens fixture-segéd (27-es doksi 16.2).
// A terhelést a lap maga állítja elő, RENDES taskban — a Playwright
// `evaluate`-jéből futtatott blokkolás nem long task (15.1 tanulsága).
window.q = new URLSearchParams(location.search);
window.num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
window.__fixture = { done: false };
window.done = (after = 300) => setTimeout(() => { window.__fixture.done = true; }, after);
window.block = function block(ms) { const t = performance.now(); while (performance.now() - t < ms) { /* blokkol */ } };
