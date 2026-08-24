import { AboutOverlay } from './components/AboutOverlay';
import { MoireStage } from './components/MoireStage';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { Studio } from './components/Studio';
import { useShortcuts } from './hooks/useShortcuts';

export default function App() {
  useShortcuts();

  return (
    <div className="relative h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] [filter:blur(0)]">
      <div className="absolute inset-0 overflow-hidden">
        <MoireStage />
      </div>
      <Studio />
      <ShortcutsOverlay />
      <AboutOverlay />
    </div>
  );
}
