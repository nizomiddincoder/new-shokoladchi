// Admin uchun umumiy kichik komponentlar
import React from 'react';
import { STATUS_LABEL, STATUS_BADGE } from '../lib/status';
import { IconX } from './Icons';

export function StatusBadge({ status }) {
  return <span className={STATUS_BADGE[status] || 'badge badge-neutral'}>{STATUS_LABEL[status] || status}</span>;
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="row-between mb-4">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Yopish"><IconX size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Kpi({ label, value }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value money">{value}</div>
    </div>
  );
}

export function Empty({ text = 'Ma\'lumot yo\'q' }) {
  return <div className="muted" style={{ padding: '32px 0', textAlign: 'center' }}>{text}</div>;
}

export function Loading() {
  return <div className="skeleton" style={{ height: 120 }} />;
}
