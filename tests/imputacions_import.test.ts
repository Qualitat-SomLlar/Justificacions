import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ColumnaProjecte, planImportacio, readFitxerTreball, readFullTreball, suggestProjectes } from "@/lib/imputacions_import";
import { Despesa, Imputacio, Projecte } from "@/lib/types";

// Sheet like the working file: rows 2-5 identify the projects (label in column C), row 7 has the headers
function sheetRows(data: unknown[][]): unknown[][] {
  return [
    [],
    [null, null, "Centre Cost Projecte", "IFEGEN/GEN/P1", null, "AJT/PIRVO/P2", null],
    [null, null, "Finançador", "IFEGEN", null, "AJT", null],
    [null, null, "Àrea", "GEN", null, "PIRVO", null],
    [null, null, "Projecte", "P1", null, "P2", null],
    [],
    ["NUM. APUNTE", "NDOC_A3", "FACTURA", "% P1", "Import P1", "% P2", "Import P2", "Cost Total (Total del concepte)", "\nCODI ANALÍTIC PIS"],
    ...data,
  ];
}

function despesa(over: Partial<Despesa>): Despesa {
  return {
    id: "D1", numapunte: "1", ndoc_a3: "2026/1", financador: "", area: "", projecte_a3: "", pis: "",
    compte_despesa: "628000000", descripcio_compte: "", proveidor: "", cif: "", factura: "F1",
    data_emissio: "2026-01-01", data_pagament: "", descripcio_linia: "", any_fiscal: 2026,
    base_imposable: 100, iva: 0, irpf: 0, cost_total: 100, total_factura: 100,
    partida_id: "DD_TELEFONIA", estat: "pendent", percentatge_total: 0, import_total: 0,
    ...over,
  };
}

const projecte = (id: string, codi: string, financador: string, area: string): Projecte =>
  ({ id, codi, nom: codi, financador, area, dates_text: "", actiu: true });

describe("readFullTreball", () => {
  it("reads the project columns and only the rows with percentages", () => {
    const cols = new Map<string, ColumnaProjecte>();
    const files = readFullTreball("DD_TELEFONIA", sheetRows([
      [101, "2026/1", "F1", 0.5, 50, 0.5, 50, 100, "PIS1"],
      [102, "2026/2", "F2", null, 0, 0, 0, 80, ""],
      [103, "2026/3", "F3", 1, 30, null, null, 30, ""],
    ]), cols)!;
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ fila: 8, ndoc_a3: "2026/1", factura: "F1", pis: "PIS1", cost_total: 100 });
    expect(files[0].percentatges).toEqual({ "P1|IFEGEN|GEN": 0.5, "P2|AJT|PIRVO": 0.5 });
    expect(cols.get("P1|IFEGEN|GEN")?.files).toBe(2);
    expect(cols.get("P2|AJT|PIRVO")?.files).toBe(1);
  });

  it("returns null when the sheet does not have the expected layout", () => {
    expect(readFullTreball("DD_X", [["a"], ["NDOC_A3"]], new Map())).toBeNull();
  });

  it("reads a workbook keeping the sheet row numbers when the range starts at row 2", () => {
    const ws = XLSX.utils.aoa_to_sheet(sheetRows([[101, "2026/1", "F1", 1, 100, null, null, 100]]));
    ws["!ref"] = ws["!ref"]!.replace(/^A1/, "A2");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DD_TELEFONIA");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["altre"]]), "Resum");
    const f = readFitxerTreball(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    expect(f.files).toHaveLength(1);
    expect(f.files[0].fila).toBe(8);
  });
});

describe("suggestProjectes", () => {
  it("prefers code + finançador + àrea, then code + finançador, never another finançador", () => {
    const projectes = [
      projecte("a", "P1", "IFEGEN", "GEN"),
      projecte("b", "P1", "IFEGEN", "LEG"),
      projecte("c", "P2", "AJT", "GEN"),
      projecte("d", "P3", "X", "Y"),
      projecte("e", "P4", "A", "A"),
      projecte("f", "P4", "B", "B"),
    ];
    const cols = [
      { key: "1", codi: "P1", financador: "IFEGEN", area: "GEN", files: 1 },
      { key: "2", codi: "P2", financador: "AJT", area: "PIRVO", files: 1 },
      { key: "3", codi: "P3", financador: "Z", area: "Z", files: 1 },
      { key: "4", codi: "P4", financador: "C", area: "C", files: 1 },
    ];
    expect(suggestProjectes(cols, projectes)).toEqual({ "1": "a", "2": "c" });
  });
});

describe("planImportacio", () => {
  const fila = (over: object) => ({
    full: "DD_TELEFONIA", fila: 8, numapunte: "", ndoc_a3: "2026/1", factura: "", pis: "", cost_total: 100,
    percentatges: { K1: 0.5 }, ...over,
  });
  const map = { K1: "P1", K2: "P2" };

  it("adds the lines of the same invoice and computes the percentage over its cost", () => {
    const pla = planImportacio(
      { files: [fila({ cost_total: 60, percentatges: { K1: 1 } }), fila({ cost_total: 40, percentatges: { K1: 0.5, K2: 0.5 } })] },
      [despesa({})], [], map
    );
    expect(pla.canvis).toHaveLength(1);
    expect(pla.canvis[0].estat).toBe("nova");
    expect(pla.canvis[0].allocations).toEqual([
      { projecte_id: "P1", import: 80, percentatge: 80 },
      { projecte_id: "P2", import: 20, percentatge: 20 },
    ]);
  });

  it("tells apart invoices of the same document by partida, invoice number and flat", () => {
    const despeses = [
      despesa({ id: "A", factura: "F1", partida_id: "DD_TELEFONIA" }),
      despesa({ id: "B", factura: "F2", partida_id: "DD_TELEFONIA" }),
      despesa({ id: "C", factura: "F1", partida_id: "DD_MOBLES" }),
      despesa({ id: "D", factura: "", pis: "PIS1", partida_id: "DD_ARRENDAMIENTOS" }),
      despesa({ id: "E", factura: "", pis: "PIS2", partida_id: "DD_ARRENDAMIENTOS" }),
    ];
    const pla = planImportacio(
      { files: [fila({ factura: "F2" }), fila({ full: "DD_ARRENDAMIENTOS", pis: "PIS2" })] },
      despeses, [], map
    );
    expect(pla.canvis.map(c => c.despesa.id).sort()).toEqual(["B", "E"]);
  });

  it("reports rows not found, ambiguous and without project", () => {
    const despeses = [despesa({ id: "A", factura: "" }), despesa({ id: "B", factura: "" })];
    const pla = planImportacio(
      { files: [fila({ ndoc_a3: "2026/9" }), fila({}), fila({ percentatges: { K9: 1 } })] },
      despeses, [], map
    );
    expect(pla.noTrobades).toHaveLength(1);
    expect(pla.ambigues).toHaveLength(1);
    expect(pla.senseProjecte).toHaveLength(1);
    expect(pla.canvis).toHaveLength(0);
  });

  it("marks invoices whose imputations change and the ones already equal", () => {
    const imp = (despesa_id: string, projecte_id: string, percentatge: number): Imputacio =>
      ({ id: `${despesa_id}_${projecte_id}`, despesa_id, projecte_id, percentatge, import: percentatge, data_actualitzacio: "" });
    const despeses = [despesa({ id: "A", ndoc_a3: "2026/1" }), despesa({ id: "B", ndoc_a3: "2026/2" })];
    const pla = planImportacio(
      { files: [fila({ ndoc_a3: "2026/1" }), fila({ ndoc_a3: "2026/2" })] },
      despeses, [imp("A", "P1", 50), imp("B", "P2", 100)], map
    );
    const byId = Object.fromEntries(pla.canvis.map(c => [c.despesa.id, c.estat]));
    expect(byId).toEqual({ A: "igual", B: "sobreescriu" });
  });
});
