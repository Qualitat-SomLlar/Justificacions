"use client";

import React, { useState, useMemo } from "react";
import { Plus, Search, Calendar, Edit, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { Projecte } from "@/lib/types";

type SortField = "codi" | "financador" | "area" | "dates_text" | "impsCount" | "actiu";
type SortOrder = "asc" | "desc";

export default function ProjectesPage() {
  const { projectes, addProjecte, updateProjecte, deleteProjecte, imputacions } = useJustificacions();

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Projecte | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("codi");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Form states
  const [codi, setCodi] = useState("");
  const [nom, setNom] = useState("");
  const [financador, setFinancador] = useState("");
  const [area, setArea] = useState("");
  const [datesText, setDatesText] = useState("01/01/2026-31/12/2026");
  const [pressupostTotal, setPressupostTotal] = useState<number>(0);

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

  const openAddModal = () => {
    setEditingProject(null);
    setCodi("");
    setNom("");
    setFinancador("");
    setArea("");
    setDatesText("01/01/2026-31/12/2026");
    setPressupostTotal(0);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Projecte) => {
    setEditingProject(p);
    setCodi(p.codi);
    setNom(p.nom);
    setFinancador(p.financador);
    setArea(p.area);
    setDatesText(p.dates_text);
    setPressupostTotal(p.pressupost_total || 0);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codi.trim()) return;

    if (editingProject) {
      updateProjecte({
        ...editingProject,
        codi: codi.trim().toUpperCase(),
        nom: nom.trim() || codi.trim().toUpperCase(),
        financador: financador.trim().toUpperCase(),
        area: area.trim().toUpperCase(),
        dates_text: datesText.trim(),
        pressupost_total: pressupostTotal || 0,
      });
    } else {
      addProjecte({
        codi: codi.trim().toUpperCase(),
        nom: nom.trim() || codi.trim().toUpperCase(),
        financador: financador.trim().toUpperCase(),
        area: area.trim().toUpperCase(),
        dates_text: datesText.trim(),
        pressupost_total: pressupostTotal || 0,
        actiu: true,
      });
    }

    setIsModalOpen(false);
  };

  const filtered = useMemo(() => {
    return projectes.filter(p => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.codi.toLowerCase().includes(term) ||
        p.nom.toLowerCase().includes(term) ||
        p.financador.toLowerCase().includes(term) ||
        p.area.toLowerCase().includes(term)
      );
    });
  }, [projectes, searchTerm]);

  // Sorted projects
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortField === "impsCount") {
        const countA = imputacions.filter(i => i.projecte_id === a.id).length;
        const countB = imputacions.filter(i => i.projecte_id === b.id).length;
        return sortOrder === "asc" ? countA - countB : countB - countA;
      }

      if (sortField === "actiu") {
        const valA = a.actiu ? 1 : 0;
        const valB = b.actiu ? 1 : 0;
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(a[sortField] || "").toLowerCase();
      const strB = String(b[sortField] || "").toLowerCase();
      if (strA < strB) return sortOrder === "asc" ? -1 : 1;
      if (strA > strB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortField, sortOrder, imputacions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Projectes, Subvencions i Licitacions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestió de projectes actius, organismes finançadors i períodes de justificació.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Nou Projecte</span>
        </button>
      </div>

      {/* Search and stats bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cercar per codi, finançador, àrea..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
          />
        </div>

        <div className="text-xs text-slate-500">
          Total de <strong>{projectes.length}</strong> projectes ({projectes.filter(p => p.actiu).length} actius)
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider select-none">
                <th 
                  onClick={() => handleSort("codi")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors"
                  title="Ordenar per Codi"
                >
                  <div className="flex items-center">
                    <span>Codi Projecte</span>
                    {renderSortIcon("codi")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("financador")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors"
                  title="Ordenar per Finançador"
                >
                  <div className="flex items-center">
                    <span>Finançador</span>
                    {renderSortIcon("financador")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("area")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors"
                  title="Ordenar per Àrea"
                >
                  <div className="flex items-center">
                    <span>Àrea</span>
                    {renderSortIcon("area")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("dates_text")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors"
                  title="Ordenar per Període"
                >
                  <div className="flex items-center">
                    <span>Període d'Elegibilitat</span>
                    {renderSortIcon("dates_text")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("impsCount")}
                  className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100/80 transition-colors"
                  title="Ordenar per Nombre de Despeses"
                >
                  <div className="flex items-center justify-center">
                    <span>Despeses Assignades</span>
                    {renderSortIcon("impsCount")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("actiu")}
                  className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100/80 transition-colors"
                  title="Ordenar per Estat"
                >
                  <div className="flex items-center justify-center">
                    <span>Estat</span>
                    {renderSortIcon("actiu")}
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">Accions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((proj) => {
                const impsCount = imputacions.filter(i => i.projecte_id === proj.id).length;

                return (
                  <tr key={proj.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {proj.codi}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-xs">
                        {proj.financador || "-"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {proj.area || "-"}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-xs flex items-center space-x-1.5 pt-3.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{proj.dates_text || "-"}</span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-700">
                      {impsCount}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        proj.actiu ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                      }`}>
                        {proj.actiu ? "Actiu" : "Tancat"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(proj)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        title="Editar projecte"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteProjecte(proj.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Desactivar projecte"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    No s'ha trobat cap projecte amb aquest filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900">
                {editingProject ? "Editar Projecte" : "Nou Projecte / Subvenció"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Codi del Projecte *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: HISSL323, APROP22"
                  value={codi}
                  onChange={(e) => setCodi(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold uppercase focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Finançador
                  </label>
                  <input
                    type="text"
                    placeholder="ex: IMSSBCN, AJBCN"
                    value={financador}
                    onChange={(e) => setFinancador(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm uppercase focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Àrea
                  </label>
                  <input
                    type="text"
                    placeholder="ex: PIRBCNES, GEN"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm uppercase focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Període de Justificació (Dates)
                </label>
                <input
                  type="text"
                  placeholder="ex: 01/01/2026-31/12/2026"
                  value={datesText}
                  onChange={(e) => setDatesText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel·lar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                >
                  {editingProject ? "Guardar Canvis" : "Crear Projecte"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
