/**
 * Menyediakan logika pemotongan data menjadi halaman dan menghitung informasi pagination.
 */
import { useEffect, useMemo, useState } from 'react';

const EMPTY_ITEMS = [];
const DEFAULT_PAGE_SIZE = 10;

/**
 * Shared pagination for tables and record lists. The caller should pass a
 * memoized/otherwise stable array so edits to the current page do not reset it.
 */
export function usePaginatedItems(items = EMPTY_ITEMS, pageSize = DEFAULT_PAGE_SIZE) {
  const source = Array.isArray(items) ? items : EMPTY_ITEMS;
  const safePageSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(source.length / safePageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [source]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * safePageSize;
    return source.slice(start, start + safePageSize);
  }, [source, currentPage, safePageSize]);

  return {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems,
    pageSize: safePageSize,
  };
}
