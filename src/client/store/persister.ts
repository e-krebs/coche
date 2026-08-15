import { createCustomPersister } from "tinybase/persisters/with-schemas";
import type { MergeableStore, Store } from "tinybase/with-schemas";
import type { Schemas } from "./schema";

/**
 * Persists.StoreOrMergeableStore inlined — verbatimModuleSyntax forbids referencing a const enum's
 * value at runtime.
 */
const STORE_OR_MERGEABLE = 3;

/**
 * Stores full mergeable content, not the built-in StoreOnly persister, so HLC timestamps +
 * tombstones survive reload — else an offline edit is re-stamped "now" and clobbers a newer remote
 * edit, and a delete resurrects. Connections open per operation (never held) so sign-out's
 * deleteDatabase isn't blocked.
 */

const OBJECT_STORE = "mergeable";
const KEY = "content";
const POLL_MS = 1000;

const openDb = async (dbName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onupgradeneeded = () => req.result.createObjectStore(OBJECT_STORE); // brand-new DB
    req.onerror = () => {
      reject(new Error("indexedDB open failed", { cause: req.error }));
    };
    req.onsuccess = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(OBJECT_STORE)) {
        resolve(db);
        return;
      }
      // Existing DB without our store (old StoreOnly 't'/'v' format): version up to create it,
      // discarding the unusable stale stores.
      const version = db.version + 1;
      db.close();
      const up = indexedDB.open(dbName, version);
      up.onupgradeneeded = () => {
        const udb = up.result;
        [...udb.objectStoreNames].forEach((name) => {
          udb.deleteObjectStore(name);
        });
        udb.createObjectStore(OBJECT_STORE);
      };
      up.onsuccess = () => {
        resolve(up.result);
      };
      up.onerror = () => {
        reject(new Error("indexedDB upgrade failed", { cause: up.error }));
      };
    };
  });

const readContent = async (dbName: string): Promise<unknown> => {
  const db = await openDb(dbName);
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(OBJECT_STORE, "readonly").objectStore(OBJECT_STORE).get(KEY);
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(new Error("indexedDB read failed", { cause: req.error }));
      };
    });
  } finally {
    db.close();
  }
};

const writeContent = async (dbName: string, content: unknown): Promise<void> => {
  const db = await openDb(dbName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, "readwrite");
      tx.objectStore(OBJECT_STORE).put(content, KEY);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(new Error("indexedDB write failed", { cause: tx.error }));
      };
    });
  } finally {
    db.close();
  }
};

export const createMergeableIndexedDbPersister = (
  store: MergeableStore<Schemas> | Store<Schemas>,
  dbName: string,
) =>
  // TinyBase's mergeable content is opaque to us; the persister round-trips it untyped (as never).
  createCustomPersister(
    store,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- opaque TinyBase content
    async () => (await readContent(dbName)) as never,
    async (getContent) => {
      await writeContent(dbName, getContent());
    },
    async (listener) => {
      // Seed baseline from disk so the poll only fires for another tab's later changes.
      let last = JSON.stringify((await readContent(dbName).catch(() => undefined)) ?? null);
      return setInterval(() => {
        void readContent(dbName)
          .then((content) => {
            const serialized = JSON.stringify(content ?? null);
            if (serialized === last) return;
            last = serialized;
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- opaque content
            listener(content as never);
          })
          .catch(() => {});
      }, POLL_MS);
    },
    (handle: ReturnType<typeof setInterval>) => {
      clearInterval(handle);
    },
    undefined,
    STORE_OR_MERGEABLE,
  );
