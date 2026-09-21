"use client";

import React, { useState, useMemo } from "react";
import { Table2, Download, Filter, Search, Layers } from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { Despesa } from "@/lib/types";

export default function MatriuPage() {
  const { despeses, imputacions, projectes, partides, exportToExcel } = useJustificacions();

  const [selectedPartida, setSelectedPartida] = useState<string>("totes");
  const [searchFilter, setSearchFilter] = useState<string>("");

  const activeProjects = useMemo(() => projectes.filter(p => p.actiu), [projectes]);

  // Index allocations
  const impsByDespesa = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const imp of imputacions) {
      if (!map.has(imp.despesa_id)) {
        map.set(imp.despesa_id, new Map());
      }
      map.get(imp.despesa_id)!.set(imp.projecte_id, imp.import);
    }
    return map;
  }, [imputacions]);

  const impsPercentByDespesa = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const imp of imputacions) {
      if (!map.has(imp.despesa_id)) {
        map.set(imp.despesa_id, new Map());
      }
      map.get(imp.despesa_id)!.set(imp.projecte_id, imp.percentatge);
    }
    return map;
  }, [imputacions]);

  const filteredDespeses = useMemo(() => {
    return despeses.filter(d => {
      if (selectedPartida !== "totes" && d.partida_id !== selectedPartida) {
        return false;
      }
      if (searchFilter) {
        const term = searchFilter.toLowerCase();
        return (
          d.proveidor.toLowerCase().includes(term) ||
          d.factura.toLowerCase().includes(term) ||
          d.ndoc_a3.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [despeses, selectedPartida, searchFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Matriu Global de Justificacions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visualització de la matriu completa homologada amb les 24 columnes base d'A3 i el creuament de tots els projectes.
          </p>
        </div>

        <button
          onClick={exportToExcel}
          disabled={despeses.length === 0}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-medium text-sm shadow-sm transition-all"
        >
          <Download className="w-4 h-4" />
          <span>Descarregar en Excel (.xlsx)</span>
        </button>
      </div>

      {/* Filter toolbar & Partida tabs */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          
          {/* Search box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Filtrar per proveïdor, factura..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>

          <div className="text-xs text-slate-500">
            Mostrant <strong>{filteredDespeses.length}</strong> factures | <strong>{activeProjects.length}</strong> projectes creuats
          </div>
        </div>

        {/* Partida pill selector */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 border-t border-slate-100 pt-3">
          <button
            onClick={() => setSelectedPartida("totes")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedPartida === "totes"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Totes les Partides
          </button>
          {partides.slice(0, 20).map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPartida(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedPartida === p.id
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {p.codi}
            </button>
          ))}
        </div>
      </div>

      {/* Matrix Table with Horizontal Scroll */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="text-left text-xs border-collapse">
            
            {/* Top Multi-row Header (Matching Justificacions_a3.xlsx) */}
            <thead className="sticky top-0 bg-white z-20 shadow-sm">
              {/* Row 1: Finançador */}
              <tr className="bg-slate-50 text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <th colSpan={7} className="px-3 py-1 border-r border-slate-200 bg-slate-100/70">
                  DADES COMPTABLES I FISCALS (A3)
                </th>
                <th colSpan={2} className="px-3 py-1 border-r border-slate-200 bg-emerald-50/70 text-emerald-800 text-center">
                  CONTROL
                </th>
                {activeProjects.map(p => (
                  <th key={p.id} colSpan={2} className="px-2 py-1 border-r border-slate-200 bg-sky-50 text-sky-800 text-center truncate max-w-[120px]" title={p.financador}>
                    {p.financador || "Finançador"}
                  </th>
                ))}
              </tr>

              {/* Row 2: Project Code & Dates */}
              <tr className="bg-slate-50 text-[10px] font-bold border-b border-slate-200">
                <th colSpan={7} className="px-3 py-1 border-r border-slate-200 text-slate-400">
                  SOM LLAR
                </th>
                <th colSpan={2} className="px-3 py-1 border-r border-slate-200 text-center text-slate-500">
                  TOTALS
                </th>
                {activeProjects.map(p => (
                  <th key={p.id} colSpan={2} className="px-2 py-1 border-r border-slate-200 bg-sky-100/60 text-sky-900 text-center font-black">
                    {p.codi}
                  </th>
                ))}
              </tr>

              {/* Row 3: Column names */}
              <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200">
                <th className="py-2 px-3 whitespace-nowrap border-r border-slate-200">Doc A3</th>
                <th className="py-2 px-3 whitespace-nowrap border-r border-slate-200">Factura</th>
                <th className="py-2 px-3 whitespace-nowrap border-r border-slate-200">Proveïdor</th>
                <th className="py-2 px-3 whitespace-nowrap border-r border-slate-200">Partida</th>
                <th className="py-2 px-3 whitespace-nowrap border-r border-slate-200">Data</th>
                <th className="py-2 px-3 whitespace-nowrap border-r border-slate-200 text-right">Base</th>
                <th className="py-2 px-3 whitespace-nowrap border-r border-slate-200 text-right font-black">Total Factura</th>
                
                {/* Control columns */}
                <th className="py-2 px-3 whitespace-nowrap border-r border-slate-200 text-right bg-emerald-50 text-emerald-800">Cobert (€)</th>
                <th className="py-2 px-3 whitespace-nowrap border-r border-slate-200 text-right bg-amber-50 text-amber-800">Disponible (€)</th>

                {/* Project columns (% and €) */}
                {activeProjects.map(p => (
                  <React.Fragment key={p.id}>
                    <th className="py-2 px-2 whitespace-nowrap border-r border-slate-100 text-center bg-sky-50/50 text-sky-700">% {p.codi}</th>
                    <th className="py-2 px-2 whitespace-nowrap border-r border-slate-200 text-right bg-sky-50/50 text-sky-900">Import (€)</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            {/* Data rows */}
            <tbody className="divide-y divide-slate-100">
              {filteredDespeses.map(d => {
                const imps = impsByDespesa.get(d.id);
                const impsPerc = impsPercentByDespesa.get(d.id);
                const cobert = d.import_total;
                const disponible = Math.max(0, d.total_factura - cobert);

                return (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">
                      {d.ndoc_a3}
                    </td>
                    <td className="py-2 px-3 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                      {d.factura || "-"}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900 border-r border-slate-100 max-w-xs truncate" title={d.proveidor}>
                      {d.proveidor}
                    </td>
                    <td className="py-2 px-3 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-semibold">
                        {d.partida_id}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-500 border-r border-slate-100 whitespace-nowrap text-[11px]">
                      {d.data_emissio || "-"}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-100 whitespace-nowrap">
                      {d.base_imposable.toFixed(2)} €
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                      {d.total_factura.toFixed(2)} €
                    </td>

                    {/* Cobert & Disponible */}
                    <td className="py-2 px-3 text-right font-semibold text-emerald-700 bg-emerald-50/30 border-r border-slate-100 whitespace-nowrap">
                      {cobert.toFixed(2)} €
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-amber-700 bg-amber-50/30 border-r border-slate-200 whitespace-nowrap">
                      {disponible.toFixed(2)} €
                    </td>

                    {/* Project Allocations */}
                    {activeProjects.map(p => {
                      const perc = impsPerc?.get(p.id) || 0;
                      const val = imps?.get(p.id) || 0;

                      return (
                        <React.Fragment key={p.id}>
                          <td className="py-2 px-2 text-center text-slate-500 border-r border-slate-100 whitespace-nowrap">
                            {perc > 0 ? (
                              <span className="font-bold text-sky-700">{perc}%</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            {val > 0 ? (
                              <span className="font-bold text-slate-900">{val.toFixed(2)} €</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}

              {filteredDespeses.length === 0 && (
                <tr>
                  <td colSpan={9 + activeProjects.length * 2} className="py-12 text-center text-slate-400">
                    <Table2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm">No s'han trobat dades a la matriu</p>
                    <p className="text-xs text-slate-400 mt-1">Puja un fitxer d'A3 per visualitzar la matriu de justificacions.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
