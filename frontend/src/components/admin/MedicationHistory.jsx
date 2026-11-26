/**
 * Menampilkan riwayat perubahan atau aktivitas terkait data obat.
 */
import { useMemo, useState } from 'react';
import { Eye, Package2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { STOCK_ALERT_THRESHOLD } from '../../data/constants';
import { matchesDateFilter, formatDate as formatCalendarDate } from '../../lib/date';
import { DateFilterBar } from '../prescription/DateFilterBar';

import { Button } from '../ui/Button';
import { Field, TextInput } from '../ui/Field';
import { usePaginatedItems } from '../ui/usePaginatedItems';
import { TablePagination } from '../ui/TablePagination';

/**
 * Merender komponen obat riwayat dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function MedicationHistory({
  stockName,
  data,
  onViewHistory,
  onClose,
}) {
  const [
    batchSearch,
    setBatchSearch,
  ] = useState('');

  const [
    batchSort,
    setBatchSort,
  ] = useState(
    'expiry-near'
  );

  const [batchDateFilter, setBatchDateFilter] = useState({ start: '', end: '' });


  const s =
    data?.stock?.[
      stockName
    ];


  const batches =
    useMemo(() => {
      const source =
        s?.batches ||
        s?.batchList ||
        [];

      return Array.isArray(
        source
      )
        ? [
            ...source,
          ]
        : Object.values(
            source || {}
          );
    }, [
      s,
    ]);


  const filteredBatches =
    useMemo(() => {
      const keyword =
        batchSearch
          .trim()
          .toLowerCase();

      return [
        ...batches,
      ]
        .filter(
          (batch) => {
            if (batchSort === 'date' && !matchesDateFilter(batch?.expiryDate || batch?.expiry, 'custom', batchDateFilter)) return false;
            if (!keyword) {
              return true;
            }

            return String(
              batch?.batchNumber ||
                batch?.batch ||
                ''
            )
              .toLowerCase()
              .includes(
                keyword
              );
          }
        )
        .sort(
          (a, b) => {
            const expiryA =
              new Date(
                a?.expiryDate ||
                  a?.expiry ||
                  0
              ).getTime();

            const expiryB =
              new Date(
                b?.expiryDate ||
                  b?.expiry ||
                  0
              ).getTime();

            const createdA =
              new Date(
                a?.createdAt ||
                  a?.addedAt ||
                  a?.receivedAt ||
                  0
              ).getTime();

            const createdB =
              new Date(
                b?.createdAt ||
                  b?.addedAt ||
                  b?.receivedAt ||
                  0
              ).getTime();

            switch (
              batchSort
            ) {
              case 'expiry-near':
                return (
                  expiryA -
                  expiryB
                );

              case 'expiry-far':
                return (
                  expiryB -
                  expiryA
                );

              case 'new':
                return (
                  createdB -
                  createdA
                );

              case 'old':
                return (
                  createdA -
                  createdB
                );

              default:
                return 0;
            }
          }
        );
    }, [
      batches,
      batchSearch,
      batchSort,
      batchDateFilter,
    ]);

  const { currentPage, setCurrentPage, totalPages, paginatedItems } = usePaginatedItems(filteredBatches);



  return (
    <div className="stack">

      <div className="document-split-layout stock-detail-layout">
        <div className="detail-medication-image" aria-label={`Gambar obat ${s?.name || stockName || ''}`}>
          {s?.image ? (
            <img src={s.image} alt={`Gambar ${s?.name || stockName || 'obat'}`} />
          ) : (
            <div className="detail-medication-image-placeholder">
              <Package2 size={42} aria-hidden="true" />
              <span>Gambar obat belum tersedia</span>
            </div>
          )}
        </div>

        <div className="document-info-pane stock-detail-info-pane">
          <div className="preview-grid stock-detail-info-grid">
            <div className="preview-item">
              <span>Nama Obat</span>
              <strong>{s?.name || stockName || '-'}</strong>
            </div>
            <div className="preview-item">
              <span>ID</span>
              <strong>{s?.id || '-'}</strong>
            </div>
            <div className="preview-item">
              <span>Pabrik</span>
              <strong>{s?.distributor || s?.manufacturer || s?.pabrik || '-'}</strong>
            </div>
            <div className="preview-item">
              <span>Stok</span>
              <strong className="stock-quantity-value prescription-status-value">
                {s?.qty ?? 0} {s?.unit || ''}
                {Number(s?.qty ?? 0) <= Number(s?.minStock ?? STOCK_ALERT_THRESHOLD) * 1.25 ? (
                  <Badge tone="warning">
                    {Number(s?.qty ?? 0) < Number(s?.minStock ?? STOCK_ALERT_THRESHOLD)
                      ? 'Di bawah batas minimum'
                      : Number(s?.qty ?? 0) <= Number(s?.minStock ?? STOCK_ALERT_THRESHOLD)
                        ? 'Mencapai batas minimum'
                        : 'Hampir habis'}
                  </Badge>
                ) : null}
              </strong>
            </div>
            <div className="preview-item">
              <span>Batas Minimum Stok</span>
              <strong>{Number(s?.minStock ?? STOCK_ALERT_THRESHOLD)} {s?.unit || ''}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="edit-account-form-card">

        <div className="search-row">

          <Field label="Pencarian">

            <TextInput
              value={
                batchSearch
              }
              onChange={(e) =>
                setBatchSearch(
                  e.target
                    .value
                )
              }
              placeholder="Cari nomor batch"
            debounceMs={400}
/>

          </Field>


<DateFilterBar
              className="date-filter-inline"
              controlClassName="control control-compact"
              value={batchSort}
              customValue="date"
              fallbackValue="expiry-near"
              options={[
                { value: 'expiry-near', label: 'Kedaluwarsa Terdekat' },
                { value: 'expiry-far', label: 'Kedaluwarsa Terjauh' },
                { value: 'new', label: 'Terakhir Ditambahkan' },
                { value: 'old', label: 'Pertama Ditambahkan' },
                { value: 'date', label: 'Tanggal Kedaluwarsa' },
              ]}
              onChange={(nextValue) => {
                setBatchSort(nextValue);
                if (nextValue !== 'date') setBatchDateFilter({ start: '', end: '' });
              }}
              customDate={batchDateFilter}
              onCustomDateChange={setBatchDateFilter}
            />

        </div>


        <div className="table-shell batch-table-shell admin-stock-batch-table-shell">

          <table className="data-table">

            <thead>

              <tr>

                <th>
                  Nomor Batch
                </th>

                <th>
                  Tanggal Kedaluwarsa
                </th>

                <th>
                  Stok
                </th>

                <th>
                  Aksi
                </th>

              </tr>

            </thead>


            <tbody>

              {filteredBatches.length ? (
                paginatedItems.map(
                  (
                    batch,
                    index
                  ) => (
                    <tr
                      key={
                        `${
                          batch?.batchNumber ||
                          '-'
                        }-${
                          batch?.expiryDate ||
                          '-'
                        }-${
                          batch?.receivedAt ||
                          batch?.createdAt ||
                          ''
                        }-${index}`
                      }
                    >

                      <td>
                        {
                          batch?.batchNumber ||
                          '-'
                        }
                      </td>


                      <td>
                        {
                          batch?.expiryDate
                            ? formatCalendarDate(batch.expiryDate)
                            : '-'
                        }
                      </td>


                      <td>
                        {
                          batch?.qty ??
                          batch?.quantity ??
                          0
                        }{' '}
                        {
                          s?.unit ||
                          ''
                        }
                      </td>


                      <td>

                        <Button
                          size="sm"
                          variant="ghost"
                          title="Selengkapnya"
                          aria-label={`Lihat riwayat batch ${batch?.batchNumber || ''}`}
                          onClick={() => onViewHistory?.(batch)}
                        >
                          <Eye size={16} className="admin-stock-batch-eye-icon" aria-hidden="true" />
                          <span className="sr-only">Selengkapnya</span>
                        </Button>

                      </td>

                    </tr>
                  )
                )
              ) : (
                <tr>

                  <td
                    colSpan="4"
                  >
                    <div className="empty-table">
                      {
                        batchSearch.trim()
                          ? 'Nomor batch tidak ditemukan.'
                          : 'Belum ada batch stok.'
                      }
                    </div>
                  </td>

                </tr>
              )}

            </tbody>

          </table>

        </div>
        <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />

      </div>

    </div>
  );
}
