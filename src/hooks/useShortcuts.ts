import { useEffect } from 'react';
import { isTypingTarget } from '../lib/keyboard';
import { useProjectStore } from '../store/project';

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const store = useProjectStore.getState();
      const selected = store.layers.find((layer) => layer.id === store.selectedLayerId);
      const index = store.layers.findIndex((layer) => layer.id === store.selectedLayerId);

      if (e.key >= '1' && e.key <= '9') {
        const layer = store.layers[Number(e.key) - 1];
        if (layer) {
          e.preventDefault();
          store.selectLayer(layer.id);
        }
        return;
      }

      if (e.key === '0' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        store.resetView();
        return;
      }

      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        window.dispatchEvent(new Event('moire-inspector'));
        return;
      }

      if (!selected) return;

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        store.toggleVisibility(selected.id);
        return;
      }

      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        store.duplicateLayer(selected.id);
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        store.removeLayer(selected.id);
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        if (index > 0) store.reorderLayers(index, index - 1);
        return;
      }

      if (e.key === ']') {
        e.preventDefault();
        if (index >= 0 && index < store.layers.length - 1) store.reorderLayers(index, index + 1);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
