import { describe, expect, it } from "vitest";
import { ALERTA_PCT, execucioOf, imputatPerProjecte } from "@/lib/pressupost";

describe("execucioOf", () => {
  it("has nothing to compare without a budget", () => {
    for (const budget of [undefined, null, 0, -5]) {
      const e = execucioOf(budget, 1234.5);
      expect(e.estat).toBe("sense");
      expect(e.pressupost).toBe(0);
      expect(e.imputat).toBe(1234.5);
    }
  });

  it("is ok below the alert threshold", () => {
    const e = execucioOf(1000, 500);
    expect(e).toMatchObject({ estat: "ok", pct: 50, disponible: 500, pressupost: 1000, imputat: 500 });
  });

  it("flags the alert from the threshold on", () => {
    expect(ALERTA_PCT).toBe(90);
    expect(execucioOf(1000, 899.99).estat).toBe("ok");
    expect(execucioOf(1000, 900).estat).toBe("alerta");
    expect(execucioOf(1000, 950).estat).toBe("alerta");
  });

  it("reaching exactly the budget is an alert, one cent over is exceeded", () => {
    const exact = execucioOf(100, 100);
    expect(exact.estat).toBe("alerta");
    expect(exact.pct).toBe(100);
    expect(exact.disponible).toBe(0);
    const over = execucioOf(100, 100.01);
    expect(over.estat).toBe("excedit");
    expect(over.disponible).toBe(-0.01);
  });

  it("is not fooled by floating point", () => {
    // 0.1 + 0.2 !== 0.3 in floating point
    expect(execucioOf(0.3, 0.1 + 0.2).estat).toBe("alerta");
    expect(execucioOf(0.3, 0.1 + 0.2).disponible).toBe(0);
  });

  it("handles negative totals (credit notes bigger than the invoices)", () => {
    expect(execucioOf(1000, -50)).toMatchObject({ estat: "ok", pct: -5, disponible: 1050 });
  });
});

describe("imputatPerProjecte", () => {
  it("adds the amounts of each project to the cent", () => {
    const m = imputatPerProjecte([
      { projecte_id: "P1", import: 0.1 },
      { projecte_id: "P1", import: 0.2 },
      { projecte_id: "P2", import: 10.01 },
      { projecte_id: "P2", import: -0.01 },
    ]);
    expect(m.get("P1")).toBe(0.3);
    expect(m.get("P2")).toBe(10);
    expect(m.has("P3")).toBe(false);
  });
});
