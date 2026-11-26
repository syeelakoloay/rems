/**
 * Menampilkan detail buku kronis serta tindakan terkait dokumen dan data pasien.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Save, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { SystemDialog } from '../ui/SystemDialog';
import { Button } from '../ui/Button';

import { DateFilterBar } from '../prescription/DateFilterBar';
import { Badge } from '../ui/Badge';
import { formatDateTime, matchesDateFilter } from '../../lib/date';
import { api } from '../../lib/api';
import { getPdfPreviewUrl } from '../../lib/pdfPreview';
import { usePaginatedItems } from '../ui/usePaginatedItems';
import { TablePagination } from '../ui/TablePagination';
import { PrescriptionClinicalDetails } from '../prescription/PrescriptionClinicalDetails';
import { getNextPickupDate, formatPrescriptionRedemptionTime as formatPickedDate } from '../../lib/prescriptions';
import { normalizeBpjs } from '../../lib/patients';

/**
 * Mengambil nomor BPJS dari metadata Buku Kronis atau data pasien terkait, kemudian menormalisasinya menjadi digit.
 */
const getBookBpjs = (book, patients) =>
  normalizeBpjs(
    book?.bpjsNumber ??
      book?.bpjs ??
      book?.nomorBpjs ??
      book?.nomorBPJS ??
      book?.noBpjs ??
      book?.cardNumber ??
      book?.insuranceNumber ??
      book?.bpjsCardNumber ??
      patients?.[book?.patientId]?.bpjsNumber ??
      patients?.[book?.patientId]?.bpjs ??
      ''
  );

/**
 * Menggunakan aturan pakai tersimpan; jika tidak tersedia, menyusun instruksi dari frekuensi, dosis, waktu konsumsi, dan durasi.
 */
const getInstruction = (med) => {
  const direct =
    med?.doseInstruction ||
    med?.aturanPakai ||
    med?.instruction ||
    med?.usage ||
    med?.signa ||
    med?.rule ||
    med?.directions;
  if (direct) return String(direct).trim() || '-';

  const parts = [];
  if (med?.frequency) parts.push(`${med.frequency} kali sehari`);
  if (med?.dose && med?.doseUnit) parts.push(`${med.dose} ${med.doseUnit}`);
  else if (med?.dose) parts.push(String(med.dose));
  if (med?.timing) parts.push(String(med.timing));
  if (med?.duration) parts.push(`selama ${med.duration}`);
  return parts.length ? parts.join(' ') : '-';
};

/**
 * Mengambil catatan tambahan obat dari field saat ini atau alias historis dan menampilkan tanda pengganti bila kosong.
 */
const getNotes = (med) =>
  String(
    med?.notes ??
      med?.catatanTambahan ??
      med?.note ??
      med?.catatan ??
      ''
  ).trim() || '-';

/**
 * Mengambil nama obat dari field med atau name, lalu menampilkan tanda pengganti bila keduanya kosong.
 */
const getMedicationName = (med) =>
  String(med?.med || med?.name || '').trim() || '-';

/**
 * Merender komponen kronis buku detail modal dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function ChronicBookDetailModal({
  open,
  selected,
  role,
  data,
  onClose,
  onUpdateBookFile,
  onDeleteBook,
  notify,
}) {
  const [replacementFile, setReplacementFile] = useState(null);
  const [prescriptionDateFilter, setPrescriptionDateFilter] = useState('new');
  const [prescriptionCustomDate, setPrescriptionCustomDate] = useState('');
  const [replacementFileUrl, setReplacementFileUrl] = useState('');
  const replacementFileInputRef = useRef(null);
  const [isUpdatingFile, setIsUpdatingFile] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeletingBook, setIsDeletingBook] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [documentOverride, setDocumentOverride] = useState(null);
  const displayFileId = documentOverride && String(documentOverride.patientId) === String(selected?.patientId) && String(documentOverride.originalFileId) === String(selected?.fileId) ? documentOverride.fileId : selected?.fileId;
  const displayFileName = documentOverride && String(documentOverride.patientId) === String(selected?.patientId) && String(documentOverride.originalFileId) === String(selected?.fileId) ? documentOverride.fileName : selected?.fileName;
  const showPrescriptionAuthor = role === 'doctor' || role === 'pharmacy';

  useEffect(() => {
    if (!replacementFile) {
      setReplacementFileUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(replacementFile);
    setReplacementFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [replacementFile]);

  useEffect(() => {
    if (!open) {
      setReplacementFile(null);
      setReplacementFileUrl('');
      setSelectedPrescription(null);
      setDocumentUrl('');
      setIsLoadingDocument(false);
      setDocumentError('');
      setPrescriptionDateFilter('all');
      setPrescriptionCustomDate('');
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    /**
 * Mengambil file Buku Kronis melalui API dan membuat Blob URL untuk pratinjau. Permintaan yang selesai setelah modal ditutup diabaikan, dan URL sementara dibersihkan saat sumber berubah.
 */
    const loadDocument = async () => {
      if (!open || !displayFileId) {
        setDocumentUrl('');
        setIsLoadingDocument(false);
        setDocumentError('');
        return;
      }

      setIsLoadingDocument(true);
      setDocumentError('');

      try {
        objectUrl = await api.files.createObjectUrl(displayFileId);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setDocumentUrl(objectUrl);
      } catch (error) {
        if (!cancelled) {
          setDocumentUrl('');
          setDocumentError(
            error?.message || 'Dokumen Buku Kronis tidak dapat dibuka.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDocument(false);
        }
      }
    };

    loadDocument();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [open, displayFileId]);

  const prescriptions = useMemo(() => {
    if (!selected) return [];
    const selectedPatientId = String(selected.patientId || '');
    return (data?.prescriptions || [])
      .filter((prescription) => {
        const samePatientId =
          selectedPatientId &&
          String(prescription?.patientId || '') === selectedPatientId;

        return Boolean(samePatientId);
      })
      .sort(
        (a, b) =>
          new Date(b?.createdAt || 0).getTime() -
          new Date(a?.createdAt || 0).getTime()
      );
  }, [data?.patients, data?.prescriptions, selected]);

  const filteredPrescriptions = useMemo(() => {
    const filtered = prescriptions.filter((prescription) =>
      ['today', 'custom'].includes(prescriptionDateFilter)
        ? matchesDateFilter(prescription?.createdAt, prescriptionDateFilter, prescriptionCustomDate)
        : true
    );
    return filtered.sort((a, b) => {
      const aTime = new Date(a?.createdAt || 0).getTime();
      const bTime = new Date(b?.createdAt || 0).getTime();
      return prescriptionDateFilter === 'old' ? aTime - bTime : bTime - aTime;
    });
  }, [prescriptions, prescriptionDateFilter, prescriptionCustomDate]);
  const { currentPage: prescriptionTablePage, setCurrentPage: setPrescriptionTablePage, totalPages: prescriptionTableTotalPages, paginatedItems: paginatedPrescriptionRows } = usePaginatedItems(filteredPrescriptions);
  const selectedPrescriptionMeds = useMemo(
    () => Array.isArray(selectedPrescription?.meds) ? selectedPrescription.meds : [],
    [selectedPrescription?.meds]
  );
  const { currentPage: selectedMedPage, setCurrentPage: setSelectedMedPage, totalPages: selectedMedTotalPages, paginatedItems: paginatedSelectedMeds } = usePaginatedItems(selectedPrescriptionMeds);

  /**
   * Memvalidasi keberadaan file, ekstensi PDF, serta ukuran maksimum 5 MB sebelum dokumen diproses.
   */
  const validatePdfFile = (file) =>
    Boolean(
      file &&
        (file.type === 'application/pdf' ||
          file.name?.toLowerCase().endsWith('.pdf'))
    );

  /**
   * Membuka PDF pada tab baru; berkas lokal berbentuk Blob menggunakan object URL yang dibuat browser.
   */
  const openPdfInNewTab = (fileData) => {
    const sourceUrl = documentUrl || fileData;
    if (!sourceUrl) return;
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
      notify?.('PDF tidak dapat dibuka karena popup browser diblokir.', 'warning');
      return;
    }
    try {
      const source = String(sourceUrl);
      if (source.startsWith('data:application/pdf')) {
        newWindow.document.write(
          `<iframe src="${getPdfPreviewUrl(source)}" style="width:100%;height:100%;border:0"></iframe>`
        );
        newWindow.document.close();
        return;
      }
      newWindow.location.href = source;
    } catch (error) {
      console.error('Error membuka PDF:', error);
      newWindow.close();
      notify?.('PDF tidak dapat dibuka.', 'warning');
    }
  };

  /**
   * Menangani aksi update berkas dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleUpdateFile = async () => {
    if (!selected || !replacementFile || isUpdatingFile) return;
    if (!validatePdfFile(replacementFile)) {
      notify?.('Buku kronis harus berupa file PDF.', 'warning');
      return;
    }
    if (typeof onUpdateBookFile !== 'function') {
      notify?.('Fungsi ubah file belum tersedia.', 'warning');
      return;
    }

    setIsUpdatingFile(true);
    try {
      const result = await onUpdateBookFile({
        patientId: selected.patientId,
        fileName: replacementFile.name,
        fileData: replacementFile,
      });

      if (result?.ok) {
        if (result?.book?.fileId) {
          setDocumentOverride({
            patientId: selected.patientId,
            originalFileId: selected.fileId,
            fileId: result.book.fileId,
            fileName: result.book.fileName || replacementFile.name,
          });
        }
        notify?.('File buku kronis berhasil diubah.', 'success');
        setReplacementFile(null);
        setReplacementFileUrl('');
      } else {
        notify?.(result?.message || 'Gagal mengubah file buku kronis.', 'warning');
      }
    } catch (error) {
      console.error('Error mengubah file buku kronis:', error);
      notify?.(error?.message || 'Gagal mengubah file buku kronis.', 'warning');
    } finally {
      setIsUpdatingFile(false);
    }
  };

  /**
   * Menangani aksi delete buku dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleDeleteBook = () => {
    if (!selected || role !== 'pharmacy' || typeof onDeleteBook !== 'function') return;
    setShowDeleteConfirmation(true);
  };

  /**
   * Menjalankan tindakan delete buku setelah keputusan atau konfirmasi yang diperlukan diterima.
   */
  const confirmDeleteBook = async () => {
    if (!selected || role !== 'pharmacy' || typeof onDeleteBook !== 'function' || isDeletingBook) return;
    setIsDeletingBook(true);
    try {
      const result = await onDeleteBook(selected.patientId);
      setShowDeleteConfirmation(false);
      if (result?.ok) {
        notify?.('Buku Kronis berhasil dihapus.', 'success');
        onClose?.();
      } else {
        notify?.(result?.message || 'Gagal menghapus Buku Kronis.', 'warning');
      }
    } catch (error) {
      notify?.(error?.message || 'Gagal menghapus Buku Kronis.', 'warning');
    } finally {
      setIsDeletingBook(false);
    }
  };

  if (!selected && open) {
    return <Modal open title="Detail Buku" onClose={onClose}>Data tidak tersedia.</Modal>;
  }

  return (
    <>
      <Modal
        open={open && Boolean(selected)}
        scrollable={false}
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>Detail Buku</h3>
              <p>Informasi dan file buku kronis pasien.</p>
            </div>
          </div>
        }
        onClose={onClose}
        size="xl"
      >
        {selected ? (
          <div className="account-preview-scroll">
            <div className="account-preview">
              <div className="document-split-layout chronic-book-detail-layout">
                <div className="document-info-pane">
                  <div className="preview-grid chronic-book-detail-info-grid">
                    <div className="preview-item">
                      <span>Nomor BPJS</span>
                      <strong>{
                        selected.bpjsNumber ||
                        selected.bpjs ||
                        selected.nomorBpjs ||
                        getBookBpjs(selected, data?.patients || {}) ||
                        '-'
                      }</strong>
                    </div>
                    <div className="preview-item">
                      <span>Nama Pasien</span>
                      <strong>{selected.patientName || '-'}</strong>
                    </div>
                    <div className="preview-item">
                      <span>Waktu/Tanggal Dibuat</span>
                      <strong>{selected.uploadedAt ? formatDateTime(selected.uploadedAt) : '-'}</strong>
                    </div>
                  </div>
                </div>

                <div className="document-viewer-pane">
                  <div className="preview-document-head">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span>Dokumen Buku Kronis</span>
                      <strong
                        style={{
                          display: 'block',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {displayFileName || '-'}
                      </strong>
                    </div>
                    <div className="preview-document-actions">
                      {role === 'pharmacy' && typeof onDeleteBook === 'function' ? (
                        <button
                          type="button"
                          className="preview-pdf-button preview-pdf-button-danger"
                          onClick={handleDeleteBook}
                          disabled={isUpdatingFile || isDeletingBook}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          Hapus PDF
                        </button>
                      ) : null}
                      {role === 'pharmacy' && typeof onUpdateBookFile === 'function' ? (
                        <button
                          type="button"
                          className="preview-pdf-button preview-pdf-button-edit"
                          onClick={() => replacementFileInputRef.current?.click()}
                          disabled={isUpdatingFile}
                        >
                          Ubah PDF
                        </button>
                      ) : null}
                      {documentUrl ? (
                        <button
                          type="button"
                          className="preview-pdf-button"
                          onClick={() => openPdfInNewTab(documentUrl)}
                        >
Buka PDF
                        </button>
                      ) : null}
                      {role === 'pharmacy' && typeof onUpdateBookFile === 'function' ? (
                        <input
                          ref={replacementFileInputRef}
                          type="file"
                          accept="application/pdf,.pdf"
                          className="account-edit-hidden-file-input"
                          aria-label="Pilih PDF Buku Kronis pengganti"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            event.target.value = '';
                            if (!file) return;
                            if (!validatePdfFile(file) || file.size > 5 * 1024 * 1024) {
                              notify?.('Buku kronis harus berupa file PDF maksimal 5 MB.', 'warning');
                              return;
                            }
                            setReplacementFile(file);
                          }}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="document-preview document-preview-large">
                    {isLoadingDocument ? (
                      <div className="document-empty">Membuka dokumen Buku Kronis...</div>
                    ) : documentUrl ? (
                      <iframe
                        src={getPdfPreviewUrl(documentUrl)}
                        title="Preview Buku Kronis"
                      />
                    ) : (
                      <div className="document-empty">
                        {documentError || 'Preview file tidak tersedia.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="preview-section">
                <DateFilterBar value={prescriptionDateFilter} onChange={(nextValue) => { setPrescriptionDateFilter(nextValue); if (nextValue !== 'custom') setPrescriptionCustomDate(''); }} dateLabel="Waktu/Tanggal Dibuat" customDate={prescriptionCustomDate} onCustomDateChange={setPrescriptionCustomDate} options={[{ value: 'new', label: 'Terbaru' }, { value: 'old', label: 'Terlama' }, { value: 'today', label: 'Hari Ini' }, { value: 'custom', label: 'Waktu/Tanggal Dibuat' }]} customValue="custom" fallbackValue="new" />
                <div className="table-shell chronic-book-prescription-table-shell">
                  <table className="data-table chronic-book-prescription-table">
                    <thead>
                      <tr>
                        <th>Waktu/Tanggal Dibuat</th>
                        {showPrescriptionAuthor ? <th>Dokter Pembuat Resep</th> : null}
                        <th>No. Kunjungan</th>
                        <th>Diagnosis</th>
                        <th>Obat</th>
                        <th>Status</th>
                        <th>Tanggal Ditebus</th>
                        <th>Jadwal Penebusan Berikutnya</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPrescriptions.length ? paginatedPrescriptionRows.map((prescription) => {
                        const picked = prescription.status === 'picked';
                        return (
                          <tr key={prescription.id}>
                            <td>{prescription.createdAt ? formatDateTime(prescription.createdAt) : '-'}</td>
                            {showPrescriptionAuthor ? <td>{prescription.createdBy || '-'}</td> : null}
                            <td>{prescription.visitNumber || '-'}</td>
                            <td>{prescription.diagnosis || '-'}</td>
                            <td>{(prescription.meds || []).map(getMedicationName).join(', ') || '-'}</td>
                            <td><Badge tone={picked ? 'success' : 'warning'}>{picked ? 'Ditebus' : 'Menunggu'}</Badge></td>
                            <td>{picked ? formatPickedDate(prescription) : '-'}</td>
                            <td>{picked ? getNextPickupDate(prescription) : '-'}</td>
                            <td>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Detail resep"
                                aria-label={`Lihat detail resep ${prescription.id || ''}`}
                                onClick={() => setSelectedPrescription(prescription)}
                              >
                                <Eye size={15} aria-hidden="true" />
                                <span className="sr-only">Detail</span>
                              </Button>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={showPrescriptionAuthor ? 9 : 8}><div className="empty-table">{prescriptions.length ? 'Tidak ada riwayat resep pada tanggal yang dipilih.' : 'Belum ada riwayat resep untuk pasien ini.'}</div></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <TablePagination currentPage={prescriptionTablePage} totalPages={prescriptionTableTotalPages} onPageChange={setPrescriptionTablePage} />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(replacementFile)}
        scrollable={false}
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>Preview Buku</h3>
              <p>File buku kronis pasien yang akan diperbarui.</p>
            </div>
          </div>
        }
        onClose={() => {
          if (!isUpdatingFile) setReplacementFile(null);
        }}
        size="xl"
      >
        {replacementFile && replacementFileUrl ? (
          <div className="account-preview-scroll">
            <div className="account-preview">
              <div className="preview-section">
                <div className="preview-document-head">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span>File Buku Kronis</span>
                    <strong>{replacementFile.name}</strong>
                  </div>
                  <button type="button" className="preview-pdf-button" onClick={() => openPdfInNewTab(replacementFileUrl)}>
Buka PDF
                  </button>
                </div>
                <div className="document-preview document-preview-large" style={{ width: '100%', overflow: 'hidden' }}>
                  <iframe src={getPdfPreviewUrl(replacementFileUrl)} title="Preview Buku Kronis yang akan diperbarui" style={{ display: 'block', width: '100%', height: 'min(68vh, 720px)', border: 0 }} />
                </div>
                <div className="preview-actions">
                  <Button type="button" onClick={handleUpdateFile} disabled={isUpdatingFile}>
                    <Save size={16} />
                    {isUpdatingFile ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedPrescription)}
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>Detail Resep</h3>
              <p>Rincian obat dari resep pasien.</p>
            </div>
          </div>
        }
        onClose={() => setSelectedPrescription(null)}
        size="lg"
      >
        {selectedPrescription ? (
          <div className="account-preview-scroll">
            <div className="account-preview">
              <div className="preview-grid">
                <div className="preview-item"><span>Dokter Pembuat Resep</span><strong>{selectedPrescription.createdBy || '-'}</strong></div>
              </div>
              <PrescriptionClinicalDetails prescription={selectedPrescription} />
              <div className="preview-section">
                <div className="table-shell chronic-book-redeemed-table-shell">
                  <table className="data-table chronic-book-redeemed-table">
                    <thead>
                      <tr>
                        <th>Obat</th>
                        <th>Jumlah</th>
                        <th>Satuan</th>
                        <th>Aturan Pakai</th>
                        <th>Catatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedSelectedMeds.map((med, index) => (
                        <tr key={`${selectedPrescription.id}-${index}`}>
                          <td>{getMedicationName(med)}</td>
                          <td>{med?.q ?? med?.qty ?? '-'}</td>
                          <td>{med?.u || med?.unit || '-'}</td>
                          <td>{getInstruction(med)}</td>
                          <td>{getNotes(med)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination currentPage={selectedMedPage} totalPages={selectedMedTotalPages} onPageChange={setSelectedMedPage} />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <SystemDialog
        open={showDeleteConfirmation}
        type="confirm"
        title="Hapus Buku Kronis"
        message={`Yakin ingin menghapus Buku Kronis milik pasien "${selected?.patientName || '-'}"?`}
        contentMessage="Dokumen tidak akan tampil lagi di daftar Buku Kronis setelah dihapus."
        confirmText={isDeletingBook ? 'Menghapus...' : 'Hapus Buku Kronis'}
        confirmVariant="danger"
        cancelText="Batal"
        cancelVariant="ghost"
        onConfirm={(confirmed) => {
          if (confirmed) void confirmDeleteBook();
          else setShowDeleteConfirmation(false);
        }}
        onCancel={() => {
          if (!isDeletingBook) setShowDeleteConfirmation(false);
        }}
      />
    </>
  );
}
