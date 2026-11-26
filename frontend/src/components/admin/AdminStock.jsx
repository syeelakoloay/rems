/**
 * Menyediakan tampilan pemantauan stok dari sisi Admin beserta detail batch dan riwayat transaksi.
 */
import { useMemo, useState } from 'react';

import { Package2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Field, SearchableSelect, TextInput } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { TransactionHistoryModal } from './TransactionHistoryModal';
import { MedicationHistory } from './MedicationHistory';
import { usePaginatedItems } from '../ui/usePaginatedItems';
import { TablePagination } from '../ui/TablePagination';
import { getStockCardTone, getNearestExpiryLabel } from '../../lib/stock';

/**
 * Merender komponen Admin stok dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function AdminStock({ data }) {
  const [
    q,
    setQ,
  ] = useState('');

  const [
    sort,
    setSort,
  ] = useState('az');

  const [
    selected,
    setSelected,
  ] = useState(null);

  const [
    transactionModalOpen,
    setTransactionModalOpen,
  ] = useState(false);

  const [
    selectedBatch,
    setSelectedBatch,
  ] = useState(null);

  const stocks =
    useMemo(() => {
      const list =
        Object.values(
          data?.stock ||
            {}
        ).filter(
          (s) =>
            String(
              s?.name || ''
            )
              .toLowerCase()
              .includes(
                q.toLowerCase()
              )
        );

      return [
        ...list,
      ].sort(
        (a, b) => {
          const nameA =
            String(
              a?.name ||
                ''
            ).trim();

          const nameB =
            String(
              b?.name ||
                ''
            ).trim();

          const dateA =
            new Date(
              a?.createdAt ||
                0
            ).getTime();

          const dateB =
            new Date(
              b?.createdAt ||
                0
            ).getTime();

          switch (
            sort
          ) {
            case 'az':
              return nameA.localeCompare(
                nameB,
                'id',
                {
                  sensitivity:
                    'base',
                }
              );

            case 'za':
              return nameB.localeCompare(
                nameA,
                'id',
                {
                  sensitivity:
                    'base',
                }
              );

            case 'new':
              return (
                dateB -
                dateA
              );

            case 'old':
              return (
                dateA -
                dateB
              );

            default:
              return 0;
          }
        }
      );
    }, [
      data?.stock,
      q,
      sort,
    ]);

  const { currentPage: stockPage, setCurrentPage: setStockPage, totalPages: stockTotalPages, paginatedItems: paginatedStocks } = usePaginatedItems(stocks);


  const activeStock =
    selected
      ? data?.stock?.[
          selected
        ]
      : null;


  const transactionHistory =
    useMemo(() => {
      if (
        !selected ||
        !selectedBatch
      ) {
        return [];
      }

      const history =
        Array.isArray(
          data?.stockHistory?.[
            selected
          ]
        )
          ? [
              ...data.stockHistory[
                selected
              ],
            ]
          : [];

      return history
        .filter(
          (item) =>
            (
              item?.batchNumber ||
              item?.batch ||
              '-'
            ) ===
              (
                selectedBatch?.batchNumber ||
                '-'
              ) &&
            (
              item?.expiryDate ||
              ''
            ) ===
              (
                selectedBatch?.expiryDate ||
                ''
              )
        )
        .sort(
          (a, b) =>
            new Date(
              b?.time ||
              b?.date ||
              b?.createdAt ||
              0
            ) -
            new Date(
              a?.time ||
              a?.date ||
              a?.createdAt ||
              0
            )
        );
    }, [
      selected,
      selectedBatch,
      data?.stockHistory,
    ]);


    /**
   * Menetapkan batch terpilih sebagai konteks, lalu membuka modal riwayat transaksi batch tersebut.
   */
  const openTransactionHistory =
    (batch) => {
      setSelectedBatch(
        batch
      );

      setTransactionModalOpen(
        true
      );
    };


  /**
   * Menutup tampilan transaksi modal dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
   */
  const closeTransactionModal =
    () => {
      setTransactionModalOpen(
        false
      );

      setSelectedBatch(
        null
      );
    };




  return (
    <div className="workspace-stack">

      <Card>

        <div className="section-head">

          <div>

            <h3>
              Daftar Obat
            </h3>

            <p>
              Pantau stok obat di apotek.
            </p>

          </div>

        </div>


        <div className="search-row">

          <Field label="Pencarian">

            <TextInput
              value={q}
              onChange={(e) =>
                setQ(
                  e.target
                    .value
                )
              }
              placeholder="Cari nama obat"
            debounceMs={400}
/>

          </Field>


          <Field label="Filter">

            <SearchableSelect
              className="control control-compact"
              value={sort}
              onChange={(e) =>
                setSort(
                  e.target
                    .value
                )
              }
            >
              <option value="az">
                A-Z
              </option>

              <option value="za">
                Z-A
              </option>

              <option value="new">
                Terbaru
              </option>

              <option value="old">
                Terlama
              </option>
            </SearchableSelect>

          </Field>

        </div>


        <div className="stock-grid">

          {stocks.length ? (
            paginatedStocks.map(
              (s) => (
                <button
                  type="button"
                  className="stock-card"
                  key={s._id || s.id}
                  onClick={() => setSelected(s._id || s.id)}
                >

                  <div className="stock-image">

                    {s.image ? (
                      <img
                        src={
                          s.image
                        }
                        alt={
                          s.name
                        }
                      />
                    ) : (
                      <Package2
                        size={
                          26
                        }
                      />
                    )}

                  </div>


                  <div className="stock-card-information stock-card-information-admin">
                    <div className="stock-card-admin-row">
                      <div className="stock-card-admin-left">
                        <span className="stock-card-admin-name">{s.name}</span>
                      </div>
                      <div className="stock-card-admin-right">
                        <Badge className="stock-card-quantity" tone={getStockCardTone(s)}>
                          {s.qty ?? 0} {s.unit || ''}
                        </Badge>
                      </div>
                    </div>
                    <div className="stock-card-admin-row">
                      <div className="stock-card-admin-left">
                        <span className="stock-card-admin-manufacturer">{s.distributor || s.manufacturer || s.pabrik || '-'}</span>
                      </div>
                      <div className="stock-card-admin-right stock-card-admin-expiry">
                        <span>{getNearestExpiryLabel(s)}</span>
                      </div>
                    </div>
                  </div>

                </button>
              )
            )
          ) : (
            <div className="empty-inline">

              {
                q.trim()
                  ? 'Obat dengan nama tersebut tidak ditemukan.'
                  : 'Belum ada stok obat yang tersedia.'
              }

            </div>
          )}

        </div>
        <TablePagination currentPage={stockPage} totalPages={stockTotalPages} onPageChange={setStockPage} />

      </Card>


      <Modal
        open={Boolean(selected)}
        scrollable={false}
        title={
          <div className="section-head medication-modal-head">

            <div>

              <h3>
                Detail Obat
              </h3>

              <p>
                Informasi obat dan daftar batch.
              </p>

            </div>

          </div>
        }
        onClose={() =>
          setSelected(
            null
          )
        }
      >

        {selected ? (
          <div className="account-preview-scroll">
            <div className="account-preview">
              <MedicationHistory
                stockName={selected}
                data={data}
                onViewHistory={openTransactionHistory}
                onClose={() => setSelected(null)}
              />
            </div>
          </div>
        ) : null}

      </Modal>

      <Modal
        open={
          transactionModalOpen
        }
        title={
          <div className="section-head medication-modal-head">

            <div>

              <h3>
                Riwayat Stok
              </h3>

              <p>
                Catatan stok masuk dan keluar.
              </p>

            </div>

          </div>
        }
        onClose={
          closeTransactionModal
        }
      >

        {selected ? (
          <TransactionHistoryModal
            stock={
              activeStock
            }
            batch={
              selectedBatch
            }
            history={
              transactionHistory
            }
          />
        ) : null}

      </Modal>

    </div>
  );
}


/* =====================================================
   TRANSACTION HISTORY
===================================================== */
