"use client";

import React, { useState, useMemo } from "react";
import { Search, Plus, ArrowLeftRight, AlertTriangle, CheckCircle2, Trash2, Edit, X } from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { Equivalencia } from "@/lib/types";

export default function EquivalenciesPage() {
  const { 
    equivalencies, 
    partides, 
    despeses, 
    addEquivalencia, 
    updateEquivalencia, 
    deleteEquivalencia,
    assignPartidaToCompte,
    reloadSeedData
  } = useJustificacions();

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [compteInput, setCompteInput] = useState("");
  const [descripcioInput, setDescripcioInput] = useState("");
  const [partidaDestiInput, setPartidaDestiInput] = useState(partides[0]?.id || "");

  // Unmapped accounts in currently imported despeses
  const unmappedAccounts = useMemo(() => {
    const map = new Map<string, { desc: string; count: number }>();
    despeses.forEach(d => {
      if (d.partida_id === "SENSE_CORRESPONDENCIA" && d.compte_despesa) {
        if (!map.has(d.compte_despesa)) {
          map.set(d.compte_despesa, { desc: d.descripcio_compte, count: 0 });
        }
        map.get(d.compte_despesa)!.count++;
      }
    });
    return Array.from(map.entries()).map(([compte, data]) => ({
      compte,
      descripcio: data.desc,
      count: data.count,
    }));
  }, [despeses]);

  // Selected quick assignments for unmapped
  const [quickAssignMap, setQuickAssignMap] = useState<{ [compte: string]: string }>({});

  const handleQuickAssign = (compte: string) => {
    const targetPartida = quickAssignMap[compte] || partides[0]?.id;
    if (targetPartida) {
      assignPartidaToCompte(compte, targetPartida);
    }
  };

  const handleCreateEquivalencia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!compteInput.trim()) return;

    addEquivalencia({
      compte: compteInput.trim(),
      descripcio: descripcioInput.trim(),
      partida_id: partidaDestiInput,
    });

    setCompteInput("");
    setDescripcioInput("");
    setIsModalOpen(false);
  };

  const filtered = useMemo(() => {
    return equivalencies.filter(eq => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        eq.compte.toLowerCase().includes(term) ||
        eq.descripcio.toLowerCase().includes(term) ||
        eq.partida_id.toLowerCase().includes(term)
      );
    });
  }, [equivalencies, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Mapeig de Comptes A3 &rarr; Partides DD_...
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Correspondència entre els comptes comptables d'A3 i les partides de despesa directa.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={reloadSeedData}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            title="Restaura les equivalències originals extretes de la plantilla de Som Llar"
          >
            Restaurar Catàleg Original
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Equivalència</span>
          </button>
        </div>
      </div>

      {/* Unmapped accounts alert banner & quick resolver */}
      {unmappedAccounts.length > 0 && (
        <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 space-y-4">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-rose-900">
                Hi ha {unmappedAccounts.length} compte(s) d'A3 sense partida assignada ("Sense Correspondència")
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Assigna la partida destí aquí sota per corregir automàticament totes les despeses afectades amb 1 sol clic:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unmappedAccounts.map((item) => (
              <div key={item.compte} className="bg-white p-3 rounded-xl border border-rose-200 shadow-sm flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-mono font-bold text-slate-900">{item.compte}</span>
                  <span className="text-slate-500 block truncate max-w-[200px]" title={item.descripcio}>
                    {item.descripcio || "Sense descripció"}
                  </span>
                  <span className="text-[10px] text-rose-600 font-semibold">{item.count} factures afectades</span>
                </div>

                <div className="flex items-center space-x-2">
                  <select
                    value={quickAssignMap[item.compte] || partides[0]?.id}
                    onChange={(e) => setQuickAssignMap({ ...quickAssignMap, [item.compte]: e.target.value })}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none max-w-[150px]"
                  >
                    {partides.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.codi}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleQuickAssign(item.compte)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm whitespace-nowrap transition-colors"
                  >
                    Assignar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cercar per número de compte, descripció..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
          />
        </div>

        <div className="text-xs text-slate-500">
          Total de <strong>{equivalencies.length}</strong> comptes mapejats
        </div>
      </div>

      {/* Equivalencies Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh]">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="sticky top-0 bg-slate-50/90 z-10 border-b border-slate-200">
              <tr className="text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <th className="py-3.5 px-4">Compte Despesa A3</th>
                <th className="py-3.5 px-4">Descripció del Compte</th>
                <th className="py-3.5 px-4">Partida Destí (`DD_...`)</th>
                <th className="py-3.5 px-4 text-right">Accions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((eq) => (
                <tr key={eq.compte} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {eq.compte}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {eq.descripcio || "-"}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                      {eq.partida_id}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => deleteEquivalencia(eq.compte)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                      title="Eliminar equivalència"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-slate-400">
                    No s'ha trobat cap equivalència amb aquest filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Equivalencia */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900">Nova Equivalència de Compte</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEquivalencia} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Codi de Compte A3 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: 628200001"
                  value={compteInput}
                  onChange={(e) => setCompteInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descripció del Compte
                </label>
                <input
                  type="text"
                  placeholder="ex: Electricitat Habitatges"
                  value={descripcioInput}
                  onChange={(e) => setDescripcioInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Partida Destí (`DD_...`) *
                </label>
                <select
                  value={partidaDestiInput}
                  onChange={(e) => setPartidaDestiInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {partides.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.codi}
                    </option>
                  ))}
                </select>
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
                  Crear Equivalència
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
