import * as XLSX from "xlsx";
import { Projecte } from "./types";

/**
 * Project catalog of the justification workbook (the Excel that is the reference): every
 * "DD_…" sheet has, above the "NUM. APUNTE" header, a "Centre Cost Projecte" row
 * (FINANÇADOR/ÀREA/CODI) followed by the Finançador, Àrea, Projecte and Període rows.
 * The header row itself holds the project's descriptive name.
 */
export interface ExcelProjecte {
  /** Centre de cost as written in the Excel: FINANÇADOR/ÀREA/CODI */
  cc: string;
  financador: string;
  area: string;
  codi: string;
  nom: string;
  dates_text: string;
}

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
/** Code comparison ignoring case, spaces and punctuation (MAIST1_25 = MAIST125) */
const key = (v: string) => norm(v).toUpperCase().replace(/[^A-Z0-9]/g, "");

export function centreCost(p: Pick<Projecte, "financador" | "area" | "codi">): string {
  return `${norm(p.financador)}/${norm(p.area)}/${norm(p.codi)}`;
}

const mostFrequent = (values: string[]) => {
  const count = new Map<string, number>();
  values.filter(Boolean).forEach(v => count.set(v, (count.get(v) || 0) + 1));
  return Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
};

/** Reads the projects of the justification workbook (only the header rows are needed). */
export function readProjectesFromWorkbook(fileBuffer: ArrayBuffer | Uint8Array): ExcelProjecte[] {
  const workbook = XLSX.read(fileBuffer, { type: "array", sheetRows: 12 });
  const found = new Map<string, { p: Omit<ExcelProjecte, "nom" | "dates_text">; noms: string[]; dates: string[] }>();

  for (const sheetName of workbook.SheetNames) {
    if (!sheetName.toUpperCase().startsWith("DD_")) continue;
    const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: true });
    let ccRow = -1, labelCol = -1, headerRow = -1;
    rows.forEach((row, r) => row.forEach((cell, c) => {
      const t = norm(cell);
      if (ccRow < 0 && t.toLowerCase().startsWith("centre cost")) { ccRow = r; labelCol = c; }
      if (headerRow < 0 && t === "NUM. APUNTE") headerRow = r;
    }));
    if (ccRow < 0) continue;
    const cell = (r: number, c: number) => norm(rows[r]?.[c]);
    const width = Math.max(...rows.slice(ccRow, ccRow + 5).map(r => r.length));
    for (let c = labelCol + 1; c < width; c++) {
      const cc = cell(ccRow, c);
      const codi = cell(ccRow + 3, c);
      // Columns without a project ("//") are placeholders of the template
      if (!cc || !codi || !cc.replace(/\//g, "")) continue;
      const entry = found.get(cc) || {
        p: { cc, financador: cell(ccRow + 1, c), area: cell(ccRow + 2, c), codi },
        noms: [],
        dates: [],
      };
      entry.dates.push(cell(ccRow + 4, c));
      if (headerRow >= 0) entry.noms.push(cell(headerRow, c));
      found.set(cc, entry);
    }
  }

  return Array.from(found.values()).map(({ p, noms, dates }) => ({
    ...p,
    nom: mostFrequent(noms) || p.codi,
    // Some sheets keep the period of the previous year: the one most sheets use wins
    dates_text: mostFrequent(dates),
  }));
}

export type SyncAccio = "igual" | "actualitzar" | "crear";

export interface SyncCanvi {
  camp: "financador" | "area" | "codi" | "nom" | "dates_text";
  abans: string;
  despres: string;
}

export interface SyncFila {
  excel: ExcelProjecte;
  accio: SyncAccio;
  /** The finançador, àrea or codi changes (not only the name or the period) */
  canviaCentreCost?: boolean;
  /** Web project updated (or equal) */
  projecteId?: string;
  /** Why the Excel project was paired with that web project */
  motiu: string;
  canvis: SyncCanvi[];
}

export interface SyncPlan {
  files: SyncFila[];
  /** Web projects that are not in the Excel (they are left as they are) */
  nomesWeb: Projecte[];
}

const yearOf = (codi: string) => (key(codi).match(/(\d{2})$/) || [])[1];
const stemOf = (codi: string) => key(codi).replace(/(20)?\d{2}$/, "");
const relatedFunder = (a: string, b: string) => {
  const x = key(a), y = key(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
};
const oneEdit = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

interface Candidat { projecte: Projecte; motiu: string; score: number }

/** Best web project for an Excel project whose centre de cost is not in the web as is. */
function candidat(e: ExcelProjecte, lliures: Projecte[]): Candidat | null {
  const opcions: Candidat[] = [];
  for (const w of lliures) {
    const sameCode = key(w.codi) === key(e.codi);
    const funder = relatedFunder(w.financador, e.financador);
    const area = key(w.area) === key(e.area);
    const period = !!e.dates_text && norm(w.dates_text) === e.dates_text;
    let motiu = "";
    if (sameCode && (funder || area)) motiu = "Mateix codi";
    else if (funder && key(e.codi).length > 3 && stemOf(w.codi) !== stemOf(e.codi) && oneEdit(key(w.codi), key(e.codi))) motiu = "Codi escrit diferent";
    else if (funder && period && stemOf(w.codi).length > 1 && stemOf(w.codi) === stemOf(e.codi) && yearOf(w.codi) !== yearOf(e.codi)) motiu = "Codi amb un altre any i el mateix període";
    if (!motiu) continue;
    opcions.push({ projecte: w, motiu, score: (sameCode ? 8 : 0) + (funder ? 4 : 0) + (area ? 2 : 0) + (period ? 1 : 0) });
  }
  return opcions.sort((a, b) => b.score - a.score)[0] || null;
}

function canvisDe(w: Projecte, e: ExcelProjecte): SyncCanvi[] {
  const out: SyncCanvi[] = [];
  const check = (camp: SyncCanvi["camp"], despres: string) => {
    const abans = norm(w[camp]);
    if (despres && abans !== despres) out.push({ camp, abans, despres });
  };
  check("financador", e.financador);
  check("area", e.area);
  check("codi", e.codi);
  check("nom", e.nom);
  check("dates_text", e.dates_text);
  return out;
}

/**
 * What to change in the web so that its catalog follows the Excel: every Excel project is
 * either found (same centre de cost), paired with a web project written another way (that is
 * updated to the Excel values) or created. Each web project is used at most once; web projects
 * that are not in the Excel are left untouched.
 */
export function planProjectSync(excel: ExcelProjecte[], web: Projecte[]): SyncPlan {
  const byCc = new Map(web.map(w => [key(centreCost(w)), w]));
  const used = new Set<string>();
  const files: SyncFila[] = [];
  const pendents: ExcelProjecte[] = [];

  for (const e of excel) {
    const w = byCc.get(key(e.cc));
    if (w && !used.has(w.id)) {
      used.add(w.id);
      const canvis = canvisDe(w, e);
      files.push({ excel: e, accio: canvis.length ? "actualitzar" : "igual", projecteId: w.id, motiu: "Mateix centre de cost", canvis });
    } else {
      pendents.push(e);
    }
  }

  // Pair the rest best-first, so that each web project goes to the Excel project closest to it
  const proposals = pendents
    .map(e => ({ e, c: candidat(e, web.filter(w => !used.has(w.id))) }))
    .sort((a, b) => (b.c?.score || 0) - (a.c?.score || 0));
  for (const { e } of proposals) {
    const c = candidat(e, web.filter(w => !used.has(w.id)));
    if (c) {
      used.add(c.projecte.id);
      files.push({ excel: e, accio: "actualitzar", projecteId: c.projecte.id, motiu: c.motiu, canvis: canvisDe(c.projecte, e) });
    } else {
      files.push({ excel: e, accio: "crear", motiu: "No existeix a la web", canvis: [] });
    }
  }

  files.forEach(f => { f.canviaCentreCost = f.canvis.some(c => c.camp === "financador" || c.camp === "area" || c.camp === "codi"); });
  const order = (f: SyncFila) => (f.accio === "actualitzar" ? (f.canviaCentreCost ? 0 : 2) : f.accio === "crear" ? 1 : 3);
  files.sort((a, b) => order(a) - order(b) || a.excel.cc.localeCompare(b.excel.cc));
  return { files, nomesWeb: web.filter(w => !used.has(w.id)) };
}

/** ID for a new project: its code, or its whole centre de cost when the code is already used. */
export function newProjecteId(p: Pick<Projecte, "financador" | "area" | "codi">, usedIds: Set<string>): string {
  const clean = (s: string) => s.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "_");
  let id = clean(p.codi);
  if (!id || usedIds.has(id)) id = clean([p.financador, p.area, p.codi].filter(Boolean).join("_"));
  for (let n = 2; usedIds.has(id); n++) id = `${clean([p.financador, p.area, p.codi].filter(Boolean).join("_"))}_${n}`;
  return id;
}
