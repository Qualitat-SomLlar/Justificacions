"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, AlertTriangle, CheckCircle2, Info, Building2, Calendar, FileText, Percent, Euro } from "lucide-react";
import { Despesa, Projecte, Imputacio } from "@/lib/types";
import { useJustificacions } from "@/lib/store";
import { percentCents } from "@/lib/sync_utils";

interface ImputacioModalProps {
  despesa: Despesa;
  onClose: () => void;
}

interface AllocationRow {
  projecte_id: string;
  percentatge: number;
  import: number;
  observacions?: string;
}

export default function ImputacioModal({ despesa, onClose }: ImputacioModalProps) {
  const { projectes, imputacions, saveImputacions, despeses } = useJustificacions();

  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [comentariGlobal, setComentariGlobal] = useState("");

  // Preload existing allocations once per despesa: later store updates (e.g. a Firestore
  // snapshot) must not overwrite what the user is typing
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadedFor.current === despesa.id) return;
    loadedFor.current = despesa.id;
    const existing = imputacions.filter(imp => imp.despesa_id === despesa.id);
    if (existing.length > 0) {
      setAllocations(
        existing.map(e => ({
          projecte_id: e.projecte_id,
          percentatge: e.percentatge,
          import: e.import,
          observacions: e.observacions || ""
        }))
      );
    } else {
      // Default: one row at 100% to the first active project
      const firstProj = projectes.find(p => p.actiu)?.id || "";
      setAllocations([
        {
          projecte_id: firstProj,
          percentatge: 100,
          import: despesa.total_factura,
          observacions: ""
        }
      ]);
    }
  }, [despesa, imputacions, projectes]);

  // Close with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Credit notes (abonaments) have a negative total: percentages stay positive, amounts keep the sign
  // Current total (a new A3 import may have changed it while the modal was open)
  const totalFactura = (despeses.find(d => d.id === despesa.id) || despesa).total_factura;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // % derived from € keeps 4 decimals so that e.g. 1 € + 1 € + 1 € of 3 € adds up to 100%
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  const importFromPercent = (p: number) => round2((p / 100) * totalFactura);

  // At exactly 100% the last amount takes the remainder, as the store does when saving, so that
  // what is shown is what is saved (e.g. 50% + 50% of 10,01 € is 5,01 € + 5,00 €, not 10,02 €)
  const closeTo100 = (rows: AllocationRow[]): AllocationRow[] => {
    if (rows.length < 2) return rows;
    const pct = round2(rows.reduce((acc, r) => acc + r.percentatge, 0));
    if (percentCents(pct) !== 10000) return rows;
    const last = rows.length - 1;
    const others = rows.slice(0, last).reduce((acc, r) => acc + r.import, 0);
    return rows.map((r, i) => (i === last ? { ...r, import: round2(totalFactura - others) } : r));
  };

  const updateRow = (index: number, patch: Partial<AllocationRow>) => {
    setAllocations(prev => closeTo100(prev.map((row, i) => (i === index ? { ...row, ...patch } : row))));
  };

  const handlePercentChange = (index: number, val: number) => {
    const p = Math.max(0, Number.isFinite(val) ? val : 0);
    updateRow(index, { percentatge: p, import: importFromPercent(p) });
  };

  const handleImportChange = (index: number, val: number) => {
    const raw = Number.isFinite(val) ? val : 0;
    if (totalFactura === 0) {
      updateRow(index, { import: 0, percentatge: 0 });
      return;
    }
    // Amount entered as a positive number is taken with the sign of the invoice
    const imp = round2(Math.sign(totalFactura) * Math.abs(raw));
    updateRow(index, { import: imp, percentatge: round4((imp / totalFactura) * 100) });
  };

  const handleProjectChange = (index: number, projId: string) => {
    updateRow(index, { projecte_id: projId });
  };

  const selectedIds = new Set(allocations.map(a => a.projecte_id));
  const availableProj = projectes.find(p => p.actiu && !selectedIds.has(p.id));

  const handleAddRow = () => {
    if (!availableProj) return;
    const totalCurrentPercent = allocations.reduce((acc, c) => acc + c.percentatge, 0);
    const remainingPercent = Math.max(0, round4(100 - totalCurrentPercent));
    setAllocations(closeTo100([
      ...allocations,
      {
        projecte_id: availableProj.id,
        percentatge: remainingPercent,
        import: importFromPercent(remainingPercent),
        observacions: ""
      }
    ]));
  };

  const handleRemoveRow = (index: number) => {
    setAllocations(prev => closeTo100(prev.filter((_, i) => i !== index)));
  };

  const handleSet100 = (index: number) => {
    updateRow(index, { percentatge: 100, import: totalFactura });
  };

  const handleSetRemaining = (index: number) => {
    const otherPercents = allocations.reduce((acc, c, i) => i === index ? acc : acc + c.percentatge, 0);
    const otherImports = allocations.reduce((acc, c, i) => i === index ? acc : acc + c.import, 0);
    const rem = Math.max(0, round4(100 - otherPercents));
    // Remaining amount computed in € so that the row closes the invoice to the cent
    updateRow(index, { percentatge: rem, import: rem === 0 ? 0 : round2(totalFactura - otherImports) });
  };

  const totalImputatPercent = round2(allocations.reduce((acc, c) => acc + c.percentatge, 0));
  const totalImputatImport = round2(allocations.reduce((acc, c) => acc + c.import, 0));
  const romanent = round2(totalFactura - totalImputatImport);

  // Same criterion as the store (whole hundredths of a percent)
  const cents = percentCents(totalImputatPercent);
  const isExact100 = cents === 10000;
  const isOver100 = cents > 10000;
  const isUnder100 = cents < 10000;

  const projectCounts = new Map<string, number>();
  allocations.forEach(a => projectCounts.set(a.projecte_id, (projectCounts.get(a.projecte_id) || 0) + 1));
  const hasDuplicates = Array.from(projectCounts.values()).some(n => n > 1);
  const hasEmptyProject = allocations.some(a => !a.projecte_id && (a.percentatge > 0 || a.import !== 0));
  const saveBlockReason = isOver100
    ? "La suma supera el 100%: ajusta el repartiment abans de guardar."
    : hasDuplicates
      ? "Hi ha un projecte repetit en més d'una línia: uneix-les en una sola."
      : hasEmptyProject
        ? "Hi ha una línia sense projecte seleccionat."
        : null;

  const handleSave = () => {
    if (saveBlockReason) return;
    saveImputacions(despesa.id, allocations, comentariGlobal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              {despesa.partida_id || "SENSE PARTIDA"}
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Imputar Factura a Projectes
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invoice Summary Card */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500 font-medium">Proveïdor / CIF</p>
              <p className="text-sm font-bold text-slate-900">{despesa.proveidor}</p>
              <p className="text-xs text-slate-600 font-mono">{despesa.cif || "Sense CIF"}</p>
            </div>

            <div className="text-right">
              <p className="text-xs text-slate-500 font-medium">Total Factura</p>
              <p className="text-2xl font-black text-slate-900">
                {totalFactura.toLocaleString("ca-ES", { minimumFractionDigits: 2 })} €
              </p>
              <p className="text-xs text-slate-500">
                Base: {despesa.base_imposable.toFixed(2)} € | IVA: {despesa.iva.toFixed(2)} € | IRPF: -{despesa.irpf.toFixed(2)} €
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-200 text-slate-600">
            <div>
              <span className="text-slate-400 block">Núm. Factura:</span>
              <span className="font-semibold">{despesa.factura || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Doc A3 / Apunt:</span>
              <span className="font-semibold">{despesa.ndoc_a3}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Data Emissió:</span>
              <span className="font-semibold">{despesa.data_emissio || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Pis / Immoble:</span>
              <span className="font-semibold">{despesa.pis || "-"}</span>
            </div>
          </div>

          {despesa.descripcio_linia && (
            <p className="text-xs text-slate-500 italic bg-white p-2 rounded-lg border border-slate-200/60">
              "{despesa.descripcio_linia}"
            </p>
          )}
        </div>

        {/* Project Allocations Form */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Desglossament d'Imputació a Projectes
            </h4>
            <button
              onClick={handleAddRow}
              disabled={!availableProj}
              title={availableProj ? undefined : "Tots els projectes actius ja tenen una línia"}
              className="disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Afegir Projecte</span>
            </button>
          </div>

          {allocations.map((row, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                
                {/* Project selector */}
                <div className="sm:col-span-6">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Projecte / Subvenció</label>
                  <select
                    value={row.projecte_id}
                    onChange={(e) => handleProjectChange(idx, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {!row.projecte_id && <option value="">— Selecciona un projecte —</option>}
                    {projectes.filter(p => p.actiu || p.id === row.projecte_id).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.codi} — {p.financador ? `[${p.financador}]` : ""} {p.area ? `(${p.area})` : ""}{p.actiu ? "" : " (TANCAT)"}
                      </option>
                    ))}
                    {row.projecte_id && !projectes.some(p => p.id === row.projecte_id) && (
                      <option value={row.projecte_id}>{row.projecte_id} (no existeix)</option>
                    )}
                  </select>
                </div>

                {/* Percentage input */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">% Imputat</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.percentatge}
                      onChange={(e) => handlePercentChange(idx, parseFloat(e.target.value) || 0)}
                      className="w-full pl-3 pr-6 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                  </div>
                </div>

                {/* Amount input */}
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Import (€){totalFactura < 0 ? " · abonament" : ""}</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={Math.abs(row.import)}
                      onChange={(e) => handleImportChange(idx, parseFloat(e.target.value) || 0)}
                      className="w-full pl-3 pr-6 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <Euro className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                  </div>
                </div>

                {/* Remove button */}
                <div className="sm:col-span-1 flex justify-end pt-5 sm:pt-0">
                  <button
                    onClick={() => handleRemoveRow(idx)}
                    disabled={allocations.length <= 1}
                    className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 rounded-lg transition-colors"
                    title="Eliminar línia"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quick action buttons & remarks */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleSet100(idx)}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-colors"
                  >
                    Assignar 100%
                  </button>
                  <button
                    onClick={() => handleSetRemaining(idx)}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-colors"
                  >
                    Omplir restant
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Validation & Audit Bar */}
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between text-xs sm:text-sm font-medium p-3 rounded-xl bg-slate-100 border border-slate-200">
              <span className="text-slate-600">Total Imputat:</span>
              <div className="text-right">
                <span className={`font-bold text-base ${isOver100 ? "text-rose-600" : isExact100 ? "text-emerald-600" : "text-amber-600"}`}>
                  {totalImputatImport.toFixed(2)} € ({totalImputatPercent.toFixed(2)}%)
                </span>
                {isUnder100 && (
                  <span className="block text-xs text-slate-500 font-normal">
                    Fons propis / Restant: {romanent.toFixed(2)} € ({Math.max(0, 100 - totalImputatPercent).toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>

            {/* Banner based on allocation state */}
            {isExact100 && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Imputació perfecta: la totalitat de la factura està assignada al 100%.</span>
              </div>
            )}

            {isUnder100 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center space-x-2">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>
                  Imputació parcial ({totalImputatPercent.toFixed(2)}%): la quantia no assignada ({romanent.toFixed(2)} €) figurarà com a fons propis o despesa no subvencionada.
                </span>
              </div>
            )}

            {isOver100 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center space-x-2 animate-pulse">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                <div>
                  <p className="font-bold">⚠️ La suma supera el 100% ({totalImputatPercent.toFixed(2)}%)</p>
                  <p className="text-rose-700 mt-0.5">
                    No es pot imputar més del total de la factura: redueix algun percentatge o import per poder guardar.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Audit Note / Justification rationale */}
          <div className="pt-2 border-t border-slate-200">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Comentari o Nota d'Auditoria per a l'Historial (Opcional):</span>
              <span className="text-[11px] font-normal text-slate-400">Es registrarà a l'Historial de Canvis</span>
            </label>
            <textarea
              rows={2}
              value={comentariGlobal}
              onChange={(e) => setComentariGlobal(e.target.value)}
              placeholder="Ex: Criteri pactat amb la intervenció municipal, factura compartida al 50% entre APROP22 i fons propis..."
              className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/50">
          {saveBlockReason && (
            <span className="text-xs text-rose-700 mr-auto">{saveBlockReason}</span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Cancel·lar
          </button>
          <button
            onClick={handleSave}
            disabled={!!saveBlockReason}
            className="disabled:bg-slate-300 disabled:cursor-not-allowed px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
          >
            Guardar Imputació
          </button>
        </div>
      </div>
    </div>
  );
}
