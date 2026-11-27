"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, X } from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { FilaTreball, FitxerTreball, planImportacio, readFitxerTreball, suggestProjectes } from "@/lib/imputacions_import";

const fmt = (n: number) => n.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Yield one frame so React can paint the spinner before the heavy synchronous read
const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 50));

function FilesList({ titol, files, color }: { titol: string; files: FilaTreball[]; color: string }) {
  if (files.length === 0) return null;
  return (
    <details className={`rounded-xl border ${color} p-3 text-xs`}>
      <summary className="cursor-pointer font-semibold">{titol}: {files.length} files</summary>
      <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5 font-mono">
        {files.slice(0, 200).map(f => (
          <li key={`${f.full}_${f.fila}`}>{f.full} · fila {f.fila} · doc {f.ndoc_a3 || "-"} · apunt {f.numapunte || "-"} · {fmt(f.cost_total)} €</li>
        ))}
        {files.length > 200 && <li>… i {files.length - 200} més</li>}
      </ul>
    </details>
  );
}

export default function ImportImputacionsModal({ onClose }: { onClose: () => void }) {
  const { despeses, imputacions, projectes, activeExercici, importImputacionsTreball } = useJustificacions();
  const [fileName, setFileName] = useState("");
  const [fitxer, setFitxer] = useState<FitxerTreball | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptOverwrite, setAcceptOverwrite] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isReading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isReading]);

  const handleFile = async (file: File) => {
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
      setError("El fitxer ha de ser un Excel (.xlsx, .xlsm o .xls).");
      return;
    }
    setError(null);
    setDone(null);
    setIsReading(true);
    setFileName(file.name);
    await yieldToBrowser();
    try {
      const result = readFitxerTreball(new Uint8Array(await file.arrayBuffer()));
      if (result.files.length === 0) {
        setError("No s'ha trobat cap fila amb imputacions als fulls DD_ del fitxer.");
        setFitxer(null);
      } else {
        setFitxer(result);
        setMapping(suggestProjectes(result.columnes, projectes));
        setAcceptOverwrite(false);
      }
    } catch (e) {
      console.error(e);
      setError("No s'ha pogut llegir el fitxer. Comprova que és el fitxer de treball de justificacions.");
    } finally {
      setIsReading(false);
    }
  };

  // Only the columns that have percentages in some row
  const columnes = useMemo(
    () => (fitxer?.columnes || []).filter(c => c.files > 0).sort((a, b) => b.files - a.files),
    [fitxer]
  );
  const senseAssignar = columnes.filter(c => !mapping[c.key]);

  const pla = useMemo(
    () => (fitxer ? planImportacio(fitxer, despeses, imputacions, mapping) : null),
    [fitxer, despeses, imputacions, mapping]
  );

  const stats = useMemo(() => {
    if (!pla) return null;
    const noves = pla.canvis.filter(c => c.estat === "nova");
    const sobreescriu = pla.canvis.filter(c => c.estat === "sobreescriu");
    const iguals = pla.canvis.filter(c => c.estat === "igual");
    const aplicar = [...noves, ...sobreescriu];
    const excedides = aplicar.filter(c => c.allocations.reduce((a, x) => a + x.percentatge, 0) > 100.005);
    const costDiferent = aplicar.filter(c => c.costDiferent);
    const partidaDiferent = aplicar.filter(c => c.partidaDiferent);
    const importTotal = aplicar.reduce((a, c) => a + c.allocations.reduce((s, x) => s + x.import, 0), 0);
    return { noves, sobreescriu, iguals, aplicar, excedides, costDiferent, partidaDiferent, importTotal };
  }, [pla]);

  const projecteLabel = (id: string) => {
    const p = projectes.find(x => x.id === id);
    return p ? `${p.codi} (${p.financador || "-"}/${p.area || "-"})` : id;
  };

  const handleApply = () => {
    if (!pla || !stats || stats.aplicar.length === 0) return;
    if (stats.sobreescriu.length > 0 && !acceptOverwrite) return;
    const avisos = [
      pla.noTrobades.length ? `${pla.noTrobades.length} files no s'han trobat a l'aplicatiu.` : "",
      pla.ambigues.length ? `${pla.ambigues.length} files ambigües no s'han importat.` : "",
      pla.senseProjecte.length ? `${pla.senseProjecte.length} files només tenien projectes sense correspondència.` : "",
      stats.excedides.length ? `${stats.excedides.length} factures queden per sobre del 100%.` : "",
    ].filter(Boolean).join(" ");
    importImputacionsTreball(
      stats.aplicar.map(c => ({ despesa_id: c.despesa.id, allocations: c.allocations })),
      { fitxer: fileName, noves: stats.noves.length, sobreescrites: stats.sobreescriu.length, avisos }
    );
    setDone(`S'han desat les imputacions de ${stats.aplicar.length} factures (${stats.noves.length} noves i ${stats.sobreescriu.length} substituïdes). Queda registrat a l'Historial de Canvis.`);
    setFitxer(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-imputacions-title"
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 id="import-imputacions-title" className="text-base font-bold text-slate-900">Importar imputacions des d&apos;Excel</h3>
            <p className="text-xs text-slate-500">
              Fitxer de treball amb un full per partida (DD_...) i una columna de percentatge per projecte. Exercici {activeExercici}.
            </p>
          </div>
          <button onClick={onClose} disabled={isReading} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="Tancar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {done && (
            <div role="status" className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start space-x-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{done}</span>
            </div>
          )}

          {!fitxer && (
            <div
              onClick={() => !isReading && fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f && !isReading) void handleFile(f);
              }}
              className="border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-2xl p-10 text-center cursor-pointer transition-colors"
            >
              {isReading ? (
                <div className="flex flex-col items-center space-y-2 text-slate-600">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <span className="text-sm font-medium">Llegint {fileName}… (pot trigar uns segons)</span>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-2 text-slate-600">
                  <UploadCloud className="w-8 h-8 text-emerald-600" />
                  <span className="text-sm font-medium">Arrossega el fitxer de treball o fes clic per triar-lo</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
          )}

          {fitxer && pla && stats && (
            <>
              <div className="flex items-center space-x-2 text-sm text-slate-700">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold">{fileName}</span>
                <span className="text-slate-400">· {fitxer.files.length} files amb imputacions</span>
                <button onClick={() => { setFitxer(null); setFileName(""); }} className="ml-auto text-xs text-slate-500 hover:text-slate-800 underline">
                  Canviar de fitxer
                </button>
              </div>

              {/* 1. Projects */}
              <section className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900">1. Projectes del fitxer</h4>
                <p className="text-xs text-slate-500">
                  Cada columna del fitxer s&apos;ha relacionat amb el projecte de l&apos;aplicatiu que té el mateix codi, finançador i àrea.
                  Revisa les que no tenen projecte: si en deixes alguna sense, els seus percentatges no s&apos;importaran.
                </p>
                {senseAssignar.length > 0 && (
                  <p className="text-xs font-semibold text-amber-700">{senseAssignar.length} columnes sense projecte assignat.</p>
                )}
                <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left text-slate-500">
                        <th className="py-2 px-3">Codi (finançador / àrea) al fitxer</th>
                        <th className="py-2 px-3 text-right">Files</th>
                        <th className="py-2 px-3">Projecte de l&apos;aplicatiu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {columnes.map(c => (
                        <tr key={c.key} className={mapping[c.key] ? "" : "bg-amber-50"}>
                          <td className="py-1.5 px-3 font-mono">{c.codi} <span className="text-slate-400">({c.financador || "-"} / {c.area || "-"})</span></td>
                          <td className="py-1.5 px-3 text-right">{c.files}</td>
                          <td className="py-1.5 px-3">
                            <select
                              value={mapping[c.key] || ""}
                              onChange={e => setMapping(m => ({ ...m, [c.key]: e.target.value }))}
                              aria-label={`Projecte per a la columna ${c.codi}`}
                              className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            >
                              <option value="">— No importar —</option>
                              {projectes.map(p => (
                                <option key={p.id} value={p.id}>{projecteLabel(p.id)}{p.actiu ? "" : " · tancat"}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 2. Summary */}
              <section className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900">2. Què es farà</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><div className="text-lg font-black text-emerald-800">{stats.noves.length}</div>factures sense imputació que s&apos;imputaran</div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200"><div className="text-lg font-black text-amber-800">{stats.sobreescriu.length}</div>factures amb imputacions que se substituiran</div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><div className="text-lg font-black text-slate-700">{stats.iguals.length}</div>factures ja iguals (no es toquen)</div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><div className="text-lg font-black text-slate-700">{fmt(stats.importTotal)} €</div>import total que s&apos;imputarà</div>
                </div>
                <div className="space-y-2">
                  <FilesList titol="Files que no s'han trobat a l'aplicatiu (no s'importen)" files={pla.noTrobades} color="border-rose-200 bg-rose-50 text-rose-800" />
                  <FilesList titol="Files que coincideixen amb diverses factures (no s'importen)" files={pla.ambigues} color="border-rose-200 bg-rose-50 text-rose-800" />
                  <FilesList titol="Files amb percentatges només en columnes sense projecte (no s'importen)" files={pla.senseProjecte} color="border-amber-200 bg-amber-50 text-amber-800" />
                  {fitxer.fullsIgnorats.length > 0 && (
                    <p className="text-xs text-amber-700">Fulls sense l&apos;estructura esperada (no s&apos;han llegit): {fitxer.fullsIgnorats.join(", ")}.</p>
                  )}
                  {stats.excedides.length > 0 && (
                    <p className="text-xs text-amber-700">{stats.excedides.length} factures quedaran per sobre del 100% (sortiran com a alerta d&apos;auditoria): {stats.excedides.slice(0, 15).map(c => c.despesa.ndoc_a3).join(", ")}{stats.excedides.length > 15 ? "…" : ""}</p>
                  )}
                  {stats.costDiferent.length > 0 && (
                    <p className="text-xs text-slate-600">{stats.costDiferent.length} factures tenen un cost diferent al fitxer i a l&apos;aplicatiu: l&apos;import s&apos;imputa igual i el percentatge es calcula sobre el cost de l&apos;aplicatiu.</p>
                  )}
                  {stats.partidaDiferent.length > 0 && (
                    <p className="text-xs text-slate-600">{stats.partidaDiferent.length} factures són en una altra partida a l&apos;aplicatiu; s&apos;imputen igualment.</p>
                  )}
                </div>
              </section>

              {/* 3. Overwrites */}
              {stats.sobreescriu.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-sm font-bold text-amber-800 flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>3. Imputacions que se substituiran ({stats.sobreescriu.length})</span>
                  </h4>
                  <div className="max-h-56 overflow-y-auto border border-amber-200 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-50 sticky top-0">
                        <tr className="text-left text-amber-900">
                          <th className="py-2 px-3">Doc A3</th>
                          <th className="py-2 px-3">Partida</th>
                          <th className="py-2 px-3">Ara a l&apos;aplicatiu</th>
                          <th className="py-2 px-3">Al fitxer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {stats.sobreescriu.slice(0, 300).map(c => (
                          <tr key={c.despesa.id}>
                            <td className="py-1.5 px-3 font-mono">{c.despesa.ndoc_a3}</td>
                            <td className="py-1.5 px-3">{c.despesa.partida_id}</td>
                            <td className="py-1.5 px-3">{c.anteriors.map(a => `${projecteLabel(a.projecte_id).split(" ")[0]} ${a.percentatge.toFixed(2)}%`).join(", ")}</td>
                            <td className="py-1.5 px-3 font-semibold">{c.allocations.map(a => `${projecteLabel(a.projecte_id).split(" ")[0]} ${a.percentatge.toFixed(2)}%`).join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label className="flex items-start space-x-2 text-sm text-amber-900">
                    <input type="checkbox" checked={acceptOverwrite} onChange={e => setAcceptOverwrite(e.target.checked)} className="mt-0.5" />
                    <span>Entenc que se substituiran les imputacions actuals d&apos;aquestes {stats.sobreescriu.length} factures pel que diu el fitxer.</span>
                  </label>
                </section>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} disabled={isReading} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">
            {done ? "Tancar" : "Cancel·lar"}
          </button>
          {fitxer && stats && (
            <button
              onClick={handleApply}
              disabled={stats.aplicar.length === 0 || (stats.sobreescriu.length > 0 && !acceptOverwrite)}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white"
            >
              Importar {stats.aplicar.length} factures
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
