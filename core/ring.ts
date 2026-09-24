/** Fix méretű gyűrűs puffer (27-es doksi 11.3).
 *
 *  A nyers eseményfolyam korlátos memóriában él: ha betelt, a legrégebbi
 *  bejegyzés esik ki. A veszteséget NEM hallgatjuk el — a `dropped` számláló
 *  a panelre kerül. */
export class Ring<T> {
  private readonly buf: (T | undefined)[];
  private head = 0;
  private count = 0;
  /** Összesen hány elem érkezett (a kiesettekkel együtt). */
  total = 0;

  readonly capacity: number;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError(`capacity: ${capacity}`);
    this.capacity = capacity;
    this.buf = new Array(capacity);
  }

  push(item: T): void {
    this.buf[(this.head + this.count) % this.capacity] = item;
    if (this.count < this.capacity) this.count++;
    else this.head = (this.head + 1) % this.capacity;
    this.total++;
  }

  get size(): number { return this.count; }
  get dropped(): number { return this.total - this.count; }

  /** Időrendben, a legrégebbitől. */
  toArray(): T[] {
    const out: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) out[i] = this.buf[(this.head + i) % this.capacity] as T;
    return out;
  }

  clear(): void {
    this.buf.fill(undefined);
    this.head = 0;
    this.count = 0;
    this.total = 0;
  }
}
