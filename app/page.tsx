"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { 
  Euro, 
  Receipt, 
  CheckCircle2, 
  AlertTriangle, 
  Briefcase, 
  ArrowRight, 
  UploadCloud, 
  Download,
  TrendingUp,
  Clock,
  Layers,
  Loader2
} from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { disponibleOf } from "@/lib/sync_utils";
import { execucioOf } from "@/lib/pressupost";
import { foraPeriodePerProjecte } from "@/lib/informes";
import ImportModal from "@/components/ImportModal";

const ESTAT_COLORS = {
  sense: { bar: "bg-slate-300", text: "text-slate-400" },
  ok: { bar: "bg-emerald-500", text: "text-emerald-700" },
  alerta: { bar: "bg-amber-500", text: "text-amber-700" },
  excedit: { bar: "bg-rose-500", text: "text-rose-700" },
} as const;

function PressupostCell({ pressupost, imputat }: { pressupost: number; imputat: number }) {
  const ex = execucioOf(pressupost, imputat);
  if (ex.estat === "sense") {
    return <span className="text-xs text-slate-400" title="Defineix el pressupost total a la pantalla de Projectes">Sense pressupost</span>;
  }
  const colors = ESTAT_COLORS[ex.estat];
  const pct = ex.pct.toLocaleString("ca-ES", { maximumFractionDigits: 1 });
  return (
    <div
      className="inline-flex flex-col items-end space-y-1 min-w-[8rem]"
      title={`Pressupost ${ex.pressupost.toLocaleString("ca-ES", { minimumFractionDigits: 2 })} € · Disponible ${ex.disponible.toLocaleString("ca-ES", { minimumFractionDigits: 2 })} €`}
    >
      <span className={`text-xs font-bold ${colors.text}`}>
        {pct}%{ex.estat === "excedit" ? " · superat" : ""}
      </span>
      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={Math.min(100, ex.pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Execució del pressupost">
        <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${Math.max(0, Math.min(100, ex.pct))}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { despeses, imputacions, projectes, isLoading, activeExercici, exportToExcel } = useJustificacions();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);

  // Calculations (memoized: ~2.800 factures)
  const stats = useMemo(() => {
    let sumTotalFactura = 0;
    let sumTotalImputat = 0;
    let sumFacturaPositiva = 0;
    // Romanent: Σ disponible de cada factura (same criterion as the matriu and the Excel export):
    // excesses don't offset other invoices and credit notes keep their sign.
    let sumRomanent = 0;
    let sumRomanentPositiu = 0;
    const pendents: typeof despeses = [];
    const parcials: typeof despeses = [];
    const completades: typeof despeses = [];
    const excedides: typeof despeses = [];
    let modificadesA3Count = 0;
    let alertesCount = 0;

    for (const d of despeses) {
      sumTotalFactura += d.total_factura;
      sumTotalImputat += d.import_total;
      sumRomanent += disponibleOf(d);
      if (d.total_factura > 0) {
        sumFacturaPositiva += d.total_factura;
        sumRomanentPositiu += disponibleOf(d);
      }
      if (d.estat === "pendent") pendents.push(d);
      else if (d.estat === "parcial") parcials.push(d);
      else if (d.estat === "completada") completades.push(d);
      else if (d.estat === "excedida") excedides.push(d);
      if (d.modificat_a3) modificadesA3Count++;
      // Factures úniques amb alguna alerta (excedida i/o modificada a A3)
      if (d.estat === "excedida" || d.modificat_a3) alertesCount++;
    }

    // Cobertura = part coberta de les factures positives (mai > 100% per compensació)
    const cobertura = sumFacturaPositiva > 0
      ? ((sumFacturaPositiva - sumRomanentPositiu) / sumFacturaPositiva) * 100
      : 0;

    return {
      sumTotalFactura,
      sumTotalImputat,
      sumRomanent,
      cobertura,
      pendents,
      parcials,
      completades,
      excedides,
      modificadesA3Count,
      alertesCount,
    };
  }, [despeses]);

  const {
    sumTotalFactura,
    sumTotalImputat,
    sumRomanent,
    cobertura,
    pendents,
    parcials,
    completades,
    excedides,
    modificadesA3Count,
    alertesCount,
  } = stats;
  const totalDespesesCount = despeses.length;

  // Totals per projecte: Map projecte_id → totals (O(I) en lloc d'O(P·I))
  const projectStats = useMemo(() => {
    const totals = new Map<string, { count: number; total: number }>();
    for (const imp of imputacions) {
      const entry = totals.get(imp.projecte_id);
      if (entry) {
        entry.count += 1;
        entry.total += imp.import;
      } else {
        totals.set(imp.projecte_id, { count: 1, total: imp.import });
      }
    }

    const known = new Set<string>();
    const rows = projectes
      // Actius sempre; tancats només si tenen imputacions (perquè la suma quadri amb "Total Imputat")
      .filter(p => p.actiu || totals.has(p.id))
      .map(proj => {
        known.add(proj.id);
        const t = totals.get(proj.id);
        return {
          id: proj.id,
          codi: proj.codi,
          financador: proj.financador,
          area: proj.area,
          tancat: !proj.actiu,
          desconegut: false,
          despesesCount: t?.count ?? 0,
          totalJustificat: Math.round((t?.total ?? 0) * 100) / 100,
          pressupost: proj.pressupost_total || 0,
        };
      });

    // Imputacions a projectes que ja no existeixen al catàleg
    totals.forEach((t, projId) => {
      if (known.has(projId)) return;
      rows.push({
        id: projId,
        codi: projId,
        financador: "",
        area: "",
        tancat: false,
        desconegut: true,
        despesesCount: t.count,
        totalJustificat: Math.round(t.total * 100) / 100,
        pressupost: 0,
      });
    });

    return rows.sort((a, b) => b.totalJustificat - a.totalJustificat);
  }, [projectes, imputacions]);

  // Warnings: projects over (or close to) their budget, and imputations dated outside the project's period
  const budgetAlerts = useMemo(
    () =>
      projectStats
        .map(p => ({ ...p, execucio: execucioOf(p.pressupost, p.totalJustificat) }))
        .filter(p => p.execucio.estat === "excedit" || p.execucio.estat === "alerta"),
    [projectStats]
  );
  const budgetExcedits = budgetAlerts.filter(p => p.execucio.estat === "excedit");
  const foraPeriode = useMemo(() => foraPeriodePerProjecte(projectes, despeses, imputacions), [projectes, despeses, imputacions]);
  const foraPeriodeCount = foraPeriode.reduce((acc, p) => acc + p.count, 0);

  const PROJECT_LIMIT = 10;
  const visibleProjectStats = showAllProjects ? projectStats : projectStats.slice(0, PROJECT_LIMIT);

  if (isLoading) {
    return (
      <div className="space-y-8" aria-busy="true" aria-live="polite">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Panell de Control de Justificacions
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Carregant dades de l'exercici...</span>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3 animate-pulse">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="h-7 w-32 rounded bg-slate-200" />
              <div className="h-3 w-40 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3 animate-pulse">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Panell de Control de Justificacions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Exercici fiscal <strong className="text-slate-800">{activeExercici}</strong> &mdash; Seguiment pressupostari i control d'imputacions a subvencions.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-sm transition-all"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Pujar Excel A3</span>
          </button>
          <button
            onClick={exportToExcel}
            disabled={despeses.length === 0}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-medium text-sm shadow-sm transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Descarregar Matriu Excel</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Factures</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900">
              {sumTotalFactura.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </p>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {totalDespesesCount} factures comptabilitzades
            </p>
          </div>
        </div>

        {/* Total Imputed */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total Imputat</span>
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-600">
              {sumTotalImputat.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </p>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {cobertura.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% de cobertura global
            </p>
          </div>
        </div>

        {/* Remaining / Own funds */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Fons Propis / Romanent</span>
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-amber-600">
              {sumRomanent.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </p>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {pendents.length} pendents d'assignar | {parcials.length} parcials
            </p>
          </div>
        </div>

        {/* Audit Alerts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Alertes d'Auditoria</span>
            <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-rose-600">
              {alertesCount}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-medium" title="Nombre de factures úniques amb alguna alerta (una factura excedida i modificada a A3 compta una sola vegada)">
              {excedides.length} sobreimputacions (&gt;100%) | {modificadesA3Count} canvis A3
            </p>
          </div>
        </div>
      </div>

      {/* Alerts Banner if needed */}
      {excedides.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-rose-800">
              Atenció: Hi ha {excedides.length} factura/es amb una imputació total superior al 100%. Cal revisar-les per evitar descuadres de justificació.
            </p>
          </div>
          <Link
            href="/despeses?filter=excedida"
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors whitespace-nowrap"
          >
            Revisar Ara
          </Link>
        </div>
      )}

      {/* Budget alerts */}
      {budgetAlerts.length > 0 && (
        <div
          role="alert"
          className={`p-4 rounded-2xl border flex items-start justify-between gap-4 ${
            budgetExcedits.length > 0 ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-start space-x-3">
            <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${budgetExcedits.length > 0 ? "text-rose-600" : "text-amber-600"}`} />
            <div className={`text-sm ${budgetExcedits.length > 0 ? "text-rose-800" : "text-amber-800"}`}>
              <p className="font-semibold">
                {budgetExcedits.length > 0
                  ? `${budgetExcedits.length} ${budgetExcedits.length === 1 ? "projecte supera" : "projectes superen"} el pressupost`
                  : `${budgetAlerts.length} ${budgetAlerts.length === 1 ? "projecte és" : "projectes són"} a prop del límit del pressupost`}
              </p>
              <p className="text-xs mt-0.5">
                {budgetAlerts.map(p => `${p.codi} (${p.execucio.pct.toLocaleString("ca-ES", { maximumFractionDigits: 1 })}%)`).join(" · ")}
              </p>
            </div>
          </div>
          <Link href="/informes" className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors whitespace-nowrap">
            Veure informes
          </Link>
        </div>
      )}

      {/* Period alerts */}
      {foraPeriodeCount > 0 && (
        <div role="alert" className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">
              Hi ha {foraPeriodeCount} {foraPeriodeCount === 1 ? "imputació" : "imputacions"} de factures amb data fora del període de justificació del projecte ({foraPeriode.length} {foraPeriode.length === 1 ? "projecte" : "projectes"}).
            </p>
          </div>
          <Link href="/informes?alertes=periode" className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors whitespace-nowrap">
            Revisar
          </Link>
        </div>
      )}

      {/* Main Grid: Projects execution & Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Project Execution Table (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Seguiment per Projectes i Subvencions</h2>
              <p className="text-xs text-slate-500">Imports totals justificats a cada organisme convocant (inclou projectes tancats amb imputacions)</p>
            </div>
            <Link
              href="/projectes"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1"
            >
              <span>Gestionar projectes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className={`overflow-x-auto ${showAllProjects ? "max-h-[32rem] overflow-y-auto" : ""}`}>
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="pb-3">Projecte / Convocatòria</th>
                  <th className="pb-3">Finançador</th>
                  <th className="pb-3">Àrea</th>
                  <th className="pb-3 text-center">Factures</th>
                  <th className="pb-3 text-right">Total Justificat</th>
                  <th className="pb-3 text-right" title="Imputat sobre el pressupost total del projecte">Execució pressupost</th>
                  <th className="pb-3 text-right">Despeses per Partida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleProjectStats.map((proj) => (
                  <tr key={proj.id} className={`hover:bg-slate-50/80 transition-colors ${proj.tancat || proj.desconegut ? "bg-slate-50/60" : ""}`}>
                    <td className="py-3 font-bold text-slate-900">
                      <Link
                        href={`/despeses?projecte=${encodeURIComponent(proj.id)}`}
                        className="inline-flex items-center space-x-1.5 text-emerald-700 hover:text-emerald-900 hover:underline group font-bold"
                        title={`Veure totes les despeses de ${proj.codi} agrupades per partides`}
                      >
                        <span>{proj.codi}</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600" />
                      </Link>
                      {proj.tancat && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-bold uppercase align-middle" title="Projecte tancat/inactiu amb imputacions">
                          Tancat
                        </span>
                      )}
                      {proj.desconegut && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold uppercase align-middle" title="Imputacions a un projecte que no existeix al catàleg">
                          Desconegut
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-slate-600">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-xs">
                        {proj.financador || "-"}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600 text-xs">
                      {proj.area || "-"}
                    </td>
                    <td className="py-3 text-center font-semibold text-slate-700">
                      {proj.despesesCount}
                    </td>
                    <td className={`py-3 text-right font-black ${proj.totalJustificat < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                      {proj.totalJustificat.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </td>
                    <td className="py-3 text-right">
                      <PressupostCell pressupost={proj.pressupost} imputat={proj.totalJustificat} />
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/despeses?projecte=${encodeURIComponent(proj.id)}`}
                        className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                        title={`Obrir despeses de ${proj.codi} per partides`}
                      >
                        <span>Veure per partides</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {projectStats.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400 text-sm">
                      No hi ha projectes carregats.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {projectStats.length > PROJECT_LIMIT && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <span>
                Mostrant <strong>{visibleProjectStats.length}</strong> de <strong>{projectStats.length}</strong> projectes
              </span>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAllProjects(v => !v)}
                  className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  {showAllProjects ? `Mostrar només els ${PROJECT_LIMIT} primers` : "Mostrar-los tots"}
                </button>
                <Link href="/projectes" className="font-semibold text-slate-600 hover:text-slate-900 hover:underline">
                  Anar a projectes
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* State Breakdown Sidebar (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Estat de les Despeses</h2>
            <p className="text-xs text-slate-500">Progrés de revisió i distribució</p>
          </div>

          <div className="space-y-4">
            {/* 100% Completades */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-emerald-700 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Imputades 100%</span>
                </span>
                <span className="text-slate-800">{completades.length} ({totalDespesesCount > 0 ? Math.round((completades.length / totalDespesesCount) * 100) : 0}%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full" 
                  style={{ width: `${totalDespesesCount > 0 ? (completades.length / totalDespesesCount) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Parcials */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-sky-700 flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Imputades Parcials (&lt;100%)</span>
                </span>
                <span className="text-slate-800">{parcials.length} ({totalDespesesCount > 0 ? Math.round((parcials.length / totalDespesesCount) * 100) : 0}%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div 
                  className="h-full bg-sky-500 rounded-full" 
                  style={{ width: `${totalDespesesCount > 0 ? (parcials.length / totalDespesesCount) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Pendents */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-amber-700 flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Pendents d'Imputar</span>
                </span>
                <span className="text-slate-800">{pendents.length} ({totalDespesesCount > 0 ? Math.round((pendents.length / totalDespesesCount) * 100) : 0}%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div 
                  className="h-full bg-amber-500 rounded-full" 
                  style={{ width: `${totalDespesesCount > 0 ? (pendents.length / totalDespesesCount) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Excedides */}
            {excedides.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-rose-700 flex items-center space-x-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Excedides (&gt;100%)</span>
                  </span>
                  <span className="text-rose-700 font-bold">{excedides.length}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div 
                    className="h-full bg-rose-500 rounded-full" 
                    style={{ width: `${totalDespesesCount > 0 ? (excedides.length / totalDespesesCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100">
            <Link
              href="/despeses"
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center space-x-2 transition-colors shadow-sm"
            >
              <span>Començar a Imputar Factures</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

      </div>

      {isImportOpen && <ImportModal onClose={() => setIsImportOpen(false)} />}
    </div>
  );
}
