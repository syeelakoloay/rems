/**
 * Mengelola resep masuk di sisi Apoteker, termasuk verifikasi, penyiapan, dan proses penebusan.
 */
import { useMemo, useState, useEffect } from 'react';

import { FileCheck, Check, Printer } from 'lucide-react';

import { Card } from '../ui/Card';
import { CompactPagination } from '../ui/CompactPagination';
import { usePaginatedItems } from '../ui/usePaginatedItems';
import { TablePagination } from '../ui/TablePagination';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

import { Field, TextInput } from '../ui/Field';

import { Modal } from '../ui/Modal';
import { MedicationLabelModal } from './MedicationLabelModal';
import { ChronicBookDetailModal } from '../chronic/ChronicBookDetailModal';
import {
  getPatientForPrescription,
  getPatientName,
  getPatientPhone,
  getPatientBpjs,
} from '../../lib/patients';
import { api } from '../../lib/api';
import {
  matchesDateFilter,
  formatDate as formatCalendarDate,
  formatDateTime as formatDateTimeWita,
} from '../../lib/date';
import { DateFilterBar } from '../prescription/DateFilterBar';
import { getPdfPreviewUrl } from '../../lib/pdfPreview';
import { PrescriptionClinicalDetails } from '../prescription/PrescriptionClinicalDetails';
import { capitalizeFirstLetter } from '../../lib/text';
import { formatPrescriptionRedemptionTime as getPickedDate } from '../../lib/prescriptions';


/**
 * Menentukan status tampilan resep dengan mempertimbangkan status tersimpan dan penanda waktu penebusan pada data historis.
 */
const getEffectivePrescriptionStatus = (prescription) =>
  prescription?.status === 'picked' ? 'picked' : 'pending';

/**
 * Mengambil nomor BPJS dari resep atau snapshot pasien, kemudian menormalisasinya untuk pencarian.
 */
const getPrescriptionBpjs = (prescription, data) =>
  getPatientBpjs(
    getPatientForPrescription(data, prescription)
  );

/**
 * Mencari Buku Kronis yang cocok dengan identitas pasien pada resep agar Apoteker dapat memeriksa dokumen pendukung.
 */
const getChronicBookForPrescription = (data, prescription) => {
  if (!prescription) return null;
  const patientId = String(prescription.patientId || '').trim();
  const bpjs = getPrescriptionBpjs(prescription, data);
  const entry = Object.entries(data?.chronicBooks || {}).find(([, book]) => {
    const bookPatientId = String(book?.patientId || '').trim();
    const bookBpjs = String(book?.bpjsNumber || book?.bpjs || book?.nomorBpjs || book?.nomorBPJS || '')
      .replace(/\D/g, '');
    return (patientId && bookPatientId === patientId) || (bpjs && bookBpjs === bpjs);
  });
  return entry ? { id: entry[0], ...(entry[1] || {}) } : null;
};

/**
 * Mengambil aturan pakai tersimpan atau menyusun teks dari dosis, frekuensi, waktu konsumsi, dan durasi bila field utama kosong.
 */
const getMedicationInstruction = (med) => {
  if (!med) {
    return '-';
  }

  const directInstruction =
    med?.doseInstruction ||
    med?.instruction ||
    med?.instructions ||
    med?.aturanPakai ||
    med?.usage ||
    med?.signa ||
    med?.rule ||
    med?.directions;

  if (directInstruction) {
    return String(directInstruction).trim() || '-';
  }

  const frequency =
    med?.frequency ??
    med?.freq ??
    med?.frekuensi;

  const dose =
    med?.dose ??
    med?.dosis;

  const duration =
    med?.duration ??
    med?.dn;

  const durationUnit =
    med?.durationUnit ??
    med?.du;

  const parts = [];

  if (frequency) {
    parts.push(String(frequency));
  }

  if (dose) {
    parts.push(String(dose));
  }

  if (duration) {
    parts.push(
      `${duration}${durationUnit ? ` ${durationUnit}` : ''}`
    );
  }

  return parts.length
    ? parts.join(' ')
    : '-';
};

/**
 * Mengambil catatan tambahan obat dari field sekarang atau alias historis pada item resep.
 */
const getMedicationNotes = (med) => {
  if (!med) {
    return '-';
  }

  const value =
    med?.notes ??
    med?.note ??
    med?.catatan ??
    med?.catatanTambahan ??
    med?.keterangan ??
    '';

  return String(value).trim() || '-';
};


/*
 * =====================================================
 * TANGGAL PENEBUSAN BERIKUTNYA
 * =====================================================
 *
 * 30 hari setelah tanggal/waktu penebusan.
 */

/**
 * Menghitung perkiraan tanggal pengambilan berikutnya dari tanggal penebusan sesuai interval Buku Kronis.
 */
const getNextRedemptionDate = (
  prescription,
  fallbackDate = null
) => {
  const pickedAt =
    prescription?.pickedAt ||
    prescription?.redeemedAt ||
    prescription?.dispensedAt ||
    prescription?.verifiedAt;

  const baseDate =
    pickedAt
      ? new Date(pickedAt)
      : fallbackDate
        ? new Date(fallbackDate)
        : null;

  if (
    !baseDate ||
    Number.isNaN(
      baseDate.getTime()
    )
  ) {
    return null;
  }

  /*
   * 30 hari setelah tanggal penebusan.
   */
  const nextDate =
    new Date(baseDate);

  nextDate.setDate(
    nextDate.getDate() + 30
  );

  return formatCalendarDate(nextDate);
};

/*
 * =====================================================
 * COMPONENT
 * =====================================================
 */

/**
 * Merender komponen incoming resep dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function IncomingPrescriptions({
  data,
  onPickPrescription,
  notify,
}) {
  const [
    q,
    setQ,
  ] = useState('');

  const [
    sort,
    setSort,
  ] = useState('new');

  const [incomingDateFilter, setIncomingDateFilter] = useState({ start: '', end: '' });


  const INCOMING_PAGE_SIZE = 10;

  const [
    incomingPage,
    setIncomingPage,
  ] = useState(1);


  /*
   * Modal Detail Resep
   */
  const [
    previewPrescription,
    setPreviewPrescription,
  ] = useState(null);


  /*
   * Modal Etiket
   */
  const [
    labelPrescription,
    setLabelPrescription,
  ] = useState(null);


  const [
    historyBook,
    setHistoryBook,
  ] = useState(null);


  /*
   * Modal Jadwal Penebusan
   */
  const [
    showRedemptionNotice,
    setShowRedemptionNotice,
  ] = useState(false);


  /*
   * Resep yang baru saja ditebus.
   */
const [
  redemptionPrescription,
  setRedemptionPrescription,
] = useState(null);

const [
  redemptionDate,
  setRedemptionDate,
] = useState(null);

  const previewChronicBook = useMemo(
    () => (previewPrescription ? getChronicBookForPrescription(data, previewPrescription) : null),
    [data?.chronicBooks, data?.patients, previewPrescription]
  );
  const previewMedicationRows = useMemo(
    () => (Array.isArray(previewPrescription?.meds) ? previewPrescription.meds : []).filter((med) => String(med?.med || '').trim() && Number(med?.q ?? med?.qty ?? 0) > 0),
    [previewPrescription?.meds]
  );
  const { currentPage: previewMedicationPage, setCurrentPage: setPreviewMedicationPage, totalPages: previewMedicationTotalPages, paginatedItems: paginatedPreviewMedicationRows } = usePaginatedItems(previewMedicationRows);
  const [previewChronicBookUrl, setPreviewChronicBookUrl] = useState('');
  const [isLoadingChronicBookPreview, setIsLoadingChronicBookPreview] = useState(false);
  const [chronicBookPreviewError, setChronicBookPreviewError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

        /**
     * Memuat pratinjau Buku Kronis yang terkait dengan resep masuk dan memperbarui status loading ketika permintaan selesai.
     */
    const loadChronicBookPreview = async () => {
      setPreviewChronicBookUrl('');
      setChronicBookPreviewError('');

      if (!previewPrescription) {
        setIsLoadingChronicBookPreview(false);
        return;
      }

      if (!previewChronicBook) {
        setIsLoadingChronicBookPreview(false);
        setChronicBookPreviewError('Buku Kronis pasien belum tersedia.');
        return;
      }

      const directUrl = previewChronicBook.fileData || previewChronicBook.fileUrl ||
        previewChronicBook.url || previewChronicBook.dataUrl || '';
      const fileIdFromUrl = String(directUrl || '').match(/\/files\/([^/?#]+)/)?.[1];
      const fileId = previewChronicBook.fileId || fileIdFromUrl;

      setIsLoadingChronicBookPreview(true);
      try {
        objectUrl = fileId
          ? await api.files.createObjectUrl(fileId)
          : directUrl;

        if (cancelled) {
          if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
          return;
        }

        setPreviewChronicBookUrl(objectUrl || '');
        if (!objectUrl) setChronicBookPreviewError('File PDF Buku Kronis tidak tersedia.');
      } catch (error) {
        if (!cancelled) {
          setPreviewChronicBookUrl('');
          setChronicBookPreviewError(error?.message || 'Dokumen Buku Kronis tidak dapat dibuka.');
        }
      } finally {
        if (!cancelled) setIsLoadingChronicBookPreview(false);
      }
    };

    loadChronicBookPreview();
    return () => {
      cancelled = true;
      if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    };
  }, [previewPrescription, previewChronicBook]);




  /*
   * =====================================================
   * DATA RESEP
   * =====================================================
   */

  const rows = useMemo(
    () => {
      const keyword =
        q
          .trim()
          .toLowerCase();

      const list =
        (
          data?.prescriptions ||
          []
        )
          .filter(
            (p) =>
              getEffectivePrescriptionStatus(p) !== 'picked'
          )
          .filter((p) => sort !== 'date' || matchesDateFilter(p.createdAt, 'custom', incomingDateFilter))
          .filter(
            (p) => {
              const patient =
                getPatientForPrescription(
                  data,
                  p
                );

              const patientName =
                getPatientName(patient)
                  .toLowerCase();

              const patientBpjs =
                getPatientBpjs(patient);

              const normalizedBpjsQuery = /^[\d\s-]+$/.test(keyword)
                ? keyword.replace(/\D/g, '')
                : '';

              return (
                !keyword ||
                patientName.includes(keyword) ||
                (normalizedBpjsQuery && patientBpjs.includes(normalizedBpjsQuery))
              );
            }
          );

      return [
        ...list,
      ].sort(
        (a, b) => {
          const nameA =
            getPatientName(
              getPatientForPrescription(
                data,
                a
              )
            );

          const nameB =
            getPatientName(
              getPatientForPrescription(
                data,
                b
              )
            );

          const dateA =
            new Date(
              a.createdAt ||
                0
            ).getTime();

          const dateB =
            new Date(
              b.createdAt ||
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

            case 'old':
              return (
                dateA -
                dateB
              );

            case 'new':
            default:
              return (
                dateB -
                dateA
              );
          }
        }
      );
    },
    [
      data?.prescriptions,
      q,
      sort,
      incomingDateFilter,
    ]
  );


  /*
   * =====================================================
   * BUKA PREVIEW VERIFIKASI
   * =====================================================
   */

  /**
   * Menetapkan resep yang dipilih sebagai konteks verifikasi dan membuka pratinjau dokumen pendukung.
   */
  const openVerifyPreview = (
    prescription
  ) => {
    if (!prescription) {
      notify?.(
        'Data resep tidak dapat ditampilkan.',
        'warning'
      );
      return;
    }

    setPreviewPrescription(
      prescription
    );
  };


  /*
   * =====================================================
   * TUTUP PREVIEW
   * =====================================================
   */

  /**
   * Menutup tampilan verify pratinjau dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
   */
  const closeVerifyPreview = () => {
    setPreviewPrescription(
      null
    );
  };


  /*
   * =====================================================
   * ETIKET OBAT
   * =====================================================
   */

  /**
   * Menetapkan resep sebagai sumber isi label obat, lalu membuka pratinjau sebelum dicetak atau diunduh.
   */
  const openLabelPreview = (prescription) => {
    if (prescription?.status !== 'picked') {
      return;
    }
    setLabelPrescription(prescription);
  };

  /**
   * Menutup tampilan label pratinjau dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
   */
  const closeLabelPreview = () => {
    setLabelPrescription(null);
  };


  /*
   * =====================================================
   * TUTUP MODAL JADWAL
   * =====================================================
   */

/**
 * Menutup tampilan redemption notice dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
 */
const closeRedemptionNotice = () => {
  setShowRedemptionNotice(false);
  setRedemptionPrescription(null);
  setRedemptionDate(null);
};

  /*
   * =====================================================
   * KONFIRMASI VERIFIKASI
   * =====================================================
   */

/**
 * Menjalankan tindakan verification setelah keputusan atau konfirmasi yang diperlukan diterima.
 */
const confirmVerification = async () => {
  if (!previewPrescription) {
    return;
  }

  const currentStatus =
    getEffectivePrescriptionStatus(previewPrescription);

  /*
   * Hanya resep pending yang dapat ditebus.
   */
  if (currentStatus !== 'pending') {
    notify?.(
      'Resep sudah ditebus atau tidak dapat diproses.',
      'warning'
    );

    return;
  }

  /*
   * PENTING:
   * Kirim resep ASLI ke parent.
   * Jangan mengubah status menjadi "picked"
   * sebelum onPickPrescription memprosesnya.
   */
  const result = await onPickPrescription?.(
    previewPrescription
  );

  /*
   * Hanya jika proses penebusan benar-benar
   * berhasil, tampilkan jadwal penebusan.
   */
  if (result?.ok) {
    const pickedAt =
      new Date().toISOString();

    /*
     * Buat data khusus untuk modal jadwal.
     * Ini TIDAK mengubah data resep utama.
     */
    const redeemedPrescription = {
      ...previewPrescription,

      status:
        'picked',

      pickedAt,

      redeemedAt:
        pickedAt,
    };

    setRedemptionPrescription(
      redeemedPrescription
    );

    setRedemptionDate(
      new Date(pickedAt)
    );

    /*
     * Tutup Detail Resep.
     */
    setPreviewPrescription(
      null
    );

    /*
     * Tampilkan notifikasi setelah
     * penebusan benar-benar berhasil.
     */
    notify?.(
      'Resep diverifikasi dan ditebus.',
      'success'
    );

    /*
     * Buka modal jadwal penebusan.
     */
    setShowRedemptionNotice(
      true
    );

    return;
  }

  /*
   * Jika parent gagal memproses resep,
   * jangan tampilkan sebagai sudah ditebus.
   */
  notify?.(
    result?.message ||
      'Gagal memverifikasi resep.',
    'warning'
  );
};



  const incomingTotalPages = Math.max(
    1,
    Math.ceil(rows.length / INCOMING_PAGE_SIZE)
  );

  const paginatedRows = useMemo(
    () =>
      rows.slice(
        (incomingPage - 1) * INCOMING_PAGE_SIZE,
        incomingPage * INCOMING_PAGE_SIZE
      ),
    [rows, incomingPage]
  );

  useEffect(() => {
    setIncomingPage(1);
  }, [q, sort, incomingDateFilter]);

  useEffect(() => {
    setIncomingPage((page) =>
      Math.min(page, incomingTotalPages)
    );
  }, [incomingTotalPages]);

  /*
   * =====================================================
   * RENDER
   * =====================================================
   */

  return (
    <div className="workspace-stack">

      {/* =================================================
          RESEP OBAT
      ================================================= */}
      <Card>

        <div className="section-head">

          <div>

            <h3>
              Daftar Resep
            </h3>

            <p>
              Verifikasi resep sebelum ditebus.
            </p>

          </div>

        </div>


        {/* PENCARIAN + FILTER */}
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
              if (nextValue !== 'date') setIncomingDateFilter({ start: '', end: '' });
            }}
            customDate={incomingDateFilter}
            onCustomDateChange={setIncomingDateFilter}
          />

        </div>


        {/* TABEL */}
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

                <th>
                  Status
                </th>

                <th>
                  Aksi
                </th>

              </tr>

            </thead>


            <tbody>

              {paginatedRows.length ? (
                paginatedRows.map(
                  (p) => (
                    <tr
                      key={p.id}
                    >

                      <td>
                        {p.createdAt
                          ? formatDateTimeWita(p.createdAt)
                          : '-'}
                      </td>


                      <td>
                        {p.bpjsNumber || p.patientSnapshot?.bpjsNumber || getPrescriptionBpjs(p, data) || '-'}
                      </td>

                      <td>{p.visitNumber || '-'}</td>

                      <td>
                        {getPatientName(
                          getPatientForPrescription(
                            data,
                            p
                          )
                        ) || '-'}
                      </td>


                      <td>
                        {getPatientPhone(
                          getPatientForPrescription(
                            data,
                            p
                          )
                        ) || '-'}
                      </td>


                      <td>
                        {p.diagnosis ||
                          '-'}
                      </td>


                      <td>
                        {(
                          Array.isArray(
                            p.meds
                          )
                            ? p.meds
                            : []
                        )
                          .map(
                            (m) =>
                              m?.med ||
                              '-'
                          )
                          .join(
                            ', '
                          )}
                      </td>


                      <td>

                        <Badge
                          tone={
                            getEffectivePrescriptionStatus(p) ===
                            'picked'
                              ? 'success'
                              : 'warning'
                          }
                        >

                          {getEffectivePrescriptionStatus(p) ===
                          'picked'
                            ? 'Ditebus'
                            : 'Menunggu'}

                        </Badge>

                      </td>


                      <td className="action-cell">

                        <div className="action-group">

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              openVerifyPreview(
                                p
                              )
                            }
                          >
                            Detail
                          </Button>

                        </div>

                      </td>

                    </tr>
                  )
                )
              ) : (
                <tr>

                  <td colSpan="9">

                    <div className="empty-table">
                      {q.trim()
                        ? 'Resep dengan nama pasien atau nomor BPJS tersebut tidak ditemukan.'
                        : 'Belum ada resep masuk.'}
                    </div>

                  </td>

                </tr>
              )}

            </tbody>

          </table>

        </div>

        {incomingTotalPages > 1 && (
          <div className="activity-pagination">
            <button
              type="button"
              className="pagination-btn"
              onClick={() =>
                setIncomingPage((page) => Math.max(1, page - 1))
              }
              disabled={incomingPage === 1}
            >
              Sebelumnya
            </button>

            <CompactPagination currentPage={incomingPage} totalPages={incomingTotalPages} onPageChange={setIncomingPage} />

            <button
              type="button"
              className="pagination-btn"
              onClick={() =>
                setIncomingPage((page) =>
                  Math.min(incomingTotalPages, page + 1)
                )
              }
              disabled={incomingPage === incomingTotalPages}
            >
              Berikutnya
            </button>
          </div>
        )}

      </Card>


      {/* =================================================
          MODAL RINGKASAN RESEP
      ================================================= */}
      <Modal
        open={
          Boolean(
            previewPrescription
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
                Periksa data resep sebelum melakukan verifikasi.
              </p>

            </div>

          </div>
        }
        onClose={
          closeVerifyPreview
        }
        size="xl"
      >

        {previewPrescription ? (

          <div className="account-preview-scroll">

            <div className="account-preview">

              {previewPrescription.fktpCheck?.status === 'not_confirmed' ? (
                <div className="prescription-fktp-pharmacy-note">
                  <strong>Konfirmasi FKTP belum dicatat</strong>
                  <p>Dokter FKTP belum mencatat konfirmasi pemeriksaan informasi FKTP melalui Mobile JKN pada saat membuat resep. REMS tidak dapat memverifikasi status FKTP secara langsung. Informasi ini merupakan penanda administratif dan tidak otomatis menentukan kelayakan klinis resep.</p>
                </div>
              ) : null}
              {previewPrescription.fktpCheck?.status === 'manually_confirmed' ? (
                <div className="prescription-fktp-pharmacy-note">
                  <strong>Konfirmasi FKTP manual telah dicatat</strong>
                  <p>Dokter menyatakan telah memeriksa informasi FKTP pada Mobile JKN. Konfirmasi ini dicatat oleh REMS, tetapi bukan hasil verifikasi otomatis dari BPJS Kesehatan.</p>
                </div>
              ) : null}
              <div className="document-split-layout prescription-summary-layout">
                <div className="document-info-pane prescription-summary-info-pane">

              {/* INFORMASI RESEP */}
              <div className="preview-grid">
                <div className="preview-item prescription-status-preview-item">
                  <span>Status Resep</span>
                  <strong className="prescription-status-value">
                    <Badge tone={getEffectivePrescriptionStatus(previewPrescription) === 'picked' ? 'success' : 'warning'}>
                      {getEffectivePrescriptionStatus(previewPrescription) === 'picked' ? 'Ditebus' : 'Menunggu'}
                    </Badge>
                  </strong>
                </div>
                <div className="preview-item"><span>ID Resep</span><strong>{previewPrescription.id || previewPrescription.legacyId || previewPrescription._id || '-'}</strong></div>
                <div className="preview-item"><span>Waktu/Tanggal Dibuat</span><strong>{previewPrescription.createdAt ? formatDateTimeWita(previewPrescription.createdAt) : '-'}</strong></div>
                <div className="preview-item"><span>Dokter Pembuat Resep</span><strong>{previewPrescription.createdBy || '-'}</strong></div>
              </div>

        <div className="prescription-redemption-info-box">
                <div className="preview-grid prescription-redemption-info-grid">
                  <div className="preview-item">
                    <span>ID Transaksi</span>
                    <strong>{getEffectivePrescriptionStatus(previewPrescription) === 'picked' ? (previewPrescription.transactionId || (previewPrescription.transactionIds || []).join(', ') || '-') : '-'}</strong>
                  </div>
                  <div className="preview-item">
                    <span>Waktu/Tanggal Ditebus</span>
                    <strong>{getEffectivePrescriptionStatus(previewPrescription) === 'picked' ? getPickedDate(previewPrescription) : '-'}</strong>
                  </div>
                  <div className="preview-item">
                    <span>Jadwal Penebusan Berikutnya</span>
                    <strong>{getEffectivePrescriptionStatus(previewPrescription) === 'picked' ? (getNextRedemptionDate(previewPrescription) || '-') : '-'}</strong>
                  </div>
                </div>
              </div>

                </div>

                <div className="document-viewer-pane prescription-summary-document-pane">
                  <div className="preview-document-head">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span>BUKU KRONIS PASIEN</span>
                      <strong>{previewChronicBook?.fileName || 'Dokumen Buku Kronis'}</strong>
                    </div>
                    {previewChronicBookUrl ? (
                      <button type="button" className="preview-pdf-button" onClick={() => window.open(previewChronicBookUrl, '_blank', 'noopener,noreferrer')}>
Buka PDF
                      </button>
                    ) : null}
                  </div>
                  <div className="document-preview document-preview-large">
                    {isLoadingChronicBookPreview ? (
              <div className="document-empty">Membuka dokumen Buku Kronis...</div>
            ) : previewChronicBookUrl ? (
              <iframe src={getPdfPreviewUrl(previewChronicBookUrl)} title="Preview Buku Kronis Pasien" />
            ) : (
              <div className="document-empty">{chronicBookPreviewError || 'Buku Kronis pasien belum tersedia.'}</div>
            )}
                  </div>
                </div>
              </div>

              <PrescriptionClinicalDetails prescription={previewPrescription} />
              {/* TABEL OBAT */}
              <div className="preview-section">

                <div
                  className="table-shell pharmacy-incoming-summary-table-shell"
                  style={{
                    width:
                      '100%',
                    overflowX:
                      'auto',
                  }}
                >

                  <table
                    className="data-table"
                    style={{
                      width:
                        'max-content',
                      minWidth:
                        820,
                      tableLayout:
                        'auto',
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

                      {paginatedPreviewMedicationRows.map(
                          (
                            med,
                            index
                          ) => (

                            <tr
                              key={
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
                                {med.med ||
                                  '-'}
                              </td>

                              <td>
                                {med.q ??
                                  med.qty ??
                                  '-'}
                              </td>

                              <td>
                                {capitalizeFirstLetter(
                                  med.u ||
                                    med.unit ||
                                    ''
                                ) ||
                                  '-'}
                              </td>

                              <td
                                style={{
                                  overflowWrap:
                                    'anywhere',
                                  wordBreak:
                                    'break-word',
                                }}
                              >
                                {getMedicationInstruction(
                                  med
                                )}
                              </td>

                              <td
                                style={{
                                  overflowWrap:
                                    'anywhere',
                                  wordBreak:
                                    'break-word',
                                }}
                              >
                                {getMedicationNotes(
                                  med
                                )}
                              </td>

                            </tr>

                          )
                        )}

                    </tbody>

                  </table>

                </div>
                <TablePagination currentPage={previewMedicationPage} totalPages={previewMedicationTotalPages} onPageChange={setPreviewMedicationPage} />

              </div>

              <div className="preview-actions document-modal-footer-actions">
                <Button
                  type="button"
                  onClick={confirmVerification}
                  disabled={getEffectivePrescriptionStatus(previewPrescription) !== 'pending'}
                >
                  <FileCheck size={15} />
                  Verifikasi
                </Button>
              </div>
            </div>

          </div>

        ) : null}

      </Modal>


{/* =================================================
    MODAL JADWAL PENEBUSAN
================================================= */}
<Modal
  open={showRedemptionNotice}
  title={
    <div className="section-head medication-modal-head">

      <div>

        <h3>
          Jadwal Penebusan
        </h3>

        <p>
          Ingatkan pasien tentang jadwal penebusan obat berikutnya.
        </p>

      </div>

    </div>
  }
  onClose={closeRedemptionNotice}
  size="md"
>
  <div className="stack">

    <div className="preview-section">

      <div className="preview-item">

        <span>
          Informasi Penebusan
        </span>

        <strong>
          {(() => {

            const nextDate =
              getNextRedemptionDate(
                redemptionPrescription,
                redemptionDate
              );

            return nextDate
              ? `Penebusan obat berikutnya dapat dilakukan pada ${nextDate}.`
              : 'Tanggal penebusan berikutnya tidak tersedia.';

          })()}
        </strong>

      </div>

    </div>


    <div className="preview-actions">

      <Button
        type="button"
        variant="ghost"
        onClick={() =>
          openLabelPreview(
            redemptionPrescription
          )
        }
        disabled={
          redemptionPrescription?.status !== 'picked'
        }
      >
        <Printer size={16} aria-hidden="true" />
        Cetak Etiket
      </Button>

      <Button
        type="button"
        onClick={
          closeRedemptionNotice
        }
      >
        <Check
          size={15}
        />

        Selesai
      </Button>

    </div>

  </div>
</Modal>

      <MedicationLabelModal
        prescription={labelPrescription}
        patient={getPatientForPrescription(data, labelPrescription)}
        open={Boolean(labelPrescription)}
        onClose={closeLabelPreview}
        notify={notify}
      />

      <ChronicBookDetailModal
        open={Boolean(historyBook)}
        selected={historyBook}
        role="pharmacy"
        data={data}
        onClose={() => setHistoryBook(null)}
        notify={notify}
      />

    </div>
  );
}
