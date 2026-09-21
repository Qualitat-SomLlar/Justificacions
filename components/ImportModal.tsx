"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  X, 
  Loader2, 
  Check, 
  ArrowRight, 
  Eye, 
  Layers, 
  Table, 
  ExternalLink,
  HelpCircle
} from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { ImportSummary } from "@/lib/types";
import { inspectA3Workbook, WorkbookInspection } from "@/lib/parser";

interface ImportModalProps {
  onClose: () => void;
}

export default function ImportModal({ onClose }: ImportModalProps) {
  const { importA3File } = useJustificacions();
  const [isDragging, setIsDragging] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // File & inspection state
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [inspection, setInspection] = useState<WorkbookInspection | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");

  // Result summary state
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("Només es permeten fitxers Excel (.xlsx o .xls).");
      return;
    }

    setIsInspecting(true);
    setError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      setFileBuffer(buffer);
      const insp = inspectA3Workbook(buffer);
      setInspection(insp);
      setSelectedSheet(insp.recommendedSheet);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "No s'ha pogut llegir l'estructura del fitxer Excel.");
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSheetChange = (sheetName: string) => {
    if (!fileBuffer) return;
    setSelectedSheet(sheetName);
    try {
      const insp = inspectA3Workbook(fileBuffer, sheetName);
      setInspection(insp);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleConfirmImport = async () => {
    if (!fileBuffer) return;

    setIsProcessing(true);
    setError(null);
    try {
      const res = await importA3File(fileBuffer, selectedSheet);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Pujar Fitxer d'A3 i Diagnòstic de Match</h3>
              <p className="text-xs text-slate-500">Reconeixement intel·ligent de fulls, columnes i partides</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* STEP 1: DROPZONE IF NO FILE SELECTED */}
          {!inspection && !summary && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
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
                
                {isInspecting ? (
                  <div className="flex flex-col items-center justify-center space-y-3 py-4">
                    <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                    <p className="text-sm font-semibold text-slate-700">Inspeccionant fulls i columnes d'A3...</p>
                    <p className="text-xs text-slate-400">Verificant correspondències comptables</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-600">
                      <FileSpreadsheet className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Arrossega l'arxiu Excel d'A3 aquí, o fes clic per examinar
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Compatible amb exportacions A3 (fulls 'A Exportar', 'Export', 'APEN_GASTOS', etc.)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 text-xs text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-700 flex items-center space-x-1">
                  <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Com fa el sistema el match de despeses?</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1">
                  <li><strong>Full recomanat:</strong> Detecta automàticament el full amb més línies de despesa o permet triar-lo.</li>
                  <li><strong>Partida directa o per compte:</strong> Si l'Excel ja té la partida (ex: <em>Full destí</em>) l'aplica directament; sinó, fa el match pel compte comptable (9 dígits).</li>
                  <li><strong>Respecta imputacions existents:</strong> No perdràs els percentatges ja assignats als projectes.</li>
                </ul>
              </div>
            </>
          )}

          {/* STEP 2: INSPECTION & PREVIEW BEFORE PROCESSING */}
          {inspection && !summary && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* File details banner */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div className="flex items-center space-x-2 truncate">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="font-bold text-slate-800 truncate">{fileName}</span>
                </div>
                <button
                  onClick={() => {
                    setInspection(null);
                    setFileBuffer(null);
                  }}
                  className="text-xs text-slate-500 hover:text-rose-600 underline whitespace-nowrap ml-2"
                >
                  Canviar fitxer
                </button>
              </div>

              {/* Sheet selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Full d'Excel a importar:</span>
                </label>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 cursor-pointer"
                >
                  {inspection.sheets.map(s => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.rowCount} files) {s.isRecommended ? "⭐ (Recomanat per dades)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Si el fitxer conté diversos fulls (com ara <em>'A Exportar'</em> o <em>'APEN_GASTOS'</em>), pots canviar-lo aquí lliurement.
                </p>
              </div>

              {/* Columns diagnostic */}
              <div>
                <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                  <Table className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Diagnòstic de columnes detectades al full:</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {inspection.detectedColumns.map((col, idx) => (
                    <div 
                      key={idx} 
                      className={`p-2 rounded-xl border flex flex-col justify-between ${
                        col.trobada ? "bg-emerald-50/60 border-emerald-200 text-emerald-900" : "bg-slate-50 border-slate-200 text-slate-400"
                      }`}
                    >
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">{col.camp}</span>
                      <span className="font-bold truncate mt-0.5" title={col.nomColumna}>
                        {col.trobada ? `✓ ${col.nomColumna}` : "⚠️ No trobat"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample Preview */}
              {inspection.sampleRows.length > 0 && (
                <div>
                  <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>Mostra de factures llegides:</span>
                  </span>
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs bg-slate-50/50">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                        <tr>
                          <th className="py-2 px-3">Doc / Factura</th>
                          <th className="py-2 px-3">Proveïdor</th>
                          <th className="py-2 px-3">Compte</th>
                          <th className="py-2 px-3 text-right">Import</th>
                          <th className="py-2 px-3">Partida</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {inspection.sampleRows.map((row, i) => (
                          <tr key={i}>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900">
                              {row.docA3}
                              <span className="block text-[10px] text-slate-400 font-normal">{row.factura}</span>
                            </td>
                            <td className="py-2 px-3 text-slate-700 truncate max-w-[140px]" title={row.proveidor}>
                              {row.proveidor}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600">
                              {row.compte}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900">
                              {row.importTotal.toFixed(2)} €
                            </td>
                            <td className="py-2 px-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                row.partidaDetectada.startsWith("DD_")
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}>
                                {row.partidaDetectada}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setInspection(null);
                    setFileBuffer(null);
                  }}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
                >
                  Tornar
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleConfirmImport}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold text-xs shadow-sm transition-all"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processant importació...</span>
                    </>
                  ) : (
                    <>
                      <span>Importar dades del full '{selectedSheet}'</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SUMMARY RESULT */}
          {summary && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center space-x-3 text-emerald-800">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-bold">Importació completada amb èxit!</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    S'ha utilitzat el full <strong>'{summary.fullUtilitzat}'</strong> amb un total de <strong>{summary.totalFilesLlegides}</strong> línies processades.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-semibold uppercase text-[10px]">Factures Noves</span>
                  <p className="text-xl font-black text-emerald-600">{summary.facturesNoves}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-semibold uppercase text-[10px]">Ja Existents (Mantingudes)</span>
                  <p className="text-xl font-black text-slate-700">{summary.facturesExistents}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-semibold uppercase text-[10px]">Modificades a l'A3</span>
                  <p className={`text-xl font-black ${summary.facturesModificades > 0 ? "text-amber-600" : "text-slate-700"}`}>
                    {summary.facturesModificades}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-semibold uppercase text-[10px]">Sense Correspondència</span>
                  <p className={`text-xl font-black ${summary.senseCorrespondencia > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {summary.senseCorrespondencia}
                  </p>
                </div>
              </div>

              {/* Unmapped accounts details if any */}
              {summary.comptesSenseCorrespondencia && summary.comptesSenseCorrespondencia.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                  <div className="flex items-center space-x-2 font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Comptes comptables pendents d'assignar ({summary.comptesSenseCorrespondencia.length}):</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {summary.comptesSenseCorrespondencia.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white/70 px-2.5 py-1.5 rounded-lg border border-amber-200/50">
                        <div className="truncate pr-2">
                          <span className="font-mono font-bold">{item.compte}</span>
                          <span className="text-slate-600 ml-1.5 text-[11px] truncate">
                            {item.descripcio || "Sense descripció"}
                          </span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold whitespace-nowrap">
                          {item.count} factures
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-1">
                    <Link
                      href="/equivalencies"
                      onClick={onClose}
                      className="inline-flex items-center space-x-1 font-bold text-amber-800 hover:text-amber-900 hover:underline"
                    >
                      <span>Vincular aquests comptes a la pestanya 'Equivalències A3'</span>
                      <ExternalLink className="w-3 h-3 ml-0.5" />
                    </Link>
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors shadow-sm"
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
