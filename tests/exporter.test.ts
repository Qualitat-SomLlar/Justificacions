import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { exportJustificacionsExcel } from "@/lib/exporter";
import { Despesa, Imputacio, Partida, Projecte } from "@/lib/types";

function despesa(over: Partial<Despesa>): Despesa {
  return {
    id: "D1",
    numapunte: "1",
    ndoc_a3: "D1",
    financador: "F",
    area: "A",
    projecte_a3: "",
    pis: "",
    compte_despesa: "629000000",
    descripcio_compte: "Serveis",
    proveidor: "Prov",
    cif: "B1",
    factura: "F-1",
    data_emissio: "2026-02-01",
    data_pagament: "",
    descripcio_linia: "",
    any_fiscal: 2026,
    base_imposable: 100,
    iva: 21,
    irpf: 0,
    cost_total: 121,
    total_factura: 121,
    partida_id: "DD_SERVEIS",
    estat: "pendent",
    percentatge_total: 0,
    import_total: 0,
    ...over,
  };
}

const projecte = (id: string, actiu = true): Projecte => ({
  id,
  codi: id,
  nom: id,
  financador: "IMSS",
  area: "AREA",
  dates_text: "01/01/2026-31/12/2026",
  actiu,
});

const partides: Partida[] = [{ id: "DD_SERVEIS", codi: "DD_SERVEIS", nom: "Serveis" }];

// range: 0 keeps the leading empty row, so the row numbers match the sheet
function sheetRows(wb: XLSX.WorkBook, name: string): any[][] {
  return XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, range: 0 });
}

function read(buf: Uint8Array) {
  return XLSX.read(buf, { type: "array" });
}

const imp = (despesa_id: string, projecte_id: string, percentatge: number, importe: number): Imputacio => ({
  id: `${despesa_id}_${projecte_id}`,
  despesa_id,
  projecte_id,
  percentatge,
  import: importe,
  data_actualitzacio: "2026-02-01",
});

describe("exportJustificacionsExcel", () => {
  it("creates the summary sheet and one sheet per partida", () => {
    const wb = read(
      exportJustificacionsExcel(
        [despesa({ id: "A" }), despesa({ id: "B", partida_id: "SENSE_CORRESPONDENCIA" })],
        [],
        [projecte("P1")],
        partides,
        2026
      )
    );
    expect(wb.SheetNames).toEqual(["Resum Panel", "DD_SERVEIS", "SENSE_CORRESPONDENCIA"]);
  });

  it("totals in the summary match the despeses (covered and available)", () => {
    const despeses = [
      despesa({ id: "A", total_factura: 100, cost_total: 100, import_total: 40 }),
      despesa({ id: "B", total_factura: 50, cost_total: 50, import_total: 70, estat: "excedida" }),
    ];
    const wb = read(exportJustificacionsExcel(despeses, [], [projecte("P1")], partides, 2026));
    const rows = sheetRows(wb, "Resum Panel");
    const partidaRow = rows.find(r => r[0] === "DD_SERVEIS")!;
    expect(partidaRow[2]).toBe(2); // despeses
    expect(partidaRow[4]).toBe(150); // total factura
    expect(partidaRow[5]).toBe(110); // total cobert
    expect(partidaRow[6]).toBe(60); // disponible: the excess of B does not offset A
    expect(String(partidaRow[7])).toContain("ALERTA");
    const totals = rows.find(r => r[0] === "TOTALS")!;
    expect(totals[4]).toBe(150);
    expect(totals[6]).toBe(60);
  });

  it("writes the % and amount of each project in the partida sheet", () => {
    const despeses = [despesa({ id: "A", total_factura: 100, import_total: 100 })];
    const wb = read(
      exportJustificacionsExcel(
        despeses,
        [imp("A", "P1", 60, 60), imp("A", "P2", 40, 40)],
        [projecte("P1"), projecte("P2")],
        partides,
        2026
      )
    );
    const rows = sheetRows(wb, "DD_SERVEIS");
    const header = rows[6];
    const data = rows[7];
    const p1 = header.indexOf("% P1");
    const p2 = header.indexOf("% P2");
    expect(data[p1]).toBeCloseTo(0.6);
    expect(data[p1 + 1]).toBe(60);
    expect(data[p2]).toBeCloseTo(0.4);
    expect(data[p2 + 1]).toBe(40);
  });

  it("includes closed projects only when they have imputations", () => {
    const despeses = [despesa({ id: "A", total_factura: 100, import_total: 100 })];
    const wb = read(
      exportJustificacionsExcel(
        despeses,
        [imp("A", "TANCAT1", 100, 100)],
        [projecte("P1"), projecte("TANCAT1", false), projecte("TANCAT2", false)],
        partides,
        2026
      )
    );
    const rows = sheetRows(wb, "DD_SERVEIS");
    const header: string[] = rows[6];
    expect(header).toContain("% TANCAT1");
    expect(header).not.toContain("% TANCAT2");
    expect(rows[4].some((c: any) => String(c).includes("TANCAT1 (TANCAT)"))).toBe(true);
  });

  it("gives imputations to unknown projects their own column", () => {
    const despeses = [despesa({ id: "A", total_factura: 100, import_total: 100 })];
    const wb = read(
      exportJustificacionsExcel(despeses, [imp("A", "ESBORRAT", 100, 100)], [projecte("P1")], partides, 2026)
    );
    const rows = sheetRows(wb, "DD_SERVEIS");
    const header: string[] = rows[6];
    expect(header).toContain("% ESBORRAT");
    expect(rows[4].some((c: any) => String(c).includes("ESBORRAT (DESCONEGUT)"))).toBe(true);
    const col = header.indexOf("Import ESBORRAT (€)");
    expect(rows[7][col]).toBe(100);
  });

  it("keeps sheet names valid and unique", () => {
    const wb = read(
      exportJustificacionsExcel(
        [
          despesa({ id: "A", partida_id: "DD_A/B:C" }),
          despesa({ id: "B", partida_id: "DD_A_B_C" }),
          despesa({ id: "C", partida_id: "Resum Panel" }),
        ],
        [],
        [],
        [],
        2026
      )
    );
    const names = wb.SheetNames.map(n => n.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(wb.SheetNames.every(n => n.length <= 31 && !/[:\\/?*\[\]]/.test(n))).toBe(true);
  });
});

