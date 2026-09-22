"use client";

import React, { useState, useEffect } from "react";
import { X, AlertTriangle, CheckCircle2, FolderTree, Briefcase, RotateCcw, Trash2, Plus } from "lucide-react";
import { Partida, Projecte } from "@/lib/types";

// ==========================================
// 1. BULK ASSIGN PARTIDA MODAL
// ==========================================
interface BulkPartidaModalProps {
  isOpen: boolean;
  selectedCount: number;
  selectedTotal: number;
  partides: Partida[];
  onClose: () => void;
  onConfirm: (partidaId: string, comentari?: string) => void;
}

export function BulkPartidaModal({
  isOpen,
  selectedCount,
  selectedTotal,
  partides,
  onClose,
  onConfirm,
}: BulkPartidaModalProps) {
  const activePartides = partides.filter((p) => p.activa !== false);
  const [selectedPartida, setSelectedPartida] = useState<string>("");
  const [comentari, setComentari] = useState<string>("");

  useEffect(() => {
    if (activePartides.length > 0 && !selectedPartida) {
      setSelectedPartida(activePartides[0].id);
    }
  }, [activePartides, selectedPartida, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartida) return;
    onConfirm(selectedPartida, comentari.trim() || undefined);
  };

  const chosenPartidaObj = partides.find((p) => p.id === selectedPartida);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-emerald-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Assignar Partida en Bloc</h2>
              <p className="text-xs text-emerald-200/80">
                Canvia la partida pressupostària a totes les factures seleccionades.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Summary Box */}
          <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-100 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 block">Factures seleccionades</span>
              <strong className="text-base text-slate-900 font-black">{selectedCount}</strong>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block">Import total afectat</span>
              <strong className="text-base text-emerald-700 font-black">
                {selectedTotal.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </strong>
            </div>
          </div>

          {/* Partida Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Nova Partida Destí *
            </label>
            <select
              value={selectedPartida}
              onChange={(e) => setSelectedPartida(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              required
            >
              <optgroup label="Partides Actives">
                {activePartides.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codi} - {p.nom}
                  </option>
                ))}
              </optgroup>
              {partides.filter((p) => p.activa === false).length > 0 && (
                <optgroup label="Partides Donades de Baixa">
                  {partides
                    .filter((p) => p.activa === false)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codi} - {p.nom} (Baixa)
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            {chosenPartidaObj && (
              <p className="text-xs text-slate-500 mt-1.5 italic">
                {chosenPartidaObj.nom} ({chosenPartidaObj.codi})
              </p>
            )}
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Motiu / Comentari per a l'historial (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Correcció de correspondència A3 a subministraments..."
              value={comentari}
              onChange={(e) => setComentari(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel·lar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Assignar a {selectedCount} factures</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 2. BULK IMPUTAR TO PROJECT MODAL
// ==========================================
interface BulkImputarModalProps {
  isOpen: boolean;
  selectedCount: number;
  selectedTotal: number;
  projectes: Projecte[];
  onClose: () => void;
  onConfirm: (
    allocations: { projecte_id: string; percentatge: number }[],
    comentari?: string
  ) => void;
}

interface AllocationRowState {
  projecte_id: string;
  percentatge: number;
}

export function BulkImputarModal({
  isOpen,
  selectedCount,
  selectedTotal,
  projectes,
  onClose,
  onConfirm,
}: BulkImputarModalProps) {
  const activeProjects = projectes.filter((p) => p.actiu);
  const [rows, setRows] = useState<AllocationRowState[]>([]);
  const [comentari, setComentari] = useState<string>("");

  useEffect(() => {
    if (activeProjects.length > 0) {
      setRows([{ projecte_id: activeProjects[0].id, percentatge: 100 }]);
    }
  }, [projectes, isOpen]);

  if (!isOpen) return null;

  const totalPercent = rows.reduce((acc, r) => acc + (Number(r.percentatge) || 0), 0);
  const isOver100 = totalPercent > 100.01;

  const handlePercentChange = (index: number, val: number) => {
    const updated = [...rows];
    updated[index].percentatge = Math.max(0, val);
    setRows(updated);
  };

  const handleProjectChange = (index: number, projId: string) => {
    const updated = [...rows];
    updated[index].projecte_id = projId;
    setRows(updated);
  };

  const handleAddRow = () => {
    const remaining = Math.max(0, Math.round((100 - totalPercent) * 100) / 100);
    const used = new Set(rows.map((r) => r.projecte_id));
    const nextProj = activeProjects.find((p) => !used.has(p.id)) || activeProjects[0];
    if (nextProj) {
      setRows([...rows, { projecte_id: nextProj.id, percentatge: remaining }]);
    }
  };

  const handleRemoveRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rows.length === 0) return;
    if (isOver100) return;
    const validRows = rows.filter((r) => r.projecte_id && r.percentatge > 0);
    if (validRows.length === 0) return;
    onConfirm(validRows, comentari.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-sky-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/20 border border-sky-500/30 text-sky-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Imputar Factures en Bloc</h2>
              <p className="text-xs text-sky-200/80">
                Aplica la mateixa regla d'imputació a les factures seleccionades.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Summary Box */}
          <div className="p-4 rounded-2xl bg-sky-50/80 border border-sky-100 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 block">Factures seleccionades</span>
              <strong className="text-base text-slate-900 font-black">{selectedCount}</strong>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block">Import total conjunt</span>
              <strong className="text-base text-sky-700 font-black">
                {selectedTotal.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </strong>
            </div>
          </div>

          {/* Allocation Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Distribució per Projecte
              </label>
              {rows.length < activeProjects.length && (
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="text-xs text-sky-600 hover:text-sky-700 font-bold flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Afegir Projecte (Cofinançament)</span>
                </button>
              )}
            </div>

            {rows.map((row, idx) => (
              <div key={idx} className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <select
                  value={row.projecte_id}
                  onChange={(e) => handleProjectChange(idx, e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                >
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codi} {p.financador ? `(${p.financador})` : ""}
                    </option>
                  ))}
                </select>

                <div className="flex items-center space-x-1 w-28">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.percentatge}
                    onChange={(e) => handlePercentChange(idx, parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-right text-xs sm:text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    required
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>

                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            {/* Total Indicator */}
            <div className="flex items-center justify-between text-xs px-2 pt-1 font-semibold">
              <span className="text-slate-500">Total Imputat:</span>
              <span className={isOver100 ? "text-rose-600 font-bold" : "text-slate-900 font-bold"}>
                {totalPercent.toFixed(2)} % {isOver100 && "(⚠️ Supera el 100%)"}
              </span>
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Motiu / Comentari per a l'historial (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Imputació massiva de despeses de subministraments..."
              value={comentari}
              onChange={(e) => setComentari(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-slate-50/50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel·lar
            </button>
            <button
              type="submit"
              disabled={isOver100 || rows.length === 0}
              className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold shadow-md transition-all flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Imputar {selectedCount} factures</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 3. BULK RESET MODAL
// ==========================================
interface BulkResetModalProps {
  isOpen: boolean;
  selectedCount: number;
  selectedTotal: number;
  onClose: () => void;
  onConfirm: (comentari?: string) => void;
}

export function BulkResetModal({
  isOpen,
  selectedCount,
  selectedTotal,
  onClose,
  onConfirm,
}: BulkResetModalProps) {
  const [comentari, setComentari] = useState<string>("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(comentari.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-amber-700 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-300">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Reiniciar Imputacions</h2>
              <p className="text-xs text-amber-200/80">
                Tornar a deixar les factures com a Pendents (0%).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
            <p className="font-bold flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Estàs a punt de reiniciar {selectedCount} factures</span>
            </p>
            <p className="text-slate-600">
              S'eliminaran totes les assignacions a projectes de les factures seleccionades ({selectedTotal.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €) i el seu estat passarà a <strong>Pendent (0%)</strong>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Motiu / Comentari per a l'historial (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Reinici per reestructuració de projectes..."
              value={comentari}
              onChange={(e) => setComentari(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50/50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel·lar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md transition-all flex items-center space-x-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reiniciar {selectedCount} factures</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 4. BULK DELETE MODAL
// ==========================================
interface BulkDeleteModalProps {
  isOpen: boolean;
  selectedCount: number;
  selectedTotal: number;
  onClose: () => void;
  onConfirm: (comentari?: string) => void;
}

export function BulkDeleteModal({
  isOpen,
  selectedCount,
  selectedTotal,
  onClose,
  onConfirm,
}: BulkDeleteModalProps) {
  const [comentari, setComentari] = useState<string>("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(comentari.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-rose-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Eliminar Factures Seleccionades</h2>
              <p className="text-xs text-rose-200/80">
                Eliminació definitiva de les despeses i les seves imputacions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
            <p className="font-bold flex items-center space-x-1.5 text-rose-700">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>Acció Irreversible</span>
            </p>
            <p className="text-slate-700">
              Estàs a punt d'eliminar definitivament <strong>{selectedCount}</strong> factures amb un valor total de{" "}
              <strong>
                {selectedTotal.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </strong>
              .
            </p>
            <p className="text-slate-500 text-[11px]">
              Aquesta acció s'utilitza habitualment per eliminar línies carregades per error o duplicats.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Motiu de l'eliminació (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Fitxer pujat erròniament de l'exercici anterior..."
              value={comentari}
              onChange={(e) => setComentari(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50/50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel·lar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-all flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar definitivament ({selectedCount})</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
