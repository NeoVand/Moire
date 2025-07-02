import { MoireProjectProvider } from '../../hooks/MoireProjectContext';
import { Header } from './Header';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { CanvasArea } from './CanvasArea';

export function AppLayout() {
  return (
    <div className="h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col overflow-hidden relative">
      <MoireProjectProvider>
        {/* UI Layout */}
        <div className="relative z-10 h-full flex flex-col">
          {/* Header */}
          <div className="backdrop-blur-md bg-[var(--bg-secondary)]/80 border-b border-[var(--border)]/50">
            <Header />
          </div>

          <div className="flex flex-1 min-h-0">
            {/* Left Sidebar */}
            <div className="backdrop-blur-md bg-[var(--bg-secondary)]/85 border-r border-[var(--border)]/50">
              <LeftSidebar />
            </div>

            {/* Canvas Area */}
            <CanvasArea />

            {/* Right Sidebar */}
            <div className="backdrop-blur-md bg-[var(--bg-secondary)]/85 border-l border-[var(--border)]/50">
              <RightSidebar />
            </div>
          </div>
        </div>
      </MoireProjectProvider>
    </div>
  );
} 