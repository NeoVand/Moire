import { MoireStage } from './components/MoireStage';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { Studio } from './components/Studio';
import { useShortcuts } from './hooks/useShortcuts';

export default function App() {
  useShortcuts();

  return (
    <div className="relative h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <MoireStage />
      <Studio />
      <ShortcutsOverlay />
    </div>
  );
}
