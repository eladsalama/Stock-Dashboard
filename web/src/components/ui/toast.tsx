"use client";
import React, { createContext, useCallback, useContext, useState } from 'react';

export type Toast = {
  id: string;
  title?: string;
  message: string;
  type?: 'info' | 'success' | 'error';
  ttl?: number; // ms
};

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => void;
  remove: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    const toast: Toast = { id, ttl: 5000, type: 'info', ...t };
    setToasts(prev => [...prev, toast]);
    if (toast.ttl && toast.ttl > 0) {
      setTimeout(() => remove(id), toast.ttl);
    }
  }, [remove]);

  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <div style={{ position: 'fixed', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 50 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            minWidth: 260,
            background: bgColor(t.type),
            color: '#e6edf3',
            border: '1px solid #30363d',
            borderLeft: `4px solid ${accentColor(t.type)}`,
            padding: '10px 12px',
            fontSize: 13,
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
          }}>
            {t.title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.title}</div>}
            <div>{t.message}</div>
            <button onClick={() => remove(t.id)} style={{ position: 'absolute', top: 4, right: 6, background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer' }}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function bgColor(type?: Toast['type']) {
  if (type === 'success') return '#0d3321';
  if (type === 'error') return '#3d1d1d';
  return '#1c2530';
}
function accentColor(type?: Toast['type']) {
  if (type === 'success') return '#238636';
  if (type === 'error') return '#f85149';
  return '#2f81f7';
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
