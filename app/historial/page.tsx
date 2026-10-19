"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  History, 
  Search, 
  Filter, 
  Plus, 
  Receipt, 
  UploadCloud, 
  Briefcase, 
  ArrowLeftRight, 
  FileText, 
  MessageSquare, 
  Calendar, 
  Clock, 
  User, 
  Edit3, 
  Check, 
  X, 
  Trash2, 
  Tag, 
  Info,
  ArrowUpDown,
  MessageCircle,
  FolderTree
} from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { LogEntry } from "@/lib/types";

type LogFilterType = "all" | LogEntry["tipus"];
type SortOrder = "desc" | "asc";

const PAGE_SIZE = 50;

export default function HistorialPage() {
  const { historial, addManualLog, updateLogComentari, deleteLogEntry } = useJustificacions();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<LogFilterType>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Inline comment editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

  // Add Manual Note Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitol, setNewTitol] = useState("");
  const [newDetall, setNewDetall] = useState("");
  const [newComentari, setNewComentari] = useState("");

  // Pagination ("Carregar més")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterType, searchTerm, sortOrder]);

  // Close modal with Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isModalOpen]);

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    return historial
      .filter((entry) => {
        if (filterType !== "all" && entry.tipus !== filterType) {
          return false;
        }
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          entry.titol.toLowerCase().includes(q) ||
          entry.detall.toLowerCase().includes(q) ||
          (entry.comentaris && entry.comentaris.toLowerCase().includes(q)) ||
          (entry.usuari && entry.usuari.toLowerCase().includes(q)) ||
          (entry.projecte_id && entry.projecte_id.toLowerCase().includes(q)) ||
          (entry.despesa_id && entry.despesa_id.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
      });
  }, [historial, filterType, searchTerm, sortOrder]);

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleCount),
    [filteredEntries, visibleCount]
  );

  // Statistics
  const stats = useMemo(() => {
    return {
      total: historial.length,
      imputacions: historial.filter((h) => h.tipus === "imputacio").length,
      volcats: historial.filter((h) => h.tipus === "importacio_a3").length,
      projectes: historial.filter((h) => h.tipus === "projecte").length,
      partides: historial.filter((h) => h.tipus === "partida").length,
      equivalencies: historial.filter((h) => h.tipus === "equivalencia").length,
      notes: historial.filter((h) => h.tipus === "nota_manual").length,
    };
  }, [historial]);

  const handleStartEditComment = (entry: LogEntry) => {
    setEditingId(entry.id);
    setEditCommentText(entry.comentaris || "");
  };

  const handleSaveComment = (id: string) => {
    updateLogComentari(id, editCommentText);
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditCommentText("");
  };

  const handleCreateManualLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitol.trim() || !newDetall.trim()) return;

    addManualLog(newTitol.trim(), newDetall.trim(), newComentari.trim() || undefined);
    setNewTitol("");
    setNewDetall("");
    setNewComentari("");
    setIsModalOpen(false);
  };

  const getTypeBadge = (type: LogEntry["tipus"]) => {
    switch (type) {
      case "imputacio":
        return {
          label: "Imputació",
          icon: Receipt,
          bg: "bg-blue-50",
          text: "text-blue-700",
          border: "border-blue-200",
        };
      case "importacio_a3":
        return {
          label: "Volcat A3",
          icon: UploadCloud,
          bg: "bg-emerald-50",
          text: "text-emerald-700",
          border: "border-emerald-200",
        };
      case "projecte":
        return {
          label: "Projecte",
          icon: Briefcase,
          bg: "bg-purple-50",
          text: "text-purple-700",
          border: "border-purple-200",
        };
      case "partida":
        return {
          label: "Partida",
          icon: FolderTree,
          bg: "bg-teal-50",
          text: "text-teal-700",
          border: "border-teal-200",
        };
      case "equivalencia":
        return {
          label: "Equivalència",
          icon: ArrowLeftRight,
          bg: "bg-amber-50",
          text: "text-amber-700",
          border: "border-amber-200",
        };
      case "nota_manual":
      default:
        return {
          label: "Nota / Auditoria",
          icon: FileText,
          bg: "bg-slate-100",
          text: "text-slate-700",
          border: "border-slate-200",
        };
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString("ca-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-800">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                Historial de Canvis i Traçabilitat
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Registre de modificacions, volcats d&apos;A3 i notes justificatives per a auditories. Les eliminacions d&apos;entrades també queden registrades.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Afegir Nota d&apos;Auditoria</span>
        </button>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <button
          type="button"
          aria-pressed={filterType === "all"}
          onClick={() => setFilterType("all")}
          className={`text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer p-3 rounded-xl border transition-all ${
            filterType === "all" ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Accions</span>
            <History className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-slate-900 mt-1">{stats.total}</p>
        </button>

        <button
          type="button"
          aria-pressed={filterType === "imputacio"}
          onClick={() => setFilterType("imputacio")}
          className={`text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer p-3 rounded-xl border transition-all ${
            filterType === "imputacio" ? "bg-blue-50 border-blue-300 ring-2 ring-blue-500/20" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Imputacions</span>
            <Receipt className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-xl font-bold text-blue-700 mt-1">{stats.imputacions}</p>
        </button>

        <button
          type="button"
          aria-pressed={filterType === "importacio_a3"}
          onClick={() => setFilterType("importacio_a3")}
          className={`text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer p-3 rounded-xl border transition-all ${
            filterType === "importacio_a3" ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Volcats A3</span>
            <UploadCloud className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-emerald-700 mt-1">{stats.volcats}</p>
        </button>

        <button
          type="button"
          aria-pressed={filterType === "projecte"}
          onClick={() => setFilterType("projecte")}
          className={`text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer p-3 rounded-xl border transition-all ${
            filterType === "projecte" ? "bg-purple-50 border-purple-300 ring-2 ring-purple-500/20" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Projectes</span>
            <Briefcase className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-xl font-bold text-purple-700 mt-1">{stats.projectes}</p>
        </button>

        <button
          type="button"
          aria-pressed={filterType === "partida"}
          onClick={() => setFilterType("partida")}
          className={`text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer p-3 rounded-xl border transition-all ${
            filterType === "partida" ? "bg-teal-50 border-teal-300 ring-2 ring-teal-500/20" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Partides</span>
            <FolderTree className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-xl font-bold text-teal-700 mt-1">{stats.partides}</p>
        </button>

        <button
          type="button"
          aria-pressed={filterType === "equivalencia"}
          onClick={() => setFilterType("equivalencia")}
          className={`text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer p-3 rounded-xl border transition-all ${
            filterType === "equivalencia" ? "bg-amber-50 border-amber-300 ring-2 ring-amber-500/20" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Equivalències</span>
            <ArrowLeftRight className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold text-amber-700 mt-1">{stats.equivalencies}</p>
        </button>

        <button
          type="button"
          aria-pressed={filterType === "nota_manual"}
          onClick={() => setFilterType("nota_manual")}
          className={`text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer p-3 rounded-xl border transition-all ${
            filterType === "nota_manual" ? "bg-slate-100 border-slate-400 ring-2 ring-slate-500/20" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Notes d&apos;Auditoria</span>
            <MessageSquare className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-xl font-bold text-slate-800 mt-1">{stats.notes}</p>
        </button>
      </div>

      {/* Filter Toolbar & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cercar per text, proveïdor, factura, projecte o comentari..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Esborrar cerca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Badges & Sort toggle */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
            title="Canviar ordre temporal"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <span>{sortOrder === "desc" ? "Més recents primer" : "Més antics primer"}</span>
          </button>
        </div>
      </div>

      {/* Log Feed / Timeline */}
      <div className="space-y-3">
        {filteredEntries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-base font-bold text-slate-800">No s&apos;han trobat registres</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              No hi ha accions que coincideixin amb els filtres seleccionats o el terme de cerca.
            </p>
          </div>
        ) : (
          visibleEntries.map((entry) => {
            const badge = getTypeBadge(entry.tipus);
            const Icon = badge.icon;
            const isEditingThis = editingId === entry.id;

            return (
              <div
                key={entry.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm hover:border-slate-300 transition-all space-y-3"
              >
                {/* Header row: badge, timestamp, user, delete */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{badge.label}</span>
                    </span>

                    {entry.projecte_id && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-mono font-semibold">
                        {entry.projecte_id}
                      </span>
                    )}

                    {entry.despesa_id && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-mono">
                        Doc: {entry.despesa_id}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 text-xs text-slate-500">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDate(entry.timestamp)}</span>
                    </div>

                    {entry.usuari && (
                      <div className="flex items-center space-x-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="font-medium text-slate-600 text-[11px]">{entry.usuari}</span>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        if (confirm("Vols eliminar aquesta entrada de l'historial?\n\nQuedarà constància de l'eliminació en una nova entrada d'auditoria.")) {
                          deleteLogEntry(entry.id);
                        }
                      }}
                      className="p-1 text-slate-300 hover:text-rose-500 rounded transition-colors"
                      title="Eliminar entrada"
                      aria-label="Eliminar entrada de l'historial"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Content: Title & Details */}
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {entry.titol}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">
                    {entry.detall}
                  </p>
                </div>

                {/* Comments / Audit Notes Section */}
                <div className="pt-2 border-t border-slate-100">
                  {isEditingThis ? (
                    <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <label className="block text-xs font-semibold text-slate-700">
                        Editar comentari / observació d&apos;auditoria:
                      </label>
                      <textarea
                        rows={2}
                        value={editCommentText}
                        onChange={(e) => setEditCommentText(e.target.value)}
                        placeholder="Escriu les observacions, motius de la despesa o indicacions d'auditoria..."
                        className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        autoFocus
                      />
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          Cancel·lar
                        </button>
                        <button
                          onClick={() => handleSaveComment(entry.id)}
                          className="inline-flex items-center space-x-1 px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Guardar</span>
                        </button>
                      </div>
                    </div>
                  ) : entry.comentaris ? (
                    <div className="flex items-start justify-between bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-xs sm:text-sm">
                      <div className="flex items-start space-x-2 text-amber-950">
                        <MessageCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-amber-900 block text-xs">Nota d&apos;Auditoria / Comentari:</span>
                          <p className="mt-0.5 whitespace-pre-wrap text-amber-900 font-medium">{entry.comentaris}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleStartEditComment(entry)}
                        className="p-1 rounded text-amber-600 hover:text-amber-800 hover:bg-amber-100/50 transition-colors ml-2"
                        title="Modificar comentari"
                        aria-label="Modificar comentari"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => handleStartEditComment(entry)}
                        className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-400 hover:text-emerald-600 transition-colors py-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Afegir comentari o observació d&apos;auditoria</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {filteredEntries.length > visibleCount && (
          <div className="flex flex-col items-center gap-1 pt-2">
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 shadow-sm transition-colors"
            >
              Carregar més ({Math.min(PAGE_SIZE, filteredEntries.length - visibleCount)})
            </button>
            <span className="text-[11px] text-slate-400">
              Mostrant {visibleCount} de {filteredEntries.length} registres
            </span>
          </div>
        )}
      </div>

      {/* Modal: Add Manual Note */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nota-modal-title"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 id="nota-modal-title" className="text-base font-bold text-slate-900">
                  Nova Nota Manual d&apos;Auditoria
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Tancar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualLog} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Títol de l&apos;Actuació / Assumpte *
                </label>
                <input
                  type="text"
                  required
                  value={newTitol}
                  onChange={(e) => setNewTitol(e.target.value)}
                  placeholder="Ex: Revisió d'intervenció municipal, Criteri de repartiment 2026..."
                  className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descripció Detallada *
                </label>
                <textarea
                  required
                  rows={3}
                  value={newDetall}
                  onChange={(e) => setNewDetall(e.target.value)}
                  placeholder="Explica què s'ha acordat, el context o els detalls de l'operació..."
                  className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Comentaris addicionals / Observacions (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={newComentari}
                  onChange={(e) => setNewComentari(e.target.value)}
                  placeholder="Anotacions complementàries, referències o acords..."
                  className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel·lar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  Guardar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
