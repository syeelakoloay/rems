/**
 * Menyusun dashboard Admin, ringkasan metrik, aktivitas, serta akses ke fitur administrasi.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { Download, Package2, FileClock, CalendarClock } from 'lucide-react';

import { Card } from '../ui/Card';
import { CompactPagination } from '../ui/CompactPagination';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Field, TextInput } from '../ui/Field';
import { Modal } from '../ui/Modal';

import { jsPDF } from 'jspdf';
import { AccountManagement } from './AccountManagement';
import { AdminStock } from './AdminStock';

import { EXPIRY_ALERT_DAYS, ROLE_LABELS, STOCK_ALERT_THRESHOLD } from '../../data/constants';

import { AdminDashboardCharts } from './AdminDashboardCharts';
import { createAdminLineChartImage } from '../../lib/adminLineChartImage';
import { createAdminBarChartImage } from '../../lib/adminBarChartImage';
import { createAdminReportExporter } from './AdminReportExporter';
import { matchesDateFilter, formatDateTime as formatDateTimeWita } from '../../lib/date';
import { DateFilterBar } from '../prescription/DateFilterBar';
/**
 * Memeriksa apakah data grafik memuat setidaknya satu nilai numerik yang dapat digambar, sehingga tampilan dapat memilih grafik atau keadaan kosong.
 */
const hasChartData = (items) =>
  Array.isArray(items) &&
  items.some((item) => Number(item?.value ?? item?.qty ?? 0) > 0);


/**
 * Memeriksa apakah stok berada dalam rentang peringatan kedaluwarsa yang ditentukan sistem.
 */
const nearExpiry = (
  date
) => {
  if (!date) {
    return false;
  }

  const expiryTime =
    new Date(date).getTime();

  if (
    Number.isNaN(expiryTime)
  ) {
    return false;
  }

  const days =
    (
      expiryTime -
      Date.now()
    ) /
    86400000;

  return (
    days >= 0 &&
    days <=
      EXPIRY_ALERT_DAYS
  );
};


/* =====================================================
   SERIES TRANSAKSI STOK
===================================================== */

/** Mengelompokkan jumlah transaksi stok berdasarkan tanggal sesuai periode grafik. */
const stockTransactionSeries = (items, period) => {
  const now = new Date();
  const transactions = (items || [])
    .map((item) => ({ ...item, transactionDate: new Date(item?.time || item?.date || item?.createdAt || '') }))
    .filter((item) => !Number.isNaN(item.transactionDate.getTime()));

  if (period === 'day') {
    const endDate = new Date(now);
    endDate.setHours(0, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    const counts = new Map();

    transactions.forEach((item) => {
      const date = new Date(item.transactionDate);
      date.setHours(0, 0, 0, 0);
      if (date < startDate || date > endDate) return;
      const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
      return {
        label: date.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit' }),
        value: counts.get(key) || 0,
      };
    });
  }

  if (period === 'week') {
    const weekCount = 8;
    const latestWeekEnd = new Date(now);
    latestWeekEnd.setHours(23, 59, 59, 999);

    return Array.from({ length: weekCount }, (_, index) => {
      const weekEnd = new Date(latestWeekEnd);
      weekEnd.setDate(latestWeekEnd.getDate() - ((weekCount - index - 1) * 7));
      const weekStart = new Date(weekEnd);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - 6);
      const value = transactions.reduce((total, item) => (
        item.transactionDate >= weekStart && item.transactionDate <= weekEnd
          ? total + 1
          : total
      ), 0);

      return {
        label: weekEnd.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        value,
      };
    });
  }

  if (period === 'month') {
    const currentYear = now.getFullYear();
    const counts = Array(12).fill(0);
    transactions.forEach(({ transactionDate }) => {
      if (transactionDate.getFullYear() === currentYear) counts[transactionDate.getMonth()] += 1;
    });
    return counts.map((value, index) => ({
      label: new Date(currentYear, index, 1).toLocaleDateString('id-ID', { month: 'short' }),
      value,
    }));
  }

  const startYear = now.getFullYear() - 4;
  const counts = new Map();
  transactions.forEach(({ transactionDate }) => {
    const year = transactionDate.getFullYear();
    if (year >= startYear && year <= now.getFullYear()) counts.set(year, (counts.get(year) || 0) + 1);
  });
  return Array.from({ length: 5 }, (_, index) => {
    const year = startYear + index;
    return { label: String(year), value: counts.get(year) || 0 };
  });
};


/* =====================================================
   EXPORT OPTIONS
===================================================== */

const EXPORT_OPTIONS = [
  {
    key: 'kpi',
    label: 'Ringkasan KPI',
  },
  {
    key: 'transactionsWeek',
    label:
      'Line Chart (Transaksi Stok per Minggu)',
  },
  {
    key: 'transactionsMonth',
    label:
      'Line Chart (Transaksi Stok per Bulan)',
  },
  {
    key: 'transactionsYear',
    label:
      'Line Chart (Transaksi Stok per Tahun)',
  },
  {
    key: 'lowStock',
    label:
      'Bar Chart (Stok Obat Hampir Habis)',
  },
  {
    key: 'expiryStock',
    label:
      'Bar Chart (Stok Obat Hampir Kedaluwarsa)',
  },
  {
    key: 'activitiesAll',
    label:
      'Riwayat Akses (Semua)',
  },
  {
    key: 'activitiesToday',
    label:
      'Riwayat Akses (Hari Ini)',
  },
  {
    key: 'accounts',
    label:
      'Manajemen Akun',
  },
  {
    key: 'stock',
    label:
      'Stok Obat',
  },
];


/* =====================================================
   ADMIN PANEL
===================================================== */

/**
 * Merender komponen Admin panel dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function AdminPanel({
  currentUser,
  section,
  data,
  onReloadData,
  onAddAccount,
  onDeleteAccount,
  onChangeAccount,
  onToggleAccountStatus,
  onRequestPasswordReset,
  onExport,
  notify,
}) {
  if (
    section ===
    'dashboard'
  ) {
    return (
      <AdminDashboard
        currentUser={currentUser}
        data={data}
        onExport={onExport}
        notify={notify}
      />
    );
  }

  if (
    section ===
    'accounts'
  ) {
    return (
      <AccountManagement
        data={data}
        onReloadData={onReloadData}
        onAddAccount={
          onAddAccount
        }
        onDeleteAccount={
          onDeleteAccount
        }
        onChangeAccount={
          onChangeAccount
        }
        onToggleAccountStatus={
          onToggleAccountStatus
        }
        onRequestPasswordReset={onRequestPasswordReset}
        notify={notify}
      />
    );
  }

  return (
    <AdminStock data={data} />
  );
}


/* =====================================================
   ADMIN DASHBOARD
===================================================== */

/**
 * Merender komponen Admin dashboard dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
function AdminDashboard({
  currentUser,
  data,
  onExport,
  notify,
}) {
  const [
    activitySearch,
    setActivitySearch,
  ] = useState('');

  const [
    activitySort,
    setActivitySort,
  ] = useState('new');

  const [activityDateFilter, setActivityDateFilter] = useState({ start: '', end: '' });

  const [
    activityPage,
    setActivityPage,
  ] = useState(1);

  const [
    period,
    setPeriod,
  ] = useState('day');

  const [
    stockFilter,
    setStockFilter,
  ] = useState('low');


  /* ===================================================
     EXPORT MODAL
  =================================================== */

  const [
    exportModalOpen,
    setExportModalOpen,
  ] = useState(false);

  const [
    selectedExportSections,
    setSelectedExportSections,
  ] = useState(
    () =>
      EXPORT_OPTIONS.map(
        (item) =>
          item.key
      )
  );


    /**
   * Membuka modal ekspor dan menyiapkan pilihan bagian laporan sebelum Admin menentukan konten yang akan diunduh.
   */
  const openExportModal =
    () => {
      setSelectedExportSections(
        EXPORT_OPTIONS.map(
          (item) =>
            item.key
        )
      );

      setExportModalOpen(
        true
      );
    };


    /**
   * Mengubah pilihan satu bagian laporan yang akan disertakan pada proses ekspor.
   */
  const toggleExportSection =
    (key) => {
      setSelectedExportSections(
        (current) =>
          current.includes(key)
            ? current.filter(
                (item) =>
                  item !== key
              )
            : [
                ...current,
                key,
              ]
      );
    };


    /**
   * Memilih seluruh bagian laporan atau mengosongkan seluruh pilihan sekaligus.
   */
  const selectAllExportSections =
    () => {
      setSelectedExportSections(
        EXPORT_OPTIONS.map(
          (item) =>
            item.key
        )
      );
    };


  const ACTIVITY_PAGE_SIZE =
    10;


  const transactionChartRef =
    useRef(null);

  const stockChartRef =
    useRef(null);


  /* ===================================================
     DATA
  =================================================== */

  const stockTransactions = Object.values(data?.stockHistory || {}).flat();

  const stock =
    Object.values(
      data?.stock || {}
    );

  const activities =
    data?.activities || [];


  /* ===================================================
     KPI
  =================================================== */

  const low =
    stock.filter(
      (s) =>
        Number(s?.qty) <=
        STOCK_ALERT_THRESHOLD
    );

  const availableBatchCount = stock.reduce((total, item) => total + (item?.batches || []).filter((batch) => Number(batch?.qty) > 0 && (!batch?.expiryDate || new Date(batch.expiryDate) >= new Date())).length, 0);

  const exp =
    stock.filter(
      (s) =>
        nearExpiry(
          s?.expiryDate
        )
    );


  /* ===================================================
     CHART DATA
  =================================================== */

  const transactionSeries = stockTransactionSeries(stockTransactions, period);


  const stockSeries =
    useMemo(() => {
      const stockList =
        Object.values(
          data?.stock || {}
        );

      if (
        stockFilter ===
        'expiry'
      ) {
        const now =
          new Date();

        return stockList
          .filter((item) => {
            if (
              !item?.name ||
              !item?.expiryDate
            ) {
              return false;
            }

            const expiryDate =
              new Date(
                item.expiryDate
              );

            if (
              Number.isNaN(
                expiryDate.getTime()
              )
            ) {
              return false;
            }

            const daysLeft =
              Math.ceil(
                (
                  expiryDate.getTime() -
                  now.getTime()
                ) /
                  86400000
              );

            return (
              daysLeft >= 0 &&
              daysLeft <=
                EXPIRY_ALERT_DAYS
            );
          })
          .map((item) => {
            const expiryDate =
              new Date(
                item.expiryDate
              );

            const daysLeft =
              Math.ceil(
                (
                  expiryDate.getTime() -
                  now.getTime()
                ) /
                  86400000
              );

            return {
              label:
                item.name,

              value:
                daysLeft,

              unit:
                'hari',

              expiryDate:
                item.expiryDate,

              manufacturer:
                item.distributor ||
                item.manufacturer ||
                item.pabrik ||
                '-',
            };
          })
          .sort(
            (a, b) =>
              a.value -
              b.value
          );
      }

      return stockList
        .filter((item) => {
          const qty =
            Number(
              item?.qty
            ) || 0;

          return (
            qty <=
            STOCK_ALERT_THRESHOLD
          );
        })
        .map((item) => ({
          label:
            item.name,

          value:
            Number(
              item.qty
            ) || 0,

          unit:
            item.unit || '',

          manufacturer:
            item.distributor ||
            item.manufacturer ||
            item.pabrik ||
            '-',
        }))
        .sort(
          (a, b) =>
            a.value -
            b.value
        );
    }, [
      data?.stock,
      stockFilter,
    ]);


  /* ===================================================
     AKTIVITAS
  =================================================== */

  const filteredActivities =
    useMemo(() => {
      const keyword =
        activitySearch
          .trim()
          .toLowerCase();

      return [
        ...activities,
      ]
        .filter((item) => {
          if (activitySort === 'date' && !matchesDateFilter(item?.time, 'custom', activityDateFilter)) return false;
          if (!keyword) {
            return true;
          }

          const name =
            String(
              item?.user || ''
            ).toLowerCase();

          return name.includes(
            keyword
          );
        })
        .sort((a, b) => {
          const nameA =
            String(
              a?.user || ''
            ).trim();

          const nameB =
            String(
              b?.user || ''
            ).trim();

          const timeA =
            new Date(
              a?.time || 0
            ).getTime();

          const timeB =
            new Date(
              b?.time || 0
            ).getTime();

          switch (
            activitySort
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

            case 'old':
              return (
                timeA -
                timeB
              );

            case 'new':
            default:
              return (
                timeB -
                timeA
              );
          }
        });
    }, [
      activities,
      activitySearch,
      activitySort,
      activityDateFilter,
    ]);


  const activityTotalPages =
    Math.max(
      1,
      Math.ceil(
        filteredActivities.length /
          ACTIVITY_PAGE_SIZE
      )
    );


  const paginatedActivities =
    filteredActivities.slice(
      (
        activityPage -
        1
      ) *
        ACTIVITY_PAGE_SIZE,
      activityPage *
        ACTIVITY_PAGE_SIZE
    );


  useEffect(() => {
    setActivityPage(1);
  }, [
    activitySearch,
    activitySort,
    activityDateFilter,
  ]);


  useEffect(() => {
    setActivityPage(
      (page) =>
        Math.min(
          page,
          activityTotalPages
        )
    );
  }, [
    activityTotalPages,
  ]);


  /* ===================================================
     EXPORT REPORT
  =================================================== */

  const exportReport = createAdminReportExporter({
    EXPIRY_ALERT_DAYS,
    ROLE_LABELS,
    STOCK_ALERT_THRESHOLD,
    activities,
    createAdminBarChartImage,
    createAdminLineChartImage,
    currentUser,
    data,
    exp,
    jsPDF,
    low,
    notify,
    onExport,
    stockTransactionSeries,
    stockTransactions,
    setExportModalOpen,
    stock
  });


  return (
    <div className="workspace-stack">

      {/* =================================================
          DASHBOARD HEADER + KPI
      ================================================= */}

      <Card>

        <div className="section-head">

          <div>
            <h3>
              Dashboard
            </h3>

            <p>
              Ringkasan operasional apotek.
            </p>
          </div>


          <Button
            type="button"
            onClick={
              openExportModal
            }
          >
            <Download size={16} />
            Ekspor Laporan
          </Button>

        </div>


        <div className="metric-grid">

          <Metric
            icon={Package2}
            label="Jenis Obat Aktif"
            value={stock.length}
          />

          <Metric
            icon={FileClock}
            label="Batch Tersedia"
            value={availableBatchCount}
          />

          <Metric
            icon={Package2}
            label="Stok Hampir Habis"
            value={
              low.length
            }
          />

          <Metric
            icon={CalendarClock}
            label="Stok Hampir Kedaluwarsa"
            value={
              exp.length
            }
          />

        </div>

      </Card>


      {/* =================================================
          CHARTS
      ================================================= */}

      <AdminDashboardCharts
        period={period}
        setPeriod={setPeriod}
        transactionSeries={transactionSeries}
        transactionChartRef={transactionChartRef}
        hasChartData={hasChartData}
        stockFilter={stockFilter}
        setStockFilter={setStockFilter}
        stockSeries={stockSeries}
        stockChartRef={stockChartRef}
      />


      {/* =================================================
          RIWAYAT AKSES
      ================================================= */}

      <Card>

        <div className="section-head">

          <div>
            <h3>
              Riwayat Aktivitas
            </h3>

            <p>
              Pantau aktivitas pengguna.
            </p>
          </div>

        </div>


        <div className="search-row admin-access-filter-row">

          <Field label="Pencarian">

            <TextInput
              value={
                activitySearch
              }
              onChange={(e) =>
                setActivitySearch(
                  e.target.value
                )
              }
              placeholder="Cari nama pengguna"
            debounceMs={400}
/>

          </Field>


<DateFilterBar
            className="date-filter-inline"
            controlClassName="control control-compact"
            value={activitySort}
            customValue="date"
            fallbackValue="az"
            options={[
              { value: 'az', label: 'A-Z' },
              { value: 'za', label: 'Z-A' },
              { value: 'new', label: 'Terbaru' },
              { value: 'old', label: 'Terlama' },
              { value: 'date', label: 'Waktu/Tanggal' },
            ]}
            onChange={(nextValue) => {
              setActivitySort(nextValue);
              if (nextValue !== 'date') setActivityDateFilter({ start: '', end: '' });
            }}
            customDate={activityDateFilter}
            onCustomDateChange={setActivityDateFilter}
          />

        </div>


        <ActivityTable
          items={
            paginatedActivities
          }
          activitySearch={activitySearch}
        />


        {activityTotalPages > 1 && (
          <div className="activity-pagination admin-access-pagination">

            <button
              type="button"
              className="pagination-btn"
              onClick={() =>
                setActivityPage(
                  (page) =>
                    Math.max(
                      1,
                      page - 1
                    )
                )
              }
              disabled={
                activityPage ===
                1
              }
            >
              Sebelumnya
            </button>


            <CompactPagination currentPage={activityPage} totalPages={activityTotalPages} onPageChange={setActivityPage} />


            <button
              type="button"
              className="pagination-btn"
              onClick={() =>
                setActivityPage(
                  (page) =>
                    Math.min(
                      activityTotalPages,
                      page + 1
                    )
                )
              }
              disabled={
                activityPage ===
                activityTotalPages
              }
            >
              Berikutnya
            </button>

          </div>
        )}

      </Card>


      {/* =================================================
          MODAL EKSPOR LAPORAN
      ================================================= */}

      <Modal
        open={
          exportModalOpen
        }
        scrollable={false}
        title={
          <div className="section-head medication-modal-head">

            <div>

              <h3>
                Ekspor Laporan
              </h3>

              <p>
                Pilih informasi yang ingin dimasukkan ke dalam laporan PDF.
              </p>

            </div>

          </div>
        }
        onClose={() =>
          setExportModalOpen(
            false
          )
        }
        size="md"
      >

        <div className="account-preview-scroll">

          <div className="account-preview">

            <div className="preview-actions" style={{ justifyContent: 'flex-start', paddingTop: 0, paddingBottom: '8px' }}>
              <Button
                type="button"
                variant="ghost"
                onClick={selectAllExportSections}
              >
                Pilih Semua
              </Button>
            </div>

            <div className="stack">

              {EXPORT_OPTIONS.map(
                (
                  option
                ) => {
                  const checked =
                    selectedExportSections.includes(
                      option.key
                    );

                  return (
                    <label
                      key={
                        option.key
                      }
                      style={{
                        display:
                          'flex',

                        alignItems:
                          'center',

                        gap:
                          '10px',

                        padding:
                          '11px 13px',

                        border:
                          '1px solid rgba(148, 163, 184, 0.20)',

                        borderRadius:
                          '12px',

                        cursor:
                          'pointer',

                        background:
                          checked
                            ? 'rgba(239, 246, 255, 0.65)'
                            : 'rgba(248, 250, 252, 0.55)',

                        transition:
                          'all 0.2s ease',
                      }}
                    >

                      <input
                        type="checkbox"
                        checked={
                          checked
                        }
                        onChange={() =>
                          toggleExportSection(
                            option.key
                          )
                        }
                        style={{
                          width:
                            '17px',

                          height:
                            '17px',

                          flex:
                            '0 0 auto',

                          cursor:
                            'pointer',

                          accentColor:
                            '#176f83',
                        }}
                      />

                      <span
                        style={{
                          fontSize:
                            '0.9rem',

                          lineHeight:
                            1.4,

                          color:
                            'var(--text-primary, #0f172a)',

                          fontWeight:
                            checked
                              ? 600
                              : 500,
                        }}
                      >
                        {
                          option.label
                        }
                      </span>

                    </label>
                  );
                }
              )}

            </div>


            <div className="preview-actions">

              <Button
                type="button"
                onClick={() =>
                  exportReport(
                    selectedExportSections
                  )
                }
                disabled={
                  selectedExportSections.length ===
                    0
                }
              >
                <Download
                  size={16}
                />

                Konfirmasi
              </Button>

            </div>

          </div>

        </div>

      </Modal>

    </div>
  );
}


/* =====================================================
   METRIC
===================================================== */

/**
 * Merender komponen metric dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
function Metric({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="metric-card metric-blue">

      <div className="metric-icon">
        <Icon size={18} />
      </div>

      <div className="metric-content">

        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>

      </div>

    </div>
  );
}


/* =====================================================
   ACTIVITY TABLE
===================================================== */

/**
 * Merender komponen aktivitas tabel dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
function ActivityTable({
  items,
  activitySearch = '',
}) {
  return (
    <div className="table-shell">

      <table className="data-table">

        <thead>

          <tr>
            <th>
              Nama Lengkap
            </th>

            <th>
              Hak Akses
            </th>

            <th>
              Aktivitas
            </th>

            <th>
              Waktu/Tanggal
            </th>
          </tr>

        </thead>


        <tbody>

          {items.length ? (
            items.map(
              (a) => (
                <tr
                  key={
                    a.id
                  }
                >

                  <td>
                    {
                      a.user ||
                      '-'
                    }
                  </td>

                  <td>
                    {
                      a.roleLabel ||
                      '-'
                    }
                  </td>

                  <td>

                    <Badge
                      tone={
                        a.action ===
                        'Login'
                          ? 'green'
                          : 'gray'
                      }
                    >
                      {
                        a.action ||
                        '-'
                      }
                    </Badge>

                  </td>

                  <td>
                    {
                      a.time
                        ? formatDateTimeWita(a.time)
                        : '-'
                    }
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
                  {activitySearch.trim()
                    ? 'Tidak ada aktivitas untuk nama pengguna tersebut.'
                    : 'Belum ada aktivitas.'}
                </div>
              </td>

            </tr>
          )}

        </tbody>

      </table>

    </div>
  );
}


/* =====================================================
   ACCOUNT MANAGEMENT
===================================================== */

