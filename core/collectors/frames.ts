/** Képkockák és eldobott képkockák — BECSLÉS (27-es doksi 9. fejezet).
 *
 *  Szabvány frame-timing API nincs; a rAF-hívások közti időből becsülünk. A
 *  képkocka-időt nem 16,7 ms-ra égetjük be (120 Hz-es kijelzőn 8,3), hanem a
 *  közelmúlt deltáiból tanuljuk: az utolsó 60 delta 10. percentilise. */
/** Ennél hosszabb rés már nem „kiesett képkocka", hanem SZÜNET: a böngésző
 *  nem rajzolta a lapot (rejtett vagy fojtott fül, alvó gép, megállított
 *  hibakereső). Ezeket kiesésként számolni félrevezet — egy 15 s-os
 *  ablakváltás 897 „kiesett képkockát" adott, holott a felhasználó nem is
 *  nézte a lapot. 250 ms ≈ 15 képkocka 60 Hz-en. */
export const PAUSE_MS = 250;

export class FrameTally {
  private recent: number[] = [];
  frames = 0;
  dropped = 0;
  /** Összes szünet ms-ban — látszik, de nem kiesés. */
  pausedMs = 0;

  /** @returns a kiesett képkockák becslése és a szünet hossza. */
  add(deltaMs: number, hidden = false): { dropped: number; pausedMs: number } {
    this.frames++;
    if (hidden || deltaMs > PAUSE_MS) {
      this.pausedMs += deltaMs;
      return { dropped: 0, pausedMs: deltaMs };
    }
    this.recent.push(deltaMs);
    if (this.recent.length > 60) this.recent.shift();
    const lost = Math.max(0, Math.round(deltaMs / this.frameMs()) - 1);
    this.dropped += lost;
    return { dropped: lost, pausedMs: 0 };
  }

  frameMs(): number {
    if (this.recent.length < 10) return 1000 / 60;
    const sorted = [...this.recent].sort((a, b) => a - b);
    return Math.min(50, Math.max(4, sorted[Math.floor(sorted.length * 0.1)]));
  }

  reset(): void { this.recent = []; this.frames = 0; this.dropped = 0; this.pausedMs = 0; }
}

/** rAF-hurok; a visszaadott függvény leállítja. Csak rögzítés közben fut —
 *  a rAF maga is főszál-munka.
 *
 *  A rejtettséget a hívás pillanatában olvassuk: rejtett fülön a böngésző
 *  ritkábban (vagy egyáltalán nem) hív, és az így keletkező rés szünet, nem
 *  kiesés. */
export function watchFrames(onFrame: (now: number, deltaMs: number, hidden: boolean) => void): () => void {
  let last = 0;
  let live = true;
  const tick = (now: number) => {
    if (!live) return;
    if (last) onFrame(now, now - last, document.visibilityState === 'hidden');
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { live = false; };
}
