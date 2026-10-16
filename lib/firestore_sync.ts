import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
  writeBatch,
  Unsubscribe
} from "firebase/firestore";
import { db } from "./firebase";
import { chunk, firestoreDocId } from "./sync_utils";

/**
 * Layout (schema v2): one Firestore document per item, so no document grows past the 1 MiB
 * limit and each user only overwrites the items they actually changed.
 *
 *   justificacions_somllar/_meta                                  { schemaVersion: 2, ... }
 *   justificacions_somllar/{bucket}/items/{itemId}                one document per item
 *
 * Buckets: projectes, partides, equivalencies, historial, despeses_{exercici}, imputacions_{exercici}.
 * Schema v1 kept each whole list in the "items" array field of justificacions_somllar/{bucket};
 * those documents are left untouched by the migration as a backup.
 */
const COLLECTION_ROOT = "justificacions_somllar";
const META_DOC = "_meta";
export const SCHEMA_VERSION = 2;

// Firestore allows up to 500 writes per batch
const BATCH_SIZE = 400;

export type Bucket = string;

export const BUCKETS = {
  projectes: "projectes",
  partides: "partides",
  equivalencies: "equivalencies",
  historial: "historial",
  despeses: (exercici: number) => `despeses_${exercici}`,
  imputacions: (exercici: number) => `imputacions_${exercici}`,
};

const itemsCollection = (bucket: Bucket) => collection(db, COLLECTION_ROOT, bucket, "items");

export async function fetchSchemaVersion(): Promise<number> {
  const meta = await getDoc(doc(db, COLLECTION_ROOT, META_DOC));
  return meta.exists() ? Number(meta.data().schemaVersion) || 1 : 1;
}

/** Live listener on a bucket. onData receives every item each time anything changes. */
export function subscribeBucket<T>(
  bucket: Bucket,
  onData: (items: T[], fromCache: boolean) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    itemsCollection(bucket),
    (snap) => onData(snap.docs.map(d => d.data() as T), snap.metadata.fromCache),
    onError
  );
}

/** Writes only the changed items and deletes the removed ones. */
export async function writeBucketChanges<T>(
  bucket: Bucket,
  upserts: T[],
  deletes: string[],
  key: (item: T) => string
): Promise<void> {
  const ops: ({ type: "set"; item: T } | { type: "delete"; id: string })[] = [
    ...upserts.map(item => ({ type: "set" as const, item })),
    ...deletes.map(id => ({ type: "delete" as const, id })),
  ];
  for (const part of chunk(ops, BATCH_SIZE)) {
    const batch = writeBatch(db);
    for (const op of part) {
      if (op.type === "set") {
        batch.set(doc(itemsCollection(bucket), firestoreDocId(key(op.item))), op.item as any);
      } else {
        batch.delete(doc(itemsCollection(bucket), firestoreDocId(op.id)));
      }
    }
    await batch.commit();
  }
}

/** Schema v1: every list stored as an "items" array in justificacions_somllar/{bucket}. */
export async function fetchLegacyBuckets(): Promise<Map<Bucket, any[]>> {
  const snap = await getDocs(collection(db, COLLECTION_ROOT));
  const result = new Map<Bucket, any[]>();
  for (const d of snap.docs) {
    if (d.id === META_DOC) continue;
    const items = d.data().items;
    if (Array.isArray(items)) result.set(d.id, items);
  }
  return result;
}

/**
 * Writes the complete content of each bucket in schema v2 and marks the migration as done.
 * The meta document is written last, so an interrupted migration can simply be run again.
 */
export async function writeMigration(
  buckets: { bucket: Bucket; items: any[]; key: (item: any) => string }[],
  migratedBy: string
): Promise<void> {
  for (const b of buckets) {
    await writeBucketChanges(b.bucket, b.items, [], b.key);
  }
  await setDoc(doc(db, COLLECTION_ROOT, META_DOC), {
    schemaVersion: SCHEMA_VERSION,
    migratedAt: new Date().toISOString(),
    migratedBy,
    buckets: buckets.map(b => ({ bucket: b.bucket, count: b.items.length })),
  });
}
