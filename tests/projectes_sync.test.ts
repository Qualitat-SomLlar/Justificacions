import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { centreCost, ExcelProjecte, newProjecteId, planProjectSync, readProjectesFromWorkbook } from "@/lib/projectes_sync";
import { Projecte } from "@/lib/types";

const web = (financador: string, area: string, codi: string, dates_text = "01/01/2026-31/12/2026", id = codi): Projecte =>
  ({ id, codi, nom: codi, financador, area, dates_text, actiu: true });
const excel = (cc: string, nom = "", dates_text = "01/01/2026-31/12/2026"): ExcelProjecte => {
  const [financador, area, codi] = cc.split("/");
  return { cc, financador, area, codi, nom: nom || codi, dates_text };
};

describe("readProjectesFromWorkbook", () => {
  it("reads the centre de cost, name and most used period of every project column", () => {
    const sheet = (period: string) => XLSX.utils.aoa_to_sheet([
      [],
      ["", "", "Centre Cost Projecte", "IMSSBCN/PIRBCNES/APROP22", "", "//", "", "IFEGEN/GEN/WIP26", "", "AJSBDLL/GEN/WIP26"],
      ["", "", "Finançador", "IMSSBCN", "", "", "", "IFEGEN", "", "AJSBDLL"],
      ["", "", "Àrea", "PIRBCNES", "", "", "", "GEN", "", "GEN"],
      ["", "", "Projecte", "APROP22", "", "", "", "WIP26", "", "WIP26"],
      ["", "", "", period, "", "", "", "01/01/2026-31/12/2026", "", ""],
      ["NUM. APUNTE", "NDOC_A3", "", "Aj. Bcn - APROP", "", "PENDENT", "", "WIP (B.3) -IFE", "", "WIP - AjSabadell"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet("01/01/2026-06/11/2026"), "DD_FORMACIO");
    XLSX.utils.book_append_sheet(wb, sheet("01/01/2026-06/11/2026"), "DD_RRHH");
    XLSX.utils.book_append_sheet(wb, sheet("01/01/2025-31/12/2025"), "DD_TELEFONIA");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["PROJECTE"], ["X"]]), "PPOST_INTERN");
    const res = readProjectesFromWorkbook(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    expect(res.map(p => p.cc)).toEqual(["IMSSBCN/PIRBCNES/APROP22", "IFEGEN/GEN/WIP26", "AJSBDLL/GEN/WIP26"]);
    const aprop = res[0];
    expect(aprop).toMatchObject({ financador: "IMSSBCN", area: "PIRBCNES", codi: "APROP22", nom: "Aj. Bcn - APROP" });
    expect(aprop.dates_text).toBe("01/01/2026-06/11/2026");
  });
});

describe("planProjectSync", () => {
  it("finds equal projects and the ones whose centre de cost changes", () => {
    const plan = planProjectSync(
      [excel("IMSSBCN/PIRBCNES/APROP22", "APROP22"), excel("DSCONVO/PIRVO/NOS26"), excel("GENCATDSMIG/GEN/NORA26"), excel("DTGENCAT/INC/MAIST125", "", "01/05/2025-30/04/2026")],
      [web("IMSSBCN", "PIRBCNES", "APROP22"), web("DSCONVO", "PIRBCNES", "NOS26"), web("GENCATDS", "GEN", "NORA26"), web("DTGENCAT", "INC", "MAIST1_25", "01/05/2025-30/04/2026")]
    );
    const by = (cc: string) => plan.files.find(f => f.excel.cc === cc)!;
    expect(by("IMSSBCN/PIRBCNES/APROP22").accio).toBe("igual");
    expect(by("DSCONVO/PIRVO/NOS26")).toMatchObject({ accio: "actualitzar", projecteId: "NOS26", canviaCentreCost: true });
    expect(by("DSCONVO/PIRVO/NOS26").canvis).toContainEqual({ camp: "area", abans: "PIRBCNES", despres: "PIRVO" });
    expect(by("GENCATDSMIG/GEN/NORA26")).toMatchObject({ accio: "actualitzar", projecteId: "NORA26" });
    expect(by("DTGENCAT/INC/MAIST125")).toMatchObject({ accio: "actualitzar", projecteId: "MAIST1_25" });
    expect(plan.nomesWeb).toHaveLength(0);
  });

  it("creates a project with a repeated code and another funder instead of reusing the existing one", () => {
    const plan = planProjectSync(
      [excel("IFEGEN/GEN/WIP26"), excel("AJSBDLL/GEN/WIP26"), excel("GENCATDSMIG/GEN/YASMIN26"), excel("DIBA/GEN/YASMIN26")],
      [web("IFEGEN", "GEN", "WIP26"), web("GENCATDS", "GEN", "YASMIN26")]
    );
    const by = (cc: string) => plan.files.find(f => f.excel.cc === cc)!;
    expect(by("IFEGEN/GEN/WIP26").accio).toBe("igual");
    expect(by("AJSBDLL/GEN/WIP26").accio).toBe("crear");
    // The closer funder keeps the web project
    expect(by("GENCATDSMIG/GEN/YASMIN26")).toMatchObject({ accio: "actualitzar", projecteId: "YASMIN26" });
    expect(by("DIBA/GEN/YASMIN26").accio).toBe("crear");
  });

  it("pairs a code written differently or with another year only with the same funder and period", () => {
    const plan = planProjectSync(
      [excel("AJT/GEN/SAAU26"), excel("AJBCN/PIRBCNES/NAUSI125"), excel("IFEGEN/GEN/NES25", "", "01/01/2025-31/12/2025"), excel("DSCONVO/COM/LOLA26")],
      [web("AJT", "GEN", "SAU26"), web("AJBCN", "PIRBCNES", "NAUSI126"), web("IFEGEN", "GEN", "NES26"), web("GENCATDS", "GEN", "NORA26")]
    );
    const by = (cc: string) => plan.files.find(f => f.excel.cc === cc)!;
    expect(by("AJT/GEN/SAAU26")).toMatchObject({ accio: "actualitzar", projecteId: "SAU26", motiu: "Codi escrit diferent" });
    expect(by("AJBCN/PIRBCNES/NAUSI125")).toMatchObject({ accio: "actualitzar", projecteId: "NAUSI126" });
    // The 2025 edition is another project
    expect(by("IFEGEN/GEN/NES25").accio).toBe("crear");
    expect(by("DSCONVO/COM/LOLA26").accio).toBe("crear");
    expect(plan.nomesWeb.map(centreCost)).toEqual(["IFEGEN/GEN/NES26", "GENCATDS/GEN/NORA26"]);
  });
});

describe("newProjecteId", () => {
  it("uses the code, or the whole centre de cost when the code is taken", () => {
    expect(newProjecteId({ financador: "DIBA", area: "INC", codi: "DFN26" }, new Set(["APROP22"]))).toBe("DFN26");
    expect(newProjecteId({ financador: "AJSBDLL", area: "GEN", codi: "WIP26" }, new Set(["WIP26"]))).toBe("AJSBDLL_GEN_WIP26");
    expect(newProjecteId({ financador: "MINTRAB", area: "", codi: "IMPS2627" }, new Set())).toBe("IMPS2627");
  });
});
