import * as XLSX from "xlsx";
import { InformeProjecte } from "./informes";
import { formatDateCa, formatPeriode } from "./periode";

/** Numeric cells of the given columns, from a given row to the end of the sheet, get an Excel format. */
function formatColumns(ws: XLSX.WorkSheet, fromRow: number, cols: number[], format: string) {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let r = fromRow; r <= range.e.r; r++) {
    for (const c of cols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = format;
    }
  }
}

function formatCell(ws: XLSX.WorkSheet, r: number, c: number, format: string) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (cell && cell.t === "n") cell.z = format;
}

const ESTAT_TEXT = {
  sense: "Sense pressupost definit",
  ok: "En curs",
  alerta: "Prop del límit",
  excedit: "Pressupost superat",
} as const;

/** Justification report of one project: a summary sheet and the detail of every imputed invoice. */
export function exportInformeProjecteExcel(informe: InformeProjecte, exercici: number): Uint8Array {
  const { projecte, periode, files, perPartida, total, foraPeriode, execucio } = informe;
  const wb = XLSX.utils.book_new();

  const resum: any[][] = [
    [`INFORME DE JUSTIFICACIÓ - ${projecte.codi}`],
    [],
    ["Projecte", projecte.codi],
    ["Nom", projecte.nom],
    ["Finançador", projecte.financador || "-"],
    ["Àrea", projecte.area || "-"],
    ["Període de justificació", formatPeriode(periode)],
    ["Exercici", exercici],
    ["Data generació", new Date().toLocaleDateString("ca-ES")],
    [],
    ["Pressupost total (€)", execucio.pressupost || "-"],
    ["Total imputat (€)", total],
    ["% executat", execucio.pressupost ? execucio.pct / 100 : "-"],
    ["Pressupost disponible (€)", execucio.pressupost ? execucio.disponible : "-"],
    ["Estat del pressupost", ESTAT_TEXT[execucio.estat]],
    ["Factures imputades", files.length],
    ["Factures fora del període", foraPeriode.count],
    ["Import fora del període (€)", foraPeriode.total],
    [],
    ["Partida", "Descripció partida", "Núm. factures", "Total imputat (€)"],
  ];
  for (const p of perPartida) resum.push([p.partida_id, p.partida_nom, p.count, p.total]);
  resum.push([]);
  resum.push(["TOTAL", "", files.length, total]);

  const wsResum = XLSX.utils.aoa_to_sheet(resum);
  wsResum["!cols"] = [{ wch: 34 }, { wch: 40 }, { wch: 16 }, { wch: 20 }];
  // Rows of the figures block: 10 budget, 11 imputed, 12 % executed, 13 available, 17 amount outside the period
  for (const r of [10, 11, 13, 17]) formatCell(wsResum, r, 1, "#,##0.00");
  formatCell(wsResum, 12, 1, "0.00%");
  // Partida table: starts at row 20 (after its header)
  formatColumns(wsResum, 20, [3], "#,##0.00");
  XLSX.utils.book_append_sheet(wb, wsResum, "Resum");

  const header = [
    "DATA EMISSIÓ", "NDOC_A3", "FACTURA", "PROVEÏDOR", "CIF", "PARTIDA", "DESCRIPCIÓ LÍNIA",
    "TOTAL FACTURA", "% IMPUTAT", "IMPORT IMPUTAT", "FORA DE PERÍODE", "OBSERVACIONS",
  ];
  const rows: any[][] = [header];
  for (const f of files) {
    rows.push([
      formatDateCa(f.despesa.data_emissio),
      f.despesa.ndoc_a3,
      f.despesa.factura,
      f.despesa.proveidor,
      f.despesa.cif,
      f.partida_id,
      f.despesa.descripcio_linia,
      f.despesa.total_factura,
      f.percentatge / 100,
      f.import,
      f.foraPeriode ? "SÍ" : "",
      f.observacions,
    ]);
  }
  rows.push([]);
  rows.push(["TOTAL", "", "", "", "", "", "", "", "", total, "", ""]);

  const wsFactures = XLSX.utils.aoa_to_sheet(rows);
  wsFactures["!cols"] = [
    { wch: 13 }, { wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 28 },
    { wch: 40 }, { wch: 15 }, { wch: 11 }, { wch: 16 }, { wch: 16 }, { wch: 30 },
  ];
  formatColumns(wsFactures, 1, [7, 9], "#,##0.00");
  formatColumns(wsFactures, 1, [8], "0.00%");
  XLSX.utils.book_append_sheet(wb, wsFactures, "Factures");

  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
