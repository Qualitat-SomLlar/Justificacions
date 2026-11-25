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

// Real A3 export headers: "numapunte" (entry) comes before "Nº document A3" (document)
const A3_HEADERS = [
  "numapunte", "Proveidor", "NIF Proveidor", "Nº document A3", "Nº factura", "Data", "Compte despesa",
  "Descripció compte despesa", "Base imposable", "Import IVA", "Import IRPF", "Import total de línia", "Total document A3",
];
const a3Row = (apunte: number, doc: string, fra: string, compte: string, base: number, iva: number, irpf: number) =>
  [apunte, "Prov", "B1", doc, fra, "01/02/2026", compte, "DESC", base, iva, irpf, Math.round((base + iva - irpf) * 100) / 100, 0];

describe("parseA3Excel with the A3 export layout", () => {
  it("reads the document number from «Nº document A3», not from numapunte", () => {
    const res = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(108637, "2026/603", "F-1", "629000000", 100, 21, 0)]), EQS);
    expect(res.columnesDetectades?.find(c => c.camp === "Document A3")?.nomColumna).toBe("Nº document A3");
    expect(res.despeses[0].ndoc_a3).toBe("2026/603");
    expect(res.despeses[0].numapunte).toBe("108637");
  });

  it("uses the entry number when a line has no document number", () => {
    const res = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(117683, "", "", "629000000", 50, 0, 0)]), EQS);
    expect(res.despeses[0].ndoc_a3).toBe("117683");
  });

  it("subtracts IRPF once: A3's line total is already base + IVA - IRPF", () => {
    const res = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(1, "2026/84", "F-1", "629000000", 3824.7, 803.19, 573.71)]), EQS);
    const d = res.despeses[0];
    expect(d.cost_total).toBe(4627.89);
    expect(d.total_factura).toBe(4054.18);
  });

  it("keeps the same despesa when A3 corrects the invoice number", () => {
    const first = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(1, "2026/474", "A-V2026-0000328360", "629000000", 50, 0, 0)]), EQS);
    const second = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(1, "2026/474", "A-V2026-00000328360", "629000000", 50, 0, 0)]), EQS, first.despeses);
    expect(second.despeses).toHaveLength(1);
    expect(second.despeses[0].id).toBe(first.despeses[0].id);
    expect(second.facturesNoves).toBe(0);
    expect(second.despesesOrfes).toEqual([]);
  });

  it("relinks despeses imported when ndoc_a3 held the entry number", () => {
    const fresh = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(108637, "2026/603", "F-1", "629000000", 100, 21, 0)]), EQS);
    const old = fresh.despeses.map(d => ({ ...d, id: "108637_F-1_DD_SERVEIS", ndoc_a3: "108637", numapunte: "108637" }));
    const res = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(108637, "2026/603", "F-1", "629000000", 100, 21, 0)]), EQS, old);
    expect(res.despeses[0].id).toBe("108637_F-1_DD_SERVEIS");
    expect(res.despeses[0].ndoc_a3).toBe("2026/603");
    expect(res.facturesNoves).toBe(0);
  });

  it("returns as orphans the parts of a reimported document that A3 no longer has", () => {
    const first = parseA3Excel(workbookBuffer([
      A3_HEADERS,
      a3Row(1, "2026/113", "F-1", "629000000", 100, 0, 0),
      a3Row(1, "2026/113", "F-1", "640000000", 50, 0, 0),
    ]), EQS);
    expect(first.despeses).toHaveLength(2);
    // The second line is now booked to the first account: one despesa for the whole document
    const second = parseA3Excel(workbookBuffer([
      A3_HEADERS,
      a3Row(1, "2026/113", "F-1", "629000000", 100, 0, 0),
      a3Row(1, "2026/113", "F-1", "629000000", 50, 0, 0),
    ]), EQS, first.despeses);
    expect(second.despeses).toHaveLength(1);
    expect(second.despeses[0].total_factura).toBe(150);
    const rrhh = first.despeses.find(d => d.partida_id === "DD_RRHH")!;
    expect(second.despesesOrfes).toEqual([rrhh.id]);
  });

  it("relinks or drops despeses imported with a row-number ID by invoice and partida", () => {
    const fresh = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(0, "2026/127", "28-A6DD", "629000000", 0, 0, 0)]), EQS);
    const legacy = fresh.despeses.map(d => ({ ...d, id: "ROW_28_28-A6DD_DD_SERVEIS", ndoc_a3: "ROW_28", numapunte: "ROW_28" }));
    const relinked = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(0, "2026/127", "28-A6DD", "629000000", 0, 0, 0)]), EQS, legacy);
    expect(relinked.despeses[0].id).toBe("ROW_28_28-A6DD_DD_SERVEIS");
    expect(relinked.despesesOrfes).toEqual([]);

    const twice = [...legacy, { ...legacy[0], id: "ROW_3315_28-A6DD_DD_SERVEIS", ndoc_a3: "ROW_3315", numapunte: "ROW_3315" }];
    const res = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(0, "2026/127", "28-A6DD", "629000000", 0, 0, 0)]), EQS, twice);
    expect(res.despesesOrfes?.sort()).toEqual(["ROW_28_28-A6DD_DD_SERVEIS", "ROW_3315_28-A6DD_DD_SERVEIS"]);
  });

  it("does not import payroll lines without equivalence and flags stored ones", () => {
    const res = parseA3Excel(workbookBuffer([
      A3_HEADERS,
      a3Row(10, "2026/10", "N-1", "640000001", 1500, 0, 200),
      a3Row(11, "2026/11", "F-11", "629000000", 10, 0, 0),
    ]), [EQS[0]]);
    expect(res.liniesPersonalExcloses).toBe(1);
    expect(res.despeses.map(d => d.ndoc_a3)).toEqual(["2026/11"]);
    expect(res.comptesSenseCorrespondencia).toEqual([]);

    const stored = { ...res.despeses[0], id: "old_payroll", compte_despesa: "640000001", partida_id: "SENSE_CORRESPONDENCIA", numapunte: "10", ndoc_a3: "2026/10" };
    const again = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(11, "2026/11", "F-11", "629000000", 10, 0, 0)]), [EQS[0]], [stored]);
    expect(again.despesesPersonals).toEqual(["old_payroll"]);
    expect(again.despesesDesaparegudes).toEqual([]);
  });

  it("imports payroll accounts that do have an equivalence", () => {
    const res = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(10, "2026/10", "N-1", "640000000", 1500, 0, 0)]), EQS);
    expect(res.liniesPersonalExcloses).toBe(0);
    expect(res.despeses[0].partida_id).toBe("DD_RRHH");
  });

  it("groups ICF loan instalments by flat and concept, keeping the lowest account", () => {
    const H = [...A3_HEADERS, "Pis", "Descripció línia"];
    const icf = (compte: string, base: number, pis: string) => [...a3Row(105376, "", "", compte, base, 0, 0), pis, `PRESTEC ICF ${pis}`];
    const eqs: Equivalencia[] = [
      { compte: "520000003", descripcio: "", partida_id: "DD_ARRENDAMIENTOS" },
      { compte: "662300006", descripcio: "", partida_id: "DD_ARRENDAMIENTOS" },
    ];
    const res = parseA3Excel(workbookBuffer([
      H,
      icf("662300006", 51.43, "EUR1A"),
      icf("520000003", 211.4, "EUR1A"),
      icf("520000003", 300, "PERU28"),
    ]), eqs);
    expect(res.despeses).toHaveLength(2);
    const eur = res.despeses.find(d => d.pis === "EUR1A")!;
    expect(eur.total_factura).toBe(262.83);
    expect(eur.compte_despesa).toBe("520000003");
    // Stable ID per flat: a second import finds the same despeses
    const again = parseA3Excel(workbookBuffer([H, icf("662300006", 51.43, "EUR1A"), icf("520000003", 211.4, "EUR1A"), icf("520000003", 300, "PERU28")]), eqs, res.despeses);
    expect(again.facturesNoves).toBe(0);
  });

  it("merges ICF capital and interest of a flat even when the capital account has no equivalence", () => {
    const H = [...A3_HEADERS, "Pis", "Descripció línia"];
    const icf = (compte: string, base: number, pis: string, desc = "ICF SETEMBRE 2026") =>
      [...a3Row(122464, "", "", compte, base, 0, 0), pis, desc];
    // Only the interest account is mapped (as with a new loan whose capital account is not set up)
    const eqs: Equivalencia[] = [{ compte: "662300032", descripcio: "", partida_id: "DD_ARRENDAMIENTOS" }];
    const res = parseA3Excel(workbookBuffer([
      H,
      icf("520000029", 112.49, "AAG8"),
      icf("662300032", 89.37, "AAG8", "ICF SETEMBRE 2026 "),
      icf("662300032", 97.42, "CAL42"),
    ]), eqs);
    expect(res.despeses).toHaveLength(2);
    const aag = res.despeses.find(d => d.pis === "AAG8")!;
    expect(aag.total_factura).toBe(201.86);
    expect(aag.partida_id).toBe("DD_ARRENDAMIENTOS");
    expect(aag.compte_despesa).toBe("520000029");
    expect(res.despeses.every(d => d.partida_id !== "SENSE_CORRESPONDENCIA")).toBe(true);
  });

  it("gives a merged ICF instalment the partida of its lowest mapped account", () => {
    const H = [...A3_HEADERS, "Pis", "Descripció línia"];
    const icf = (compte: string, base: number) => [...a3Row(122464, "", "", compte, base, 0, 0), "BAN73", "ICF SETEMBRE 2026"];
    const eqs: Equivalencia[] = [
      { compte: "520000013", descripcio: "", partida_id: "DD_PRESTEC" },
      { compte: "662300016", descripcio: "", partida_id: "DD_ARRENDAMIENTOS" },
    ];
    // Interest first: the capital account (lower) decides
    const res = parseA3Excel(workbookBuffer([H, icf("662300016", 79.85), icf("520000013", 311.59)]), eqs);
    expect(res.despeses).toHaveLength(1);
    expect(res.despeses[0].partida_id).toBe("DD_PRESTEC");
    expect(res.despeses[0].total_factura).toBe(391.44);
  });

  it("adds the lines of an extra sheet such as «Negatius», mapped by header", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([A3_HEADERS, a3Row(1, "2026/1", "F-1", "629000000", 100, 21, 0)]), "A Exportar");
    // Same columns in another order
    const neg = [...A3_HEADERS].reverse();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([neg, [...a3Row(2, "2026R/3", "AB-1", "629000000", -50, -10.5, 0)].reverse()]), "Negatius");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const res = parseA3Excel(buf, EQS, [], "A Exportar", ["Negatius"]);
    expect(res.fullsAfegits).toEqual(["Negatius"]);
    const credit = res.despeses.find(d => d.ndoc_a3 === "2026R/3")!;
    expect(credit.total_factura).toBe(-60.5);
    expect(parseA3Excel(buf, EQS, [], "A Exportar").despeses).toHaveLength(1);
  });

  it("reports existing despeses inside the file's entry range that are no longer in it", () => {
    const first = parseA3Excel(workbookBuffer([
      A3_HEADERS,
      a3Row(100, "2026/100", "F-100", "629000000", 10, 0, 0),
      a3Row(150, "2026/150", "F-150", "629000000", 10, 0, 0),
      a3Row(300, "2026/300", "F-300", "629000000", 10, 0, 0),
    ]), EQS);
    const second = parseA3Excel(workbookBuffer([
      A3_HEADERS,
      a3Row(100, "2026/100", "F-100", "629000000", 10, 0, 0),
      a3Row(200, "2026/200", "F-200", "629000000", 10, 0, 0),
    ]), EQS, first.despeses);
    const byDoc = (id: string) => first.despeses.find(d => d.id === id)!.ndoc_a3;
    // 150 is inside 100-200 and missing; 300 is outside the range (a partial file)
    expect(second.despesesDesaparegudes?.map(byDoc)).toEqual(["2026/150"]);
  });

  it("prefers the transfer grid sheet over the full A3 extract", () => {
    const wb = XLSX.utils.book_new();
    const big = [A3_HEADERS, ...Array.from({ length: 50 }, (_, i) => a3Row(i + 1, `2026/${i + 1}`, `F-${i}`, "629000000", 1, 0, 0))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(big), "AExportar_Treball");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Traspassat", ...A3_HEADERS], ["X", ...a3Row(1, "2026/1", "F-0", "629000000", 1, 0, 0)]]), "AExportar_Graella");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(parseA3Excel(buf, EQS).fullUtilitzat).toBe("AExportar_Graella");
  });

  it("leaves despeses of documents not in the file untouched", () => {
    const first = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(1, "2026/1", "F-1", "629000000", 10, 0, 0)]), EQS);
    const second = parseA3Excel(workbookBuffer([A3_HEADERS, a3Row(2, "2026/2", "F-2", "629000000", 20, 0, 0)]), EQS, first.despeses);
    expect(second.despesesOrfes).toEqual([]);
  });
});
