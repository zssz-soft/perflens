import type { Locale } from './locale.ts';
import { hu, type Messages } from './hu.ts';
import { en } from './en.ts';

/** A PerfLens szövegei (panel, popup, leletek, diff).
 *
 *  A nyelvet a GAZDA dönti el egyszer, induláskor: a kiterjesztés a böngésző
 *  nyelvéből (`navigator.language`), a CLI a rendszeréből (`LANG`). A mag
 *  nem olvassa egyiket sem (határőr) — alapból magyar, így a tesztek és a
 *  meglévő kimenetek nem változnak.
 *
 *  A szöveg a lelet LÉTREHOZÁSAKOR dől el. Ez nem gond: a mentett munkamenet
 *  betöltéskor a mostani szabályokkal újraértékelődik (session.ts), tehát a
 *  mostani nyelven. */

export { localeFor, type Locale } from './locale.ts';
export type { Messages } from './hu.ts';

const DICTS: Record<Locale, Messages> = { hu, en };
let current: Locale = 'hu';

export function setLocale(l: Locale): void { current = l; }
export const locale = (): Locale => current;
export const t = (): Messages => DICTS[current];

/** Szám + mértékegység; a darab egysége angolul üres (nincs „0 pcs"). */
export const withUnit = (v: number | string, unit: string): string => (unit ? `${v} ${unit}` : String(v));
