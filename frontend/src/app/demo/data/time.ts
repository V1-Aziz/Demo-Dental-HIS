// Time helpers for the demo data. Sample times are local wall-clock times on
// the viewer's machine, stored as UTC ISO strings, which is how the real API
// serializes SQL Server timestamps. DATE columns use midnight UTC, again
// matching the API.

export const DEMO_PASSWORD = 'Demo@1234';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// "Now" at the moment the sample data is built.
let base = new Date();

export function resetBase(): void {
  base = new Date();
}

/** Local time `hhmm` on today + `dayOffset` days, as an ISO timestamp. */
export function at(dayOffset: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h, m).toISOString();
}

/** A timestamp relative to now, e.g. rel({ hours: -2 }). */
export function rel(delta: { days?: number; hours?: number; minutes?: number }): string {
  const minutes = (delta.days ?? 0) * 24 * 60 + (delta.hours ?? 0) * 60 + (delta.minutes ?? 0);
  return new Date(base.getTime() + minutes * MINUTE).toISOString();
}

/** A SQL DATE value for today + `dayOffset` days. */
export function dateOnly(dayOffset: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset);
  return `${ymd(d)}T00:00:00.000Z`;
}

/** The current time as an ISO timestamp. */
export function now(): string {
  return new Date().toISOString();
}

/** Local calendar date of `d` as YYYY-MM-DD. */
export function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Local calendar date of an ISO timestamp as YYYY-MM-DD. */
export function localDate(iso: string | null | undefined): string | null {
  return iso ? ymd(new Date(iso)) : null;
}

/** Today's local date as YYYY-MM-DD. */
export function today(): string {
  return ymd(new Date());
}

/** Whole local calendar days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY);
}

/** Shift an ISO timestamp or SQL DATE value by whole days. */
export function shiftDays(value: string, days: number): string {
  if (value.endsWith('T00:00:00.000Z')) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString();
  }
  return new Date(new Date(value).getTime() + days * DAY).toISOString();
}
