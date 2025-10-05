'use client';
import React, { useState, useRef } from 'react';
import { api } from '../../../lib/api';

interface Props { portfolioId: string }

export default function UploadTrades({ portfolioId }: Props) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const presign = await api.presignTradesUpload(portfolioId, file.name);
      const put = await fetch(presign.url, { method: 'PUT', body: file, headers: { 'Content-Type': 'text/csv' } });
      if (!put.ok) throw new Error(`Upload failed ${put.status}`);
      setLastKey(presign.key);
      setMessage('File uploaded. Ingestion will process shortly...');
    } catch (e) {
      if (e instanceof Error) setMessage(e.message);
      else setMessage('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ margin: '12px 0 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{ padding: '6px 12px', background: '#1f6feb', color: '#fff', border: '1px solid #1b4b91', borderRadius: 4, cursor: uploading ? 'default' : 'pointer' }}
      >
        {uploading ? 'Uploading...' : 'Upload Trades CSV'}
      </button>
      {message && <span style={{ fontSize: 12, opacity: 0.8 }}>{message}</span>}
      {lastKey && <code style={{ fontSize: 11, background: '#161b22', padding: '2px 4px', borderRadius: 4 }}>key: {lastKey}</code>}
    </div>
  );
}
