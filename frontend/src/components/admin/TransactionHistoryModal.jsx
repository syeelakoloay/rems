/**
 * Menampilkan detail riwayat transaksi dalam modal.
 */
import { useMemo, useState } from 'react';

import { Badge } from '../ui/Badge';
import { DateFilterBar } from '../prescription/DateFilterBar';
import {
  matchesDateFilter,
  formatDate as formatCalendarDate,
  formatDateTime as formatDateTimeWita,
} from '../../lib/date';
import { usePaginatedItems } from '../ui/usePaginatedItems';
import { TablePagination } from '../ui/TablePagination';

/**
 * Memformat tanggal untuk tampilan pengguna atau keluaran laporan tanpa mengubah nilai sumber.
 */
const formatDate = (date) => {
  if (!date) return '-';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';
  return formatCalendarDate(date);
};

/**
 * Merender komponen transaksi riwayat modal dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function TransactionHistoryModal({
  stock,
  batch,
  history,
}) {
  const [dateFilter, setDateFilter] = useState('new');
  const [customDate, setCustomDate] = useState({ start: '', end: '' });
  const filteredHistory = useMemo(() => {
    const rows = (history || []).filter((item) =>
      matchesDateFilter(
        item?.time || item?.createdAt || item?.date,
        ['today', 'custom'].includes(dateFilter) ? dateFilter : 'all',
        customDate,
      )
    );
    return rows.sort((a, b) => {
      const aTime = new Date(a?.time || a?.createdAt || a?.date || 0).getTime();
      const bTime = new Date(b?.time || b?.createdAt || b?.date || 0).getTime();
      return dateFilter === 'old' ? aTime - bTime : bTime - aTime;
    });
  }, [history, dateFilter, customDate]);
  const { currentPage, setCurrentPage, totalPages, paginatedItems } = usePaginatedItems(filteredHistory);

  return (
    <div className="stack">

      <div className="result-card">

        <div className="result-meta">

          <span>
            Nomor Batch:{' '}
            <strong>
              {
                batch?.batchNumber ||
                '-'
              }
            </strong>
          </span>

          <span>
            Tanggal Kedaluwarsa:{' '}
            {
              formatDate(
                batch?.expiryDate
              )
            }
          </span>

          <span>
            Stok:{' '}
            {
              batch?.qty ??
              0
            }{' '}
            {
              stock?.unit ||
              ''
            }
          </span>

        </div>

      </div>


      <DateFilterBar
        value={dateFilter}
        onChange={(nextValue) => { setDateFilter(nextValue); if (nextValue !== 'custom') setCustomDate({ start: '', end: '' }); }}
        dateLabel="Waktu/Tanggal"
        customDate={customDate}
        onCustomDateChange={setCustomDate}
        options={[
          { value: 'new', label: 'Terbaru' },
          { value: 'old', label: 'Terlama' },
          { value: 'today', label: 'Hari Ini' },
          { value: 'custom', label: 'Waktu/Tanggal' },
        ]}
        customValue="custom"
        fallbackValue="new"
      />

      <div className="table-shell transaction admin-stock-history-table-shell">
        <table className="data-table admin-stock-history-table">

          <thead>

            <tr>

              <th style={{ width: '24%' }}>
                ID Transaksi
              </th>

              <th style={{ width: '25%' }}>
                Waktu/Tanggal
              </th>

              <th style={{ width: '15%' }}>
                Jenis
              </th>

              <th style={{ width: '16%' }}>
                Jumlah
              </th>

              <th style={{ width: '20%' }}>
                Petugas
              </th>

            </tr>

          </thead>


          <tbody>

            {filteredHistory.length ? (
              paginatedItems.map(
                (
                  item,
                  index
                ) => {
                  const transactionId =
                    item?.transactionId ||
                    item?.id ||
                    '-';

                  const time =
                    item?.time ||
                    item?.createdAt ||
                    item?.date ||
                    null;

                  const type =
                    item?.type ||
                    item?.action ||
                    '-';

                  const quantity =
                    item?.qty ??
                    item?.quantity ??
                    0;

                  const officer =
                    item?.officer ||
                    item?.by ||
                    '-';

                  return (
                    <tr
                      key={
                        transactionId !==
                        '-'
                          ? transactionId
                          : index
                      }
                    >

                      <td
                        style={{
                          overflowWrap:
                            'anywhere',
                          wordBreak:
                            'break-word',
                        }}
                      >
                        {
                          transactionId
                        }
                      </td>

                      <td
                        style={{
                          whiteSpace:
                            'normal',
                          overflowWrap:
                            'anywhere',
                        }}
                      >
                        {time
                          ? formatDateTimeWita(time)
                          : '-'}
                      </td>

                      <td>

                        <Badge
                          tone={
                            type ===
                              'in' ||
                            type ===
                              'Masuk'
                              ? 'green'
                              : 'yellow'
                          }
                        >
                          {
                            type ===
                              'in' ||
                            type ===
                              'Masuk'
                              ? 'Masuk'
                              : 'Keluar'
                          }
                        </Badge>

                      </td>

                      <td>
                        {
                          quantity
                        }{' '}
                        {
                          stock?.unit ||
                          ''
                        }
                      </td>

                      <td
                        style={{
                          overflowWrap:
                            'anywhere',
                          wordBreak:
                            'break-word',
                        }}
                      >
                        {
                          officer
                        }
                      </td>

                    </tr>
                  );
                }
              )
            ) : (
              <tr>

                <td
                  colSpan="5"
                >
                  <div className="empty-table">
                    {history?.length ? 'Tidak ada transaksi pada tanggal yang dipilih.' : 'Belum ada transaksi untuk batch ini.'}
                  </div>
                </td>

              </tr>
            )}

          </tbody>

        </table>

      </div>
      <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />

    </div>
  );
}


/* =====================================================
   MEDICATION HISTORY
===================================================== */
