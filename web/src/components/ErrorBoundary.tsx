"use client";
import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error) => React.ReactNode;
  label?: string; // optional diagnostic label
}

interface ErrorBoundaryState { error: Error | null }

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to console & (optionally later) remote endpoint
    console.error('[ErrorBoundary]', this.props.label || 'component', error, info);
    try {
      if (typeof window !== 'undefined') {
        fetch('/v1/dev/sidebar-log', { // reuse existing dev log route for simplicity
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'runtime-error', where: this.props.label, error: String(error), stack: error?.stack, info })
        }).catch(()=>{});
      }
    } catch {}
  }

  render(): React.ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      return (
        <div style={{ border: '1px solid #f85149', padding: 16, borderRadius: 8, background:'#180000', color:'#f85149', fontSize:13 }}>
          <div style={{ fontWeight:600, marginBottom:4 }}>Component crashed{this.props.label?` (${this.props.label})`:''}</div>
          <div style={{ whiteSpace:'pre-wrap', fontFamily:'monospace', fontSize:11 }}>{this.state.error.message}</div>
          <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
            <button className='mini-btn' onClick={()=>this.setState({ error: null })}>Retry render</button>
            <a href='/' className='mini-btn' style={{ textDecoration:'none', lineHeight:1.4 }}>Home</a>
            <button className='mini-btn' onClick={()=>window.location.reload()}>Hard Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
