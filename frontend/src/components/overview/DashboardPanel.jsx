/**
 * Menyusun dashboard pengguna, ringkasan resep, aktivitas, dan laporan yang tersedia untuk perannya.
 */
import { useMemo, useState, useEffect } from 'react';
import {
  isEditableWithin24Hours,
  matchesDateFilter,
  isSameDay,
  isWithinLastSevenCalendarDays,
  isSameMonth,
  isSameYear,
  formatDateTime as formatDateTimeWita,
} from '../../lib/date';
import { DateFilterBar } from '../prescription/DateFilterBar';
import {
  getPatientForPrescription,
  getPatientName,
  getPatientPhone,
  getPatientBpjs,
} from '../../lib/patients';

import {
  Plus,
  CalendarClock,
  FileText,
  FileClock,
  Calendar,
  CalendarDays,
  CalendarRange,
  Package2,
  Download,
  PencilLine,
  Save,
} from 'lucide-react';

import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { CompactPagination } from '../ui/CompactPagination';
import { usePaginatedItems } from '../ui/usePaginatedItems';
import { TablePagination } from '../ui/TablePagination';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field, SearchableSelect, TextInput } from '../ui/Field';

import { STOCK_ALERT_THRESHOLD, EXPIRY_ALERT_DAYS } from '../../data/constants';

import jsPDF from 'jspdf';

import { DashboardCharts } from './DashboardCharts';
import { createDashboardLineChartImage } from '../../lib/dashboardLineChartImage';
import { createDashboardBarChartImage } from '../../lib/dashboardBarChartImage';
import { createDashboardReportExporter } from './DashboardReportExporter';
import { capitalizeFirstLetter } from '../../lib/text';
import { getNextPickupDate, getPrescriptionRedemptionTime, formatPrescriptionRedemptionTime as getPickedDate } from '../../lib/prescriptions';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Memeriksa apakah data grafik memiliki setidaknya satu nilai numerik positif agar dashboard dapat memilih antara grafik dan tampilan kosong.
 */
const hasChartData = (items) =>
  Array.isArray(items) &&
  items.some((item) => Number(item?.value ?? item?.qty ?? 0) > 0);


/**
 * Menentukan status resep untuk ringkasan dashboard: status picked tetap ditebus, sedangkan status lainnya dihitung sebagai menunggu.
 */
const getEffectivePrescriptionStatus = (prescription) =>
  prescription?.status === 'picked' ? 'picked' : 'pending';


/**
 * Memeriksa apakah tanggal kedaluwarsa berada dalam rentang hari peringatan dari sekarang; tanggal kosong atau tidak valid tidak dihitung.
 */
const isNearExpiry = (
  date,
  days = EXPIRY_ALERT_DAYS
) => {
  if (!date) {
    return false;
  }

  const d =
    new Date(date);

  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    return false;
  }

  const now =
    new Date();

  return (
    (
      d.getTime() -
      now.getTime()
    ) / DAY_MS <= days
  );
};


/* =====================================================
   CHART SERIES
===================================================== */

/**
 * Mengelompokkan total resep menurut periode untuk grafik tren pada dashboard.
 */
const totalPrescriptionSeries = (
  items,
  period
) => {
  const now =
    new Date();

  const prescriptionItems =
    (items || [])
      .map((item) => {
        const date =
          new Date(
            item?.createdAt
          );

        if (
          Number.isNaN(
            date.getTime()
          )
        ) {
          return null;
        }

        return {
          ...item,
          createdDate: date,
        };
      })
      .filter(Boolean);


  if (period === 'day') {
    const endDate =
      new Date(now);

    endDate.setHours(
      0,
      0,
      0,
      0
    );

    const startDate =
      new Date(endDate);

    startDate.setDate(
      startDate.getDate() - 6
    );

    const counts = {};

    prescriptionItems.forEach(
      (item) => {
        const date =
          new Date(
            item.createdDate
          );

        date.setHours(
          0,
          0,
          0,
          0
        );

        if (
          date < startDate ||
          date > endDate
        ) {
          return;
        }

        const key = [
          date.getFullYear(),
          String(
            date.getMonth() + 1
          ).padStart(2, '0'),
          String(
            date.getDate()
          ).padStart(2, '0'),
        ].join('-');

        counts[key] =
          (counts[key] || 0) + 1;
      }
    );

    return Array.from(
      { length: 7 },
      (_, index) => {
        const date =
          new Date(startDate);

        date.setDate(
          startDate.getDate() +
            index
        );

        const key = [
          date.getFullYear(),
          String(
            date.getMonth() + 1
          ).padStart(2, '0'),
          String(
            date.getDate()
          ).padStart(2, '0'),
        ].join('-');

        return {
          label:
            date.toLocaleDateString(
              'id-ID',
              {
                weekday: 'short',
                day: 'numeric',
              }
            ),

          value:
            counts[key] || 0,
        };
      }
    );
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
      const value = prescriptionItems.reduce((total, item) => (
        item.createdDate >= weekStart && item.createdDate <= weekEnd
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
    const currentYear =
      now.getFullYear();

    const counts =
      Array(12).fill(0);

    prescriptionItems.forEach(
      (item) => {
        const date =
          item.createdDate;

        if (
          date.getFullYear() !==
          currentYear
        ) {
          return;
        }

        counts[
          date.getMonth()
        ] += 1;
      }
    );

    return Array.from(
      { length: 12 },
      (_, monthIndex) => {
        const date =
          new Date(
            currentYear,
            monthIndex,
            1
          );

        return {
          label:
            date.toLocaleDateString(
              'id-ID',
              {
                month: 'long',
              }
            ),

          value:
            counts[
              monthIndex
            ] || 0,
        };
      }
    );
  }


  if (period === 'year') {
    const currentYear =
      now.getFullYear();

    const numberOfYears =
      5;

    const startYear =
      currentYear -
      (
        numberOfYears - 1
      );

    const counts = {};

    prescriptionItems.forEach(
      (item) => {
        const year =
          item.createdDate.getFullYear();

        if (
          year < startYear ||
          year > currentYear
        ) {
          return;
        }

        counts[year] =
          (counts[year] || 0) + 1;
      }
    );

    return Array.from(
      {
        length:
          numberOfYears,
      },
      (_, index) => {
        const year =
          startYear + index;

        return {
          label:
            String(year),

          value:
            counts[year] || 0,
        };
      }
    );
  }

  return [];
};


/**
 * Mengelompokkan resep yang telah ditebus menurut periode untuk grafik penebusan.
 */
const redeemedPrescriptionSeries = (
  items,
  period
) => {
  const now =
    new Date();

  const redeemedItems =
    (items || [])
      .filter(
        (item) =>
          item?.status === 'picked'
      )
      .map((item) => {
        const redeemedAt =
          getPrescriptionRedemptionTime(
            item
          );

        if (!redeemedAt) {
          return null;
        }

        const date =
          new Date(redeemedAt);

        if (
          Number.isNaN(
            date.getTime()
          )
        ) {
          return null;
        }

        return {
          ...item,
          redeemedDate: date,
        };
      })
      .filter(Boolean);


  if (period === 'day') {
    const endDate =
      new Date(now);

    endDate.setHours(
      0,
      0,
      0,
      0
    );

    const startDate =
      new Date(endDate);

    startDate.setDate(
      startDate.getDate() - 6
    );

    const counts = {};

    redeemedItems.forEach(
      (item) => {
        const date =
          new Date(
            item.redeemedDate
          );

        date.setHours(
          0,
          0,
          0,
          0
        );

        if (
          date < startDate ||
          date > endDate
        ) {
          return;
        }

        const key = [
          date.getFullYear(),
          String(
            date.getMonth() + 1
          ).padStart(2, '0'),
          String(
            date.getDate()
          ).padStart(2, '0'),
        ].join('-');

        counts[key] =
          (counts[key] || 0) + 1;
      }
    );

    return Array.from(
      { length: 7 },
      (_, index) => {
        const date =
          new Date(startDate);

        date.setDate(
          startDate.getDate() +
            index
        );

        const key = [
          date.getFullYear(),
          String(
            date.getMonth() + 1
          ).padStart(2, '0'),
          String(
            date.getDate()
          ).padStart(2, '0'),
        ].join('-');

        return {
          label:
            date.toLocaleDateString(
              'id-ID',
              {
                weekday: 'short',
                day: 'numeric',
              }
            ),

          value:
            counts[key] || 0,
        };
      }
    );
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
      const value = redeemedItems.reduce((total, item) => (
        item.redeemedDate >= weekStart && item.redeemedDate <= weekEnd
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
    const currentYear =
      now.getFullYear();

    const counts =
      Array(12).fill(0);

    redeemedItems.forEach(
      (item) => {
        const date =
          item.redeemedDate;

        if (
          date.getFullYear() !==
          currentYear
        ) {
          return;
        }

        counts[
          date.getMonth()
        ] += 1;
      }
    );

    return Array.from(
      { length: 12 },
      (_, monthIndex) => {
        const date =
          new Date(
            currentYear,
            monthIndex,
            1
          );

        return {
          label:
            date.toLocaleDateString(
              'id-ID',
              {
                month: 'long',
              }
            ),

          value:
            counts[
              monthIndex
            ] || 0,
        };
      }
    );
  }


  if (period === 'year') {
    const currentYear =
      now.getFullYear();

    const numberOfYears =
      5;

    const startYear =
      currentYear -
      (
        numberOfYears - 1
      );

    const counts = {};

    redeemedItems.forEach(
      (item) => {
        const year =
          item.redeemedDate
            .getFullYear();

        if (
          year < startYear ||
          year > currentYear
        ) {
          return;
        }

        counts[year] =
          (counts[year] || 0) + 1;
      }
    );

    return Array.from(
      {
        length:
          numberOfYears,
      },
      (_, index) => {
        const year =
          startYear + index;

        return {
          label:
            String(year),

          value:
            counts[year] || 0,
        };
      }
    );
  }

  return [];
};


/* =====================================================
   EXPORT OPTIONS
===================================================== */

const PHARMACY_EXPORT_OPTIONS = [
  {
    key: 'kpi',
    label: 'Ringkasan KPI',
  },
  {
    key: 'redeemedWeek',
    label:
      'Line Chart (Resep Ditebus per Minggu)',
  },
  {
    key: 'redeemedMonth',
    label:
      'Line Chart (Resep Ditebus per Bulan)',
  },
  {
    key: 'redeemedYear',
    label:
      'Line Chart (Resep Ditebus per Tahun)',
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
    key: 'waitingToday',
    label:
      'Resep Masuk (Menunggu Hari Ini)',
  },
  {
    key: 'pickedToday',
    label:
      'Resep Masuk (Ditebus Hari Ini)',
  },
  {
    key: 'allToday',
    label:
      'Resep Masuk (Semua Hari Ini)',
  },
  {
    key: 'stock',
    label: 'Stok Obat',
  },
  {
    key: 'chronicBooks',
    label: 'Buku Kronis',
  },
];


const DOCTOR_EXPORT_OPTIONS = [
  {
    key: 'doctorKpi',
    label: 'Ringkasan KPI',
  },
  {
    key: 'doctorWeek',
    label:
      'Line Chart (Resep Dibuat per Minggu)',
  },
  {
    key: 'doctorMonth',
    label:
      'Line Chart (Resep Dibuat per Bulan)',
  },
  {
    key: 'doctorYear',
    label:
      'Line Chart (Resep Dibuat per Tahun)',
  },
  {
    key: 'doctorMedicine',
    label:
      'Bar Chart (Tren Obat)',
  },
  {
    key: 'doctorToday',
    label:
      'Resep Dibuat (Hari Ini)',
  },
  {
    key: 'doctorChronicBooks',
    label: 'Buku Kronis',
  },
];


/* =====================================================
   DASHBOARD
===================================================== */

/**
 * Merender komponen dashboard panel dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function DashboardPanel({
  role,
  data,
  currentUser,
  onEditPrescription,
  onDeletePrescription,
  onExport,
  notify,
}) {
  const [
    stockFilter,
    setStockFilter,
  ] = useState('low');


  const [
    period,
    setPeriod,
  ] = useState('day');


  const [
    prescriptionPage,
    setPrescriptionPage,
  ] = useState(1);

  const [prescriptionFilter, setPrescriptionFilter] = useState('new');
  const [prescriptionDateFilter, setPrescriptionDateFilter] = useState({ start: '', end: '' });
  const [prescriptionSearch, setPrescriptionSearch] = useState('');


  const PRESCRIPTION_PAGE_SIZE =
    10;


  const [
    selectedPrescription,
    setSelectedPrescription,
  ] = useState(null);

  const selectedPrescriptionMedicationRows = useMemo(
    () => (Array.isArray(selectedPrescription?.meds) ? selectedPrescription.meds : []).filter((med) => String(med?.med || '').trim() && Number(med?.q ?? med?.qty ?? 0) > 0),
    [selectedPrescription?.meds]
  );
  const { currentPage: selectedMedicationPage, setCurrentPage: setSelectedMedicationPage, totalPages: selectedMedicationTotalPages, paginatedItems: paginatedSelectedMedicationRows } = usePaginatedItems(selectedPrescriptionMedicationRows);


  const [
    editPrescription,
    setEditPrescription,
  ] = useState(null);


  const [
    editPatientName,
    setEditPatientName,
  ] = useState('');


  const [
    editPatientPhone,
    setEditPatientPhone,
  ] = useState('');


  const [
    editDiagnosis,
    setEditDiagnosis,
  ] = useState('');


  const [
    editMeds,
    setEditMeds,
  ] = useState([]);
  const [editMedsPage, setEditMedsPage] = useState(1);
  const EDIT_MEDS_PAGE_SIZE = 10;
  const editMedsTotalPages = Math.max(1, Math.ceil(editMeds.length / EDIT_MEDS_PAGE_SIZE));
  const paginatedEditMedEntries = useMemo(
    () => editMeds.map((med, index) => ({ med, index })).slice(
      (editMedsPage - 1) * EDIT_MEDS_PAGE_SIZE,
      editMedsPage * EDIT_MEDS_PAGE_SIZE,
    ),
    [editMeds, editMedsPage],
  );
  useEffect(() => {
    setEditMedsPage((page) => Math.min(Math.max(1, page), editMedsTotalPages));
  }, [editMedsTotalPages]);


  const [
    editModalOpen,
    setEditModalOpen,
  ] = useState(false);


  const [
    isSavingEdit,
    setIsSavingEdit,
  ] = useState(false);


  /* =====================================================
     MODAL EKSPOR
  ===================================================== */

  const EXPORT_OPTIONS =
    role === 'doctor'
      ? DOCTOR_EXPORT_OPTIONS
      : PHARMACY_EXPORT_OPTIONS;


  const [
    exportModalOpen,
    setExportModalOpen,
  ] = useState(false);


  const [
    selectedExportSections,
    setSelectedExportSections,
  ] = useState(
    EXPORT_OPTIONS.map(
      (item) => item.key
    )
  );


  useEffect(() => {
    setSelectedExportSections(
      EXPORT_OPTIONS.map(
        (item) => item.key
      )
    );
  }, [role]);


  /**
   * Membuka modal ekspor dan memilih seluruh bagian laporan sebagai pilihan awal agar Admin dapat menyesuaikan isi sebelum mengunduh.
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
   * Mengubah status pilihan satu bagian data yang akan dimasukkan ke laporan dashboard.
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
   * Memilih seluruh bagian laporan dashboard atau membatalkan seluruh pilihan secara bersamaan.
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


  /* =====================================================
     DATA
  ===================================================== */

  const prescriptions =
    Array.isArray(
      data?.prescriptions
    )
      ? data.prescriptions
      : [];


  // Dokter FKTP perlu melihat resep bersama di sistem, bukan hanya resep yang dibuat akunnya sendiri.
  // Hak ubah/hapus tetap dibatasi oleh pembuat resep pada kontrol tindakan dan backend.
  const doctorPrescriptions = prescriptions;


  const now = new Date();


  const stock =
    Object.values(
      data?.stock || {}
    );


  const low =
    stock.filter(
      (item) =>
        Number(
          item?.qty
        ) <=
        STOCK_ALERT_THRESHOLD
    );


  const expiry =
    stock.filter(
      (item) =>
        isNearExpiry(
          item?.expiryDate
        )
    );


  const pending =
    prescriptions.filter(
      (p) =>
        getEffectivePrescriptionStatus(p) === 'pending'
    );



  /* =====================================================
     DOCTOR COUNTS
  ===================================================== */

  const doctorToday =
    doctorPrescriptions.filter(
      (p) =>
        isSameDay(
          p?.createdAt,
          now
        )
    ).length;


  const doctorThisWeek =
    doctorPrescriptions.filter(
      (p) =>
        isWithinLastSevenCalendarDays(
          p?.createdAt,
          now
        )
    ).length;


  const doctorThisMonth =
    doctorPrescriptions.filter(
      (p) =>
        isSameMonth(
          p?.createdAt,
          now
        )
    ).length;


  const doctorThisYear =
    doctorPrescriptions.filter(
      (p) =>
        isSameYear(
          p?.createdAt,
          now
        )
    ).length;


  /* =====================================================
     MEDICATION OPTIONS
  ===================================================== */

  const medicineOptions =
    useMemo(() => {
      const stockItems =
        Object.values(
          data?.stock || {}
        ).filter(
          (item) =>
            item?.name
        );


      const currentMedicineNames =
        (editMeds || [])
          .map(
            (med) =>
              String(
                med?.med || ''
              ).trim()
          )
          .filter(Boolean);


      const existingNames =
        new Set(
          stockItems.map(
            (item) =>
              item.name
          )
        );


      const legacyItems =
        currentMedicineNames
          .filter(
            (name) =>
              !existingNames.has(
                name
              )
          )
          .map(
            (name) => ({
              name,
              qty: null,
              unit: '',
            })
          );


      return [
        ...stockItems,
        ...legacyItems,
      ];
    }, [
      data?.stock,
      editMeds,
    ]);


  /* =====================================================
     STOCK CHART
  ===================================================== */

  const stockSeries =
    useMemo(() => {
      if (
        stockFilter ===
        'expiry'
      ) {
        const nowDate =
          new Date();

        return expiry
          .map((item) => {
            const expiryDate =
              item?.expiryDate
                ? new Date(
                    item.expiryDate
                  )
                : null;

            if (
              !expiryDate ||
              Number.isNaN(
                expiryDate.getTime()
              )
            ) {
              return null;
            }

            const diff =
              Math.ceil(
                (
                  expiryDate.getTime() -
                  nowDate.getTime()
                ) /
                  DAY_MS
              );

            return {
              label:
                item?.name ||
                'Tanpa Nama',

              value:
                Math.max(
                  0,
                  diff
                ),

              unit:
                item?.unit ||
                '',

              manufacturer:
                item?.distributor ||
                item?.manufacturer ||
                item?.pabrik ||
                '-',
            };
          })
          .filter(Boolean)
          .sort(
            (a, b) =>
              a.value -
              b.value
          );
      }

      return low
        .map(
          (item) => ({
            label:
              item?.name ||
              'Tanpa Nama',

            value:
              Number(
                item?.qty
              ) || 0,

            unit:
              item?.unit ||
              '',

            manufacturer:
              item?.distributor ||
              item?.manufacturer ||
              item?.pabrik ||
              '-',
          })
        )
        .sort(
          (a, b) =>
            a.value -
            b.value
        );
    }, [
      stockFilter,
      low,
      expiry,
    ]);


  /* =====================================================
     CHART SERIES
  ===================================================== */

  const chartItems =
    role === 'doctor'
      ? doctorPrescriptions
      : prescriptions;


  const series =
    useMemo(
      () =>
        totalPrescriptionSeries(
          chartItems,
          period
        ),
      [
        chartItems,
        period,
      ]
    );


  const redeemedSeries =
    useMemo(
      () =>
        redeemedPrescriptionSeries(
          prescriptions,
          period
        ),
      [
        prescriptions,
        period,
      ]
    );


  const medicineSeries =
    useMemo(() => {
      const medicineCount =
        {};

      doctorPrescriptions.forEach(
        (prescription) => {
          (
            prescription?.meds ||
            []
          ).forEach(
            (med) => {
              const name =
                String(
                  med?.med || ''
                ).trim();

              if (!name) {
                return;
              }

              medicineCount[
                name
              ] =
                (
                  medicineCount[
                    name
                  ] || 0
                ) + 1;
            }
          );
        }
      );

      return Object.entries(
        medicineCount
      )
        .map(
          ([label, value]) => ({
            label,
            value,
          })
        )
        .sort(
          (a, b) =>
            b.value -
            a.value
        )
        .slice(0, 5);
    }, [
      doctorPrescriptions,
    ]);


  /* =====================================================
     RESEP TERBARU
  ===================================================== */

  const newest =
    useMemo(() => {
      const source =
        role === 'doctor'
          ? doctorPrescriptions
          : prescriptions;

      const searchTerm = prescriptionSearch.trim().toLocaleLowerCase('id-ID');

      return [...source]
        .filter((item) => item?.createdAt)
        .filter((item) => {
          if (!searchTerm) return true;
          const patient = getPatientForPrescription(data, item);
          const searchableValues = [
            getPatientName(patient),
            item?.diagnosis,
            ...(Array.isArray(item?.meds) ? item.meds : []).map((med) => (
              typeof med === 'string'
                ? med
                : med?.med || med?.name || med?.medicationName || med?.medicineName || ''
            )),
          ];
          const normalizedBpjsQuery = /^[\d\s-]+$/.test(searchTerm)
            ? searchTerm.replace(/\D/g, '')
            : '';
          return searchableValues.some((value) =>
            String(value ?? '').toLocaleLowerCase('id-ID').includes(searchTerm)
          ) || Boolean(normalizedBpjsQuery && getPatientBpjs(patient).includes(normalizedBpjsQuery));
        })
        .filter((item) => prescriptionFilter !== 'date' || matchesDateFilter(item.createdAt, 'custom', prescriptionDateFilter))
        .sort((a, b) => {
          const difference = new Date(b.createdAt) - new Date(a.createdAt);
          return prescriptionFilter === 'old' ? -difference : difference;
        });
    }, [
      role,
      doctorPrescriptions,
      prescriptions,
      prescriptionFilter,
      prescriptionDateFilter,
      prescriptionSearch,
      data,
    ]);


  const prescriptionTotalPages =
    Math.max(
      1,
      Math.ceil(
        newest.length /
          PRESCRIPTION_PAGE_SIZE
      )
    );


  const paginatedPrescriptions =
    newest.slice(
      (
        prescriptionPage -
        1
      ) *
        PRESCRIPTION_PAGE_SIZE,
      prescriptionPage *
        PRESCRIPTION_PAGE_SIZE
    );


  useEffect(() => {
    setPrescriptionPage(1);
  }, [
    role,
    currentUser,
    prescriptions,
    prescriptionFilter,
    prescriptionDateFilter,
    prescriptionSearch,
  ]);


  /* =====================================================
     EDIT RESEP
  ===================================================== */

  /**
   * Memilih resep dan menyiapkan data editor setelah memeriksa bahwa resep masih memenuhi aturan perubahan yang berlaku.
   */
  const openEditPrescription =
    (prescription) => {
      if (!prescription) {
        return;
      }

      if (
        prescription.status ===
        'picked'
      ) {
        notify?.(
          'Resep yang sudah ditebus tidak dapat diubah.',
          'warning'
        );
        return;
      }

      if (
        role !== 'doctor'
      ) {
        return;
      }

      const isWithin24Hours =
        isEditableWithin24Hours(
          prescription.updatedAt ||
            prescription.createdAt
        );

      if (
        !isWithin24Hours
      ) {
        notify?.(
          'Resep hanya dapat diubah dalam 24 jam setelah dibuat.',
          'warning'
        );
        return;
      }

      setEditPrescription(
        prescription
      );

      setEditPatientName(
        getPatientName(
          getPatientForPrescription(
            data,
            prescription
          )
        ) || ''
      );

      setEditPatientPhone(
        getPatientPhone(
          getPatientForPrescription(
            data,
            prescription
          )
        ) || ''
      );

      setEditDiagnosis(
        prescription.diagnosis ||
          ''
      );

      setEditMedsPage(1);
      setEditMeds(
        (
          prescription.meds ||
          []
        ).map(
          (med) => ({
            med:
              med?.med ||
              '',

            qty:
              med?.q ??
              med?.qty ??
              '',

            unit:
              med?.u ||
              med?.unit ||
              'tablet',
          })
        )
      );

      setEditModalOpen(
        true
      );
    };


  /**
   * Menyimpan atau memperbarui edited resep dengan mengikuti validasi dan aturan bisnis pada modul.
   */
  const saveEditedPrescription =
    async () => {
      if (
        !editPrescription ||
        isSavingEdit
      ) {
        return;
      }

      const diagnosis =
        String(
          editDiagnosis ||
            ''
        ).trim();

      const sourceMeds = Array.isArray(editPrescription.meds)
        ? editPrescription.meds
        : [];

      const normalizedMeds =
        (editMeds || [])
          .map((med, index) => {
            const original = sourceMeds[index] || {};
            return {
              ...original,
              med: String(med?.med || '').trim(),
              q: Number(med?.qty ?? med?.q ?? 0) || 0,
              u: med?.unit || med?.u || original.u || original.unit || 'tablet',
            };
          })
          .filter((med) => med.med && med.q > 0);




      if (!diagnosis) {
        notify?.(
          'Diagnosis wajib dipilih.',
          'warning'
        );
        return;
      }

      if (
        !normalizedMeds.length
      ) {
        notify?.(
          'Data obat tidak valid.',
          'warning'
        );
        return;
      }


      setIsSavingEdit(
        true
      );

      try {
        const result =
          await onEditPrescription?.(
            editPrescription,
            diagnosis,
            normalizedMeds
          );

        if (
          result?.ok
        ) {
          setEditModalOpen(
            false
          );

          setSelectedPrescription(
            (current) => {
              if (!current) {
                return current;
              }

              return {
                ...current,

                diagnosis,

                meds:
                  normalizedMeds,
                updatedAt:
                  new Date().toISOString(),
              };
            }
          );

          setEditPrescription(
            null
          );

          notify?.(
            'Resep berhasil diubah.',
            'success'
          );
        } else {
          notify?.(
            result?.message ||
              'Gagal mengubah resep.',
            'warning'
          );
        }
      } catch (error) {
        console.error(
          'Error mengubah resep:',
          error
        );

        notify?.(
          error?.message ||
            'Terjadi kesalahan saat mengubah resep.',
          'warning'
        );
      } finally {
        setIsSavingEdit(
          false
        );
      }
    };


  /* =====================================================
     EXPORT REPORT
  ===================================================== */

  const exportReport = createDashboardReportExporter({
    DAY_MS,
    capitalizeFirstLetter,
    createDashboardBarChartImage,
    createDashboardLineChartImage,
    currentUser,
    data,
    doctorPrescriptions,
    doctorThisMonth,
    doctorThisWeek,
    doctorThisYear,
    doctorToday,
    expiry,
    getEffectivePrescriptionStatus,
    getPatientForPrescription,
    getPatientName,
    getPatientPhone,
    isSameDay,
    jsPDF,
    low,
    medicineSeries,
    notify,
    onExport,
    prescriptions,
    redeemedPrescriptionSeries,
    role,
    setExportModalOpen,
    stock,
    totalPrescriptionSeries
});


  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <div className="workspace-stack">

      {/* =================================================
          HEADER & KPI
      ================================================= */}

      <Card>
        <div className="section-head">

          <div>
            <h3>
              Dashboard
            </h3>

            <p>
              Ringkasan resep dan stok obat.
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

          {role === 'doctor' ? (
            <>
              <Metric
                icon={
                  FileText
                }
                label="Resep Hari Ini"
                value={
                  doctorToday
                }
              />

              <Metric
                icon={
                  Calendar
                }
                label="Resep Minggu Ini"
                value={
                  doctorThisWeek
                }
              />

              <Metric
                icon={
                  CalendarDays
                }
                label="Resep Bulan Ini"
                value={
                  doctorThisMonth
                }
              />

              <Metric
                icon={
                  CalendarRange
                }
                label="Resep Tahun Ini"
                value={
                  doctorThisYear
                }
              />
            </>
          ) : null}


          {role === 'pharmacy' ? (
            <>
              <Metric
                icon={
                  FileText
                }
                label="Resep Masuk"
                value={
                  prescriptions.length
                }
              />

              <Metric
                icon={
                  FileClock
                }
                label="Resep Menunggu"
                value={
                  pending.length
                }
              />

              <Metric
                icon={
                  Package2
                }
                label="Stok Hampir Habis"
                value={
                  low.length
                }
              />

              <Metric
                icon={
                  CalendarClock
                }
                label="Stok Hampir Kedaluwarsa"
                value={
                  expiry.length
                }
              />
            </>
          ) : null}

        </div>

      </Card>


      {/* =================================================
          CHARTS
      ================================================= */}

      <DashboardCharts
        role={role}
        period={period}
        setPeriod={setPeriod}
        hasChartData={hasChartData}
        redeemedSeries={redeemedSeries}
        series={series}
        medicineSeries={medicineSeries}
        stockFilter={stockFilter}
        setStockFilter={setStockFilter}
        stockSeries={stockSeries}
      />


      {/* =================================================
          RESEP TERBARU / RESEP MASUK
      ================================================= */}

      <Card>

        <div className="section-head">

          <div>

            <h3>
              {role === 'doctor'
                ? 'Resep Terbaru'
                : 'Resep Masuk'}
            </h3>

            <p>
              Pantau resep yang baru dibuat.
            </p>

          </div>

        </div>


        <div className={`search-row dashboard-table-filter-row ${prescriptionFilter === 'date' ? 'has-date-filter' : ''}`}>
          <Field label="Pencarian">
            <TextInput
              value={prescriptionSearch}
              onChange={(event) => setPrescriptionSearch(event.target.value)}
              placeholder="Cari nama, BPJS, diagnosis, atau obat"
              debounceMs={400}
            />
          </Field>
<DateFilterBar
            className="date-filter-inline"
            controlClassName="control control-compact"
            value={prescriptionFilter}
            customValue="date"
            fallbackValue="new"
            options={[
              { value: 'new', label: 'Terbaru' },
              { value: 'old', label: 'Terlama' },
              { value: 'date', label: 'Waktu/Tanggal' },
            ]}
            onChange={(nextValue) => {
              setPrescriptionFilter(nextValue);
              if (nextValue !== 'date') setPrescriptionDateFilter({ start: '', end: '' });
            }}
            customDate={prescriptionDateFilter}
            onCustomDateChange={setPrescriptionDateFilter}
          />
        </div>

        <div className="table-shell">

          <table className="data-table">

            <thead>

              <tr>

                <th>
                  Waktu/Tanggal Dibuat
                </th>

                <th>
                  No. BPJS/JKN/KIS
                </th>

                <th>
                  No. Kunjungan
                </th>

                <th>
                  Nama Pasien
                </th>

                <th>
                  No. Telp
                </th>

                <th>
                  Diagnosis
                </th>

                <th>
                  Obat
                </th>

                {role === 'pharmacy' && (
                  <th>
                    Status
                  </th>
                )}

              </tr>

            </thead>


            <tbody>

              {paginatedPrescriptions.length ? (
                paginatedPrescriptions.map(
                  (
                    p
                  ) => (
                    <tr
                      key={
                        p.id
                      }
                    >

                      <td>
                        {p.createdAt
                          ? formatDateTimeWita(p.createdAt)
                          : '-'}
                      </td>


                      <td>
                        {
                          getPatientBpjs(
                            getPatientForPrescription(
                              data,
                              p
                            )
                          ) || '-'
                        }
                      </td>


                      <td>
                        {p.visitNumber || '-'}
                      </td>

                      <td>
                        {
                          getPatientName(
                            getPatientForPrescription(
                              data,
                              p
                            )
                          ) || '-'
                        }
                      </td>


                      <td>
                        {
                          getPatientPhone(
                            getPatientForPrescription(
                              data,
                              p
                            )
                          ) || '-'
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
                          p.diagnosis ||
                          '-'
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
                        {(p.meds || [])
                          .map(
                            (
                              m
                            ) =>
                              m?.med ||
                              '-'
                          )
                          .join(
                            ', '
                          )}
                      </td>


                      {role === 'pharmacy' && (
                        <td>

                          <Badge
                            tone={
                              getEffectivePrescriptionStatus(p) === 'picked'
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {
                              getEffectivePrescriptionStatus(p) === 'picked'
                                ? 'Ditebus'
                                : 'Menunggu'
                            }
                          </Badge>

                        </td>
                      )}

                    </tr>
                  )
                )
              ) : (
                <tr>

                  <td
                    colSpan={
                      role === 'pharmacy'
                        ? 8
                        : 7
                    }
                  >
                    <div className="empty-table">
                      {prescriptionSearch.trim()
                        ? 'Resep dengan nama, BPJS, diagnosis, atau obat tersebut tidak ditemukan.'
                        : 'Belum ada resep masuk.'}
                    </div>
                  </td>

                </tr>
              )}

            </tbody>

          </table>

        </div>

        {prescriptionTotalPages > 1 && (
            <div className="activity-pagination">

              <button
                type="button"
                className="pagination-btn"
                onClick={() =>
                  setPrescriptionPage(
                    (
                      page
                    ) =>
                      Math.max(
                        1,
                        page - 1
                      )
                  )
                }
                disabled={
                  prescriptionPage ===
                  1
                }
              >
                Sebelumnya
              </button>


              <CompactPagination currentPage={prescriptionPage} totalPages={prescriptionTotalPages} onPageChange={setPrescriptionPage} />


              <button
                type="button"
                className="pagination-btn"
                onClick={() =>
                  setPrescriptionPage(
                    (
                      page
                    ) =>
                      Math.min(
                        prescriptionTotalPages,
                        page + 1
                      )
                  )
                }
                disabled={
                  prescriptionPage ===
                  prescriptionTotalPages
                }
              >
                Berikutnya
              </button>

            </div>
          )}

      </Card>


      {/* =================================================
          MODAL DETAIL RESEP
      ================================================= */}

      <Modal
        open={
          Boolean(
            selectedPrescription
          )
        }
        scrollable={false}
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>
                Detail Resep
              </h3>

              <p>
                Informasi lengkap resep yang dibuat.
              </p>
            </div>
          </div>
        }
        onClose={() =>
          setSelectedPrescription(
            null
          )
        }
        size="md"
        zIndex={1000}
      >

        {selectedPrescription ? (
          <div className="account-preview-scroll">

            <div className="account-preview">

              <div className="preview-grid">

                <div className="preview-item">
                  <span>
                    Waktu/Tanggal
                  </span>

                  <strong>
                    {selectedPrescription.createdAt
                      ? formatDateTimeWita(selectedPrescription.createdAt)
                      : '-'}
                  </strong>
                </div>


                <div className="preview-item">
                  <span>
                    Tanggal Ditebus
                  </span>

                  <strong>
                    {selectedPrescription.status ===
                    'picked'
                      ? getPickedDate(
                          selectedPrescription
                        )
                      : '-'}
                  </strong>
                </div>


                <div className="preview-item">
                  <span>
                    Nama Pasien
                  </span>

                  <strong>
                    {
                      getPatientName(
                        getPatientForPrescription(
                          data,
                          selectedPrescription
                        )
                      ) || '-'
                    }
                  </strong>
                </div>


                <div className="preview-item">
                  <span>
                    Nomor BPJS
                  </span>

                  <strong>
                    {
                      getPatientBpjs(
                        getPatientForPrescription(
                          data,
                          selectedPrescription
                        )
                      ) || '-'
                    }
                  </strong>
                </div>


                <div className="preview-item">
                  <span>
                    No. Telp
                  </span>

                  <strong>
                    {
                      getPatientPhone(
                        getPatientForPrescription(
                          data,
                          selectedPrescription
                        )
                      ) || '-'
                    }
                  </strong>
                </div>


                <div className="preview-item">
                  <span>
                    Diagnosis
                  </span>

                  <strong>
                    {
                      selectedPrescription.diagnosis ||
                      '-'
                    }
                  </strong>
                </div>


                <div className="preview-item">
                  <span>
                    Jadwal Penebusan Berikutnya
                  </span>

                  <strong>
                    {
                      getNextPickupDate(
                        selectedPrescription
                      )
                    }
                  </strong>
                </div>

              </div>


              <div className="preview-section">

                <div
                  className="table-shell"
                  style={{
                    width:
                      '100%',
                    maxWidth:
                      '100%',
                    overflowX:
                      'hidden',
                    boxSizing:
                      'border-box',
                  }}
                >

                  <table
                    className="data-table"
                    style={{
                      width:
                        '100%',
                      maxWidth:
                        '100%',
                      minWidth:
                        0,
                      tableLayout:
                        'fixed',
                    }}
                  >

                    <thead>

                      <tr>

                        <th
                          style={{
                            width:
                              '20%',
                          }}
                        >
                          Obat
                        </th>

                        <th
                          style={{
                            width:
                              '10%',
                          }}
                        >
                          Jumlah
                        </th>

                        <th
                          style={{
                            width:
                              '12%',
                          }}
                        >
                          Satuan
                        </th>

                        <th
                          style={{
                            width:
                              '28%',
                          }}
                        >
                          Aturan Pakai
                        </th>

                        <th
                          style={{
                            width:
                              '30%',
                          }}
                        >
                          Catatan
                        </th>

                      </tr>

                    </thead>


                    <tbody>

                      {paginatedSelectedMedicationRows.map(
                          (
                            med,
                            index
                          ) => (
                            <tr
                              key={
                                med?.id ||
                                index
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
                                  med?.med ||
                                  '-'
                                }
                              </td>


                              <td>
                                {
                                  med?.q ??
                                  med?.qty ??
                                  '-'
                                }
                              </td>


                              <td>
                                {
                                  capitalizeFirstLetter(
                                    med?.u ||
                                      med?.unit ||
                                      ''
                                  )
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
                                  getPrescriptionDoseInstruction(
                                    med
                                  )
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
                                  getPrescriptionNotes(
                                    med
                                  )
                                }
                              </td>

                            </tr>
                          )
                        )}


                      {!(
                        Array.isArray(
                          selectedPrescription.meds
                        ) &&
                        selectedPrescription.meds.some(
                          (
                            med
                          ) =>
                            String(
                              med?.med ||
                                ''
                            ).trim() &&
                            Number(
                              med?.q ??
                                med?.qty ??
                                0
                            ) > 0
                        )
                      ) && (
                        <tr>

                          <td
                            colSpan="5"
                          >
                            <div className="empty-table">
                              Tidak ada obat.
                            </div>
                          </td>

                        </tr>
                      )}

                    </tbody>

                  </table>

                </div>
                <TablePagination currentPage={selectedMedicationPage} totalPages={selectedMedicationTotalPages} onPageChange={setSelectedMedicationPage} />

              </div>


              {role === 'doctor' &&
                selectedPrescription.status !==
                  'picked' &&
                (() => {
                  const createdAt =
                    selectedPrescription.createdAt
                      ? new Date(
                          selectedPrescription.createdAt
                        ).getTime()
                      : 0;

                  const isWithin24Hours =
                    createdAt > 0 &&
                    Date.now() -
                      createdAt <
                      24 *
                        60 *
                        60 *
                        1000;

                  return isWithin24Hours;
                })() ? (
                <div className="preview-actions">

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      openEditPrescription(
                        selectedPrescription
                      )
                    }
                  >
                    <PencilLine
                      size={15}
                    />
                    Ubah Resep
                  </Button>

                </div>
              ) : null}

            </div>

          </div>
        ) : null}

      </Modal>


      {/* =================================================
          MODAL UBAH RESEP
      ================================================= */}

      <Modal
        open={
          editModalOpen
        }
        title={
          <div className="section-head medication-modal-head">
            <div>

              <h3>
                Ubah Resep
              </h3>

              <p>
                Edit resep hingga 24 jam.
              </p>

            </div>
          </div>
        }
        onClose={() => {
          if (
            !isSavingEdit
          ) {
            setEditModalOpen(
              false
            );
          }
        }}
        size="md"
      >

        {editPrescription ? (
          <div className="stack">

            <div className="edit-account-form-card">

              <div className="form-grid two-cols">

                <Field label="Nama Pasien">
                  <TextInput
                    value={
                      editPatientName
                    }
                    readOnly
                    disabled
                    className="control auto-filled-control"
                    placeholder="Nama pasien"
                  />
                </Field>


                <Field label="No. Telp">
                  <TextInput
                    type="tel"
                    inputMode="numeric"
                    value={
                      editPatientPhone
                    }
                    readOnly
                    disabled
                    className="control auto-filled-control"
                    placeholder="Nomor telepon"
                  />
                </Field>


                <Field label="Diagnosis">
                  <SearchableSelect
                    className="control control-compact"
                    value={
                      editDiagnosis
                    }
                    onChange={(e) =>
                      setEditDiagnosis(
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      Pilih diagnosis
                    </option>

                    <option value="Hipertensi">
                      Hipertensi
                    </option>

                    <option value="Diabetes Mellitus">
                      Diabetes Mellitus
                    </option>

                    <option value="Asma">
                      Asma
                    </option>

                    <option value="Infeksi Saluran Pernapasan">
                      Infeksi Saluran Pernapasan
                    </option>

                    <option value="Hiperkolesterolemia">
                      Hiperkolesterolemia
                    </option>

                    <option value="COPD">
                      COPD
                    </option>

                    <option value="Asthma Chronic">
                      Asthma Chronic
                    </option>

                    <option value="Stroke">
                      Stroke
                    </option>

                    <option value="Gagal Ginjal">
                      Gagal Ginjal
                    </option>
                  </SearchableSelect>
                </Field>

              </div>

            </div>


            <div className="prescription-medication-head">

              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setEditMeds(
                    (current) => [
                      ...current,
                      {
                        med:
                          '',
                        qty:
                          '',
                        unit:
                          'tablet',
                      },
                    ]
                  );
                  setEditMedsPage(Math.ceil((editMeds.length + 1) / EDIT_MEDS_PAGE_SIZE));
                }}
              >
                <Plus
                  size={16}
                />
                Tambah Obat
              </Button>

            </div>


            <div className="stack">

              {paginatedEditMedEntries.map(
                (
                  { med, index }
                ) => (
                  <div
                    className="result-card"
                    key={
                      index
                    }
                  >

                    <div className="form-grid three-cols">

                      <Field label="Nama Obat">
                        <SearchableSelect
                          className="control control-compact"
                          value={
                            med?.med ||
                            ''
                          }
                          onChange={(e) =>
                            setEditMeds(
                              (
                                current
                              ) =>
                                current.map(
                                  (
                                    item,
                                    itemIndex
                                  ) =>
                                    itemIndex ===
                                    index
                                      ? {
                                          ...item,
                                          med:
                                            e.target.value,
                                        }
                                      : item
                                )
                            )
                          }
                        >
                          <option value="">
                            Pilih obat
                          </option>

                          {medicineOptions.map(
                            (
                              item
                            ) => (
                              <option
                                key={
                                  item.name
                                }
                                value={
                                  item.name
                                }
                              >
                                {
                                  item.name
                                }
                              </option>
                            )
                          )}

                        </SearchableSelect>
                      </Field>


                      <Field label="Jumlah">
                        <TextInput
                          type="number"
                          min="1"
                          step="1"
                          value={
                            med?.qty ??
                            ''
                          }
                          onChange={(e) =>
                            setEditMeds(
                              (
                                current
                              ) =>
                                current.map(
                                  (
                                    item,
                                    itemIndex
                                  ) =>
                                    itemIndex ===
                                    index
                                      ? {
                                          ...item,
                                          qty:
                                            e.target.value,
                                        }
                                      : item
                                )
                            )
                          }
                        />
                      </Field>


                      <Field label="Satuan">
                        <SearchableSelect
                          className="control control-compact"
                          value={
                            med?.unit ||
                            'tablet'
                          }
                          onChange={(e) =>
                            setEditMeds(
                              (
                                current
                              ) =>
                                current.map(
                                  (
                                    item,
                                    itemIndex
                                  ) =>
                                    itemIndex ===
                                    index
                                      ? {
                                          ...item,
                                          unit:
                                            e.target.value,
                                        }
                                      : item
                                )
                            )
                          }
                        >

                          <option value="botol">
                            Botol
                          </option>

                          <option value="tube">
                            Tube
                          </option>

                          <option value="tablet">
                            Tablet
                          </option>

                          <option value="kapsul">
                            Kapsul
                          </option>

                          <option value="pen">
                            Pen
                          </option>

                        </SearchableSelect>
                      </Field>

                    </div>


                    <div className="preview-actions">

                      <Button
                        variant="danger"
                        size="sm"
                        type="button"
                        onClick={() =>
                          setEditMeds(
                            (
                              current
                            ) =>
                              current.filter(
                                (
                                  _,
                                  itemIndex
                                ) =>
                                  itemIndex !==
                                  index
                              )
                          )
                        }
                        disabled={
                          editMeds.length <=
                          1
                        }
                      >
                        Hapus Obat
                      </Button>

                    </div>

                  </div>
                )
              )}

            </div>
            <TablePagination currentPage={editMedsPage} totalPages={editMedsTotalPages} onPageChange={setEditMedsPage} ariaLabel="Navigasi obat pada resep yang diedit" />


            <div className="preview-actions">

              <Button
                type="button"
                onClick={
                  saveEditedPrescription
                }
                disabled={
                  isSavingEdit ||
                  !editDiagnosis.trim() ||
                  !editMeds.length ||
                  !editMeds.every(
                    (med) =>
                      String(
                        med?.med ||
                          ''
                      ).trim() &&
                      Number(
                        med?.qty ??
                          med?.q ??
                          0
                      ) > 0
                  )
                }
              >
                <Save
                  size={16}
                />

                {isSavingEdit
                  ? 'Menyimpan...'
                  : 'Simpan Perubahan'}
              </Button>

            </div>

          </div>
        ) : null}

      </Modal>


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
        <Icon
          size={18}
        />
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
