"use client";

import React, { useState, useMemo, useDeferredValue } from "react";
import { Table2, Download, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { disponibleOf } from "@/lib/sync_utils";
import { Despesa } from "@/lib/types";

const PAGE_SIZE = 100;
const SENSE_CORRESPONDENCIA = "SENSE_CORRESPONDENCIA";
// Valor especial del selector: factures amb una partida que no existeix al catàleg
const PARTIDA_DESCONEGUDA = "__PARTIDA_DESCONEGUDA__";

type MatrixProject = {
  id: string;
  codi: string;
  financador: string;
  tancat: boolean;
  desconegut: boolean;
};

const fmtEur = (n: number) => `${n.toFixed(2)} €`;
const fmtPerc = (n: number) =>
  `${n.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// Disponible per fila: same criterion as the dashboard and the Excel export

export default function MatriuPage() {
  const { despeses, imputacions, projectes, partides, exportToExcel } = useJustificacions();

  const [selectedPartida, setSelectedPartida] = useState<string>("totes");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const deferredSearch = useDeferredValue(searchFilter);
  const [page, setPage] = useState<number>(1);

  // Sorting state
  const [sortKey, setSortKey] = useState<string>("data_emissio");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const partidaIds = useMemo(() => new Set(partides.map(p => p.id)), [partides]);

  const sortedPartides = useMemo(
    () => [...partides].sort((a, b) => a.codi.localeCompare(b.codi)),
    [partides]
  );

  // Index allocations (import i percentatge en una sola passada)
  const { impsByDespesa, impsPercentByDespesa, projectsWithImps } = useMemo(() => {
    const imps = new Map<string, Map<string, number>>();
    const percs = new Map<string, Map<string, number>>();
    const withImps = new Set<string>();
    for (const imp of imputacions) {
      let m = imps.get(imp.despesa_id);
      if (!m) {
        m = new Map();
        imps.set(imp.despesa_id, m);
      }
      m.set(imp.projecte_id, imp.import);

      let pm = percs.get(imp.despesa_id);
      if (!pm) {
        pm = new Map();
        percs.set(imp.despesa_id, pm);
      }
      pm.set(imp.projecte_id, imp.percentatge);

      withImps.add(imp.projecte_id);
    }
    return { impsByDespesa: imps, impsPercentByDespesa: percs, projectsWithImps: withImps };
  }, [imputacions]);

  // Projectes actius + tancats amb imputacions (+ ids desconeguts), perquè cada fila quadri amb "Cobert"
  const matrixProjects = useMemo<MatrixProject[]>(() => {
    const known = new Set<string>();
    const cols: MatrixProject[] = [];
    for (const p of projectes) {
      known.add(p.id);
      if (p.actiu || projectsWithImps.has(p.id)) {
        cols.push({ id: p.id, codi: p.codi, financador: p.financador, tancat: !p.actiu, desconegut: false });
      }
    }
    projectsWithImps.forEach(id => {
      if (!known.has(id)) {
        cols.push({ id, codi: id, financador: "", tancat: false, desconegut: true });
      }
    });
    return cols;
  }, [projectes, projectsWithImps]);

  const activeProjectsCount = useMemo(() => matrixProjects.filter(p => !p.tancat && !p.desconegut).length, [matrixProjects]);
  const closedProjectsCount = matrixProjects.length - activeProjectsCount;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const renderSortIcon = (key: string) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1 inline" aria-hidden="true" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3 h-3 text-emerald-600 ml-1 inline" aria-hidden="true" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-600 ml-1 inline" aria-hidden="true" />
    );
  };

  const ariaSort = (key: string): React.AriaAttributes["aria-sort"] =>
    sortKey === key ? (sortOrder === "asc" ? "ascending" : "descending") : "none";

  // Capçalera ordenable accessible (button dins de th). Funció de render, no component,
  // per no remuntar el botó a cada render (manté el focus del teclat).
  const sortTh = ({
    sortId,
    label,
    title,
    className,
    align = "left",
  }: {
    sortId: string;
    label: string;
    title: string;
    className: string;
    align?: "left" | "right" | "center";
  }) => (
    <th aria-sort={ariaSort(sortId)} className={`p-0 whitespace-nowrap border-r ${className}`}>
      <button
        type="button"
        onClick={() => handleSort(sortId)}
        title={title}
        className={`w-full py-2 px-3 flex items-center ${
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
        } focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500`}
      >
        <span>{label}</span>
        {renderSortIcon(sortId)}
      </button>
    </th>
  );

  const filteredDespeses = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return despeses.filter(d => {
      if (selectedPartida === PARTIDA_DESCONEGUDA) {
        if (!d.partida_id || d.partida_id === SENSE_CORRESPONDENCIA || partidaIds.has(d.partida_id)) return false;
      } else if (selectedPartida === SENSE_CORRESPONDENCIA) {
        if (d.partida_id && d.partida_id !== SENSE_CORRESPONDENCIA) return false;
      } else if (selectedPartida !== "totes" && d.partida_id !== selectedPartida) {
        return false;
      }
      if (term) {
        return (
          (d.proveidor || "").toLowerCase().includes(term) ||
          (d.factura || "").toLowerCase().includes(term) ||
          (d.ndoc_a3 || "").toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [despeses, selectedPartida, deferredSearch, partidaIds]);

  const sortedDespeses = useMemo(() => {
    return [...filteredDespeses].sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (sortKey.startsWith("p_perc_")) {
        const projId = sortKey.replace("p_perc_", "");
        valA = impsPercentByDespesa.get(a.id)?.get(projId) || 0;
        valB = impsPercentByDespesa.get(b.id)?.get(projId) || 0;
      } else if (sortKey.startsWith("p_imp_")) {
        const projId = sortKey.replace("p_imp_", "");
        valA = impsByDespesa.get(a.id)?.get(projId) || 0;
        valB = impsByDespesa.get(b.id)?.get(projId) || 0;
      } else if (sortKey === "cobert") {
        valA = a.import_total;
        valB = b.import_total;
      } else if (sortKey === "disponible") {
        valA = disponibleOf(a);
        valB = disponibleOf(b);
      } else {
        valA = (a as any)[sortKey] ?? "";
        valB = (b as any)[sortKey] ?? "";
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortOrder === "asc" ? -1 : 1;
      if (strA > strB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredDespeses, sortKey, sortOrder, impsPercentByDespesa, impsByDespesa]);

  // Paginació
  const totalRows = sortedDespeses.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = useMemo(
    () => sortedDespeses.slice(pageStart, pageStart + PAGE_SIZE),
    [sortedDespeses, pageStart]
  );

  const hasFilters = selectedPartida !== "totes" || searchFilter.trim() !== "";
  const isSearchPending = searchFilter !== deferredSearch;

  const clearFilters = () => {
    setSearchFilter("");
    setSelectedPartida("totes");
    setPage(1);
  };

  const renderPagination = () => (
    <nav
      aria-label="Paginació de la matriu"
      className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 text-xs text-slate-500"
    >
      <span>
        {totalRows > 0 ? (
          <>
            Files <strong>{pageStart + 1}</strong>–<strong>{Math.min(pageStart + PAGE_SIZE, totalRows)}</strong> de{" "}
            <strong>{totalRows}</strong>
          </>
        ) : (
          "Cap fila"
        )}
      </span>
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => setPage(1)}
          disabled={currentPage <= 1}
          aria-label="Primera pàgina"
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          aria-label="Pàgina anterior"
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="px-2 font-semibold text-slate-700" aria-live="polite">
          Pàgina {currentPage} de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          aria-label="Pàgina següent"
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPage(totalPages)}
          disabled={currentPage >= totalPages}
          aria-label="Última pàgina"
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronsRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );

  const projectLabel = (p: MatrixProject) =>
    p.tancat ? `${p.codi} (TANCAT)` : p.desconegut ? `${p.codi} (DESCONEGUT)` : p.codi;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Matriu Global de Justificacions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visualització de la matriu amb les dades comptables principals d'A3, el control de cobertura de cada factura i el creuament amb tots els projectes amb imputacions.
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

      {/* Filter toolbar & Partida selector */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            {/* Search box */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
              <input
                type="text"
                aria-label="Filtrar per proveïdor, factura o document A3"
                placeholder="Filtrar per proveïdor, factura..."
                value={searchFilter}
                onChange={(e) => {
                  setSearchFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              />
            </div>

            {/* Partida selector (totes les partides del catàleg) */}
            <select
              aria-label="Filtrar per partida"
              value={selectedPartida}
              onChange={(e) => {
                setSelectedPartida(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-80 px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="totes">Totes les Partides</option>
              <option value={SENSE_CORRESPONDENCIA}>Sense correspondència</option>
              <option value={PARTIDA_DESCONEGUDA}>Partida desconeguda (fora del catàleg)</option>
              <optgroup label="Partides del catàleg">
                {sortedPartides.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.codi}
                    {p.activa === false ? " (baixa)" : ""}
                  </option>
                ))}
              </optgroup>
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-emerald-600 hover:underline whitespace-nowrap"
              >
                Netejar filtres
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500">
            {isSearchPending && <span className="mr-2 text-slate-400">Filtrant...</span>}
            Mostrant <strong>{totalRows}</strong> factures | <strong>{activeProjectsCount}</strong> projectes creuats
            {closedProjectsCount > 0 && (
              <> + <strong>{closedProjectsCount}</strong> tancats amb imputacions</>
            )}
          </div>
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
                {matrixProjects.map(p => (
                  <th
                    key={p.id}
                    colSpan={2}
                    className={`px-2 py-1 border-r border-slate-200 text-center truncate max-w-[120px] ${
                      p.tancat || p.desconegut ? "bg-slate-100 text-slate-500" : "bg-sky-50 text-sky-800"
                    }`}
                    title={p.financador}
                  >
                    {p.financador || (p.desconegut ? "Desconegut" : "Finançador")}
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
                {matrixProjects.map(p => (
                  <th
                    key={p.id}
                    colSpan={2}
                    className={`px-2 py-1 border-r border-slate-200 text-center font-black ${
                      p.tancat || p.desconegut ? "bg-slate-200/70 text-slate-600" : "bg-sky-100/60 text-sky-900"
                    }`}
                    title={p.tancat ? "Projecte tancat/inactiu amb imputacions" : p.desconegut ? "Projecte que no existeix al catàleg" : undefined}
                  >
                    {projectLabel(p)}
                  </th>
                ))}
              </tr>

              {/* Row 3: Column names with sortable buttons */}
              <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 select-none">
                {sortTh({ sortId: "ndoc_a3", label: "Doc A3", title: "Ordenar per Doc A3", className: "border-slate-200 hover:bg-slate-200/80" })}
                {sortTh({ sortId: "factura", label: "Factura", title: "Ordenar per Factura", className: "border-slate-200 hover:bg-slate-200/80" })}
                {sortTh({ sortId: "proveidor", label: "Proveïdor", title: "Ordenar per Proveïdor", className: "border-slate-200 hover:bg-slate-200/80" })}
                {sortTh({ sortId: "partida_id", label: "Partida", title: "Ordenar per Partida", className: "border-slate-200 hover:bg-slate-200/80" })}
                {sortTh({ sortId: "data_emissio", label: "Data", title: "Ordenar per Data", className: "border-slate-200 hover:bg-slate-200/80" })}
                {sortTh({ sortId: "base_imposable", label: "Base", title: "Ordenar per Base", className: "border-slate-200 hover:bg-slate-200/80", align: "right" })}
                {sortTh({ sortId: "total_factura", label: "Total Factura", title: "Ordenar per Total Factura", className: "border-slate-200 hover:bg-slate-200/80 font-black", align: "right" })}

                {/* Control columns */}
                {sortTh({ sortId: "cobert", label: "Cobert (€)", title: "Ordenar per Cobert", className: "border-slate-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100", align: "right" })}
                {sortTh({ sortId: "disponible", label: "Disponible (€)", title: "Ordenar per Disponible", className: "border-slate-200 bg-amber-50 text-amber-800 hover:bg-amber-100", align: "right" })}

                {/* Project columns (% and €) */}
                {matrixProjects.map(p => {
                  const muted = p.tancat || p.desconegut;
                  return (
                    <React.Fragment key={p.id}>
                      {sortTh({
                        sortId: `p_perc_${p.id}`,
                        label: `% ${p.codi}`,
                        title: `Ordenar per % de ${projectLabel(p)}`,
                        className: `border-slate-100 ${muted ? "bg-slate-100 text-slate-500 hover:bg-slate-200" : "bg-sky-50/50 text-sky-700 hover:bg-sky-100"}`,
                        align: "center",
                      })}
                      {sortTh({
                        sortId: `p_imp_${p.id}`,
                        label: "Import (€)",
                        title: `Ordenar per Import de ${projectLabel(p)}`,
                        className: `border-slate-200 ${muted ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-sky-50/50 text-sky-900 hover:bg-sky-100"}`,
                        align: "right",
                      })}
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>

            {/* Data rows (pàgina actual) */}
            <tbody className="divide-y divide-slate-100">
              {pageRows.map(d => {
                const imps = impsByDespesa.get(d.id);
                const impsPerc = impsPercentByDespesa.get(d.id);
                const cobert = d.import_total;
                const disponible = disponibleOf(d);
                const senseCorrespondencia = !d.partida_id || d.partida_id === SENSE_CORRESPONDENCIA;
                const partidaDesconeguda = !senseCorrespondencia && !partidaIds.has(d.partida_id);

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
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          senseCorrespondencia
                            ? "bg-amber-100 text-amber-800"
                            : partidaDesconeguda
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100"
                        }`}
                        title={senseCorrespondencia ? "Sense correspondència" : partidaDesconeguda ? "Partida que no existeix al catàleg" : undefined}
                      >
                        {senseCorrespondencia ? "Sense correspondència" : d.partida_id}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-500 border-r border-slate-100 whitespace-nowrap text-[11px]">
                      {d.data_emissio || "-"}
                    </td>
                    <td className={`py-2 px-3 text-right border-r border-slate-100 whitespace-nowrap ${d.base_imposable < 0 ? "text-rose-600" : "text-slate-600"}`}>
                      {fmtEur(d.base_imposable)}
                    </td>
                    <td className={`py-2 px-3 text-right font-bold border-r border-slate-200 whitespace-nowrap ${d.total_factura < 0 ? "text-rose-600" : "text-slate-900"}`}>
                      {fmtEur(d.total_factura)}
                    </td>

                    {/* Cobert & Disponible */}
                    <td className={`py-2 px-3 text-right font-semibold bg-emerald-50/30 border-r border-slate-100 whitespace-nowrap ${cobert < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                      {fmtEur(cobert)}
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold bg-amber-50/30 border-r border-slate-200 whitespace-nowrap ${disponible < 0 ? "text-rose-600" : "text-amber-700"}`}>
                      {fmtEur(disponible)}
                    </td>

                    {/* Project Allocations */}
                    {matrixProjects.map(p => {
                      const perc = impsPerc?.get(p.id) || 0;
                      const val = imps?.get(p.id) || 0;

                      return (
                        <React.Fragment key={p.id}>
                          <td className="py-2 px-2 text-center text-slate-500 border-r border-slate-100 whitespace-nowrap">
                            {perc !== 0 ? (
                              <span className={`font-bold ${perc < 0 ? "text-rose-600" : "text-sky-700"}`}>{fmtPerc(perc)}</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            {val !== 0 ? (
                              <span className={`font-bold ${val < 0 ? "text-rose-600" : "text-slate-900"}`}>{fmtEur(val)}</span>
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

              {totalRows === 0 && (
                <tr>
                  <td colSpan={9 + matrixProjects.length * 2} className="py-12 text-center text-slate-400">
                    <Table2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm">No s'han trobat dades a la matriu</p>
                    {despeses.length === 0 ? (
                      <p className="text-xs text-slate-400 mt-1">Puja un fitxer d'A3 per visualitzar la matriu de justificacions.</p>
                    ) : (
                      <p className="text-xs text-slate-400 mt-1">
                        Cap factura coincideix amb la cerca o la partida seleccionada.{" "}
                        <button type="button" onClick={clearFilters} className="text-emerald-600 font-semibold hover:underline">
                          Netejar filtres
                        </button>
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalRows > PAGE_SIZE && renderPagination()}
      </div>
    </div>
  );
}
