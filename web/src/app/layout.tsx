import './globals.css';
import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const WatchlistClient = dynamic(() => import('./watchlist-client'), { ssr: false });
const SidebarPortfolios = dynamic(() => import('./sidebar-portfolios-client'), { ssr:false });
import { ToastProvider } from '@components/ui/toast';
const StatusStrip = dynamic(() => import('@components/ui/StatusStrip'), { ssr:false });

export const metadata = {
  title: 'Stock Dashboard',
  description: 'Internal portfolio & trade ingestion dashboard'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <ToastProvider>
          <div className="top-bar">
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontWeight:600 }}>📈 Stock Dashboard</span>
              <span className="status-pill">API: live</span>
            </div>
            <div style={{ fontSize:12, opacity:0.7 }}>Desktop Mode</div>
          </div>
          <div className="app-frame" style={{ paddingBottom:22 }}>
            <aside className="sidebar">
              <div className="sidebar-header">Portfolios</div>
              <div className="sidebar-section" style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <SidebarPortfolios />
              </div>
              <div className="sidebar-header" style={{ borderTop:'1px solid var(--color-border)' }}>Watchlist</div>
              <div className="sidebar-section" style={{ fontSize:12 }}>
                <WatchlistClient />
              </div>
              <div style={{ marginTop:'auto', padding: '8px 10px', fontSize:10, opacity:0.5 }}>
                Build {new Date().getFullYear()}
              </div>
            </aside>
            <main style={{ padding:20, height:'calc(100vh - 40px - 22px)', overflow:'hidden' }}>
              {children}
            </main>
          </div>
          <StatusStrip />
        </ToastProvider>
      </body>
    </html>
  );
}
