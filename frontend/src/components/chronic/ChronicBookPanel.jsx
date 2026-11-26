/**
 * Mengelola daftar dan proses unggah buku kronis beserta pencarian data pasien terkait.
 */
import { useMemo, useEffect, useState } from 'react';

import { FileUp } from 'lucide-react';

import { Card } from '../ui/Card';
import { CompactPagination } from '../ui/CompactPagination';
import { Button } from '../ui/Button';

import { Field, SearchableSelect, TextInput } from '../ui/Field';

import { Modal } from '../ui/Modal';
import { getPdfPreviewUrl } from '../../lib/pdfPreview';

import { ChronicBookDetailModal } from './ChronicBookDetailModal';
import { normalizeBpjs } from '../../lib/patients';


/**
 * Merender komponen kronis buku panel dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function ChronicBookPanel({
  role,
  data,
  currentUser,
  onUploadBook,
  onUploadChronicBook,
  onAddChronicBook,
  onUpdateBookFile,
  onDeleteBook,
  notify,
}) {

  /*
   * =====================================================
   * FORM UPLOAD BUKU
   * =====================================================
   */

  const [
    uploadBpjs,
    setUploadBpjs,
  ] = useState('');

  const [
    uploadName,
    setUploadName,
  ] = useState('');


  const [
    uploadFile,
    setUploadFile,
  ] = useState(null);

  const [
    fileKey,
    setFileKey,
  ] = useState(0);


  /*
   * =====================================================
   * BUKU YANG DIPILIH
   * =====================================================
   */

  const [
    selected,
    setSelected,
  ] = useState(null);


  /*
   * =====================================================
   * MODAL PREVIEW UPLOAD
   * =====================================================
   */

  const [
    showPreview,
    setShowPreview,
  ] = useState(false);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    previewFileUrl,
    setPreviewFileUrl,
  ] = useState('');


  /*
   * =====================================================
   * FILTER BUKU KRONIS
   * =====================================================
   */

  const [
    bookSearch,
    setBookSearch,
  ] = useState('');

  const [
    bookSort,
    setBookSort,
  ] = useState('az');

  const [
    bookPage,
    setBookPage,
  ] = useState(1);

  const BOOK_PAGE_SIZE = 10;


  const chronicBooks =
    data?.chronicBooks || {};
  
/*
 * =====================================================
 * RESOLVER HANDLER UPLOAD BUKU KRONIS
 * =====================================================
 *
 * Mendukung beberapa nama callback dari parent.
 */
const uploadBookHandler =
  typeof onUploadBook === 'function'
    ? onUploadBook
    : typeof onUploadChronicBook === 'function'
      ? onUploadChronicBook
      : typeof onAddChronicBook === 'function'
        ? onAddChronicBook
        : null;

  /*
   * =====================================================
   * PREVIEW FILE UPLOAD
   * =====================================================
   */

  useEffect(() => {
    if (!uploadFile) {
      setPreviewFileUrl('');
      return;
    }

    const url =
      URL.createObjectURL(
        uploadFile
      );

    setPreviewFileUrl(
      url
    );

    return () => {
      URL.revokeObjectURL(
        url
      );
    };
  }, [
    uploadFile,
  ]);

    /**
   * Mengambil nomor BPJS dari variasi field data pasien yang didukung, kemudian menormalisasinya menjadi digit.
   */
  const getPatientBpjs = (patient) =>
    normalizeBpjs(
      patient?.bpjsNumber ||
      patient?.bpjs ||
      patient?.nomorBpjs ||
      patient?.nomorBPJS ||
      patient?.noBpjs ||
      patient?.cardNumber ||
      patient?.insuranceNumber ||
      patient?.bpjsCardNumber ||
      ''
    );

    /**
   * Mengutamakan nomor BPJS pada metadata Buku Kronis dan menggunakan data pasien sebagai fallback jika metadata kosong.
   */
  const getBookBpjs = (book) => {
    const storedBpjs = normalizeBpjs(
      book?.bpjsNumber ||
      book?.bpjs ||
      book?.nomorBpjs ||
      book?.nomorBPJS ||
      book?.noBpjs ||
      book?.cardNumber ||
      book?.insuranceNumber ||
      book?.bpjsCardNumber ||
      ''
    );

    if (storedBpjs) {
      return storedBpjs;
    }

    const patient =
      data?.patients?.[book?.patientId];

    return getPatientBpjs(patient);
  };

    /**
   * Mengambil nama dari field pasien yang digunakan format data sekarang maupun format lama.
   */
  const getPatientName = (patient) =>
    String(
      patient?.name ||
      patient?.patientName ||
      patient?.fullName ||
      patient?.nama ||
      ''
    ).trim();

    /**
   * Mencari pasien menggunakan nomor BPJS yang sudah dinormalisasi dan mengembalikan ID serta data pasien yang cocok.
   */
  const findPatientByBpjs = (bpjs) => {
    const keyword = normalizeBpjs(bpjs);

    if (!keyword) {
      return null;
    }

    const patients =
      data?.patients || {};

    const entry =
      Object.entries(
        patients
      ).find(
        ([, patient]) =>
          getPatientBpjs(patient) ===
          keyword
      );

    return entry
      ? {
          id: entry[0],
          patient: entry[1] || {},
        }
      : null;
  };

    /**
   * Mencari semua Buku Kronis dengan nomor BPJS yang sama dan memilih berkas dengan waktu unggah paling baru.
   */
  const findChronicBookByBpjs = (
    bpjs
  ) => {
    const keyword =
      normalizeBpjs(bpjs);

    if (!keyword) {
      return null;
    }

    const matches =
      Object.entries(
        data?.chronicBooks || {}
      ).filter(
        ([, book]) =>
          getBookBpjs(book) ===
          keyword
      );

    if (!matches.length) {
      return null;
    }

    matches.sort(
      ([, a], [, b]) =>
        new Date(
          b?.uploadedAt || 0
        ).getTime() -
        new Date(
          a?.uploadedAt || 0
        ).getTime()
    );

    const [id, book] =
      matches[0];

    return {
      id,
      book: book || {},
    };
  };

    /**
   * Mengambil nama pasien dari resep tersimpan berdasarkan nomor BPJS, termasuk resep yang belum ditebus.
   * Snapshot resep diprioritaskan agar pencarian tetap bekerja walaupun data master pasien belum lengkap.
   */
  const findPatientNameByBpjs = (bpjs) => {
    const keyword = normalizeBpjs(bpjs);
    if (!keyword) return '';

    const matches = (data?.prescriptions || [])
      .filter((prescription) => {
        const snapshot = prescription?.patientSnapshot || {};
        const master = data?.patients?.[prescription?.patientId] || {};
        const savedBpjs = normalizeBpjs(
          prescription?.bpjsNumber || snapshot.bpjsNumber ||
          master.bpjsNumber || master.bpjs || ''
        );
        return savedBpjs === keyword;
      })
      .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());

    const latest = matches[0];
    if (!latest) return '';

    const snapshot = latest.patientSnapshot || {};
    const master = data?.patients?.[latest.patientId] || {};
    return getPatientName(snapshot) ||
      String(latest.patientName || '').trim() ||
      getPatientName(master);
  };

  /*
   * =====================================================
   * STATUS INPUT FILE
   * =====================================================
   *
   * File hanya dapat dipilih jika pasien terdaftar,
   * Nama Pasien ditemukan, dan Buku Kronis belum ada.
   */
  const PATIENT_NOT_REGISTERED =
    'Pasien belum terdaftar';

  const CHRONIC_BOOK_EXISTS =
    'Buku Kronis sudah ada.';

  const currentBpjs =
    normalizeBpjs(uploadBpjs);

  const currentPatient =
    currentBpjs
      ? findPatientByBpjs(currentBpjs)
      : null;

  const currentPatientName =
    getPatientName(currentPatient?.patient);

  const currentChronicBook =
    currentBpjs
      ? findChronicBookByBpjs(currentBpjs)
      : null;

  const patientIsRegistered =
    Boolean(
      currentPatient &&
      currentPatientName
    );

  const chronicBookAlreadyExists =
    Boolean(currentChronicBook);

  const canSelectUploadFile =
    patientIsRegistered &&
    !chronicBookAlreadyExists;

  const fileStatusMessage =
    !currentBpjs
      ? ''
      : !patientIsRegistered
        ? PATIENT_NOT_REGISTERED
        : chronicBookAlreadyExists
          ? CHRONIC_BOOK_EXISTS
          : '';

  /*
   * =====================================================
   * DAFTAR SEMUA BUKU KRONIS
   * =====================================================
   */

  const bookList =
    useMemo(() => {

      const keyword =
        bookSearch
          .trim()
          .toLowerCase();

      const books =
        Object.values(
          chronicBooks
        ).filter(
          (book) => {

            if (!keyword) {
              return true;
            }

            const patientName =
              String(
                book?.patientName ||
                  ''
              )
                .trim()
                .toLowerCase();

            const bpjs =
              normalizeBpjs(
                book?.bpjsNumber ||
                book?.bpjs ||
                book?.nomorBpjs ||
                ''
              );

            const numericKeyword = /^[\d\s-]+$/.test(keyword)
              ? normalizeBpjs(keyword)
              : '';

            return (
              patientName.includes(keyword) ||
              (numericKeyword && bpjs.includes(numericKeyword))
            );
          }
        );

      return [
        ...books,
      ].sort(
        (a, b) => {

          const nameA =
            String(
              a?.patientName ||
                ''
            ).trim();

          const nameB =
            String(
              b?.patientName ||
                ''
            ).trim();

          const dateA =
            new Date(
              a?.uploadedAt ||
                0
            ).getTime();

          const dateB =
            new Date(
              b?.uploadedAt ||
                0
            ).getTime();

          switch (
            bookSort
          ) {

            case 'az':
              return (
                nameA.localeCompare(
                  nameB,
                  'id',
                  {
                    sensitivity:
                      'base',
                  }
                )
              );

            case 'za':
              return (
                nameB.localeCompare(
                  nameA,
                  'id',
                  {
                    sensitivity:
                      'base',
                  }
                )
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
      chronicBooks,
      bookSearch,
      bookSort,
    ]);


  /*
   * =====================================================
   * PAGINATION
   * =====================================================
   */

  const bookTotalPages =
    Math.max(
      1,
      Math.ceil(
        bookList.length /
          BOOK_PAGE_SIZE
      )
    );

  const paginatedBooks =
    bookList.slice(
      (bookPage - 1) *
        BOOK_PAGE_SIZE,
      bookPage *
        BOOK_PAGE_SIZE
    );


  useEffect(() => {
    setBookPage(1);
  }, [
    bookSearch,
    bookSort,
  ]);

  /*
   * =====================================================
   * SINKRONISASI NAMA PASIEN BERDASARKAN NOMOR BPJS
   * =====================================================
   */
  useEffect(() => {
    const bpjs = normalizeBpjs(uploadBpjs);

    if (!bpjs) {
      setUploadName('');
      return;
    }

    setUploadName(
      findPatientNameByBpjs(bpjs)
    );
  }, [
    uploadBpjs,
    data?.patients,
    data?.chronicBooks,
    data?.prescriptions,
  ]);

  /*
   * Jika status pasien berubah menjadi tidak valid atau Buku Kronis sudah ada,
   * file yang sebelumnya dipilih juga harus dibatalkan.
   */
  useEffect(() => {
    if (!canSelectUploadFile && uploadFile) {
      setUploadFile(null);
      setFileKey((value) => value + 1);
    }
  }, [
    canSelectUploadFile,
    uploadFile,
  ]);

  /*
   * =====================================================
   * VALIDASI FILE PDF
   * =====================================================
   */

  const MAX_CHRONIC_BOOK_FILE_SIZE =
    5 * 1024 * 1024;

    /**
   * Menghasilkan pesan validasi pertama untuk dokumen: file wajib tersedia, ekstensi harus PDF, dan ukuran tidak boleh melewati 5 MB.
   */
  const getPdfFileValidationMessage = (
    file
  ) => {

    if (!file) {
      return 'File buku kronis wajib diisi.';
    }

    const fileName = String(
      file.name ||
      ''
    ).toLowerCase();

    if (!fileName.endsWith('.pdf')) {
      return 'Buku kronis harus berupa file PDF.';
    }

    if (
      Number(file.size || 0) >
      MAX_CHRONIC_BOOK_FILE_SIZE
    ) {
      return 'Ukuran file maksimal 5 MB. Silakan unggah file PDF yang lebih kecil.';
    }

    return '';
  };

  /*
   * =====================================================
   * BUKA PREVIEW SEBELUM UPLOAD
   * =====================================================
   */

  /**
   * Menangani aksi upload dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleUpload = () => {
    const bpjs = normalizeBpjs(uploadBpjs);

    if (!/^\d{13}$/.test(bpjs)) {
      notify?.(
        'Nomor BPJS harus terdiri dari 13 digit angka.',
        'warning'
      );
      return;
    }

    const patient = findPatientByBpjs(bpjs);
    const patientNameFromData =
      getPatientName(patient?.patient);

    if (!patient || !patientNameFromData) {
      notify?.(
        PATIENT_NOT_REGISTERED,
        'warning'
      );
      return;
    }

    const existingChronicBook =
      findChronicBookByBpjs(bpjs);

    if (existingChronicBook) {
      notify?.(
        CHRONIC_BOOK_EXISTS,
        'warning'
      );
      return;
    }

    if (!uploadFile) {
      notify?.(
        'File buku kronis wajib diisi.',
        'warning'
      );
      return;
    }
    const patientName =
      patientNameFromData;

    setUploadName(patientName);

    const fileValidationMessage =
      getPdfFileValidationMessage(
        uploadFile
      );

    if (fileValidationMessage) {
      notify?.(
        fileValidationMessage,
        'warning'
      );
      return;
    }

    setShowPreview(true);
  };


  /**
   * Menjalankan tindakan upload setelah keputusan atau konfirmasi yang diperlukan diterima.
   */
  const confirmUpload = async () => {
    if (isSubmitting) return;

    const bpjs = normalizeBpjs(uploadBpjs);
    if (!/^\d{13}$/.test(bpjs)) {
      notify?.('Nomor BPJS harus terdiri dari 13 digit angka.', 'warning');
      setShowPreview(false);
      return;
    }
    const patient = findPatientByBpjs(bpjs);
    const patientName =
      getPatientName(patient?.patient) || '';
    const patientId = patient?.id;

    if (!patient || !patientName) {
      notify?.(
        PATIENT_NOT_REGISTERED,
        'warning'
      );
      setShowPreview(false);
      return;
    }

    const existingChronicBook =
      findChronicBookByBpjs(bpjs);

    if (existingChronicBook) {
      notify?.(
        CHRONIC_BOOK_EXISTS,
        'warning'
      );
      setShowPreview(false);
      return;
    }

    if (!bpjs || !patientId || !patientName || !uploadFile) {
      notify?.(
        'Nomor BPJS harus terdaftar dan data buku kronis wajib lengkap.',
        'warning'
      );
      return;
    }

    const fileValidationMessage =
      getPdfFileValidationMessage(
        uploadFile
      );

    if (fileValidationMessage) {
      notify?.(
        fileValidationMessage,
        'warning'
      );
      setShowPreview(false);
      return;
    }

    if (!uploadBookHandler) {
      notify?.(
        'Fungsi upload buku kronis belum terhubung ke sistem.',
        'warning'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await uploadBookHandler({
        patientId,
        patientName,
        bpjsNumber: bpjs,
        fileName: uploadFile.name,
        fileData: uploadFile,
        uploadedBy: currentUser,
      });

      if (result?.ok) {
        notify?.(
          'Buku Kronis berhasil diupload.',
          'success'
        );
        resetUploadForm();
      } else {
        notify?.(
          result?.message || 'Gagal mengunggah buku kronis.',
          'warning'
        );
      }
    } catch (error) {
      console.error('Error upload buku kronis:', error);
      notify?.(
        error?.message || 'Gagal mengunggah buku kronis.',
        'warning'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * =====================================================
   * RESET FORM UPLOAD
   * =====================================================
   */

    /**
   * Mengembalikan field dan pilihan dokumen formulir buku kronis ke keadaan awal setelah unggahan selesai atau dibatalkan.
   */
  const resetUploadForm = () => {

    if (
      isSubmitting
    ) {
      return;
    }

    setUploadBpjs('');

    setUploadFile(
      null
    );

    setUploadName(
      ''
    );

    setShowPreview(
      false
    );

    setPreviewFileUrl(
      ''
    );

    setFileKey(
      (value) =>
        value + 1
    );
  };


  /*
   * Dokter FKTP dan apoteker menggunakan form input yang sama.
   * Dengan begitu nomor BPJS selalu dicocokkan ulang ke Arsip Kronis.
   */

  /*
   * =====================================================
   * PHARMACY / ADMIN / DOKTER FKTP
   * =====================================================
   */

  return (
    <div className="workspace-stack">

{/* =================================================
    CARD UPLOAD BUKU
    HANYA UNTUK APOTEKER
================================================= */}
{role === 'pharmacy' && (
  <Card>

    <div className="section-head">

      <div>

        <h3>
          Tambah Buku
        </h3>

        <p>
          Tambah buku kronis pasien ke dalam sistem.
        </p>

      </div>

    </div>


    <div className="form-grid three-cols">

      {/* NOMOR BPJS */}
      <Field
        label="No. BPJS/JKN/KIS"
        required
      >

        <TextInput
          value={uploadBpjs}
          onChange={(event) => {
            const bpjs =
              event.target.value.replace(
                /\D/g,
                ''
              );

            setUploadBpjs(
              bpjs
            );

            setUploadName(
              findPatientNameByBpjs(
                bpjs
              )
            );
          }}
          inputMode="numeric"
          placeholder="Masukkan 13 digit nomor BPJS/JKN/KIS"
          maxLength={13}
        />

      </Field>


      {/* NAMA PASIEN */}
      <Field
        label="Nama Pasien"
        required
      >

        <TextInput
          value={
            uploadName
          }
          readOnly
          disabled
          className="control auto-filled-control"
          placeholder="Nama pasien akan terisi otomatis"
        />

      </Field>


      {/* FILE */}
      <Field
        label="File"
        required
      >

        <label
          className={
            canSelectUploadFile
              ? 'file-control'
              : 'file-control disabled'
          }
          aria-disabled={!canSelectUploadFile}
          style={{
            opacity: canSelectUploadFile
              ? 1
              : 0.6,
            cursor: canSelectUploadFile
              ? 'pointer'
              : 'not-allowed',
            pointerEvents: canSelectUploadFile
              ? 'auto'
              : 'none',
          }}
          onClick={(event) => {
            if (!canSelectUploadFile) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >

          <span
            className={
              uploadFile
                ? 'file-name active'
                : 'file-name'
            }
            style={{
              color: canSelectUploadFile
                ? undefined
                : '#94a3b8',
            }}
          >
            {uploadFile
              ? uploadFile.name
              : fileStatusMessage === CHRONIC_BOOK_EXISTS
                ? CHRONIC_BOOK_EXISTS
                : 'Pilih file'}
          </span>

          <span
            className="file-button"
            style={{
              opacity: canSelectUploadFile
                ? 1
                : 0.6,
              cursor: canSelectUploadFile
                ? 'pointer'
                : 'not-allowed',
            }}
          >
            Pilih
          </span>

          <input
            key={fileKey}
            type="file"
            aria-label={
              fileStatusMessage || 'Pilih file buku kronis'
            }
            accept="application/pdf,.pdf"
            disabled={!canSelectUploadFile}
            onChange={(event) => {

              if (!canSelectUploadFile) {
                event.target.value = '';
                return;
              }

              const file =
                event.target.files?.[0] ||
                null;

              if (!file) {
                setUploadFile(null);
                return;
              }

              const fileValidationMessage =
                getPdfFileValidationMessage(
                  file
                );

              if (fileValidationMessage) {

                notify?.(
                  fileValidationMessage,
                  'warning'
                );

                event.target.value = '';
                setUploadFile(null);

                return;
              }

              setUploadFile(
                file
              );

            }}
          />

        </label>

      </Field>

    </div>


    {/* TOMBOL UPLOAD */}
    <Button
      className="add-account-btn"
      onClick={
        handleUpload
      }
      disabled={
        isSubmitting
      }
    >
      <FileUp size={16} />
      Upload Buku
    </Button>

  </Card>
)}

      {/* =================================================
          CARD ARSIP KRONIS
      ================================================= */}
      <Card>

        <div className="section-head">

          <div>

            <h3>
              Daftar Buku
            </h3>

            <p>
              Lihat buku kronis pasien.
            </p>

          </div>

        </div>


        {/* SEARCH + FILTER */}
        <div className="search-row">

          <Field label="Pencarian">

            <TextInput
              value={
                bookSearch
              }
              onChange={(
                event
              ) =>
                setBookSearch(
                  event.target.value
                )
              }
              placeholder="Cari nama pasien atau nomor BPJS"
            debounceMs={400}
/>

          </Field>


          <Field label="Filter">

            <SearchableSelect
              className="control control-compact"
              value={
                bookSort
              }
              onChange={(
                event
              ) =>
                setBookSort(
                  event.target.value
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


        {/* LIST */}
        <div className="stack chronic-book-list">

          {paginatedBooks.length ? (

            paginatedBooks.map(
              (book) => (

                <div
                  className="result-card detail"
                  key={
                    book.patientId
                  }
                >

                  <div className="result-head chronic-book-card-head">

                    <div>
                      <strong>
                        {
                          book.bpjsNumber ||
                          book.bpjs ||
                          book.nomorBpjs ||
                          '-'
                        }
                      </strong>

                      <div
                        style={{
                          marginTop: '3px',
                          fontSize: '0.82rem',
                          color: 'var(--text-muted, #64748b)',
                          lineHeight: 1.35,
                        }}
                      >
                        {book.patientName || '-'}
                      </div>
                    </div>


                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelected(
                          book
                        )
                      }
                    >
                      <span>
                        Buka
                      </span>
                    </Button>

                  </div>

                </div>

              )
            )

          ) : (

            <div className="empty-inline">

              {
                bookSearch.trim()
                  ? 'Buku kronis dengan nama pasien atau nomor BPJS tersebut tidak ditemukan.'
                  : 'Belum ada buku kronis yang tersedia.'
              }

            </div>

          )}

        </div>


        {/* PAGINATION */}
        {bookTotalPages > 1 && (
          <div className="activity-pagination">

            <button
              type="button"
              className="pagination-btn"
              onClick={() =>
                setBookPage(
                  (page) =>
                    Math.max(
                      1,
                      page - 1
                    )
                )
              }
              disabled={
                bookPage === 1
              }
            >
              Sebelumnya
            </button>


            <CompactPagination currentPage={bookPage} totalPages={bookTotalPages} onPageChange={setBookPage} />


            <button
              type="button"
              className="pagination-btn"
              onClick={() =>
                setBookPage(
                  (page) =>
                    Math.min(
                      bookTotalPages,
                      page + 1
                    )
                )
              }
              disabled={
                bookPage ===
                bookTotalPages
              }
            >
              Berikutnya
            </button>

          </div>
        )}

      </Card>


      {/* =================================================
          MODAL PERIKSA DATA UPLOAD
      ================================================= */}
      <Modal
        open={
          showPreview
        }
        title={
          <div className="section-head medication-modal-head">

            <div>

              <h3>
                Periksa Data
              </h3>

              <p>
                Pastikan data pasien sudah benar sebelum diupload.
              </p>

            </div>

          </div>
        }
        onClose={() => {

          if (
            !isSubmitting
          ) {
            setShowPreview(
              false
            );
          }

        }}
        size="xl"
        scrollable={false}
      >

        <div className="account-preview-scroll">
          <div className="account-preview">
            <div className="document-split-layout chronic-book-upload-preview-layout">
              <div className="document-info-pane chronic-book-upload-info-pane">
                <div className="preview-grid">
                  <div className="preview-item">
                    <span>Nomor BPJS</span>
                    <strong>{uploadBpjs || '-'}</strong>
                  </div>
                  <div className="preview-item">
                    <span>Nama Pasien</span>
                    <strong>{uploadName || '-'}</strong>
                  </div>
                </div>

              </div>

              <div className="document-viewer-pane chronic-book-upload-document-pane">
                <div className="preview-document-head">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span>Buku Kronis</span>
                    <strong>{uploadFile?.name || '-'}</strong>
                  </div>
                  {previewFileUrl ? (
                    <a
                      href={previewFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="preview-pdf-button"
                    >
                      Buka PDF
                    </a>
                  ) : null}
                </div>

                <div className="document-preview document-preview-large">
                  {previewFileUrl ? (
                    <iframe
                      src={getPdfPreviewUrl(previewFileUrl)}
                      title="Preview Buku Kronis"
                    />
                  ) : (
                    <div className="document-empty">Preview file tidak tersedia.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="preview-actions chronic-book-upload-confirm-footer">
              <Button
                type="button"
                onClick={confirmUpload}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Mengupload...' : <><FileUp size={16} />Konfirmasi</>}
              </Button>
            </div>
          </div>
        </div>

      </Modal>


<ChronicBookDetailModal
  open={Boolean(selected)}
  selected={selected}
  role={role}
  data={data}
  onClose={() => setSelected(null)}
  onUpdateBookFile={
    role === 'pharmacy'
      ? onUpdateBookFile
      : undefined
  }
  onDeleteBook={
    role === 'pharmacy'
      ? onDeleteBook
      : undefined
  }
  notify={notify}
/>

    </div>
  );
}
