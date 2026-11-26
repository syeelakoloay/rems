/**
 * Menampilkan kumpulan pesan toast untuk umpan balik singkat kepada pengguna.
 */

import { createPortal } from 'react-dom';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

const toneMeta = {
  success: { icon: CheckCircle2, className: 'toast-success' },
  info: { icon: Info, className: 'toast-info' },
  warning: { icon: AlertTriangle, className: 'toast-warning' },
};

/**
 * Merender komponen toast stack dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function ToastStack({ toasts, onDismiss }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const meta = toneMeta[toast.tone] || toneMeta.info;
        const Icon = meta.icon;
        return (
          <div className={`toast ${meta.className}`} key={toast.id}>
            <Icon size={18} />
            <div className="toast-content">
              <strong>{toast.title}</strong>
              <span>{toast.message}</span>
            </div>
            <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Tutup notifikasi">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
