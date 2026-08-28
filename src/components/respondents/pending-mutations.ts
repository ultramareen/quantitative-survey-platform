import type { PublicAnswerMutation } from "@/types/public-survey";

const DB = "qsp-public-pending-v1";
const STORE = "mutations";
export type PendingMutation = PublicAnswerMutation & {
  publicId: string;
  localTimestamp: number;
};

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, {
        keyPath: ["publicId", "questionPosition"],
      });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function retainPending(value: PendingMutation) {
  const db = await database();
  await transaction(db, "readwrite", (store) => store.put(value));
  db.close();
}
export async function acknowledgePending(publicId: string, position: number) {
  const db = await database();
  await transaction(db, "readwrite", (store) =>
    store.delete([publicId, position]),
  );
  db.close();
}
export async function pendingFor(publicId: string) {
  const db = await database();
  const all = await transaction<PendingMutation[]>(db, "readonly", (store) =>
    store.getAll(),
  );
  db.close();
  const fresh = all.filter((v) => Date.now() - v.localTimestamp < 86_400_000);
  for (const expired of all.filter((v) => !fresh.includes(v)))
    await acknowledgePending(expired.publicId, expired.questionPosition);
  return fresh.filter((v) => v.publicId === publicId);
}
export async function purgePending(publicId: string) {
  for (const entry of await pendingFor(publicId))
    await acknowledgePending(publicId, entry.questionPosition);
}
function transaction<T = undefined>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
) {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}
