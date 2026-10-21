import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { cleanStr, formatDate, parseA3Excel, parseNum } from "@/lib/parser";
import { Equivalencia } from "@/lib/types";

function workbookBuffer(rows: any[][], sheetName = "Export"): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

const HEADERS = [
  "Document A3", "Factura", "Proveïdor", "NIF proveïdor", "Compte despesa", "Descripció compte despesa",
  "Data", "Base imposable", "Import IVA", "Import IRPF", "Import total de línia", "Total Document A3",
];

const EQS: Equivalencia[] = [
  { compte: "629000000", descripcio: "ALTRES SERVEIS", partida_id: "DD_SERVEIS" },
  { compte: "640000000", descripcio: "SOUS", partida_id: "DD_RRHH" },
];

describe("cleanStr", () => {
  it("removes accents, spaces and punctuation", () => {
    expect(cleanStr(" Descripció_Compte-Despesa ")).toBe("descripciocomptedespesa");
    expect(cleanStr(null)).toBe("");
  });
});

describe("parseNum", () => {
  it("parses Spanish and plain formats", () => {
    expect(parseNum("1.234,56")).toBe(1234.56);
    expect(parseNum("1.234.567")).toBe(1234567);
    expect(parseNum("1234.56")).toBe(1234.56);
    expect(parseNum("0.125")).toBe(0.125);
    expect(parseNum("-0.500")).toBe(-0.5);
    expect(parseNum("12,5 €")).toBe(12.5);
    expect(parseNum("-3,40")).toBe(-3.4);
    expect(parseNum(7)).toBe(7);
    expect(parseNum("abc")).toBe(0);
    expect(parseNum(null)).toBe(0);
  });
});

describe("formatDate", () => {
  it("normalises to yyyy-mm-dd", () => {
    expect(formatDate("01/02/2026")).toBe("2026-02-01");
    expect(formatDate("1-2-26")).toBe("2026-02-01");
    expect(formatDate("01/02/2026 10:00")).toBe("2026-02-01");
    expect(formatDate("2026-02-01T10:00:00")).toBe("2026-02-01");
    expect(formatDate(new Date(2026, 1, 1))).toBe("2026-02-01");
    expect(formatDate("")).toBe("");
  });
  it("converts Excel serial dates", () => {
    expect(formatDate(46054)).toBe("2026-02-01");
  });
});

describe("parseA3Excel", () => {
  it("groups lines of one document and partida, and computes total = cost - IRPF", () => {
    const buf = workbookBuffer([
      HEADERS,
      ["D1", "F-1", "Proveïdor A", "B111", "629000000", "ALTRES SERVEIS", "01/02/2026", 100, 21, 0, 121, 121],
      ["D1", "F-1", "Proveïdor A", "B111", "629000000", "ALTRES SERVEIS", "01/02/2026", 50, 10.5, 0, 60.5, 121],
      ["D2", "F-2", "Professional", "A222", "640000000", "SOUS", "05/03/2026", 1000, 0, 150, 1000, 1000],
    ]);
    const res = parseA3Excel(buf, EQS);
    expect(res.totalFilesLlegides).toBe(3);
    expect(res.despeses).toHaveLength(2);
    expect(res.facturesNoves).toBe(2);
    expect(res.senseCorrespondencia).toBe(0);

    const d1 = res.despeses.find(d => d.ndoc_a3 === "D1")!;
    expect(d1.partida_id).toBe("DD_SERVEIS");
    expect(d1.base_imposable).toBe(150);
    expect(d1.cost_total).toBe(181.5);
    expect(d1.total_factura).toBe(181.5);
    expect(d1.data_emissio).toBe("2026-02-01");
    expect(d1.any_fiscal).toBe(2026);

    const d2 = res.despeses.find(d => d.ndoc_a3 === "D2")!;
    expect(d2.irpf).toBe(150);
    expect(d2.total_factura).toBe(850);
  });

  it("splits one document across partides and flags it as compartida", () => {
    const buf = workbookBuffer([
      HEADERS,
      ["D1", "F-1", "Prov", "B1", "629000000", "ALTRES SERVEIS", "01/02/2026", 100, 0, 0, 100, 300],
      ["D1", "F-1", "Prov", "B1", "640000000", "SOUS", "01/02/2026", 200, 0, 0, 200, 300],
    ]);
    const res = parseA3Excel(buf, EQS);
    expect(res.despeses).toHaveLength(2);
    expect(res.despeses.every(d => d.es_compartida)).toBe(true);
    expect(new Set(res.despeses.map(d => d.id)).size).toBe(2);
  });

  it("reports accounts without equivalence", () => {
    const buf = workbookBuffer([
      HEADERS,
      ["D1", "F-1", "Prov", "B1", "999999999", "DESCONEGUDA", "01/02/2026", 10, 0, 0, 10, 10],
    ]);
    const res = parseA3Excel(buf, EQS);
    expect(res.senseCorrespondencia).toBe(1);
    expect(res.despeses[0].partida_id).toBe("SENSE_CORRESPONDENCIA");
    expect(res.comptesSenseCorrespondencia).toEqual([{ compte: "999999999", descripcio: "DESCONEGUDA", count: 1 }]);
  });

  it("uses a direct partida column over the account equivalence", () => {
    const buf = workbookBuffer([
      [...HEADERS, "Full destí"],
      ["D1", "F-1", "Prov", "B1", "629000000", "ALTRES SERVEIS", "01/02/2026", 10, 0, 0, 10, 10, "FORMACIO"],
    ]);
    expect(parseA3Excel(buf, EQS).despeses[0].partida_id).toBe("DD_FORMACIO");
  });

  it("is idempotent: a second import with the same data finds existing invoices, unchanged", () => {
    const buf = workbookBuffer([
      HEADERS,
      ["D1", "F-1", "Prov", "B1", "629000000", "ALTRES SERVEIS", "01/02/2026", 100, 21, 0, 121, 121],
    ]);
    const first = parseA3Excel(buf, EQS);
    const second = parseA3Excel(buf, EQS, first.despeses);
    expect(second.facturesNoves).toBe(0);
    expect(second.facturesExistents).toBe(1);
    expect(second.facturesModificades).toBe(0);
    expect(second.despeses[0].id).toBe(first.despeses[0].id);
  });

  it("flags an existing invoice whose amount changed in A3", () => {
    const rows = (total: number) => [
      HEADERS,
      ["D1", "F-1", "Prov", "B1", "629000000", "ALTRES SERVEIS", "01/02/2026", total, 0, 0, total, total],
    ];
    const first = parseA3Excel(workbookBuffer(rows(100)), EQS);
    const second = parseA3Excel(workbookBuffer(rows(120)), EQS, first.despeses);
    expect(second.facturesModificades).toBe(1);
    expect(second.despeses[0].modificat_a3).toBe(true);
  });

  it("relinks the existing despesa when an equivalence changes the resolved partida", () => {
    const buf = workbookBuffer([
      HEADERS,
      ["D1", "F-1", "Prov", "B1", "629000000", "ALTRES SERVEIS", "01/02/2026", 100, 0, 0, 100, 100],
    ]);
    const first = parseA3Excel(buf, []);
    expect(first.despeses[0].partida_id).toBe("SENSE_CORRESPONDENCIA");
    const second = parseA3Excel(buf, EQS, first.despeses);
    expect(second.despeses[0].id).toBe(first.despeses[0].id);
    expect(second.facturesNoves).toBe(0);
  });

  it("rejects a sheet without data rows", () => {
    expect(() => parseA3Excel(workbookBuffer([HEADERS]), EQS)).toThrow();
  });
});
