import { useState } from 'react';
import { MoireProjectProvider } from '../../hooks/MoireProjectContext';
import { Header } from './Header';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { CanvasArea } from './CanvasArea';
import { HelpModal } from '../ui';

export function AppLayout() {
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  return (
    <div className="h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden relative">
      <MoireProjectProvider>
        {/* Canvas Area - spans full screen behind everything */}
        <div className="absolute inset-0">
          <CanvasArea />
        </div>

        {/* Header - positioned absolutely on top with backdrop blur */}
        <div className="absolute top-0 left-0 right-0 z-30 bg-[var(--bg-secondary)]/80 backdrop-blur-md border-b border-[var(--border)] flex-shrink-0">
          <Header onHelpClick={() => setIsHelpModalOpen(true)} />
        </div>

        {/* Left Sidebar - positioned absolutely on top of canvas */}
        <div className="absolute top-10 left-0 bottom-0 z-20">
          <LeftSidebar />
        </div>

        {/* Right Sidebar - positioned absolutely on top of canvas */}
        <div className="absolute top-10 right-0 bottom-0 z-20">
          <RightSidebar />
        </div>

        {/* Help Modal - positioned at the highest z-index */}
        <HelpModal
          isOpen={isHelpModalOpen}
          onClose={() => setIsHelpModalOpen(false)}
        />
      </MoireProjectProvider>
    </div>
  );
} 