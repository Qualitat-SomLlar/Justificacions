"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { Despesa, Imputacio, Projecte, Partida, Equivalencia, ImportSummary } from "./types";
import { parseA3Excel } from "./parser";
import { exportJustificacionsExcel } from "./exporter";
import seedData from "./seed_data.json";

interface JustificacionsContextType {
  despeses: Despesa[];
  imputacions: Imputacio[];
  projectes: Projecte[];
  partides: Partida[];
  equivalencies: Equivalencia[];
  isLoading: boolean;
  activeExercici: number;
  setActiveExercici: (y: number) => void;
  importA3File: (fileBuffer: ArrayBuffer) => Promise<ImportSummary>;
  saveImputacions: (
    despesaId: string,
    allocations: { projecte_id: string; percentatge: number; import: number; observacions?: string }[]
  ) => void;
  addProjecte: (p: Omit<Projecte, "id">) => void;
  updateProjecte: (p: Projecte) => void;
  deleteProjecte: (id: string) => void;
  addEquivalencia: (eq: Equivalencia) => void;
  updateEquivalencia: (eq: Equivalencia) => void;
  deleteEquivalencia: (compte: string) => void;
  assignPartidaToCompte: (compte: string, partidaId: string) => void;
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
};

const JustificacionsContext = createContext<JustificacionsContextType | null>(null);

export function JustificacionsProvider({ children }: { children: React.ReactNode }) {
  const [despeses, setDespeses] = useState<Despesa[]>([]);
  const [imputacions, setImputacions] = useState<Imputacio[]>([]);
  const [projectes, setProjectes] = useState<Projecte[]>([]);
  const [partides, setPartides] = useState<Partida[]>([]);
  const [equivalencies, setEquivalencies] = useState<Equivalencia[]>([]);
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
        // Keep existing imputations and state, but update amounts and mark if modified in A3
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

    // Keep any existing despeses that were not present in this specific upload
    for (const remaining of existingMap.values()) {
      updatedList.push(remaining);
    }

    persistDespeses(updatedList);
    return summary;
  };

  // Save / Update Imputacions for a single Despesa
  const saveImputacions = (
    despesaId: string,
    allocations: { projecte_id: string; percentatge: number; import: number; observacions?: string }[]
  ) => {
    // 1. Remove old imputations for this despesa
    const otherImputacions = imputacions.filter(imp => imp.despesa_id !== despesaId);

    // 2. Add new valid allocations
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

    // 3. Update Despesa summary status
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

    // Update all despeses that have this account
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
  };

  // Projects CRUD
  const addProjecte = (p: Omit<Projecte, "id">) => {
    const id = p.codi.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "_");
    const updated = [...projectes, { ...p, id, codi: id, actiu: true }];
    persistProjectes(updated);
  };

  const updateProjecte = (p: Projecte) => {
    const updated = projectes.map(item => item.id === p.id ? p : item);
    persistProjectes(updated);
  };

  const deleteProjecte = (id: string) => {
    const updated = projectes.map(item => item.id === id ? { ...item, actiu: false } : item);
    persistProjectes(updated);
  };

  // Equivalencies CRUD
  const addEquivalencia = (eq: Equivalencia) => {
    const updated = [...equivalencies, eq];
    persistEquivalencies(updated);
  };

  const updateEquivalencia = (eq: Equivalencia) => {
    const updated = equivalencies.map(e => e.compte === eq.compte ? eq : e);
    persistEquivalencies(updated);
  };

  const deleteEquivalencia = (compte: string) => {
    const updated = equivalencies.filter(e => e.compte !== compte);
    persistEquivalencies(updated);
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
  };

  const reloadSeedData = () => {
    setPartides(seedData.partidas as Partida[]);
    setEquivalencies(seedData.equivalencies as Equivalencia[]);
    setProjectes(seedData.projectes as Projecte[]);
    localStorage.setItem(STORAGE_KEYS.PARTIDES, JSON.stringify(seedData.partidas));
    localStorage.setItem(STORAGE_KEYS.EQUIVALENCIES, JSON.stringify(seedData.equivalencies));
    localStorage.setItem(STORAGE_KEYS.PROJECTES, JSON.stringify(seedData.projectes));
  };

  return (
    <JustificacionsContext.Provider
      value={{
        despeses,
        imputacions,
        projectes,
        partides,
        equivalencies,
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
