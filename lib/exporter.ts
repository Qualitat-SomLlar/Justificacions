import * as XLSX from "xlsx";
import { Despesa, Imputacio, Projecte, Partida } from "./types";

const BASE_HEADERS = [
  "NUM. APUNTE",
  "NDOC_A3",
  "FINANÇADOR",
  "ÀREA",
  "PROJECTE",
  "CODI ANALÍTIC PIS",
  "CODI ANALITIC",
  "COMPTE DESPESA",
  "PIS",
  "DESCRIPCIÓ COMPTE DESPESA a3",
  "DESCRIPCIÓ DESPESA",
  "PROVEÏDOR",
  "CIF",
  "FACTURA",
  "DATA EMISSIÓ FRA",
  "DATA PAG.",
  "DESCRIPCIÓ LÍNIA",
  "ANY",
  "BASE IMPOSABLE",
  "IVA",
  "IRPF",
  "COST TOTAL",
  "TOTAL FACTURA",
  "TOTAL COBERT",
  "TOTAL DISPONIBLE"
];

// Excel sheet names: max 31 chars, no : \ / ? * [ ] and unique (case-insensitive)
function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[:\\/?*\[\]]/g, "_").trim() || "Partida").slice(0, 31);
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

export function exportJustificacionsExcel(
  despeses: Despesa[],
  imputacions: Imputacio[],
  projectes: Projecte[],
  partides: Partida[],
  exercici: number
): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Index allocations by despesa_id and projecte_id
  const imputacionsMap = new Map<string, Map<string, Imputacio>>();
  for (const imp of imputacions) {
    if (!imputacionsMap.has(imp.despesa_id)) {
      imputacionsMap.set(imp.despesa_id, new Map());
    }
    imputacionsMap.get(imp.despesa_id)!.set(imp.projecte_id, imp);
  }

  // Active projects, plus closed ones that still have imputations (otherwise TOTAL COBERT
  // would include amounts with no project column)
  const imputedProjectIds = new Set(imputacions.filter(imp => imp.percentatge > 0 || imp.import > 0).map(imp => imp.projecte_id));
  const activeProjects = projectes.filter(p => p.actiu || imputedProjectIds.has(p.id));

  // Group despeses by Partida
  const despesesByPartida = new Map<string, Despesa[]>();
  for (const d of despeses) {
    const pId = d.partida_id || "SENSE_CORRESPONDENCIA";
    if (!despesesByPartida.has(pId)) {
      despesesByPartida.set(pId, []);
    }
    despesesByPartida.get(pId)!.push(d);
  }

  // 1. Resum Global Sheet
  const resumData: any[][] = [
    ["RESUM GENERAL DE JUSTIFICACIONS - SOM LLAR", "", "", "", ""],
    ["Exercici:", exercici, "", "Data generació:", new Date().toLocaleDateString("ca-ES")],
    [],
    ["Partida", "Descripció Partida", "Num. Despeses", "Cost Total (€)", "Total Factura (€)", "Total Cobert (€)", "Total Disponible (€)", "Estat"]
  ];

  let sumCostTotal = 0;
  let sumTotalFactura = 0;
  let sumCobert = 0;
  let sumDisponible = 0;

  for (const [partidaId, list] of despesesByPartida.entries()) {
    const partidaObj = partides.find(p => p.id === partidaId);
    const nomPartida = partidaObj ? partidaObj.nom : partidaId;
    
    let partCost = 0;
    let partFact = 0;
    let partCobert = 0;

    for (const d of list) {
      partCost += d.cost_total;
      partFact += d.total_factura;
      partCobert += d.import_total;
    }

    const partDisp = Math.max(0, partFact - partCobert);
    sumCostTotal += partCost;
    sumTotalFactura += partFact;
    sumCobert += partCobert;
    sumDisponible += partDisp;

    resumData.push([
      partidaId,
      nomPartida,
      list.length,
      Math.round(partCost * 100) / 100,
      Math.round(partFact * 100) / 100,
      Math.round(partCobert * 100) / 100,
      Math.round(partDisp * 100) / 100,
      partFact > 0 && Math.abs(partFact - partCobert) < 0.01 ? "Completat 100%" : (partCobert > partFact ? "ALERTA >100%" : "En curs")
    ]);
  }

  resumData.push([]);
  resumData.push([
    "TOTALS",
    "",
    despeses.length,
    Math.round(sumCostTotal * 100) / 100,
    Math.round(sumTotalFactura * 100) / 100,
    Math.round(sumCobert * 100) / 100,
    Math.round(sumDisponible * 100) / 100,
    ""
  ]);

  const wsResum = XLSX.utils.aoa_to_sheet(resumData);
  const usedSheetNames = new Set<string>();
  XLSX.utils.book_append_sheet(wb, wsResum, uniqueSheetName("Resum Panel", usedSheetNames));

  // 2. Sheets per Partida
  for (const [partidaId, list] of despesesByPartida.entries()) {
    if (list.length === 0) continue;

    const safeSheetName = uniqueSheetName(partidaId, usedSheetNames);
    const sheetRows: any[][] = [];
    // Project columns start right after the base columns in every header row
    const padding = () => new Array(BASE_HEADERS.length).fill("");

    // Header Row 1: Empty
    sheetRows.push([]);

    // Header Row 2: Centre Cost
    const row2: any[] = padding();
    row2[BASE_HEADERS.length - 2] = "TOTAL COBERT";
    row2[BASE_HEADERS.length - 1] = "TOTAL DISPONIBLE";
    activeProjects.forEach(p => {
      row2.push(`CC: ${p.financador}/${p.area}/${p.codi}`);
      row2.push("");
    });
    sheetRows.push(row2);

    // Header Row 3: Finançador
    const row3: any[] = padding();
    activeProjects.forEach(p => {
      row3.push(p.financador || "-");
      row3.push("");
    });
    sheetRows.push(row3);

    // Header Row 4: Àrea
    const row4: any[] = padding();
    activeProjects.forEach(p => {
      row4.push(p.area || "-");
      row4.push("");
    });
    sheetRows.push(row4);

    // Header Row 5: Projecte
    const row5: any[] = padding();
    activeProjects.forEach(p => {
      row5.push(p.actiu ? p.codi : `${p.codi} (TANCAT)`);
      row5.push("");
    });
    sheetRows.push(row5);

    // Header Row 6: Dates
    const row6: any[] = padding();
    activeProjects.forEach(p => {
      row6.push(p.dates_text || "");
      row6.push("");
    });
    sheetRows.push(row6);

    // Header Row 7: Base Column Headers
    const row7: any[] = [...BASE_HEADERS];

    activeProjects.forEach(p => {
      row7.push(`% ${p.codi}`);
      row7.push(`Import ${p.codi} (€)`);
    });
    sheetRows.push(row7);

    // Data Rows
    for (const d of list) {
      const dImputacions = imputacionsMap.get(d.id);
      const totalCobert = d.import_total;
      const totalDisponible = Math.max(0, d.total_factura - totalCobert);

      const dRow: any[] = [
        d.numapunte,
        d.ndoc_a3,
        d.financador,
        d.area,
        d.projecte_a3,
        d.pis,
        `${d.financador}/${d.area}/${d.projecte_a3}/${d.pis}`,
        d.compte_despesa,
        d.pis,
        d.descripcio_compte,
        d.descripcio_compte,
        d.proveidor,
        d.cif,
        d.factura,
        d.data_emissio,
        d.data_pagament,
        d.descripcio_linia,
        d.any_fiscal,
        d.base_imposable,
        d.iva,
        d.irpf,
        d.cost_total,
        d.total_factura,
        totalCobert,
        totalDisponible
      ];

      // Append project pairs
      for (const p of activeProjects) {
        const imp = dImputacions?.get(p.id);
        if (imp && imp.percentatge > 0) {
          dRow.push(imp.percentatge / 100); // format as fraction for Excel %
          dRow.push(imp.import);
        } else {
          dRow.push(0);
          dRow.push(0);
        }
      }

      sheetRows.push(dRow);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
