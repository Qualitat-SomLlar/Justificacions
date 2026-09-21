import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  writeBatch 
} from "firebase/firestore";
import { db } from "./firebase";
import { Despesa, Imputacio, Projecte, Partida, Equivalencia, LogEntry } from "./types";

const COLLECTION_ROOT = "justificacions_somllar";

export async function fetchRemoteData(exercici: number = 2026) {
  if (!db) return null;
  try {
    const projectesDoc = await getDoc(doc(db, COLLECTION_ROOT, "projectes"));
    const equivalenciesDoc = await getDoc(doc(db, COLLECTION_ROOT, "equivalencies"));
    const partidesDoc = await getDoc(doc(db, COLLECTION_ROOT, "partides"));
    const despesesDoc = await getDoc(doc(db, COLLECTION_ROOT, `despeses_${exercici}`));
    const imputacionsDoc = await getDoc(doc(db, COLLECTION_ROOT, `imputacions_${exercici}`));
    const historialDoc = await getDoc(doc(db, COLLECTION_ROOT, "historial"));

    return {
      projectes: projectesDoc.exists() ? (projectesDoc.data().items as Projecte[]) : null,
      equivalencies: equivalenciesDoc.exists() ? (equivalenciesDoc.data().items as Equivalencia[]) : null,
      partides: partidesDoc.exists() ? (partidesDoc.data().items as Partida[]) : null,
      despeses: despesesDoc.exists() ? (despesesDoc.data().items as Despesa[]) : null,
      imputacions: imputacionsDoc.exists() ? (imputacionsDoc.data().items as Imputacio[]) : null,
      historial: historialDoc.exists() ? (historialDoc.data().items as LogEntry[]) : null,
    };
  } catch (error) {
    console.warn("Firestore: No s'han pogut carregar les dades remotes (es faran servir les dades locals):", error);
    return null;
  }
}

export async function syncProjectesToFirestore(projectes: Projecte[]) {
  if (!db) return;
  try {
    await setDoc(doc(db, COLLECTION_ROOT, "projectes"), { items: projectes, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.warn("Firestore syncProjectes error:", e);
  }
}

export async function syncEquivalenciesToFirestore(equivalencies: Equivalencia[]) {
  if (!db) return;
  try {
    await setDoc(doc(db, COLLECTION_ROOT, "equivalencies"), { items: equivalencies, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.warn("Firestore syncEquivalencies error:", e);
  }
}

export async function syncPartidesToFirestore(partides: Partida[]) {
  if (!db) return;
  try {
    await setDoc(doc(db, COLLECTION_ROOT, "partides"), { items: partides, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.warn("Firestore syncPartides error:", e);
  }
}

export async function syncDespesesToFirestore(exercici: number, despeses: Despesa[]) {
  if (!db) return;
  try {
    await setDoc(doc(db, COLLECTION_ROOT, `despeses_${exercici}`), { items: despeses, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.warn("Firestore syncDespeses error:", e);
  }
}

export async function syncImputacionsToFirestore(exercici: number, imputacions: Imputacio[]) {
  if (!db) return;
  try {
    await setDoc(doc(db, COLLECTION_ROOT, `imputacions_${exercici}`), { items: imputacions, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.warn("Firestore syncImputacions error:", e);
  }
}

export async function syncHistorialToFirestore(historial: LogEntry[]) {
  if (!db) return;
  try {
    await setDoc(doc(db, COLLECTION_ROOT, "historial"), { items: historial, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.warn("Firestore syncHistorial error:", e);
  }
}
