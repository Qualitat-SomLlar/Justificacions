import { describe, expect, it } from "vitest";
import { buildBulkImputacions, buildImputacions, recalcImputacionsForTotals, round2 } from "@/lib/imputacions";
import { Imputacio } from "@/lib/types";

const meta = { now: "2026-02-01T10:00:00.000Z", usuari: "test@somllar.cat" };
const cents = (n: number) => Math.round(n * 100);
const sumImport = (imps: Imputacio[]) => round2(imps.reduce((a, i) => a + i.import, 0));

describe("buildImputacions", () => {
  it("makes the amounts add up to the invoice to the cent at exactly 100%", () => {
    const imps = buildImputacions(
      "D1",
      10.01,
      [
        { projecte_id: "P1", percentatge: 50, import: 5.01 },
        { projecte_id: "P2", percentatge: 50, import: 5.01 },
      ],
      meta
    );
    expect(imps).toHaveLength(2);
    expect(imps[0].import).toBe(5.01);
    expect(imps[1].import).toBe(5.0);
    expect(cents(sumImport(imps))).toBe(cents(10.01));
  });

  it("uses despesa_projecte as the id and carries the metadata", () => {
    const [imp] = buildImputacions("D1", 100, [{ projecte_id: "P1", percentatge: 100, import: 100 }], meta);
    expect(imp.id).toBe("D1_P1");
    expect(imp.despesa_id).toBe("D1");
    expect(imp.usuari).toBe("test@somllar.cat");
    expect(imp.data_actualitzacio).toBe(meta.now);
  });

  it("merges repeated projects and joins their observations", () => {
    const imps = buildImputacions(
      "D1",
      100,
      [
        { projecte_id: "P1", percentatge: 30, import: 30, observacions: "a" },
        { projecte_id: "P1", percentatge: 20, import: 20, observacions: "b" },
      ],
      meta
    );
    expect(imps).toHaveLength(1);
    expect(imps[0].percentatge).toBe(50);
    expect(imps[0].import).toBe(50);
    expect(imps[0].observacions).toBe("a / b");
  });

  it("drops empty rows and rows without project", () => {
    const imps = buildImputacions(
      "D1",
      100,
      [
        { projecte_id: "", percentatge: 50, import: 50 },
        { projecte_id: "P1", percentatge: 0, import: 0 },
        { projecte_id: "P2", percentatge: 40, import: 40 },
      ],
      meta
    );
    expect(imps.map(i => i.projecte_id)).toEqual(["P2"]);
  });

  it("does not adjust the amounts below 100% or when the total is unknown", () => {
    const partial = buildImputacions("D1", 100, [{ projecte_id: "P1", percentatge: 40, import: 40.01 }], meta);
    expect(partial[0].import).toBe(40.01);
    const unknown = buildImputacions(
      "D1",
      undefined,
      [{ projecte_id: "P1", percentatge: 100, import: 99.99 }],
      meta
    );
    expect(unknown[0].import).toBe(99.99);
  });

  it("keeps the sign for credit notes", () => {
    const imps = buildImputacions(
      "D1",
      -100,
      [
        { projecte_id: "P1", percentatge: 33.33, import: -33.33 },
        { projecte_id: "P2", percentatge: 33.33, import: -33.33 },
        { projecte_id: "P3", percentatge: 33.34, import: -33.34 },
      ],
      meta
    );
    expect(cents(sumImport(imps))).toBe(-10000);
  });
});

describe("buildBulkImputacions", () => {
  const despeses = [
    { id: "A", total_factura: 10.01 },
    { id: "B", total_factura: 200 },
  ];

  it("closes every invoice to the cent at 100%", () => {
    const { imputacions } = buildBulkImputacions(
      despeses,
      [
        { projecte_id: "P1", percentatge: 33.33 },
        { projecte_id: "P2", percentatge: 33.33 },
        { projecte_id: "P3", percentatge: 33.34 },
      ],
      "obs",
      meta
    );
    expect(imputacions).toHaveLength(6);
    for (const d of despeses) {
      const imps = imputacions.filter(i => i.despesa_id === d.id);
      expect(cents(sumImport(imps))).toBe(cents(d.total_factura));
    }
    expect(imputacions[0].observacions).toBe("obs");
  });

  it("applies plain percentages below 100%", () => {
    const { imputacions } = buildBulkImputacions(despeses, [{ projecte_id: "P1", percentatge: 25 }], "", meta);
    expect(imputacions.find(i => i.despesa_id === "B")!.import).toBe(50);
  });

  it("merges repeated projects, drops invalid rows and reports the valid allocations", () => {
    const { validAllocations, imputacions } = buildBulkImputacions(
      despeses,
      [
        { projecte_id: "P1", percentatge: 40 },
        { projecte_id: "P1", percentatge: 60 },
        { projecte_id: "", percentatge: 10 },
        { projecte_id: "P2", percentatge: 0 },
      ],
      "",
      meta
    );
    expect(validAllocations).toEqual([{ projecte_id: "P1", percentatge: 100 }]);
    expect(imputacions).toHaveLength(2);
    expect(imputacions.every(i => i.percentatge === 100)).toBe(true);
  });

  it("produces nothing when there are no valid allocations", () => {
    const { imputacions, validAllocations } = buildBulkImputacions(despeses, [], "", meta);
    expect(imputacions).toEqual([]);
    expect(validAllocations).toEqual([]);
  });
});

describe("recalcImputacionsForTotals", () => {
  const base: Imputacio[] = [
    { id: "D1_P1", despesa_id: "D1", projecte_id: "P1", percentatge: 50, import: 50, data_actualitzacio: "old" },
    { id: "D1_P2", despesa_id: "D1", projecte_id: "P2", percentatge: 50, import: 50, data_actualitzacio: "old" },
    { id: "D2_P1", despesa_id: "D2", projecte_id: "P1", percentatge: 100, import: 20, data_actualitzacio: "old" },
  ];

  it("returns undefined when no total changed", () => {
    expect(recalcImputacionsForTotals(base, new Map(), meta.now)).toBeUndefined();
  });

  it("keeps the percentages, recalculates the amounts and closes 100% to the cent", () => {
    const res = recalcImputacionsForTotals(base, new Map([["D1", 100.01]]), meta.now)!;
    const d1 = res.filter(i => i.despesa_id === "D1");
    expect(d1.every(i => i.percentatge === 50)).toBe(true);
    expect(cents(sumImport(d1))).toBe(cents(100.01));
    expect(d1.every(i => i.data_actualitzacio === meta.now)).toBe(true);
  });

  it("leaves other despesas untouched", () => {
    const res = recalcImputacionsForTotals(base, new Map([["D1", 80]]), meta.now)!;
    expect(res.find(i => i.id === "D2_P1")).toBe(base[2]);
  });

  it("does not force a remainder when the invoice is not at 100%", () => {
    const partial: Imputacio[] = [
      { id: "D1_P1", despesa_id: "D1", projecte_id: "P1", percentatge: 40, import: 40, data_actualitzacio: "old" },
    ];
    const res = recalcImputacionsForTotals(partial, new Map([["D1", 200]]), meta.now)!;
    expect(res[0].import).toBe(80);
  });
});
