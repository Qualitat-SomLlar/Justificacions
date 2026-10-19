"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Despesa, Imputacio, Projecte, Partida, Equivalencia, ImportSummary, LogEntry } from "./types";
import { parseA3Excel, cleanStr } from "./parser";
import { exportJustificacionsExcel } from "./exporter";
import seedData from "./seed_data.json";
import { auth, db } from "./firebase";
import { useAuth } from "./auth";
import {
  BUCKETS,
  BucketChanges,
  SCHEMA_VERSION,
  acquireMigrationLock,
  fetchSchemaMeta,
  fetchV1Buckets,
  fetchV2Buckets,
  subscribeBucket,
  subscribeSchemaMeta,
  writeChanges,
  writeMigration
} from "./firestore_sync";
import {
  countMissing,
  diffItems,
  estatFromPercent,
  hasChanges,
  percentCents,
  pickMigrationSource
} from "./sync_utils";

/**
 * - checking: waiting for the Firebase session and the schema version
 * - local: no Firebase session (e.g. mode proves); data only in this browser
 * - migration_pending: Firestore still has an older format; data only in this browser until migrated
 * - synced: live sync with Firestore
 * - error: Firestore couldn't be reached; data only in this browser
 */
export type CloudStatus = "checking" | "local" | "migration_pending" | "synced" | "error";

export interface MigrationBucketPlan {
  bucket: string;
  label: string;
  remoteCount: number;
  localCount: number;
  resultCount: number;
  /** Items present only in the copy that is not used (they won't be migrated) */
  descartats: number;
  preferencia: "núvol" | "aquest navegador" | "cap" | "unió";
  items: any[];
  key: (item: any) => string;
}

export interface MigrationPlan {
  fromVersion: number;
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
  addProjecte: (p: Omit<Projecte, "id">) => boolean;
  updateProjecte: (p: Projecte) => void;
  deleteProjecte: (id: string) => void;
  setProjecteActiu: (id: string, actiu: boolean) => void;
  addPartida: (p: { codi: string; nom: string }, comentaris?: string) => boolean;
  updatePartida: (p: Partida, comentaris?: string) => void;
  /** `activa`: the state the user asked for (instead of toggling a possibly stale one) */
  toggleBaixaPartida: (id: string, comentaris?: string, activa?: boolean) => void;
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

/** A despesa as stored: estat / percentatge_total / import_total are computed from the imputacions. */
type StoredDespesa = Omit<Despesa, "estat" | "percentatge_total" | "import_total">;

const stripDerived = (d: Despesa | StoredDespesa): StoredDespesa => {
  const { estat, percentatge_total, import_total, ...rest } = d as Despesa;
  void estat; void percentatge_total; void import_total;
  return rest;
};

// Despeses i imputacions es guarden per exercici; el catàleg és compartit entre exercicis.
const LEGACY_EXERCICI = 2026;
const LEGACY_KEYS = {
  DESPESES: "somllar_despeses_v1",
  IMPUTACIONS: "somllar_imputacions_v1",
};
const despesesKey = (exercici: number) => `somllar_despeses_${exercici}_v1`;
const imputacionsKey = (exercici: number) => `somllar_imputacions_${exercici}_v1`;

const STORAGE_KEYS = {
  PROJECTES: "somllar_projectes_v1",
  PARTIDES: "somllar_partides_v1",
  EQUIVALENCIES: "somllar_equivalencies_v1",
  HISTORIAL: "somllar_historial_v1",
};

/** localStorage can be full (~5 MB) or blocked: never let that break an action. */
let storageWarned = false;
function safeSetItem(key: string, value: unknown, onFull?: (msg: string) => void) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage:", e);
    if (!storageWarned && onFull) {
      storageWarned = true;
      onFull("L'emmagatzematge local del navegador és ple o no està disponible: els canvis d'aquesta sessió podrien no conservar-se en aquest navegador.");
    }
  }
}

/** Reads a list from localStorage; corrupt or non-array values are ignored (and kept aside). */
function readLocal<T>(key: string): T[] | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
    throw new Error("not an array");
  } catch (e) {
    console.warn(`localStorage: valor no vàlid a ${key}`, e);
    try {
      if (raw !== null) localStorage.setItem(`${key}_corrupte`, raw);
    } catch { /* ignore */ }
    return null;
  }
}

// Les dades anteriors a la separació per exercici sempre s'havien carregat com a 2026
function migrateLegacyExerciciKeys() {
  try {
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
  } catch (e) {
    console.warn("localStorage:", e);
  }
}

// Identity of each item
const KEYS = {
  despeses: (d: { id: string }) => d.id,
  imputacions: (i: Imputacio) => i.id,
  projectes: (p: Projecte) => p.id,
  partides: (p: Partida) => p.id,
  equivalencies: (e: Equivalencia) => e.compte,
  historial: (l: LogEntry) => l.id,
};

// Complete items only (see subscribeBucket)
const isText = (v: unknown) => typeof v === "string" && v !== "";
const VALID = {
  despeses: (d: any) => isText(d.id) && typeof d.total_factura === "number",
  imputacions: (i: any) => isText(i.id) && isText(i.despesa_id) && isText(i.projecte_id) && typeof i.percentatge === "number",
  projectes: (p: any) => isText(p.id) && isText(p.codi),
  partides: (p: any) => isText(p.id) && isText(p.codi),
  equivalencies: (e: any) => isText(e.compte),
  historial: (l: any) => isText(l.id) && isText(l.timestamp) && isText(l.titol),
};

const sortHistorial = (items: LogEntry[]) =>
  [...items].sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

function describeFirestoreError(e: any): string {
  if (e?.code === "permission-denied") {
    return "Firestore ha denegat l'accés (permission-denied). Revisa les regles de seguretat i que hagis iniciat sessió amb un compte autoritzat.";
  }
  if (e?.code === "resource-exhausted") {
    return "S'ha superat la quota diària de Firestore (pla gratuït). Torna-ho a provar demà o amplia el pla.";
  }
  if (e?.code === "unavailable") {
    return "No hi ha connexió amb Firestore.";
  }
  return `Error de sincronització amb Firestore: ${e?.message || e}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

const JustificacionsContext = createContext<JustificacionsContextType | null>(null);

export function JustificacionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [storedDespeses, setStoredDespeses] = useState<StoredDespesa[]>([]);
  const [imputacions, setImputacions] = useState<Imputacio[]>([]);
  const [projectes, setProjectes] = useState<Projecte[]>([]);
  const [partides, setPartides] = useState<Partida[]>([]);
  const [equivalencies, setEquivalencies] = useState<Equivalencia[]>([]);
  const [historial, setHistorial] = useState<LogEntry[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  // Exercici whose despeses/imputacions are in memory (null while loading)
  const [loadedExercici, setLoadedExercici] = useState<number | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("checking");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeExercici, setActiveExercici] = useState<number>(2026);

  // Firestore writes only happen once the data is in the current format
  const cloudEnabled = cloudStatus === "synced";
  const cloudRef = useRef(false);
  cloudRef.current = cloudEnabled;
  const wasSyncedRef = useRef(false);
  if (cloudEnabled) wasSyncedRef.current = true;
  // Without the cloud (old format pending migration, or Firestore failing) any change would be
  // lost when the sync comes back: the app is read-only. Only the local mode (no Firebase) edits.
  const readOnly = cloudStatus === "migration_pending" || cloudStatus === "error";
  const readOnlyRef = useRef(false);
  readOnlyRef.current = readOnly;
  const lastReadOnlyAlert = useRef(0);
  const refuseIfReadOnly = (): boolean => {
    if (!readOnlyRef.current) return false;
    if (Date.now() - lastReadOnlyAlert.current > 1500) {
      lastReadOnlyAlert.current = Date.now();
      alert(
        cloudStatus === "migration_pending"
          ? "Les dades del núvol encara tenen el format antic: cal fer la migració («Revisar i migrar») abans de poder fer canvis."
          : "No hi ha connexió amb el núvol: l'aplicació és només de consulta fins que es resolgui. Recarrega la pàgina."
      );
    }
    return true;
  };

  const historialRef = useRef<LogEntry[]>([]);
  historialRef.current = historial;

  const reportSyncError = (e: any) => {
    console.warn("Firestore:", e);
    setSyncError(describeFirestoreError(e));
  };
  const warnStorage = (msg: string) => setSyncError(msg);
  // A listener refused by Firestore (permissions, quota): fall back to this browser's data
  const listenerFailed = (e: any) => {
    reportSyncError(e);
    setCloudStatus("error");
  };

  // Despeses with estat / percentatge_total / import_total computed from the imputacions.
  // `storedOf` maps each computed despesa back to its stored object (to detect unchanged items).
  const { despeses, storedOf } = useMemo(() => {
    const totals = new Map<string, { pct: number; imp: number }>();
    for (const imp of imputacions) {
      const t = totals.get(imp.despesa_id) || { pct: 0, imp: 0 };
      t.pct += imp.percentatge || 0;
      t.imp += imp.import || 0;
      totals.set(imp.despesa_id, t);
    }
    const back = new WeakMap<Despesa, StoredDespesa>();
    const view = storedDespeses.map(sd => {
      const t = totals.get(sd.id);
      const pct = t ? round2(t.pct) : 0;
      const d: Despesa = { ...sd, percentatge_total: pct, import_total: t ? round2(t.imp) : 0, estat: estatFromPercent(pct) };
      back.set(d, sd);
      return d;
    });
    return { despeses: view, storedOf: back };
  }, [storedDespeses, imputacions]);

  // 1. Catalog and historial from this browser (shared across exercicis)
  useEffect(() => {
    migrateLegacyExerciciKeys();
    setPartides(readLocal<Partida>(STORAGE_KEYS.PARTIDES) || (seedData.partidas as Partida[]));
    setEquivalencies(readLocal<Equivalencia>(STORAGE_KEYS.EQUIVALENCIES) || (seedData.equivalencies as Equivalencia[]));
    setProjectes(readLocal<Projecte>(STORAGE_KEYS.PROJECTES) || (seedData.projectes as Projecte[]));
    const storedHistorial = readLocal<LogEntry>(STORAGE_KEYS.HISTORIAL);
    if (storedHistorial) {
      setHistorial(storedHistorial);
    } else {
      setHistorial([{
        id: `log_init`,
        timestamp: new Date().toISOString(),
        tipus: "nota_manual",
        titol: "Sistema Inicialitzat",
        detall: `Catàleg carregat amb ${seedData.partidas.length} partides, ${seedData.equivalencies.length} equivalències de comptes i ${seedData.projectes.length} projectes.`,
        usuari: "Sistema Som Llar",
        comentaris: "Benvinguts al sistema de gestió i control de justificacions de Som Llar."
      }]);
    }
    setCatalogLoaded(true);
  }, []);

  // 2. Sync mode: decided once Firebase has restored (or not) the session. Mode proves never
  // touches Firestore, even if the browser also has a real Firebase session.
  useEffect(() => {
    let cancelled = false;
    const isDemo = !user || user.providerId === "demo";
    if (!db || !auth || isDemo) {
      setCloudStatus("local");
      return;
    }
    (async () => {
      try {
        await auth.authStateReady();
        if (cancelled) return;
        if (!auth.currentUser) {
          setCloudStatus("local");
          return;
        }
        const meta = await fetchSchemaMeta();
        if (cancelled) return;
        setCloudStatus(meta.version >= SCHEMA_VERSION ? "synced" : "migration_pending");
      } catch (e) {
        if (cancelled) return;
        reportSyncError(e);
        setCloudStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // While the migration is pending, switch to live sync as soon as someone completes it
  useEffect(() => {
    if (cloudStatus !== "migration_pending") return;
    return subscribeSchemaMeta(meta => {
      if (meta.version >= SCHEMA_VERSION) setCloudStatus("synced");
    }, reportSyncError);
  }, [cloudStatus]);

  // 3a. Local modes: despeses/imputacions of the active exercici from this browser
  useEffect(() => {
    if (cloudStatus === "checking" || cloudStatus === "synced") return;
    // After a cloud session failed, the last cloud data stays (the local copy is older)
    if (wasSyncedRef.current && loadedExercici === activeExercici) return;
    migrateLegacyExerciciKeys();
    setStoredDespeses((readLocal<Despesa>(despesesKey(activeExercici)) || []).map(stripDerived));
    setImputacions(readLocal<Imputacio>(imputacionsKey(activeExercici)) || []);
    setLoadedExercici(activeExercici);
  }, [activeExercici, cloudStatus]);

  // 3b. Live sync of the catalog and historial
  useEffect(() => {
    if (!cloudEnabled) return;
    const subscriptions = [
      subscribeBucket<Projecte>(BUCKETS.projectes, VALID.projectes, (items) => {
        setProjectes(items);
        safeSetItem(STORAGE_KEYS.PROJECTES, items);
      }, listenerFailed),
      subscribeBucket<Partida>(BUCKETS.partides, VALID.partides, (items) => {
        setPartides(items);
        safeSetItem(STORAGE_KEYS.PARTIDES, items);
      }, listenerFailed),
      subscribeBucket<Equivalencia>(BUCKETS.equivalencies, VALID.equivalencies, (items) => {
        setEquivalencies(items);
        safeSetItem(STORAGE_KEYS.EQUIVALENCIES, items);
      }, listenerFailed),
      // The historial lives in the Firestore cache (IndexedDB), not in localStorage
      subscribeBucket<LogEntry>(BUCKETS.historial, VALID.historial, (items) => setHistorial(sortHistorial(items)), listenerFailed),
    ];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [cloudEnabled]);

  // 3c. Live sync of the active exercici. Unsubscribing on change discards the previous one.
  useEffect(() => {
    if (!cloudEnabled) return;
    setLoadedExercici(null);
    // "server": data confirmed by the server; "cache": only the browser cache so far
    let despesesFrom: "none" | "cache" | "server" = "none";
    let imputacionsFrom: "none" | "cache" | "server" = "none";
    let acceptCache = false;
    const markLoaded = () => {
      const ready = (from: string) => from === "server" || (acceptCache && from === "cache");
      if (ready(despesesFrom) && ready(imputacionsFrom)) setLoadedExercici(activeExercici);
    };
    // Offline: after a few seconds work with the cached data (changes are queued and sent later)
    const offlineTimer = setTimeout(() => {
      acceptCache = true;
      markLoaded();
    }, 8000);
    const subscriptions = [
      subscribeBucket<Despesa>(BUCKETS.despeses(activeExercici), VALID.despeses, (items, fromCache) => {
        setStoredDespeses(items.map(stripDerived));
        if (despesesFrom !== "server") despesesFrom = fromCache ? "cache" : "server";
        markLoaded();
      }, listenerFailed),
      subscribeBucket<Imputacio>(BUCKETS.imputacions(activeExercici), VALID.imputacions, (items, fromCache) => {
        setImputacions(items);
        if (imputacionsFrom !== "server") imputacionsFrom = fromCache ? "cache" : "server";
        markLoaded();
      }, listenerFailed),
    ];
    return () => {
      clearTimeout(offlineTimer);
      subscriptions.forEach(unsubscribe => unsubscribe());
    };
  }, [cloudEnabled, activeExercici]);

  // Nothing is shown (and no action can run) until the data of the active exercici is loaded:
  // acting on stale data would overwrite newer changes.
  const isLoading = !catalogLoaded || cloudStatus === "checking" || loadedExercici !== activeExercici;

  /**
   * Saves new versions of one or more lists in a single step: state, localStorage (only when
   * there's no cloud sync) and, in Firestore, only the items/fields that differ from what this
   * user was looking at. Items another user added or changed in the meantime are left untouched.
   */
  const commit = (next: {
    despeses?: Despesa[];
    imputacions?: Imputacio[];
    projectes?: Projecte[];
    partides?: Partida[];
    equivalencies?: Equivalencia[];
  }) => {
    if (refuseIfReadOnly()) return;
    const changes: BucketChanges[] = [];
    const local = !cloudRef.current;

    if (next.despeses) {
      const updated = next.despeses.map(d => storedOf.get(d) ?? stripDerived(d));
      changes.push({ bucket: BUCKETS.despeses(activeExercici), changes: diffItems(storedDespeses, updated, KEYS.despeses), key: KEYS.despeses });
      setStoredDespeses(updated);
      if (local) safeSetItem(despesesKey(activeExercici), updated, warnStorage);
    }
    if (next.imputacions) {
      changes.push({ bucket: BUCKETS.imputacions(activeExercici), changes: diffItems(imputacions, next.imputacions, KEYS.imputacions), key: KEYS.imputacions });
      setImputacions(next.imputacions);
      if (local) safeSetItem(imputacionsKey(activeExercici), next.imputacions, warnStorage);
    }
    if (next.projectes) {
      changes.push({ bucket: BUCKETS.projectes, changes: diffItems(projectes, next.projectes, KEYS.projectes), key: KEYS.projectes });
      setProjectes(next.projectes);
      safeSetItem(STORAGE_KEYS.PROJECTES, next.projectes, warnStorage);
    }
    if (next.partides) {
      changes.push({ bucket: BUCKETS.partides, changes: diffItems(partides, next.partides, KEYS.partides), key: KEYS.partides });
      setPartides(next.partides);
      safeSetItem(STORAGE_KEYS.PARTIDES, next.partides, warnStorage);
    }
    if (next.equivalencies) {
      changes.push({ bucket: BUCKETS.equivalencies, changes: diffItems(equivalencies, next.equivalencies, KEYS.equivalencies), key: KEYS.equivalencies });
      setEquivalencies(next.equivalencies);
      safeSetItem(STORAGE_KEYS.EQUIVALENCIES, next.equivalencies, warnStorage);
    }

    if (local) return;
    const pending = changes.filter(c => hasChanges(c.changes));
    if (pending.length > 0) writeChanges(pending).catch(reportSyncError);
  };

  const currentUserEmail = () => auth?.currentUser?.email || "Usuari no autenticat (mode proves)";

  // Historial entries are only added (or removed one by one): written individually
  const commitHistorial = (updated: LogEntry[]) => {
    if (refuseIfReadOnly()) return;
    const base = historialRef.current;
    historialRef.current = updated;
    setHistorial(updated);
    if (!cloudRef.current) {
      safeSetItem(STORAGE_KEYS.HISTORIAL, updated, warnStorage);
      return;
    }
    const changes = diffItems(base, updated, KEYS.historial);
    if (hasChanges(changes)) {
      writeChanges([{ bucket: BUCKETS.historial, changes, key: KEYS.historial }]).catch(reportSyncError);
    }
  };

  const recordLog = (
    tipus: LogEntry["tipus"],
    titol: string,
    detall: string,
    extra?: { despesa_id?: string; projecte_id?: string; comentaris?: string }
  ) => {
    const newEntry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      tipus,
      titol,
      detall,
      usuari: currentUserEmail(),
      ...extra,
    };
    commitHistorial([newEntry, ...historialRef.current]);
  };

  // Migration from schema v1 (one document per list) or v2 (one document per item) to v3
  const prepareMigration = async (): Promise<MigrationPlan> => {
    const meta = await fetchSchemaMeta();
    if (meta.version >= SCHEMA_VERSION) {
      throw new Error("Les dades ja estan migrades al format actual. Recarrega la pàgina.");
    }
    const v1 = await fetchV1Buckets();
    const v2 = meta.version === 2 ? await fetchV2Buckets(meta.buckets) : new Map<string, any[]>();
    // In v2 the per-item collections were the live copy (even if emptied on purpose)
    const remoteOf = <T,>(bucket: string): T[] | null => {
      if (v2.has(bucket)) return v2.get(bucket) as T[];
      return (v1.get(bucket) as T[] | undefined) || null;
    };

    const exercicis = new Set<number>();
    for (const bucket of [...v1.keys(), ...v2.keys()]) {
      const m = /^(?:despeses|imputacions)_(\d{4})$/.exec(bucket);
      if (m) exercicis.add(Number(m[1]));
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const m = /^somllar_(?:despeses|imputacions)_(\d{4})_v1$/.exec(localStorage.key(i) || "");
        if (m) exercicis.add(Number(m[1]));
      }
    } catch { /* localStorage unavailable */ }

    const plan: MigrationBucketPlan[] = [];
    /** One copy, never a union (a union would bring back items deleted in the other copy). */
    const pick = <T,>(bucket: string, label: string, local: T[] | null, key: (item: T) => string, preferRemote: boolean, fallback?: T[]) => {
      const remote = remoteOf<T>(bucket);
      // pickMigrationSource prefers its second argument
      const chosen = preferRemote ? pickMigrationSource(local, remote) : pickMigrationSource(remote, local);
      let items = chosen.items;
      const fromRemote = items === remote;
      let preferencia: MigrationBucketPlan["preferencia"] = items.length === 0 ? "cap" : fromRemote ? "núvol" : "aquest navegador";
      if (items.length === 0 && fallback) {
        items = fallback;
        preferencia = "cap";
      }
      const other = fromRemote ? local : remote;
      const entry: MigrationBucketPlan = {
        bucket,
        label,
        remoteCount: remote?.length || 0,
        localCount: local?.length || 0,
        resultCount: items.length,
        descartats: countMissing(items, other, key),
        preferencia,
        items,
        key: key as (item: any) => string,
      };
      plan.push(entry);
      return entry;
    };

    // Catalog: the cloud copy was the shared one
    pick<Projecte>(BUCKETS.projectes, "Projectes", readLocal(STORAGE_KEYS.PROJECTES), KEYS.projectes, true, seedData.projectes as Projecte[]);
    pick<Partida>(BUCKETS.partides, "Partides", readLocal(STORAGE_KEYS.PARTIDES), KEYS.partides, true, seedData.partidas as Partida[]);
    pick<Equivalencia>(BUCKETS.equivalencies, "Equivalències", readLocal(STORAGE_KEYS.EQUIVALENCIES), KEYS.equivalencies, true, seedData.equivalencies as Equivalencia[]);

    // Historial only grows: the union of both copies loses nothing
    const remoteHist = remoteOf<LogEntry>(BUCKETS.historial) || [];
    const localHist = readLocal<LogEntry>(STORAGE_KEYS.HISTORIAL) || [];
    const histMap = new Map<string, LogEntry>();
    [...remoteHist, ...localHist].forEach(l => histMap.set(l.id, l));
    plan.push({
      bucket: BUCKETS.historial,
      label: "Historial",
      remoteCount: remoteHist.length,
      localCount: localHist.length,
      resultCount: histMap.size,
      descartats: 0,
      preferencia: "unió",
      items: Array.from(histMap.values()),
      key: KEYS.historial as (item: any) => string,
    });

    // Despeses: v1 never managed to store them (> 1 MiB), so with v1 this browser's copy is used;
    // with v2 the cloud was the live copy.
    const remoteFirst = meta.version === 2;
    for (const ex of Array.from(exercicis).sort()) {
      const desp = pick<Despesa>(BUCKETS.despeses(ex), `Despeses ${ex}`, readLocal(despesesKey(ex)), KEYS.despeses, remoteFirst);
      desp.items = (desp.items as Despesa[]).map(stripDerived);
      const imps = pick<Imputacio>(BUCKETS.imputacions(ex), `Imputacions ${ex}`, readLocal(imputacionsKey(ex)), KEYS.imputacions, remoteFirst);
      // Imputacions of despeses that don't exist are not migrated
      const ids = new Set((desp.items as StoredDespesa[]).map(d => d.id));
      const valid = (imps.items as Imputacio[]).filter(i => ids.has(i.despesa_id));
      imps.descartats += imps.items.length - valid.length;
      imps.items = valid;
      imps.resultCount = valid.length;
    }

    return { fromVersion: meta.version, buckets: plan };
  };

  const runMigration = async (plan: MigrationPlan) => {
    if (!auth?.currentUser) {
      throw new Error("Cal haver iniciat sessió amb Google per migrar les dades.");
    }
    // Someone may have migrated in the meantime (e.g. from another tab)
    const meta = await fetchSchemaMeta();
    if (meta.version >= SCHEMA_VERSION) {
      setCloudStatus("synced");
      throw new Error("Una altra persona ja ha completat la migració. Ara es mostren les dades del núvol.");
    }
    if (meta.version !== plan.fromVersion) {
      throw new Error("Les dades del núvol han canviat des que es va preparar la migració. Torna-la a preparar.");
    }
    const migrator = auth.currentUser.email || auth.currentUser.uid;
    await acquireMigrationLock(migrator);
    await writeMigration(
      plan.buckets.map(b => ({ bucket: b.bucket, items: b.items, key: b.key })),
      migrator,
      plan.fromVersion
    );
    setSyncError(null);
    setCloudStatus("synced");
  };

  // Import A3 File
  const importA3File = async (fileBuffer: ArrayBuffer, preferredSheet?: string): Promise<ImportSummary> => {
    if (readOnlyRef.current) {
      throw new Error(
        cloudStatus === "migration_pending"
          ? "Cal fer la migració de les dades («Revisar i migrar») abans de poder importar."
          : "No hi ha connexió amb el núvol: no es pot importar fins que es resolgui."
      );
    }
    const summary = parseA3Excel(fileBuffer, equivalencies, despeses, preferredSheet);

    // Merge new parsed despeses with existing
    const existingMap = new Map<string, Despesa>();
    despeses.forEach(d => existingMap.set(d.id, d));

    const updatedList: Despesa[] = [];
    const changedTotals = new Map<string, number>();
    for (const d of summary.despeses) {
      const prev = existingMap.get(d.id);
      if (prev) {
        if (Math.abs(prev.total_factura - d.total_factura) > 0.005) {
          changedTotals.set(d.id, d.total_factura);
        }
        updatedList.push({
          ...d,
          // A partida assigned manually (or by account mapping) wins over the one resolved from A3
          partida_id: prev.partida_id && prev.partida_id !== "SENSE_CORRESPONDENCIA" ? prev.partida_id : d.partida_id,
          // The A3 change warning stays until someone reviews the imputation
          modificat_a3: Boolean(prev.modificat_a3 || d.modificat_a3),
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
    let updatedImputacions: Imputacio[] | undefined;
    if (changedTotals.size > 0) {
      const now = new Date().toISOString();
      updatedImputacions = imputacions.map(imp => {
        const newTotal = changedTotals.get(imp.despesa_id);
        if (newTotal === undefined) return imp;
        return {
          ...imp,
          import: round2((imp.percentatge / 100) * newTotal),
          data_actualitzacio: now
        };
      });
      // Invoices imputed at exactly 100%: the last imputacio takes the remainder (to the cent)
      const byDespesa = new Map<string, number[]>();
      updatedImputacions.forEach((imp, i) => {
        if (!changedTotals.has(imp.despesa_id)) return;
        byDespesa.set(imp.despesa_id, [...(byDespesa.get(imp.despesa_id) || []), i]);
      });
      for (const [despesaId, idxs] of byDespesa.entries()) {
        const pct = round2(idxs.reduce((acc, i) => acc + updatedImputacions![i].percentatge, 0));
        if (percentCents(pct) !== 10000) continue;
        const lastIdx = idxs[idxs.length - 1];
        const others = idxs.slice(0, -1).reduce((acc, i) => acc + updatedImputacions![i].import, 0);
        updatedImputacions[lastIdx] = { ...updatedImputacions[lastIdx], import: round2(changedTotals.get(despesaId)! - others) };
      }
    }

    commit({ despeses: updatedList, imputacions: updatedImputacions });

    const altresExercicis = summary.despeses.filter(d => d.any_fiscal !== activeExercici).length;
    recordLog(
      "importacio_a3",
      `Volcat d'Excel d'A3 Processat (exercici ${activeExercici})`,
      `S'han processat ${summary.totalFilesLlegides} línies d'apunts. ${summary.facturesNoves} factures noves, ${summary.facturesExistents} ja existents (${summary.facturesModificades} amb canvis a l'A3, ${changedTotals.size} amb el total canviat i els imports imputats recalculats) i ${summary.senseCorrespondencia} pendents de correspondència.${altresExercicis > 0 ? ` Atenció: ${altresExercicis} factures tenen data d'un altre exercici.` : ""}`
    );

    return summary;
  };

  // Save / Update Imputacions for a single Despesa
  const saveImputacions = (
    despesaId: string,
    allocations: { projecte_id: string; percentatge: number; import: number; observacions?: string }[],
    comentariGlobal?: string
  ) => {
    const currentDespesa = despeses.find(d => d.id === despesaId);
    const otherImputacions = imputacions.filter(imp => imp.despesa_id !== despesaId);
    const now = new Date().toISOString();
    const usuari = currentUserEmail();

    // One imputacio per project (the ID is despesa_projecte): repeated rows are merged
    const byProject = new Map<string, Imputacio>();
    for (const a of allocations) {
      if (!a.projecte_id || (a.percentatge <= 0 && a.import === 0)) continue;
      const prev = byProject.get(a.projecte_id);
      byProject.set(a.projecte_id, {
        id: `${despesaId}_${a.projecte_id}`,
        despesa_id: despesaId,
        projecte_id: a.projecte_id,
        percentatge: round4((prev?.percentatge || 0) + a.percentatge),
        import: round2((prev?.import || 0) + a.import),
        observacions: [prev?.observacions, a.observacions].filter(Boolean).join(" / "),
        data_actualitzacio: now,
        usuari
      });
    }
    const newImps = Array.from(byProject.values());

    // At exactly 100% the amounts must add up to the invoice to the cent (e.g. 50% + 50% of 10,01 €)
    const totalPercent = round2(newImps.reduce((acc, curr) => acc + curr.percentatge, 0));
    if (currentDespesa && newImps.length > 0 && percentCents(totalPercent) === 10000) {
      const last = newImps[newImps.length - 1];
      const others = newImps.slice(0, -1).reduce((acc, i) => acc + i.import, 0);
      last.import = round2(currentDespesa.total_factura - others);
    }

    // Reviewing the imputation clears the "modified in A3" warning
    const despesesUpdate = currentDespesa?.modificat_a3
      ? despeses.map(d => (d.id === despesaId ? { ...d, modificat_a3: false } : d))
      : undefined;

    commit({ imputacions: [...otherImputacions, ...newImps], despeses: despesesUpdate });

    const allocSummary = newImps.map(i => `${i.projecte_id} (${round2(i.percentatge)}%, ${i.import.toFixed(2)}€)`).join(", ") || "Sense projectes (0%)";
    recordLog(
      "imputacio",
      `Imputació de Factura: ${currentDespesa?.ndoc_a3 || despesaId}`,
      `Proveïdor: ${currentDespesa?.proveidor || "-"} | Total factura: ${currentDespesa ? currentDespesa.total_factura.toFixed(2) : "-"}€ | Repartiment: ${allocSummary}`,
      { despesa_id: despesaId, comentaris: comentariGlobal }
    );
  };

  // Bulk Actions
  const bulkAssignPartida = (despesaIds: string[], partidaId: string, comentaris?: string) => {
    if (despesaIds.length === 0) return;
    const idSet = new Set(despesaIds);
    commit({ despeses: despeses.map(d => (idSet.has(d.id) ? { ...d, partida_id: partidaId } : d)) });

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

    // Merge repeated projects and drop empty rows
    const merged = new Map<string, number>();
    for (const a of allocations) {
      if (!a.projecte_id || !(a.percentatge > 0)) continue;
      merged.set(a.projecte_id, (merged.get(a.projecte_id) || 0) + a.percentatge);
    }
    const validAllocations = Array.from(merged.entries()).map(([projecte_id, percentatge]) => ({ projecte_id, percentatge }));
    const totalPercent = round2(validAllocations.reduce((acc, curr) => acc + curr.percentatge, 0));
    const closesInvoice = percentCents(totalPercent) === 10000;

    const preservedImputacions = imputacions.filter(imp => !idSet.has(imp.despesa_id));
    const newImps: Imputacio[] = [];
    const now = new Date().toISOString();
    const usuari = currentUserEmail();

    for (const d of despeses) {
      if (!idSet.has(d.id)) continue;
      let totalImport = 0;
      validAllocations.forEach((alloc, i) => {
        const isLast = i === validAllocations.length - 1;
        // At 100% the last project takes the remainder so the amounts add up to the invoice to the cent
        const importAlloc = isLast && closesInvoice
          ? round2(d.total_factura - totalImport)
          : round2((alloc.percentatge / 100) * d.total_factura);
        totalImport += importAlloc;
        newImps.push({
          id: `${d.id}_${alloc.projecte_id}`,
          despesa_id: d.id,
          projecte_id: alloc.projecte_id,
          percentatge: alloc.percentatge,
          import: importAlloc,
          observacions: comentaris || "",
          data_actualitzacio: now,
          usuari
        });
      });
    }

    commit({ imputacions: [...preservedImputacions, ...newImps] });

    const allocDesc = validAllocations.map(a => `${a.projecte_id} (${a.percentatge}%)`).join(", ") || "Sense projectes (0%)";
    recordLog(
      "imputacio",
      `Imputació Massiva a Projectes (${despesaIds.length} factures)`,
      `Repartiment aplicat a ${despesaIds.length} factures (substitueix les imputacions prèvies): ${allocDesc}`,
      { comentaris }
    );
  };

  const bulkResetImputacions = (despesaIds: string[], comentaris?: string) => {
    if (despesaIds.length === 0) return;
    const idSet = new Set(despesaIds);
    commit({ imputacions: imputacions.filter(imp => !idSet.has(imp.despesa_id)) });

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
    commit({
      despeses: despeses.filter(d => !idSet.has(d.id)),
      imputacions: imputacions.filter(imp => !idSet.has(imp.despesa_id)),
    });

    recordLog(
      "nota_manual",
      `Factures Eliminades en Bloc (${despesaIds.length} factures)`,
      `S'han eliminat del sistema ${despesaIds.length} factures i les seves imputacions associades.`,
      { comentaris }
    );
  };

  // Account numbers compared without spaces/punctuation (as the A3 parser does)
  const sameCompte = (a: string | undefined, b: string | undefined) => {
    const ca = cleanStr(a);
    return ca !== "" && ca === cleanStr(b);
  };

  /**
   * Saves an equivalence and re-applies it to the despeses of that account that were still
   * unmapped or that had the partida of the previous equivalence. Partides assigned manually
   * to individual despeses are kept.
   */
  const upsertEquivalencia = (eq: Equivalencia): { previous?: Equivalencia; affected: number } => {
    const previous = equivalencies.find(e => sameCompte(e.compte, eq.compte));
    const updatedEqs = previous
      ? equivalencies.map(e => (sameCompte(e.compte, eq.compte) ? { ...e, ...eq, compte: e.compte } : e))
      : [...equivalencies, eq];

    let affected = 0;
    const updatedDespeses = despeses.map(d => {
      if (!sameCompte(d.compte_despesa, eq.compte)) return d;
      const autoAssigned = d.partida_id === "SENSE_CORRESPONDENCIA" || (previous && d.partida_id === previous.partida_id);
      if (!autoAssigned || d.partida_id === eq.partida_id) return d;
      affected++;
      return { ...d, partida_id: eq.partida_id };
    });
    commit({ equivalencies: updatedEqs, despeses: affected > 0 ? updatedDespeses : undefined });
    return { previous, affected };
  };

  const assignPartidaToCompte = (compte: string, partidaId: string) => {
    const existing = equivalencies.find(e => sameCompte(e.compte, compte));
    const { affected } = upsertEquivalencia({
      compte,
      partida_id: partidaId,
      descripcio: existing?.descripcio || "Assignat manualment"
    });

    recordLog(
      "equivalencia",
      `Mapeig de Compte: ${compte}`,
      `Assignat a la partida ${partidaId}. ${affected} factures actualitzades (es respecten les partides assignades manualment).`
    );
  };

  // Projects CRUD
  const addProjecte = (p: Omit<Projecte, "id">): boolean => {
    const id = p.codi.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "_");
    if (!id) {
      alert("El codi del projecte és obligatori.");
      return false;
    }
    if (projectes.some(item => item.id === id || item.codi.toUpperCase() === id)) {
      alert(`Ja existeix un projecte amb el codi ${id}.`);
      return false;
    }
    commit({ projectes: [...projectes, { ...p, id, codi: id, actiu: true }] });

    recordLog(
      "projecte",
      `Nou Projecte Creat: ${id}`,
      `Finançador: ${p.financador || "-"} | Àrea: ${p.area || "-"} | Període: ${p.dates_text}`,
      { projecte_id: id }
    );
    return true;
  };

  const updateProjecte = (p: Projecte) => {
    // The code is the project's identity (it is the ID used by the imputacions): it can't change.
    // The active state only changes with setProjecteActiu (the form may hold a stale value).
    commit({ projectes: projectes.map(item => (item.id === p.id ? { ...p, codi: item.codi, actiu: item.actiu } : item)) });

    recordLog(
      "projecte",
      `Projecte Actualitzat: ${p.codi}`,
      `Finançador: ${p.financador || "-"} | Àrea: ${p.area || "-"} | Dates: ${p.dates_text}`,
      { projecte_id: p.id }
    );
  };

  const setProjecteActiu = (id: string, actiu: boolean) => {
    commit({ projectes: projectes.map(item => (item.id === id ? { ...item, actiu } : item)) });

    recordLog(
      "projecte",
      actiu ? `Projecte Reactivat: ${id}` : `Projecte Desactivat: ${id}`,
      actiu ? `El projecte torna a estar actiu.` : `El projecte ha estat marcat com a tancat/inactiu.`,
      { projecte_id: id }
    );
  };

  const deleteProjecte = (id: string) => setProjecteActiu(id, false);

  // Partides CRUD
  const addPartida = (p: { codi: string; nom: string }, comentaris?: string): boolean => {
    // Same style as the catalog codes (e.g. "DD_DIR.LEGAL I GI"): uppercase, spaces and dots allowed
    const rawCode = p.codi.toUpperCase().trim().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ._-]/gu, "_");
    if (!rawCode || rawCode === "DD_") {
      alert("El codi de la partida és obligatori.");
      return false;
    }
    const codi = rawCode.startsWith("DD_") ? rawCode : `DD_${rawCode}`;

    // "DD_DIR.LEGAL I GI" and "DD_DIR_LEGAL_I_GI" are the same partida
    const existing = partides.find(item => cleanStr(item.id) === cleanStr(codi));
    if (existing) {
      alert(`Ja existeix la partida ${existing.codi}${existing.activa === false ? " (donada de baixa: pots reactivar-la)" : ""}.`);
      return false;
    }

    const novaPartida: Partida = { id: codi, codi, nom: p.nom.trim() || codi, activa: true };
    commit({ partides: [...partides, novaPartida] });

    recordLog(
      "partida",
      `Nova Partida Creada: ${codi}`,
      `Nom: ${novaPartida.nom} | Estat: Activa`,
      { comentaris }
    );
    return true;
  };

  const updatePartida = (p: Partida, comentaris?: string) => {
    // `activa` undefined = unchanged (the form may hold a stale value)
    const current = partides.find(item => item.id === p.id);
    const activa = p.activa === undefined ? current?.activa !== false : p.activa !== false;
    commit({ partides: partides.map(item => (item.id === p.id ? { ...item, nom: p.nom.trim(), activa } : item)) });

    recordLog(
      "partida",
      `Partida Modificada: ${p.codi}`,
      `Nom: ${p.nom.trim()} | Estat: ${activa ? "Activa" : "Donada de Baixa"}`,
      { comentaris }
    );
  };

  const toggleBaixaPartida = (id: string, comentaris?: string, activa?: boolean) => {
    const target = partides.find(item => item.id === id);
    if (!target) return;

    const novaActiva = activa ?? target.activa === false;
    if (novaActiva === (target.activa !== false)) return;
    const estatText = novaActiva ? "Reactivada / Donada d'Alta" : "Donada de Baixa (Arxivada)";
    commit({ partides: partides.map(item => (item.id === id ? { ...item, activa: novaActiva } : item)) });

    recordLog(
      "partida",
      `Partida ${novaActiva ? "Reactivada" : "Donada de Baixa"}: ${target.codi}`,
      `La partida ha passat a estar: ${estatText}. Totes les imputacions històriques es mantenen intactes.`,
      { comentaris }
    );
  };

  // Equivalencies CRUD
  const addEquivalencia = (eq: Equivalencia) => {
    const { previous, affected } = upsertEquivalencia(eq);

    recordLog(
      "equivalencia",
      previous ? `Equivalència Modificada: ${eq.compte}` : `Equivalència Creada: ${eq.compte}`,
      `Compte ${eq.compte} (${eq.descripcio || "-"}) vinculat a la partida ${eq.partida_id}. ${affected} factures actualitzades.`
    );
  };

  const updateEquivalencia = (eq: Equivalencia) => {
    const { affected } = upsertEquivalencia(eq);

    recordLog(
      "equivalencia",
      `Equivalència Modificada: ${eq.compte}`,
      `Compte ${eq.compte} reassignat a la partida ${eq.partida_id}. ${affected} factures actualitzades.`
    );
  };

  const deleteEquivalencia = (compte: string) => {
    commit({ equivalencies: equivalencies.filter(e => e.compte !== compte) });

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
    commitHistorial(historialRef.current.map(item => (item.id === logId ? { ...item, comentaris: comentari } : item)));
  };

  const deleteLogEntry = (logId: string) => {
    const target = historialRef.current.find(item => item.id === logId);
    commitHistorial(historialRef.current.filter(item => item.id !== logId));
    // Audit trail: deleting an entry leaves a record of what was deleted
    if (target) {
      recordLog(
        "nota_manual",
        `Entrada de l'Historial Eliminada`,
        `S'ha eliminat l'entrada "${target.titol}" del ${new Date(target.timestamp).toLocaleString("ca-ES")} (${target.usuari || "-"}). Detall original: ${target.detall}`
      );
    }
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
    commit({ despeses: [], imputacions: [] });
    recordLog("nota_manual", "Dades de Despeses Reiniciades", `S'han buidat les despeses i les imputacions de l'exercici ${activeExercici}.`);
  };

  // Restores the original catalog values without deleting what the users created afterwards
  const reloadSeedData = () => {
    const restore = <T,>(current: T[], seed: T[], key: (item: T) => string): T[] => {
      const seedMap = new Map(seed.map(item => [key(item), item]));
      const kept = current.filter(item => !seedMap.has(key(item)));
      return [...Array.from(seedMap.values()), ...kept];
    };
    commit({
      partides: restore(partides, seedData.partidas as Partida[], KEYS.partides),
      equivalencies: restore(equivalencies, seedData.equivalencies as Equivalencia[], KEYS.equivalencies),
      projectes: restore(projectes, seedData.projectes as Projecte[], KEYS.projectes),
    });
    recordLog("nota_manual", "Catàleg Restaurat", "S'han restaurat els valors originals de les partides, equivalències i projectes del catàleg inicial. Els elements creats posteriorment s'han mantingut.");
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
        setProjecteActiu,
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
      {isLoading ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
          <div className="flex flex-col items-center space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xl shadow-lg animate-pulse">
              SL
            </div>
            <p className="text-slate-600 text-sm font-medium animate-pulse">
              Carregant les dades de l&apos;exercici {activeExercici}...
            </p>
          </div>
        </div>
      ) : (
        children
      )}
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
