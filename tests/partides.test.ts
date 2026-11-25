import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { canonicalPartidaId, findPartidaAliases } from "@/lib/partides";
import { parseA3Excel } from "@/lib/parser";

const CATALEG = [
  { id: "DD_PROFESS ADMC i GESTIO" },
  { id: "DD_MAT i ACTIVITATS PROJECTES" },
  { id: "DD_FORMACIO" },
];

describe("canonicalPartidaId", () => {
  it("returns the catalog spelling of a code written another way", () => {
    expect(canonicalPartidaId("DD_PROFESS ADMC I GESTIO", CATALEG)).toBe("DD_PROFESS ADMC i GESTIO");
    expect(canonicalPartidaId("DD_MAT I ACTIVITATS PROJECTES", CATALEG)).toBe("DD_MAT i ACTIVITATS PROJECTES");
    expect(canonicalPartidaId("DD_FORMACIÓ", CATALEG)).toBe("DD_FORMACIO");
  });

  it("leaves catalog codes, unknown codes and SENSE_CORRESPONDENCIA unchanged", () => {
    expect(canonicalPartidaId("DD_FORMACIO", CATALEG)).toBe("DD_FORMACIO");
    expect(canonicalPartidaId("DD_NOVA", CATALEG)).toBe("DD_NOVA");
    expect(canonicalPartidaId("SENSE_CORRESPONDENCIA", CATALEG)).toBe("SENSE_CORRESPONDENCIA");
    expect(canonicalPartidaId("", CATALEG)).toBe("");
  });
});

describe("findPartidaAliases", () => {
  it("groups the despeses stored with a misspelt catalog partida", () => {
    const despeses = [
      { partida_id: "DD_PROFESS ADMC I GESTIO" },
      { partida_id: "DD_PROFESS ADMC I GESTIO" },
      { partida_id: "DD_PROFESS ADMC i GESTIO" },
      { partida_id: "DD_MAT I ACTIVITATS PROJECTES" },
      { partida_id: "DD_NOVA" },
      { partida_id: "SENSE_CORRESPONDENCIA" },
    ];
    expect(findPartidaAliases(despeses, CATALEG)).toEqual([
      { from: "DD_MAT I ACTIVITATS PROJECTES", to: "DD_MAT i ACTIVITATS PROJECTES", despeses: 1 },
      { from: "DD_PROFESS ADMC I GESTIO", to: "DD_PROFESS ADMC i GESTIO", despeses: 2 },
    ]);
  });
});

describe("parseA3Excel with a «Full destí» column", () => {
  const buffer = (desti: string) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["numapunte", "Proveidor", "Nº document A3", "Nº factura", "Data", "Compte despesa", "Base imposable", "Import IVA", "Import IRPF", "Import total de línia", "Full destí"],
      [1, "Prov", "2026/1711", "F-1", "01/02/2026", "623000000", 100, 21, 0, 121, desti],
    ]), "Export");
    return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  };

  it("stores the catalog spelling of the partida", () => {
    const res = parseA3Excel(buffer("DD_PROFESS ADMC i GESTIO"), [], [], undefined, [], CATALEG);
    expect(res.despeses[0].partida_id).toBe("DD_PROFESS ADMC i GESTIO");
  });

  it("relinks a despesa stored with the old uppercase spelling instead of duplicating it", () => {
    const old = parseA3Excel(buffer("DD_PROFESS ADMC i GESTIO"), []).despeses;
    expect(old[0].partida_id).toBe("DD_PROFESS ADMC I GESTIO");
    const stored = old.map(d => ({ ...d, partida_id: canonicalPartidaId(d.partida_id, CATALEG) }));
    const res = parseA3Excel(buffer("DD_PROFESS ADMC i GESTIO"), [], stored, undefined, [], CATALEG);
    expect(res.despeses).toHaveLength(1);
    expect(res.despeses[0].id).toBe(old[0].id);
    expect(res.despesesOrfes || []).toHaveLength(0);
  });
});
