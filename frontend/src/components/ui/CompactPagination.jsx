/**
 * Menghasilkan kontrol navigasi halaman yang ringkas untuk daftar data.
 */


/**
 * Menyusun rentang nomor halaman di sekitar halaman aktif serta mempertahankan halaman awal/akhir dan penanda lompatan saat daftar halaman panjang.
 */
function getCompactPageNumbers(currentPage, totalPages) {
  const total = Math.max(0, Number(totalPages) || 0);
  const current = Math.min(total, Math.max(1, Number(currentPage) || 1));

  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  // Start compactly: 1, 2, 3, …, last. When page 3 (next to the ellipsis)
  // is selected, reveal page 4 as its right neighbor. In the middle of a long
  // range, keep the active page centered between its previous and next pages.
  if (current <= 2) {
    return [1, 2, 3, 'ellipsis-right', total];
  }

  if (current === 3) {
    return [1, 2, 3, 4, 'ellipsis-right', total];
  }

  if (current >= total - 2) {
    return [1, 'ellipsis-left', total - 3, total - 2, total - 1, total];
  }

  return [1, 'ellipsis-left', current - 1, current, current + 1, 'ellipsis-right', total];
}

/**
 * Merender komponen compact pagination dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function CompactPagination({ currentPage, totalPages, onPageChange, ariaLabel = 'Navigasi halaman' }) {
  const pages = getCompactPageNumbers(currentPage, totalPages);

  return (
    <div className="pagination-pages" aria-label={ariaLabel}>
      {pages.map((page) => {
        if (typeof page === 'string') {
          return (
            <span className="pagination-ellipsis" key={page} aria-hidden="true">
              …
            </span>
          );
        }

        return (
          <button
            key={page}
            type="button"
            className={`pagination-btn pagination-number ${currentPage === page ? 'active' : ''}`}
            onClick={() => onPageChange?.(page)}
            aria-current={currentPage === page ? 'page' : undefined}
            aria-label={`Halaman ${page}`}
          >
            {page}
          </button>
        );
      })}
    </div>
  );
}
