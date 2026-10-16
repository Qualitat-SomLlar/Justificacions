"use client";

import React, { useEffect, useState } from "react";
import { DatabaseZap, X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useJustificacions, MigrationPlan } from "@/lib/store";

export default function MigrationModal({ onClose }: { onClose: () => void }) {
  const { prepareMigration, runMigration } = useJustificacions();
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmat, setConfirmat] = useState(false);
  const [estat, setEstat] = useState<"preparant" | "llest" | "migrant" | "fet">("preparant");

  useEffect(() => {
    prepareMigration()
      .then(p => {
        setPlan(p);
        setEstat("llest");
      })
      .catch(e => {
        setError(e?.message || String(e));
        setEstat("llest");
      });
  }, []);

  const handleMigrate = async () => {
    if (!plan) return;
    setError(null);
    setEstat("migrant");
    try {
      await runMigration(plan);
      setEstat("fet");
    } catch (e: any) {
      setError(e?.message || String(e));
      setEstat("llest");
    }
  };

  const total = plan ? plan.buckets.reduce((acc, b) => acc + b.resultCount, 0) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2">
            <DatabaseZap className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-slate-900">Migrar les dades al nou format del núvol</h2>
          </div>
          {estat !== "migrant" && (
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4 text-sm text-slate-700">
          <p>
            Cada factura, imputació i entrada de l&apos;historial passarà a ser un document propi a Firestore.
            Així cap document supera el límit d&apos;1 MiB i cada persona només sobreescriu el que modifica.
            Els documents antics no s&apos;esborren: queden com a còpia.
          </p>

          {estat === "preparant" && (
            <div className="flex items-center space-x-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Llegint les dades actuals del núvol i d&apos;aquest navegador...</span>
            </div>
          )}

          {plan && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2">Dades</th>
                    <th className="text-right px-3 py-2">Núvol (format antic)</th>
                    <th className="text-right px-3 py-2">Aquest navegador</th>
                    <th className="text-right px-3 py-2">Resultat</th>
                    <th className="text-left px-3 py-2">Si hi ha diferències, preval</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.buckets.map(b => (
                    <tr key={b.bucket} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{b.label}</td>
                      <td className="px-3 py-2 text-right">{b.remoteCount}</td>
                      <td className="px-3 py-2 text-right">{b.localCount}</td>
                      <td className="px-3 py-2 text-right font-bold">{b.resultCount}</td>
                      <td className="px-3 py-2">{b.preferencia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {plan && estat !== "fet" && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>Abans de migrar</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Fes-ho des de l&apos;ordinador que té les dades més actuals: les despeses i imputacions d&apos;aquest navegador prevalen.</li>
                <li>Assegura&apos;t que ningú més està treballant amb l&apos;aplicació: els canvis que altres persones tinguin només al seu navegador no es migraran.</li>
                <li>Fes una exportació de seguretat de Firestore des de la Consola de Firebase.</li>
              </ul>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          )}

          {estat === "fet" && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Migració completada ({total} documents). A partir d&apos;ara les dades se sincronitzen en temps real.</span>
            </div>
          )}

          {plan && estat !== "fet" && (
            <label className="flex items-start space-x-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={confirmat}
                onChange={e => setConfirmat(e.target.checked)}
                className="mt-0.5"
              />
              <span>He fet la còpia de seguretat de Firestore i ningú més està fent servir l&apos;aplicació.</span>
            </label>
          )}
        </div>

        <div className="flex justify-end space-x-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
          {estat === "fet" ? (
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">
              Tancar
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={estat === "migrant"}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel·lar
              </button>
              <button
                onClick={handleMigrate}
                disabled={!plan || !confirmat || estat === "migrant"}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold"
              >
                {estat === "migrant" && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{estat === "migrant" ? `Migrant ${total} documents...` : "Migrar ara"}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
