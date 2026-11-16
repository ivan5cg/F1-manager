// Envoltorio mínimo de IndexedDB: una base «muro» con un almacén «datos» (clave → texto).
// Sin librerías. Si el navegador no tiene IndexedDB (o no deja abrirla, como algunos modos
// privados), openDb() devuelve null y quien lo use sigue con localStorage.
const NAME = "muro", STORE = "datos";

let opening: Promise<IDBDatabase | null> | null = null;

const done = <T>(r: IDBRequest<T>) => new Promise<T>((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
const finished = (tx: IDBTransaction) => new Promise<void>((ok, ko) => {
  tx.oncomplete = () => ok();
  tx.onerror = () => ko(tx.error);
  tx.onabort = () => ko(tx.error ?? new Error("transacción cancelada"));
});

/** Abre (o crea) la base. null si no hay IndexedDB o no se puede usar. */
export function openDb(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((ok) => {
    let idb: IDBFactory;
    try { idb = indexedDB; if (!idb) return ok(null); } catch { return ok(null); }
    let req: IDBOpenDBRequest;
    try { req = idb.open(NAME, 1); } catch { return ok(null); }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ok(null);
    req.onblocked = () => ok(null);
  });
  return opening;
}

async function tx(mode: IDBTransactionMode) {
  const db = await openDb();
  if (!db) throw new Error("sin IndexedDB");
  return db.transaction(STORE, mode);
}

export async function get(k: string): Promise<string | undefined> {
  return done((await tx("readonly")).objectStore(STORE).get(k));
}

/** Escribe varias claves de una vez (todas o ninguna). */
export async function setMany(entries: [string, string][]): Promise<void> {
  const t = await tx("readwrite");
  const st = t.objectStore(STORE);
  for (const [k, v] of entries) st.put(v, k);
  (t as IDBTransaction & { commit?: () => void }).commit?.();
  return finished(t);
}

export const set = (k: string, v: string) => setMany([[k, v]]);

export async function del(k: string): Promise<void> {
  const t = await tx("readwrite");
  t.objectStore(STORE).delete(k);
  (t as IDBTransaction & { commit?: () => void }).commit?.();
  return finished(t);
}

export async function keys(): Promise<string[]> {
  return (await done((await tx("readonly")).objectStore(STORE).getAllKeys())).map(String);
}

/** Todo el almacén (para cargarlo a memoria al arrancar). */
export async function all(): Promise<Map<string, string>> {
  const st = (await tx("readonly")).objectStore(STORE);
  const [ks, vs] = await Promise.all([done(st.getAllKeys()), done(st.getAll())]);
  return new Map(ks.map((k, i) => [String(k), vs[i] as string]));
}
