"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Despesa, Imputacio, Projecte, Partida, Equivalencia, ImportSummary, LogEntry } from "./types";
import { parseA3Excel } from "./parser";
import { exportJustificacionsExcel } from "./exporter";
import seedData from "./seed_data.json";
import { auth, db } from "./firebase";
import {
  BUCKETS,
  SCHEMA_VERSION,
  fetchSchemaVersion,
  fetchLegacyBuckets,
  subscribeBucket,
  writeBucketChanges,
  writeMigration
} from "./firestore_sync";
import { diffById, mergeForMigration, recalcDespesesFromImputacions } from "./sync_utils";

/**
 * - checking: reading the schema version from Firestore
 * - local: no Firebase session (e.g. mode proves); data only in this browser
 * - migration_pending: Firestore still has the old format; data only in this browser until migrated
 * - synced: live sync, one Firestore document per item
 * - error: Firestore couldn't be reached; data only in this browser
 */
export type CloudStatus = "checking" | "local" | "migration_pending" | "synced" | "error";

export interface MigrationBucketPlan {
  bucket: string;
  label: string;
  remoteCount: number;
  localCount: number;
  resultCount: number;
  preferencia: "núvol" | "aquest navegador";
  items: any[];
  key: (item: any) => string;
}

export interface MigrationPlan {
  buckets: MigrationBucketPlan[];
}

interface JustificacionsContextType {
  despeses: Despesa[];
  imputacions: Imputacio[];
  projectes: Projecte[];
  partides: Partida[];
  equivalencies: Equivalencia[];
  historial: LogEntry[];
  isLoading: boolean;
  isCloudSynced: boolean;
  cloudStatus: CloudStatus;
  syncError: string | null;
  clearSyncError: () => void;
  prepareMigration: () => Promise<MigrationPlan>;
  runMigration: (plan: MigrationPlan) => Promise<void>;
  activeExercici: number;
  setActiveExercici: (y: number) => void;
  importA3File: (fileBuffer: ArrayBuffer, preferredSheet?: string) => Promise<ImportSummary>;
  saveImputacions: (
    despesaId: string,
    allocations: { projecte_id: string; percentatge: number; import: number; observacions?: string }[],
    comentariGlobal?: string
  ) => void;
  bulkAssignPartida: (despesaIds: string[], partidaId: string, comentaris?: string) => void;
  bulkImputar: (despesaIds: string[], allocations: { projecte_id: string; percentatge: number }[], comentaris?: string) => void;
  bulkResetImputacions: (despesaIds: string[], comentaris?: string) => void;
  bulkDeleteDespeses: (despesaIds: string[], comentaris?: string) => void;
  addProjecte: (p: Omit<Projecte, "id">) => void;
  updateProjecte: (p: Projecte) => void;
  deleteProjecte: (id: string) => void;
  addPartida: (p: { codi: string; nom: string }, comentaris?: string) => void;
  updatePartida: (p: Partida, comentaris?: string) => void;
  toggleBaixaPartida: (id: string, comentaris?: string) => void;
  addEquivalencia: (eq: Equivalencia) => void;
  updateEquivalencia: (eq: Equivalencia) => void;
  deleteEquivalencia: (compte: string) => void;
  assignPartidaToCompte: (compte: string, partidaId: string) => void;
  addManualLog: (titol: string, detall: string, comentaris?: string) => void;
  updateLogComentari: (logId: string, comentari: string) => void;
  deleteLogEntry: (logId: string) => void;
  exportToExcel: () => void;
  clearAllData: () => void;
  reloadSeedData: () => void;
}

// Despeses i imputacions es guarden per exercici; el catàleg és compartit entre exercicis.
const LEGACY_EXERCICI = 2026;
const LEGACY_KEYS = {
  DESPESES: "somllar_despeses_v1",
  IMPUTACIONS: "somllar_imputacions_v1",
};
const despesesKey = (exercici: number) => `somllar_despeses_${exercici}_v1`;
const imputacionsKey = (exercici: number) => `somllar_imputacions_${exercici}_v1`;

// Les dades anteriors a la separació per exercici sempre s'havien carregat com a 2026
function migrateLegacyExerciciKeys() {
  const pairs: [string, string][] = [
    [LEGACY_KEYS.DESPESES, despesesKey(LEGACY_EXERCICI)],
    [LEGACY_KEYS.IMPUTACIONS, imputacionsKey(LEGACY_EXERCICI)],
  ];
  for (const [legacyKey, newKey] of pairs) {
    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) continue;
    if (localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, legacy);
    }
    localStorage.removeItem(legacyKey);
  }
}

const STORAGE_KEYS = {
  PROJECTES: "somllar_projectes_v1",
  PARTIDES: "somllar_partides_v1",
  EQUIVALENCIES: "somllar_equivalencies_v1",
  HISTORIAL: "somllar_historial_v1",
};

// Identity of each item, used as Firestore document ID
const KEYS = {
  despeses: (d: Despesa) => d.id,
  imputacions: (i: Imputacio) => i.id,
  projectes: (p: Projecte) => p.id,
  partides: (p: Partida) => p.id,
  equivalencies: (e: Equivalencia) => e.compte,
  historial: (l: LogEntry) => l.id,
};

const readLocal = <T,>(key: string): T[] | null => {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : null;
};

const sortHistorial = (items: LogEntry[]) =>
  [...items].sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

function describeFirestoreError(e: any): string {
  if (e?.code === "permission-denied") {
    return "Firestore ha denegat l'accés (permission-denied). Revisa les regles de seguretat i que hagis iniciat sessió amb un compte autoritzat.";
  }
  if (e?.code === "unavailable") {
    return "No hi ha connexió amb Firestore. Els canvis es guarden en aquest navegador i s'enviaran quan torni la connexió.";
  }
  return `Error de sincronització amb Firestore: ${e?.message || e}`;
}

const JustificacionsContext = createContext<JustificacionsContextType | null>(null);

export function JustificacionsProvider({ children }: { children: React.ReactNode }) {
  const [despeses, setDespeses] = useState<Despesa[]>([]);
  const [imputacions, setImputacions] = useState<Imputacio[]>([]);
  const [projectes, setProjectes] = useState<Projecte[]>([]);
  const [partides, setPartides] = useState<Partida[]>([]);
  const [equivalencies, setEquivalencies] = useState<Equivalencia[]>([]);
  const [historial, setHistorial] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("checking");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeExercici, setActiveExercici] = useState<number>(2026);

  // Firestore writes only happen once the data is in the new format (schema v2)
  const cloudEnabled = cloudStatus === "synced";
  const cloudRef = useRef(false);
  cloudRef.current = cloudEnabled;

  const reportSyncError = (e: any) => {
    console.warn("Firestore:", e);
    setSyncError(describeFirestoreError(e));
  };

  // Initialize catalog and historial from localStorage (shared across exercicis)
  useEffect(() => {
    try {
      migrateLegacyExerciciKeys();

      const storedPartides = localStorage.getItem(STORAGE_KEYS.PARTIDES);
      if (storedPartides) {
        setPartides(JSON.parse(storedPartides));
      } else {
        setPartides(seedData.partidas as Partida[]);
        localStorage.setItem(STORAGE_KEYS.PARTIDES, JSON.stringify(seedData.partidas));
      }

      const storedEquivalencies = localStorage.getItem(STORAGE_KEYS.EQUIVALENCIES);
      if (storedEquivalencies) {
        setEquivalencies(JSON.parse(storedEquivalencies));
      } else {
        setEquivalencies(seedData.equivalencies as Equivalencia[]);
        localStorage.setItem(STORAGE_KEYS.EQUIVALENCIES, JSON.stringify(seedData.equivalencies));
      }

      const storedProjectes = localStorage.getItem(STORAGE_KEYS.PROJECTES);
      if (storedProjectes) {
        setProjectes(JSON.parse(storedProjectes));
      } else {
        setProjectes(seedData.projectes as Projecte[]);
        localStorage.setItem(STORAGE_KEYS.PROJECTES, JSON.stringify(seedData.projectes));
      }

      const storedHistorial = localStorage.getItem(STORAGE_KEYS.HISTORIAL);
      if (storedHistorial) {
        setHistorial(JSON.parse(storedHistorial));
      } else {
        const initialLog: LogEntry = {
          id: `log_init`,
          timestamp: new Date().toISOString(),
          tipus: "nota_manual",
          titol: "Sistema Inicialitzat",
          detall: "Catàleg carregat amb 49 partides directes, 323 equivalències de comptes i 44 projectes actius.",
          usuari: "Sistema Som Llar",
          comentaris: "Benvinguts al sistema de gestió i control de justificacions de Som Llar."
        };
        setHistorial([initialLog]);
        localStorage.setItem(STORAGE_KEYS.HISTORIAL, JSON.stringify([initialLog]));
      }
    } catch (e) {
      console.error("Error al carregar de localStorage:", e);
    }

    // Decide the sync mode. Without a Firebase session (mode proves) Firestore is never touched.
    if (!db || !auth?.currentUser) {
      setCloudStatus("local");
      return;
    }
    fetchSchemaVersion()
      .then(version => setCloudStatus(version >= SCHEMA_VERSION ? "synced" : "migration_pending"))
      .catch(e => {
        reportSyncError(e);
        setCloudStatus("error");
      });
  }, []);

  // Load the active exercici's despeses/imputacions from this browser
  useEffect(() => {
    try {
      migrateLegacyExerciciKeys();
      setDespeses(readLocal<Despesa>(despesesKey(activeExercici)) || []);
      setImputacions(readLocal<Imputacio>(imputacionsKey(activeExercici)) || []);
    } catch (e) {
      console.error("Error al carregar de localStorage:", e);
      setDespeses([]);
      setImputacions([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeExercici]);

  // Live sync of the catalog and historial (shared across exercicis)
  useEffect(() => {
    if (!cloudEnabled) return;
    const subscriptions = [
      subscribeBucket<Projecte>(BUCKETS.projectes, (items, fromCache) => {
        if (fromCache && items.length === 0) return;
        setProjectes(items);
        localStorage.setItem(STORAGE_KEYS.PROJECTES, JSON.stringify(items));
      }, reportSyncError),
      subscribeBucket<Partida>(BUCKETS.partides, (items, fromCache) => {
        if (fromCache && items.length === 0) return;
        setPartides(items);
        localStorage.setItem(STORAGE_KEYS.PARTIDES, JSON.stringify(items));
      }, reportSyncError),
      subscribeBucket<Equivalencia>(BUCKETS.equivalencies, (items, fromCache) => {
        if (fromCache && items.length === 0) return;
        setEquivalencies(items);
        localStorage.setItem(STORAGE_KEYS.EQUIVALENCIES, JSON.stringify(items));
      }, reportSyncError),
      subscribeBucket<LogEntry>(BUCKETS.historial, (items, fromCache) => {
        if (fromCache && items.length === 0) return;
        const sorted = sortHistorial(items);
        setHistorial(sorted);
        localStorage.setItem(STORAGE_KEYS.HISTORIAL, JSON.stringify(sorted));
      }, reportSyncError),
    ];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [cloudEnabled]);

  // Live sync of the active exercici. Unsubscribing on change discards late responses of the previous one.
  useEffect(() => {
    if (!cloudEnabled) return;
    const subscriptions = [
      subscribeBucket<Despesa>(BUCKETS.despeses(activeExercici), (items, fromCache) => {
        if (fromCache && items.length === 0) return;
        setDespeses(items);
        localStorage.setItem(despesesKey(activeExercici), JSON.stringify(items));
      }, reportSyncError),
      subscribeBucket<Imputacio>(BUCKETS.imputacions(activeExercici), (items, fromCache) => {
        if (fromCache && items.length === 0) return;
        setImputacions(items);
        localStorage.setItem(imputacionsKey(activeExercici), JSON.stringify(items));
      }, reportSyncError),
    ];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [cloudEnabled, activeExercici]);

  /**
   * Saves a new version of a list: whole list in localStorage, and in Firestore only the items
   * that differ from what this user was looking at (`base`). Items another user added or changed
   * in the meantime are left untouched.
   */
  const persistList = <T,>(
    base: T[],
    updated: T[],
    key: (item: T) => string,
    bucket: string,
    localKey: string,
    setter: (items: T[]) => void
  ) => {
    setter(updated);
    localStorage.setItem(localKey, JSON.stringify(updated));
    if (!cloudRef.current) return;
    const { upserts, deletes } = diffById(base, updated, key);
    if (upserts.length === 0 && deletes.length === 0) return;
    writeBucketChanges(bucket, upserts, deletes, key).catch(reportSyncError);
  };

  const persistDespeses = (updated: Despesa[]) =>
    persistList(despeses, updated, KEYS.despeses, BUCKETS.despeses(activeExercici), despesesKey(activeExercici), setDespeses);

  const persistImputacions = (updated: Imputacio[]) =>
    persistList(imputacions, updated, KEYS.imputacions, BUCKETS.imputacions(activeExercici), imputacionsKey(activeExercici), setImputacions);

  const persistProjectes = (updated: Projecte[]) =>
    persistList(projectes, updated, KEYS.projectes, BUCKETS.projectes, STORAGE_KEYS.PROJECTES, setProjectes);

  const persistPartides = (updated: Partida[]) =>
    persistList(partides, updated, KEYS.partides, BUCKETS.partides, STORAGE_KEYS.PARTIDES, setPartides);

  const persistEquivalencies = (updated: Equivalencia[]) =>
    persistList(equivalencies, updated, KEYS.equivalencies, BUCKETS.equivalencies, STORAGE_KEYS.EQUIVALENCIES, setEquivalencies);

  const persistHistorial = (updated: LogEntry[]) =>
    persistList(historial, updated, KEYS.historial, BUCKETS.historial, STORAGE_KEYS.HISTORIAL, setHistorial);

  // Helper to add log entry
  const recordLog = (
    tipus: LogEntry["tipus"],
    titol: string,
    detall: string,
    extra?: { despesa_id?: string; projecte_id?: string; comentaris?: string }
  ) => {
    const userEmail = auth?.currentUser?.email || "Usuari no autenticat (mode proves)";
    const newEntry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      tipus,
      titol,
      detall,
      usuari: userEmail,
      ...extra,
    };
    setHistorial(prev => {
      const updated = [newEntry, ...prev];
      localStorage.setItem(STORAGE_KEYS.HISTORIAL, JSON.stringify(updated));
      return updated;
    });
    if (cloudRef.current) {
      writeBucketChanges(BUCKETS.historial, [newEntry], [], KEYS.historial).catch(reportSyncError);
    }
  };

  // Migration from schema v1 (one Firestore document per list) to v2 (one document per item)
  const prepareMigration = async (): Promise<MigrationPlan> => {
    const legacy = await fetchLegacyBuckets();

    const exercicis = new Set<number>();
    for (const bucket of legacy.keys()) {
      const m = /^(?:despeses|imputacions)_(\d{4})$/.exec(bucket);
      if (m) exercicis.add(Number(m[1]));
    }
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^somllar_(?:despeses|imputacions)_(\d{4})_v1$/.exec(localStorage.key(i) || "");
      if (m) exercicis.add(Number(m[1]));
    }

    const plan: MigrationBucketPlan[] = [];
    const add = <T,>(
      bucket: string,
      label: string,
      local: T[] | null,
      key: (item: T) => string,
      preferLocal: boolean,
      fallback?: T[]
    ) => {
      const remote = (legacy.get(bucket) as T[] | undefined) || null;
      let items = preferLocal ? mergeForMigration(remote, local, key) : mergeForMigration(local, remote, key);
      if (items.length === 0 && fallback) items = fallback;
      const entry: MigrationBucketPlan = {
        bucket,
        label,
        remoteCount: remote?.length || 0,
        localCount: local?.length || 0,
        resultCount: items.length,
        preferencia: preferLocal ? "aquest navegador" : "núvol",
        items,
        key: key as (item: any) => string,
      };
      plan.push(entry);
      return entry;
    };

    // Catalog: the old cloud copy was shared and small, so it wins over this browser
    add<Projecte>(BUCKETS.projectes, "Projectes", readLocal(STORAGE_KEYS.PROJECTES), KEYS.projectes, false, seedData.projectes as Projecte[]);
    add<Partida>(BUCKETS.partides, "Partides", readLocal(STORAGE_KEYS.PARTIDES), KEYS.partides, false, seedData.partidas as Partida[]);
    add<Equivalencia>(BUCKETS.equivalencies, "Equivalències", readLocal(STORAGE_KEYS.EQUIVALENCIES), KEYS.equivalencies, false, seedData.equivalencies as Equivalencia[]);
    add<LogEntry>(BUCKETS.historial, "Historial", readLocal(STORAGE_KEYS.HISTORIAL), KEYS.historial, false);

    // Despeses didn't fit in one Firestore document (> 1 MiB), so this browser's copy wins
    for (const ex of Array.from(exercicis).sort()) {
      const imps = add<Imputacio>(BUCKETS.imputacions(ex), `Imputacions ${ex}`, readLocal(imputacionsKey(ex)), KEYS.imputacions, true);
      const desp = add<Despesa>(BUCKETS.despeses(ex), `Despeses ${ex}`, readLocal(despesesKey(ex)), KEYS.despeses, true);
      // Totals and state of each despesa must match its imputacions after the merge
      desp.items = recalcDespesesFromImputacions(desp.items as Despesa[], imps.items as Imputacio[]);
    }

    return { buckets: plan };
  };

  const runMigration = async (plan: MigrationPlan) => {
    if (!auth?.currentUser) {
      throw new Error("Cal haver iniciat sessió amb Google per migrar les dades.");
    }
    await writeMigration(
      plan.buckets.map(b => ({ bucket: b.bucket, items: b.items, key: b.key })),
      auth.currentUser.email || auth.currentUser.uid
    );
    setSyncError(null);
    setCloudStatus("synced");
  };

  // Import A3 File
  const importA3File = async (fileBuffer: ArrayBuffer, preferredSheet?: string): Promise<ImportSummary> => {
    const summary = parseA3Excel(fileBuffer, equivalencies, despeses, preferredSheet);

    // Merge new parsed despeses with existing
    const existingMap = new Map<string, Despesa>();
    despeses.forEach(d => existingMap.set(d.id, d));

    const updatedList: Despesa[] = [];
    const changedTotals = new Map<string, number>();
    for (const d of summary.despeses) {
      if (existingMap.has(d.id)) {
        const prev = existingMap.get(d.id)!;
        if (Math.abs(prev.total_factura - d.total_factura) > 0.01) {
          changedTotals.set(d.id, d.total_factura);
        }
        updatedList.push({
          ...d,
          // A partida assigned manually (or by account mapping) wins over the one resolved from A3
          partida_id: prev.partida_id && prev.partida_id !== "SENSE_CORRESPONDENCIA" ? prev.partida_id : d.partida_id,
          estat: prev.estat,
          percentatge_total: prev.percentatge_total,
          import_total: prev.import_total,
          modificat_a3: d.modificat_a3
        });
        existingMap.delete(d.id);
      } else {
        updatedList.push(d);
      }
    }

    for (const remaining of existingMap.values()) {
      updatedList.push(remaining);
    }

    // If A3 changed an invoice total, keep the percentages and recalculate the amounts
    if (changedTotals.size > 0) {
      const now = new Date().toISOString();
      const updatedImputacions = imputacions.map(imp => {
        const newTotal = changedTotals.get(imp.despesa_id);
        if (newTotal === undefined) return imp;
        return {
          ...imp,
          import: Math.round(((imp.percentatge / 100) * newTotal) * 100) / 100,
          data_actualitzacio: now
        };
      });
      for (let i = 0; i < updatedList.length; i++) {
        const d = updatedList[i];
        if (!changedTotals.has(d.id)) continue;
        const importTotal = updatedImputacions
          .filter(imp => imp.despesa_id === d.id)
          .reduce((acc, imp) => acc + imp.import, 0);
        updatedList[i] = { ...d, import_total: Math.round(importTotal * 100) / 100 };
      }
      persistImputacions(updatedImputacions);
    }

    persistDespeses(updatedList);

    // Record log
    recordLog(
      "importacio_a3",
      `Volcat d'Excel d'A3 Processat`,
      `S'han processat ${summary.totalFilesLlegides} línies d'apunts. ${summary.facturesNoves} factures noves, ${summary.facturesExistents} mantingudes, ${summary.facturesModificades} modificacions detectades a l'A3 (${changedTotals.size} amb el total canviat i els imports imputats recalculats) i ${summary.senseCorrespondencia} pendents de correspondència.`
    );

    return summary;
  };

  // Save / Update Imputacions for a single Despesa
  const saveImputacions = (
    despesaId: string,
    allocations: { projecte_id: string; percentatge: number; import: number; observacions?: string }[],
    comentariGlobal?: string
  ) => {
    const otherImputacions = imputacions.filter(imp => imp.despesa_id !== despesaId);

    const newImps: Imputacio[] = allocations
      .filter(a => a.percentatge > 0 || a.import > 0)
      .map(a => ({
        id: `${despesaId}_${a.projecte_id}`,
        despesa_id: despesaId,
        projecte_id: a.projecte_id,
        percentatge: a.percentatge,
        import: Math.round(a.import * 100) / 100,
        observacions: a.observacions || "",
        data_actualitzacio: new Date().toISOString()
      }));

    const updatedImputacions = [...otherImputacions, ...newImps];
    persistImputacions(updatedImputacions);

    const totalPercent = Math.round(newImps.reduce((acc, curr) => acc + curr.percentatge, 0) * 100) / 100;
    const totalImport = Math.round(newImps.reduce((acc, curr) => acc + curr.import, 0) * 100) / 100;

    let estat: Despesa["estat"] = 'pendent';
    if (totalPercent > 100.01) {
      estat = 'excedida';
    } else if (Math.abs(totalPercent - 100) <= 0.01) {
      estat = 'completada';
    } else if (totalPercent > 0) {
      estat = 'parcial';
    }

    const currentDespesa = despeses.find(d => d.id === despesaId);

    const updatedDespeses = despeses.map(d => {
      if (d.id === despesaId) {
        return {
          ...d,
          percentatge_total: totalPercent,
          import_total: totalImport,
          estat
        };
      }
      return d;
    });

    persistDespeses(updatedDespeses);

    // Record log
    const allocSummary = newImps.map(i => `${i.projecte_id} (${i.percentatge}%, ${i.import}€)`).join(", ") || "Sense projectes (0%)";
    recordLog(
      "imputacio",
      `Imputació de Factura: ${currentDespesa?.ndoc_a3 || despesaId}`,
      `Proveïdor: ${currentDespesa?.proveidor || "-"} | Total factura: ${currentDespesa?.total_factura.toFixed(2)}€ | Repartiment: ${allocSummary}`,
      { despesa_id: despesaId, comentaris: comentariGlobal }
    );
  };

  // Bulk Actions
  const bulkAssignPartida = (despesaIds: string[], partidaId: string, comentaris?: string) => {
    if (despesaIds.length === 0) return;
    const idSet = new Set(despesaIds);
    const updatedDespeses = despeses.map(d => {
      if (idSet.has(d.id)) {
        return {
          ...d,
          partida_id: partidaId
        };
      }
      return d;
    });

    persistDespeses(updatedDespeses);

    recordLog(
      "nota_manual",
      `Assignació Massiva de Partida: ${partidaId} (${despesaIds.length} factures)`,
      `S'ha assignat la partida ${partidaId} a ${despesaIds.length} factures seleccionades.`,
      { comentaris }
    );
  };

  const bulkImputar = (
    despesaIds: string[],
    allocations: { projecte_id: string; percentatge: number }[],
    comentaris?: string
  ) => {
    if (despesaIds.length === 0) return;
    const idSet = new Set(despesaIds);
    const validAllocations = allocations.filter(a => a.percentatge > 0);
    const totalPercent = Math.round(validAllocations.reduce((acc, curr) => acc + curr.percentatge, 0) * 100) / 100;

    let estat: Despesa["estat"] = 'pendent';
    if (totalPercent > 100.01) {
      estat = 'excedida';
    } else if (Math.abs(totalPercent - 100) <= 0.01) {
      estat = 'completada';
    } else if (totalPercent > 0) {
      estat = 'parcial';
    }

    const preservedImputacions = imputacions.filter(imp => !idSet.has(imp.despesa_id));
    const newImps: Imputacio[] = [];

    const updatedDespeses = despeses.map(d => {
      if (idSet.has(d.id)) {
        let totalImport = 0;
        for (const alloc of validAllocations) {
          const importAlloc = Math.round(((alloc.percentatge / 100) * d.total_factura) * 100) / 100;
          totalImport += importAlloc;
          newImps.push({
            id: `${d.id}_${alloc.projecte_id}`,
            despesa_id: d.id,
            projecte_id: alloc.projecte_id,
            percentatge: alloc.percentatge,
            import: importAlloc,
            observacions: comentaris || "",
            data_actualitzacio: new Date().toISOString()
          });
        }

        return {
          ...d,
          percentatge_total: totalPercent,
          import_total: Math.round(totalImport * 100) / 100,
          estat
        };
      }
      return d;
    });

    persistImputacions([...preservedImputacions, ...newImps]);
    persistDespeses(updatedDespeses);

    const allocDesc = validAllocations.map(a => `${a.projecte_id} (${a.percentatge}%)`).join(", ") || "Sense projectes (0%)";
    recordLog(
      "imputacio",
      `Imputació Massiva a Projectes (${despesaIds.length} factures)`,
      `Repartiment aplicat a ${despesaIds.length} factures: ${allocDesc}`,
      { comentaris }
    );
  };

  const bulkResetImputacions = (despesaIds: string[], comentaris?: string) => {
    if (despesaIds.length === 0) return;
    const idSet = new Set(despesaIds);
    const updatedImputacions = imputacions.filter(imp => !idSet.has(imp.despesa_id));
    persistImputacions(updatedImputacions);

    const updatedDespeses = despeses.map(d => {
      if (idSet.has(d.id)) {
        return {
          ...d,
          percentatge_total: 0,
          import_total: 0,
          estat: 'pendent' as const
        };
      }
      return d;
    });
    persistDespeses(updatedDespeses);

    recordLog(
      "imputacio",
      `Imputacions Reiniciades en Bloc (${despesaIds.length} factures)`,
      `S'han esborrat les imputacions prèvies de ${despesaIds.length} factures, deixant-les a 0% Pendent.`,
      { comentaris }
    );
  };

  const bulkDeleteDespeses = (despesaIds: string[], comentaris?: string) => {
    if (despesaIds.length === 0) return;
    const idSet = new Set(despesaIds);
    const updatedDespeses = despeses.filter(d => !idSet.has(d.id));
    const updatedImputacions = imputacions.filter(imp => !idSet.has(imp.despesa_id));

    persistDespeses(updatedDespeses);
    persistImputacions(updatedImputacions);

    recordLog(
      "nota_manual",
      `Factures Eliminades en Bloc (${despesaIds.length} factures)`,
      `S'han eliminat del sistema ${despesaIds.length} factures i les seves imputacions associades.`,
      { comentaris }
    );
  };

  // Assign Partida to Account & re-evaluate despeses
  const assignPartidaToCompte = (compte: string, partidaId: string) => {
    const existing = equivalencies.find(e => e.compte === compte);
    let updatedEqs: Equivalencia[];
    if (existing) {
      updatedEqs = equivalencies.map(e => e.compte === compte ? { ...e, partida_id: partidaId } : e);
    } else {
      updatedEqs = [...equivalencies, { compte, partida_id: partidaId, descripcio: "Assignat manualment" }];
    }
    persistEquivalencies(updatedEqs);

    const updatedDespeses = despeses.map(d => {
      if (d.compte_despesa === compte || (d.partida_id === "SENSE_CORRESPONDENCIA" && d.compte_despesa.includes(compte))) {
        return {
          ...d,
          partida_id: partidaId
        };
      }
      return d;
    });
    persistDespeses(updatedDespeses);

    recordLog(
      "equivalencia",
      `Mapeig de Compte: ${compte}`,
      `Assignat automàticament a la partida ${partidaId} per a totes les factures associades.`
    );
  };

  // Projects CRUD
  const addProjecte = (p: Omit<Projecte, "id">) => {
    const id = p.codi.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "_");
    const updated = [...projectes, { ...p, id, codi: id, actiu: true }];
    persistProjectes(updated);

    recordLog(
      "projecte",
      `Nou Projecte Creat: ${id}`,
      `Finançador: ${p.financador || "-"} | Àrea: ${p.area || "-"} | Període: ${p.dates_text}`,
      { projecte_id: id }
    );
  };

  const updateProjecte = (p: Projecte) => {
    const updated = projectes.map(item => item.id === p.id ? p : item);
    persistProjectes(updated);

    recordLog(
      "projecte",
      `Projecte Actualitzat: ${p.codi}`,
      `Finançador: ${p.financador || "-"} | Àrea: ${p.area || "-"} | Dates: ${p.dates_text} | Estat: ${p.actiu ? "Actiu" : "Tancat"}`,
      { projecte_id: p.id }
    );
  };

  const deleteProjecte = (id: string) => {
    const updated = projectes.map(item => item.id === id ? { ...item, actiu: false } : item);
    persistProjectes(updated);

    recordLog(
      "projecte",
      `Projecte Desactivat: ${id}`,
      `El projecte ha estat marcat com a tancat/inactiu.`
    );
  };

  // Partides CRUD
  const addPartida = (p: { codi: string; nom: string }, comentaris?: string) => {
    const rawCode = p.codi.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "_");
    const codi = rawCode.startsWith("DD_") ? rawCode : `DD_${rawCode}`;
    const id = codi;

    if (partides.some(item => item.id === id)) {
      alert(`La partida amb codi ${codi} ja existeix.`);
      return;
    }

    const novaPartida: Partida = {
      id,
      codi,
      nom: p.nom.trim() || codi,
      activa: true
    };

    const updated = [...partides, novaPartida];
    persistPartides(updated);

    recordLog(
      "partida",
      `Nova Partida Creada: ${codi}`,
      `Nom: ${novaPartida.nom} | Estat: Activa`,
      { comentaris }
    );
  };

  const updatePartida = (p: Partida, comentaris?: string) => {
    const updated = partides.map(item => item.id === p.id ? { ...item, nom: p.nom.trim(), activa: p.activa !== false } : item);
    persistPartides(updated);

    recordLog(
      "partida",
      `Partida Modificada: ${p.codi}`,
      `Nom: ${p.nom.trim()} | Estat: ${p.activa !== false ? "Activa" : "Donada de Baixa"}`,
      { comentaris }
    );
  };

  const toggleBaixaPartida = (id: string, comentaris?: string) => {
    const target = partides.find(item => item.id === id);
    if (!target) return;

    const novaActiva = target.activa === false ? true : false;
    const estatText = novaActiva ? "Reactivada / Donada d'Alta" : "Donada de Baixa (Arxivada)";

    const updated = partides.map(item => item.id === id ? { ...item, activa: novaActiva } : item);
    persistPartides(updated);

    recordLog(
      "partida",
      `Partida ${novaActiva ? "Reactivada" : "Donada de Baixa"}: ${target.codi}`,
      `La partida ha passat a estar: ${estatText}. Totes les imputacions històriques es mantenen intactes.`,
      { comentaris }
    );
  };

  // Equivalencies CRUD
  const addEquivalencia = (eq: Equivalencia) => {
    const updated = [...equivalencies, eq];
    persistEquivalencies(updated);

    recordLog(
      "equivalencia",
      `Equivalència Creada: ${eq.compte}`,
      `Compte ${eq.compte} (${eq.descripcio || "-"}) vinculat a la partida ${eq.partida_id}`
    );
  };

  const updateEquivalencia = (eq: Equivalencia) => {
    const updated = equivalencies.map(e => e.compte === eq.compte ? eq : e);
    persistEquivalencies(updated);

    recordLog(
      "equivalencia",
      `Equivalència Modificada: ${eq.compte}`,
      `Compte ${eq.compte} reassignat a la partida ${eq.partida_id}`
    );
  };

  const deleteEquivalencia = (compte: string) => {
    const updated = equivalencies.filter(e => e.compte !== compte);
    persistEquivalencies(updated);

    recordLog(
      "equivalencia",
      `Equivalència Eliminada: ${compte}`,
      `S'ha eliminat la correspondència per al compte ${compte}`
    );
  };

  // Manual Log Entry & Comment update
  const addManualLog = (titol: string, detall: string, comentaris?: string) => {
    recordLog("nota_manual", titol, detall, { comentaris });
  };

  const updateLogComentari = (logId: string, comentari: string) => {
    const updated = historial.map(item => item.id === logId ? { ...item, comentaris: comentari } : item);
    persistHistorial(updated);
  };

  const deleteLogEntry = (logId: string) => {
    const updated = historial.filter(item => item.id !== logId);
    persistHistorial(updated);
  };

  // Export to Excel
  const exportToExcel = () => {
    const buffer = exportJustificacionsExcel(despeses, imputacions, projectes, partides, activeExercici);
    const blob = new Blob([buffer as any], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Justificacions_SomLlar_${activeExercici}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearAllData = () => {
    persistDespeses([]);
    persistImputacions([]);
    recordLog("nota_manual", "Dades de Despeses Reiniciades", "S'han buidat les despeses i les imputacions carregades.");
  };

  const reloadSeedData = () => {
    persistPartides(seedData.partidas as Partida[]);
    persistEquivalencies(seedData.equivalencies as Equivalencia[]);
    persistProjectes(seedData.projectes as Projecte[]);
    recordLog("nota_manual", "Catàleg Restaurat", "S'han restaurat les 49 partides, 323 equivalències i 44 projectes originals.");
  };

  return (
    <JustificacionsContext.Provider
      value={{
        despeses,
        imputacions,
        projectes,
        partides,
        equivalencies,
        historial,
        isLoading,
        isCloudSynced: cloudEnabled,
        cloudStatus,
        syncError,
        clearSyncError: () => setSyncError(null),
        prepareMigration,
        runMigration,
        activeExercici,
        setActiveExercici,
        importA3File,
        saveImputacions,
        addProjecte,
        updateProjecte,
        deleteProjecte,
        addPartida,
        updatePartida,
        toggleBaixaPartida,
        addEquivalencia,
        updateEquivalencia,
        deleteEquivalencia,
        assignPartidaToCompte,
        bulkAssignPartida,
        bulkImputar,
        bulkResetImputacions,
        bulkDeleteDespeses,
        addManualLog,
        updateLogComentari,
        deleteLogEntry,
        exportToExcel,
        clearAllData,
        reloadSeedData,
      }}
    >
      {children}
    </JustificacionsContext.Provider>
  );
}

export function useJustificacions() {
  const context = useContext(JustificacionsContext);
  if (!context) {
    throw new Error("useJustificacions ha de ser utilitzat dins de JustificacionsProvider");
  }
  return context;
}
