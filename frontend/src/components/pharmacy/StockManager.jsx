/**
 * Mengelola stok obat, batch, kedaluwarsa, transaksi, dan tindakan penyesuaian stok.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { Plus, Package2, Camera, PackageMinus, Eye } from 'lucide-react';

import { Card } from '../ui/Card';
import { CompactPagination } from '../ui/CompactPagination';
import { Button } from '../ui/Button';

import { Field, SearchableSelect, TextInput } from '../ui/Field';

import { Badge } from '../ui/Badge';

import { Modal } from '../ui/Modal';
import { DateFilterBar } from '../prescription/DateFilterBar';
import { usePaginatedItems } from '../ui/usePaginatedItems';
import { TablePagination } from '../ui/TablePagination';
import { MEDICATION_ADMINISTRATION_ROUTES, STOCK_ALERT_THRESHOLD } from '../../data/constants.js';
import { fileToDataUrl } from '../../lib/files';
import {
  matchesDateFilter,
  formatDate as formatCalendarDate,
  formatDateTime as formatDateTimeWita,
} from '../../lib/date';
import { getStockCardTone, getNearestExpiryLabel, isSimilarMedicationName } from '../../lib/stock';



/*
 * =====================================================
 * CEK OBAT HAMPIR KEDALUWARSA
 * =====================================================
 */

/**
 * Membentuk tanggal hari ini menurut zona waktu Asia/Makassar agar perbandingan tanggal batch sesuai kalender operasional.
 */
const getTodayInMakassar = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${String(values.month).padStart(2, '0')}-${String(values.day).padStart(2, '0')}`;
};

/**
 * Memeriksa apakah tanggal kedaluwarsa yang valid lebih awal daripada tanggal hari ini menurut Asia/Makassar.
 */
const isPastExpiryDate = (value) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && String(value) < getTodayInMakassar());


/*
 * =====================================================
 * FORMAT PETUGAS
 * =====================================================
 */

/**
 * Mengambil identitas petugas dari username atau nama tampilan yang tersedia untuk dicatat pada transaksi stok.
 */
const getOfficerName = (
  user
) => {
  if (!user) {
    return '-';
  }

  if (
    typeof user === 'string'
  ) {
    return user;
  }

  return (
    user.username ||
    user.name ||
    user.fullName ||
    user.displayName ||
    user.email ||
    user.nik ||
    '-'
  );
};


/*
 * =====================================================
 * FORMAT TANGGAL
 * =====================================================
 */

/**
 * Memformat tanggal untuk tampilan pengguna atau keluaran laporan tanpa mengubah nilai sumber.
 */
const formatDate = (
  date
) => {
  if (!date) {
    return '-';
  }

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return '-';
  }

  return formatCalendarDate(date);
};


/*
 * =====================================================
 * SORT BATCH FEFO + FIFO
 * =====================================================
 */

/**
 * Mengurutkan batch berdasarkan FEFO (kedaluwarsa terdekat lebih dahulu) dan FIFO sebagai pemecah urutan bila tanggal kedaluwarsa sama.
 */
const sortBatchesForDispense = (
  batches
) =>
  [...batches].sort(
    (a, b) => {
      const expiryA =
        a.expiryDate
          ? new Date(
              a.expiryDate
            ).getTime()
          : Infinity;

      const expiryB =
        b.expiryDate
          ? new Date(
              b.expiryDate
            ).getTime()
          : Infinity;

      /*
       * FEFO
       */
      if (
        expiryA !== expiryB
      ) {
        return (
          expiryA -
          expiryB
        );
      }

      /*
       * FIFO fallback
       */
      const receivedA =
        new Date(
          a.receivedAt ||
            a.createdAt ||
            0
        ).getTime();

      const receivedB =
        new Date(
          b.receivedAt ||
            b.createdAt ||
            0
        ).getTime();

      return (
        receivedA -
        receivedB
      );
    }
  );


/*
 * =====================================================
 * STOCK MANAGER
 * =====================================================
 */

/**
 * Merender komponen stok manager dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function StockManager({
  data,
  currentUser,
  onAddStock,
  onDeleteStock,
  onDeleteStockBatch,
  onWithdrawStockBatch,
  onUpdateStockImage,
  notify,
}) {
  const [
    search,
    setSearch,
  ] = useState('');

  const [
    sort,
    setSort,
  ] = useState('az');


  /*
   * ===================================================
   * FORM TAMBAH OBAT
   * ===================================================
   */

  const [
    form,
    setForm,
  ] = useState({
    medicationId: '',
    batchNumber: '',
    name: '',
    distributor: '',
    qty: '',
    unit: '',
    administrationRoute: '',
    expiryDate: '',
    minStock: '50',
    file: null,
  });


  /*
   * ===================================================
   * OBAT AKTIF
   * ===================================================
   */

  const [
    active,
    setActive,
  ] = useState(null);


  /*
   * ===================================================
   * MODAL TAMBAH STOK
   * ===================================================
   */

  const [
    showAddStockModal,
    setShowAddStockModal,
  ] = useState(false);

  const [
    showAddSummaryModal,
    setShowAddSummaryModal,
  ] = useState(false);

  const [
    pendingNewStock,
    setPendingNewStock,
  ] = useState(null);

  const [imageReplacementFile, setImageReplacementFile] = useState(null);
  const [imageReplacementUrl, setImageReplacementUrl] = useState('');
  const [isUpdatingImage, setIsUpdatingImage] = useState(false);

  useEffect(() => {
    if (!imageReplacementFile) {
      setImageReplacementUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(imageReplacementFile);
    setImageReplacementUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageReplacementFile]);


  /*
   * ===================================================
   * MODAL RIWAYAT TRANSAKSI
   * ===================================================
   */

  const [
    transactionModalOpen,
    setTransactionModalOpen,
  ] = useState(false);


  /*
   * ===================================================
   * BATCH TERPILIH UNTUK RIWAYAT
   * ===================================================
   */

  const [
    selectedBatch,
    setSelectedBatch,
  ] = useState(null);


  /*
   * ===================================================
   * FORM TAMBAH STOK
   * ===================================================
   */

  const [
    additionalQty,
    setAdditionalQty,
  ] = useState('');

  const [
    additionalBatchNumber,
    setAdditionalBatchNumber,
  ] = useState('');

  const [
    additionalExpiryDate,
    setAdditionalExpiryDate,
  ] = useState('');

  const medicationNameOptions = useMemo(
    () => Object.values(data.stock || {})
      .filter((item) => String(item?.name || '').trim())
      .sort((a, b) => {
        const byName = String(a.name).localeCompare(String(b.name), 'id', { sensitivity: 'base' });
        return byName || String(a.distributor || '').localeCompare(String(b.distributor || ''), 'id', { sensitivity: 'base' });
      }),
    [data.stock],
  );

  const findMedicationById = (id) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return null;
    return medicationNameOptions.find((item) => String(item?._id || '') === normalizedId) || null;
  };

  // Hanya pilihan eksplisit dari dropdown yang menggunakan master obat lama.
  // Nama yang diketik tanpa memilih opsi diperlakukan sebagai master baru.
  const existingMedicationForForm = findMedicationById(form.medicationId);

  const handleStockMedicationNameChange = (event) => {
    const nextValue = String(event?.target?.value || '');
    const matchedMedication = findMedicationById(nextValue);
    setForm((current) => {
      const previousMedication = findMedicationById(current.medicationId);
      if (matchedMedication) {
        return {
          ...current,
          medicationId: matchedMedication._id,
          name: matchedMedication.name,
          distributor: matchedMedication.distributor || matchedMedication.manufacturer || matchedMedication.pabrik || '',
          unit: matchedMedication.unit || '',
          administrationRoute: matchedMedication.administrationRoute || '',
          minStock: String(matchedMedication.minStock ?? 50),
          batchNumber: '',
          expiryDate: '',
          qty: '',
          file: null,
        };
      }

      if (previousMedication) {
        return {
          ...current,
          medicationId: '',
          name: nextValue,
          distributor: '',
          unit: '',
          administrationRoute: '',
          minStock: '50',
          batchNumber: '',
          expiryDate: '',
          qty: '',
          file: null,
        };
      }

      return { ...current, medicationId: '', name: nextValue };
    });
  };

  const handleStockManufacturerChange = (event) => {
    const nextDistributor = String(event?.target?.value || '');
    setForm((current) => ({ ...current, distributor: nextDistributor }));
  };


  /*
   * =====================================================
   * VALIDASI TAMBAH OBAT
   * =====================================================
   */

  const isFormValid =
    form.batchNumber.trim() !== '' &&
    form.name.trim() !== '' &&
    form.distributor.trim() !== '' &&
    Number.isInteger(
      Number(form.qty)
    ) &&
    Number(form.qty) > 0 &&
    form.unit.trim() !== '' &&
    String(form.administrationRoute || '').trim() !== '' &&
    form.expiryDate !== '' &&
    String(form.minStock ?? '').trim() !== '' &&
    Number.isInteger(Number(form.minStock)) &&
    Number(form.minStock) >= 0 &&
    (Boolean(existingMedicationForForm) || Boolean(form.file));


  /*
   * =====================================================
   * DATA STOK
   * =====================================================
   */

  const stock = useMemo(() => {
    const list =
      Object.values(
        data.stock || {}
      ).filter(
        (item) =>
          String(
            item.name || ''
          )
            .toLowerCase()
            .includes(
              search.toLowerCase()
            )
      );

    return [...list].sort(
      (a, b) => {
        const nameA =
          String(
            a.name || ''
          ).trim();

        const nameB =
          String(
            b.name || ''
          ).trim();

        const dateA =
          new Date(
            a.createdAt || 0
          ).getTime();

        const dateB =
          new Date(
            b.createdAt || 0
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
    data.stock,
    search,
    sort,
  ]);

  const { currentPage: stockPage, setCurrentPage: setStockPage, totalPages: stockTotalPages, paginatedItems: paginatedStockCards } = usePaginatedItems(stock);

  const hasAnyStock = Object.keys(data.stock || {}).length > 0;


  /*
   * =====================================================
   * SIMPAN OBAT BARU
   * =====================================================
   */

    /**
   * Memvalidasi data pada form penerimaan stok sebelum memanggil handler simpan dan memperbarui status proses pada antarmuka.
   */
  const submit = async () => {
    // Report missing fields separately from an invalid quantity value.
    const existingMedication = existingMedicationForForm;
    const requiredFieldsPresent = Boolean(
      form.batchNumber.trim() &&
      form.name.trim() &&
      form.distributor.trim() &&
      String(form.qty ?? '').trim() !== '' &&
      form.unit.trim() &&
      String(form.administrationRoute || '').trim() &&
      form.expiryDate &&
      String(form.minStock ?? '').trim() !== '' &&
      Number.isInteger(Number(form.minStock)) &&
      Number(form.minStock) >= 0 &&
      (existingMedication || form.file)
    );
    if (!requiredFieldsPresent) {
      notify?.(
        'Lengkapi semua field yang wajib diisi sebelum menambahkan obat.',
        'warning'
      );
      return;
    }

    if (!Number.isInteger(Number(form.qty)) || Number(form.qty) <= 0) {
      notify?.(
        'Jumlah harus berupa bilangan bulat minimal 1.',
        'warning'
      );
      return;
    }

    if (!isFormValid) {
      notify?.(
        'Periksa kembali data obat yang dimasukkan.',
        'warning'
      );
      return;
    }

    if (isPastExpiryDate(form.expiryDate)) {
      notify?.(
        'Tanggal kedaluwarsa sudah lewat. Obat tidak dapat ditambahkan ke dalam sistem.',
        'warning'
      );
      return;
    }

    if (existingMedication) {
      const normalizedBatchNumber = String(form.batchNumber || '').trim().toLocaleUpperCase('id-ID');
      const knownBatchIdentities = Array.isArray(existingMedication.batchIdentityHistory)
        ? existingMedication.batchIdentityHistory
        : (Array.isArray(existingMedication.batches) ? existingMedication.batches : []);
      const conflictingBatch = knownBatchIdentities.find((batch) =>
        String(batch.batchNumberNormalized || batch.batchNumber || '').trim().toLocaleUpperCase('id-ID') === normalizedBatchNumber
        && String(batch.expiryDate || '').slice(0, 10) !== String(form.expiryDate || '').slice(0, 10)
      );
      if (conflictingBatch) {
        notify?.(
          'Nomor batch atau tanggal kedaluwarsa tidak sesuai dengan data yang sudah ada di sistem. Untuk obat yang sama, satu nomor batch harus memiliki satu tanggal kedaluwarsa yang sama.',
          'warning',
        );
        return;
      }
    }

    if (
      existingMedication &&
      String(form.unit || '').trim() !== String(existingMedication.unit || '').trim() &&
      Number(existingMedication.qty || 0) > 0
    ) {
      notify?.(
        `Satuan obat tidak dapat diubah selama masih terdapat stok tersedia (${existingMedication.qty} ${existingMedication.unit || ''}). Keluarkan atau habiskan stok terlebih dahulu agar satuan batch tetap konsisten.`,
        'warning'
      );
      return;
    }

    const masterChanges = [];
    if (existingMedication) {
      const previousDistributor = String(existingMedication.distributor || existingMedication.manufacturer || existingMedication.pabrik || '-').trim();
      const nextDistributor = String(form.distributor || '-').trim();
      const previousUnit = String(existingMedication.unit || '-').trim();
      const nextUnit = String(form.unit || '-').trim();
      const previousAdministrationRoute = String(existingMedication.administrationRoute || '-').trim();
      const nextAdministrationRoute = String(form.administrationRoute || '-').trim();
      const previousMinStock = Number(existingMedication.minStock ?? 50);
      const nextMinStock = Number(form.minStock);

      if (previousDistributor !== nextDistributor) {
        masterChanges.push({ key: 'distributor', label: 'Pabrik', before: previousDistributor, after: nextDistributor });
      }
      if (previousUnit !== nextUnit) {
        masterChanges.push({ key: 'unit', label: 'Satuan', before: previousUnit, after: nextUnit });
      }
      if (previousAdministrationRoute !== nextAdministrationRoute) {
        masterChanges.push({ key: 'administrationRoute', label: 'Rute Pemberian', before: previousAdministrationRoute, after: nextAdministrationRoute });
      }
      if (previousMinStock !== nextMinStock) {
        masterChanges.push({ key: 'minStock', label: 'Batas Minimum Stok', before: String(previousMinStock), after: String(nextMinStock) });
      }
      if (form.file) {
        masterChanges.push({
          key: 'image',
          label: 'Gambar',
          before: existingMedication.image ? 'Gambar saat ini' : 'Belum ada gambar',
          after: form.file.name,
        });
      }
    }

    let image = existingMedication?.image || null;

    if (form.file) {
      try {
        image =
          await fileToDataUrl(
            form.file
          );
      } catch {
        notify?.(
          'Gambar gagal dibaca.',
          'warning'
        );

        return;
      }
    }

    const officer =
      getOfficerName(
        currentUser
      );

    setPendingNewStock({
      ...form,
      minStock: Number(form.minStock),
      image,
      officer,
      currentUser,
      existingMedicationId: existingMedication?._id || null,
      masterChanges,
    });

    setShowAddSummaryModal(true);
  };


  /**
   * Menutup tampilan add summary dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
   */
  const closeAddSummary = () => {
    setShowAddSummaryModal(false);
  };


  /**
   * Menjalankan tindakan add stok setelah keputusan atau konfirmasi yang diperlukan diterima.
   */
  const confirmAddStock = async () => {
    if (!pendingNewStock) {
      return;
    }

    if (isPastExpiryDate(pendingNewStock.expiryDate)) {
      notify?.(
        'Tanggal kedaluwarsa sudah lewat. Obat tidak dapat ditambahkan ke dalam sistem.',
        'warning'
      );
      setPendingNewStock(null);
      setShowAddSummaryModal(false);
      return;
    }

    const result = await onAddStock?.(
      pendingNewStock
    );

    if (result?.ok) {
      notify?.(
        'Obat berhasil disimpan',
        'success'
      );

      setPendingNewStock(null);
      setShowAddSummaryModal(false);
      setForm({
        medicationId: '',
        batchNumber: '',
        name: '',
        distributor: '',
        qty: '',
        unit: '',
        administrationRoute: '',
        expiryDate: '',
        minStock: '50',
        file: null,
      });
    } else {
      if (result?.code === 'BATCH_EXPIRY_MISMATCH') {
        setPendingNewStock(null);
        setShowAddSummaryModal(false);
      }
      notify?.(
        result?.message ||
          'Gagal menyimpan obat.',
        'warning'
      );
    }
  };


  /*
   * =====================================================
   * TAMBAH STOK BATCH BARU
   * =====================================================
   */

    /**
   * Mengirim penambahan jumlah ke obat yang sudah terdaftar setelah satuan dan data batch diperiksa.
   */
  const submitAdditionalStock = async () => {
    if (!additionalBatchNumber.trim()) {
      notify?.(
        'Nomor batch wajib diisi.',
        'warning'
      );
      return;
    }

    if (!additionalExpiryDate) {
      notify?.(
        'Tanggal kedaluwarsa wajib diisi.',
        'warning'
      );
      return;
    }

    if (additionalQty === '') {
      notify?.(
        'Jumlah wajib diisi.',
        'warning'
      );
      return;
    }

    if (isPastExpiryDate(additionalExpiryDate)) {
      notify?.(
        'Tanggal kedaluwarsa sudah lewat. Obat tidak dapat ditambahkan ke dalam sistem.',
        'warning'
      );
      return;
    }

    const qty = Number(additionalQty);
    if (!Number.isInteger(qty) || qty < 1) {
      notify?.(
        'Jumlah obat harus minimal 1.',
        'warning'
      );
      return;
    }

    if (!active) {
      notify?.(
        'Obat belum dipilih.',
        'warning'
      );

      return;
    }

    const stockItem =
      data.stock?.[
        active
      ];

    if (!stockItem) {
      notify?.(
        'Data obat tidak ditemukan.',
        'warning'
      );

      return;
    }

    const transactionId =
      Date.now().toString();

    const officer =
      getOfficerName(
        currentUser
      );

    const payload = {
      type: 'in',
      transactionId,
      medicationId: stockItem._id,
      existingMedicationId: stockItem._id,
      name: stockItem.name,
      stockName: stockItem.name,
      distributor: stockItem.distributor || '-',
      minStock: stockItem.minStock ?? 50,
      qty,
      unit: stockItem.unit || 'tablet',
      batchNumber: additionalBatchNumber.trim(),

      expiryDate:
        additionalExpiryDate,

      reference:
        transactionId,

      officer,

      currentUser,
    };

    const result = await onAddStock?.(payload);

    if (result?.ok) {
      notify?.(
        'Stok obat berhasil ditambahkan.',
        'success'
      );

      setAdditionalQty(
        ''
      );

      setAdditionalBatchNumber(
        ''
      );

      setAdditionalExpiryDate(
        ''
      );

      setShowAddStockModal(
        false
      );
    } else {
      notify?.(
        result?.message ||
          'Gagal menambahkan stok obat.',
        'warning'
      );
    }
  };


  /*
   * =====================================================
   * HAPUS OBAT
   * =====================================================
   */

  /**
   * Menangani aksi delete stok dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleDeleteStock = async () => {
    if (!active) {
      notify?.(
        'Obat belum dipilih.',
        'warning'
      );

      return;
    }

    const stockItem =
      data.stock?.[
        active
      ];

    if (!stockItem) {
      notify?.(
        'Data obat tidak ditemukan.',
        'warning'
      );

      return;
    }

    const result = await onDeleteStock?.(active);

    if (result?.ok) {
      notify?.(
        'Obat berhasil dihapus atau dinonaktifkan.',
        'success'
      );

      setShowAddStockModal(
        false
      );

      setTransactionModalOpen(
        false
      );

      setAdditionalQty(
        ''
      );

      setAdditionalBatchNumber(
        ''
      );

      setAdditionalExpiryDate(
        ''
      );

      setSelectedBatch(
        null
      );

      setActive(
        null
      );
    } else if (
      !result?.cancelled
    ) {
      notify?.(
        result?.message ||
          'Gagal menghapus obat.',
        'warning'
      );
    }
  };


  /*
   * =====================================================
   * DATA BATCH UNTUK OBAT AKTIF
   * =====================================================
   */

  const activeStock =
    active
      ? data.stock?.[
          active
        ]
      : null;


  const activeBatches =
    useMemo(() => {
      if (!activeStock) {
        return [];
      }

      if (
        Array.isArray(
          activeStock.batches
        )
      ) {
        return sortBatchesForDispense(
          activeStock.batches
            .map(
              (batch) => ({
                ...batch,

                batchNumber:
                  batch.batchNumber ||
                  '-',

                expiryDate:
                  batch.expiryDate ||
                  '',
              })
            )
        );
      }

      /*
       * Fallback untuk data lama.
       */
      return [
        {
          batchNumber:
            activeStock.batchNumber ||
            '-',

          expiryDate:
            activeStock.expiryDate ||
            '',

          qty:
            Number(
              activeStock.qty
            ) || 0,

          receivedAt:
            activeStock.createdAt ||
            '',
        },
      ];
    }, [
      activeStock,
    ]);


  /**
   * Menangani aksi delete selected batch dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleDeleteSelectedBatch = async (stockName, batch) => {
    const result = await onDeleteStockBatch?.(stockName, batch);

    if (result?.ok) {
      notify?.(
        'Batch obat berhasil dihapus.',
        'success'
      );
      closeTransactionModal();
    } else if (!result?.cancelled) {
      notify?.(
        result?.message ||
          'Obat tidak ditemukan atau penghapusan tidak dapat diproses.',
        'warning'
      );
    }

    return result;
  };


  /*
   * =====================================================
   * HISTORY UNTUK BATCH TERPILIH
   * =====================================================
   */

  const transactionHistory =
    useMemo(() => {
      if (
        !active ||
        !selectedBatch
      ) {
        return [];
      }

      const history =
        Array.isArray(
          data.stockHistory?.[
            active
          ]
        )
          ? [
              ...data.stockHistory[
                active
              ],
            ]
          : [];

      return history
        .filter(
          (item) =>
            (
              item.batchNumber ||
              item.batch ||
              '-'
            ) ===
              (
                selectedBatch.batchNumber ||
                '-'
              ) &&
            (
              item.expiryDate ||
              ''
            ) ===
              (
                selectedBatch.expiryDate ||
                ''
              )
        )
        .sort(
          (a, b) =>
            new Date(
              b.time ||
                b.date ||
                b.createdAt ||
                0
            ) -
            new Date(
              a.time ||
                a.date ||
                a.createdAt ||
                0
            )
        );
    }, [
      active,
      selectedBatch,
      data.stockHistory,
    ]);


  /*
   * =====================================================
   * BUKA DETAIL TRANSAKSI
   * =====================================================
   */

    /**
   * Memilih item/batch stok sebagai konteks lalu membuka modal riwayat transaksi terkait.
   */
  const openTransactionHistory = (
    batch
  ) => {
    setSelectedBatch(
      batch
    );

    setTransactionModalOpen(
      true
    );
  };


  /*
   * =====================================================
   * RESET MODAL TRANSAKSI
   * =====================================================
   */

  /**
   * Menutup tampilan transaksi modal dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
   */
  const closeTransactionModal = () => {
    setTransactionModalOpen(
      false
    );

    setSelectedBatch(
      null
    );
  };


  /**
   * Menyimpan atau memperbarui gambar replacement dengan mengikuti validasi dan aturan bisnis pada modul.
   */
  const saveImageReplacement = async () => {
    if (!active || !imageReplacementFile || isUpdatingImage) return;
    if (!imageReplacementFile.type.startsWith('image/')) {
      notify?.('Pilih file gambar yang valid.', 'warning');
      return;
    }
    if (imageReplacementFile.size > 5 * 1024 * 1024) {
      notify?.('Ukuran gambar maksimal 5 MB.', 'warning');
      return;
    }
    const activeItem = data.stock?.[active];
    if (!activeItem?._id || typeof onUpdateStockImage !== 'function') {
      notify?.('Fungsi ubah gambar obat belum tersedia.', 'warning');
      return;
    }
    setIsUpdatingImage(true);
    try {
      const result = await onUpdateStockImage(activeItem._id, imageReplacementFile);
      if (result?.ok) {
        notify?.('Gambar obat berhasil diperbarui.', 'success');
        setImageReplacementFile(null);
      } else {
        notify?.(result?.message || 'Gagal memperbarui gambar obat.', 'warning');
      }
    } catch (error) {
      notify?.(error?.message || 'Gagal memperbarui gambar obat.', 'warning');
    } finally {
      setIsUpdatingImage(false);
    }
  };

  /*
   * =====================================================
   * RENDER
   * =====================================================
   */

  return (
    <div className="workspace-stack">

      {/* =================================================
          TAMBAH OBAT
      ================================================= */}

      <Card>

        <div className="section-head">
          <div>
            <h3>
              Tambah Obat
            </h3>

            <p>
              Tambah obat baru atau batch pada obat yang sudah terdaftar.
            </p>
          </div>
        </div>


        <div className="form-grid three-cols stock-add-form-grid">

          {/* Urutan master obat: Nama Obat, Satuan, Rute Pemberian Obat, Pabrik */}
          <Field label="Nama Obat" required>
            <SearchableSelect
              searchable
              allowCustom
              allowSpaceInput
              placeholder="Cari atau pilih nama obat"
              className="control control-compact"
              value={form.medicationId || form.name}
              onChange={handleStockMedicationNameChange}
              filterOption={(option, query) => {
                const medication = findMedicationById(option.value);
                return String(option.label || '').toLocaleLowerCase('id-ID').includes(String(query).toLocaleLowerCase('id-ID'))
                  || Boolean(medication && isSimilarMedicationName(query, medication.name));
              }}
            >
              <option value="">Pilih nama obat</option>
              {medicationNameOptions.map((item) => (
                <option key={item._id} value={item._id}>
                  {`${item.name} - ${item.unit || '-'} - ${item.distributor || item.manufacturer || item.pabrik || '-'}`}
                </option>
              ))}
            </SearchableSelect>
          </Field>

          <Field label="Satuan" required>
            <SearchableSelect
              className={`control control-compact${existingMedicationForForm ? ' stock-master-locked-control' : ''}`}
              placeholder="Pilih satuan"
              value={form.unit}
              disabled={Boolean(existingMedicationForForm)}
              onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
            >
              <option value="">Pilih satuan</option>
              <option value="botol">Botol</option>
              <option value="tube">Tube</option>
              <option value="tablet">Tablet</option>
              <option value="kapsul">Kapsul</option>
              <option value="pen">Pen</option>
              {existingMedicationForForm?.unit
                && !['botol', 'tube', 'tablet', 'kapsul', 'pen'].includes(String(existingMedicationForForm.unit).trim()) ? (
                  <option value={existingMedicationForForm.unit}>{existingMedicationForForm.unit}</option>
                ) : null}
            </SearchableSelect>
          </Field>

          <Field label="Rute Pemberian" required>
            <SearchableSelect
              searchable
              allowSpaceInput
              placeholder="Cari atau pilih rute pemberian"
              className="control control-compact"
              value={form.administrationRoute}
              onChange={(event) => setForm((current) => ({ ...current, administrationRoute: event.target.value }))}
            >
              <option value="">Pilih rute pemberian</option>
              {MEDICATION_ADMINISTRATION_ROUTES.map((route) => (
                <option key={route} value={route}>{route}</option>
              ))}
              {existingMedicationForForm?.administrationRoute
                && !MEDICATION_ADMINISTRATION_ROUTES.includes(existingMedicationForForm.administrationRoute) ? (
                  <option value={existingMedicationForForm.administrationRoute}>{existingMedicationForForm.administrationRoute}</option>
                ) : null}
            </SearchableSelect>
          </Field>

          <Field label="Pabrik" required className="stock-add-manufacturer-field">
            <TextInput
              className={`control stock-add-manufacturer-control${existingMedicationForForm ? ' stock-master-locked-control' : ''}`}
              value={form.distributor}
              onChange={handleStockManufacturerChange}
              placeholder="Masukkan pabrik"
              disabled={Boolean(existingMedicationForForm)}
            />
          </Field>

          {/* Baris 2: batas minimum stok dan gambar */}
          <Field label="Batas Minimum Stok" required>
            <TextInput
              type="number"
              min="0"
              step="1"
              value={form.minStock}
              onChange={(event) => setForm((current) => ({ ...current, minStock: event.target.value }))}
              placeholder="Contoh: 50"
            />
          </Field>

          <Field label="Gambar" required={!existingMedicationForForm} className="stock-image-field">
            <label className="file-control">
              <span className={form.file ? 'file-name active' : 'file-name'}>
                {form.file
                  ? form.file.name
                  : existingMedicationForForm?.image ? 'Ganti gambar' : 'Pilih gambar'}
              </span>
              <span className="file-button">Pilih</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
              />
            </label>
          </Field>
        </div>

        {/* Baris 3: informasi batch pertama di dalam kotak internal, mengikuti form resep Dokter FKTP. */}
        <div className="form-section stock-first-batch-section">
          <div className="result-card detail prescription-form-input-card stock-first-batch-card">
            <div className="form-grid three-cols">
              <Field label="Nomor Batch" required>
                <TextInput
                  value={form.batchNumber}
                  onChange={(event) => setForm((current) => ({ ...current, batchNumber: event.target.value }))}
                  placeholder="Masukkan nomor batch"
                />
              </Field>
              <Field label="Tanggal Kedaluwarsa" required>
                <TextInput
                  type="date"
                  value={form.expiryDate}
                  onChange={(event) => setForm((current) => ({ ...current, expiryDate: event.target.value }))}
                />
              </Field>
              <Field label="Jumlah" required>
                <TextInput
                  type="number"
                  min="1"
                  step="1"
                  value={form.qty}
                  onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))}
                  placeholder="Masukkan jumlah"
                />
              </Field>
            </div>
          </div>
        </div>

        <Button
          className="add-account-btn"
          onClick={
            submit
          }
        >
          <Plus size={16} />
          {existingMedicationForForm ? 'Tambah Batch' : 'Tambah Obat'}
        </Button>

      </Card>


      {/* =================================================
          MODAL RINGKASAN OBAT
      ================================================= */}
      <Modal
        open={showAddSummaryModal}
        scrollable={false}
        size={pendingNewStock?.masterChanges?.length ? 'lg' : undefined}
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>
                {pendingNewStock?.masterChanges?.length ? 'Konfirmasi Perubahan Data Obat' : 'Ringkasan Obat'}
              </h3>

              <p>
                {pendingNewStock?.masterChanges?.length
                  ? 'Bandingkan data master obat sebelum perubahan disimpan dan batch baru ditambahkan.'
                  : 'Periksa data obat sebelum ditambahkan.'}
              </p>
            </div>
          </div>
        }
        onClose={closeAddSummary}
      >
        {pendingNewStock ? (
          <div className="account-preview-scroll">
            <div className="account-preview">

              {pendingNewStock.masterChanges?.length ? (
                <div className="stack stock-master-change-confirmation">
                  <div className="result-card detail">
                    <div className="section-head tight"><div><h3>Data Sebelumnya</h3></div></div>
                    <div className="preview-grid">
                      {pendingNewStock.masterChanges.map((item) => (
                        <div className="preview-item" key={`stock-before-${item.key}`}>
                          <span>{item.label}</span>
                          <strong>{item.before || '-'}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="result-card detail">
                    <div className="section-head tight"><div><h3>Data Setelah Perubahan</h3></div></div>
                    <div className="preview-grid">
                      {pendingNewStock.masterChanges.map((item) => (
                        <div className="preview-item" key={`stock-after-${item.key}`}>
                          <span>{item.label}</span>
                          <strong>{item.after || '-'}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="document-split-layout medication-summary-layout">
                <div className="document-info-pane medication-summary-info-pane">
                  <div className="preview-grid medication-summary-grid">
                    <div className="preview-item"><span>Nomor Batch</span><strong>{pendingNewStock.batchNumber || '-'}</strong></div>
                    <div className="preview-item"><span>Nama Obat</span><strong>{pendingNewStock.name || '-'}</strong></div>
                    <div className="preview-item"><span>Pabrik</span><strong>{pendingNewStock.distributor || '-'}</strong></div>
                    <div className="preview-item"><span>Tanggal Kedaluwarsa</span><strong>{formatDate(pendingNewStock.expiryDate)}</strong></div>
                    <div className="preview-item"><span>Satuan</span><strong>{pendingNewStock.unit || '-'}</strong></div>
                    <div className="preview-item"><span>Rute Pemberian</span><strong>{pendingNewStock.administrationRoute || '-'}</strong></div>
                    <div className="preview-item"><span>Jumlah</span><strong>{pendingNewStock.qty || 0}</strong></div>
                    <div className="preview-item"><span>Batas Minimum Stok</span><strong>{pendingNewStock.minStock ?? 50}</strong></div>
                    <div className="preview-item"><span>Petugas</span><strong>{pendingNewStock.officer || '-'}</strong></div>
                  </div>
                </div>
                <div className="document-viewer-pane medication-summary-image-pane">
                  <div className="preview-section">
                    <div className="preview-document-head">
                      <div><span>Gambar</span><strong>Preview obat</strong></div>
                    </div>
                    {pendingNewStock.image ? (
                      <img
                        src={pendingNewStock.image}
                        alt={pendingNewStock.name || 'Obat'}
                        className="medication-summary-image"
                      />
                    ) : (
                      <div className="document-empty medication-summary-image-empty">Belum ada gambar obat.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="preview-actions">
                <Button
                  onClick={confirmAddStock}
                >
                  {pendingNewStock.masterChanges?.length ? 'Konfirmasi Perubahan & Tambah Stok' : 'Konfirmasi'}
                </Button>
              </div>

            </div>
          </div>
        ) : null}
      </Modal>


      {/* =================================================
          STOK OBAT
      ================================================= */}

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
              value={
                search
              }
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Cari nama obat"
            debounceMs={400}
/>
          </Field>


          <Field label="Filter">
            <SearchableSelect
              className="control control-compact"
              value={
                sort
              }
              onChange={(e) =>
                setSort(
                  e.target.value
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

          {stock.length ? (
            paginatedStockCards.map(
              (item) => (
                <button
                  type="button"
                  className="stock-card"
                  key={item._id || item.id}
                  onClick={() => setActive(item._id || item.id)}
                >

                  {/* Gambar */}
                  <div className="stock-image">

                    {item.image ? (
                      <img
                        src={
                          item.image
                        }
                        alt={
                          item.name
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


                  <div className="stock-card-information stock-card-information-admin stock-card-information-pharmacy">
                    <div className="stock-card-admin-row">
                      <div className="stock-card-admin-left">
                        <span className="stock-card-admin-name">{item.name}</span>
                      </div>
                      <div className="stock-card-admin-right">
                        <Badge className="stock-card-quantity" tone={getStockCardTone(item)}>
                          {item.qty ?? 0} {item.unit || ''}
                        </Badge>
                      </div>
                    </div>
                    <div className="stock-card-admin-row">
                      <div className="stock-card-admin-left">
                        <span className="stock-card-admin-manufacturer">{item.distributor || item.manufacturer || item.pabrik || '-'}</span>
                      </div>
                      <div className="stock-card-admin-right stock-card-admin-expiry">
                        <span>{getNearestExpiryLabel(item)}</span>
                      </div>
                    </div>
                  </div>

                </button>
              )
            )
          ) : (
            <div className="empty-inline">
              {hasAnyStock
                ? 'Tidak ada obat yang ditemukan.'
                : 'Belum ada stok obat yang tersedia.'}
            </div>
          )}

        </div>
        <TablePagination currentPage={stockPage} totalPages={stockTotalPages} onPageChange={setStockPage} />

      </Card>


{/* =================================================
    MODAL DETAIL OBAT
================================================= */}

<Modal
  open={Boolean(active)}
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
    setActive(null)
  }
>
  {active ? (
    <div className="account-preview-scroll">

      <div className="account-preview">

        <MedicationDetail
          stockName={
            active
          }

          data={
            data
          }

          batches={
            activeBatches
          }

          onAddStock={() =>
            setShowAddStockModal(
              true
            )
          }

          onDeleteStock={
            handleDeleteStock
          }

          onDeleteBatch={handleDeleteSelectedBatch}
          onWithdrawBatch={onWithdrawStockBatch}
          notify={notify}

          onViewHistory={
            openTransactionHistory
          }
          onSelectImageFile={(file) => {
            if (!file.type.startsWith('image/')) {
              notify?.('Pilih file gambar yang valid.', 'warning');
              return;
            }
            if (file.size > 5 * 1024 * 1024) {
              notify?.('Ukuran gambar maksimal 5 MB.', 'warning');
              return;
            }
            setImageReplacementFile(file);
          }}
          onClose={() => setActive(null)}
        />

      </div>

    </div>
  ) : null}
</Modal>

      <Modal
        open={Boolean(imageReplacementFile)}
        scrollable={false}
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>Preview Gambar</h3>
              <p>Gambar obat yang akan diperbarui.</p>
            </div>
          </div>
        }
        onClose={() => {
          if (!isUpdatingImage) setImageReplacementFile(null);
        }}
        size="lg"
      >
        {imageReplacementFile && imageReplacementUrl ? (
          <div className="account-preview-scroll">
            <div className="account-preview">
              <div className="preview-section">
                <div className="detail-medication-image medication-image-preview-stage">
                  <img src={imageReplacementUrl} alt="Preview gambar obat baru" />
                </div>
                <div className="preview-actions">
                  <Button type="button" onClick={saveImageReplacement} disabled={isUpdatingImage}>
                    {isUpdatingImage ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* =================================================
          MODAL TAMBAH STOK
      ================================================= */}

      <Modal
        open={
          showAddStockModal
        }
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>
                Tambah Stok
              </h3>

              <p>
                Tambah stok dengan batch baru.</p>
            </div>
          </div>
        }
        onClose={() => {
          setAdditionalQty(
            ''
          );

          setAdditionalBatchNumber(
            ''
          );

          setAdditionalExpiryDate(
            ''
          );

          setShowAddStockModal(
            false
          );
        }}
      >

        <div className="stack">

          <div className="result-card">

            <strong>
              {
                activeStock?.name ||
                '-'
              }
            </strong>

            <div className="result-meta">
              <span>
                Stok saat ini:{' '}
                {
                  activeStock?.qty ||
                  0
                }{' '}
                {
                  activeStock?.unit ||
                  ''
                }
              </span>
            </div>

          </div>


          {/* Satu baris */}
          <div className="form-grid three-cols">

            <Field label="Nomor Batch" required>
              <TextInput
                value={
                  additionalBatchNumber
                }
                onChange={(e) =>
                  setAdditionalBatchNumber(
                    e.target.value
                  )
                }
                placeholder="Masukkan nomor batch"
              />
            </Field>


            <Field label="Tanggal Kedaluwarsa" required>
              <TextInput
                type="date"
                value={
                  additionalExpiryDate
                }
                onChange={(e) =>
                  setAdditionalExpiryDate(
                    e.target.value
                  )
                }
              />
            </Field>


            <Field label="Jumlah" required>
              <TextInput
                type="number"
                min="1"
                step="1"
                value={
                  additionalQty
                }
                onChange={(e) =>
                  setAdditionalQty(
                    e.target.value
                  )
                }
                placeholder="Masukkan jumlah"
              />
            </Field>

          </div>


          <div className="preview-actions">

            <Button
              onClick={
                submitAdditionalStock
              }
            >
              <Plus size={16} />
              Konfirmasi
            </Button>

          </div>

        </div>

      </Modal>

      {/* =================================================
          MODAL RIWAYAT STOK
      ================================================= */}

      <Modal
        open={
          transactionModalOpen
        }
        scrollable={false}
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
        {active ? (
          <div className="account-preview-scroll">

            <div className="account-preview">

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

                notify={notify}
              />

            </div>

          </div>
        ) : null}

      </Modal>

    </div>
  );
}


/**
 * Merender komponen obat gambar editor dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
function MedicationImageEditor({ image, name, onSelectImageFile }) {
  const inputRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);
    /**
   * Membuka pemilih berkas untuk mengganti gambar obat dan meneruskan berkas yang dipilih ke validasi form.
   */
  const chooseFile = (file) => {
    if (file) onSelectImageFile?.(file);
  };

  return (
    <div
      className={`detail-medication-image ${onSelectImageFile ? 'medication-image-editable' : ''}`}
      aria-label={`Gambar obat ${name}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={() => onSelectImageFile && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (onSelectImageFile && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      role={onSelectImageFile ? 'button' : undefined}
      tabIndex={onSelectImageFile ? 0 : undefined}
    >
      {image ? (
        <img src={image} alt={`Gambar ${name}`} />
      ) : (
        <div className="detail-medication-image-placeholder">
          <Package2 size={42} aria-hidden="true" />
          <span>Gambar obat belum tersedia</span>
        </div>
      )}
      {onSelectImageFile ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="account-edit-hidden-file-input"
            aria-label="Pilih gambar obat baru"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              chooseFile(event.target.files?.[0] || null);
              event.target.value = '';
            }}
          />
          <div className={`medication-image-edit-overlay ${isHovering ? 'is-visible' : ''}`} aria-hidden="true">
            <Camera size={24} />
            <span>Ganti Foto</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

/*
 * =====================================================
 * DETAIL OBAT
 * =====================================================
 */

/**
 * Merender komponen obat detail dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
function MedicationDetail({
  stockName,
  data,
  batches,
  onAddStock,
  onDeleteStock,
  onDeleteBatch,
  onWithdrawBatch,
  notify,
  onViewHistory,
  onSelectImageFile,
  onClose,
}) {
  const stock =
    data.stock?.[
      stockName
    ];
  const [withdrawBatch, setWithdrawBatch] = useState(null);
  const [withdrawReason, setWithdrawReason] = useState('damaged');
  const [withdrawQuantity, setWithdrawQuantity] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

    /**
   * Menetapkan batch yang akan ditarik dan membuka form agar jumlah serta alasan penarikan diperiksa sebelum stok berubah.
   */
  const openWithdrawBatch = (batch) => {
    setWithdrawBatch(batch);
    setWithdrawReason('damaged');
    setWithdrawQuantity('');
  };

  /**
   * Menjalankan tindakan withdraw batch setelah keputusan atau konfirmasi yang diperlukan diterima.
   */
  const confirmWithdrawBatch = async () => {
    if (!withdrawBatch || isWithdrawing) return;
    const maxQuantity = Number(withdrawBatch.qty ?? withdrawBatch.quantity ?? 0);
    const quantity = withdrawReason === 'expired' ? maxQuantity : Number(withdrawQuantity);
    if (withdrawReason !== 'expired' && (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity)) {
      notify?.(`Jumlah pengeluaran harus antara 1 dan ${maxQuantity}.`, 'warning');
      return;
    }
    setIsWithdrawing(true);
    try {
      const result = await onWithdrawBatch?.(stockName, withdrawBatch, { reason: withdrawReason, quantity });
      if (result?.ok) {
        notify?.(
          withdrawReason === 'data_entry_error'
            ? `Jumlah stok batch ${withdrawBatch.batchNumber || '-'} berhasil dikoreksi.`
            : `Stok batch ${withdrawBatch.batchNumber || '-'} berhasil dikeluarkan dari stok layak pakai.`,
          'success',
        );
        setWithdrawBatch(null);
      } else {
        notify?.(result?.message || 'Stok batch gagal dikeluarkan.', 'warning');
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  /*
   * =====================================================
   * STATE PENCARIAN + FILTER BATCH
   * =====================================================
   */

  const [
    batchSearch,
    setBatchSearch,
  ] = useState('');

  const [
    batchSort,
    setBatchSort,
  ] = useState('expiry-near');

  const [batchDateFilter, setBatchDateFilter] = useState({ start: '', end: '' });


  /*
   * =====================================================
   * FILTER + SORT BATCH
   * =====================================================
   */

  const filteredBatches =
    useMemo(() => {
      const keyword =
        batchSearch
          .trim()
          .toLowerCase();

      const result =
        (batches || [])
          .filter(
            (batch) =>
              String(
                batch.batchNumber ||
                  ''
              )
                .toLowerCase()
                .includes(
                  keyword
                )
          )
          .filter((batch) => batchSort !== 'date' || matchesDateFilter(batch?.expiryDate, 'custom', batchDateFilter))
          .sort(
            (a, b) => {
              const batchA =
                String(
                  a.batchNumber ||
                    ''
                );

              const batchB =
                String(
                  b.batchNumber ||
                    ''
                );

              const expiryA =
                a.expiryDate
                  ? new Date(
                      a.expiryDate
                    ).getTime()
                  : Infinity;

              const expiryB =
                b.expiryDate
                  ? new Date(
                      b.expiryDate
                    ).getTime()
                  : Infinity;

              const addedA =
                new Date(
                  a.receivedAt ||
                    a.createdAt ||
                    0
                ).getTime();

              const addedB =
                new Date(
                  b.receivedAt ||
                    b.createdAt ||
                    0
                ).getTime();

              switch (
                batchSort
              ) {
                case 'az':
                  return batchA.localeCompare(
                    batchB,
                    'id',
                    {
                      sensitivity:
                        'base',
                    }
                  );

                case 'za':
                  return batchB.localeCompare(
                    batchA,
                    'id',
                    {
                      sensitivity:
                        'base',
                    }
                  );

                case 'date':
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
                    addedB -
                    addedA
                  );

                case 'old':
                  return (
                    addedA -
                    addedB
                  );

                default:
                  return 0;
              }
            }
          );

      return result;
    }, [
      batches,
      batchSearch,
      batchSort,
      batchDateFilter,
    ]);

  const { currentPage: batchPage, setCurrentPage: setBatchPage, totalPages: batchTotalPages, paginatedItems: paginatedBatches } = usePaginatedItems(filteredBatches);

  return (
    <div className="stack">

      <div className="document-split-layout stock-detail-layout">
        <MedicationImageEditor
          image={stock?.image}
          name={stock?.name || stockName || 'obat'}
          onSelectImageFile={onSelectImageFile}
        />

        <div className="document-info-pane stock-detail-info-pane">
          <div className="preview-grid stock-detail-info-grid">
            <div className="preview-item">
              <span>Nama Obat</span>
              <strong>{stock?.name || stockName || '-'}</strong>
            </div>
            <div className="preview-item">
              <span>ID</span>
              <strong>{stock?.id || '-'}</strong>
            </div>
            <div className="preview-item">
              <span>Pabrik</span>
              <strong>{stock?.distributor || stock?.manufacturer || stock?.pabrik || '-'}</strong>
            </div>
            <div className="preview-item">
              <span>Rute Pemberian</span>
              <strong>{stock?.administrationRoute || '-'}</strong>
            </div>
            <div className="preview-item">
              <span>Stok</span>
              <strong className="stock-quantity-value prescription-status-value">
                {stock?.qty ?? 0} {stock?.unit || ''}
                {Number(stock?.qty ?? 0) <= Number(stock?.minStock ?? STOCK_ALERT_THRESHOLD) * 1.25 ? (
                  <Badge tone="warning">
                    {Number(stock?.qty ?? 0) < Number(stock?.minStock ?? STOCK_ALERT_THRESHOLD)
                      ? 'Di bawah batas minimum'
                      : Number(stock?.qty ?? 0) <= Number(stock?.minStock ?? STOCK_ALERT_THRESHOLD)
                        ? 'Mencapai batas minimum'
                        : 'Hampir habis'}
                  </Badge>
                ) : null}
              </strong>
            </div>
            <div className="preview-item">
              <span>Batas Minimum Stok</span>
              <strong>{Number(stock?.minStock ?? STOCK_ALERT_THRESHOLD)} {stock?.unit || ''}</strong>
            </div>
          </div>

          <div className="preview-actions stock-detail-actions">
            <Button
              type="button"
              variant="danger"
              title="Hapus obat dari daftar stok aktif beserta seluruh batch"
              onClick={async () => {
                const result = await onDeleteStock?.(stockName);
                if (result?.ok) onClose?.();
              }}
            >
              Hapus Obat
            </Button>
            <Button type="button" onClick={onAddStock}>
              <Plus size={16} />
              Tambah Batch
            </Button>
          </div>
        </div>
      </div>

      {/* =================================================
          PENCARIAN + FILTER
      ================================================= */}
<div className="edit-account-form-card">

      <div className="search-row">

        <Field label="Pencarian">
          <TextInput
            value={
              batchSearch
            }
            onChange={(e) =>
              setBatchSearch(
                e.target.value
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
    </div>


{/* TABEL BATCH */}
<div className="table-shell batch-table-shell pharmacy-batch-detail-table-shell">

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
        paginatedBatches.map(
          (batch, index) => (
            <tr
              key={
                `${
                  batch.batchNumber ||
                  '-'
                }-${
                  batch.expiryDate ||
                  '-'
                }-${
                  batch.receivedAt ||
                  batch.createdAt ||
                  ''
                }-${index}`
              }
            >

              {/* Nomor Batch */}
              <td>
                {
                  batch.batchNumber ||
                  '-'
                }
              </td>

              {/* Tanggal Kedaluwarsa */}
              <td>
                {
                  batch.expiryDate
                    ? formatCalendarDate(batch.expiryDate)
                    : '-'
                }
              </td>

              {/* Stok */}
              <td>
                <span>
                  {
                    batch.qty ??
                    batch.quantity ??
                    0
                  }{' '}
                  {
                    stock?.unit ||
                    ''
                  }
                </span>
              </td>

              {/* Aksi */}
              <td>
                <div className="action-group batch-row-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Lihat riwayat batch ${batch.batchNumber || ''}`}
                    title="Selengkapnya"
                    onClick={() => onViewHistory?.(batch)}
                  >
                    <Eye size={15} aria-hidden="true" />
                    <span className="sr-only">Selengkapnya</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label={`Keluarkan stok batch ${batch.batchNumber || ''}`}
                    title="Keluarkan Stok (Kedaluwarsa/Rusak)"
                    onClick={() => openWithdrawBatch(batch)}
                  >
                    <PackageMinus size={16} aria-hidden="true" />
                    <span className="sr-only">Keluarkan Stok</span>
                  </Button>
                </div>
              </td>

            </tr>
          )
        )
      ) : (
        <tr>
          <td colSpan="4">
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
<TablePagination currentPage={batchPage} totalPages={batchTotalPages} onPageChange={setBatchPage} />

      <Modal
        open={Boolean(withdrawBatch)}
        onClose={() => { if (!isWithdrawing) setWithdrawBatch(null); }}
        size="md"
        title={<div className="section-head medication-modal-head"><div><h3>Keluarkan Stok Batch</h3><p>Catat obat yang tidak lagi layak digunakan.</p></div></div>}
      >
        {withdrawBatch ? <div className="stack stock-withdrawal-form">
          <div className="preview-grid stock-withdrawal-info-grid">
            <div className="preview-item"><span>Nama Obat</span><strong>{stock?.name || stockName}</strong></div>
            <div className="preview-item"><span>Nomor Batch</span><strong>{withdrawBatch.batchNumber || '-'}</strong></div>
            <div className="preview-item"><span>Tanggal Kedaluwarsa</span><strong>{formatCalendarDate(withdrawBatch.expiryDate)}</strong></div>
            <div className="preview-item"><span>Stok Batch</span><strong>{withdrawBatch.qty ?? withdrawBatch.quantity ?? 0} {stock?.unit || ''}</strong></div>
          </div>
          <Field label="Alasan Pengeluaran" required>
            <SearchableSelect value={withdrawReason} onChange={(event) => { const next = event.target.value; setWithdrawReason(next); setWithdrawQuantity(next === 'expired' ? String(withdrawBatch.qty ?? withdrawBatch.quantity ?? 0) : ''); }}>
              <option value="expired" disabled={!isPastExpiryDate(withdrawBatch.expiryDate)}>Kedaluwarsa</option>
              <option value="damaged">Rusak</option>
              <option value="data_entry_error">Kesalahan Input Data</option>
            </SearchableSelect>
          </Field>
          <Field label="Jumlah yang Dikeluarkan" required>
            <TextInput type="number" min="1" max={withdrawBatch.qty ?? withdrawBatch.quantity ?? 0} value={withdrawQuantity} onChange={(event) => setWithdrawQuantity(event.target.value)} placeholder="Masukkan jumlah yang dikeluarkan" disabled={withdrawReason === 'expired' || isWithdrawing} />
            <span className="field-hint">{withdrawReason === 'expired' ? 'Seluruh sisa stok pada batch kedaluwarsa akan dikeluarkan.' : `Jumlah maksimal ${withdrawBatch.qty ?? withdrawBatch.quantity ?? 0} ${stock?.unit || ''}.`}</span>
          </Field>
          {withdrawReason === 'expired' && !isPastExpiryDate(withdrawBatch.expiryDate) ? <div className="form-validation-hint" role="status">Tanggal batch ini belum terlewati. Pilih alasan Rusak jika stok memang tidak layak digunakan.</div> : null}
          <div className="preview-actions stock-withdrawal-actions">
            <Button type="button" onClick={confirmWithdrawBatch} disabled={isWithdrawing || Number(withdrawBatch.qty ?? withdrawBatch.quantity ?? 0) < 1 || (withdrawReason === 'expired' && !isPastExpiryDate(withdrawBatch.expiryDate))}>{isWithdrawing ? 'Memproses...' : 'Konfirmasi Pengeluaran'}</Button>
          </div>
        </div> : null}
      </Modal>

    </div>
  );
}

/*
 * =====================================================
 * MODAL TRANSAKSI
 * =====================================================
 */

/**
 * Merender komponen transaksi riwayat modal dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
function TransactionHistoryModal({
  stock,
  batch,
  history,
}) {
  const [
    transactionPage,
    setTransactionPage,
  ] = useState(1);
  const [transactionDateFilter, setTransactionDateFilter] = useState('all');
  const [transactionCustomDate, setTransactionCustomDate] = useState('');

  const TRANSACTION_PAGE_SIZE = 10;
  const filteredTransactions = useMemo(() => {
    const rows = (history || []).filter((item) =>
      ['today', 'custom'].includes(transactionDateFilter)
        ? matchesDateFilter(item?.time || item?.createdAt || item?.date, transactionDateFilter, transactionCustomDate)
        : true
    );
    return rows.sort((a, b) => {
      const aTime = new Date(a?.time || a?.createdAt || a?.date || 0).getTime();
      const bTime = new Date(b?.time || b?.createdAt || b?.date || 0).getTime();
      return transactionDateFilter === 'old' ? aTime - bTime : bTime - aTime;
    });
  }, [history, transactionDateFilter, transactionCustomDate]);
  const transactionTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / TRANSACTION_PAGE_SIZE));
  const paginatedTransactions = filteredTransactions.slice(
    (transactionPage - 1) * TRANSACTION_PAGE_SIZE,
    transactionPage * TRANSACTION_PAGE_SIZE
  );

  /*
   * Reset ke halaman 1 setiap kali
   * batch yang dipilih berubah.
   */
  useEffect(() => {
    setTransactionPage(1);
  }, [batch, history, transactionDateFilter, transactionCustomDate]);

  return (
    <div className="stack">

      {/* =================================================
          INFO BATCH
      ================================================= */}
      <div className="result-card detail">

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
            {formatDate(
              batch?.expiryDate
            )}
          </span>

          <span>
            Stok:{' '}
            {batch?.qty ?? 0}{' '}
            {stock?.unit || ''}
          </span>

        </div>

      </div>

      {/* =================================================
          TABEL TRANSAKSI
      ================================================= */}
      <DateFilterBar value={transactionDateFilter} onChange={(nextValue) => { setTransactionDateFilter(nextValue); if (nextValue !== 'custom') setTransactionCustomDate(''); }} customDate={transactionCustomDate} onCustomDateChange={setTransactionCustomDate} options={[{ value: 'all', label: 'Semua' }, { value: 'new', label: 'Terbaru' }, { value: 'old', label: 'Terlama' }, { value: 'today', label: 'Hari Ini' }, { value: 'custom', label: 'Waktu/Tanggal' }]} customValue="custom" fallbackValue="all" dateLabel="Waktu/Tanggal" />

      <div className="table-shell batch-table-shell history pharmacy-stock-history-table-shell">

        <table className="data-table">

          <thead>
            <tr>

              <th>
                ID Transaksi
              </th>

              <th>
                Waktu/Tanggal
              </th>

              <th>
                Jenis
              </th>

              <th>
                Jumlah
              </th>

              <th>
                Petugas
              </th>

            </tr>
          </thead>


          <tbody>

            {filteredTransactions.length ? (
              paginatedTransactions.map(
                (
                  item,
                  index
                ) => {

                  const transactionId =
                    item.transactionId ||
                    item.id ||
                    '-';

                  const time =
                    item.time ||
                    item.createdAt ||
                    item.date ||
                    null;

                  const rawType = item.type || item.action || '-';
                  const referenceText = String(item.reference || '').trim().toLocaleLowerCase('id-ID');
                  const isStockOut = rawType === 'out' || rawType === 'Keluar';
                  const typeLabel = rawType === 'in' || rawType === 'Masuk'
                    ? 'Masuk'
                    : isStockOut && item.presId
                      ? 'Keluar — Ditebus di Resep'
                      : isStockOut && (referenceText.includes('kedaluwarsa') || referenceText.includes('expired'))
                        ? 'Keluar — Kedaluwarsa'
                        : isStockOut && referenceText.includes('rusak')
                          ? 'Keluar — Rusak'
                          : isStockOut && (
                            referenceText.includes('kesalahan input') ||
                            referenceText.includes('data_entry_error') ||
                            referenceText.includes('penyesuaian stok')
                          )
                            ? 'Keluar — Kesalahan Input Data'
                            : rawType === 'out' || rawType === 'Keluar'
                              ? 'Keluar'
                              : rawType;

                  const quantity =
                    item.qty ??
                    item.quantity ??
                    0;

                  const officer =
                    item.officer ||
                    item.by ||
                    '-';

                  return (
                    <tr
                      key={
                        transactionId !== '-'
                          ? transactionId
                          : index
                      }
                    >

                      <td>
                        {transactionId}
                      </td>


                      <td>
                        {time
                          ? formatDateTimeWita(time)
                          : '-'}
                      </td>


                      <td>
                        <Badge
                          tone={typeLabel === 'Masuk' ? 'green' : 'yellow'}
                        >
                          {typeLabel}
                        </Badge>
                      </td>


                      <td>
                        {quantity}{' '}
                        {stock?.unit || ''}
                      </td>


                      <td>
                        {officer}
                      </td>

                    </tr>
                  );
                }
              )
            ) : (
              <tr>
                <td colSpan="5">
                  <div className="empty-table">
                    Tidak ada transaksi pada tanggal yang dipilih.
                  </div>
                </td>
              </tr>
            )}

          </tbody>

        </table>

      </div>


      {/* =================================================
          PAGINATION
      ================================================= */}
      {transactionTotalPages > 1 && (
        <div className="activity-pagination">

          <button
            type="button"
            className="pagination-btn"
            onClick={() =>
              setTransactionPage(
                (page) =>
                  Math.max(
                    1,
                    page - 1
                  )
              )
            }
            disabled={
              transactionPage === 1
            }
          >
            Sebelumnya
          </button>


          <CompactPagination currentPage={transactionPage} totalPages={transactionTotalPages} onPageChange={setTransactionPage} />


          <button
            type="button"
            className="pagination-btn"
            onClick={() =>
              setTransactionPage(
                (page) =>
                  Math.min(
                    transactionTotalPages,
                    page + 1
                  )
              )
            }
            disabled={
              transactionPage ===
              transactionTotalPages
            }
          >
            Berikutnya
          </button>

        </div>
      )}

    </div>
  );
}
