import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildInformeProjecte, foraPeriodePerProjecte } from "@/lib/informes";
import { exportInformeProjecteExcel } from "@/lib/informe_exporter";
import { Despesa, Imputacio, Partida, Projecte } from "@/lib/types";

function despesa(over: Partial<Despesa>): Despesa {
  return {
    id: "D1",
    numapunte: "1",
    ndoc_a3: "D1",
    financador: "",
    area: "",
    projecte_a3: "",
    pis: "",
    compte_despesa: "",
    descripcio_compte: "",
    proveidor: "Prov",
    cif: "B1",
    factura: "F-1",
    data_emissio: "2026-03-01",
    data_pagament: "",
    descripcio_linia: "",
    any_fiscal: 2026,
    base_imposable: 0,
    iva: 0,
    irpf: 0,
    cost_total: 0,
    total_factura: 100,
    partida_id: "DD_A",
    estat: "pendent",
    percentatge_total: 0,
    import_total: 0,
    ...over,
  };
}

const imp = (despesa_id: string, projecte_id: string, percentatge: number, importe: number): Imputacio => ({
  id: `${despesa_id}_${projecte_id}`,
  despesa_id,
  projecte_id,
  percentatge,
  import: importe,
  data_actualitzacio: "2026-01-01",
});

const projecte = (over: Partial<Projecte> = {}): Projecte => ({
  id: "P1",
  codi: "P1",
  nom: "Projecte 1",
  financador: "IMSS",
  area: "AREA",
  dates_text: "01/01/2026-30/06/2026",
  actiu: true,
  ...over,
});

const partides: Partida[] = [
  { id: "DD_A", codi: "DD_A", nom: "Partida A" },
  { id: "DD_B", codi: "DD_B", nom: "Partida B" },
];

describe("buildInformeProjecte", () => {
  const despeses = [
    despesa({ id: "A", ndoc_a3: "A", data_emissio: "2026-02-10", total_factura: 100, partida_id: "DD_A" }),
    despesa({ id: "B", ndoc_a3: "B", data_emissio: "2026-01-05", total_factura: 50.5, partida_id: "DD_B" }),
    despesa({ id: "C", ndoc_a3: "C", data_emissio: "2026-09-01", total_factura: 30, partida_id: "DD_A" }), // outside the period
    despesa({ id: "D", ndoc_a3: "D", total_factura: 999, partida_id: "DD_A" }), // not imputed to P1
  ];
  const imputacions = [
    imp("A", "P1", 60, 60),
    imp("B", "P1", 100, 50.5),
    imp("C", "P1", 100, 30),
    imp("D", "P2", 100, 999),
    imp("A", "P2", 40, 40),
  ];

  it("only includes the imputations of the project, sorted by date", () => {
    const r = buildInformeProjecte(projecte(), despeses, imputacions, partides);
    expect(r.files.map(f => f.despesa.id)).toEqual(["B", "A", "C"]);
    expect(r.files.every(f => f.despesa.id !== "D")).toBe(true);
  });

  it("totals per partida and overall, to the cent", () => {
    const r = buildInformeProjecte(projecte(), despeses, imputacions, partides);
    expect(r.total).toBe(140.5);
    expect(r.perPartida).toEqual([
      { partida_id: "DD_A", partida_nom: "Partida A", count: 2, total: 90 },
      { partida_id: "DD_B", partida_nom: "Partida B", count: 1, total: 50.5 },
    ]);
  });

  it("flags invoices dated outside the period", () => {
    const r = buildInformeProjecte(projecte(), despeses, imputacions, partides);
    expect(r.files.find(f => f.despesa.id === "C")!.foraPeriode).toBe(true);
    expect(r.files.find(f => f.despesa.id === "A")!.foraPeriode).toBe(false);
    expect(r.foraPeriode).toEqual({ count: 1, total: 30 });
  });

  it("does not flag anything when the project has no readable period", () => {
    const r = buildInformeProjecte(projecte({ dates_text: "" }), despeses, imputacions, partides);
    expect(r.periode).toBeNull();
    expect(r.foraPeriode).toEqual({ count: 0, total: 0 });
  });

  it("reports the budget execution", () => {
    const r = buildInformeProjecte(projecte({ pressupost_total: 150 }), despeses, imputacions, partides);
    expect(r.execucio).toMatchObject({ estat: "alerta", pressupost: 150, imputat: 140.5, disponible: 9.5 });
    expect(buildInformeProjecte(projecte({ pressupost_total: 100 }), despeses, imputacions, partides).execucio.estat).toBe("excedit");
  });

  it("ignores empty imputations and imputations of missing invoices", () => {
    const r = buildInformeProjecte(
      projecte(),
      despeses,
      [imp("A", "P1", 0, 0), imp("FANTASMA", "P1", 100, 10)],
      partides
    );
    expect(r.files).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it("shows the code of a partida that is not in the catalog", () => {
    const r = buildInformeProjecte(projecte(), [despesa({ id: "X", partida_id: "DD_ESBORRADA" })], [imp("X", "P1", 100, 100)], partides);
    expect(r.files[0].partida_nom).toBe("DD_ESBORRADA");
  });
});

describe("foraPeriodePerProjecte", () => {
  it("lists only the projects with imputations outside their period", () => {
    const despeses = [
      despesa({ id: "A", data_emissio: "2026-02-10" }),
      despesa({ id: "B", data_emissio: "2027-02-10" }),
      despesa({ id: "C", data_emissio: "2027-03-10" }),
    ];
    const imps = [imp("A", "P1", 100, 100), imp("B", "P1", 100, 100), imp("C", "P1", 100, 50), imp("B", "P2", 100, 100)];
    const r = foraPeriodePerProjecte(
      [projecte(), projecte({ id: "P2", codi: "P2", dates_text: "01/01/2027-31/12/2027" }), projecte({ id: "P3", codi: "P3" })],
      despeses,
      imps
    );
    expect(r).toHaveLength(1);
    expect(r[0].projecte.id).toBe("P1");
    expect(r[0]).toMatchObject({ count: 2, total: 150 });
  });
});

describe("exportInformeProjecteExcel", () => {
  const despeses = [
    despesa({ id: "A", ndoc_a3: "A", data_emissio: "2026-02-10", total_factura: 100 }),
    despesa({ id: "C", ndoc_a3: "C", data_emissio: "2026-09-01", total_factura: 30 }),
  ];
  const informe = buildInformeProjecte(
    projecte({ pressupost_total: 500 }),
    despeses,
    [imp("A", "P1", 100, 100), imp("C", "P1", 100, 30)],
    partides
  );

  function read() {
    const wb = XLSX.read(exportInformeProjecteExcel(informe, 2026), { type: "array" });
    return {
      wb,
      resum: XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Resum"], { header: 1, range: 0 }),
      factures: XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Factures"], { header: 1, range: 0 }),
    };
  }

  it("has a summary and an invoices sheet", () => {
    expect(read().wb.SheetNames).toEqual(["Resum", "Factures"]);
  });

  it("the summary carries the project data, budget and totals", () => {
    const { resum } = read();
    const cell = (label: string) => resum.find(r => r[0] === label)?.[1];
    expect(cell("Projecte")).toBe("P1");
    expect(cell("Període de justificació")).toBe("01/01/2026 – 30/06/2026");
    expect(cell("Pressupost total (€)")).toBe(500);
    expect(cell("Total imputat (€)")).toBe(130);
    expect(cell("% executat")).toBeCloseTo(0.26);
    expect(cell("Pressupost disponible (€)")).toBe(370);
    expect(cell("Factures fora del període")).toBe(1);
    expect(resum.find(r => r[0] === "TOTAL")![3]).toBe(130);
  });

  it("the invoices sheet lists every imputation and marks the ones outside the period", () => {
    const { factures } = read();
    expect(factures[0][0]).toBe("DATA EMISSIÓ");
    const a = factures.find(r => r[1] === "A")!;
    const c = factures.find(r => r[1] === "C")!;
    expect(a[0]).toBe("10/02/2026");
    expect(a[9]).toBe(100);
    expect(a[10] || "").toBe("");
    expect(c[10]).toBe("SÍ");
    expect(factures.find(r => r[0] === "TOTAL")![9]).toBe(130);
  });

  it("shows '-' instead of numbers when the project has no budget", () => {
    const sense = buildInformeProjecte(projecte(), despeses, [imp("A", "P1", 100, 100)], partides);
    const wb = XLSX.read(exportInformeProjecteExcel(sense, 2026), { type: "array" });
    const resum = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Resum"], { header: 1, range: 0 });
    expect(resum.find(r => r[0] === "Pressupost total (€)")![1]).toBe("-");
    expect(resum.find(r => r[0] === "Estat del pressupost")![1]).toBe("Sense pressupost definit");
  });
});
