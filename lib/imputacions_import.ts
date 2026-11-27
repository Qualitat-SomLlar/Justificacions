import * as XLSX from "xlsx";
import { Despesa, Imputacio, Projecte } from "./types";
import { cleanStr, parseNum } from "./parser";
import { round2, round4 } from "./imputacions";
import { importImputable } from "./sync_utils";

/**
 * Import of the imputations kept in a working Excel (the «Justificacions_a3_Treball» file):
 * one sheet per partida (DD_...) with a block of project columns. Each project column has the
 * percentage of the row (as a fraction: 0.5 = 50%) and, next to it, the amount.
 * Above the column headers there are the rows «Finançador», «Àrea» and «Projecte» that identify
 * the project of each column.
 */

export interface ColumnaProjecte {
  /** codi|finançador|àrea, unique within the file */
  key: string;
  codi: string;
  financador: string;
  area: string;
  /** Rows of the file with a percentage in this column */
  files: number;
}

export interface FilaTreball {
  full: string;
  fila: number; // 1-based row of the sheet
  numapunte: string;
  ndoc_a3: string;
  factura: string;
  /** CODI ANALÍTIC PIS */
  pis: string;
  cost_total: number;
  /** Percentage per column key, as a fraction (0.5 = 50%) */
  percentatges: Record<string, number>;
}

export interface FitxerTreball {
  columnes: ColumnaProjecte[];
  files: FilaTreball[];
  /** DD_ sheets that do not have the expected layout */
  fullsIgnorats: string[];
}

const PARTIDA_SHEET = /^DD_/i;

function cellText(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

export function sheetNamesTreball(names: string[]): string[] {
  return names.filter(n => PARTIDA_SHEET.test(n));
}

/** Reads the project columns and the rows with imputations of a working-file sheet given as rows of cells. */
export function readFullTreball(full: string, rows: unknown[][], columnes: Map<string, ColumnaProjecte>): FilaTreball[] | null {
  const head = rows.slice(0, 15);
  const headerRow = head.findIndex(r => (r || []).some(v => cleanStr(v) === "ndoca3"));
  let projRow = -1;
  let projCol = -1;
  head.forEach((r, i) => {
    if (projRow !== -1 || i >= headerRow) return;
    const j = (r || []).findIndex(v => cleanStr(v) === "projecte");
    if (j !== -1) { projRow = i; projCol = j; }
  });
  if (headerRow === -1 || projRow < 2) return null;

  const header = rows[headerRow] || [];
  const col = (...names: string[]) => header.findIndex(v => names.includes(cleanStr(v)));
  const cApunte = col("numapunte");
  const cDoc = col("ndoca3");
  const cFactura = col("factura");
  const cPis = col("codianaliticpis");
  // «Cost Total», «Cost Total Factura», «Cost Total (Total del concepte)»...
  const cCost = header.findIndex(v => cleanStr(v).startsWith("costtotal"));
  if (cDoc === -1 || cCost === -1) return null;

  // Project columns: every column to the right of the «Projecte» label with a code
  const codis = rows[projRow] || [];
  const fins = rows[projRow - 2] || [];
  const areas = rows[projRow - 1] || [];
  const projectCols: { col: number; key: string }[] = [];
  for (let j = projCol + 1; j < codis.length; j++) {
    const codi = cellText(codis[j]);
    if (!codi) continue;
    const financador = cellText(fins[j]);
    const area = cellText(areas[j]);
    const key = `${codi}|${financador}|${area}`;
    if (!columnes.has(key)) columnes.set(key, { key, codi, financador, area, files: 0 });
    projectCols.push({ col: j, key });
  }

  const result: FilaTreball[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const ndoc = cellText(r[cDoc]);
    const apunte = cApunte !== -1 ? cellText(r[cApunte]) : "";
    if (!ndoc && !apunte) continue;
    const percentatges: Record<string, number> = {};
    for (const { col: j, key } of projectCols) {
      const v = r[j];
      if (v === null || v === undefined || v === "") continue;
      const pct = parseNum(v);
      if (!Number.isFinite(pct) || Math.abs(pct) < 1e-9) continue;
      percentatges[key] = (percentatges[key] || 0) + pct;
    }
    if (Object.keys(percentatges).length === 0) continue;
    for (const key of Object.keys(percentatges)) columnes.get(key)!.files++;
    result.push({
      full,
      fila: i + 1,
      numapunte: apunte,
      ndoc_a3: ndoc,
      factura: cFactura !== -1 ? cellText(r[cFactura]) : "",
      pis: cPis !== -1 ? cellText(r[cPis]) : "",
      cost_total: parseNum(r[cCost]),
      percentatges,
    });
  }
  return result;
}

/** Reads the whole working file (only the DD_ sheets). */
export function readFitxerTreball(buffer: ArrayBuffer | Uint8Array): FitxerTreball {
  const names = XLSX.read(buffer, { type: "array", bookSheets: true }).SheetNames;
  const fulls = sheetNamesTreball(names);
  const wb = XLSX.read(buffer, { type: "array", sheets: fulls, dense: true, cellDates: false, cellFormula: false, cellHTML: false, cellText: false });
  const columnes = new Map<string, ColumnaProjecte>();
  const files: FilaTreball[] = [];
  const fullsIgnorats: string[] = [];
  for (const full of fulls) {
    const ws = wb.Sheets[full];
    if (!ws) continue;
    // range: 0 starts at the first row of the sheet even when its range starts lower (A2:...),
    // so the row numbers match the sheet
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true, range: 0 });
    const fullFiles = readFullTreball(full, rows, columnes);
    if (fullFiles === null) fullsIgnorats.push(full);
    else files.push(...fullFiles);
  }
  return { columnes: Array.from(columnes.values()), files, fullsIgnorats };
}

/**
 * Suggested project of the app for each column of the file: same code, finançador and àrea;
 * otherwise same code and finançador; otherwise the code alone when only one project has it.
 */
export function suggestProjectes(columnes: ColumnaProjecte[], projectes: Projecte[]): Record<string, string> {
  const result: Record<string, string> = {};
  const norm = (s: string) => cleanStr(s);
  for (const c of columnes) {
    const sameCodi = projectes.filter(p => norm(p.codi) === norm(c.codi) || norm(p.id) === norm(c.codi));
    const exact = sameCodi.filter(p => norm(p.financador) === norm(c.financador) && norm(p.area) === norm(c.area));
    const sameFin = sameCodi.filter(p => norm(p.financador) === norm(c.financador));
    const pick = exact.length === 1 ? exact[0] : sameFin.length === 1 ? sameFin[0] : sameCodi.length === 1 ? sameCodi[0] : undefined;
    if (pick) result[c.key] = pick.id;
  }
  return result;
}

export type EstatPla = "nova" | "igual" | "sobreescriu";

export interface CanviImputacio {
  despesa: Despesa;
  allocations: { projecte_id: string; percentatge: number; import: number }[];
  anteriors: Imputacio[];
  estat: EstatPla;
  /** Sum of the cost of the file rows differs from the cost of the invoice in the app */
  costDiferent: boolean;
  /** The invoice is in another partida in the app */
  partidaDiferent: boolean;
  files: FilaTreball[];
}

export interface PlaImportacio {
  canvis: CanviImputacio[];
  /** Rows that do not match any invoice of the app */
  noTrobades: FilaTreball[];
  /** Rows that match several invoices and cannot be told apart */
  ambigues: FilaTreball[];
  /** Rows with percentages only in columns without a project of the app */
  senseProjecte: FilaTreball[];
}

const normDoc = (s: string) => cleanStr(s);

/**
 * Matches each row with an invoice of the app (NDOC_A3 + partida of the sheet, then invoice number
 * and apunte to tell apart) and builds the imputations: the amount of each project is the sum of
 * percentage × cost of its rows, and the percentage is that amount over the cost of the invoice.
 */
export function planImportacio(
  fitxer: Pick<FitxerTreball, "files">,
  despeses: Despesa[],
  imputacions: Imputacio[],
  projecteDeColumna: Record<string, string | undefined>
): PlaImportacio {
  const byDoc = new Map<string, Despesa[]>();
  for (const d of despeses) {
    const k = normDoc(d.ndoc_a3);
    if (!k) continue;
    if (!byDoc.has(k)) byDoc.set(k, []);
    byDoc.get(k)!.push(d);
  }
  const impsByDespesa = new Map<string, Imputacio[]>();
  for (const imp of imputacions) {
    if (!impsByDespesa.has(imp.despesa_id)) impsByDespesa.set(imp.despesa_id, []);
    impsByDespesa.get(imp.despesa_id)!.push(imp);
  }

  const noTrobades: FilaTreball[] = [];
  const ambigues: FilaTreball[] = [];
  const senseProjecte: FilaTreball[] = [];
  const acc = new Map<string, { despesa: Despesa; imports: Map<string, number>; cost: number; partidaDiferent: boolean; files: FilaTreball[] }>();

  for (const f of fitxer.files) {
    const mapped = Object.entries(f.percentatges).filter(([key]) => projecteDeColumna[key]);
    if (mapped.length === 0) { senseProjecte.push(f); continue; }

    let cands = byDoc.get(normDoc(f.ndoc_a3)) || [];
    if (cands.length === 0 && f.numapunte) cands = despeses.filter(d => normDoc(d.numapunte) === normDoc(f.numapunte));
    const samePartida = cands.filter(d => cleanStr(d.partida_id) === cleanStr(f.full));
    let pool = samePartida.length > 0 ? samePartida : cands;
    if (pool.length > 1 && f.factura) {
      const fac = cleanStr(f.factura);
      const byFactura = pool.filter(d => d.factura.split("+").some(x => cleanStr(x) === fac));
      if (byFactura.length > 0) pool = byFactura;
    }
    if (pool.length > 1 && f.pis) {
      const byPis = pool.filter(d => cleanStr(d.pis) === cleanStr(f.pis));
      if (byPis.length > 0) pool = byPis;
    }
    if (pool.length > 1 && f.numapunte) {
      const byApunte = pool.filter(d => normDoc(d.numapunte) === normDoc(f.numapunte));
      if (byApunte.length > 0) pool = byApunte;
    }
    if (pool.length === 0) { noTrobades.push(f); continue; }
    if (pool.length > 1) { ambigues.push(f); continue; }

    const d = pool[0];
    if (!acc.has(d.id)) acc.set(d.id, { despesa: d, imports: new Map(), cost: 0, partidaDiferent: samePartida.length === 0, files: [] });
    const a = acc.get(d.id)!;
    a.cost += f.cost_total;
    a.files.push(f);
    for (const [key, pct] of mapped) {
      const pid = projecteDeColumna[key]!;
      a.imports.set(pid, (a.imports.get(pid) || 0) + pct * f.cost_total);
    }
  }

  const canvis: CanviImputacio[] = [];
  for (const { despesa, imports, cost, partidaDiferent, files } of acc.values()) {
    const base = importImputable(despesa);
    const allocations = Array.from(imports.entries())
      .map(([projecte_id, imp]) => ({
        projecte_id,
        import: round2(imp),
        percentatge: base !== 0 ? round4((imp / base) * 100) : 0,
      }))
      .filter(a => a.import !== 0 || a.percentatge !== 0);
    const anteriors = impsByDespesa.get(despesa.id) || [];
    const sig = (list: { projecte_id: string; percentatge: number }[]) =>
      list.filter(x => x.percentatge !== 0).map(x => `${x.projecte_id}:${round2(x.percentatge)}`).sort().join(",");
    const estat: EstatPla = anteriors.length === 0 ? "nova" : sig(anteriors) === sig(allocations) ? "igual" : "sobreescriu";
    canvis.push({ despesa, allocations, anteriors, estat, costDiferent: Math.abs(cost - base) > 0.01, partidaDiferent, files });
  }
  return { canvis, noTrobades, ambigues, senseProjecte };
}
