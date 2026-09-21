"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, X, Loader2 } from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { ImportSummary } from "@/lib/types";

interface ImportModalProps {
  onClose: () => void;
}

export default function ImportModal({ onClose }: ImportModalProps) {
  const { importA3File } = useJustificacions();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("Només es permeten fitxers Excel (.xlsx o .xls).");
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const res = await importA3File(buffer);
      setSummary(res);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Error en processar el fitxer d'A3.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Pujar Fitxer Excel d'A3</h3>
              <p className="text-xs text-slate-500">Sincronització intel·ligent de despeses</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {!summary ? (
            <>
              {/* Drop area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-50/50"
                    : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                />
                
                {isProcessing ? (
                  <div className="flex flex-col items-center justify-center space-y-3 py-4">
                    <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                    <p className="text-sm font-medium text-slate-700">Llegint i unificant línies de factura d'A3...</p>
                    <p className="text-xs text-slate-500">Calculant desglossament, IVA i IRPF</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-3 rounded-full bg-slate-100 text-slate-600">
                      <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        Arrossega l'arxiu Excel d'A3 aquí, o fes clic per seleccionar-lo
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Formats acceptats: .xlsx, .xls (exportats d'A3)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">Com funciona la sincronització intel·ligent?</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                  <li>Agrupa automàticament els apunts d'una mateixa factura en un sol registre.</li>
                  <li><strong>Respecta les imputacions ja fetes:</strong> si ja vau repartir una factura, no la perdràs.</li>
                  <li>Si un import ha canviat a A3, el sistema us avisarà clarament per revisar-lo.</li>
                </ul>
              </div>
            </>
          ) : (
            /* Summary Report */
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center space-x-3 text-emerald-800">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-bold">Importació completada amb èxit!</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    S'han processat {summary.totalFilesLlegides} línies d'apunt d'A3.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500">Factures Noves</span>
                  <p className="text-lg font-bold text-emerald-600">{summary.facturesNoves}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500">Ja Existents (Mantingudes)</span>
                  <p className="text-lg font-bold text-slate-700">{summary.facturesExistents}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500">Modificacions a A3</span>
                  <p className={`text-lg font-bold ${summary.facturesModificades > 0 ? "text-amber-600" : "text-slate-700"}`}>
                    {summary.facturesModificades}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500">Sense Correspondència</span>
                  <p className={`text-lg font-bold ${summary.senseCorrespondencia > 0 ? "text-rose-600" : "text-slate-700"}`}>
                    {summary.senseCorrespondencia}
                  </p>
                </div>
              </div>

              {summary.senseCorrespondencia > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                  <span>
                    Hi ha {summary.senseCorrespondencia} factures amb comptes comptables nous. Podeu assignar-los fàcilment des de la pestanya <strong>Equivalències A3</strong>.
                  </span>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors shadow-sm"
              >
                Acceptar i veure despeses
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
