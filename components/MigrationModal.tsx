"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DatabaseZap, X, AlertTriangle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { useJustificacions, MigrationPlan } from "@/lib/store";

export default function MigrationModal({ onClose }: { onClose: () => void }) {
  const { prepareMigration, runMigration } = useJustificacions();
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmat, setConfirmat] = useState(false);
  const [estat, setEstat] = useState<"preparant" | "llest" | "migrant" | "fet">("preparant");
  // Incremented on each preparation attempt; stale or unmounted attempts are ignored
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const prepare = useCallback(() => {
    const attempt = ++attemptRef.current;
    setError(null);
    setPlan(null);
    setConfirmat(false);
    setEstat("preparant");
    prepareMigration()
      .then(p => {
        if (!mountedRef.current || attempt !== attemptRef.current) return;
        setPlan(p);
        setEstat("llest");
      })
      .catch(e => {
        if (!mountedRef.current || attempt !== attemptRef.current) return;
        setError(e?.message || String(e));
        setEstat("llest");
      });
    // prepareMigration identity may change on every store render; we only want to run on demand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    prepare();
    return () => {
      mountedRef.current = false;
    };
  }, [prepare]);

  // Close with Escape, except while migrating
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && estat !== "migrant") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [estat, onClose]);

  const handleMigrate = async () => {
    if (!plan) return;
    setError(null);
    setEstat("migrant");
    try {
      await runMigration(plan);
      if (mountedRef.current) setEstat("fet");
      // The app reloads the data from the cloud right away and this dialog may close with it
      window.alert(`Migració completada (${total} elements). A partir d'ara les dades se sincronitzen en temps real.`);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || String(e));
      setEstat("llest");
    }
  };

  const total = plan ? plan.buckets.reduce((acc, b) => acc + b.resultCount, 0) : 0;
  const preparacioFallida = estat === "llest" && !plan && !!error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="migration-modal-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2">
            <DatabaseZap className="w-5 h-5 text-emerald-600" />
            <h2 id="migration-modal-title" className="font-bold text-slate-900">Migrar les dades al nou format del núvol</h2>
          </div>
          {estat !== "migrant" && (
            <button
              onClick={onClose}
              aria-label="Tancar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4 text-sm text-slate-700">
          <p>
            Les dades es reparteixen en documents petits de Firestore i cada canvi només escriu els camps
            modificats: cap document supera el límit d&apos;1 MiB, es fan poques lectures i cada persona només
            sobreescriu el que modifica. Les dades en format antic no s&apos;esborren: queden com a còpia.
          </p>

          {estat === "preparant" && (
            <div className="flex items-center space-x-2 text-slate-500" aria-live="polite">
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
                    <th className="text-left px-3 py-2">Còpia utilitzada</th>
                    <th className="text-right px-3 py-2" title="Elements que només són a la còpia no utilitzada (o imputacions de factures inexistents): no es migraran">No migrats</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.buckets.map(b => (
                    <tr key={b.bucket} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{b.label}</td>
                      <td className="px-3 py-2 text-right">{b.remoteCount}</td>
                      <td className="px-3 py-2 text-right">{b.localCount}</td>
                      <td className="px-3 py-2 text-right font-bold">{b.resultCount}</td>
                      <td className="px-3 py-2">{b.preferencia === "unió" ? "les dues (unió)" : b.preferencia}</td>
                      <td className={`px-3 py-2 text-right ${b.descartats > 0 ? "font-bold text-amber-700" : ""}`}>{b.descartats}</td>
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
                <li>Per a cada llista s&apos;utilitza una sola còpia (columna «Còpia utilitzada»), sense barrejar-les, perquè no reapareguin elements esborrats. Revisa la columna «No migrats»: si hi ha xifres altes, potser no estàs a l&apos;ordinador amb les dades més actuals.</li>
                <li>Assegura&apos;t que ningú més està treballant amb l&apos;aplicació: els canvis que altres persones tinguin només al seu navegador no es migraran.</li>
                <li>Exporta abans les dades a Excel des de l&apos;aplicació: els documents antics del núvol no s&apos;esborren, però serveix de còpia addicional.</li>
              </ul>
            </div>
          )}

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
              <p>
                {preparacioFallida && <strong className="block">No s&apos;han pogut llegir les dades per preparar la migració.</strong>}
                {error}
              </p>
              {preparacioFallida && (
                <button
                  type="button"
                  onClick={prepare}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-800 font-semibold hover:bg-rose-100"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Tornar a intentar</span>
                </button>
              )}
            </div>
          )}

          {estat === "fet" && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Migració completada ({total} elements). A partir d&apos;ara les dades se sincronitzen en temps real.</span>
            </div>
          )}

          {plan && estat !== "fet" && (
            <label className="flex items-start space-x-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={confirmat}
                disabled={estat === "migrant"}
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
                <span>{estat === "migrant" ? `Migrant ${total} elements...` : "Migrar ara"}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
