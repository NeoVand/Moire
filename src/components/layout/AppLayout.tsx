import { MoireProjectProvider } from '../../hooks/MoireProjectContext';
import { Header } from './Header';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { CanvasArea } from './CanvasArea';

export function AppLayout() {
  return (
    <div className="h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col overflow-hidden relative">
      <MoireProjectProvider>
        {/* Header */}
        <div className="bg-[var(--bg-secondary)] border-b border-[var(--border)] relative z-30 flex-shrink-0">
          <Header />
        </div>

        {/* Canvas Area - spans full width underneath sidebars */}
        <div className="flex-1 relative min-h-0">
          <CanvasArea />
          
          {/* Left Sidebar - positioned absolutely on top of canvas */}
          <div className="absolute top-0 left-0 bottom-0 z-20">
            <LeftSidebar />
          </div>

          {/* Right Sidebar - positioned absolutely on top of canvas */}
          <div className="absolute top-0 right-0 bottom-0 z-20">
            <RightSidebar />
          </div>
        </div>
      </MoireProjectProvider>
    </div>
  );
} 