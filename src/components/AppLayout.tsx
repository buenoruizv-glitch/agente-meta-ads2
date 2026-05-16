'use client';
import { ReactNode } from 'react';
import Sidebar from './Sidebar';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
}
