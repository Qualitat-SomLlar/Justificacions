import { Imputacio } from "./types";
import { percentCents } from "./sync_utils";

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10000) / 10000;

export interface ImputacioMeta {
  now: string;
  usuari?: string;
}

export interface AllocationInput {
  projecte_id: string;
  percentatge: number;
  import: number;
  observacions?: string;
}

/**
 * Imputacions of one despesa from the rows of the modal. One imputacio per project (the ID is
 * despesa_projecte): repeated rows are merged and empty rows dropped. At exactly 100% the last
 * amount takes the remainder, so the amounts add up to the invoice to the cent (50% + 50% of 10,01 €).
 */
export function buildImputacions(
  despesaId: string,
  totalFactura: number | undefined,
  allocations: AllocationInput[],
  meta: ImputacioMeta
): Imputacio[] {
  const byProject = new Map<string, Imputacio>();
  for (const a of allocations) {
    if (!a.projecte_id || (a.percentatge <= 0 && a.import === 0)) continue;
    const prev = byProject.get(a.projecte_id);
    byProject.set(a.projecte_id, {
      id: `${despesaId}_${a.projecte_id}`,
      despesa_id: despesaId,
      projecte_id: a.projecte_id,
      percentatge: round4((prev?.percentatge || 0) + a.percentatge),
      import: round2((prev?.import || 0) + a.import),
      observacions: [prev?.observacions, a.observacions].filter(Boolean).join(" / "),
      data_actualitzacio: meta.now,
      usuari: meta.usuari,
    });
  }
  const result = Array.from(byProject.values());

  const totalPercent = round2(result.reduce((acc, curr) => acc + curr.percentatge, 0));
  if (totalFactura !== undefined && result.length > 0 && percentCents(totalPercent) === 10000) {
    const last = result[result.length - 1];
    const others = result.slice(0, -1).reduce((acc, i) => acc + i.import, 0);
    last.import = round2(totalFactura - others);
  }
  return result;
}

/**
 * Same percentages applied to several despeses (replacing their previous imputacions). At 100%
 * the last project of each invoice takes the remainder.
 */
export function buildBulkImputacions(
  despeses: { id: string; total_factura: number }[],
  allocations: { projecte_id: string; percentatge: number }[],
  observacions: string,
  meta: ImputacioMeta
): { imputacions: Imputacio[]; validAllocations: { projecte_id: string; percentatge: number }[] } {
  const merged = new Map<string, number>();
  for (const a of allocations) {
    if (!a.projecte_id || !(a.percentatge > 0)) continue;
    merged.set(a.projecte_id, (merged.get(a.projecte_id) || 0) + a.percentatge);
  }
  const validAllocations = Array.from(merged.entries()).map(([projecte_id, percentatge]) => ({ projecte_id, percentatge }));
  const totalPercent = round2(validAllocations.reduce((acc, curr) => acc + curr.percentatge, 0));
  const closesInvoice = percentCents(totalPercent) === 10000;

  const imputacions: Imputacio[] = [];
  for (const d of despeses) {
    let totalImport = 0;
    validAllocations.forEach((alloc, i) => {
      const isLast = i === validAllocations.length - 1;
      const importAlloc = isLast && closesInvoice
        ? round2(d.total_factura - totalImport)
        : round2((alloc.percentatge / 100) * d.total_factura);
      totalImport += importAlloc;
      imputacions.push({
        id: `${d.id}_${alloc.projecte_id}`,
        despesa_id: d.id,
        projecte_id: alloc.projecte_id,
        percentatge: alloc.percentatge,
        import: importAlloc,
        observacions,
        data_actualitzacio: meta.now,
        usuari: meta.usuari,
      });
    });
  }
  return { imputacions, validAllocations };
}

/**
 * When A3 changes the total of an invoice the percentages are kept and the amounts recalculated;
 * invoices imputed at exactly 100% keep adding up to the new total to the cent.
 * Returns undefined when nothing needs to change.
 */
export function recalcImputacionsForTotals(
  imputacions: Imputacio[],
  changedTotals: Map<string, number>,
  now: string
): Imputacio[] | undefined {
  if (changedTotals.size === 0) return undefined;
  const updated = imputacions.map(imp => {
    const newTotal = changedTotals.get(imp.despesa_id);
    if (newTotal === undefined) return imp;
    return { ...imp, import: round2((imp.percentatge / 100) * newTotal), data_actualitzacio: now };
  });

  const byDespesa = new Map<string, number[]>();
  updated.forEach((imp, i) => {
    if (!changedTotals.has(imp.despesa_id)) return;
    byDespesa.set(imp.despesa_id, [...(byDespesa.get(imp.despesa_id) || []), i]);
  });
  for (const [despesaId, idxs] of byDespesa.entries()) {
    const pct = round2(idxs.reduce((acc, i) => acc + updated[i].percentatge, 0));
    if (percentCents(pct) !== 10000) continue;
    const lastIdx = idxs[idxs.length - 1];
    const others = idxs.slice(0, -1).reduce((acc, i) => acc + updated[i].import, 0);
    updated[lastIdx] = { ...updated[lastIdx], import: round2(changedTotals.get(despesaId)! - others) };
  }
  return updated;
}
