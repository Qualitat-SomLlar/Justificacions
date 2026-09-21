"use client";

import React, { useState } from "react";
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
  Building
} from "lucide-react";
import { useJustificacions } from "@/lib/store";
import ImportModal from "@/components/ImportModal";

export default function DashboardPage() {
  const { despeses, imputacions, projectes, partides, activeExercici, exportToExcel } = useJustificacions();
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Calculations
  const totalDespesesCount = despeses.length;
  const sumCostTotal = despeses.reduce((acc, d) => acc + d.cost_total, 0);
  const sumTotalFactura = despeses.reduce((acc, d) => acc + d.total_factura, 0);
  const sumTotalImputat = despeses.reduce((acc, d) => acc + d.import_total, 0);
  const sumRomanent = Math.max(0, sumTotalFactura - sumTotalImputat);

  const pendents = despeses.filter(d => d.estat === "pendent");
  const parcials = despeses.filter(d => d.estat === "parcial");
  const completades = despeses.filter(d => d.estat === "completada");
  const excedides = despeses.filter(d => d.estat === "excedida");
  const modificadesA3 = despeses.filter(d => d.modificat_a3);

  // Calculate totals per project
  const projectStats = projectes.filter(p => p.actiu).map(proj => {
    const projImps = imputacions.filter(imp => imp.projecte_id === proj.id);
    const totalJustificat = projImps.reduce((acc, imp) => acc + imp.import, 0);
    return {
      ...proj,
      despesesCount: projImps.length,
      totalJustificat: Math.round(totalJustificat * 100) / 100,
    };
  }).sort((a, b) => b.totalJustificat - a.totalJustificat);

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
              {sumTotalFactura > 0 ? ((sumTotalImputat / sumTotalFactura) * 100).toFixed(1) : 0}% de cobertura global
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
              {pendents.length} factures pendents d'assignar
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
              {excedides.length + modificadesA3.length}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {excedides.length} sobreimputacions (&gt;100%) | {modificadesA3.length} canvis A3
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

      {/* Main Grid: Projects execution & Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Project Execution Table (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Seguiment per Projectes i Subvencions</h2>
              <p className="text-xs text-slate-500">Imports totals justificats a cada organisme convocant</p>
            </div>
            <Link
              href="/projectes"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1"
            >
              <span>Gestionar projectes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="pb-3">Projecte / Convocatòria</th>
                  <th className="pb-3">Finançador</th>
                  <th className="pb-3">Àrea</th>
                  <th className="pb-3 text-center">Factures</th>
                  <th className="pb-3 text-right">Total Justificat</th>
                  <th className="pb-3 text-right">Despeses per Partida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectStats.slice(0, 10).map((proj) => (
                  <tr key={proj.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 font-bold text-slate-900">
                      <Link
                        href={`/despeses?projecte=${proj.id}`}
                        className="inline-flex items-center space-x-1.5 text-emerald-700 hover:text-emerald-900 hover:underline group font-bold"
                        title={`Veure totes les despeses de ${proj.codi} agrupades per partides`}
                      >
                        <span>{proj.codi}</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600" />
                      </Link>
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
                    <td className="py-3 text-right font-black text-emerald-700">
                      {proj.totalJustificat.toLocaleString("ca-ES", { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/despeses?projecte=${proj.id}`}
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
                    <td colSpan={6} className="py-6 text-center text-slate-400 text-sm">
                      No hi ha projectes carregats.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
