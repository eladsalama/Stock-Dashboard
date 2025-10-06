import './globals.css';
import React from 'react';
import FallbackLink from '@components/ui/FallbackLink';
const WatchlistClient = dynamic(() => import('./watchlist-client'), { ssr: false });
// Use purely client-side sidebar for stability across navigations
const SidebarPortfolios = dynamic(() => import('./sidebar-portfolios-client'), { ssr: false });
import { ToastProvider } from '@components/ui/toast';
import dynamic from 'next/dynamic';
const TopSearchClient = dynamic(()=>import('./top-search-client'), { ssr:false });
import SidebarHeaderClient from './sidebar-header-client';
const StatusStrip = dynamic(() => import('@components/ui/StatusStrip'), { ssr:false });

export const metadata = {
  title: 'Stock Dashboard',
  description: 'Internal portfolio & trade ingestion dashboard'
};

const preloadPortfoliosScript = `(() => { try { const el = document.getElementById('sidebar-portfolios-preload'); if(!el) return; const raw = localStorage.getItem('sidebar.portfolios.cache'); if(!raw) return; const list = JSON.parse(raw); if(!Array.isArray(list) || !list.length) return; const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); let out=''; for (let i=0;i<list.length && i<40;i++){ const p=list[i]; if(!p||!p.id) continue; out += '<div class="sidebar-preload-item">'+ esc(p.name||'Portfolio') +'</div>'; } el.innerHTML = out; } catch(e) {} })();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const globalErrorTrap = `(() => {
    if (window.__GLOBAL_ERROR_TRAP) return; window.__GLOBAL_ERROR_TRAP = true;
    function send(label, payload){ try { fetch('/v1/dev/sidebar-log',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ label, payload, ts:Date.now() })}).catch(()=>{});} catch{}
    }
    window.addEventListener('error', (e)=> { send('window-error', { msg: e.message, stack: e.error?.stack }); });
    window.addEventListener('unhandledrejection', (e)=> { send('unhandled-rejection', { reason: String(e.reason) }); });
    // Emergency nav helper for debugging: press CTRL+SHIFT+H to force hard home reload.
    window.addEventListener('keydown', (e)=> { if(e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='h'){ send('debug-hotkey-home', { from: location.pathname }); location.href='/'; }});
    // Pointer event debugger: logs top element under cursor every 2s while on portfolio pages.
    setInterval(()=>{
      try {
        if(!location.pathname.includes('/portfolios/')) return;
        const el = document.elementFromPoint(window.innerWidth/2, 60);
        if(el) send('pointer-probe', { tag: el.tagName, classes: el.className, id: (el as HTMLElement).id });
      } catch {}
    }, 2000);
  })();`;
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <ToastProvider>
          <script dangerouslySetInnerHTML={{ __html: globalErrorTrap }} />
          <div className="top-bar">
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <FallbackLink href="/" style={{ fontWeight:600, textDecoration:'none', color:'inherit', cursor:'pointer' }}>📈 Stock Dashboard</FallbackLink>
              <span className="status-pill">API: live</span>
              <TopSearchClient />
            </div>
            <div style={{ fontSize:12, opacity:0.7 }}>Desktop Mode</div>
          </div>
          <div className="app-frame" style={{ paddingBottom:22 }}>
            <aside className="sidebar">
              <div className="sidebar-header">
                <SidebarHeaderClient />
              </div>
              <div id="sidebar-portfolios-preload" style={{ display:'flex', flexDirection:'column', gap:4 }} />
              <script dangerouslySetInnerHTML={{ __html: preloadPortfoliosScript }} />
              <div className="sidebar-section" style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <SidebarPortfolios />
              </div>
              <div className="sidebar-section" style={{ fontSize:12, display:'flex', flexDirection:'column', gap:6, borderTop:'1px solid var(--color-border)', paddingTop:6 }}>
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
