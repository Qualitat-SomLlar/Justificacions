import { Imputacio } from "./types";

/** From this percentage of the budget on, the project is flagged as close to the limit. */
export const ALERTA_PCT = 90;

export type EstatPressupost = "sense" | "ok" | "alerta" | "excedit";

export interface Execucio {
  pressupost: number;
  imputat: number;
  /** Executed percentage of the budget (0 without a budget) */
  pct: number;
  /** Budget left; negative when exceeded */
  disponible: number;
  estat: EstatPressupost;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Budget execution of a project. Without a budget (empty or 0) it is "sense": nothing to compare.
 * Amounts are compared in whole cents, so 100,00 of 100,00 is "alerta" (not "excedit") and
 * 100,01 of 100,00 is "excedit".
 */
export function execucioOf(pressupost: number | undefined | null, imputat: number): Execucio {
  const budget = pressupost && pressupost > 0 ? pressupost : 0;
  const imputatCents = cents(imputat);
  const budgetCents = cents(budget);
  if (budgetCents === 0) {
    return { pressupost: 0, imputat: imputatCents / 100, pct: 0, disponible: 0, estat: "sense" };
  }
  const pct = Math.round((imputatCents / budgetCents) * 10000) / 100;
  // Compared with whole numbers: the rounded pct would turn 89,999% into 90%
  const estat: EstatPressupost =
    imputatCents > budgetCents ? "excedit" : imputatCents * 100 >= ALERTA_PCT * budgetCents ? "alerta" : "ok";
  return { pressupost: budgetCents / 100, imputat: imputatCents / 100, pct, disponible: (budgetCents - imputatCents) / 100, estat };
}

/** Imputed amount of each project (projecte_id -> €), in whole cents. */
export function imputatPerProjecte(imputacions: Pick<Imputacio, "projecte_id" | "import">[]): Map<string, number> {
  const centsByProject = new Map<string, number>();
  for (const imp of imputacions) {
    centsByProject.set(imp.projecte_id, (centsByProject.get(imp.projecte_id) || 0) + cents(imp.import || 0));
  }
  const result = new Map<string, number>();
  centsByProject.forEach((c, id) => result.set(id, c / 100));
  return result;
}
