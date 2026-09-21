import * as XLSX from "xlsx";
import { Despesa, Imputacio, Projecte, Partida } from "./types";

export function exportJustificacionsExcel(
  despeses: Despesa[],
  imputacions: Imputacio[],
  projectes: Projecte[],
  partides: Partida[]
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

  // Filter active projects
  const activeProjects = projectes.filter(p => p.actiu);

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
    ["Exercici:", new Date().getFullYear(), "", "Data generació:", new Date().toLocaleDateString("ca-ES")],
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
  XLSX.utils.book_append_sheet(wb, wsResum, "Resum Panel");

  // 2. Sheets per Partida
  for (const [partidaId, list] of despesesByPartida.entries()) {
    if (list.length === 0) continue;

    // Excel sheet name max 31 chars
    const safeSheetName = partidaId.slice(0, 31);
    const sheetRows: any[][] = [];

    // Header Row 1: Empty
    sheetRows.push([]);

    // Header Row 2: Centre Cost
    const row2: any[] = new Array(24).fill("");
    row2[24] = "TOTAL COBERT";
    row2[25] = "TOTAL DISPONIBLE";
    activeProjects.forEach(p => {
      row2.push(`CC: ${p.financador}/${p.area}/${p.codi}`);
      row2.push("");
    });
    sheetRows.push(row2);

    // Header Row 3: Finançador
    const row3: any[] = new Array(24).fill("");
    activeProjects.forEach(p => {
      row3.push(p.financador || "-");
      row3.push("");
    });
    sheetRows.push(row3);

    // Header Row 4: Àrea
    const row4: any[] = new Array(24).fill("");
    activeProjects.forEach(p => {
      row4.push(p.area || "-");
      row4.push("");
    });
    sheetRows.push(row4);

    // Header Row 5: Projecte
    const row5: any[] = new Array(24).fill("");
    activeProjects.forEach(p => {
      row5.push(p.codi);
      row5.push("");
    });
    sheetRows.push(row5);

    // Header Row 6: Dates
    const row6: any[] = new Array(24).fill("");
    activeProjects.forEach(p => {
      row6.push(p.dates_text || "");
      row6.push("");
    });
    sheetRows.push(row6);

    // Header Row 7: Base Column Headers
    const row7: any[] = [
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
