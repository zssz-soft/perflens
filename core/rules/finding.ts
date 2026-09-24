/** A lelet és a szabály alakja (27-es doksi 12.1, 17.4/8). */

export type Severity = 'info' | 'warn' | 'critical';
export type Layer = 'observer' | 'loaf' | 'view' | 'app' | 'profile' | 'trace';

export interface Step { text: string; layer: Layer; value?: number; unit?: string; event?: number }

export interface Finding {
  /** Stabil azonosító (szabály + idő): az újraértékelés ugyanazt adja. */
  id: string;
  ruleId: string;
  severity: Severity;
  t: number;
  windowMs: number;
  title: string;
  /** Számok, amik a leletet alátámasztják. */
  facts: Record<string, number | string>;
  /** Mit NÉZZ meg — sosem „mit javíts" (12.3). */
  hint: string;
  /** A magyarázó lánc — a gazdagítók töltik (17.4/8). */
  steps: Step[];
  /** Kimondott hipotézis — soha nem „bizonyított". */
  hypothesis?: { text: string; confidence: 'possible' | 'probable' };
}
