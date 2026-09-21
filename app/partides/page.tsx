"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { 
  FolderTree, 
  Plus, 
  Search, 
  Edit, 
  CheckCircle2, 
  AlertCircle, 
  Archive, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  X, 
  Receipt, 
  RefreshCw,
  Ban,
  Tag,
  ExternalLink,
  MessageSquare
} from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { Partida } from "@/lib/types";

type SortField = "codi" | "nom" | "facturesCount" | "totalImport" | "activa";
type SortOrder = "asc" | "desc";

export default function PartidesPage() {
  const { 
    partides, 
    despeses, 
    addPartida, 
    updatePartida, 
    toggleBaixaPartida 
  } = useJustificacions();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstat, setFilterEstat] = useState<"totes" | "actives" | "baixa">("totes");

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("codi");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPartida, setEditingPartida] = useState<Partida | null>(null);

  // Form states
  const [codiInput, setCodiInput] = useState("");
  const [nomInput, setNomInput] = useState("");
  const [activaInput, setActivaInput] = useState(true);
  const [comentariInput, setComentariInput] = useState("");

  // Modal for toggle baixa confirmation with optional comment
  const [baixaConfirmModal, setBaixaConfirmModal] = useState<{
    partida: Partida;
    willActivate: boolean;
  } | null>(null);
  const [baixaComentari, setBaixaComentari] = useState("");

  // Mapping statistics per partida
  const partidaStatsMap = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    despeses.forEach(d => {
      const pId = d.partida_id || "SENSE_CORRESPONDENCIA";
      if (!map.has(pId)) {
        map.set(pId, { count: 0, total: 0 });
      }
      const entry = map.get(pId)!;
      entry.count += 1;
      entry.total += d.total_factura || 0;
    });
    return map;
  }, [despeses]);

  // KPIs
  const totalCount = partides.length;
  const activesCount = partides.filter(p => p.activa !== false).length;
  const baixaCount = partides.filter(p => p.activa === false).length;

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
    setEditingPartida(null);
    setCodiInput("");
    setNomInput("");
    setActivaInput(true);
    setComentariInput("");
    setIsModalOpen(true);
  };

  const openEditModal = (p: Partida) => {
    setEditingPartida(p);
    setCodiInput(p.codi);
    setNomInput(p.nom);
    setActivaInput(p.activa !== false);
    setComentariInput("");
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codiInput.trim()) return;

    if (editingPartida) {
      updatePartida(
        {
          ...editingPartida,
          nom: nomInput.trim() || editingPartida.codi,
          activa: activaInput,
        },
        comentariInput.trim() || undefined
      );
    } else {
      addPartida(
        {
          codi: codiInput.trim().toUpperCase(),
          nom: nomInput.trim() || codiInput.trim().toUpperCase(),
        },
        comentariInput.trim() || undefined
      );
    }

    setIsModalOpen(false);
  };

  const openToggleBaixaModal = (p: Partida) => {
    const willActivate = p.activa === false;
    setBaixaConfirmModal({ partida: p, willActivate });
    setBaixaComentari("");
  };

  const handleConfirmToggleBaixa = () => {
    if (!baixaConfirmModal) return;
    toggleBaixaPartida(baixaConfirmModal.partida.id, baixaComentari.trim() || undefined);
    setBaixaConfirmModal(null);
  };

  // Filtered partides
  const filtered = useMemo(() => {
    return partides.filter(p => {
      // Filter by state
      if (filterEstat === "actives" && p.activa === false) return false;
      if (filterEstat === "baixa" && p.activa !== false) return false;

      // Filter by search
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.codi.toLowerCase().includes(term) ||
        p.nom.toLowerCase().includes(term)
      );
    });
  }, [partides, filterEstat, searchTerm]);

  // Sorted partides
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortField === "facturesCount") {
        const countA = partidaStatsMap.get(a.id)?.count || 0;
        const countB = partidaStatsMap.get(b.id)?.count || 0;
        return sortOrder === "asc" ? countA - countB : countB - countA;
      }
      if (sortField === "totalImport") {
        const impA = partidaStatsMap.get(a.id)?.total || 0;
        const impB = partidaStatsMap.get(b.id)?.total || 0;
        return sortOrder === "asc" ? impA - impB : impB - impA;
      }
      if (sortField === "activa") {
        const actA = a.activa !== false ? 1 : 0;
        const actB = b.activa !== false ? 1 : 0;
        return sortOrder === "asc" ? actA - actB : actB - actA;
      }

      const valA = a[sortField] || "";
      const valB = b[sortField] || "";
      return sortOrder === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    });
  }, [filtered, sortField, sortOrder, partidaStatsMap]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <FolderTree className="w-7 h-7 text-emerald-600" />
            <span>Partides de Despesa</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Catàleg de partides pressupostàries. Pots crear noves partides, modificar-les i donar-les de baixa sense perdre cap dada històrica.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Partida</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-slate-400">Total Partides</span>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{totalCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold">
            <FolderTree className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-emerald-600">Partides Actives</span>
            <p className="text-2xl font-black text-emerald-700 mt-0.5">{activesCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-amber-600">Donades de Baixa</span>
            <p className="text-2xl font-black text-amber-700 mt-0.5">{baixaCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Archive className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cercar per codi (ex: DD_ARREND...) o nom..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>

          {/* State filter buttons */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl self-start md:self-auto">
            <button
              onClick={() => setFilterEstat("totes")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterEstat === "totes"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Totes ({partides.length})
            </button>
            <button
              onClick={() => setFilterEstat("actives")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterEstat === "actives"
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Només Actives ({activesCount})
            </button>
            <button
              onClick={() => setFilterEstat("baixa")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterEstat === "baixa"
                  ? "bg-white text-amber-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Donades de Baixa ({baixaCount})
            </button>
          </div>
        </div>

        {(searchTerm || filterEstat !== "totes") && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>
              Mostrant <strong>{sorted.length}</strong> partides filtrades
            </span>
            <button
              onClick={() => {
                setSearchTerm("");
                setFilterEstat("totes");
              }}
              className="text-emerald-600 hover:underline font-medium"
            >
              Netejar cerca i filtres
            </button>
          </div>
        )}
      </div>

      {/* Partides Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <th
                  onClick={() => handleSort("codi")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  title="Ordenar per codi"
                >
                  <div className="flex items-center">
                    <span>Codi Partida</span>
                    {renderSortIcon("codi")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("nom")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  title="Ordenar per nom o descripció"
                >
                  <div className="flex items-center">
                    <span>Nom / Concepte Pressupostari</span>
                    {renderSortIcon("nom")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("facturesCount")}
                  className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  title="Ordenar per nombre de factures associades"
                >
                  <div className="flex items-center justify-center">
                    <span>Factures</span>
                    {renderSortIcon("facturesCount")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("totalImport")}
                  className="py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  title="Ordenar per import total facturat"
                >
                  <div className="flex items-center justify-end">
                    <span>Total Facturat</span>
                    {renderSortIcon("totalImport")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("activa")}
                  className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  title="Ordenar per estat"
                >
                  <div className="flex items-center justify-center">
                    <span>Estat</span>
                    {renderSortIcon("activa")}
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">Accions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((partida) => {
                const isActiva = partida.activa !== false;
                const stats = partidaStatsMap.get(partida.id) || { count: 0, total: 0 };

                return (
                  <tr 
                    key={partida.id} 
                    className={`transition-colors hover:bg-slate-50/80 ${
                      !isActiva ? "bg-amber-50/20 opacity-75 hover:opacity-100" : ""
                    }`}
                  >
                    {/* Codi */}
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <div className="flex items-center space-x-2">
                        <Tag className={`w-3.5 h-3.5 ${isActiva ? "text-emerald-600" : "text-amber-500"}`} />
                        <span>{partida.codi}</span>
                      </div>
                    </td>

                    {/* Nom */}
                    <td className="py-3 px-4 text-slate-700 max-w-md">
                      <span className="font-medium">{partida.nom}</span>
                    </td>

                    {/* Factures vinculades */}
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">
                      {stats.count > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">
                          {stats.count}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>

                    {/* Total facturat */}
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {stats.total > 0 ? (
                        <span>{stats.total.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      ) : (
                        <span className="text-slate-400 text-xs font-normal">0,00 €</span>
                      )}
                    </td>

                    {/* Estat Pill */}
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isActiva
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200/50"
                          : "bg-amber-100 text-amber-800 border border-amber-200/50"
                      }`}>
                        {isActiva ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Activa</span>
                          </>
                        ) : (
                          <>
                            <Archive className="w-3 h-3 text-amber-600" />
                            <span>Donada de Baixa</span>
                          </>
                        )}
                      </span>
                    </td>

                    {/* Accions */}
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      {/* Editar */}
                      <button
                        onClick={() => openEditModal(partida)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                        title="Modificar dades de la partida"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      {/* Donar de Baixa o Reactivar */}
                      {isActiva ? (
                        <button
                          onClick={() => openToggleBaixaModal(partida)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/60 transition-colors"
                          title="Donar de baixa (no s'elimina cap dada)"
                        >
                          <Ban className="w-3.5 h-3.5 text-amber-600" />
                          <span>Donar de baixa</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => openToggleBaixaModal(partida)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 transition-colors"
                          title="Reactivar partida"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Reactivar</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <FolderTree className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm">No s'ha trobat cap partida de despesa</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm ? "Prova de canviar el text de cerca o el filtre d'estat." : "Fes clic a 'Nova Partida' per crear-ne una."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit Partida */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <FolderTree className="w-4 h-4 text-emerald-600" />
                <span>{editingPartida ? "Modificar Partida" : "Nova Partida de Despesa"}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Codi de la Partida <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingPartida}
                  value={codiInput}
                  onChange={(e) => setCodiInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "_"))}
                  placeholder="ex: DD_LLOGUERS_EQUIPS"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 disabled:bg-slate-100 disabled:text-slate-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {editingPartida 
                    ? "El codi identificador no es pot modificar per protegir les referències comptables." 
                    : "S'afegirà el prefix DD_ automàticament si no s'introdueix."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Nom / Descripció Oficial <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nomInput}
                  onChange={(e) => setNomInput(e.target.value)}
                  placeholder="ex: Lloguer de maquinària i equips de transport"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
                />
              </div>

              {editingPartida && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Estat de la Partida
                  </label>
                  <div className="flex items-center space-x-4 mt-2">
                    <label className="inline-flex items-center space-x-2 text-xs font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="activaRadio"
                        checked={activaInput}
                        onChange={() => setActivaInput(true)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-emerald-800 font-bold">Activa</span>
                    </label>
                    <label className="inline-flex items-center space-x-2 text-xs font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="activaRadio"
                        checked={!activaInput}
                        onChange={() => setActivaInput(false)}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-amber-800 font-bold">Donada de Baixa</span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <MessageSquare className="w-3 h-3 text-slate-400" />
                  <span>Motiu / Comentari per a l'Historial (Opcional)</span>
                </label>
                <textarea
                  value={comentariInput}
                  onChange={(e) => setComentariInput(e.target.value)}
                  rows={2}
                  placeholder="Ex: Nova partida acordada per a la justificació 2026..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
                >
                  Cancel·lar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  {editingPartida ? "Desar Canvis" : "Crear Partida"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmació Donar de Baixa / Reactivar */}
      {baixaConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-start space-x-3">
                <div className={`p-2.5 rounded-xl ${
                  baixaConfirmModal.willActivate ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}>
                  {baixaConfirmModal.willActivate ? (
                    <RefreshCw className="w-5 h-5" />
                  ) : (
                    <Archive className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {baixaConfirmModal.willActivate 
                      ? `Reactivar la partida ${baixaConfirmModal.partida.codi}?`
                      : `Donar de baixa la partida ${baixaConfirmModal.partida.codi}?`}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {baixaConfirmModal.willActivate 
                      ? "La partida tornarà a estar disponible per a noves assignacions de comptes i factures."
                      : "La partida quedarà desactivada/arxivada. No s'eliminarà cap factura ni equivalència històrica, i la podràs reactivar en qualsevol moment."}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <MessageSquare className="w-3 h-3 text-slate-400" />
                  <span>Comentari o motiu del canvi (Opcional):</span>
                </label>
                <textarea
                  value={baixaComentari}
                  onChange={(e) => setBaixaComentari(e.target.value)}
                  rows={2}
                  placeholder={baixaConfirmModal.willActivate ? "Ex: Es reprèn l'ús d'aquesta partida..." : "Ex: Ja no s'utilitza en aquest exercici..."}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBaixaConfirmModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
                >
                  Cancel·lar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmToggleBaixa}
                  className={`px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-sm transition-colors ${
                    baixaConfirmModal.willActivate
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {baixaConfirmModal.willActivate ? "Reactivar Partida" : "Confirmar Baixa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
