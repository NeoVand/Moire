import { Hud } from './components/Hud';
import { Inspector } from './components/Inspector';
import { LayerFilmstrip } from './components/LayerFilmstrip';
import { MoireStage } from './components/MoireStage';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { useShortcuts } from './hooks/useShortcuts';

export default function App() {
  useShortcuts();

  return (
    <div className="relative h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <MoireStage />
      <Hud />
      <Inspector />
      <LayerFilmstrip />
      <ShortcutsOverlay />
    </div>
  );
}
