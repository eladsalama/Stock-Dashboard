"use client";
import React from 'react';

export interface Column<T> {
  key: keyof T | string;
  label: string;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
  onSortChange?: (next: { key: string; dir: 'asc' | 'desc' } | null) => void;
  rowKey: (row: T) => string;
  emptyMessage?: string;
  dense?: boolean;
}

export function DataTable<T>({ columns, rows, sort, onSortChange, rowKey, emptyMessage = 'No data', dense }: DataTableProps<T>) {
  function toggle(col: Column<T>) {
    if (!onSortChange || !col.sortable) return;
    const current = sort;
    if (!current || current.key !== String(col.key)) return onSortChange({ key: String(col.key), dir: 'asc' });
    if (current.dir === 'asc') return onSortChange({ key: current.key, dir: 'desc' });
    return onSortChange(null);
  }
  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => String(c.key) === sort.key);
    if (!col) return rows;
    const copy = [...rows];
    copy.sort((a: T, b: T) => {
      const av = (a as Record<string, unknown>)[sort.key];
      const bv = (b as Record<string, unknown>)[sort.key];
      if (typeof av === 'number' && typeof bv === 'number') return sort.dir === 'asc' ? av - bv : bv - av;
      return sort.dir === 'asc' ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''));
    });
    return copy;
  }, [rows, sort, columns]);

  return (
    <table className="data-table" style={dense ? { fontSize:11 } : undefined}>
      <thead>
        <tr>
          {columns.map(col => {
            const active = sort?.key === String(col.key);
            const arrow = active ? (sort!.dir === 'asc' ? '▲' : '▼') : '';
            return (
              <th key={String(col.key)} onClick={() => toggle(col)} style={{ width: col.width, textAlign: col.align || 'left', opacity: col.sortable ? 1 : 0.7 }}>
                {col.label} {col.sortable && <span style={{ opacity: 0.5 }}>{arrow}</span>}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={rowKey(r)}>
            {columns.map(c => (
              <td key={String(c.key)} style={{ textAlign: c.align || 'left' }}>
                {c.render ? c.render(r) : (r as Record<string, unknown>)[c.key as string] as React.ReactNode}
              </td>
            ))}
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={columns.length} style={{ padding: '6px 8px', opacity: 0.6 }}>{emptyMessage}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
