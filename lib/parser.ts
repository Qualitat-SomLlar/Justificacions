import * as XLSX from "xlsx";
import { Despesa, Equivalencia, ImportSummary } from "./types";

export function cleanStr(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function parseNum(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const raw = String(val).trim().replace(/[\s€]/g, "");
  let s: string;
  if (raw.includes(",")) {
    // 1.234,56 -> 1234.56
    s = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    // 1.234.567 -> thousands separators
    s = raw.replace(/\./g, "");
  } else {
    // 1234.56 -> already a decimal point
    s = raw;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function formatDate(val: any): string {
  if (!val) return "";
  if (val instanceof Date) {
    // Local components: toISOString() would shift dates at local midnight to the previous day
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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

export interface SheetInfo {
  name: string;
  rowCount: number;
  isRecommended: boolean;
  score: number;
}

export interface WorkbookInspection {
  sheets: SheetInfo[];
  recommendedSheet: string;
  detectedColumns: { camp: string; nomColumna: string; trobada: boolean }[];
  sampleRows: {
    docA3: string;
    proveidor: string;
    factura: string;
    compte: string;
    descCompte: string;
    importTotal: number;
    partidaDetectada: string;
  }[];
}

function findHeaderRowIndex(rawRows: any[][]): number {
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = rawRows[i] || [];
    const joined = row.map(c => cleanStr(c)).join(" ");
    if (
      joined.includes("compte") ||
      joined.includes("cuenta") ||
      joined.includes("factura") ||
      joined.includes("proveidor") ||
      joined.includes("proveedor")
    ) {
      return i;
    }
  }
  return 0;
}

/**
 * Maps each field to a column index (-1 if absent). Terms are tried in priority order, exact
 * header matches before partial ones, and a column already taken by a previous field can't be
 * reused (e.g. "Total Document A3" must not be read as the line total or the document number).
 */
function detectColumns(headers: string[]) {
  const cleanHeaders = headers.map(h => cleanStr(h));
  const claimed = new Set<number>();

  const find = (terms: string[], claim = true): number => {
    const cleanTerms = terms.map(t => cleanStr(t));
    for (const t of cleanTerms) {
      const c = cleanHeaders.findIndex((h, i) => !claimed.has(i) && h === t);
      if (c !== -1) {
        if (claim) claimed.add(c);
        return c;
      }
    }
    for (const t of cleanTerms) {
      const c = cleanHeaders.findIndex((h, i) => !claimed.has(i) && h !== "" && h.includes(t));
      if (c !== -1) {
        if (claim) claimed.add(c);
        return c;
      }
    }
    return -1;
  };

  // Most specific fields first
  const totalDocA3 = find(["totaldocumenta3", "totaldocumento", "totaldoc", "totalasiento"]);
  const totalLinia = find(["importtotaldelinia", "importetotaldelinea", "totaldelinia", "totaldelinea", "importtotal", "importetotal", "costtotal", "total"]);
  const base = find(["baseimposable", "baseimponible", "baseimp", "base"]);
  const iva = find(["importiva", "importeiva", "iva"]);
  const irpf = find(["importirpf", "importeirpf", "irpf", "retencio", "retencion"]);
  const dataPag = find(["datapagament", "fechapago", "datapag", "fechavencimiento", "venciment", "fvencimiento", "pagament", "pago"]);
  const data = find(["dataemissio", "datafactura", "fechaemision", "fechafactura", "fexpedicion", "femision", "data", "fecha"]);
  const descCompte = find(["descripciocomptedespesa", "descripciocompte", "descripcioncuenta", "descripciocuenta", "nomcompte", "titulocuenta", "desccta"]);
  const descLinia = find(["descripciolinia", "descripcionlinea", "concepte", "concepto", "descripcio", "descripcion", "texto", "linia", "linea"]);
  const compte = find(["comptedespesa", "codicompte", "cuentagasto", "subcuenta", "subcta", "codcta", "compte", "cuenta", "cta"]);
  const nif = find(["nifproveidor", "nifproveedor", "cifproveidor", "cifproveedor", "niftercero", "cif", "nif", "dni"]);
  const prov = find(["proveidor", "proveedor", "nomproveidor", "nomproveedor", "nombreproveedor", "raosocial", "razonsocial", "emisor", "tercero"]);
  const partidaDesti = find(["fulldesti", "fulladesti", "partidadesti", "partidapressupostaria", "partida", "desti", "destino"]);
  const factura = find(["numfactura", "nfactura", "nrofactura", "numfra", "factura", "fra"]);
  const docA3 = find(["documenta3", "ndoca3", "ndoc", "numdoc", "documento", "asiento", "numapunte", "apunte"]);
  // Only a fallback for docA3: may point to the same column
  const apunte = find(["numapunte", "apunte"], false);
  const fin = find(["financador", "financiador", "entitat", "entidad"]);
  const area = find(["area", "departament", "departamento", "seccion"]);
  const proj = find(["projecte", "proyecto"]);
  const pis = find(["pis", "piso", "immoble", "inmueble", "habitatge", "vivienda", "centre", "centro"]);

  return {
    totalDocA3, totalLinia, base, iva, irpf, dataPag, data, descCompte, descLinia, compte,
    nif, prov, partidaDesti, factura, docA3, apunte, fin, area, proj, pis,
  };
}

/**
 * Score sheet by invoice-affinity to auto-detect the best sheet to import
 */
function scoreSheet(sheetName: string, worksheet: XLSX.WorkSheet): number {
  const sLower = sheetName.toLowerCase();
  if (
    sLower.includes("instruccion") ||
    sLower.includes("resum") ||
    sLower.includes("panel") ||
    sLower.includes("equiv") ||
    sLower.includes("subtotal")
  ) {
    return -100;
  }
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rawRows || rawRows.length < 2) return -100;

  let score = 0;
  if (sLower.includes("export")) score += 50;
  if (sLower.includes("gastos") || sLower.includes("despeses") || sLower.includes("factur")) score += 30;

  const headerRow = rawRows[0] || [];
  const joined = headerRow.map(c => cleanStr(c)).join(" ");
  if (joined.includes("compte") || joined.includes("cuenta") || joined.includes("cta")) score += 25;
  if (joined.includes("factura") || joined.includes("fra")) score += 25;
  if (joined.includes("proveidor") || joined.includes("proveedor")) score += 25;
  if (joined.includes("fulldesti") || joined.includes("partida") || joined.includes("desti")) score += 30;
  if (joined.includes("base")) score += 10;
  if (joined.includes("total")) score += 10;

  score += Math.min(rawRows.length / 100, 20);
  return score;
}

export function findBestSheet(workbook: XLSX.WorkBook, preferredSheet?: string): string {
  if (preferredSheet && workbook.Sheets[preferredSheet]) {
    return preferredSheet;
  }
  let bestSheet = workbook.SheetNames[0];
  let maxScore = -999;
  for (const s of workbook.SheetNames) {
    const sc = scoreSheet(s, workbook.Sheets[s]);
    if (sc > maxScore) {
      maxScore = sc;
      bestSheet = s;
    }
  }
  return bestSheet;
}

/**
 * Inspects the Excel file, returning available sheets, column mapping diagnosis, and a preview
 */
export function inspectA3Workbook(
  fileBuffer: ArrayBuffer | Uint8Array,
  preferredSheetName?: string
): WorkbookInspection {
  const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: false });
  const recommendedSheet = findBestSheet(workbook, preferredSheetName);

  const sheets: SheetInfo[] = workbook.SheetNames.map(name => {
    const ws = workbook.Sheets[name];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const score = scoreSheet(name, ws);
    return {
      name,
      rowCount: rawRows.length > 0 ? rawRows.length - 1 : 0,
      isRecommended: name === recommendedSheet,
      score,
    };
  });

  const worksheet = workbook.Sheets[recommendedSheet];
  const rawRows: any[][] = worksheet ? XLSX.utils.sheet_to_json(worksheet, { header: 1 }) : [];

  const headerRowIndex = findHeaderRowIndex(rawRows);
  const headers = (rawRows[headerRowIndex] || []).map(h => String(h || "").trim());
  const cols = detectColumns(headers);
  const colDocA3 = cols.docA3;
  const colFactura = cols.factura;
  const colProv = cols.prov;
  const colCompte = cols.compte;
  const colDescCompte = cols.descCompte;
  const colPartidaDesti = cols.partidaDesti;
  const colTotalLinia = cols.totalLinia;

  const detectedColumns = [
    { camp: "Document A3 / Asiento", nomColumna: colDocA3 !== -1 ? headers[colDocA3] : "No trobat", trobada: colDocA3 !== -1 },
    { camp: "Nº Factura", nomColumna: colFactura !== -1 ? headers[colFactura] : "No trobat", trobada: colFactura !== -1 },
    { camp: "Proveïdor", nomColumna: colProv !== -1 ? headers[colProv] : "No trobat", trobada: colProv !== -1 },
    { camp: "Compte Comptable", nomColumna: colCompte !== -1 ? headers[colCompte] : "No trobat", trobada: colCompte !== -1 },
    { camp: "Descripció Compte", nomColumna: colDescCompte !== -1 ? headers[colDescCompte] : "No trobat", trobada: colDescCompte !== -1 },
    { camp: "Partida Destí (Directa)", nomColumna: colPartidaDesti !== -1 ? headers[colPartidaDesti] : "Per equivalència", trobada: colPartidaDesti !== -1 },
    { camp: "Import Total", nomColumna: colTotalLinia !== -1 ? headers[colTotalLinia] : "No trobat", trobada: colTotalLinia !== -1 },
  ];

  const sampleRows: WorkbookInspection["sampleRows"] = [];
  for (let r = headerRowIndex + 1; r < Math.min(rawRows.length, headerRowIndex + 10); r++) {
    const row = rawRows[r];
    if (!row || row.every(c => c === null || c === undefined || String(c).trim() === "")) continue;
    const doc = colDocA3 !== -1 && row[colDocA3] ? String(row[colDocA3]).trim() : `Línia ${r}`;
    const prov = colProv !== -1 && row[colProv] ? String(row[colProv]).trim() : "-";
    const fra = colFactura !== -1 && row[colFactura] ? String(row[colFactura]).trim() : "-";
    const compte = colCompte !== -1 && row[colCompte] ? String(row[colCompte]).trim() : "-";
    const descCompte = colDescCompte !== -1 && row[colDescCompte] ? String(row[colDescCompte]).trim() : "-";
    const imp = colTotalLinia !== -1 ? parseNum(row[colTotalLinia]) : 0;
    const desti = colPartidaDesti !== -1 && row[colPartidaDesti] ? String(row[colPartidaDesti]).trim() : "";

    sampleRows.push({
      docA3: doc,
      proveidor: prov,
      factura: fra,
      compte,
      descCompte,
      importTotal: imp,
      partidaDetectada: desti || (compte ? `Assignar per compte ${compte}` : "Sense compte"),
    });

    if (sampleRows.length >= 3) break;
  }

  return {
    sheets,
    recommendedSheet,
    detectedColumns,
    sampleRows,
  };
}

/**
 * Main parser: processes the selected sheet with multi-level partida resolution
 */
export function parseA3Excel(
  fileBuffer: ArrayBuffer | Uint8Array,
  equivalencies: Equivalencia[],
  existingDespeses: Despesa[] = [],
  preferredSheetName?: string
): ImportSummary {
  const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: false });
  
  const sheetName = findBestSheet(workbook, preferredSheetName);
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`No s'ha trobat cap full de dades anomenat '${sheetName}' al fitxer Excel.`);
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rawRows || rawRows.length < 2) {
    throw new Error(`El full '${sheetName}' no conté files de dades suficients.`);
  }

  // Find header row (usually row 0 or row 1)
  const headerRowIndex = findHeaderRowIndex(rawRows);
  const headers = (rawRows[headerRowIndex] || []).map(h => String(h || "").trim());
  const cols = detectColumns(headers);

  const colApunte = cols.apunte;
  const colFin = cols.fin;
  const colArea = cols.area;
  const colProj = cols.proj;
  const colPis = cols.pis;
  const colProv = cols.prov;
  const colNif = cols.nif;
  const colDocA3 = cols.docA3;
  const colFactura = cols.factura;
  const colData = cols.data;
  const colDataPag = cols.dataPag;
  const colCompte = cols.compte;
  const colDescCompte = cols.descCompte;
  const colPartidaDesti = cols.partidaDesti;
  const colDescLinia = cols.descLinia;
  const colBase = cols.base;
  const colIva = cols.iva;
  const colIrpf = cols.irpf;
  const colTotalLinia = cols.totalLinia;
  const colTotalDocA3 = cols.totalDocA3;

  // Diagnosis of detected columns
  const columnesDetectades = [
    { camp: "Document A3", nomColumna: colDocA3 !== -1 ? headers[colDocA3] : "No trobat", trobada: colDocA3 !== -1 },
    { camp: "Factura", nomColumna: colFactura !== -1 ? headers[colFactura] : "No trobat", trobada: colFactura !== -1 },
    { camp: "Proveïdor", nomColumna: colProv !== -1 ? headers[colProv] : "No trobat", trobada: colProv !== -1 },
    { camp: "Compte Comptable", nomColumna: colCompte !== -1 ? headers[colCompte] : "No trobat", trobada: colCompte !== -1 },
    { camp: "Partida Directa", nomColumna: colPartidaDesti !== -1 ? headers[colPartidaDesti] : "No present", trobada: colPartidaDesti !== -1 },
    { camp: "Import Línia", nomColumna: colTotalLinia !== -1 ? headers[colTotalLinia] : "No trobat", trobada: colTotalLinia !== -1 },
  ];

  // Build dictionary of equivalencies
  const dictComptes: { [compte: string]: string } = {};
  const dictDescripcions: { [desc: string]: string } = {};
  for (const eq of equivalencies) {
    if (eq.compte && eq.partida_id) {
      const cClean = cleanStr(eq.compte);
      dictComptes[cClean] = eq.partida_id;
      const digitsOnly = cClean.replace(/[^0-9]/g, "");
      if (digitsOnly) dictComptes[digitsOnly] = eq.partida_id;
    }
    if (eq.descripcio && eq.partida_id) {
      dictDescripcions[cleanStr(eq.descripcio)] = eq.partida_id;
    }
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
  const unmappedAccountsTracker = new Map<string, { desc: string; count: number }>();

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

    const rowCompte = colCompte !== -1 && row[colCompte] !== undefined ? String(row[colCompte]).trim() : "";
    const rowDescCompte = colDescCompte !== -1 && row[colDescCompte] !== undefined ? String(row[colDescCompte]).trim() : "";
    const rowPartidaDesti = colPartidaDesti !== -1 && row[colPartidaDesti] !== undefined ? String(row[colPartidaDesti]).trim() : "";
    
    // Resolve partida (Multi-level)
    let targetPartida = "SENSE_CORRESPONDENCIA";

    // 1. Direct Partida column in the Excel (e.g. 'Full destí' / 'Partida')
    if (rowPartidaDesti && rowPartidaDesti !== "0" && rowPartidaDesti !== "-" && rowPartidaDesti !== "") {
      const rawP = rowPartidaDesti.toUpperCase().trim();
      targetPartida = rawP.startsWith("DD_") ? rawP : `DD_${rawP}`;
    }

    // 2. By Account (exact clean or digits-only)
    if (targetPartida === "SENSE_CORRESPONDENCIA" && rowCompte) {
      const cClean = cleanStr(rowCompte);
      const digitsOnly = cClean.replace(/[^0-9]/g, "");
      if (dictComptes[cClean]) {
        targetPartida = dictComptes[cClean];
      } else if (dictComptes[digitsOnly]) {
        targetPartida = dictComptes[digitsOnly];
      }
    }

    // 3. By Account Description
    if (targetPartida === "SENSE_CORRESPONDENCIA" && rowDescCompte) {
      const dClean = cleanStr(rowDescCompte);
      if (dictDescripcions[dClean]) {
        targetPartida = dictDescripcions[dClean];
      } else if (rowDescCompte.toUpperCase().startsWith("DD_")) {
        targetPartida = rowDescCompte.toUpperCase().trim();
      }
    }

    // Track unmapped
    if (targetPartida === "SENSE_CORRESPONDENCIA" && rowCompte) {
      const key = rowCompte;
      if (!unmappedAccountsTracker.has(key)) {
        unmappedAccountsTracker.set(key, { desc: rowDescCompte, count: 0 });
      }
      unmappedAccountsTracker.get(key)!.count++;
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
    // IRPF is subtracted once, later: total factura = cost total - IRPF
    const costVal = colTotalLinia !== -1 ? parseNum(row[colTotalLinia]) : (baseVal + ivaVal);
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

  const docKey = (ndoc: string, factura: string) => `${ndoc}||${factura}`;

  let facturesNoves = 0;
  let facturesExistents = 0;
  let facturesModificades = 0;
  let senseCorrespondencia = 0;
  const resultDespeses: Despesa[] = [];

  // 1st pass: build despeses with a stable ID, unique within this import
  const usedIds = new Set<string>();
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

    // Stable ID. Lines without invoice number of the same document would collide:
    // the first keeps the historical ID and the following ones get a suffix.
    const baseId = `${g.docA3}_${facturasStr}_${g.partidaId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    let cleanId = baseId;
    for (let n = 2; usedIds.has(cleanId); n++) {
      cleanId = `${baseId}_${n}`;
    }
    usedIds.add(cleanId);

    if (g.partidaId === "SENSE_CORRESPONDENCIA") {
      senseCorrespondencia++;
    }

    const yearVal = g.dataEmissio ? parseInt(g.dataEmissio.split("-")[0]) : new Date().getFullYear();

    resultDespeses.push({
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
      modificat_a3: false,
      es_compartida: g.partidesVistes.size > 1,
      estat: "pendent",
      percentatge_total: 0,
      import_total: 0,
    });
  }

  // 2nd pass: the ID contains the partida resolved at import time, so when an equivalence
  // changes (e.g. SENSE_CORRESPONDENCIA -> DD_X) the same invoice gets a new ID. Relink it to
  // the existing despesa when the match within the same document/invoice is unambiguous.
  const matchedExistingIds = new Set(resultDespeses.filter(d => existingMap.has(d.id)).map(d => d.id));
  const unmatchedExistingByDoc = new Map<string, Despesa[]>();
  for (const d of existingDespeses) {
    if (matchedExistingIds.has(d.id)) continue;
    const k = docKey(d.ndoc_a3, d.factura);
    unmatchedExistingByDoc.set(k, [...(unmatchedExistingByDoc.get(k) || []), d]);
  }
  const unmatchedParsedByDoc = new Map<string, Despesa[]>();
  for (const d of resultDespeses) {
    if (existingMap.has(d.id)) continue;
    const k = docKey(d.ndoc_a3, d.factura);
    unmatchedParsedByDoc.set(k, [...(unmatchedParsedByDoc.get(k) || []), d]);
  }
  for (const [k, parsedList] of unmatchedParsedByDoc.entries()) {
    const existingList = unmatchedExistingByDoc.get(k);
    if (parsedList.length === 1 && existingList && existingList.length === 1 && !usedIds.has(existingList[0].id)) {
      parsedList[0].id = existingList[0].id;
      usedIds.add(existingList[0].id);
    }
  }

  // 3rd pass: compare with existing despeses
  for (const d of resultDespeses) {
    const existing = existingMap.get(d.id);
    if (existing) {
      facturesExistents++;
      // Check if amounts changed in A3
      if (
        Math.abs(existing.total_factura - d.total_factura) > 0.01 ||
        Math.abs(existing.base_imposable - d.base_imposable) > 0.01
      ) {
        d.modificat_a3 = true;
        facturesModificades++;
      }
      d.estat = existing.estat;
      d.percentatge_total = existing.percentatge_total;
      d.import_total = existing.import_total;
    } else {
      facturesNoves++;
    }
  }

  const comptesSenseCorrespondencia = Array.from(unmappedAccountsTracker.entries())
    .map(([compte, data]) => ({
      compte,
      descripcio: data.desc,
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalFilesLlegides,
    facturesNoves,
    facturesExistents,
    facturesModificades,
    senseCorrespondencia,
    despeses: resultDespeses,
    fullUtilitzat: sheetName,
    columnesDetectades,
    comptesSenseCorrespondencia,
  };
}
