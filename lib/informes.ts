import { Despesa, Imputacio, Partida, Projecte } from "./types";
import { Periode, isOutsidePeriode, parsePeriode } from "./periode";
import { Execucio, execucioOf } from "./pressupost";

export interface InformeFila {
  despesa: Despesa;
  partida_id: string;
  partida_nom: string;
  percentatge: number;
  import: number;
  observacions: string;
  /** The invoice date is outside the project's period */
  foraPeriode: boolean;
}

export interface InformePartida {
  partida_id: string;
  partida_nom: string;
  count: number;
  total: number;
}

export interface InformeProjecte {
  projecte: Projecte;
  periode: Periode | null;
  files: InformeFila[];
  perPartida: InformePartida[];
  total: number;
  foraPeriode: { count: number; total: number };
  execucio: Execucio;
}

const cents = (n: number) => Math.round(n * 100);
const SENSE_PARTIDA = "SENSE_CORRESPONDENCIA";

function filesOf(
  projecte: Projecte,
  periode: Periode | null,
  despesesById: Map<string, Despesa>,
  imputacions: Imputacio[],
  partidesById: Map<string, Partida>
): InformeFila[] {
  const files: InformeFila[] = [];
  for (const imp of imputacions) {
    if (imp.projecte_id !== projecte.id) continue;
    if (!(imp.percentatge > 0 || imp.import !== 0)) continue;
    const despesa = despesesById.get(imp.despesa_id);
    if (!despesa) continue;
    const partida_id = despesa.partida_id || SENSE_PARTIDA;
    files.push({
      despesa,
      partida_id,
      partida_nom: partidesById.get(partida_id)?.nom || partida_id,
      percentatge: imp.percentatge,
      import: imp.import,
      observacions: imp.observacions || "",
      foraPeriode: isOutsidePeriode(despesa.data_emissio, periode),
    });
  }
  return files.sort(
    (a, b) =>
      (a.despesa.data_emissio || "").localeCompare(b.despesa.data_emissio || "") ||
      a.despesa.ndoc_a3.localeCompare(b.despesa.ndoc_a3)
  );
}

/** Everything the justification report of one project needs, from the imputations of the exercici. */
export function buildInformeProjecte(
  projecte: Projecte,
  despeses: Despesa[],
  imputacions: Imputacio[],
  partides: Partida[]
): InformeProjecte {
  const periode = parsePeriode(projecte.dates_text);
  const files = filesOf(
    projecte,
    periode,
    new Map(despeses.map(d => [d.id, d])),
    imputacions,
    new Map(partides.map(p => [p.id, p]))
  );

  const byPartida = new Map<string, { partida_nom: string; count: number; cents: number }>();
  let totalCents = 0;
  let foraCount = 0;
  let foraCents = 0;
  for (const f of files) {
    const c = cents(f.import);
    totalCents += c;
    const entry = byPartida.get(f.partida_id) || { partida_nom: f.partida_nom, count: 0, cents: 0 };
    entry.count++;
    entry.cents += c;
    byPartida.set(f.partida_id, entry);
    if (f.foraPeriode) {
      foraCount++;
      foraCents += c;
    }
  }

  const perPartida = Array.from(byPartida.entries())
    .map(([partida_id, e]) => ({ partida_id, partida_nom: e.partida_nom, count: e.count, total: e.cents / 100 }))
    .sort((a, b) => a.partida_id.localeCompare(b.partida_id));

  return {
    projecte,
    periode,
    files,
    perPartida,
    total: totalCents / 100,
    foraPeriode: { count: foraCount, total: foraCents / 100 },
    execucio: execucioOf(projecte.pressupost_total, totalCents / 100),
  };
}

export interface ForaPeriodeProjecte {
  projecte: Projecte;
  count: number;
  total: number;
}

/** Projects with imputations of invoices dated outside their period (for the warnings panel). */
export function foraPeriodePerProjecte(
  projectes: Projecte[],
  despeses: Despesa[],
  imputacions: Imputacio[]
): ForaPeriodeProjecte[] {
  const despesesById = new Map(despeses.map(d => [d.id, d]));
  const result: ForaPeriodeProjecte[] = [];
  for (const projecte of projectes) {
    const periode = parsePeriode(projecte.dates_text);
    if (!periode) continue;
    let count = 0;
    let totalCents = 0;
    for (const imp of imputacions) {
      if (imp.projecte_id !== projecte.id || !(imp.percentatge > 0 || imp.import !== 0)) continue;
      const d = despesesById.get(imp.despesa_id);
      if (d && isOutsidePeriode(d.data_emissio, periode)) {
        count++;
        totalCents += cents(imp.import);
      }
    }
    if (count > 0) result.push({ projecte, count, total: totalCents / 100 });
  }
  return result.sort((a, b) => b.count - a.count);
}
