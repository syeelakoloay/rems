/**
 * Menyediakan kontrol perpindahan halaman untuk tabel.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CompactPagination } from './CompactPagination';

/**
 * Merender komponen tabel pagination dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function TablePagination({
  currentPage,
  totalPages,
  onPageChange,
  ariaLabel = 'Navigasi halaman tabel',
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="activity-pagination" aria-label={ariaLabel}>
      <button
        type="button"
        className="pagination-btn"
        onClick={() => onPageChange?.((page) => Math.max(1, page - 1))}
        disabled={currentPage <= 1}
      >
        <ChevronLeft size={15} aria-hidden="true" />
        <span>Sebelumnya</span>
      </button>

      <CompactPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        ariaLabel={ariaLabel}
      />

      <button
        type="button"
        className="pagination-btn"
        onClick={() => onPageChange?.((page) => Math.min(totalPages, page + 1))}
        disabled={currentPage >= totalPages}
      >
        <span>Berikutnya</span>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </nav>
  );
}
