"use client";

import React, { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Search, 
  Receipt, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  UploadCloud,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { Despesa } from "@/lib/types";
import ImputacioModal from "@/components/ImputacioModal";
import ImportModal from "@/components/ImportModal";

type SortField = 
  | "ndoc_a3" 
  | "factura" 
  | "proveidor" 
  | "partida_id" 
  | "data_emissio" 
  | "total_factura" 
  | "percentatge_total";

type SortOrder = "asc" | "desc";

function DespesesContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") || "tots";

  const { despeses, imputacions, partides, projectes } = useJustificacions();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPartida, setSelectedPartida] = useState("totes");
  const [selectedEstat, setSelectedEstat] = useState(initialFilter);
  const [selectedPis, setSelectedPis] = useState("tots");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDespesa, setSelectedDespesa] = useState<Despesa | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("data_emissio");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const pageSize = 25;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 ml-1 inline" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 ml-1 inline" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 ml-1 inline" />
    );
  };

  // Extract unique Pis codes for filtering
  const uniquePisos = useMemo(() => {
    const set = new Set<string>();
    despeses.forEach(d => {
      if (d.pis && d.pis !== "0" && d.pis !== "1") set.add(d.pis);
    });
    return Array.from(set).sort();
  }, [despeses]);

  // Filtered despeses
  const filtered = useMemo(() => {
    return despeses.filter(d => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchProv = d.proveidor.toLowerCase().includes(term);
        const matchFra = d.factura.toLowerCase().includes(term);
        const matchDoc = d.ndoc_a3.toLowerCase().includes(term);
        const matchCif = d.cif.toLowerCase().includes(term);
        const matchDesc = d.descripcio_linia.toLowerCase().includes(term);
        if (!matchProv && !matchFra && !matchDoc && !matchCif && !matchDesc) return false;
      }

      if (selectedPartida !== "totes" && d.partida_id !== selectedPartida) {
        return false;
      }

      if (selectedEstat === "pendent" && d.estat !== "pendent") return false;
      if (selectedEstat === "parcial" && d.estat !== "parcial") return false;
      if (selectedEstat === "completada" && d.estat !== "completada") return false;
      if (selectedEstat === "excedida" && d.estat !== "excedida") return false;
      if (selectedEstat === "modificada" && !d.modificat_a3) return false;

      if (selectedPis !== "tots" && d.pis !== selectedPis) {
        return false;
      }

      return true;
    });
  }, [despeses, searchTerm, selectedPartida, selectedEstat, selectedPis]);

  // Sorted despeses
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const valA = a[sortField] ?? "";
      const valB = b[sortField] ?? "";

      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortOrder === "asc" ? -1 : 1;
      if (strA > strB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Despeses i Imputacions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visualitza, filtra i imputa cadascun dels gastos als projectes corresponents.
          </p>
        </div>

        <button
          onClick={() => setIsImportOpen(true)}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-sm transition-all"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Pujar Fitxer A3</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cercar per proveïdor, NIF, factura..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>

          <div>
            <select
              value={selectedPartida}
              onChange={(e) => { setSelectedPartida(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="totes">Totes les Partides ({partides.length})</option>
              {partides.map(p => (
                <option key={p.id} value={p.id}>
                  {p.codi}
                </option>
              ))}
              <option value="SENSE_CORRESPONDENCIA">⚠️ Sense Correspondència</option>
            </select>
          </div>

          <div>
            <select
              value={selectedEstat}
              onChange={(e) => { setSelectedEstat(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="tots">Tots els Estats</option>
              <option value="pendent">Pendent d'Imputar (0%)</option>
              <option value="parcial">Imputada Parcial (&lt;100%)</option>
              <option value="completada">Completada (100%)</option>
              <option value="excedida">⚠️ Excedida (&gt;100%)</option>
              <option value="modificada">Modificada a l'A3</option>
            </select>
          </div>

          <div>
            <select
              value={selectedPis}
              onChange={(e) => { setSelectedPis(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="tots">Tots els Pisos / Immobles</option>
              {uniquePisos.map(pis => (
                <option key={pis} value={pis}>
                  {pis}
                </option>
              ))}
            </select>
          </div>

        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span>
            Mostrant <strong>{sorted.length}</strong> factures (ordenat per{" "}
            <strong>
              {sortField === "data_emissio" && "Data"}
              {sortField === "total_factura" && "Total Factura"}
              {sortField === "proveidor" && "Proveïdor"}
              {sortField === "ndoc_a3" && "Doc A3"}
              {sortField === "partida_id" && "Partida"}
              {sortField === "percentatge_total" && "Estat Imputat"}
            </strong>{" "}
            {sortOrder === "asc" ? "▲ ascendent" : "▼ descendent"})
          </span>
          {(searchTerm || selectedPartida !== "totes" || selectedEstat !== "tots" || selectedPis !== "tots") && (
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedPartida("totes");
                setSelectedEstat("tots");
                setSelectedPis("tots");
                setCurrentPage(1);
              }}
              className="text-emerald-600 hover:underline font-semibold"
            >
              Netejar filtres
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <th 
                  onClick={() => handleSort("ndoc_a3")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Document A3"
                >
                  <div className="flex items-center">
                    <span>Doc A3 / Factura</span>
                    {renderSortIcon("ndoc_a3")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("proveidor")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Proveïdor"
                >
                  <div className="flex items-center">
                    <span>Proveïdor / Concepte</span>
                    {renderSortIcon("proveidor")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("partida_id")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Partida"
                >
                  <div className="flex items-center">
                    <span>Partida / Pis</span>
                    {renderSortIcon("partida_id")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("data_emissio")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Data"
                >
                  <div className="flex items-center">
                    <span>Data</span>
                    {renderSortIcon("data_emissio")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("total_factura")}
                  className="py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Total Factura"
                >
                  <div className="flex items-center justify-end">
                    <span>Total Factura</span>
                    {renderSortIcon("total_factura")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("percentatge_total")}
                  className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per % Imputat"
                >
                  <div className="flex items-center justify-center">
                    <span>Estat / Imputat</span>
                    {renderSortIcon("percentatge_total")}
                  </div>
                </th>
                <th className="py-3.5 px-4">Projectes Assignats</th>
                <th className="py-3.5 px-4 text-center">Acció</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((despesa) => {
                const despesaImps = imputacions.filter(i => i.despesa_id === despesa.id);

                return (
                  <tr key={despesa.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{despesa.ndoc_a3}</div>
                      <div className="text-xs text-slate-500">{despesa.factura || "Sense Fra."}</div>
                      {despesa.modificat_a3 && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                          Modificat A3
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900 truncate" title={despesa.proveidor}>
                        {despesa.proveidor}
                      </div>
                      <div className="text-xs text-slate-500 truncate" title={despesa.descripcio_linia}>
                        {despesa.descripcio_linia || despesa.cif}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        despesa.partida_id === "SENSE_CORRESPONDENCIA"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {despesa.partida_id}
                      </span>
                      {despesa.pis && despesa.pis !== "0" && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {despesa.pis}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap text-xs">
                      {despesa.data_emissio || "-"}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="font-black text-slate-900">
                        {despesa.total_factura.toLocaleString("ca-ES", { minimumFractionDigits: 2 })} €
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Base: {despesa.base_imposable.toFixed(2)} €
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          despesa.estat === "completada"
                            ? "bg-emerald-100 text-emerald-800"
                            : despesa.estat === "excedida"
                            ? "bg-rose-100 text-rose-800 animate-pulse"
                            : despesa.estat === "parcial"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {despesa.percentatge_total.toFixed(0)}%
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          {despesa.import_total.toFixed(2)} €
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {despesaImps.map(imp => (
                          <span
                            key={imp.projecte_id}
                            className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium"
                            title={`${imp.import.toFixed(2)} €`}
                          >
                            {imp.projecte_id} ({imp.percentatge}%)
                          </span>
                        ))}
                        {despesaImps.length === 0 && (
                          <span className="text-slate-400 text-xs italic">Sense assignar</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedDespesa(despesa)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
                      >
                        Imputar
                      </button>
                    </td>

                  </tr>
                );
              })}

              {paginated.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm">No s'ha trobat cap despesa</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {despeses.length === 0 
                        ? "Encara no has pujat cap fitxer d'A3. Fes clic a 'Pujar Fitxer A3' per començar." 
                        : "Prova de canviar els filtres de cerca."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs">
            <span className="text-slate-500">
              Pàgina <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-200 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedDespesa && (
        <ImputacioModal
          despesa={selectedDespesa}
          onClose={() => setSelectedDespesa(null)}
        />
      )}

      {isImportOpen && (
        <ImportModal onClose={() => setIsImportOpen(false)} />
      )}
    </div>
  );
}

export default function DespesesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20 text-slate-400 space-x-2">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-sm font-medium">Carregant despeses...</span>
      </div>
    }>
      <DespesesContent />
    </Suspense>
  );
}
