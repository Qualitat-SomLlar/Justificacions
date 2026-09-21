"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Despesa, Imputacio, Projecte, Partida, Equivalencia, ImportSummary, LogEntry } from "./types";
import { parseA3Excel } from "./parser";
import { exportJustificacionsExcel } from "./exporter";
import seedData from "./seed_data.json";

interface JustificacionsContextType {
  despeses: Despesa[];
  imputacions: Imputacio[];
  projectes: Projecte[];
  partides: Partida[];
  equivalencies: Equivalencia[];
  historial: LogEntry[];
  isLoading: boolean;
  activeExercici: number;
  setActiveExercici: (y: number) => void;
  importA3File: (fileBuffer: ArrayBuffer) => Promise<ImportSummary>;
  saveImputacions: (
    despesaId: string,
    allocations: { projecte_id: string; percentatge: number; import: number; observacions?: string }[],
    comentariGlobal?: string
  ) => void;
  addProjecte: (p: Omit<Projecte, "id">) => void;
  updateProjecte: (p: Projecte) => void;
  deleteProjecte: (id: string) => void;
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

const STORAGE_KEYS = {
  DESPESES: "somllar_despeses_v1",
  IMPUTACIONS: "somllar_imputacions_v1",
  PROJECTES: "somllar_projectes_v1",
  PARTIDES: "somllar_partides_v1",
  EQUIVALENCIES: "somllar_equivalencies_v1",
  HISTORIAL: "somllar_historial_v1",
};

const JustificacionsContext = createContext<JustificacionsContextType | null>(null);

export function JustificacionsProvider({ children }: { children: React.ReactNode }) {
  const [despeses, setDespeses] = useState<Despesa[]>([]);
  const [imputacions, setImputacions] = useState<Imputacio[]>([]);
  const [projectes, setProjectes] = useState<Projecte[]>([]);
  const [partides, setPartides] = useState<Partida[]>([]);
  const [equivalencies, setEquivalencies] = useState<Equivalencia[]>([]);
  const [historial, setHistorial] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeExercici, setActiveExercici] = useState<number>(2026);

  // Initialize from localStorage or fallback to seedData
  useEffect(() => {
    try {
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

      const storedDespeses = localStorage.getItem(STORAGE_KEYS.DESPESES);
      if (storedDespeses) {
        setDespeses(JSON.parse(storedDespeses));
      }

      const storedImputacions = localStorage.getItem(STORAGE_KEYS.IMPUTACIONS);
      if (storedImputacions) {
        setImputacions(JSON.parse(storedImputacions));
      }

      const storedHistorial = localStorage.getItem(STORAGE_KEYS.HISTORIAL);
      if (storedHistorial) {
        setHistorial(JSON.parse(storedHistorial));
      } else {
        // Initial welcome log
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
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save changes to localStorage
  const persistDespeses = (updated: Despesa[]) => {
    setDespeses(updated);
    localStorage.setItem(STORAGE_KEYS.DESPESES, JSON.stringify(updated));
  };

  const persistImputacions = (updated: Imputacio[]) => {
    setImputacions(updated);
    localStorage.setItem(STORAGE_KEYS.IMPUTACIONS, JSON.stringify(updated));
  };

  const persistProjectes = (updated: Projecte[]) => {
    setProjectes(updated);
    localStorage.setItem(STORAGE_KEYS.PROJECTES, JSON.stringify(updated));
  };

  const persistEquivalencies = (updated: Equivalencia[]) => {
    setEquivalencies(updated);
    localStorage.setItem(STORAGE_KEYS.EQUIVALENCIES, JSON.stringify(updated));
  };

  const persistHistorial = (updated: LogEntry[]) => {
    setHistorial(updated);
    localStorage.setItem(STORAGE_KEYS.HISTORIAL, JSON.stringify(updated));
  };

  // Helper to add log entry
  const recordLog = (
    tipus: LogEntry["tipus"],
    titol: string,
    detall: string,
    extra?: { despesa_id?: string; projecte_id?: string; comentaris?: string }
  ) => {
    const newEntry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      tipus,
      titol,
      detall,
      usuari: "secretaria@somllar.cat",
      ...extra,
    };
    setHistorial(prev => {
      const updated = [newEntry, ...prev];
      localStorage.setItem(STORAGE_KEYS.HISTORIAL, JSON.stringify(updated));
      return updated;
    });
  };

  // Import A3 File
  const importA3File = async (fileBuffer: ArrayBuffer): Promise<ImportSummary> => {
    const summary = parseA3Excel(fileBuffer, equivalencies, despeses);

    // Merge new parsed despeses with existing
    const existingMap = new Map<string, Despesa>();
    despeses.forEach(d => existingMap.set(d.id, d));

    const updatedList: Despesa[] = [];
    for (const d of summary.despeses) {
      if (existingMap.has(d.id)) {
        const prev = existingMap.get(d.id)!;
        updatedList.push({
          ...d,
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

    persistDespeses(updatedList);

    // Record log
    recordLog(
      "importacio_a3",
      `Volcat d'Excel d'A3 Processat`,
      `S'han processat ${summary.totalFilesLlegides} línies d'apunts. ${summary.facturesNoves} factures noves, ${summary.facturesExistents} mantingudes, ${summary.facturesModificades} modificacions detectades a l'A3 i ${summary.senseCorrespondencia} pendents de correspondència.`
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

    let estat: 'pendent' | 'parcial' | 'completada' | 'excedida' = 'pendent';
    if (totalPercent > 100) {
      estat = 'excedida';
    } else if (Math.abs(totalPercent - 100) < 0.01) {
      estat = 'completada';
    } else if (totalPercent > 0) {
      estat = 'parcial';
    }

    const currentDespesa = despeses.find(d => d.id === despesaId);

    const updatedDespeses = despeses.map(d => {
      if (d.id === despesaId) {
        return {
          ...d,
          estat,
          percentatge_total: totalPercent,
          import_total: totalImport
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

  // Assign Partida to Account & re-evaluate despeses
  const assignPartidaToCompte = (compte: string, partidaId: string) => {
    const existingIdx = equivalencies.findIndex(e => e.compte === compte);
    let updatedEqs: Equivalencia[];
    if (existingIdx !== -1) {
      updatedEqs = [...equivalencies];
      updatedEqs[existingIdx] = { ...updatedEqs[existingIdx], partida_id: partidaId };
    } else {
      updatedEqs = [...equivalencies, { compte, descripcio: "", partida_id: partidaId }];
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
    const buffer = exportJustificacionsExcel(despeses, imputacions, projectes, partides);
    const blob = new Blob([buffer as any], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Justificacions_Som_Llar_${activeExercici}_${new Date().toISOString().split("T")[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearAllData = () => {
    localStorage.removeItem(STORAGE_KEYS.DESPESES);
    localStorage.removeItem(STORAGE_KEYS.IMPUTACIONS);
    setDespeses([]);
    setImputacions([]);
    recordLog("nota_manual", "Dades de Despeses Reiniciades", "S'han buidat les despeses i les imputacions carregades.");
  };

  const reloadSeedData = () => {
    setPartides(seedData.partidas as Partida[]);
    setEquivalencies(seedData.equivalencies as Equivalencia[]);
    setProjectes(seedData.projectes as Projecte[]);
    localStorage.setItem(STORAGE_KEYS.PARTIDES, JSON.stringify(seedData.partidas));
    localStorage.setItem(STORAGE_KEYS.EQUIVALENCIES, JSON.stringify(seedData.equivalencies));
    localStorage.setItem(STORAGE_KEYS.PROJECTES, JSON.stringify(seedData.projectes));
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
        activeExercici,
        setActiveExercici,
        importA3File,
        saveImputacions,
        addProjecte,
        updateProjecte,
        deleteProjecte,
        addEquivalencia,
        updateEquivalencia,
        deleteEquivalencia,
        assignPartidaToCompte,
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
