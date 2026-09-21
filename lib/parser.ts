import * as XLSX from "xlsx";
import { Despesa, Equivalencia, ImportSummary } from "./types";

function cleanStr(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function parseNum(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const s = String(val).trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function formatDate(val: any): string {
  if (!val) return "";
  if (val instanceof Date) {
    return val.toISOString().split("T")[0];
  }
  if (typeof val === "number") {
    // Excel serial date to JS Date
    const date = new Date((val - (25567 + 2)) * 86400 * 1000);
    return !isNaN(date.getTime()) ? date.toISOString().split("T")[0] : "";
  }
  const s = String(val).trim();
  // dd/mm/yyyy to yyyy-mm-dd
  const parts = s.split("/");
  if (parts.length === 3) {
    const d = parts[0].padStart(2, "0");
    const m = parts[1].padStart(2, "0");
    const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${y}-${m}-${d}`;
  }
  return s.split(" ")[0];
}

export function parseA3Excel(
  fileBuffer: ArrayBuffer | Uint8Array,
  equivalencies: Equivalencia[],
  existingDespeses: Despesa[] = []
): ImportSummary {
  const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
  
  // Look for "Export" sheet or first sheet
  const sheetName = workbook.SheetNames.find(s => s.toLowerCase() === "export") || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error("No s'ha trobat cap full de dades al fitxer Excel.");
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rawRows || rawRows.length < 2) {
    throw new Error("El fitxer Excel no conté files de dades suficients.");
  }

  // Find header row (usually row 0 or row 1)
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = rawRows[i] || [];
    const joined = row.map(c => cleanStr(c)).join(" ");
    if (joined.includes("compte") || joined.includes("factura") || joined.includes("proveidor")) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = (rawRows[headerRowIndex] || []).map(h => String(h || "").trim());
  const headerMap: { [col: string]: number } = {};
  headers.forEach((h, idx) => {
    headerMap[cleanStr(h)] = idx;
  });

  const getColIdx = (...terms: string[]) => {
    for (let c = 0; c < headers.length; c++) {
      const hClean = cleanStr(headers[c]);
      for (const t of terms) {
        if (hClean.includes(cleanStr(t))) return c;
      }
    }
    return -1;
  };

  const colApunte = getColIdx("numapunte");
  const colFin = getColIdx("financador");
  const colArea = getColIdx("area");
  const colProj = getColIdx("projecte");
  const colPis = getColIdx("pis");
  const colProv = getColIdx("proveidor");
  const colNif = getColIdx("nifproveidor", "cif", "nif");
  const colDocA3 = getColIdx("documenta3", "ndoc");
  const colFactura = getColIdx("factura");
  const colData = getColIdx("data");
  const colDataPag = getColIdx("datapagament", "pagament");
  const colCompte = getColIdx("comptedespesa", "compte");
  const colDescCompte = getColIdx("descripciocomptedespesa", "descripciocompte");
  const colDescLinia = getColIdx("descripciolinia", "linia");
  const colBase = getColIdx("baseimposable", "base");
  const colIva = getColIdx("importiva", "iva");
  const colIrpf = getColIdx("importirpf", "irpf");
  const colTotalLinia = getColIdx("importtotaldelinia", "costtotal", "totaldelinia");
  const colTotalDocA3 = getColIdx("totaldocumenta3", "totaldoc");

  // Build dictionary of equivalencies
  const dictComptes: { [compte: string]: string } = {};
  const dictDescripcions: { [desc: string]: string } = {};
  for (const eq of equivalencies) {
    if (eq.compte && eq.partida_id) dictComptes[cleanStr(eq.compte)] = eq.partida_id;
    if (eq.descripcio && eq.partida_id) dictDescripcions[cleanStr(eq.descripcio)] = eq.partida_id;
  }

  // Grouping structures
  interface GroupAcc {
    sampleRow: any[];
    docA3: string;
    factura: string;
    proveidor: string;
    cifList: Set<string>;
    facturesList: Set<string>;
    conceptesList: Set<string>;
    base: number;
    iva: number;
    irpf: number;
    costTotal: number;
    totalDocA3: number;
    partidaId: string;
    partidesVistes: Set<string>;
    compte: string;
    descCompte: string;
    dataEmissio: string;
    dataPagament: string;
    pis: string;
    area: string;
    financador: string;
    projecteA3: string;
  }

  const groups: { [clave: string]: GroupAcc } = {};
  const orderOfClaves: string[] = [];

  let totalFilesLlegides = 0;

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every(c => c === null || c === undefined || String(c).trim() === "")) {
      continue;
    }
    totalFilesLlegides++;

    const docA3 = colDocA3 !== -1 && row[colDocA3]
      ? String(row[colDocA3]).trim()
      : (colApunte !== -1 && row[colApunte] ? String(row[colApunte]).trim() : `ROW_${r}`);

    const factura = colFactura !== -1 && row[colFactura] ? String(row[colFactura]).trim() : "";
    const proveidor = colProv !== -1 && row[colProv] ? String(row[colProv]).trim() : "";
    const pNorm = proveidor.toUpperCase();
    const isIkea = pNorm.includes("IKEA");

    const rowCompte = colCompte !== -1 && row[colCompte] ? String(row[colCompte]).trim() : "";
    const rowDescCompte = colDescCompte !== -1 && row[colDescCompte] ? String(row[colDescCompte]).trim() : "";
    
    // Resolve partida
    let targetPartida = "SENSE_CORRESPONDENCIA";
    if (rowCompte && dictComptes[cleanStr(rowCompte)]) {
      targetPartida = dictComptes[cleanStr(rowCompte)];
    } else if (rowDescCompte && dictDescripcions[cleanStr(rowDescCompte)]) {
      targetPartida = dictDescripcions[cleanStr(rowDescCompte)];
    } else if (rowDescCompte.toUpperCase().startsWith("DD_")) {
      targetPartida = rowDescCompte.toUpperCase();
    }

    let clave: string;
    if (!factura || factura === "0" || factura === "") {
      clave = `SENSE_FRA_${r}`;
    } else if (isIkea) {
      clave = `${docA3}||${factura}||${targetPartida}`;
    } else {
      clave = `${docA3}||${targetPartida}`;
    }

    const nifVal = colNif !== -1 && row[colNif] ? String(row[colNif]).trim() : "";
    const descLiniaVal = colDescLinia !== -1 && row[colDescLinia] ? String(row[colDescLinia]).trim() : "";
    const baseVal = colBase !== -1 ? parseNum(row[colBase]) : 0;
    const ivaVal = colIva !== -1 ? parseNum(row[colIva]) : 0;
    const irpfVal = colIrpf !== -1 ? parseNum(row[colIrpf]) : 0;
    const costVal = colTotalLinia !== -1 ? parseNum(row[colTotalLinia]) : (baseVal + ivaVal - irpfVal);
    const docTotalVal = colTotalDocA3 !== -1 ? parseNum(row[colTotalDocA3]) : 0;

    if (!groups[clave]) {
      orderOfClaves.push(clave);
      groups[clave] = {
        sampleRow: row,
        docA3,
        factura,
        proveidor,
        cifList: new Set(),
        facturesList: new Set(),
        conceptesList: new Set(),
        base: 0,
        iva: 0,
        irpf: 0,
        costTotal: 0,
        totalDocA3: 0,
        partidaId: targetPartida,
        partidesVistes: new Set(),
        compte: rowCompte,
        descCompte: rowDescCompte,
        dataEmissio: colData !== -1 ? formatDate(row[colData]) : "",
        dataPagament: colDataPag !== -1 ? formatDate(row[colDataPag]) : "",
        pis: colPis !== -1 && row[colPis] ? String(row[colPis]).trim() : "",
        area: colArea !== -1 && row[colArea] ? String(row[colArea]).trim() : "",
        financador: colFin !== -1 && row[colFin] ? String(row[colFin]).trim() : "",
        projecteA3: colProj !== -1 && row[colProj] ? String(row[colProj]).trim() : "",
      };
    }

    const g = groups[clave];
    if (nifVal) g.cifList.add(nifVal);
    if (factura && factura !== "0") g.facturesList.add(factura);
    if (descLiniaVal) g.conceptesList.add(descLiniaVal);
    g.partidesVistes.add(targetPartida);

    g.base += baseVal;
    g.iva += ivaVal;
    g.irpf += irpfVal;
    g.costTotal += costVal;
    if (docTotalVal > g.totalDocA3) g.totalDocA3 = docTotalVal;
  }

  // Build map of existing despeses to detect updates/modifications
  const existingMap = new Map<string, Despesa>();
  for (const d of existingDespeses) {
    existingMap.set(d.id, d);
  }

  let facturesNoves = 0;
  let facturesExistents = 0;
  let facturesModificades = 0;
  let senseCorrespondencia = 0;
  const resultDespeses: Despesa[] = [];

  for (const clave of orderOfClaves) {
    const g = groups[clave];
    
    // Total factura = cost total - IRPF (per business rule & script solution)
    const baseTotal = Math.round(g.base * 100) / 100;
    const ivaTotal = Math.round(g.iva * 100) / 100;
    const irpfTotal = Math.round(g.irpf * 100) / 100;
    const costTotal = Math.round(g.costTotal * 100) / 100;
    const totalFactura = Math.round((costTotal - irpfTotal) * 100) / 100;

    const facturasStr = Array.from(g.facturesList).join(" + ") || g.factura;
    const cifStr = Array.from(g.cifList).join(" + ");
    const conceptesStr = Array.from(g.conceptesList).join(" // ");

    // Stable ID
    const cleanId = `${g.docA3}_${facturasStr}_${g.partidaId}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    if (g.partidaId === "SENSE_CORRESPONDENCIA") {
      senseCorrespondencia++;
    }

    const existing = existingMap.get(cleanId);
    let modificatA3 = false;

    if (existing) {
      facturesExistents++;
      // Check if amounts changed in A3
      if (
        Math.abs(existing.total_factura - totalFactura) > 0.01 ||
        Math.abs(existing.base_imposable - baseTotal) > 0.01
      ) {
        modificatA3 = true;
        facturesModificades++;
      }
    } else {
      facturesNoves++;
    }

    const yearVal = g.dataEmissio ? parseInt(g.dataEmissio.split("-")[0]) : new Date().getFullYear();

    const d: Despesa = {
      id: cleanId,
      numapunte: g.docA3,
      ndoc_a3: g.docA3,
      financador: g.financador,
      area: g.area,
      projecte_a3: g.projecteA3,
      pis: g.pis,
      compte_despesa: g.compte,
      descripcio_compte: g.descCompte,
      proveidor: g.proveidor,
      cif: cifStr,
      factura: facturasStr,
      data_emissio: g.dataEmissio,
      data_pagament: g.dataPagament,
      descripcio_linia: conceptesStr,
      any_fiscal: isNaN(yearVal) ? new Date().getFullYear() : yearVal,
      base_imposable: baseTotal,
      iva: ivaTotal,
      irpf: irpfTotal,
      cost_total: costTotal,
      total_factura: totalFactura,
      partida_id: g.partidaId,
      modificat_a3: modificatA3,
      es_compartida: g.partidesVistes.size > 1,
      estat: existing ? existing.estat : "pendent",
      percentatge_total: existing ? existing.percentatge_total : 0,
      import_total: existing ? existing.import_total : 0,
    };

    resultDespeses.push(d);
  }

  return {
    totalFilesLlegides,
    facturesNoves,
    facturesExistents,
    facturesModificades,
    senseCorrespondencia,
    despeses: resultDespeses,
  };
}
