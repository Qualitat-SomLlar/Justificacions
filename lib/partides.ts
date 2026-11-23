import { cleanStr } from "./parser";
import { Despesa, Partida } from "./types";

/**
 * The catalog ID of a partida written another way: A3's "Full destí" column gives
 * "DD_PROFESS ADMC I GESTIO" while the catalog has "DD_PROFESS ADMC i GESTIO". Same comparison as
 * addPartida (case, accents, spaces and punctuation ignored). Unknown codes are returned unchanged.
 */
export function canonicalPartidaId(id: string, partides: Pick<Partida, "id">[]): string {
  if (!id || partides.some(p => p.id === id)) return id;
  const key = cleanStr(id);
  if (!key) return id;
  const match = partides.find(p => cleanStr(p.id) === key);
  return match ? match.id : id;
}

export interface PartidaAlias {
  /** Code stored on the despeses, not in the catalog */
  from: string;
  /** Catalog partida it corresponds to */
  to: string;
  despeses: number;
}

/** Despeses whose partida is a catalog partida written another way (grouped by stored code). */
export function findPartidaAliases(despeses: Pick<Despesa, "partida_id">[], partides: Pick<Partida, "id">[]): PartidaAlias[] {
  const byCode = new Map<string, PartidaAlias>();
  for (const d of despeses) {
    const from = d.partida_id;
    if (!from) continue;
    const to = canonicalPartidaId(from, partides);
    if (to === from) continue;
    const entry = byCode.get(from) || { from, to, despeses: 0 };
    entry.despeses++;
    byCode.set(from, entry);
  }
  return Array.from(byCode.values()).sort((a, b) => a.from.localeCompare(b.from));
}
