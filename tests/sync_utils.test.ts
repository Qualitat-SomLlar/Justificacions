import { describe, expect, it } from "vitest";
import {
  FIELD_DELETED,
  chunk,
  countMissing,
  diffItems,
  disponibleOf,
  estatFromPercent,
  hasChanges,
  itemKey,
  percentCents,
  pickMigrationSource,
  shardOf,
  stableStringify,
} from "@/lib/sync_utils";

type Item = { id: string; a?: number; b?: string };
const key = (i: Item) => i.id;

describe("diffItems", () => {
  it("detects created, updated (only changed fields) and deleted items", () => {
    const prev: Item[] = [{ id: "1", a: 1, b: "x" }, { id: "2", a: 2 }, { id: "3", a: 3 }];
    const next: Item[] = [{ id: "1", a: 1, b: "y" }, { id: "2", a: 2 }, { id: "4", a: 4 }];
    const c = diffItems(prev, next, key);
    expect(c.created).toEqual([{ id: "4", a: 4 }]);
    expect(c.updated).toEqual([{ key: "1", fields: { b: "y" } }]);
    expect(c.deleted).toEqual(["3"]);
    expect(hasChanges(c)).toBe(true);
  });

  it("marks a removed field as FIELD_DELETED", () => {
    const c = diffItems<Item>([{ id: "1", a: 1, b: "x" }], [{ id: "1", a: 1 }], key);
    expect(c.updated).toEqual([{ key: "1", fields: { b: FIELD_DELETED } }]);
  });

  it("ignores key order differences (Firestore returns fields alphabetically)", () => {
    const prev = [{ id: "1", nested: { x: 1, y: 2 } }];
    const next = [{ id: "1", nested: { y: 2, x: 1 } }];
    expect(hasChanges(diffItems(prev, next, key))).toBe(false);
  });

  it("reports no changes for identical lists", () => {
    const list: Item[] = [{ id: "1", a: 1 }];
    expect(hasChanges(diffItems(list, [...list], key))).toBe(false);
  });
});

describe("stableStringify", () => {
  it("sorts keys and skips undefined", () => {
    expect(stableStringify({ b: 1, a: undefined, c: [2, { z: 1, y: 2 }] })).toBe('{"b":1,"c":[2,{"y":2,"z":1}]}');
  });
});

describe("shardOf / itemKey", () => {
  it("is deterministic and within range", () => {
    for (const k of ["a", "doc_1_FRA-1_DD_RRHH", "ñ/é.x", ""]) {
      const s = shardOf(k, 32);
      expect(s).toBe(shardOf(k, 32));
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(32);
    }
  });

  it("spreads keys across shards", () => {
    const used = new Set<number>();
    for (let i = 0; i < 500; i++) used.add(shardOf(`key_${i}`, 32));
    expect(used.size).toBeGreaterThan(25);
  });

  it("encodes dots and slashes and avoids reserved __x__ keys", () => {
    expect(itemKey("a/b.c")).not.toMatch(/[./]/);
    expect(itemKey("__x__")).toBe("id___x__");
    expect(itemKey("")).toBe("id_");
  });
});

describe("percent and estat", () => {
  it("compares percentages in whole hundredths", () => {
    expect(percentCents(100)).toBe(10000);
    expect(percentCents(33.33 + 33.33 + 33.34)).toBe(10000);
    expect(percentCents(0.1 + 0.2)).toBe(30);
  });

  it("derives the estat", () => {
    expect(estatFromPercent(0)).toBe("pendent");
    expect(estatFromPercent(40)).toBe("parcial");
    expect(estatFromPercent(100)).toBe("completada");
    expect(estatFromPercent(100.01)).toBe("excedida");
    expect(estatFromPercent(99.99)).toBe("parcial");
  });
});

describe("disponibleOf", () => {
  it("returns the amount still to justify", () => {
    expect(disponibleOf({ total_factura: 100, import_total: 40 })).toBe(60);
  });
  it("does not let an excess offset other invoices", () => {
    expect(disponibleOf({ total_factura: 100, import_total: 130 })).toBe(0);
  });
  it("keeps the sign of credit notes", () => {
    expect(disponibleOf({ total_factura: -100, import_total: -30 })).toBe(-70);
    expect(disponibleOf({ total_factura: -100, import_total: -130 })).toBe(0);
  });
});

describe("migration helpers", () => {
  it("prefers the local copy, then the cloud one, never a union", () => {
    expect(pickMigrationSource([1], [2])).toEqual({ items: [2], source: "aquest navegador" });
    expect(pickMigrationSource([1], [])).toEqual({ items: [1], source: "núvol" });
    expect(pickMigrationSource(null, null)).toEqual({ items: [], source: "cap" });
  });

  it("counts items present only in the other copy", () => {
    expect(countMissing([{ id: "1" }], [{ id: "1" }, { id: "2" }], (i: { id: string }) => i.id)).toBe(1);
    expect(countMissing([{ id: "1" }], null, (i: { id: string }) => i.id)).toBe(0);
  });
});

describe("chunk", () => {
  it("splits in pieces of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
