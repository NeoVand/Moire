import { create } from 'zustand';

/**
 * Which knob's motion panel is open.
 *
 * One at a time, and held here rather than in each slider, because the panel is
 * a movable window now: two of them stacked at the same remembered corner would
 * be indistinguishable, and the second would look like the first failing to
 * update. Opening one closes the other, which is also how a person expects a
 * single inspector to behave.
 */
export interface EditorStore {
  /** The parameter path being edited, or null. */
  motionPath: string | null;
  openMotion: (path: string) => void;
  closeMotion: () => void;
  toggleMotion: (path: string) => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  motionPath: null,
  openMotion: (path) => set({ motionPath: path }),
  closeMotion: () => set({ motionPath: null }),
  toggleMotion: (path) => set((s) => ({ motionPath: s.motionPath === path ? null : path })),
}));
