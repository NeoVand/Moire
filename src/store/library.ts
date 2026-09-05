import { create } from 'zustand';
import { capturePng } from '../gpu/capture';
import {
  deleteProject as dbDelete,
  listProjects,
  newProjectId,
  putProject,
  readProject,
  readSession,
  requestPersistence,
  storageAvailable,
  writeSession,
  type ProjectRecord,
} from './db';
import * as db from './db';
import * as motion from '../types/motion';
import * as params from './params';
import * as recorder from '../gpu/recorder';
import * as video from '../gpu/video';
import * as transport from './transport';
import { useTransportStore } from './transport';
import { sceneOf, useProjectStore } from './project';
import { parseScene, serializeScene } from './scene';

/**
 * The library: which construction is open, what else is on the shelf, and the
 * autosave that means none of it can be lost to a refresh.
 *
 * Kept apart from the project store on purpose. That store is the document —
 * the thing a scene file round-trips — and this is everything *about* the
 * document: its name, whether it has been saved, what else exists. Mixing them
 * would put a project id inside the exported JSON, where it means nothing to
 * whoever opens the file.
 *
 * The autosave is the point of the whole file. It writes the working scene to
 * the session record a short time after every edit, unconditionally and without
 * asking, so the recovery case needs no foresight from the author. Named saves
 * are a separate, deliberate act.
 */

/** Long enough that a slider drag is one write, short enough to never notice. */
const AUTOSAVE_MS = 600;
const THUMB_PX = 320;

export interface LibraryStore {
  /** False until the session read has settled, one way or the other. */
  hydrated: boolean;
  /** True when that read actually found work to put back on screen. */
  restored: boolean;
  /** Whether the browser gave us storage at all. */
  available: boolean;
  /** The named project this document came from, if any. */
  projectId: string | null;
  name: string;
  /** True when the document has drifted from the last named save. */
  dirty: boolean;
  projects: ProjectRecord[];

  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  rename: (name: string) => void;
  save: () => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  open: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  createNew: () => void;
  loadSceneText: (text: string) => void;
}

/**
 * The shipped example, written once and never again. It is the document already
 * in the store -- the default construction plus its opening animation -- so the
 * thing on the shelf and the thing on screen cannot disagree.
 */
async function seedOpening() {
  try {
    if ((await listProjects()).length > 0) return;
    const id = newProjectId();
    await putProject({
      id,
      name: 'Opening',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scene: currentText(),
    });
  } catch {
    // A shelf that could not be stocked is not a reason to fail to start.
  }
}

/**
 * A document that asks to play does so from the beginning. Resuming wherever the
 * clock happened to be would mean the same file never opens looking the same way
 * twice, which is the opposite of what the rest of this is for.
 */
function startIfAsked() {
  const { motion } = useProjectStore.getState();
  // Loading already resets the transport. Keep a saved, manually adjusted pose
  // intact unless the document explicitly asks to play from its beginning.
  if (motion.playOnLoad) useTransportStore.getState().play();
}

/** The scene as it stands, as the string everything else stores and compares. */
function currentText(): string {
  return serializeScene(sceneOf());
}

/**
 * A small picture of the construction for the projects grid. Best effort: the
 * canvas may not be mounted, or may be mid-resize, and a project without a
 * thumbnail is a great deal better than a save that failed.
 */
async function thumbnail(): Promise<Blob | undefined> {
  try {
    const full = await capturePng({ scale: 1 });
    const bitmap = await createImageBitmap(full);
    const scale = THUMB_PX / Math.max(bitmap.width, bitmap.height, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | undefined>((res) =>
      canvas.toBlob((b) => res(b ?? undefined), 'image/png')
    );
  } catch {
    return undefined;
  }
}

/** The text of the last named save, for the dirty flag. */
let savedText: string | null = null;
/** The text of the last session write, so an unchanged document is not rewritten. */
let sessionText: string | null = null;

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  hydrated: false,
  restored: false,
  available: storageAvailable(),
  projectId: null,
  name: 'Untitled',
  dirty: false,
  projects: [],

  hydrate: async () => {
    if (!get().available) {
      set({ hydrated: true });
      return;
    }
    const session = await readSession();
    if (!session) {
      // First visit: put the opening on the shelf, so the animation that plays
      // is a project the author can open, read and take apart rather than
      // something the application does to them.
      await seedOpening();
    }
    if (session) {
      try {
        // Through the same parser a dropped file goes through: a scene that has
        // gone stale against the current format fails here rather than loading
        // half of itself.
        useProjectStore.getState().loadScene(parseScene(session.scene));
        sessionText = session.scene;
        const owner = session.projectId ? await readProject(session.projectId) : null;
        savedText = owner?.scene ?? null;
        set({
          restored: true,
          projectId: owner?.id ?? null,
          name: owner?.name ?? 'Untitled',
          dirty: savedText !== null && savedText !== session.scene,
        });
      } catch {
        // Keep the defaults rather than a half-loaded construction.
      }
    }
    set({ hydrated: true });
    // Whether or not anything was restored: a document that asks to play does so,
    // and on a first visit that document is the opening.
    startIfAsked();
    void get().refresh();
  },

  refresh: async () => set({ projects: await listProjects() }),

  rename: (name) => {
    set({ name });
    const id = get().projectId;
    if (!id) return;
    void readProject(id).then((rec) => {
      if (rec) void putProject({ ...rec, name, updatedAt: Date.now() }).then(() => get().refresh());
    });
  },

  save: async () => {
    const { projectId, name } = get();
    if (!projectId) return get().saveAs(name);
    const existing = await readProject(projectId);
    const scene = currentText();
    await putProject({
      id: projectId,
      name,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      thumbnail: (await thumbnail()) ?? existing?.thumbnail,
      scene,
    });
    savedText = scene;
    set({ dirty: false });
    await get().refresh();
  },

  saveAs: async (name) => {
    // The first deliberate save is the moment to ask for durable storage: the
    // author has just said this is worth keeping.
    void requestPersistence();
    const id = newProjectId();
    const scene = currentText();
    await putProject({
      id,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thumbnail: await thumbnail(),
      scene,
    });
    savedText = scene;
    set({ projectId: id, name, dirty: false });
    await writeSession(id, scene);
    await get().refresh();
  },

  open: async (id) => {
    const rec = await readProject(id);
    if (!rec) return;
    useProjectStore.getState().loadScene(parseScene(rec.scene));
    startIfAsked();
    savedText = rec.scene;
    set({ projectId: id, name: rec.name, dirty: false });
    await writeSession(id, rec.scene);
  },

  remove: async (id) => {
    await dbDelete(id);
    // Deleting the open project does not close it; it becomes unsaved work,
    // which is the reading least likely to lose anything.
    if (get().projectId === id) {
      savedText = null;
      set({ projectId: null, dirty: false });
    }
    await get().refresh();
  },

  duplicate: async (id) => {
    const rec = await readProject(id);
    if (!rec) return;
    await putProject({
      ...rec,
      id: newProjectId(),
      name: `${rec.name} copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await get().refresh();
  },

  createNew: () => {
    useProjectStore.getState().resetProject();
    savedText = null;
    set({ projectId: null, name: 'Untitled', dirty: false });
    void writeSession(null, currentText());
  },

  loadSceneText: (text) => {
    useProjectStore.getState().loadScene(parseScene(text));
    startIfAsked();
    savedText = null;
    set({ projectId: null, name: 'Untitled', dirty: false });
  },
}));

// The two stores, reachable from the console on the dev server. Vite hands a
// dynamic `import()` from the console a different module instance than the one
// the app is running, so without this there is no way to ask the live app what
// it thinks its state is.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__moire = {
    project: useProjectStore,
    library: useLibraryStore,
    db,
    params,
    motion,
    recorder,
    video,
    transport,
  };
}

/**
 * Autosave. Subscribed once, at module load, so it is running before anything
 * can be drawn — there is no window in which an edit is unprotected.
 */
let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave() {
  const lib = useLibraryStore.getState();
  if (!lib.hydrated || !lib.available || useTransportStore.getState().recording) return;
  // Throttle, not debounce. A debounce resets its timer on every change, so a
  // stream of them postpones the write forever -- and a previewing animation is
  // exactly that stream, sixty a second, indefinitely. Leaving a scheduled timer
  // alone bounds the wait instead: a burst still coalesces into one write, and a
  // stream writes on a fixed beat.
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (useTransportStore.getState().recording) return;
    const scene = currentText();
    // A previewing animation rewrites the store every frame while saying nothing
    // new about the construction, since sceneOf() puts animated knobs back at
    // rest. Comparing the text is what stops that becoming a write a second,
    // forever, on a document nobody is editing.
    if (scene === sessionText) return;
    sessionText = scene;
    void writeSession(useLibraryStore.getState().projectId, scene);
    const dirty = savedText !== null && savedText !== scene;
    if (dirty !== useLibraryStore.getState().dirty) useLibraryStore.setState({ dirty });
  }, AUTOSAVE_MS);
}
useProjectStore.subscribe(scheduleAutosave);
useTransportStore.subscribe((state, previous) => {
  if (previous.recording && !state.recording) scheduleAutosave();
});
