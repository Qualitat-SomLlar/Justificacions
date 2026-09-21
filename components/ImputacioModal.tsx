"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, AlertTriangle, CheckCircle2, Info, Building2, Calendar, FileText, Percent, Euro } from "lucide-react";
import { Despesa, Projecte, Imputacio } from "@/lib/types";
import { useJustificacions } from "@/lib/store";

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
  const { projectes, imputacions, saveImputacions } = useJustificacions();

  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  // Preload existing allocations for this despesa
  useEffect(() => {
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
      // Default: one empty row
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

  const totalFactura = despesa.total_factura;

  const handlePercentChange = (index: number, val: number) => {
    const updated = [...allocations];
    const p = Math.max(0, val);
    const imp = Math.round(((p / 100) * totalFactura) * 100) / 100;
    updated[index].percentatge = p;
    updated[index].import = imp;
    setAllocations(updated);
  };

  const handleImportChange = (index: number, val: number) => {
    const updated = [...allocations];
    const imp = Math.max(0, val);
    const p = totalFactura > 0 ? Math.round(((imp / totalFactura) * 100) * 100) / 100 : 0;
    updated[index].import = imp;
    updated[index].percentatge = p;
    setAllocations(updated);
  };

  const handleProjectChange = (index: number, projId: string) => {
    const updated = [...allocations];
    updated[index].projecte_id = projId;
    setAllocations(updated);
  };

  const handleAddRow = () => {
    const totalCurrentPercent = allocations.reduce((acc, c) => acc + c.percentatge, 0);
    const remainingPercent = Math.max(0, Math.round((100 - totalCurrentPercent) * 100) / 100);
    const remainingImport = Math.max(0, Math.round(((remainingPercent / 100) * totalFactura) * 100) / 100);

    // Pick first project not yet selected
    const selectedIds = new Set(allocations.map(a => a.projecte_id));
    const availableProj = projectes.find(p => p.actiu && !selectedIds.has(p.id)) || projectes[0];

    setAllocations([
      ...allocations,
      {
        projecte_id: availableProj?.id || "",
        percentatge: remainingPercent,
        import: remainingImport,
        observacions: ""
      }
    ]);
  };

  const handleRemoveRow = (index: number) => {
    const updated = allocations.filter((_, i) => i !== index);
    setAllocations(updated);
  };

  const handleSet100 = (index: number) => {
    const updated = [...allocations];
    updated[index].percentatge = 100;
    updated[index].import = totalFactura;
    setAllocations(updated);
  };

  const handleSetRemaining = (index: number) => {
    const otherPercents = allocations.reduce((acc, c, i) => i === index ? acc : acc + c.percentatge, 0);
    const rem = Math.max(0, Math.round((100 - otherPercents) * 100) / 100);
    const remImp = Math.max(0, Math.round(((rem / 100) * totalFactura) * 100) / 100);
    const updated = [...allocations];
    updated[index].percentatge = rem;
    updated[index].import = remImp;
    setAllocations(updated);
  };

  const totalImputatPercent = Math.round(allocations.reduce((acc, c) => acc + c.percentatge, 0) * 100) / 100;
  const totalImputatImport = Math.round(allocations.reduce((acc, c) => acc + c.import, 0) * 100) / 100;
  const romanent = Math.round((totalFactura - totalImputatImport) * 100) / 100;

  const isExact100 = Math.abs(totalImputatPercent - 100) < 0.01;
  const isOver100 = totalImputatPercent > 100.01;
  const isUnder100 = totalImputatPercent < 99.99;

  const handleSave = () => {
    saveImputacions(despesa.id, allocations);
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
              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
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
                    {projectes.filter(p => p.actiu).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.codi} — {p.financador ? `[${p.financador}]` : ""} {p.area ? `(${p.area})` : ""}
                      </option>
                    ))}
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
                  <label className="block text-xs font-medium text-slate-500 mb-1">Import (€)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.import}
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
                    Fons propis / Restant: {romanent.toFixed(2)} € ({(100 - totalImputatPercent).toFixed(2)}%)
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
                  Imputació parcial ({totalImputatPercent}%): la quantia no assignada ({romanent} €) figurarà com a fons propis o despesa no subvencionada.
                </span>
              </div>
            )}

            {isOver100 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center space-x-2 animate-pulse">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                <div>
                  <p className="font-bold">⚠️ ALERTA D'AUDITORIA: La suma supera el 100% ({totalImputatPercent}%)</p>
                  <p className="text-rose-700 mt-0.5">
                    Aquesta factura quedarà senyalitzada amb vigilància especial d'auditoria per possible sobredistribució.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-200 bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Cancel·lar
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
          >
            Guardar Imputació
          </button>
        </div>
      </div>
    </div>
  );
}
