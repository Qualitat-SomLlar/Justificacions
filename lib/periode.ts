/** Justification period of a project, both ends included, as yyyy-mm-dd. */
export interface Periode {
  from: string;
  to: string;
}

const DATE_RE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/g;

function toIso(d: string, m: string, y: string): string | null {
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (month < 1 || month > 12 || day < 1) return null;
  // Day 31 of a 30-day month (or 30 Feb) is not a date
  if (day > new Date(year, month, 0).getDate()) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Reads the free text of a project ("01/01/2026-31/12/2026", also "01/01/2026 - 31/12/2026" or
 * with dots / dashes) into a period. Returns null when it doesn't hold two valid dates in order.
 */
export function parsePeriode(text?: string | null): Periode | null {
  if (!text) return null;
  const dates: string[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const iso = toIso(m[1], m[2], m[3]);
    if (!iso) return null;
    dates.push(iso);
  }
  if (dates.length !== 2 || dates[0] > dates[1]) return null;
  return { from: dates[0], to: dates[1] };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True when the invoice date is known and falls outside the period. Without a period, or with a
 * date that can't be read, nothing is flagged (no false alarms).
 */
export function isOutsidePeriode(dateIso: string | undefined | null, periode: Periode | null): boolean {
  if (!periode || !dateIso || !ISO_RE.test(dateIso)) return false;
  return dateIso < periode.from || dateIso > periode.to;
}

/** yyyy-mm-dd -> dd/mm/yyyy (anything else is returned as is) */
export function formatDateCa(dateIso: string | undefined | null): string {
  if (!dateIso) return "-";
  if (!ISO_RE.test(dateIso)) return dateIso;
  const [y, m, d] = dateIso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatPeriode(periode: Periode | null): string {
  return periode ? `${formatDateCa(periode.from)} – ${formatDateCa(periode.to)}` : "sense període definit";
}
