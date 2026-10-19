import { Despesa, Imputacio } from "./types";

/** JSON with sorted keys: Firestore returns fields in alphabetical order, the app doesn't. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Marks a field removed from an item (translated to deleteField() when writing to Firestore). */
export const FIELD_DELETED = Symbol("FIELD_DELETED");

export interface ItemChanges<T> {
  /** Items that didn't exist: written whole */
  created: T[];
  /** Existing items: only the fields that changed (FIELD_DELETED for removed ones) */
  updated: { key: string; fields: Record<string, unknown> }[];
  deleted: string[];
}

/**
 * What changed between two versions of a list, field by field. Writing only the changed fields
 * means two users editing different fields of the same item don't overwrite each other.
 */
export function diffItems<T extends object>(prev: T[], next: T[], key: (item: T) => string): ItemChanges<T> {
  const prevMap = new Map<string, T>();
  for (const item of prev) prevMap.set(key(item), item);
  const nextMap = new Map<string, T>();
  for (const item of next) nextMap.set(key(item), item);

  const created: T[] = [];
  const updated: { key: string; fields: Record<string, unknown> }[] = [];
  for (const [k, item] of nextMap.entries()) {
    const before = prevMap.get(k);
    if (before === undefined) {
      created.push(item);
      continue;
    }
    if (before === item) continue;
    const a = before as Record<string, unknown>;
    const b = item as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (b[f] === undefined) {
        if (a[f] !== undefined) fields[f] = FIELD_DELETED;
      } else if (stableStringify(a[f]) !== stableStringify(b[f])) {
        fields[f] = b[f];
      }
    }
    if (Object.keys(fields).length > 0) updated.push({ key: k, fields });
  }
  const deleted: string[] = [];
  for (const k of prevMap.keys()) {
    if (!nextMap.has(k)) deleted.push(k);
  }
  return { created, updated, deleted };
}

export function hasChanges(c: ItemChanges<unknown>): boolean {
  return c.created.length > 0 || c.updated.length > 0 || c.deleted.length > 0;
}

/** FNV-1a: stable shard number for an item key */
export function shardOf(key: string, shards: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % shards;
}

/** Map keys can't be empty or look like "__x__"; "/" and "." are encoded to keep them readable. */
export function itemKey(raw: string): string {
  const encoded = encodeURIComponent(raw).replace(/\./g, "%2E");
  if (encoded === "" || /^__.*__$/.test(encoded)) return `id_${encoded}`;
  return encoded;
}

/**
 * Migration source for one list: the copy of this browser if it has one, otherwise the cloud copy.
 * Not a union: a union would bring back items deleted in one of the two copies.
 */
export function pickMigrationSource<T>(remote: T[] | null, local: T[] | null): { items: T[]; source: "núvol" | "aquest navegador" | "cap" } {
  if (local && local.length > 0) return { items: local, source: "aquest navegador" };
  if (remote && remote.length > 0) return { items: remote, source: "núvol" };
  return { items: [], source: "cap" };
}

/** Items that exist only in `other` (shown to the user before migrating, not migrated). */
export function countMissing<T>(base: T[], other: T[] | null, key: (item: T) => string): number {
  if (!other) return 0;
  const keys = new Set(base.map(key));
  return other.filter(item => !keys.has(key(item))).length;
}

/** Percentage in whole hundredths (100% -> 10000), to compare without floating point errors. */
export function percentCents(percent: number): number {
  return Math.round(percent * 100);
}

export function estatFromPercent(totalPercent: number): Despesa["estat"] {
  const cents = percentCents(totalPercent);
  if (cents > 10000) return "excedida";
  if (cents === 10000) return "completada";
  if (cents > 0) return "parcial";
  return "pendent";
}

/**
 * Amount of an invoice still to justify, the same in every screen and in the Excel export.
 * Excesses don't offset other invoices; credit notes (negative totals) keep their sign.
 */
export function disponibleOf(d: { total_factura: number; import_total: number }): number {
  const rest = (d.total_factura || 0) - (d.import_total || 0);
  return d.total_factura >= 0 ? Math.max(0, rest) : Math.min(0, rest);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
