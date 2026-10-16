import { Despesa, Imputacio } from "./types";

/**
 * Items that changed or were removed between two versions of a list, so that only those
 * documents are written to Firestore (instead of overwriting the whole list).
 */
export function diffById<T>(prev: T[], next: T[], key: (item: T) => string): { upserts: T[]; deletes: string[] } {
  const prevMap = new Map<string, string>();
  for (const item of prev) prevMap.set(key(item), JSON.stringify(item));

  const nextMap = new Map<string, T>();
  for (const item of next) nextMap.set(key(item), item);

  const upserts: T[] = [];
  for (const [k, item] of nextMap.entries()) {
    if (prevMap.get(k) !== JSON.stringify(item)) upserts.push(item);
  }
  const deletes: string[] = [];
  for (const k of prevMap.keys()) {
    if (!nextMap.has(k)) deletes.push(k);
  }
  return { upserts, deletes };
}

/**
 * Union of the old cloud copy and this browser's copy. On conflict this browser wins: the
 * migration must be run from the computer with the most up-to-date data.
 */
export function mergeForMigration<T>(remote: T[] | null, local: T[] | null, key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of remote || []) map.set(key(item), item);
  for (const item of local || []) map.set(key(item), item);
  return Array.from(map.values());
}

export function estatFromPercent(totalPercent: number): Despesa["estat"] {
  if (totalPercent > 100.01) return "excedida";
  if (Math.abs(totalPercent - 100) <= 0.01) return "completada";
  if (totalPercent > 0) return "parcial";
  return "pendent";
}

/** Recomputes percentatge_total / import_total / estat of each despesa from its imputacions. */
export function recalcDespesesFromImputacions(despeses: Despesa[], imputacions: Imputacio[]): Despesa[] {
  const totals = new Map<string, { pct: number; imp: number }>();
  for (const imp of imputacions) {
    const t = totals.get(imp.despesa_id) || { pct: 0, imp: 0 };
    t.pct += imp.percentatge;
    t.imp += imp.import;
    totals.set(imp.despesa_id, t);
  }
  return despeses.map(d => {
    const t = totals.get(d.id) || { pct: 0, imp: 0 };
    const pct = Math.round(t.pct * 100) / 100;
    return {
      ...d,
      percentatge_total: pct,
      import_total: Math.round(t.imp * 100) / 100,
      estat: estatFromPercent(pct),
    };
  });
}

/** Firestore document IDs can't contain "/", be "." / ".." or look like "__x__". */
export function firestoreDocId(raw: string): string {
  const encoded = encodeURIComponent(raw);
  if (encoded === "" || encoded === "." || encoded === ".." || /^__.*__$/.test(encoded)) {
    return `id_${encoded}`;
  }
  return encoded;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
