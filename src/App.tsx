import { AboutOverlay } from './components/AboutOverlay';
import { MoireStage } from './components/MoireStage';
import { MotionPanel } from './components/MotionPanel';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { Studio } from './components/Studio';
import { useShortcuts } from './hooks/useShortcuts';
import { useEffect, useRef } from 'react';
import { useTransportStore } from './store/transport';

export default function App() {
  useShortcuts();
  const root = useRef<HTMLDivElement>(null);
  const recording = useTransportStore((s) => s.recording);
  useEffect(() => {
    // Floating panels are portals; Capture remains usable while the scene is frozen.
    if (root.current) root.current.inert = recording;
  }, [recording]);

  return (
    <div ref={root} className="relative h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] [filter:blur(0)]">
      <div className="absolute inset-0 overflow-hidden">
        <MoireStage />
      </div>
      <Studio />
      <MotionPanel />
      <ShortcutsOverlay />
      <AboutOverlay />
    </div>
  );
}
