/**
 * Menampilkan riwayat resep Dokter FKTP dan tindakan yang diizinkan pada resep.
 */
import { useMemo, useEffect, useState } from 'react';

import { PencilLine, Trash2 } from 'lucide-react';

import { Card } from '../ui/Card';
import { CompactPagination } from '../ui/CompactPagination';
import { usePaginatedItems } from '../ui/usePaginatedItems';
import { TablePagination } from '../ui/TablePagination';
import { Button } from '../ui/Button';
import { Field, TextInput } from '../ui/Field';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { api } from '../../lib/api';
import { getPdfPreviewUrl } from '../../lib/pdfPreview';


import { PrescriptionEditModal } from './PrescriptionEditModal';
import {
  isEditableWithin24Hours,
  matchesDateFilter,
  formatDateTime as formatDateTimeWita,
} from '../../lib/date';
import { DateFilterBar } from './DateFilterBar';
import { PrescriptionClinicalDetails } from './PrescriptionClinicalDetails';
import {
  getPatientForPrescription,
  getPatientName,
  getPatientPhone,
  getPatientBpjs,
  normalizeBpjs,
} from '../../lib/patients';
import { capitalizeFirstLetter } from '../../lib/text';
import { getNextPickupDate, formatPrescriptionRedemptionTime as getPickedDate } from '../../lib/prescriptions';


/**
 * Mengambil aturan pakai dari item obat resep dengan mendukung alias field yang masih digunakan data lama.
 */
const getPrescriptionDoseInstruction = (med) =>
  med?.doseInstruction ||
  med?.aturanPakai ||
  '-';

/**
 * Mengambil catatan tambahan dari field catatan item obat yang tersedia pada resep.
 */
const getPrescriptionNotes = (med) => {
  const value = med?.notes || med?.catatanTambahan || '';
  return String(value).trim() || '-';
};

/**
 * Menentukan bahwa resep telah ditebus berdasarkan status picked atau salah satu penanda waktu penebusan.
 */
const isPrescriptionRedeemed = (prescription) => Boolean(
  prescription?.status === 'picked' ||
  prescription?.pickedAt ||
  prescription?.redeemedAt ||
  prescription?.dispensedAt
);

/**
 * Merender komponen Dokter riwayat panel dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function DoctorHistoryPanel({
  data,
  stockMap,
  currentUser,
  onEditPrescription,
  onDeletePrescription,
  notify,
  onAddDoseOption,
  onRemoveDoseOption,
}) {
  const [q, setQ] =
    useState('');

  const [sort, setSort] =
    useState('new');

  const [historyDateFilter, setHistoryDateFilter] = useState({ start: '', end: '' });

  /*
   * Modal Detail Resep
   */
  const [selected, setSelected] =
    useState(null);

  const selectedMedicationRows = useMemo(
    () => (Array.isArray(selected?.meds) ? selected.meds : []).filter((med) => String(med?.med || '').trim() && Number(med?.q ?? med?.qty ?? 0) > 0),
    [selected?.meds]
  );
  const { currentPage: selectedMedicationPage, setCurrentPage: setSelectedMedicationPage, totalPages: selectedMedicationTotalPages, paginatedItems: paginatedSelectedMedicationRows } = usePaginatedItems(selectedMedicationRows);

  /*
   * Modal Ubah Resep
   */
  const [editing, setEditing] =
    useState(null);

  const [bookDocumentUrl, setBookDocumentUrl] = useState('');
  const [isLoadingBookDocument, setIsLoadingBookDocument] = useState(false);
  const [bookDocumentError, setBookDocumentError] = useState('');

  const selectedChronicBook = useMemo(() => {
    if (!selected) return null;
    const patient = getPatientForPrescription(data, selected);
    const prescriptionPatientId = String(selected.patientId || patient?.id || patient?._id || '');
    const prescriptionBpjs = normalizeBpjs(getPatientBpjs(patient));

    const match = Object.entries(data?.chronicBooks || {}).find(([, book]) => {
      const bookPatientId = String(book?.patientId || '');
      const bookBpjs = normalizeBpjs(
        book?.bpjsNumber || book?.bpjs || book?.nomorBpjs || book?.nomorBPJS ||
        book?.noBpjs || book?.bpjsCardNumber || ''
      );

      return Boolean(
        (prescriptionPatientId && bookPatientId && prescriptionPatientId === bookPatientId) ||
        (prescriptionBpjs && bookBpjs && prescriptionBpjs === bookBpjs)
      );
    });

    return match ? { id: match[0], ...(match[1] || {}) } : null;
  }, [data?.chronicBooks, data?.patients, selected]);

  useEffect(() => {
    let cancelled = false;
    let createdObjectUrl = '';

    /**
     * Memuat file Buku Kronis yang sesuai dengan resep terpilih untuk pratinjau Dokter, serta mengatur status loading dan error selama permintaan berlangsung.
     */
    const loadBookDocument = async () => {
      setBookDocumentUrl('');
      setBookDocumentError('');

      if (!selected) {
        setIsLoadingBookDocument(false);
        return;
      }

      if (!selectedChronicBook) {
        setIsLoadingBookDocument(false);
        setBookDocumentError('Buku Kronis pasien belum tersedia.');
        return;
      }

      if (selectedChronicBook.fileId) {
        setIsLoadingBookDocument(true);
        try {
          createdObjectUrl = await api.files.createObjectUrl(selectedChronicBook.fileId);
          if (cancelled) {
            URL.revokeObjectURL(createdObjectUrl);
            return;
          }
          setBookDocumentUrl(createdObjectUrl);
        } catch (error) {
          if (!cancelled) {
            setBookDocumentError(error?.message || 'Dokumen Buku Kronis tidak dapat dibuka.');
          }
        } finally {
          if (!cancelled) setIsLoadingBookDocument(false);
        }
        return;
      }

      const directUrl = selectedChronicBook.fileUrl || selectedChronicBook.fileData ||
        selectedChronicBook.url || selectedChronicBook.dataUrl || '';
      if (!cancelled) {
        setBookDocumentUrl(directUrl);
        if (!directUrl) setBookDocumentError('File PDF Buku Kronis tidak tersedia.');
        setIsLoadingBookDocument(false);
      }
    };

    loadBookDocument();

    return () => {
      cancelled = true;
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [selected, selectedChronicBook]);

    /*
 * =================================================
 * PAGINATION RIWAYAT PASIEN
 * =================================================
 */
const DOCTOR_HISTORY_PAGE_SIZE = 10;

const [
 historyPage,
  setHistoryPage,
] = useState(1);

  /*
   * =================================================
   * FILTER & SORT RIWAYAT
   * =================================================
   */
  const list = useMemo(() => {
    const query =
      q.trim().toLowerCase();

    const rows =
      (data.prescriptions || [])
        .filter(
          (prescription) => {
            // Data riwayat telah dibatasi oleh back-end berdasarkan Dokter FKTP yang sedang login.
            if (sort === 'date' && !matchesDateFilter(prescription.createdAt, 'custom', historyDateFilter)) return false;

            if (!query) {
              return true;
            }

            const patient =
              getPatientForPrescription(
                data,
                prescription
              );

            const patientName =
              getPatientName(patient)
                .toLowerCase();

            const bpjs =
              getPatientBpjs(patient);

            const normalizedBpjsQuery = /^[\d\s-]+$/.test(query)
              ? query.replace(/\D/g, '')
              : '';

            return (
              patientName.includes(query) ||
              (normalizedBpjsQuery && bpjs.includes(normalizedBpjsQuery))
            );
          }
        );

    return [
      ...rows,
    ].sort(
      (a, b) => {
        switch (sort) {

          case 'az':
            return getPatientName(
              getPatientForPrescription(
                data,
                a
              )
            ).localeCompare(
              getPatientName(
                getPatientForPrescription(
                  data,
                  b
                )
              ),
              'id',
              {
                sensitivity:
                  'base',
              }
            );

          case 'za':
            return getPatientName(
              getPatientForPrescription(
                data,
                b
              )
            ).localeCompare(
              getPatientName(
                getPatientForPrescription(
                  data,
                  a
                )
              ),
              'id',
              {
                sensitivity:
                  'base',
              }
            );

          case 'old':
            return (
              new Date(
                a.createdAt || 0
              ) -
              new Date(
                b.createdAt || 0
              )
            );

          case 'new':
          default:
            return (
              new Date(
                b.createdAt || 0
              ) -
              new Date(
                a.createdAt || 0
              )
            );
        }
      }
    );
  }, [
    data.prescriptions,
    currentUser,
    q,
    sort,
    historyDateFilter,
  ]);

  /*
 * =================================================
 * PAGINATION
 * =================================================
 */
const historyTotalPages =
  Math.max(
    1,
    Math.ceil(
      list.length /
        DOCTOR_HISTORY_PAGE_SIZE
    )
  );

const paginatedHistory =
  list.slice(
    (historyPage - 1) *
      DOCTOR_HISTORY_PAGE_SIZE,
    historyPage *
      DOCTOR_HISTORY_PAGE_SIZE
  );


/*
 * =================================================
 * RESET HALAMAN SAAT PENCARIAN / FILTER BERUBAH
 * =================================================
 */
useEffect(() => {
  setHistoryPage(1);
}, [
  q,
  sort,
  historyDateFilter,
]);

  /*
   * =================================================
   * BUKA MODAL EDIT
   * =================================================
   *
   * PENTING:
   * selected TIDAK dibuat null.
   *
   * Dengan demikian Modal Detail Resep tetap terbuka
   * dan PrescriptionEditModal akan muncul di atasnya.
   *
   * Ini mengikuti pola modal bertingkat pada Dashboard
   * Dokter FKTP.
   */
/**
 * Memilih resep yang akan diedit dan membuka editor dengan data resep tersebut sebelum perubahan dikirim.
 */
const openEdit = (
  prescription
) => {
  if (
    !isEditableWithin24Hours(
      prescription?.createdAt
    )
  ) {
    notify?.(
      'Resep hanya dapat diedit dalam 24 jam setelah dibuat.',
      'warning'
    );

    return;
  }

  /*
   * Jangan menutup Detail Resep.
   *
   * selected tetap berisi resep.
   * editing akan membuka modal kedua
   * di atas Detail Resep.
   */
  setEditing(
    prescription
  );
};


  /*
   * =================================================
   * SIMPAN HASIL EDIT
   * =================================================
   *
   * PrescriptionEditModal mengirim:
   *
   * onSave(
   *   diagnosis,
   *   meds
   * )
   *
   */
/**
 * Menangani aksi save edit dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
 */
const handleSaveEdit = async (
  diagnosis,
  meds
) => {
  if (!editing) {
    notify?.(
      'Resep yang akan diubah tidak ditemukan.',
      'warning'
    );

    return {
      ok: false,
      message:
        'Resep yang akan diubah tidak ditemukan.',
    };
  }

  /*
   * Pastikan meds yang diterima
   * benar-benar berupa array obat.
   */
  if (
    !Array.isArray(meds) ||
    meds.length === 0
  ) {
    notify?.(
      'Data obat tidak valid.',
      'warning'
    );

    return {
      ok: false,
      message:
        'Data obat tidak valid.',
    };
  }

  try {
    /*
     * PENTING:
     * handleEditPrescription di parent
     * menerima:
     *
     *   prescription
     *   meds
     *
     * Jadi jangan kirim diagnosis
     * sebagai argumen kedua.
     */
    const result =
      await onEditPrescription?.(
        editing,
        diagnosis,
        meds
      );

    if (result?.ok) {
      notify?.(
        'Resep berhasil diperbarui.',
        'success'
      );

      /*
       * Tutup modal edit.
       */
      setEditing(null);

      /*
       * Update Detail Resep
       * agar langsung berubah.
       */
      setSelected(
        (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            diagnosis,
            meds,
            updatedAt: new Date().toISOString(),
          };
        }
      );

      return result;
    }

    notify?.(
      result?.message ||
        'Gagal memperbarui resep.',
      'warning'
    );

    return (
      result || {
        ok: false,
        message:
          'Gagal memperbarui resep.',
      }
    );

  } catch (error) {
    console.error(
      'Error memperbarui resep:',
      error
    );

    notify?.(
      error?.message ||
        'Terjadi kesalahan saat memperbarui resep.',
      'warning'
    );

    return {
      ok: false,
      message:
        error?.message ||
        'Terjadi kesalahan saat memperbarui resep.',
    };
  }
};



  /*\n   * =================================================
   * HAPUS RESEP
   * =================================================
   */
  /**
   * Menangani aksi delete resep dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleDeletePrescription = async (
    prescription
  ) => {
    if (!prescription) {
      return;
    }

    if (isPrescriptionRedeemed(prescription)) {
      notify?.(
        'Resep yang sudah ditebus tidak dapat dihapus.',
        'warning'
      );

      return;
    }

    if (
      !isEditableWithin24Hours(
        prescription?.createdAt
      )
    ) {
      notify?.(
        'Resep hanya dapat dihapus dalam 24 jam setelah dibuat.',
        'warning'
      );

      return;
    }

    const result =
      await onDeletePrescription?.(
        prescription
      );

    if (result?.ok) {
      notify?.(
        'Resep berhasil dihapus.',
        'success'
      );

      /*
       * Tutup Detail Resep
       */
      setSelected(null);

      /*
       * Tutup juga modal Edit apabila sedang terbuka.
       */
      setEditing(null);
    } else if (!result?.cancelled) {
      notify?.(
        result?.message ||
          'Resep telah melewati batas waktu 24 jam atau telah ditebus.',
        'warning'
      );
    }
  };


  return (
    <div className="workspace-stack doctor-history-page">

      {/* =================================================
          CARD RIWAYAT PASIEN
      ================================================= */}
      <Card>

        <div className="section-head">

          <div>

            <h3>
              Daftar Pasien
            </h3>

            <p>
              Lihat riwayat resep yang dibuat.
            </p>

          </div>

        </div>


        {/* =================================================
            PENCARIAN & FILTER
        ================================================= */}
        <div className="search-row">

          <Field label="Pencarian">

            <TextInput
              value={q}
              onChange={(e) =>
                setQ(
                  e.target.value
                )
              }
              placeholder="Cari nama pasien atau nomor BPJS"
            debounceMs={400}
/>

          </Field>


<DateFilterBar
                className="date-filter-inline"
                controlClassName="control control-compact"
                value={sort}
                customValue="date"
                fallbackValue="new"
                options={[
                  { value: 'az', label: 'A-Z' },
                  { value: 'za', label: 'Z-A' },
                  { value: 'new', label: 'Terbaru' },
                  { value: 'old', label: 'Terlama' },
                  { value: 'date', label: 'Waktu/Tanggal Dibuat' },
                ]}
                onChange={(nextValue) => {
                  setSort(nextValue);
                  if (nextValue !== 'date') setHistoryDateFilter({ start: '', end: '' });
                }}
                customDate={historyDateFilter}
                onCustomDateChange={setHistoryDateFilter}
              />

        </div>


{/* =================================================
    TABEL
================================================= */}
<div className="table-shell">

  <table className="data-table">

    <thead>
      <tr>
        <th>Waktu/Tanggal Dibuat</th>
        <th>No. BPJS/JKN/KIS</th>
        <th>No. Kunjungan</th>
        <th>Nama Pasien</th>
        <th>No. Telp</th>
        <th>Diagnosis</th>
        <th>Obat</th>
        <th style={{ width: '100px' }}>
          Aksi
        </th>
      </tr>
    </thead>


    <tbody>

      {paginatedHistory.length ? (
        paginatedHistory.map((p) => (
          <tr key={p.id}>

            {/* WAKTU/TANGGAL */}
            <td>
              {p.createdAt
                ? formatDateTimeWita(p.createdAt)
                : '-'}
            </td>


            {/* NOMOR BPJS */}
            <td>{p.bpjsNumber || p.patientSnapshot?.bpjsNumber || getPatientBpjs(getPatientForPrescription(data, p)) || '-'}</td>
            <td>{p.visitNumber || '-'}</td>

            {/* NAMA PASIEN */}
            <td>
              {getPatientName(
                getPatientForPrescription(
                  data,
                  p
                )
              ) || '-'}
            </td>


            {/* NO. TELP */}
            <td>
              {getPatientPhone(
                getPatientForPrescription(
                  data,
                  p
                )
              ) || '-'}
            </td>


            {/* DIAGNOSIS */}
            <td>
              {p.diagnosis ||
                '-'}
            </td>


            {/* OBAT */}
            <td>
              {(p.meds || [])
                .map(
                  (m) =>
                    m?.med ||
                    '-'
                )
                .join(', ')}
            </td>


            {/* AKSI */}
            <td
              style={{
                width: '100px',
              }}
            >
              <div className="table-actions">

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(p)
                  }
                >
                  Detail
                </Button>

              </div>
            </td>

          </tr>
        ))
      ) : (
        <tr>
          <td colSpan="8">

            <div className="empty-table">
              {q.trim()
                ? 'Pasien dengan nama atau nomor BPJS tersebut tidak ditemukan.'
                : 'Belum ada riwayat pasien.'}
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
  {historyTotalPages > 1 && (
    <div className="activity-pagination">

      <button
        type="button"
        className="pagination-btn"
        onClick={() =>
          setHistoryPage(
            (page) =>
              Math.max(
                1,
                page - 1
              )
          )
        }
        disabled={
          historyPage === 1
        }
      >
        Sebelumnya
      </button>


      <CompactPagination currentPage={historyPage} totalPages={historyTotalPages} onPageChange={setHistoryPage} />


      <button
        type="button"
        className="pagination-btn"
        onClick={() =>
          setHistoryPage(
            (page) =>
              Math.min(
                historyTotalPages,
                page + 1
              )
          )
        }
        disabled={
          historyPage ===
          historyTotalPages
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
  open={Boolean(selected)}
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
    setSelected(null)
  }
  size="xl"
  zIndex={1000}
>
  {selected ? (
    <div className="account-preview-scroll">
      <div className="account-preview">
        <div className="document-split-layout doctor-prescription-detail-layout">
          <div className="document-info-pane doctor-prescription-info-pane">
            {/* =========================
                INFORMASI RESEP
            ========================= */}
        <div className="preview-grid">
          <div className="preview-item prescription-status-preview-item">
            <span>Status Resep</span>
            <strong className="prescription-status-value">
              <Badge tone={isPrescriptionRedeemed(selected) ? 'success' : 'warning'}>
                {isPrescriptionRedeemed(selected) ? 'Ditebus' : 'Menunggu'}
              </Badge>
            </strong>
          </div>
          <div className="preview-item"><span>ID Resep</span><strong>{selected.id || selected.legacyId || selected._id || '-'}</strong></div>
          <div className="preview-item"><span>Waktu/Tanggal Dibuat</span><strong>{selected.createdAt ? formatDateTimeWita(selected.createdAt) : '-'}</strong></div>
          <div className="preview-item"><span>Dokter Pembuat Resep</span><strong>{selected.createdBy || '-'}</strong></div>
        </div>

        <div className="prescription-redemption-info-box">
          <div className="preview-grid prescription-redemption-info-grid">
            <div className="preview-item">
              <span>ID Transaksi</span>
              <strong>{isPrescriptionRedeemed(selected) ? (selected.transactionId || (selected.transactionIds || []).join(', ') || '-') : '-'}</strong>
            </div>
            <div className="preview-item">
              <span>Waktu/Tanggal Ditebus</span>
              <strong>{isPrescriptionRedeemed(selected) ? getPickedDate(selected) : '-'}</strong>
            </div>
            <div className="preview-item">
              <span>Jadwal Penebusan Berikutnya</span>
              <strong>{isPrescriptionRedeemed(selected) ? getNextPickupDate(selected) : '-'}</strong>
            </div>
          </div>
        </div>
        {selected.updatedAt && new Date(selected.updatedAt).getTime() > new Date(selected.createdAt || 0).getTime() + 1000 ? (
          <p className="prescription-last-updated">Terakhir diubah: {formatDateTimeWita(selected.updatedAt)}</p>
        ) : null}


        {/* =========================
            ACTION RESEP
        ========================= */}
          </div>

          <div className="document-viewer-pane doctor-prescription-document-pane">
            <div className="preview-document-head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <span>Buku Kronis Pasien</span>
                <strong className="account-edit-document-name">
                  {selectedChronicBook?.fileName || selectedChronicBook?.name || 'Dokumen Buku Kronis'}
                </strong>
              </div>
              {bookDocumentUrl ? (
                <a
                  href={bookDocumentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="preview-pdf-button"
                >
Buka PDF
                </a>
              ) : null}
            </div>

            <div className="document-preview document-preview-large">
              {isLoadingBookDocument ? (
                <div className="document-empty">Membuka dokumen Buku Kronis...</div>
              ) : bookDocumentUrl ? (
                <iframe src={getPdfPreviewUrl(bookDocumentUrl)} title="Preview Buku Kronis Pasien" />
              ) : (
                <div className="document-empty">
                  {bookDocumentError || 'Preview Buku Kronis tidak tersedia.'}
                </div>
              )}
            </div>
          </div>
        </div>

        <PrescriptionClinicalDetails prescription={selected} />
        <div className="preview-section doctor-prescription-table-section">
        {/* =========================
            TABEL OBAT
        ========================= */}
        <div className="preview-section">

          <div
            className="table-shell doctor-history-summary-table-shell"
            style={{
              width: '100%',
              maxWidth: '100%',
              overflowX: 'auto',
              boxSizing: 'border-box',
            }}
          >

            <table
              className="data-table doctor-history-summary-table"
              style={{
                width: 'max-content',
                maxWidth: 'none',
                minWidth: 820,
                tableLayout: 'auto',
              }}
            >

              <thead>
                <tr>

                  {/* OBAT */}
                  <th
                    style={{
                      width: '20%',
                    }}
                  >
                    Obat
                  </th>


                  {/* JUMLAH */}
                  <th
                    style={{
                      width: '10%',
                    }}
                  >
                    Jumlah
                  </th>


                  {/* SATUAN */}
                  <th
                    style={{
                      width: '12%',
                    }}
                  >
                    Satuan
                  </th>


                  {/* ATURAN PAKAI */}
                  <th
                    style={{
                      width: '28%',
                    }}
                  >
                    Aturan Pakai
                  </th>


                  {/* CATATAN */}
                  <th
                    style={{
                      width: '30%',
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

                        {/* OBAT */}
                        <td
                          style={{
                            overflowWrap:
                              'anywhere',
                            wordBreak:
                              'break-word',
                          }}
                        >
                          {med?.med ||
                            '-'}
                        </td>


                        {/* JUMLAH */}
                        <td>
                          {med?.q ??
                            med?.qty ??
                            '-'}
                        </td>


                        {/* SATUAN */}
                        <td>
                          {capitalizeFirstLetter(
                            med?.u ||
                              med?.unit ||
                              ''
                          ) || '-'}
                        </td>


                        {/* ATURAN PAKAI */}
                        <td
                          style={{
                            overflowWrap:
                              'anywhere',
                            wordBreak:
                              'break-word',
                          }}
                        >
                          {getPrescriptionDoseInstruction(
                            med
                          )}
                        </td>


                        {/* CATATAN */}
                        <td
                          style={{
                            overflowWrap:
                              'anywhere',
                            wordBreak:
                              'break-word',
                          }}
                        >
                          {getPrescriptionNotes(
                            med
                          )}
                        </td>

                      </tr>
                    )
                  )}


                {!(
                  Array.isArray(
                    selected.meds
                  ) &&
                  selected.meds.some(
                    (med) =>
                      String(
                        med?.med || ''
                      ).trim() &&
                      Number(
                        med?.q ??
                        med?.qty ??
                        0
                      ) > 0
                  )
                ) && (
                  <tr>
                    <td colSpan="5">
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

        <div className="preview-actions document-modal-footer-actions">
          {selected.createdBy === currentUser && !isPrescriptionRedeemed(selected) &&
            isEditableWithin24Hours(selected.createdAt) && (
              <Button
                type="button"
                variant="danger"
                onClick={() => handleDeletePrescription(selected)}
              >
                <Trash2 size={16} />
                Hapus Resep
              </Button>
            )}
          {selected.createdBy === currentUser && isEditableWithin24Hours(selected.createdAt) && !isPrescriptionRedeemed(selected) ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => openEdit(selected)}
            >
              <PencilLine size={16} />
              Ubah Resep
            </Button>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  ) : null}
</Modal>

      {/* =================================================
          MODAL UBAH RESEP
          
          PENTING:
          Modal Detail Resep TIDAK ditutup ketika modal
          ini dibuka.

          Karena:
            selected !== null
            editing !== null

          maka kedua Modal aktif secara bersamaan.

          Modal Ubah Resep dirender setelah Modal Detail
          sehingga berada di atasnya mengikuti mekanisme
          stacking/z-index Modal yang digunakan aplikasi.
      ================================================= */}
      <PrescriptionEditModal
        open={Boolean(editing)}
        prescription={
          editing
        }
        stockMap={stockMap}
        doseOptions={data?.doseOptions}
        doseOptionUnits={data?.doseOptionUnits}
        doseOptionRoutes={data?.doseOptionRoutes}
        onAddDoseOption={onAddDoseOption}
        onRemoveDoseOption={onRemoveDoseOption}
        onClose={() =>
          setEditing(
            null
          )
        }
        onSave={
          handleSaveEdit
        }
        notify={
          notify
        }
      />


    </div>
  );
}
