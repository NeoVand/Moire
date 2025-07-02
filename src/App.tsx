import React from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { MoireProjectProvider } from './hooks/MoireProjectContext';
import './App.css';

function App() {
  return (
    <MoireProjectProvider>
      <AppLayout />
    </MoireProjectProvider>
  );
}

export default App;
