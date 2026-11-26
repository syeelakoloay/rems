/**
 * Mengelola tampilan modal, fokus keyboard, dan penguncian scroll halaman ketika modal terbuka.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const openModalStack = [];
let bodyScrollLockCount = 0;
let previousBodyOverflow = '';

/**
 * Mengatur kunci antarmuka untuk body scroll agar interaksi halaman tetap konsisten.
 */
function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('has-open-modal');
  }
  bodyScrollLockCount += 1;
}

/**
 * Mengatur kunci antarmuka untuk body scroll agar interaksi halaman tetap konsisten.
 */
function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.body.classList.remove('has-open-modal');
  }
}

/**
 * Merender komponen modal dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function Modal({
  open,
  title,
  children,
  onClose,
  size = 'xl',
  scrollable = true,
  className = '',
}) {
  const modalId = useRef(Symbol('modal'));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const id = modalId.current;
    lockBodyScroll();
    const previousIndex = openModalStack.indexOf(id);
    if (previousIndex >= 0) openModalStack.splice(previousIndex, 1);
    openModalStack.push(id);

        /**
     * Menangani tombol keyboard pada modal, termasuk Escape untuk menutup modal bila penutupan diizinkan.
     */
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && openModalStack[openModalStack.length - 1] === id) {
        onCloseRef.current?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const index = openModalStack.indexOf(id);
      if (index >= 0) openModalStack.splice(index, 1);
      unlockBodyScroll();
    };
  }, [open]);

  if (!open) return null;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`modal-surface modal-${size} ${scrollable ? '' : 'modal-no-scroll'} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`modal-header ${scrollable ? 'modal-header-scrollable' : ''}`.trim()}>
          <div className="modal-header-content">{title}</div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Tutup modal"
          >
            <X size={18} />
          </button>
        </div>
        <div className={`modal-body ${scrollable ? 'modal-body-scrollable' : 'modal-body-contained'}`}>
          <div className="modal-body-viewport">
            <div className={`modal-body-scroll ${scrollable ? 'is-scrollable' : 'is-contained'}`}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
