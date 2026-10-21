"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ClipboardList, Download, Loader2 } from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { buildInformeProjecte, foraPeriodePerProjecte } from "@/lib/informes";
import { exportInformeProjecteExcel } from "@/lib/informe_exporter";
import { formatDateCa, formatPeriode } from "@/lib/periode";
import { Execucio } from "@/lib/pressupost";

const fmtEur = (n: number) => n.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => n.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ESTAT_STYLE: Record<Execucio["estat"], { label: string; bar: string; badge: string }> = {
  sense: { label: "Sense pressupost definit", bar: "bg-slate-300", badge: "bg-slate-100 text-slate-600" },
  ok: { label: "En curs", bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  alerta: { label: "Prop del límit", bar: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  excedit: { label: "Pressupost superat", bar: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
};

function InformesContent() {
  const { despeses, imputacions, projectes, partides, activeExercici, isLoading } = useJustificacions();
  const searchParams = useSearchParams();
  const projecteParam = searchParams.get("projecte");
  const alertesPeriode = searchParams.get("alertes") === "periode";

  const [selectedId, setSelectedId] = useState<string>("");
  const [nomesForaPeriode, setNomesForaPeriode] = useState(false);

  // Projects with imputations (any state) plus the active ones; the rest have nothing to report
  const imputedIds = useMemo(() => new Set(imputacions.map(i => i.projecte_id)), [imputacions]);
  const options = useMemo(
    () => projectes.filter(p => p.actiu || imputedIds.has(p.id)).sort((a, b) => a.codi.localeCompare(b.codi)),
    [projectes, imputedIds]
  );

  const alerts = useMemo(() => foraPeriodePerProjecte(projectes, despeses, imputacions), [projectes, despeses, imputacions]);

  // Initial selection: ?projecte=, else the first project with period alerts (?alertes=periode), else the first with imputations
  useEffect(() => {
    if (selectedId && options.some(p => p.id === selectedId)) return;
    const fromParam = projecteParam ? options.find(p => p.id === projecteParam || p.codi === projecteParam) : undefined;
    const fromAlert = alertesPeriode ? alerts[0]?.projecte : undefined;
    const withImputacions = options.find(p => imputedIds.has(p.id));
    const initial = fromParam || fromAlert || withImputacions || options[0];
    setSelectedId(initial ? initial.id : "");
  }, [options, selectedId, projecteParam, alertesPeriode, alerts, imputedIds]);

  const projecte = options.find(p => p.id === selectedId) || null;
  const informe = useMemo(
    () => (projecte ? buildInformeProjecte(projecte, despeses, imputacions, partides) : null),
    [projecte, despeses, imputacions, partides]
  );

  const files = informe ? (nomesForaPeriode ? informe.files.filter(f => f.foraPeriode) : informe.files) : [];

  const handleDownload = () => {
    if (!informe) return;
    const buffer = exportInformeProjecteExcel(informe, activeExercici);
    const blob = new Blob([buffer as any], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Informe_${informe.projecte.codi}_${activeExercici}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 text-sm text-slate-500" aria-busy="true">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
        <span>Carregant dades de l&apos;exercici...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center space-x-2">
            <ClipboardList className="w-6 h-6 text-emerald-600" />
            <span>Informes de Justificació</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Exercici <strong className="text-slate-800">{activeExercici}</strong> &mdash; Factures imputades a cada projecte, amb el control del pressupost i del període.
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={!informe || informe.files.length === 0}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm shadow-sm transition-all"
        >
          <Download className="w-4 h-4" />
          <span>Descarregar informe Excel</span>
        </button>
      </div>

      {/* Period alerts of all projects */}
      {alerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2" role="alert">
          <div className="flex items-center space-x-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Imputacions de factures fora del període de justificació del projecte</span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {alerts.map(a => (
              <li key={a.projecte.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(a.projecte.id);
                    setNomesForaPeriode(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-xs font-semibold text-amber-900 transition-colors"
                >
                  {a.projecte.codi}: {a.count} {a.count === 1 ? "factura" : "factures"} ({fmtEur(a.total)} €)
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Project selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor="informe-projecte" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Projecte
        </label>
        <select
          id="informe-projecte"
          value={selectedId}
          onChange={e => {
            setSelectedId(e.target.value);
            setNomesForaPeriode(false);
          }}
          className="flex-1 max-w-xl px-3 py-2 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        >
          {options.length === 0 && <option value="">No hi ha projectes</option>}
          {options.map(p => (
            <option key={p.id} value={p.id}>
              {p.codi}
              {p.financador ? ` — ${p.financador}` : ""}
              {p.actiu ? "" : " (tancat)"}
            </option>
          ))}
        </select>
        {projecte && (
          <span className="text-xs text-slate-500">
            Període: <strong className="text-slate-700">{formatPeriode(informe?.periode ?? null)}</strong>
          </span>
        )}
      </div>

      {informe && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total imputat</span>
              <p className="text-2xl font-black text-emerald-600">{fmtEur(informe.total)} €</p>
              <p className="text-xs text-slate-500">{informe.files.length} {informe.files.length === 1 ? "factura" : "factures"}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pressupost</span>
              {informe.execucio.estat === "sense" ? (
                <>
                  <p className="text-2xl font-black text-slate-300">&mdash;</p>
                  <p className="text-xs text-slate-500">
                    Defineix-lo a <Link href="/projectes" className="font-semibold text-emerald-700 hover:underline">Projectes</Link>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-slate-900">{fmtEur(informe.execucio.pressupost)} €</p>
                  <p className={`text-xs font-semibold ${informe.execucio.disponible < 0 ? "text-rose-600" : "text-slate-500"}`}>
                    {informe.execucio.disponible < 0 ? "Superat per" : "Disponible"} {fmtEur(Math.abs(informe.execucio.disponible))} €
                  </p>
                </>
              )}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Execució</span>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-black text-slate-900">
                  {informe.execucio.estat === "sense" ? "—" : `${fmtPct(informe.execucio.pct)}%`}
                </p>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${ESTAT_STYLE[informe.execucio.estat].badge}`}>
                  {ESTAT_STYLE[informe.execucio.estat].label}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-label="Execució del pressupost" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, informe.execucio.pct))}>
                <div
                  className={`h-full rounded-full ${ESTAT_STYLE[informe.execucio.estat].bar}`}
                  style={{ width: `${Math.max(0, Math.min(100, informe.execucio.pct))}%` }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fora de període</span>
              <p className={`text-2xl font-black ${informe.foraPeriode.count > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {informe.foraPeriode.count}
              </p>
              <p className="text-xs text-slate-500">
                {informe.periode
                  ? informe.foraPeriode.count > 0
                    ? `${fmtEur(informe.foraPeriode.total)} € imputats a factures fora del període`
                    : "Totes les factures són dins del període"
                  : "El projecte no té un període vàlid (dd/mm/aaaa-dd/mm/aaaa)"}
              </p>
            </div>
          </div>

          {/* Per partida */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
            <h2 className="text-base font-bold text-slate-900">Imputat per partida</h2>
            {informe.perPartida.length === 0 ? (
              <p className="text-sm text-slate-400">Aquest projecte encara no té cap factura imputada a l&apos;exercici {activeExercici}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                      <th className="pb-2">Partida</th>
                      <th className="pb-2 text-center">Factures</th>
                      <th className="pb-2 text-right">Total imputat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {informe.perPartida.map(p => (
                      <tr key={p.partida_id}>
                        <td className="py-2">
                          <span className="font-semibold text-slate-800">{p.partida_id}</span>
                          {p.partida_nom !== p.partida_id && <span className="text-xs text-slate-500 ml-2">{p.partida_nom}</span>}
                        </td>
                        <td className="py-2 text-center text-slate-600">{p.count}</td>
                        <td className="py-2 text-right font-bold text-slate-900">{fmtEur(p.total)} €</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 font-black text-slate-900">
                      <td className="pt-2">Total</td>
                      <td className="pt-2 text-center">{informe.files.length}</td>
                      <td className="pt-2 text-right">{fmtEur(informe.total)} €</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">Factures imputades</h2>
              <label className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={nomesForaPeriode}
                  onChange={e => setNomesForaPeriode(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Només fora de període ({informe.foraPeriode.count})</span>
              </label>
            </div>
            <div className="overflow-x-auto max-h-[36rem] overflow-y-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                    <th className="pb-2 pr-3">Data</th>
                    <th className="pb-2 pr-3">Doc / Factura</th>
                    <th className="pb-2 pr-3">Proveïdor</th>
                    <th className="pb-2 pr-3">Partida</th>
                    <th className="pb-2 pr-3 text-right">Total factura</th>
                    <th className="pb-2 pr-3 text-right">%</th>
                    <th className="pb-2 text-right">Imputat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {files.map(f => (
                    <tr key={`${f.despesa.id}`} className={f.foraPeriode ? "bg-amber-50/70" : ""}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {formatDateCa(f.despesa.data_emissio)}
                        {f.foraPeriode && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px] font-bold uppercase" title="Data fora del període de justificació del projecte">
                            Fora de període
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-slate-800">{f.despesa.ndoc_a3}</span>
                        <span className="block text-xs text-slate-500">{f.despesa.factura}</span>
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{f.despesa.proveidor}</td>
                      <td className="py-2 pr-3 text-slate-600">{f.partida_id}</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{fmtEur(f.despesa.total_factura)} €</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{fmtPct(f.percentatge)}%</td>
                      <td className="py-2 text-right font-bold text-slate-900">{fmtEur(f.import)} €</td>
                    </tr>
                  ))}
                  {files.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400 text-sm">
                        {nomesForaPeriode ? "Cap factura fora de període." : "Cap factura imputada a aquest projecte."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function InformesPage() {
  return (
    <Suspense fallback={null}>
      <InformesContent />
    </Suspense>
  );
}
