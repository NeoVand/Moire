/**
 * Browser-local storage for projects and for the working session.
 *
 * Two stores with different jobs. `projects` holds what the author deliberately
 * saved and named. `session` holds one record — whatever is on screen right
 * now — rewritten a few times a second so that a refresh, a crash, or a tab the
 * system decided to discard costs nothing. The second is the one that matters:
 * nobody about to lose work thinks to press save first.
 *
 * A scene is stored as the same JSON string the export button writes, not as a
 * structured object. That keeps one code path: a project read back out of the
 * database and a file dropped onto the window both go through `parseScene`, so
 * a scene that survives a round trip through disk survives one through here,
 * and a migration written for one is written for both.
 *
 * IndexedDB, not localStorage: localStorage caps out near five megabytes, is
 * synchronous on the main thread, and cannot hold the thumbnail blobs. None of
 * it is a backup — a browser may evict it under storage pressure and clearing
 * site data wipes it — which is why the projects panel says so out loud and
 * keeps JSON export one click away.
 */

const DB_NAME = 'moire';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const SESSION = 'session';
/** The session store holds exactly one record, under this key. */
const SESSION_KEY = 'current';

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** A small PNG of the construction, for the projects grid. */
  thumbnail?: Blob;
  /** Serialized `SceneData` — the export format, verbatim. */
  scene: string;
}

export interface SessionRecord {
  key: typeof SESSION_KEY;
  /** Which named project this was opened from, if any. */
  projectId: string | null;
  scene: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) {
        db.createObjectStore(PROJECTS, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(SESSION)) {
        db.createObjectStore(SESSION, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
    // A second tab holding an older version open blocks the upgrade. Nothing to
    // do but surface it rather than hang forever on a promise that never settles.
    req.onblocked = () => reject(new Error('Another Moiré tab is open with an older database.'));
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = body(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error(`${store} request failed`));
      })
  );
}

/** Whether the browser has storage at all — false in some private windows. */
export function storageAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Blocked by a policy that throws on access rather than returning null.
    return false;
  }
}

/**
 * Ask the browser to exempt this origin from eviction under storage pressure.
 * Without it the database is best-effort and may be cleared exactly when it is
 * most needed. It is a request, not a guarantee; the answer is worth showing.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || e.usage === undefined || e.quota === undefined) return null;
    return { usage: e.usage, quota: e.quota };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- session

export async function readSession(): Promise<SessionRecord | null> {
  try {
    return (await run<SessionRecord | undefined>(SESSION, 'readonly', (s) => s.get(SESSION_KEY))) ?? null;
  } catch {
    // A session that cannot be read is a session that is not restored. The app
    // opens on its defaults, which is the same thing that happened before this
    // file existed, so it is not worth an error the author cannot act on.
    return null;
  }
}

export async function writeSession(projectId: string | null, scene: string): Promise<void> {
  const record: SessionRecord = { key: SESSION_KEY, projectId, scene, updatedAt: Date.now() };
  try {
    await run(SESSION, 'readwrite', (s) => s.put(record));
  } catch {
    // Autosave runs on every edit; a failure here must not interrupt drawing.
  }
}

// --------------------------------------------------------------- projects

export async function listProjects(): Promise<ProjectRecord[]> {
  try {
    const all = await run<ProjectRecord[]>(PROJECTS, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function readProject(id: string): Promise<ProjectRecord | null> {
  try {
    return (await run<ProjectRecord | undefined>(PROJECTS, 'readonly', (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function putProject(record: ProjectRecord): Promise<void> {
  await run(PROJECTS, 'readwrite', (s) => s.put(record));
}

export async function deleteProject(id: string): Promise<void> {
  await run(PROJECTS, 'readwrite', (s) => s.delete(id));
}

export function newProjectId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
