import React from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { CanvasArea } from './CanvasArea';

export function AppLayout() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <CanvasArea />
      </div>
    </div>
  );
} 