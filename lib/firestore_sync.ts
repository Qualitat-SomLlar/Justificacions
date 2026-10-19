import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
  runTransaction,
  writeBatch,
  deleteField,
  Unsubscribe
} from "firebase/firestore";
import { db } from "./firebase";
import { chunk, FIELD_DELETED, ItemChanges, itemKey, shardOf } from "./sync_utils";

/**
 * Layout (schema v3): each list is split in a fixed number of shard documents and every item is
 * a key of the "items" map of its shard:
 *
 *   justificacions_somllar/_meta                                   { schemaVersion: 3, ... }
 *   justificacions_somllar/{bucket}/shards/{n}                     { items: { [itemKey]: item } }
 *
 * - Few documents to read (≈100 per page load instead of one per item: the Spark plan allows
 *   50,000 reads a day).
 * - Writes are merges of only the changed fields of each item (`items.<key>.<field>`), so two
 *   users editing different items, or different fields of the same item, don't overwrite each other.
 * - Each shard stays far below the 1 MiB / 40,000 index entries limits.
 *
 * Older layouts, read only by the migration: v1 = whole list in the "items" array of
 * justificacions_somllar/{bucket}; v2 = one document per item in justificacions_somllar/{bucket}/items.
 */
const COLLECTION_ROOT = "justificacions_somllar";
const META_DOC = "_meta";
export const SCHEMA_VERSION = 3;

// Firestore allows up to 500 writes per batch
const MAX_BATCH_WRITES = 450;

export type Bucket = string;

export const BUCKETS = {
  projectes: "projectes",
  partides: "partides",
  equivalencies: "equivalencies",
  historial: "historial",
  despeses: (exercici: number) => `despeses_${exercici}`,
  imputacions: (exercici: number) => `imputacions_${exercici}`,
};

export function shardsFor(bucket: Bucket): number {
  if (bucket.startsWith("despeses_") || bucket.startsWith("imputacions_")) return 32;
  if (bucket === BUCKETS.historial) return 16;
  if (bucket === BUCKETS.equivalencies) return 4;
  return 1;
}

const shardsCollection = (bucket: Bucket) => collection(db, COLLECTION_ROOT, bucket, "shards");
const shardRef = (bucket: Bucket, n: number) => doc(db, COLLECTION_ROOT, bucket, "shards", String(n));
const metaRef = () => doc(db, COLLECTION_ROOT, META_DOC);

export interface SchemaMeta {
  version: number;
  buckets: string[];
}

function readMeta(data: Record<string, any> | undefined): SchemaMeta {
  if (!data) return { version: 1, buckets: [] };
  const buckets = Array.isArray(data.buckets) ? data.buckets.map((b: any) => (typeof b === "string" ? b : b?.bucket)).filter(Boolean) : [];
  return { version: Number(data.schemaVersion) || 1, buckets };
}

export async function fetchSchemaMeta(): Promise<SchemaMeta> {
  const meta = await getDoc(metaRef());
  return readMeta(meta.exists() ? meta.data() : undefined);
}

/** Notifies schema changes (e.g. another user finished the migration). */
export function subscribeSchemaMeta(onMeta: (meta: SchemaMeta) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(metaRef(), snap => onMeta(readMeta(snap.exists() ? snap.data() : undefined)), onError);
}

/**
 * Live listener on a bucket. onData receives every item each time anything changes.
 * Incomplete items are skipped: a field update merged onto an item that another user had just
 * deleted leaves an entry with only that field.
 */
export function subscribeBucket<T>(
  bucket: Bucket,
  isValid: (item: any) => boolean,
  onData: (items: T[], fromCache: boolean) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    shardsCollection(bucket),
    { includeMetadataChanges: true },
    (snap) => {
      const items: T[] = [];
      for (const d of snap.docs) {
        const map = d.data().items;
        if (!map || typeof map !== "object") continue;
        for (const item of Object.values(map)) {
          if (item && typeof item === "object" && isValid(item)) items.push(item as T);
        }
      }
      onData(items, snap.metadata.fromCache);
    },
    onError
  );
}

const MIGRATION_LOCK_MINUTES = 30;

/**
 * Marks the migration as in progress so that two people can't run it at the same time (the
 * second one would overwrite the shards while the first one's users are already editing).
 */
export async function acquireMigrationLock(user: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(metaRef());
    const data = snap.exists() ? snap.data() : {};
    if (Number(data.schemaVersion) >= SCHEMA_VERSION) {
      throw new Error("Les dades ja estan migrades al format actual. Recarrega la pàgina.");
    }
    const since = data.migratingAt ? Date.parse(data.migratingAt) : 0;
    if (data.migratingBy && data.migratingBy !== user && Date.now() - since < MIGRATION_LOCK_MINUTES * 60_000) {
      throw new Error(`${data.migratingBy} està fent la migració en aquest moment. Espera que acabi.`);
    }
    tx.set(metaRef(), { migratingBy: user, migratingAt: new Date().toISOString() }, { merge: true });
  });
}

export interface BucketChanges<T = any> {
  bucket: Bucket;
  changes: ItemChanges<T>;
  key: (item: T) => string;
}

/**
 * Writes the changes of one user action. Everything goes in a single atomic batch (one merge per
 * touched shard), so an action is never left half written.
 */
export async function writeChanges(list: BucketChanges[]): Promise<void> {
  const writes = new Map<string, { bucket: Bucket; shard: number; items: Record<string, unknown> }>();
  const target = (bucket: Bucket, rawKey: string) => {
    const shard = shardOf(rawKey, shardsFor(bucket));
    const id = `${bucket}/${shard}`;
    if (!writes.has(id)) writes.set(id, { bucket, shard, items: {} });
    return writes.get(id)!.items;
  };

  for (const { bucket, changes, key } of list) {
    for (const item of changes.created) {
      target(bucket, key(item))[itemKey(key(item))] = item;
    }
    for (const { key: k, fields } of changes.updated) {
      const patch: Record<string, unknown> = {};
      for (const [f, v] of Object.entries(fields)) patch[f] = v === FIELD_DELETED ? deleteField() : v;
      target(bucket, k)[itemKey(k)] = patch;
    }
    for (const k of changes.deleted) {
      target(bucket, k)[itemKey(k)] = deleteField();
    }
  }

  for (const part of chunk(Array.from(writes.values()), MAX_BATCH_WRITES)) {
    const batch = writeBatch(db);
    for (const w of part) {
      batch.set(shardRef(w.bucket, w.shard), { items: w.items }, { merge: true });
    }
    await batch.commit();
  }
}

/** Schema v1: every list stored as an "items" array in justificacions_somllar/{bucket}. */
export async function fetchV1Buckets(): Promise<Map<Bucket, any[]>> {
  const snap = await getDocs(collection(db, COLLECTION_ROOT));
  const result = new Map<Bucket, any[]>();
  for (const d of snap.docs) {
    if (d.id === META_DOC) continue;
    const items = d.data().items;
    if (Array.isArray(items)) result.set(d.id, items);
  }
  return result;
}

/** Schema v2: one document per item in justificacions_somllar/{bucket}/items. */
export async function fetchV2Buckets(buckets: Bucket[]): Promise<Map<Bucket, any[]>> {
  const result = new Map<Bucket, any[]>();
  for (const bucket of buckets) {
    const snap = await getDocs(collection(db, COLLECTION_ROOT, bucket, "items"));
    result.set(bucket, snap.docs.map(d => d.data()));
  }
  return result;
}

/**
 * Writes the complete content of each bucket in schema v3 and marks the migration as done.
 * Shard documents are overwritten (not merged), so running it again starts from a clean state.
 * Older layouts are left untouched as a backup. The meta document is written last.
 */
export async function writeMigration(
  buckets: { bucket: Bucket; items: any[]; key: (item: any) => string }[],
  migratedBy: string,
  previousVersion: number
): Promise<void> {
  const shardDocs: { bucket: Bucket; shard: number; items: Record<string, unknown> }[] = [];
  for (const b of buckets) {
    const n = shardsFor(b.bucket);
    const maps: Record<string, unknown>[] = Array.from({ length: n }, () => ({}));
    for (const item of b.items) {
      const k = b.key(item);
      if (!k) continue;
      maps[shardOf(k, n)][itemKey(k)] = item;
    }
    maps.forEach((items, shard) => shardDocs.push({ bucket: b.bucket, shard, items }));
  }

  // Few documents but possibly large (~150 KB each): small batches keep each request well below 10 MiB
  for (const part of chunk(shardDocs, 20)) {
    const batch = writeBatch(db);
    for (const s of part) batch.set(shardRef(s.bucket, s.shard), { items: s.items });
    await batch.commit();
  }

  await setDoc(metaRef(), {
    schemaVersion: SCHEMA_VERSION,
    previousVersion,
    migratedAt: new Date().toISOString(),
    migratedBy,
    buckets: buckets.map(b => ({ bucket: b.bucket, count: b.items.length })),
  });
}
