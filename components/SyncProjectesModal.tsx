"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, RefreshCw, X } from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { centreCost, planProjectSync, readProjectesFromWorkbook, SyncFila, SyncPlan } from "@/lib/projectes_sync";

/** What to do with each Excel project: "crear", "res" or the ID of the web project it updates */
type Decisio = string;

const CAMP: Record<string, string> = { financador: "Finançador", area: "Àrea", codi: "Codi", nom: "Nom", dates_text: "Període" };

export default function SyncProjectesModal({ onClose }: { onClose: () => void }) {
  const { projectes, sincronitzarProjectes } = useJustificacions();
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [fitxer, setFitxer] = useState("");
  const [decisions, setDecisions] = useState<Record<string, Decisio>>({});
  const [error, setError] = useState<string | null>(null);
  const [llegint, setLlegint] = useState(false);
  const [resultat, setResultat] = useState<{ actualitzats: number; creats: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const llegir = async (file: File) => {
    setError(null);
    setLlegint(true);
    try {
      const excel = readProjectesFromWorkbook(new Uint8Array(await file.arrayBuffer()));
      if (excel.length === 0) throw new Error("No s'ha trobat cap projecte: el fitxer ha de tenir fulls «DD_…» amb la fila «Centre Cost Projecte».");
      const p = planProjectSync(excel, projectes);
      setPlan(p);
      setFitxer(file.name);
      setDecisions(Object.fromEntries(p.files.map(f => [f.excel.cc, f.accio === "crear" ? "crear" : f.projecteId!])));
    } catch (e: any) {
      setError(e?.message || "No s'ha pogut llegir el fitxer.");
    } finally {
      setLlegint(false);
    }
  };

  const webById = useMemo(() => new Map(projectes.map(p => [p.id, p])), [projectes]);

  // The same web project can't be the target of two Excel projects
  const duplicats = useMemo(() => {
    const count = new Map<string, number>();
    Object.values(decisions).forEach(d => { if (d !== "crear" && d !== "res") count.set(d, (count.get(d) || 0) + 1); });
    return new Set(Array.from(count.entries()).filter(([, n]) => n > 1).map(([id]) => id));
  }, [decisions]);

  const efectiu = (f: SyncFila): { accio: "igual" | "actualitzar" | "crear" | "res"; projecteId?: string } => {
    const d = decisions[f.excel.cc];
    if (d === "res") return { accio: "res" };
    if (d === "crear") return { accio: "crear" };
    const w = webById.get(d);
    if (!w) return { accio: "res" };
    const igual = centreCost(w) === f.excel.cc && w.nom === f.excel.nom && (!f.excel.dates_text || w.dates_text === f.excel.dates_text);
    return { accio: igual ? "igual" : "actualitzar", projecteId: d };
  };

  const resum = useMemo(() => {
    const r = { actualitzar: 0, crear: 0, igual: 0, res: 0 };
    plan?.files.forEach(f => { r[efectiu(f).accio]++; });
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, decisions, webById]);

  const aplicar = () => {
    if (!plan || duplicats.size > 0) return;
    const files = plan.files.map(f => ({ excel: f.excel, ...efectiu(f) }))
      .filter(f => f.accio === "actualitzar" || f.accio === "crear") as Pick<SyncFila, "excel" | "accio" | "projecteId">[];
    setResultat(sincronitzarProjectes(files));
  };

  const grups: { titol: string; desc: string; files: SyncFila[] }[] = plan ? [
    { titol: "Canvia el centre de cost", desc: "Projectes de la web que passaran a tenir el finançador, l'àrea o el codi de l'Excel. Les imputacions es mantenen.", files: plan.files.filter(f => f.accio === "actualitzar" && f.canviaCentreCost) },
    { titol: "Projectes nous", desc: "Són a l'Excel i no a la web: es crearan.", files: plan.files.filter(f => f.accio === "crear") },
    { titol: "Només canvia el nom o el període", desc: "Mateix centre de cost; s'actualitzen el nom descriptiu i el període de l'Excel.", files: plan.files.filter(f => f.accio === "actualitzar" && !f.canviaCentreCost) },
    { titol: "Iguals", desc: "No canvien.", files: plan.files.filter(f => f.accio === "igual") },
  ] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="sync-title" className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h3 id="sync-title" className="text-base font-bold text-slate-900">Actualitzar projectes des de l&apos;Excel de justificacions</h3>
            <p className="text-xs text-slate-500 mt-1">
              L&apos;Excel mana: es llegeix la fila «Centre Cost Projecte» dels fulls «DD_…» i el catàleg de la web s&apos;hi ajusta. Res no canvia fins que confirmis.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tancar" className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {resultat ? (
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800"><CheckCircle2 className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {resultat.actualitzats + resultat.creats > 0
                    ? `${resultat.actualitzats} projectes actualitzats i ${resultat.creats} de nous`
                    : "No s'ha desat cap canvi"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {resultat.actualitzats + resultat.creats > 0
                    ? "El canvi queda registrat a l'historial."
                    : "L'aplicatiu està en mode només de consulta o hi ha un canvi pendent. Torna-ho a provar d'aquí a un moment."}
                </p>
              </div>
            </div>
          ) : !plan ? (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl p-10 cursor-pointer hover:bg-slate-50">
              <FileSpreadsheet className="w-8 h-8 text-emerald-600" aria-hidden="true" />
              <span className="text-sm font-semibold text-slate-700">{llegint ? "Llegint el fitxer..." : "Tria l'Excel de justificacions (.xlsx)"}</span>
              <span className="text-xs text-slate-400">Només es llegeixen les capçaleres dels fulls de partida</span>
              <input type="file" accept=".xlsx,.xlsm,.xls" className="sr-only" disabled={llegint}
                onChange={e => { const f = e.target.files?.[0]; if (f) llegir(f); }} />
            </label>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">{fitxer}: {plan.files.length} projectes</span>
                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold">{resum.actualitzar} a actualitzar</span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold">{resum.crear} nous</span>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">{resum.igual} iguals</span>
                {resum.res > 0 && <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-semibold">{resum.res} no s&apos;apliquen</span>}
                {plan.nomesWeb.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 font-semibold" title={plan.nomesWeb.map(centreCost).join("\n")}>
                    {plan.nomesWeb.length} només a la web (no es toquen)
                  </span>
                )}
              </div>

              {duplicats.size > 0 && (
                <p className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                  Hi ha projectes de la web triats per a més d&apos;un projecte de l&apos;Excel: {Array.from(duplicats).map(id => webById.get(id) ? centreCost(webById.get(id)!) : id).join(", ")}.
                </p>
              )}

              {grups.filter(g => g.files.length).map(g => (
                <section key={g.titol} className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{g.titol} ({g.files.length})</h4>
                  <p className="text-xs text-slate-500">{g.desc}</p>
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Excel</th>
                          <th className="text-left px-3 py-2 font-semibold">Què es fa</th>
                          <th className="text-left px-3 py-2 font-semibold">Canvis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.files.map(f => {
                          const d = decisions[f.excel.cc];
                          const w = d && d !== "crear" && d !== "res" ? webById.get(d) : undefined;
                          return (
                            <tr key={f.excel.cc} className="border-t border-slate-100 align-top">
                              <td className="px-3 py-2">
                                <div className="font-mono font-semibold text-slate-800 break-all">{f.excel.cc}</div>
                                <div className="text-slate-500">{f.excel.nom}{f.excel.dates_text ? ` · ${f.excel.dates_text}` : ""}</div>
                              </td>
                              <td className="px-3 py-2 min-w-[16rem]">
                                <select
                                  value={d}
                                  onChange={e => setDecisions(prev => ({ ...prev, [f.excel.cc]: e.target.value }))}
                                  className={`w-full px-2 py-1.5 rounded-lg border text-xs bg-white ${w && duplicats.has(w.id) ? "border-rose-400" : "border-slate-200"}`}
                                  aria-label={`Què es fa amb ${f.excel.cc}`}
                                >
                                  <option value="crear">Crear projecte nou</option>
                                  <option value="res">No fer res</option>
                                  <optgroup label="Actualitzar el projecte de la web">
                                    {projectes.map(p => <option key={p.id} value={p.id}>{centreCost(p)}</option>)}
                                  </optgroup>
                                </select>
                                {f.accio !== "crear" && <div className="text-slate-400 mt-1">Proposta: {f.motiu}</div>}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {w ? (
                                  (() => {
                                    const canvis = [
                                      ["financador", w.financador, f.excel.financador], ["area", w.area, f.excel.area], ["codi", w.codi, f.excel.codi],
                                      ["nom", w.nom, f.excel.nom], ["dates_text", w.dates_text, f.excel.dates_text],
                                    ].filter(([, a, b]) => b && a !== b);
                                    return canvis.length ? (
                                      <ul className="space-y-0.5">
                                        {canvis.map(([c, a, b]) => (
                                          <li key={c}><span className="text-slate-400">{CAMP[c]}:</span> <span className="line-through text-rose-600">{a || "(buit)"}</span> → <span className="text-emerald-700">{b}</span></li>
                                        ))}
                                      </ul>
                                    ) : <span className="text-slate-400">Cap</span>;
                                  })()
                                ) : d === "crear" ? <span className="text-emerald-700">Nou projecte</span> : <span className="text-slate-400">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </>
          )}
          {error && <p className="text-xs text-rose-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold">
            {resultat ? "Tancar" : "Cancel·lar"}
          </button>
          {plan && !resultat && (
            <button
              type="button"
              onClick={aplicar}
              disabled={duplicats.size > 0 || resum.actualitzar + resum.crear === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Aplicar ({resum.actualitzar} actualitzats, {resum.crear} nous)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
