"use client";

import React, { useState, useEffect, useId, useRef } from "react";
import { X, AlertTriangle, CheckCircle2, FolderTree, Briefcase, RotateCcw, Trash2, Plus } from "lucide-react";
import { Partida, Projecte } from "@/lib/types";
import { formatPeriode, isOutsidePeriode, parsePeriode } from "@/lib/periode";
import { execucioOf } from "@/lib/pressupost";

const fmtEur = (value: number) =>
  (value ?? 0).toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Enter in a free-text field must never submit a destructive form
const preventEnterSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.preventDefault();
};

// ==========================================
// SHARED MODAL SHELL (dialog semantics + Escape)
// ==========================================
interface ModalShellProps {
  onClose: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  headerClassName: string;
  iconClassName: string;
  subtitleClassName: string;
  maxWidthClassName?: string;
  children: React.ReactNode;
}

function ModalShell({
  onClose,
  title,
  subtitle,
  icon,
  headerClassName,
  iconClassName,
  subtitleClassName,
  maxWidthClassName = "max-w-lg",
  children,
}: ModalShellProps) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white rounded-3xl shadow-2xl ${maxWidthClassName} w-full border border-slate-100 overflow-hidden max-h-[95vh] overflow-y-auto`}
      >
        {/* Header */}
        <div className={`p-6 text-white flex items-center justify-between ${headerClassName}`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-2xl ${iconClassName}`}>{icon}</div>
            <div>
              <h2 id={titleId} className="text-lg font-black tracking-tight">{title}</h2>
              <p className={`text-xs ${subtitleClassName}`}>{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tancar"
            title="Tancar"
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

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
  const inactiveCount = partides.length - activePartides.length;
  const [selectedPartida, setSelectedPartida] = useState<string>("");
  const [comentari, setComentari] = useState<string>("");

  // Reset only when the modal opens
  useEffect(() => {
    if (!isOpen) return;
    const firstActive = partides.find((p) => p.activa !== false);
    setSelectedPartida(firstActive ? firstActive.id : "");
    setComentari("");
  }, [isOpen]);

  if (!isOpen) return null;

  const chosenPartidaObj = activePartides.find((p) => p.id === selectedPartida);
  const canSubmit = !!chosenPartidaObj && selectedCount > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm(selectedPartida, comentari.trim() || undefined);
  };

  return (
    <ModalShell
      onClose={onClose}
      title="Assignar Partida en Bloc"
      subtitle="Canvia la partida pressupostària a totes les factures seleccionades."
      icon={<FolderTree className="w-5 h-5" />}
      headerClassName="bg-gradient-to-r from-emerald-900 to-slate-900"
      iconClassName="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
      subtitleClassName="text-emerald-200/80"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {/* Summary Box */}
        <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-100 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500 block">Factures seleccionades</span>
            <strong className="text-base text-slate-900 font-black">{selectedCount}</strong>
          </div>
          <div className="text-right">
            <span className="text-slate-500 block">Import total afectat</span>
            <strong className="text-base text-emerald-700 font-black">{fmtEur(selectedTotal)} €</strong>
          </div>
        </div>

        {/* Partida Select */}
        <div>
          <label htmlFor="bulk-partida-select" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Nova Partida Destí *
          </label>
          {activePartides.length === 0 ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                No hi ha cap partida activa. Crea o reactiva una partida a la gestió de partides abans d&apos;assignar-la.
              </span>
            </div>
          ) : (
            <select
              id="bulk-partida-select"
              value={selectedPartida}
              onChange={(e) => setSelectedPartida(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              required
            >
              {activePartides.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codi} - {p.nom}
                </option>
              ))}
            </select>
          )}
          {chosenPartidaObj && (
            <p className="text-xs text-slate-500 mt-1.5 italic">
              {chosenPartidaObj.nom} ({chosenPartidaObj.codi})
            </p>
          )}
          {inactiveCount > 0 && (
            <p className="text-[11px] text-slate-400 mt-1">
              {inactiveCount} {inactiveCount === 1 ? "partida donada de baixa no es mostra" : "partides donades de baixa no es mostren"}.
            </p>
          )}
        </div>

        {/* Comment */}
        <div>
          <label htmlFor="bulk-partida-comentari" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Motiu / Comentari per a l&apos;historial (opcional)
          </label>
          <input
            id="bulk-partida-comentari"
            type="text"
            placeholder="Ex: Correcció de correspondència A3 a subministraments..."
            value={comentari}
            onChange={(e) => setComentari(e.target.value)}
            onKeyDown={preventEnterSubmit}
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
            disabled={!canSubmit}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md transition-all flex items-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Assignar a {selectedCount} factures</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ==========================================
// 2. BULK IMPUTAR TO PROJECT MODAL
// ==========================================
interface BulkImputarModalProps {
  isOpen: boolean;
  selectedCount: number;
  selectedTotal: number;
  /** How many of the selected invoices already have allocations (they will be replaced) */
  withImputacionsCount?: number;
  /** Issue dates (yyyy-mm-dd) of the selected invoices, to warn about those outside a project's period */
  selectedDates?: string[];
  /** Amount already imputed to each project by the invoices that are NOT selected (the selected ones get replaced) */
  imputatAltres?: Record<string, number>;
  projectes: Projecte[];
  onClose: () => void;
  onConfirm: (
    allocations: { projecte_id: string; percentatge: number }[],
    comentari?: string
  ) => void;
}

interface AllocationRowState {
  key: number;
  projecte_id: string;
  // Raw text so the field can be emptied while typing
  percentText: string;
}

const parsePercent = (text: string): number | null => {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

export function BulkImputarModal({
  isOpen,
  selectedCount,
  selectedTotal,
  withImputacionsCount = 0,
  selectedDates = [],
  imputatAltres = {},
  projectes,
  onClose,
  onConfirm,
}: BulkImputarModalProps) {
  const activeProjects = projectes.filter((p) => p.actiu);
  const [rows, setRows] = useState<AllocationRowState[]>([]);
  const [comentari, setComentari] = useState<string>("");
  const nextKey = useRef(1);

  // Reset only when the modal opens (not when projectes change while open)
  useEffect(() => {
    if (!isOpen) return;
    const first = projectes.find((p) => p.actiu);
    nextKey.current = 1;
    setRows(first ? [{ key: nextKey.current++, projecte_id: first.id, percentText: "100" }] : []);
    setComentari("");
  }, [isOpen]);

  if (!isOpen) return null;

  const parsed = rows.map((r) => parsePercent(r.percentText));
  const totalPercent = parsed.reduce<number>((acc, v) => acc + (v ?? 0), 0);
  const isOver100 = Math.round(totalPercent * 100) > 10000;

  const activeIds = new Set(activeProjects.map((p) => p.id));
  const usedIds = rows.map((r) => r.projecte_id).filter(Boolean);
  const hasDuplicates = new Set(usedIds).size !== usedIds.length;
  const hasEmptyProject = rows.some((r) => !r.projecte_id || !activeIds.has(r.projecte_id));
  const hasInvalidPercent = parsed.some((v) => v === null || v <= 0 || v > 100);

  const errors: string[] = [];
  if (activeProjects.length === 0) errors.push("No hi ha cap projecte actiu per imputar.");
  if (rows.length === 0 && activeProjects.length > 0) errors.push("Afegeix almenys un projecte.");
  if (hasEmptyProject) errors.push("Totes les files han de tenir un projecte actiu seleccionat.");
  if (hasDuplicates) errors.push("No es pot repetir el mateix projecte en dues files.");
  if (hasInvalidPercent) errors.push("Cada fila ha de tenir un percentatge entre 0 (exclòs) i 100.");
  if (isOver100) errors.push("La suma dels percentatges supera el 100%.");
  if (selectedCount === 0) errors.push("No hi ha cap factura seleccionada.");
  const canSubmit = errors.length === 0;

  // Warnings per row (they don't block): invoices outside the project's period and budget reached or exceeded
  const rowWarnings = (projecteId: string, percent: number | null): { level: "warn" | "danger"; text: string }[] => {
    const p = projectes.find((item) => item.id === projecteId);
    if (!p) return [];
    const warnings: { level: "warn" | "danger"; text: string }[] = [];
    const periode = parsePeriode(p.dates_text);
    const outside = selectedDates.filter((d) => isOutsidePeriode(d, periode)).length;
    if (outside > 0) {
      warnings.push({
        level: "warn",
        text: `${outside} ${outside === 1 ? "factura té" : "factures tenen"} data fora del període de ${p.codi} (${formatPeriode(periode)}) i podrien no ser elegibles.`,
      });
    }
    if (percent !== null && percent > 0) {
      const added = Math.round(((percent / 100) * selectedTotal) * 100) / 100;
      const ex = execucioOf(p.pressupost_total, (imputatAltres[p.id] || 0) + added);
      if (ex.estat === "excedit") {
        warnings.push({
          level: "danger",
          text: `${p.codi} superaria el seu pressupost: ${fmtEur(ex.imputat)} € sobre ${fmtEur(ex.pressupost)} € (${ex.pct.toFixed(2)}%).`,
        });
      } else if (ex.estat === "alerta") {
        warnings.push({
          level: "warn",
          text: `${p.codi} arribaria al ${ex.pct.toFixed(2)}% del seu pressupost (queden ${fmtEur(ex.disponible)} €).`,
        });
      }
    }
    return warnings;
  };

  const updateRow = (index: number, patch: Partial<AllocationRowState>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const handleAddRow = () => {
    const used = new Set(rows.map((r) => r.projecte_id));
    const nextProj = activeProjects.find((p) => !used.has(p.id));
    if (!nextProj) return;
    const remaining = Math.max(0, Math.round((100 - totalPercent) * 100) / 100);
    setRows((prev) => [
      ...prev,
      { key: nextKey.current++, projecte_id: nextProj.id, percentText: remaining > 0 ? String(remaining) : "" },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const allocations = rows.map((r, i) => ({
      projecte_id: r.projecte_id,
      percentatge: Math.round((parsed[i] ?? 0) * 100) / 100,
    }));
    onConfirm(allocations, comentari.trim() || undefined);
  };

  return (
    <ModalShell
      onClose={onClose}
      title="Imputar Factures en Bloc"
      subtitle="Aplica la mateixa regla d'imputació a les factures seleccionades."
      icon={<Briefcase className="w-5 h-5" />}
      headerClassName="bg-gradient-to-r from-sky-900 to-slate-900"
      iconClassName="bg-sky-500/20 border border-sky-500/30 text-sky-400"
      subtitleClassName="text-sky-200/80"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {/* Summary Box */}
        <div className="p-4 rounded-2xl bg-sky-50/80 border border-sky-100 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500 block">Factures seleccionades</span>
            <strong className="text-base text-slate-900 font-black">{selectedCount}</strong>
          </div>
          <div className="text-right">
            <span className="text-slate-500 block">Import total conjunt</span>
            <strong className="text-base text-sky-700 font-black">{fmtEur(selectedTotal)} €</strong>
          </div>
        </div>

        {/* Replacement warning */}
        <div
          className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
            withImputacionsCount > 0
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-slate-50 border-slate-200 text-slate-600"
          }`}
        >
          <AlertTriangle
            className={`w-4 h-4 flex-shrink-0 mt-0.5 ${withImputacionsCount > 0 ? "text-amber-600" : "text-slate-400"}`}
          />
          <span>
            Substituirà les imputacions existents de {selectedCount} {selectedCount === 1 ? "factura" : "factures"} (
            <strong>{withImputacionsCount}</strong> ja {withImputacionsCount === 1 ? "té" : "tenen"} imputacions).
          </span>
        </div>

        {/* Allocation Rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Distribució per Projecte
            </span>
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

          {rows.map((row, idx) => {
            const usedElsewhere = new Set(rows.filter((_, i) => i !== idx).map((r) => r.projecte_id));
            const options = activeProjects.filter((p) => !usedElsewhere.has(p.id));
            return (
              <div key={row.key} className="space-y-1.5">
              <div className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <select
                  value={row.projecte_id}
                  onChange={(e) => updateRow(idx, { projecte_id: e.target.value })}
                  aria-label={`Projecte de la fila ${idx + 1}`}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                >
                  <option value="" disabled>
                    Selecciona un projecte...
                  </option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codi} {p.financador ? `(${p.financador})` : ""}
                    </option>
                  ))}
                </select>

                <div className="flex items-center space-x-1 w-28">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.percentText}
                    onChange={(e) => updateRow(idx, { percentText: e.target.value })}
                    aria-label={`Percentatge de la fila ${idx + 1}`}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-right text-xs sm:text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>

                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(idx)}
                    aria-label={`Treure la fila ${idx + 1}`}
                    title="Treure aquest projecte"
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {rowWarnings(row.projecte_id, parsed[idx]).map((w, wi) => (
                <div
                  key={wi}
                  role="status"
                  className={`p-2 rounded-lg border text-[11px] flex items-start space-x-1.5 ${
                    w.level === "danger" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}
                >
                  <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-px ${w.level === "danger" ? "text-rose-600" : "text-amber-600"}`} />
                  <span>{w.text}</span>
                </div>
              ))}
              </div>
            );
          })}

          {/* Total Indicator */}
          <div className="flex items-center justify-between text-xs px-2 pt-1 font-semibold">
            <span className="text-slate-500">Total Imputat:</span>
            <span className={isOver100 ? "text-rose-600 font-bold" : "text-slate-900 font-bold"}>
              {totalPercent.toFixed(2)} % {isOver100 && "(⚠️ Supera el 100%)"}
            </span>
          </div>

          {errors.length > 0 && (
            <ul className="text-[11px] text-rose-600 font-semibold space-y-0.5 px-2" role="alert">
              {errors.map((err) => (
                <li key={err}>• {err}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Comment */}
        <div>
          <label htmlFor="bulk-imputar-comentari" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Motiu / Comentari per a l&apos;historial (opcional)
          </label>
          <input
            id="bulk-imputar-comentari"
            type="text"
            placeholder="Ex: Imputació massiva de despeses de subministraments..."
            value={comentari}
            onChange={(e) => setComentari(e.target.value)}
            onKeyDown={preventEnterSubmit}
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
            disabled={!canSubmit}
            className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md transition-all flex items-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Imputar {selectedCount} factures</span>
          </button>
        </div>
      </form>
    </ModalShell>
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

  useEffect(() => {
    if (isOpen) setComentari("");
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCount === 0) return;
    onConfirm(comentari.trim() || undefined);
  };

  return (
    <ModalShell
      onClose={onClose}
      title="Reiniciar Imputacions"
      subtitle="Tornar a deixar les factures com a Pendents (0%)."
      icon={<RotateCcw className="w-5 h-5" />}
      headerClassName="bg-gradient-to-r from-amber-700 to-slate-900"
      iconClassName="bg-amber-500/20 border border-amber-500/30 text-amber-300"
      subtitleClassName="text-amber-200/80"
      maxWidthClassName="max-w-md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
          <p className="font-bold flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>Estàs a punt de reiniciar {selectedCount} factures</span>
          </p>
          <p className="text-slate-600">
            S&apos;eliminaran totes les assignacions a projectes de les factures seleccionades ({fmtEur(selectedTotal)} €) i el seu estat passarà a <strong>Pendent (0%)</strong>.
          </p>
        </div>

        <div>
          <label htmlFor="bulk-reset-comentari" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Motiu / Comentari per a l&apos;historial (opcional)
          </label>
          <input
            id="bulk-reset-comentari"
            type="text"
            placeholder="Ex: Reinici per reestructuració de projectes..."
            value={comentari}
            onChange={(e) => setComentari(e.target.value)}
            onKeyDown={preventEnterSubmit}
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
            disabled={selectedCount === 0}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md transition-all flex items-center space-x-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reiniciar {selectedCount} factures</span>
          </button>
        </div>
      </form>
    </ModalShell>
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

const DELETE_CONFIRM_WORD = "ELIMINAR";

export function BulkDeleteModal({
  isOpen,
  selectedCount,
  selectedTotal,
  onClose,
  onConfirm,
}: BulkDeleteModalProps) {
  const [comentari, setComentari] = useState<string>("");
  const [confirmText, setConfirmText] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;
    setComentari("");
    setConfirmText("");
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim().toUpperCase() === DELETE_CONFIRM_WORD && selectedCount > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed) return;
    onConfirm(comentari.trim() || undefined);
  };

  return (
    <ModalShell
      onClose={onClose}
      title="Eliminar Factures Seleccionades"
      subtitle="Eliminació definitiva de les despeses i les seves imputacions."
      icon={<Trash2 className="w-5 h-5" />}
      headerClassName="bg-gradient-to-r from-rose-900 to-slate-900"
      iconClassName="bg-rose-500/20 border border-rose-500/30 text-rose-400"
      subtitleClassName="text-rose-200/80"
      maxWidthClassName="max-w-md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
          <p className="font-bold flex items-center space-x-1.5 text-rose-700">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>Acció Irreversible</span>
          </p>
          <p className="text-slate-700">
            Estàs a punt d&apos;eliminar definitivament <strong>{selectedCount}</strong> factures amb un valor total de{" "}
            <strong>{fmtEur(selectedTotal)} €</strong>.
          </p>
          <p className="text-slate-500 text-[11px]">
            Aquesta acció s&apos;utilitza habitualment per eliminar línies carregades per error o duplicats.
          </p>
        </div>

        <div>
          <label htmlFor="bulk-delete-comentari" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Motiu de l&apos;eliminació (opcional)
          </label>
          <input
            id="bulk-delete-comentari"
            type="text"
            placeholder="Ex: Fitxer pujat erròniament de l'exercici anterior..."
            value={comentari}
            onChange={(e) => setComentari(e.target.value)}
            onKeyDown={preventEnterSubmit}
            className="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50/50"
          />
        </div>

        <div>
          <label htmlFor="bulk-delete-confirm" className="block text-xs font-bold text-slate-700 mb-2">
            Per confirmar, escriu <span className="font-mono text-rose-700">{DELETE_CONFIRM_WORD}</span>
          </label>
          <input
            id="bulk-delete-confirm"
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={preventEnterSubmit}
            className="w-full px-4 py-2 rounded-xl border border-rose-200 text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
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
            disabled={!isConfirmed}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md transition-all flex items-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Eliminar definitivament ({selectedCount})</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
