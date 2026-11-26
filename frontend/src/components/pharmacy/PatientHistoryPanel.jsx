/**
 * Menampilkan riwayat pasien dan informasi resep yang dibutuhkan pada alur pelayanan.
 */
import { useEffect, useMemo, useState } from 'react';

import { FileCheck } from 'lucide-react';

import { Card } from '../ui/Card';
import { CompactPagination } from '../ui/CompactPagination';
import { usePaginatedItems } from '../ui/usePaginatedItems';
import { TablePagination } from '../ui/TablePagination';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

import { Field, TextInput } from '../ui/Field';

import { Modal } from '../ui/Modal';
import { ChronicBookDetailModal } from '../chronic/ChronicBookDetailModal';
import { MedicationLabelModal } from './MedicationLabelModal';
import {
  getPatientForPrescription,
  getPatientName,
  getPatientPhone,
  getPatientBpjs,
} from '../../lib/patients';
import { api } from '../../lib/api';
import {
  matchesDateFilter,
  formatDateTime as formatDateTimeWita,
} from '../../lib/date';
import { DateFilterBar } from '../prescription/DateFilterBar';
import { getPdfPreviewUrl } from '../../lib/pdfPreview';
import { PrescriptionClinicalDetails } from '../prescription/PrescriptionClinicalDetails';
import { capitalizeFirstLetter } from '../../lib/text';
import { getNextPickupDate, formatPrescriptionRedemptionTime as getPickedDate } from '../../lib/prescriptions';

/**
 * Mengambil aturan pakai dari item resep dengan dukungan alias field agar resep lama tetap dapat ditampilkan.
 */
const getMedicationInstruction = (med) => {
  if (!med) return '-';

  // Format aturan pakai yang sudah tersimpan
  if (med.instruction) {
    return String(med.instruction).trim() || '-';
  }

  if (med.instructions) {
    return String(med.instructions).trim() || '-';
  }

  if (med.aturanPakai) {
    return String(med.aturanPakai).trim() || '-';
  }

  // Format berdasarkan field terpisah
  const frequency =
    med.frequency ??
    med.freq ??
    med.frekuensi;

  const dose =
    med.dose ??
    med.dosis;

  const duration =
    med.duration ??
    med.dn;

  const durationUnit =
    med.durationUnit ??
    med.du;

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
 * Mengambil catatan tambahan obat dari field sekarang atau nama field historis yang masih digunakan.
 */
const getMedicationNotes = (med) => {
  if (!med) return '-';

  const value =
    med.notes ??
    med.note ??
    med.catatan ??
    med.keterangan ??
    '';

  return String(value).trim() || '-';
};

/**
 * Mencari Buku Kronis yang berhubungan dengan pasien pada resep untuk menampilkan dokumen pendukung riwayat.
 */
const getChronicBookForPrescription = (data, prescription) => {
  if (!prescription) return null;
  const patientId = String(prescription.patientId || '').trim();
  const bpjs = getPatientBpjs(getPatientForPrescription(data, prescription));
  const entry = Object.entries(data?.chronicBooks || {}).find(([, book]) => {
    const bookPatientId = String(book?.patientId || '').trim();
    const bookBpjs = String(book?.bpjsNumber || book?.bpjs || book?.nomorBpjs || book?.nomorBPJS || book?.noBpjs || '').replace(/\D/g, '');
    return (patientId && bookPatientId === patientId) || (bpjs && bookBpjs === bpjs);
  });
  return entry ? { id: entry[0], ...(entry[1] || {}) } : null;
};

/**
 * Merender komponen pasien riwayat panel dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function PatientHistoryPanel({
  data,
  stockMap,
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

  const [historyDateFilter, setHistoryDateFilter] = useState({ start: '', end: '' });

  const [
    previewPrescription,
    setPreviewPrescription,
  ] = useState(null);

  const previewMedicationRows = useMemo(
    () => (Array.isArray(previewPrescription?.meds) ? previewPrescription.meds : []).filter((med) => String(med?.med || '').trim() && Number(med?.q ?? med?.qty ?? 0) > 0),
    [previewPrescription?.meds]
  );
  const { currentPage: previewMedicationPage, setCurrentPage: setPreviewMedicationPage, totalPages: previewMedicationTotalPages, paginatedItems: paginatedPreviewMedicationRows } = usePaginatedItems(previewMedicationRows);

  const [
    historyBook,
    setHistoryBook,
  ] = useState(null);

  const [
    labelPrescription,
    setLabelPrescription,
  ] = useState(null);

  const PATIENT_HISTORY_PAGE_SIZE = 10;

  const [
    patientHistoryPage,
    setPatientHistoryPage,
  ] = useState(1);

  const previewChronicBook = useMemo(
    () => (previewPrescription ? getChronicBookForPrescription(data, previewPrescription) : null),
    [data?.chronicBooks, data?.patients, previewPrescription]
  );
  const [previewChronicBookUrl, setPreviewChronicBookUrl] = useState('');
  const [isLoadingChronicBookPreview, setIsLoadingChronicBookPreview] = useState(false);
  const [chronicBookPreviewError, setChronicBookPreviewError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

        /**
     * Mengambil dokumen Buku Kronis terkait resep dan mengatur status loading atau error untuk pratinjau.
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
   * =================================================
   * DATA RIWAYAT PASIEN
   * HANYA RESEP YANG SUDAH DITEBUS
   * =================================================
   */
  const list = useMemo(() => {
    const keyword =
      q.trim().toLowerCase();

    const rows = (
      data.prescriptions || []
    )
      .filter(
        (p) =>
          p.status === 'picked'
      )
      .filter((p) => sort !== 'date' || matchesDateFilter(p.createdAt, 'custom', historyDateFilter))
      .filter((p) => {
        const patient =
          getPatientForPrescription(
            data,
            p
          );

        const patientName =
          getPatientName(patient)
            .toLowerCase();

        const bpjs =
          getPatientBpjs(patient);
        const normalizedBpjsQuery = keyword.replace(/\D/g, '');
        const isBpjsQuery = /^[\d\s-]+$/.test(keyword) && Boolean(normalizedBpjsQuery);

        return (
          !keyword ||
          patientName.includes(keyword) ||
          (isBpjsQuery && bpjs.includes(normalizedBpjsQuery))
        );
      });

    return [...rows].sort((a, b) => {
      const nameA = getPatientName(
        getPatientForPrescription(data, a)
      );

      const nameB = getPatientName(
        getPatientForPrescription(data, b)
      );

      const dateA =
        new Date(
          a.createdAt || 0
        ).getTime();

      const dateB =
        new Date(
          b.createdAt || 0
        ).getTime();

      switch (sort) {
        case 'az':
          return nameA.localeCompare(
            nameB,
            'id',
            {
              sensitivity: 'base',
            }
          );

        case 'za':
          return nameB.localeCompare(
            nameA,
            'id',
            {
              sensitivity: 'base',
            }
          );

        case 'old':
          return dateA - dateB;

        case 'new':
        default:
          return dateB - dateA;
      }
    });
  }, [
    data.prescriptions,
    q,
    sort,
    historyDateFilter,
  ]);

  /*
   * =================================================
   * PAGINATION RIWAYAT PASIEN
   * =================================================
   */
  const patientHistoryTotalPages =
    Math.max(
      1,
      Math.ceil(
        list.length /
          PATIENT_HISTORY_PAGE_SIZE
      )
    );

  const paginatedPatientHistory =
    list.slice(
      (patientHistoryPage - 1) *
        PATIENT_HISTORY_PAGE_SIZE,
      patientHistoryPage *
        PATIENT_HISTORY_PAGE_SIZE
    );


  /*
   * =================================================
   * RESET HALAMAN SAAT PENCARIAN / FILTER BERUBAH
   * =================================================
   */
  useEffect(() => {
    setPatientHistoryPage(1);
  }, [q, sort, historyDateFilter]);

  /*
   * =================================================
   * BUKA DETAIL
   * =================================================
   */
  /**
   * Menyimpan resep yang dipilih sebagai konteks pemeriksaan, lalu membuka pratinjau dokumen pendukung.
   */
  const openVerifyPreview = (
    prescription
  ) => {
    setPreviewPrescription(
      prescription
    );
  };


  /*
   * =================================================
   * TUTUP DETAIL
   * =================================================
   */
  /**
   * Menutup tampilan verify pratinjau dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
   */
  const closeVerifyPreview = () => {
    setPreviewPrescription(
      null
    );
  };


  return (
    <div className="workspace-stack">

{/* =================================================
    RIWAYAT PASIEN
================================================= */}
<Card>

  <div className="section-head">
    <div>
      <h3>
        Daftar Pasien
      </h3>

      <p>
        Daftar resep yang telah ditebus.
      </p>
    </div>
  </div>


  {/* PENCARIAN + FILTER */}
  <div className="search-row">

    <Field label="Pencarian">
      <TextInput
        value={q}
        onChange={(e) =>
          setQ(e.target.value)
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

        {paginatedPatientHistory.length ? (
          paginatedPatientHistory.map((p) => (
            <tr
              key={p.id}
            >

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
                      m?.name ||
                      '-'
                  )
                  .join(', ')}
              </td>


              {/* STATUS */}
              <td>
                <Badge tone="success">
                  Ditebus
                </Badge>
              </td>


              {/* AKSI */}
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
          ))
        ) : (
          <tr>
            <td colSpan="9">

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


    {/* PAGINATION */}
    {patientHistoryTotalPages > 1 && (
      <div className="activity-pagination">

        <button
          type="button"
          className="pagination-btn"
          onClick={() =>
            setPatientHistoryPage(
              (page) =>
                Math.max(
                  1,
                  page - 1
                )
            )
          }
          disabled={
            patientHistoryPage === 1
          }
        >
          Sebelumnya
        </button>


        <CompactPagination currentPage={patientHistoryPage} totalPages={patientHistoryTotalPages} onPageChange={setPatientHistoryPage} />


        <button
          type="button"
          className="pagination-btn"
          onClick={() =>
            setPatientHistoryPage(
              (page) =>
                Math.min(
                  patientHistoryTotalPages,
                  page + 1
                )
            )
          }
          disabled={
            patientHistoryPage ===
            patientHistoryTotalPages
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
  open={Boolean(previewPrescription)}
  scrollable={false}
  title={
    <div className="section-head medication-modal-head">
      <div>
        <h3>
          Detail Resep
        </h3>

        <p>
          Detail resep yang sudah ditebus.
        </p>
      </div>
    </div>
  }
  onClose={closeVerifyPreview}
  size="xl"
>
  {previewPrescription ? (
    <div className="account-preview-scroll">
      <div className="account-preview">

      <div className="document-split-layout prescription-summary-layout">
        <div className="document-info-pane prescription-summary-info-pane">
      {/* =========================
          INFORMASI RESEP
      ========================= */}
      <div className="preview-grid">
        <div className="preview-item prescription-status-preview-item">
          <span>Status Resep</span>
          <strong className="prescription-status-value">
            <Badge tone={(previewPrescription.status === 'picked' || previewPrescription.pickedAt || previewPrescription.redeemedAt || previewPrescription.dispensedAt) ? 'success' : 'warning'}>
              {(previewPrescription.status === 'picked' || previewPrescription.pickedAt || previewPrescription.redeemedAt || previewPrescription.dispensedAt) ? 'Ditebus' : 'Menunggu'}
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
            <strong>{(previewPrescription.status === 'picked' || previewPrescription.pickedAt || previewPrescription.redeemedAt || previewPrescription.dispensedAt) ? (previewPrescription.transactionId || (previewPrescription.transactionIds || []).join(', ') || '-') : '-'}</strong>
          </div>
          <div className="preview-item">
            <span>Waktu/Tanggal Ditebus</span>
            <strong>{(previewPrescription.status === 'picked' || previewPrescription.pickedAt || previewPrescription.redeemedAt || previewPrescription.dispensedAt) ? getPickedDate(previewPrescription) : '-'}</strong>
          </div>
          <div className="preview-item">
            <span>Jadwal Penebusan Berikutnya</span>
            <strong>{(previewPrescription.status === 'picked' || previewPrescription.pickedAt || previewPrescription.redeemedAt || previewPrescription.dispensedAt) ? getNextPickupDate(previewPrescription) : '-'}</strong>
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
      {/* =========================
          TABEL OBAT
      ========================= */}
      <div className="preview-section">

        <div
          className="table-shell pharmacy-history-summary-table-shell"
          style={{
            width: '100%',
            overflowX: 'auto',
          }}
        >

          <table
            className="data-table"
            style={{
              width: '100%',
              minWidth: 0,
              tableLayout: 'fixed',
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

              {paginatedPreviewMedicationRows.map(
                  (
                    med,
                    index
                  ) => (
                    <tr
                      key={index}
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
                        {med.med ||
                          '-'}
                      </td>


                      {/* JUMLAH */}
                      <td>
                        {med.q ??
                          med.qty ??
                          '-'}
                      </td>


                      {/* SATUAN */}
                      <td>
                        {capitalizeFirstLetter(
                          med.u ||
                            med.unit ||
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
                        {getMedicationInstruction(
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
        {previewPrescription?.status === 'picked' ? (
          <Button type="button" onClick={() => setLabelPrescription(previewPrescription)}>
            <FileCheck size={15} />
            Cetak Etiket
          </Button>
        ) : null}
      </div>
      </div>
    </div>
  ) : null}
</Modal>

<MedicationLabelModal
  open={Boolean(labelPrescription)}
  prescription={labelPrescription}
  patient={getPatientForPrescription(data, labelPrescription)}
  onClose={() => setLabelPrescription(null)}
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
