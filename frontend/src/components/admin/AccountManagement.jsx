/**
 * Mengelola tampilan dan interaksi Admin untuk verifikasi pendaftaran, daftar akun, pembuatan akun, pengubahan akun, dan tindakan pengelolaan akses.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { Plus, Trash2, Pencil, Save, Power, KeyRound, CheckCircle2, XCircle } from 'lucide-react';

import { Card } from '../ui/Card';
import { CompactPagination } from '../ui/CompactPagination';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Field, SearchableSelect, TextInput } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { ROLE_LABELS } from '../../data/constants';
import { api } from '../../lib/api';
import { matchesDateFilter, formatDate as formatCalendarDate } from '../../lib/date';
import { DateFilterBar } from '../prescription/DateFilterBar';
import { getPdfPreviewUrl } from '../../lib/pdfPreview';

/**
 * Merender komponen akun management dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function AccountManagement({
  data,
  onReloadData,
  onAddAccount,
  onDeleteAccount,
  onChangeAccount,
  onToggleAccountStatus,
  onRequestPasswordReset,
  notify,
}) {
  const ACCOUNT_PAGE_SIZE =
    10;

/**
 * Menyeragamkan akun agar pencarian, perbandingan, dan validasi menggunakan format yang konsisten.
 */
const normalizeAccounts =
    (users) =>
      Array.isArray(users)
        ? users
        : Object.values(
            users || {}
          );

  const [
    accountPage,
    setAccountPage,
  ] = useState(1);


  const [
    accountSearch,
    setAccountSearch,
  ] = useState('');


  const [
    accountSort,
    setAccountSort,
  ] = useState('az');

  const [accountDateFilter, setAccountDateFilter] = useState({ start: '', end: '' });


  const emptyForm = {
    name: '',
    email: '',
    nik: '',
    role: '',
    str: null,
    sip: null,
  };


  const [
    form,
    setForm,
  ] = useState(
    emptyForm
  );


  const [
    showPreview,
    setShowPreview,
  ] = useState(false);


  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);


  const [
    strPreviewUrl,
    setStrPreviewUrl,
  ] = useState('');


  const [
    sipPreviewUrl,
    setSipPreviewUrl,
  ] = useState('');


  const [
    localAccounts,
    setLocalAccounts,
  ] = useState(
    () =>
      normalizeAccounts(
        data?.users
      )
  );


  const [
    documentUrls,
    setDocumentUrls,
  ] = useState({});


  const [
    showEditAccount,
    setShowEditAccount,
  ] = useState(false);


  const [
    editAccount,
    setEditAccount,
  ] = useState(null);


  const [
    editForm,
    setEditForm,
  ] = useState({
    name: '',
    email: '',
    role: '',
    nik: '',
    str: null,
    sip: null,
  });


  const [
    editStrPreviewUrl,
    setEditStrPreviewUrl,
  ] = useState('');


  const [
    editSipPreviewUrl,
    setEditSipPreviewUrl,
  ] = useState('');

  const editStrFileInputRef = useRef(null);
  const editSipFileInputRef = useRef(null);
  const [documentPreview, setDocumentPreview] = useState(null);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState('');
  const [isSavingDocument, setIsSavingDocument] = useState(false);

  useEffect(() => {
    if (!documentPreview?.file) {
      setDocumentPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(documentPreview.file);
    setDocumentPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [documentPreview]);


  const [
    isUpdating,
    setIsUpdating,
  ] = useState(false);

  const [resetAccount, setResetAccount] = useState(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [registrationDecision, setRegistrationDecision] = useState(null);
  const [registrationDecisionReason, setRegistrationDecisionReason] = useState('');
  const [registrationSearch, setRegistrationSearch] = useState('');
  const [registrationSort, setRegistrationSort] = useState('new');
  const [registrationDateFilter, setRegistrationDateFilter] = useState({ start: '', end: '' });
  const [registrationPage, setRegistrationPage] = useState(1);
  const [registrationHistoryPage, setRegistrationHistoryPage] = useState(1);
  const [showRegistrationHistory, setShowRegistrationHistory] = useState(false);
  const REGISTRATION_PAGE_SIZE = 10;
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  useEffect(() => {
    setLocalAccounts(
      normalizeAccounts(
        data?.users
      )
    );
  }, [
    data?.users,
  ]);

  useEffect(() => {
    let cancelled = false;
    let warned = false;
    /**
     * Memuat daftar permohonan verifikasi dari backend dan mengulang pemuatan setiap 30 detik. Kegagalan hanya diberitahukan satu kali selama komponen tetap aktif.
     */
    const load = () => api.accountRegistrations.list()
      .then((items) => { if (!cancelled) setRegistrationRequests(Array.isArray(items) ? items : []); })
      .catch((error) => { if (!cancelled && !warned) { warned = true; notify?.(error?.message || 'Daftar permohonan pendaftaran gagal dimuat.', 'warning'); } });
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  /**
   * Mengambil ulang permohonan pendaftaran setelah keputusan Admin agar tabel verifikasi menampilkan status terbaru.
   */
  const refreshRegistrationRequests = async () => {
    const items = await api.accountRegistrations.list();
    setRegistrationRequests(Array.isArray(items) ? items : []);
  };

  const pendingRegistrations = useMemo(() => {
    const keyword = registrationSearch.trim().toLowerCase();
    const rows = registrationRequests
      .filter((item) => item.status === 'pending')
      .filter((item) => !keyword || [item.name, item.email, item.nik].some((value) => String(value || '').toLowerCase().includes(keyword)))
      .filter((item) => registrationSort !== 'submitted' || matchesDateFilter(item.createdAt, 'custom', registrationDateFilter));
    return rows.sort((a, b) => {
      const nameA = String(a.name || a.username || '').toLowerCase();
      const nameB = String(b.name || b.username || '').toLowerCase();
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      if (registrationSort === 'az') return nameA.localeCompare(nameB, 'id', { sensitivity: 'base' });
      if (registrationSort === 'za') return nameB.localeCompare(nameA, 'id', { sensitivity: 'base' });
      if (registrationSort === 'old') return dateA - dateB;
      return dateB - dateA;
    });
  }, [registrationRequests, registrationSearch, registrationSort, registrationDateFilter]);

  const registrationTotalPages = Math.max(1, Math.ceil(pendingRegistrations.length / REGISTRATION_PAGE_SIZE));
  const paginatedPendingRegistrations = pendingRegistrations.slice((registrationPage - 1) * REGISTRATION_PAGE_SIZE, registrationPage * REGISTRATION_PAGE_SIZE);
  const processedRegistrations = useMemo(() => registrationRequests
    .filter((item) => ['approved', 'rejected'].includes(item.status))
    .sort((a, b) => new Date(b.reviewedAt || b.createdAt || 0).getTime() - new Date(a.reviewedAt || a.createdAt || 0).getTime()), [registrationRequests]);
  const registrationHistoryTotalPages = Math.max(1, Math.ceil(processedRegistrations.length / REGISTRATION_PAGE_SIZE));
  const paginatedProcessedRegistrations = processedRegistrations.slice((registrationHistoryPage - 1) * REGISTRATION_PAGE_SIZE, registrationHistoryPage * REGISTRATION_PAGE_SIZE);

  useEffect(() => { setRegistrationPage(1); }, [registrationSearch, registrationSort, registrationDateFilter]);
  useEffect(() => { setRegistrationPage((page) => Math.min(page, registrationTotalPages)); }, [registrationTotalPages]);
  useEffect(() => { setRegistrationHistoryPage((page) => Math.min(page, registrationHistoryTotalPages)); }, [registrationHistoryTotalPages]);

    /**
   * Mengirim keputusan setuju/tolak ke API, menampilkan hasil pengiriman email, lalu memuat ulang daftar verifikasi dan akun Admin.
   */
  const submitRegistrationDecision = async () => {
    if (!registrationDecision || isSubmittingDecision) return;
    const reason = registrationDecisionReason.trim();
    if (registrationDecision.action === 'reject' && !reason) {
      notify?.('Alasan penolakan wajib diisi.', 'warning');
      return;
    }
    setIsSubmittingDecision(true);
    try {
      const result = registrationDecision.action === 'approve'
        ? await api.accountRegistrations.approve(registrationDecision.request.id)
        : await api.accountRegistrations.reject(registrationDecision.request.id, reason);
      setRegistrationDecision(null);
      setRegistrationDecisionReason('');
      if (result?.emailSent === false) {
        notify?.(result?.message || 'Status permohonan diperbarui, tetapi email pemberitahuan gagal dikirim.', 'warning');
      } else {
        notify?.('Jika email terdaftar, pemberitahuan pendaftaran sudah dikirim. Periksa kotak masuk dan folder spam.', 'success');
      }
      await refreshRegistrationRequests().catch(() => null);
      await onReloadData?.().catch(() => null);
    } catch (error) {
      notify?.(error?.message || 'Permohonan tidak dapat diproses.', 'warning');
    } finally { setIsSubmittingDecision(false); }
  };


    /**
   * Memilih identifier baris akun dari id, dengan username sebagai fallback ketika id belum tersedia.
   */
  const getAccountKey =
    (account) =>
      account?.id ||
      account?.username ||
      '';


  const accounts =
    localAccounts;


  /* ===================================================
     DOCUMENT URL
  =================================================== */

    /**
   * Menyelesaikan sumber dokumen STR/SIP dari URL, data URL, atau fileId. Rute relatif diarahkan ke origin API agar file tetap dimuat dari backend.
   */
  const getDocumentUrl = (document) => {
    if (!document) return '';

    const rawUrl = typeof document === 'string'
      ? document
      : document.dataUrl || document.fileData || document.url || document.downloadURL || document.downloadUrl || document.href || '';

    if (rawUrl && /^(blob:|data:|https?:\/\/)/i.test(rawUrl)) return rawUrl;

    // API document URLs are returned as `/api/files/:id`; resolve them against
    // the backend origin rather than the Vite frontend origin.
    try {
      const apiUrl = new URL(api.baseUrl);
      if (rawUrl.startsWith('/api/')) return `${apiUrl.origin}${rawUrl}`;
      if (rawUrl.startsWith('/files/')) return `${apiUrl.origin}${apiUrl.pathname.replace(/\/api\/?$/, '')}${rawUrl}`;
      if (rawUrl.startsWith('/')) return `${apiUrl.origin}${rawUrl}`;
      if (rawUrl.startsWith('api/')) return `${apiUrl.origin}/${rawUrl}`;
    } catch {
      // Keep a legacy URL unchanged if the configured API URL is invalid.
    }

    if (!rawUrl && typeof document === 'object' && document.fileId) {
      return `${api.baseUrl}/files/${encodeURIComponent(document.fileId)}`;
    }
    return rawUrl || '';
  };

    /**
   * Mengambil berkas PDF terlindungi melalui API dan membuat Blob URL agar pratinjau dapat dibuka lintas-origin tanpa memakai URL localhost mentah.
   */
  const createStoredPdfUrl = async (document) => {
    if (!document) return '';

    const rawUrl = typeof document === 'string'
      ? document
      : document.url || document.downloadURL || document.downloadUrl || document.href || '';
    const fileIdFromUrl = String(rawUrl || '').match(/\/(?:api\/)?files\/([^/?#]+)/)?.[1];
    const fileId = (typeof document === 'object' && document.fileId) || fileIdFromUrl;

    // Fetch protected GridFS files with credentials and preview a local Blob URL.
    // This avoids embedding the API's localhost URL directly in the PDF iframe,
    // which browsers may refuse because frontend and backend use different ports.
    if (fileId) return api.files.createObjectUrl(fileId);

    return getDocumentUrl(document);
  };


  useEffect(() => {
    const nextUrls = {};
    for (const account of normalizeAccounts(data?.users)) {
      const accountKey = getAccountKey(account);
      if (!accountKey) continue;
      if (account.str) nextUrls[`${accountKey}:str`] = getDocumentUrl(account.str);
      if (account.sip) nextUrls[`${accountKey}:sip`] = getDocumentUrl(account.sip);
    }
    setDocumentUrls(nextUrls);
  }, [data?.users]);


  /* ===================================================
     FILTER ACCOUNT
  =================================================== */

  const filteredAccounts =
    useMemo(() => {
      const keyword =
        accountSearch
          .trim()
          .toLowerCase();

      return [
        ...accounts,
      ]
        .filter(
          (account) => {
            if (accountSort === 'date' && !matchesDateFilter(account?.createdAt, 'custom', accountDateFilter)) return false;
            if (!keyword) {
              return true;
            }

            const name =
              String(
                account?.username ||
                  account?.name ||
                  ''
              ).toLowerCase();

            return name.includes(
              keyword
            );
          }
        )
        .sort(
          (a, b) => {
            const nameA =
              String(
                a?.username ||
                  a?.name ||
                  ''
              ).trim();

            const nameB =
              String(
                b?.username ||
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
              accountSort
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

              case 'date':
                return accountDateFilter.start && accountDateFilter.end
                  ? dateA - dateB
                  : 0;

              default:
                return 0;
            }
          }
        );
    }, [
      accounts,
      accountSearch,
      accountSort,
      accountDateFilter,
    ]);


  const accountTotalPages =
    Math.max(
      1,
      Math.ceil(
        filteredAccounts.length /
          ACCOUNT_PAGE_SIZE
      )
    );


  const paginatedAccounts =
    filteredAccounts.slice(
      (
        accountPage -
        1
      ) *
        ACCOUNT_PAGE_SIZE,
      accountPage *
        ACCOUNT_PAGE_SIZE
    );


  useEffect(() => {
    setAccountPage(1);
  }, [
    accountSearch,
    accountSort,
    accountDateFilter,
  ]);


  useEffect(() => {
    setAccountPage(
      (page) =>
        Math.min(
          page,
          accountTotalPages
        )
    );
  }, [
    accountTotalPages,
  ]);


  /* ===================================================
     FILE
  =================================================== */

    /**
   * Memeriksa panjang email maksimal 254 karakter, ketiadaan spasi, dan kecocokan pola alamat email.
   */
  const isValidAccountEmail = (value) => {
    const email = String(value || '').trim();
    return email.length <= 254 && !/\s/.test(email) && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(email);
  };

    /**
   * Memastikan dokumen yang dipilih memiliki MIME type atau ekstensi PDF dan ukuran tidak melebihi 5 MB.
   */
  const isValidFile =
    (file) => {
      if (!file) {
        return false;
      }

      const isPdf =
        file.type ===
          'application/pdf' ||
        file.name
          ?.toLowerCase()
          .endsWith('.pdf');

      const maxSize =
        5 * 1024 * 1024;

      return (
        isPdf &&
        file.size <=
          maxSize
      );
    };


    /**
   * Menyiapkan dokumen baru atau referensi dokumen tersimpan untuk payload akun tanpa mengubah isi dokumen.
   */
  const prepareDocument = async (document) => {
    if (!document) return null;
    return document instanceof File ? document : document;
  };



  const isFormValid =
    form.name.trim() !== '' &&
    isValidAccountEmail(form.email) &&
    /^\d{16}$/.test(
      form.nik
    ) &&
    [
      'pharmacy',
      'doctor',
    ].includes(
      form.role
    ) &&
    isValidFile(
      form.str
    ) &&
    isValidFile(
      form.sip
    );


  /* ===================================================
     PREVIEW STR
  =================================================== */

  useEffect(() => {
    let objectUrl = '';

    /**
     * Membuat URL pratinjau STR/SIP dari file lokal atau berkas tersimpan. Object URL lokal dibersihkan saat sumber berubah atau komponen dilepas.
     */
    const loadPreview =
      async () => {
        if (!form.str) {
          setStrPreviewUrl(
            ''
          );
          return;
        }

        try {
          if (
            form.str instanceof
            File
          ) {
            objectUrl =
              URL.createObjectURL(
                form.str
              );
          } else {
            objectUrl =
              await createStoredPdfUrl(
                form.str
              );
          }

          setStrPreviewUrl(
            objectUrl || ''
          );
        } catch (
          error
        ) {
          console.error(
            'Gagal membuat preview STR:',
            error
          );

          setStrPreviewUrl(
            ''
          );
        }
      };

    loadPreview();

    return () => {
      if (
        objectUrl &&
        objectUrl.startsWith(
          'blob:'
        )
      ) {
        URL.revokeObjectURL(
          objectUrl
        );
      }
    };
  }, [
    form.str,
  ]);


  /* ===================================================
     PREVIEW SIP
  =================================================== */

  useEffect(() => {
    let objectUrl = '';

    /**
     * Membuat URL pratinjau STR/SIP dari file lokal atau berkas tersimpan. Object URL lokal dibersihkan saat sumber berubah atau komponen dilepas.
     */
    const loadPreview =
      async () => {
        if (!form.sip) {
          setSipPreviewUrl(
            ''
          );
          return;
        }

        try {
          if (
            form.sip instanceof
            File
          ) {
            objectUrl =
              URL.createObjectURL(
                form.sip
              );
          } else {
            objectUrl =
              await createStoredPdfUrl(
                form.sip
              );
          }

          setSipPreviewUrl(
            objectUrl || ''
          );
        } catch (
          error
        ) {
          console.error(
            'Gagal membuat preview SIP:',
            error
          );

          setSipPreviewUrl(
            ''
          );
        }
      };

    loadPreview();

    return () => {
      if (
        objectUrl &&
        objectUrl.startsWith(
          'blob:'
        )
      ) {
        URL.revokeObjectURL(
          objectUrl
        );
      }
    };
  }, [
    form.sip,
  ]);


  /* ===================================================
     EDIT DOCUMENT
  =================================================== */

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    const value = editForm.str;

    if (!value) {
      setEditStrPreviewUrl('');
      return undefined;
    }

    /**
     * Membuat URL pratinjau STR/SIP dari file lokal atau berkas tersimpan. Object URL lokal dibersihkan saat sumber berubah atau komponen dilepas.
     */
    const loadPreview = async () => {
      try {
        const url = value instanceof File
          ? URL.createObjectURL(value)
          : await createStoredPdfUrl(value);
        if (cancelled) {
          if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url || '';
        setEditStrPreviewUrl(objectUrl);
      } catch (error) {
        console.error('Gagal memuat preview STR akun:', error);
        if (!cancelled) setEditStrPreviewUrl('');
      }
    };

    loadPreview();
    return () => {
      cancelled = true;
      if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    };
  }, [editForm.str]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    const value = editForm.sip;

    if (!value) {
      setEditSipPreviewUrl('');
      return undefined;
    }

    /**
     * Membuat URL pratinjau STR/SIP dari file lokal atau berkas tersimpan. Object URL lokal dibersihkan saat sumber berubah atau komponen dilepas.
     */
    const loadPreview = async () => {
      try {
        const url = value instanceof File
          ? URL.createObjectURL(value)
          : await createStoredPdfUrl(value);
        if (cancelled) {
          if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url || '';
        setEditSipPreviewUrl(objectUrl);
      } catch (error) {
        console.error('Gagal memuat preview SIP akun:', error);
        if (!cancelled) setEditSipPreviewUrl('');
      }
    };

    loadPreview();
    return () => {
      cancelled = true;
      if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    };
  }, [editForm.sip]);


    /**
   * Memeriksa dokumen pada form edit. Referensi dokumen tersimpan dapat dipertahankan, sedangkan file pengganti harus PDF dan maksimal 5 MB.
   */
  const isValidEditDocument =
    (document) => {
      if (!document) {
        return false;
      }

      if (
        document instanceof File
      ) {
        return isValidFile(
          document
        );
      }

      if (
        typeof document ===
        'string'
      ) {
        return (
          document.trim() !== ''
        );
      }

      if (
        typeof document ===
        'object'
      ) {
        return Boolean(
          document.storageId ||
          document.dataUrl ||
          document.fileData ||
          document.url ||
          document.downloadURL ||
          document.downloadUrl ||
          document.href ||
          document.name
        );
      }

      return false;
    };


  const isEditFormValid =
    editForm.name.trim() !== '' &&
    (editAccount?.role === 'admin' && !String(editAccount?.email || '').trim() && !editForm.email.trim() ? true : isValidAccountEmail(editForm.email)) &&
    (editAccount?.role === 'admin'
      ? editForm.role === 'admin'
      : ['pharmacy', 'doctor'].includes(editForm.role)) &&
    (editAccount?.role === 'admin' && !String(editAccount?.nik || '').trim() && !editForm.nik.trim() ? true : /^\d{16}$/.test(editForm.nik)) &&
    (!editForm.str || isValidEditDocument(editForm.str)) &&
    (!editForm.sip || isValidEditDocument(editForm.sip));

  const hasEditChanges = useMemo(() => {
    if (!editAccount) return false;
    return editForm.name.trim() !== String(editAccount.username || editAccount.name || '').trim()
      || editForm.email.trim().toLowerCase() !== String(editAccount.email || '').trim().toLowerCase()
      || editForm.nik.trim() !== String(editAccount.nik || '').trim()
      || editForm.role !== String(editAccount.role || '');
  }, [editForm.name, editForm.email, editForm.nik, editForm.role, editAccount]);

  const editValidationMessage = useMemo(() => {
    if (!editForm.name.trim()) return 'Nama lengkap wajib diisi.';
    if (!(editAccount?.role === 'admin' && !String(editAccount?.email || '').trim() && !editForm.email.trim()) && !isValidAccountEmail(editForm.email)) return 'Masukkan alamat email yang valid.';
    if (editAccount?.role === 'admin' && editForm.role !== 'admin') return 'Hak akses Admin tidak dapat diubah.';
    if (editAccount?.role !== 'admin' && !['pharmacy', 'doctor'].includes(editForm.role)) return 'Hak akses tidak valid.';
    if (!(editAccount?.role === 'admin' && !String(editAccount?.nik || '').trim() && !editForm.nik.trim()) && !/^\d{16}$/.test(editForm.nik)) return 'NIK wajib diisi dengan tepat 16 digit.';
    if (editForm.str && !isValidEditDocument(editForm.str)) return 'STR harus berupa file PDF maksimal 5 MB.';
    if (editForm.sip && !isValidEditDocument(editForm.sip)) return 'SIP harus berupa file PDF maksimal 5 MB.';
    return '';
  }, [editForm, editAccount]);


  /* ===================================================
     ADD ACCOUNT
  =================================================== */

    /**
   * Memeriksa nama, peran, email, NIK 16 digit, serta dokumen STR/SIP sesuai peran sebelum menyiapkan pratinjau akun baru.
   */
  const submit =
    () => {
      if (
        !form.name.trim()
      ) {
        notify?.(
          'Nama lengkap wajib diisi.',
          'warning'
        );
        return;
      }

      if (!isValidAccountEmail(form.email)) {
        notify?.('Masukkan alamat email yang valid.', 'warning');
        return;
      }

      if (
        !/^\d{16}$/.test(
          form.nik
        )
      ) {
        notify?.(
          'NIK harus terdiri dari 16 digit angka.',
          'warning'
        );
        return;
      }

      if (
        ![
          'pharmacy',
          'doctor',
        ].includes(
          form.role
        )
      ) {
        notify?.(
          'Hak akses tidak valid.',
          'warning'
        );
        return;
      }

      if (
        !isValidFile(
          form.str
        )
      ) {
        notify?.(
          'STR wajib berupa PDF dan maksimal 5 MB.',
          'warning'
        );
        return;
      }

      if (
        !isValidFile(
          form.sip
        )
      ) {
        notify?.(
          'SIP wajib berupa PDF dan maksimal 5 MB.',
          'warning'
        );
        return;
      }

      setShowPreview(
        true
      );
    };


  /**
   * Menjalankan tindakan add akun setelah keputusan atau konfirmasi yang diperlukan diterima.
   */
  const confirmAddAccount =
    async () => {
      if (
        isSubmitting
      ) {
        return;
      }

      if (
        !isFormValid
      ) {
        notify?.(
          'Data akun belum lengkap atau tidak valid.',
          'warning'
        );
        return;
      }

      if (
        typeof onAddAccount !==
        'function'
      ) {
        notify?.(
          'Fungsi tambah akun belum tersedia.',
          'warning'
        );

        return;
      }

      setIsSubmitting(
        true
      );

      try {
        const str =
          await prepareDocument(
            form.str
          );

        const sip =
          await prepareDocument(
            form.sip
          );

        const accountData =
          {
            ...form,
            str,
            sip,
          };

        const result =
          await onAddAccount(
            accountData
          );

        if (
          result?.ok
        ) {
          notify?.(
            'Akun berhasil dibuat. Jika email terdaftar, pemberitahuan aktivasi sudah dikirim. Periksa kotak masuk dan folder spam.',
            'success'
          );

          setForm({
            ...emptyForm,
          });

          setShowPreview(
            false
          );
        } else {
          notify?.(
            result?.message ||
              'Gagal menambahkan akun.',
            'warning'
          );
        }
      } catch (
        error
      ) {
        console.error(
          'Error tambah akun:',
          error
        );

        notify?.(
          error?.message ||
            'Terjadi kesalahan saat menambahkan akun.',
          'warning'
        );
      } finally {
        setIsSubmitting(
          false
        );
      }
    };


  /* ===================================================
     EDIT ACCOUNT
  =================================================== */

  /**
   * Menyimpan atau memperbarui replacement dokumen dengan mengikuti validasi dan aturan bisnis pada modul.
   */
  const saveReplacementDocument = async () => {
    if (!editAccount || !documentPreview?.file || isSavingDocument) return;
    const field = documentPreview.type;
    const file = documentPreview.file;
    if (!['str', 'sip'].includes(field) || !isValidFile(file)) {
      notify?.(`${field?.toUpperCase() || 'Dokumen'} harus berupa PDF maksimal 5 MB.`, 'warning');
      return;
    }
    setIsSavingDocument(true);
    try {
      const originalUsername = editAccount.username || editAccount.name;
      const updatedAccount = {
        ...editAccount,
        username: originalUsername,
        role: editAccount.role,
        nik: editAccount.nik,
        [field]: file,
      };
      const result = await onChangeAccount?.(originalUsername, updatedAccount);
      if (result?.ok === false) {
        notify?.(result.message || `Gagal memperbarui file ${field.toUpperCase()}.`, 'warning');
        return;
      }
      const savedDocument = result?.user?.[field];
      const localDocument = savedDocument?.fileId
        ? { ...savedDocument, url: `${api.baseUrl}/files/${savedDocument.fileId}` }
        : file;
      setEditForm((current) => ({ ...current, [field]: localDocument }));
      setEditAccount((current) => current ? { ...current, [field]: localDocument } : current);
      notify?.(`File ${field.toUpperCase()} berhasil diperbarui.`, 'success');
      setDocumentPreview(null);
    } catch (error) {
      notify?.(error?.message || `Gagal memperbarui file ${field.toUpperCase()}.`, 'warning');
    } finally {
      setIsSavingDocument(false);
    }
  };


    /**
   * Mengisi field form dari akun terpilih dan membuka modal edit. Data akun belum dikirim ke backend sampai Admin menyimpan perubahan.
   */
  const openEditAccount =
    (account) => {
      setEditAccount(
        account
      );

      setEditForm({
        name:
          account?.username ||
          account?.name ||
          '',

        email: account?.email || '',

        role:
          account?.role ||
          '',

        nik:
          account?.nik ||
          '',

        str:
          account?.str ||
          null,

        sip:
          account?.sip ||
          null,
      });

      setShowEditAccount(
        true
      );
    };


  /**
   * Menyimpan atau memperbarui edited akun dengan mengikuti validasi dan aturan bisnis pada modul.
   */
  const saveEditedAccount =
    async () => {
      if (!editAccount) {
        notify?.(
          'Data akun tidak ditemukan.',
          'warning'
        );
        return;
      }

      if (!isEditFormValid) {
        notify?.(editValidationMessage || 'Pastikan semua data akun sudah lengkap dan valid.', 'warning');
        return;
      }
      if (!hasEditChanges) return;

      if (
        typeof onChangeAccount !==
        'function'
      ) {
        notify?.(
          'Fungsi ubah akun belum tersedia.',
          'warning'
        );
        return;
      }

      setIsUpdating(
        true
      );

      try {
        const str =
          await prepareDocument(
            editForm.str
          );

        const sip =
          await prepareDocument(
            editForm.sip
          );

        const updatedAccount = {
          ...editAccount,
          username: editForm.name.trim(),
          role: editForm.role,
          email: editForm.email.trim().toLowerCase(),
          nik: editForm.nik,
          str,
          sip,
        };

        const result =
          await onChangeAccount(
            editAccount.username,
            updatedAccount
          );

        if (
          result?.ok ===
          false
        ) {
          notify?.(
            result.message ||
              'Gagal memperbarui akun.',
            'warning'
          );

          return;
        }

        notify?.(
          'Data akun berhasil diperbarui.',
          'success'
        );

        setShowEditAccount(
          false
        );

        setEditAccount(
          null
        );
      } catch (
        error
      ) {
        console.error(
          'Error ubah akun:',
          error
        );

        notify?.(
          error?.message ||
            'Terjadi kesalahan saat memperbarui akun.',
          'warning'
        );
      } finally {
        setIsUpdating(
          false
        );
      }
    };






  return (
    <div className="workspace-stack account-management-page">

      {/* =================================================
          VERIFIKASI PENDAFTARAN AKUN
      ================================================= */}
      <Card>
        <div className="table-shell">
          <div className="section-head">
            <div>
              <h3>Verifikasi Akun</h3>
              <p>Periksa data pendaftar sebelum memberi keputusan.</p>
            </div>
            <Button type="button" variant="secondary" className="account-registration-history-button" onClick={() => { setRegistrationHistoryPage(1); setShowRegistrationHistory(true); }}>Riwayat</Button>
          </div>
          <div className="search-row account-registration-search">
            <Field label="Pencarian">
              <TextInput value={registrationSearch} onChange={(event) => setRegistrationSearch(event.target.value)} placeholder="Cari nama, email, atau NIK" debounceMs={250} />
            </Field>
            <DateFilterBar
              className="date-filter-inline"
              controlClassName="control control-compact"
              value={registrationSort}
              customValue="submitted"
              fallbackValue="new"
              dateLabel="Diajukan"
              options={[
                { value: 'az', label: 'A-Z' },
                { value: 'za', label: 'Z-A' },
                { value: 'new', label: 'Terbaru' },
                { value: 'old', label: 'Terlama' },
                { value: 'submitted', label: 'Diajukan' },
              ]}
              onChange={(nextValue) => {
                setRegistrationSort(nextValue);
                if (nextValue !== 'submitted') setRegistrationDateFilter({ start: '', end: '' });
              }}
              customDate={registrationDateFilter}
              onCustomDateChange={setRegistrationDateFilter}
            />
          </div>
          <div className="table-scroll account-table-scroll registration-table-scroll">
            <table className="data-table account-registration-table">
              <thead><tr><th>Nama Lengkap</th><th>Hak Akses</th><th>Email</th><th>NIK</th><th>STR</th><th>SIP</th><th>Diajukan</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {paginatedPendingRegistrations.length ? paginatedPendingRegistrations.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name || item.username || '-'}</td>
                    <td>{ROLE_LABELS[item.role] || item.role || '-'}</td>
                    <td>{item.email || '-'}</td>
                    <td><code>{item.nik || '-'}</code></td>
                    <td>{item.str ? <a href={getDocumentUrl(item.str)} target="_blank" rel="noopener noreferrer" className="document-link">Buka PDF</a> : '-'}</td>
                    <td>{item.sip ? <a href={getDocumentUrl(item.sip)} target="_blank" rel="noopener noreferrer" className="document-link">Buka PDF</a> : '-'}</td>
                    <td>{item.createdAt ? formatCalendarDate(item.createdAt) : '-'}</td>
                    <td><Badge tone="warning">Menunggu</Badge></td>
                    <td><div className="action-group account-registration-actions">
                      <Button size="sm" variant="secondary" onClick={() => { setRegistrationDecisionReason(''); setRegistrationDecision({ action: 'approve', request: item }); }} title="Setujui pendaftaran" aria-label="Setujui pendaftaran"><CheckCircle2 size={15} /><span className="sr-only">Setujui</span></Button>
                      <Button size="sm" variant="danger" onClick={() => { setRegistrationDecisionReason(''); setRegistrationDecision({ action: 'reject', request: item }); }} title="Tolak pendaftaran" aria-label="Tolak pendaftaran"><XCircle size={15} /><span className="sr-only">Tolak</span></Button>
                    </div></td>
                  </tr>
                )) : <tr><td colSpan="9"><div className="empty-table">{registrationSearch || registrationSort === 'submitted' ? 'Tidak ada permohonan yang sesuai dengan pencarian atau filter.' : 'Belum ada permohonan pembuatan akun yang menunggu verifikasi.'}</div></td></tr>}
              </tbody>
            </table>
          </div>
          {registrationTotalPages > 1 ? <div className="activity-pagination"><CompactPagination currentPage={registrationPage} totalPages={registrationTotalPages} onPageChange={setRegistrationPage} /></div> : null}
        </div>
      </Card>

      <Modal open={showRegistrationHistory} onClose={() => setShowRegistrationHistory(false)} size="xl" title={<div className="section-head medication-modal-head"><div><h3>Riwayat Verifikasi Akun</h3><p>Permohonan yang telah diproses.</p></div></div>}>
        <div className="account-preview-scroll registration-history-preview-scroll">
          <div className="account-preview">
            <div className="preview-section">
              <div className="table-shell registration-history-table-shell" style={{ width: '100%', overflowX: 'hidden' }}>
                <table className="data-table registration-history-table" style={{ width: '100%', minWidth: 0, tableLayout: 'fixed' }}>
                  <thead><tr><th>Nama Lengkap</th><th>Hak Akses</th><th>Email</th><th>NIK</th><th>STR</th><th>SIP</th><th>Diajukan</th><th>Status</th><th>Alasan</th></tr></thead>
                  <tbody>
                    {paginatedProcessedRegistrations.length ? paginatedProcessedRegistrations.map((item) => <tr key={item.id}>
                      <td>{item.name || item.username || '-'}</td><td>{ROLE_LABELS[item.role] || item.role || '-'}</td><td>{item.email || '-'}</td><td><code>{item.nik || '-'}</code></td>
                      <td>{item.str ? <a href={getDocumentUrl(item.str)} target="_blank" rel="noopener noreferrer" className="document-link">Buka PDF</a> : '-'}</td>
                      <td>{item.sip ? <a href={getDocumentUrl(item.sip)} target="_blank" rel="noopener noreferrer" className="document-link">Buka PDF</a> : '-'}</td>
                      <td>{item.createdAt ? formatCalendarDate(item.createdAt) : '-'}</td>
                      <td><Badge tone={item.status === 'approved' ? 'success' : 'danger'}>{item.status === 'approved' ? 'Disetujui' : 'Ditolak'}</Badge></td>
                      <td>{item.decisionReason || '-'}</td>
                    </tr>) : <tr><td colSpan="9"><div className="empty-table">Belum ada riwayat verifikasi akun.</div></td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            {registrationHistoryTotalPages > 1 ? <div className="activity-pagination"><CompactPagination currentPage={registrationHistoryPage} totalPages={registrationHistoryTotalPages} onPageChange={setRegistrationHistoryPage} /></div> : null}
          </div>
        </div>
      </Modal>

      <Card>

        <div className="section-head">

          <div>

            <h3>
              Tambah Akun
            </h3>

            <p>
              Buat akun Apoteker atau Dokter FKTP secara manual.
            </p>

          </div>

        </div>


        <div className="form-grid three-cols">

          <Field
            label="Nama Lengkap"
            required
          >
            <TextInput
              value={
                form.name
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  name:
                    e.target
                      .value,
                })
              }
              placeholder="Masukkan nama lengkap"
            />
          </Field>


          <Field
            label="Hak Akses"
            required
          >
            <SearchableSelect
              className="control control-compact"
              placeholder="Pilih hak akses"
              value={
                form.role
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  role:
                    e.target
                      .value,
                })
              }
            >
              <option value="">Pilih hak akses</option>
              <option value="pharmacy">
                Apoteker
              </option>

              <option value="doctor">
                Dokter FKTP
              </option>
            </SearchableSelect>
          </Field>


          <Field label="Email" required>
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="nama@domain.com"
              autoComplete="email"
            />
          </Field>

          <Field
            label="Nomor Induk Kependudukan (NIK)"
            required
          >
            <TextInput
              type="text"
              inputMode="numeric"
              maxLength={16}
              value={
                form.nik
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  nik:
                    e.target.value.replace(
                      /\D/g,
                      ''
                    ),
                })
              }
              placeholder="Masukkan 16 digit NIK"
            />
          </Field>


          <Field
            label="Surat Tanda Registrasi (STR)"
            required
          >
            <label className="file-control">

              <span
                className={
                  form.str
                    ? 'file-name active'
                    : 'file-name'
                }
              >
                {form.str
                  ? form.str.name
                  : 'Pilih file'}
              </span>

              <span className="file-button">
                Pilih
              </span>

              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const file =
                    e.target.files?.[0] ||
                    null;

                  if (
                    file &&
                    !isValidFile(
                      file
                    )
                  ) {
                    notify?.(
                      'STR harus berupa PDF dengan ukuran maksimal 5 MB.',
                      'warning'
                    );

                    e.target.value =
                      '';

                    return;
                  }

                  setForm({
                    ...form,
                    str: file,
                  });
                }}
              />

            </label>
          </Field>


          <Field
            label="Surat Izin Praktik (SIP)"
            required
          >
            <label className="file-control">

              <span
                className={
                  form.sip
                    ? 'file-name active'
                    : 'file-name'
                }
              >
                {form.sip
                  ? form.sip.name
                  : 'Pilih file'}
              </span>

              <span className="file-button">
                Pilih
              </span>

              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const file =
                    e.target.files?.[0] ||
                    null;

                  if (
                    file &&
                    !isValidFile(
                      file
                    )
                  ) {
                    notify?.(
                      'SIP harus berupa PDF dengan ukuran maksimal 5 MB.',
                      'warning'
                    );

                    e.target.value =
                      '';

                    return;
                  }

                  setForm({
                    ...form,
                    sip: file,
                  });
                }}
              />

            </label>
          </Field>



        </div>


        <Button
          className="add-account-btn"
          onClick={
            submit
          }
          disabled={
            isSubmitting
          }
        >
          <Plus size={16} />
          Tambah Akun
        </Button>

      </Card>


      {/* =================================================
          DAFTAR AKUN
      ================================================= */}

      <Card>

        <div className="table-shell">

          <div className="section-head">

            <div>

              <h3>
                Daftar Akun
              </h3>

              <p>
                Kelola akun pengguna.
              </p>

            </div>

          </div>


          <div className="search-row">

            <Field label="Pencarian">

              <TextInput
                value={
                  accountSearch
                }
                onChange={(e) =>
                  setAccountSearch(
                    e.target
                      .value
                  )
                }
                placeholder="Cari nama pengguna"
              debounceMs={400}
/>

            </Field>


<DateFilterBar
                className="date-filter-inline"
                controlClassName="control control-compact"
                value={accountSort}
                customValue="date"
                fallbackValue="az"
                options={[
                  { value: 'az', label: 'A-Z' },
                  { value: 'za', label: 'Z-A' },
                  { value: 'new', label: 'Terbaru' },
                  { value: 'old', label: 'Terlama' },
                  { value: 'date', label: 'Tanggal Dibuat' },
                ]}
                onChange={(nextValue) => {
                  setAccountSort(nextValue);
                  if (nextValue !== 'date') setAccountDateFilter({ start: '', end: '' });
                }}
                customDate={accountDateFilter}
                onCustomDateChange={setAccountDateFilter}
              />

          </div>


          <div className="table-scroll account-table-scroll">

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
                  Email
                </th>

                <th>
                  NIK
                </th>

                <th>
                  STR
                </th>

                <th>
                  SIP
                </th>

                <th>
                  Status
                </th>

                <th>
                  Tanggal Dibuat
                </th>

                <th>
                  Aksi
                </th>

              </tr>

            </thead>


            <tbody>

              {paginatedAccounts.length ? (
                paginatedAccounts.map(
                  (u) => {
                    const accountKey =
                      getAccountKey(
                        u
                      );

                    const strUrl =
                      documentUrls[
                        `${accountKey}:str`
                      ] ||
                      getDocumentUrl(
                        u.str
                      );

                    const sipUrl =
                      documentUrls[
                        `${accountKey}:sip`
                      ] ||
                      getDocumentUrl(
                        u.sip
                      );

                    return (
                      <tr
                        key={
                          accountKey
                        }
                      >

                        <td>
                          {
                            u.username ||
                            u.name ||
                            '-'
                          }
                        </td>


                        <td>
                          {
                            ROLE_LABELS[
                              u.role
                            ] ||
                            u.role ||
                            '-'
                          }
                        </td>

                        <td>{u.email || '-'}</td>




                        <td>
                          {/* NIK yang terisi mempertahankan gaya code; nilai kosong ditampilkan sebagai tanda biasa. */}
                          {String(u.nik || '').trim() ? (
                            <code>{u.nik}</code>
                          ) : (
                            '-'
                          )}
                        </td>


                        <td>
                          {strUrl ? (
                            <a
                              href={
                                strUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="document-link"
                            >
Buka PDF
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>


                        <td>
                          {sipUrl ? (
                            <a
                              href={
                                sipUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="document-link"
                            >
Buka PDF
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>


                        <td>
                          <Badge tone={u.activationPending ? 'warning' : u.active === false ? 'danger' : 'success'}>
                            {u.activationPending ? 'Menunggu' : u.active === false ? 'Nonaktif' : 'Aktif'}
                          </Badge>
                        </td>

                        <td>
                          {
                            u.createdAt
                              ? formatCalendarDate(u.createdAt)
                              : '-'
                          }
                        </td>


                        <td>

                          <div className="action-group">

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                openEditAccount(
                                  u
                                )
                              }
                              title="Ubah akun"
                              aria-label="Ubah akun"
                            >
                              <Pencil size={15} />
                              <span className="sr-only">Ubah Akun</span>
                            </Button>


                            {u.role !== 'admin' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="account-password-reset-action"
                                onClick={() => setResetAccount(u)}
                                title="Kirim reset"
                                aria-label="Kirim reset"
                              >
                                <KeyRound size={15} />
                                <span className="sr-only">Kirim reset</span>
                              </Button>
                            ) : null}


                            {u.role !== 'admin' ? (
                              <Button
                                size="sm"
                                variant={u.active === false ? 'secondary' : 'warning'}
                                onClick={() => onToggleAccountStatus?.(u)}
                                title={u.active === false ? 'Aktifkan akun' : 'Nonaktifkan akun'}
                                aria-label={u.active === false ? 'Aktifkan akun' : 'Nonaktifkan akun'}
                              >
                                <Power size={15} />
                                <span className="sr-only">{u.active === false ? 'Aktifkan' : 'Nonaktifkan'}</span>
                              </Button>
                            ) : null}

                            {u.role !==
                            'admin' ? (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() =>
                                  onDeleteAccount?.(
                                    u
                                  )
                                }
                                title="Hapus akun"
                                aria-label="Hapus akun"
                              >
                                <Trash2 size={15} />
                                <span className="sr-only">Hapus</span>
                              </Button>
                            ) : null}

                          </div>

                        </td>

                      </tr>
                    );
                  }
                )
              ) : (
                <tr>

                  <td
                    colSpan="9"
                  >
                    <div className="empty-table">
                      {accountSearch.trim()
                        ? 'Pengguna dengan nama tersebut tidak ditemukan.'
                        : 'Belum ada akun yang tersedia.'}
                    </div>
                  </td>

                </tr>
              )}

            </tbody>

          </table>

          </div>


          {accountTotalPages > 1 && (
            <div className="activity-pagination">

              <button
                type="button"
                className="pagination-btn"
                onClick={() =>
                  setAccountPage(
                    (page) =>
                      Math.max(
                        1,
                        page - 1
                      )
                  )
                }
                disabled={
                  accountPage ===
                  1
                }
              >
                Sebelumnya
              </button>


              <CompactPagination currentPage={accountPage} totalPages={accountTotalPages} onPageChange={setAccountPage} />


              <button
                type="button"
                className="pagination-btn"
                onClick={() =>
                  setAccountPage(
                    (page) =>
                      Math.min(
                        accountTotalPages,
                        page + 1
                      )
                  )
                }
                disabled={
                  accountPage ===
                  accountTotalPages
                }
              >
                Berikutnya
              </button>

            </div>
          )}

        </div>

      </Card>


      {/* =================================================
          MODAL PERIKSA DATA
      ================================================= */}

      <Modal
        open={
          showPreview
        }
        scrollable={false}
        title={
          <div className="section-head medication-modal-head">

            <div>

              <h3>
                Periksa Data
              </h3>

              <p>
                Pastikan semua data sudah benar sebelum akun dibuat.
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
      >

        <div className="account-review-scroll">
          <div className="document-split-layout account-review-layout">
            <div className="document-info-pane account-review-info-pane">
              <div className="preview-grid account-review-info-grid">
                <div className="preview-item">
                  <span>Nama Lengkap</span>
                  {form.name || '-'}
                </div>
                <div className="preview-item">
                  <span>Hak Akses</span>
                  {ROLE_LABELS[form.role] || '-'}
                </div>
                <div className="preview-item">
                  <span>Email</span>
                  {form.email || '-'}
                </div>
                <div className="preview-item">
                  <span>NIK</span>
                  {form.nik || '-'}
                </div>
              </div>
            </div>

            <div className="document-viewer-pane account-review-document-pane">
              <div className="preview-section">
                <div className="preview-document-head">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span>File STR</span>
                    <strong className="account-edit-document-name">{form.str?.name || 'Dokumen STR'}</strong>
                  </div>
                  {strPreviewUrl ? (
                    <a href={strPreviewUrl} target="_blank" rel="noopener noreferrer" className="preview-pdf-button">Buka PDF</a>
                  ) : null}
                </div>
                {strPreviewUrl ? (
                  <div className="document-preview account-review-pdf-preview">
                    <iframe src={getPdfPreviewUrl(strPreviewUrl)} title="Preview STR" />
                  </div>
                ) : (
                  <div className="document-empty account-review-pdf-empty">Preview file STR tidak tersedia.</div>
                )}
              </div>

              <div className="preview-section">
                <div className="preview-document-head">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span>File SIP</span>
                    <strong className="account-edit-document-name">{form.sip?.name || 'Dokumen SIP'}</strong>
                  </div>
                  {sipPreviewUrl ? (
                    <a href={sipPreviewUrl} target="_blank" rel="noopener noreferrer" className="preview-pdf-button">Buka PDF</a>
                  ) : null}
                </div>
                {sipPreviewUrl ? (
                  <div className="document-preview account-review-pdf-preview">
                    <iframe src={getPdfPreviewUrl(sipPreviewUrl)} title="Preview SIP" />
                  </div>
                ) : (
                  <div className="document-empty account-review-pdf-empty">Preview file SIP tidak tersedia.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="preview-actions account-review-actions">
          <Button type="button" onClick={confirmAddAccount} disabled={isSubmitting}>
            <Plus size={16} />
            {isSubmitting ? 'Menyimpan...' : 'Konfirmasi'}
          </Button>
        </div>
      </Modal>


      {/* =================================================
          MODAL UBAH AKUN
      ================================================= */}

      <Modal
        open={
          showEditAccount
        }
        scrollable={false}
        title={
          <div className="section-head medication-modal-head">

            <div>

              <h3>
                Ubah Akun
              </h3>

              <p>
                Perbarui data akun pengguna.
              </p>

            </div>

          </div>
        }
        onClose={() => {
          if (
            !isUpdating
          ) {
            setShowEditAccount(
              false
            );
          }
        }}

        size="xl"
      >

        <div className="account-preview-scroll account-edit-modal-scroll">
          <div className="account-preview">
            <div className="document-split-layout account-edit-document-layout">
              <div className="document-info-pane account-edit-info-pane">
                <div className="result-card account-edit-summary">
                  <strong>{editForm.name || '-'}</strong>
                  <div className="result-meta">
                    <span>{ROLE_LABELS[editForm.role] || '-'}</span>
                  </div>
                </div>

                <div className="account-edit-fields">
                  <Field label="Nama Lengkap" required>
                    <TextInput
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Masukkan nama lengkap"
                    />
                  </Field>

                  <Field label="Email" required>
                    <TextInput type="email" required value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="nama@domain.com" autoComplete="email" />
                  </Field>

                  <Field label="Hak Akses" required hint="Hak akses tidak dapat diubah setelah akun dibuat.">
                    <SearchableSelect
                      className="control control-compact"
                      wrapperClassName="account-role-locked"
                      value={editForm.role}
                      disabled
                    >
                      <option value={editForm.role}>{ROLE_LABELS[editForm.role] || '-'}</option>
                    </SearchableSelect>
                  </Field>

                  <Field label="Nomor Induk Kependudukan (NIK)" required>
                    <TextInput
                      type="text"
                      inputMode="numeric"
                      maxLength={16}
                      required
                      value={editForm.nik}
                      onChange={(e) => setEditForm({ ...editForm, nik: e.target.value.replace(/\D/g, '') })}
                      placeholder="Masukkan 16 digit NIK"
                    />
                  </Field>


                </div>

              </div>

              <div className="document-viewer-pane account-edit-pdf-pane">
                <div className="preview-section">
                  <div className="preview-document-head">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span>Surat Tanda Registrasi (STR)</span>
                      <strong className="account-edit-document-name">
                        {editForm.str?.name || editForm.str?.filename || 'Dokumen STR'}
                      </strong>
                    </div>
                    <div className="preview-document-actions">
                      <button
                        type="button"
                        className="preview-pdf-button preview-pdf-button-edit"
                        onClick={() => editStrFileInputRef.current?.click()}
                        disabled={isUpdating}
                      >
                        Ubah PDF
                      </button>
                      {editStrPreviewUrl ? (
                        <a href={editStrPreviewUrl} target="_blank" rel="noopener noreferrer" className="preview-pdf-button">
Buka PDF
                        </a>
                      ) : null}
                    </div>
                    <input
                      ref={editStrFileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="account-edit-hidden-file-input"
                      aria-label="Ubah file PDF STR"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        if (file && !isValidFile(file)) {
                          notify?.('STR harus berupa PDF dengan ukuran maksimal 5 MB.', 'warning');
                          event.target.value = '';
                          return;
                        }
                        if (file) setDocumentPreview({ type: 'str', file });
                        event.target.value = '';
                      }}
                    />
                  </div>
                  {editStrPreviewUrl ? (
                    <div className="document-preview account-edit-pdf-preview">
                      <iframe src={getPdfPreviewUrl(editStrPreviewUrl)} title="Preview STR" />
                    </div>
                  ) : (
                    <div className="document-empty account-edit-pdf-empty">Preview file STR tidak tersedia.</div>
                  )}
                </div>

                <div className="preview-section">
                  <div className="preview-document-head">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span>Surat Izin Praktik (SIP)</span>
                      <strong className="account-edit-document-name">
                        {editForm.sip?.name || editForm.sip?.filename || 'Dokumen SIP'}
                      </strong>
                    </div>
                    <div className="preview-document-actions">
                      <button
                        type="button"
                        className="preview-pdf-button preview-pdf-button-edit"
                        onClick={() => editSipFileInputRef.current?.click()}
                        disabled={isUpdating}
                      >
                        Ubah PDF
                      </button>
                      {editSipPreviewUrl ? (
                        <a href={editSipPreviewUrl} target="_blank" rel="noopener noreferrer" className="preview-pdf-button">
Buka PDF
                        </a>
                      ) : null}
                    </div>
                    <input
                      ref={editSipFileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="account-edit-hidden-file-input"
                      aria-label="Ubah file PDF SIP"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        if (file && !isValidFile(file)) {
                          notify?.('SIP harus berupa PDF dengan ukuran maksimal 5 MB.', 'warning');
                          event.target.value = '';
                          return;
                        }
                        if (file) setDocumentPreview({ type: 'sip', file });
                        event.target.value = '';
                      }}
                    />
                  </div>
                  {editSipPreviewUrl ? (
                    <div className="document-preview account-edit-pdf-preview">
                      <iframe src={getPdfPreviewUrl(editSipPreviewUrl)} title="Preview SIP" />
                    </div>
                  ) : (
                    <div className="document-empty account-edit-pdf-empty">Preview file SIP tidak tersedia.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="preview-actions account-edit-modal-actions">
          <Button type="button" onClick={saveEditedAccount} disabled={isUpdating || !isEditFormValid || !hasEditChanges}>
            <Save size={16} />
            {isUpdating ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(documentPreview)}
        scrollable={false}
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>Preview Buku</h3>
              <p>File {documentPreview?.type?.toUpperCase() || 'PDF'} yang akan diperbarui.</p>
            </div>
          </div>
        }
        onClose={() => {
          if (!isSavingDocument) setDocumentPreview(null);
        }}
        size="xl"
      >
        {documentPreview && documentPreviewUrl ? (
          <div className="account-preview-scroll">
            <div className="account-preview">
              <div className="preview-section">
                <div className="preview-document-head">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span>File {documentPreview.type.toUpperCase()}</span>
                    <strong>{documentPreview.file.name}</strong>
                  </div>
                  <a href={documentPreviewUrl} target="_blank" rel="noopener noreferrer" className="preview-pdf-button">
Buka PDF</a>
                </div>
                <div className="document-preview account-edit-pdf-preview">
                  <iframe src={getPdfPreviewUrl(documentPreviewUrl)} title={`Preview ${documentPreview.type.toUpperCase()} baru`} />
                </div>
                <div className="preview-actions">
                  <Button type="button" onClick={saveReplacementDocument} disabled={isSavingDocument}>
                    <Save size={16} />
                    {isSavingDocument ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(resetAccount)}
        className="account-reset-confirm-modal"
        title={
          <div className="section-head medication-modal-head account-reset-modal-title">
            <div>
              <h3>Kirim Reset Password</h3>
              <p>Konfirmasi pengiriman tautan ke email akun.</p>
            </div>
          </div>
        }
        onClose={() => { if (!isSendingReset) setResetAccount(null); }}
        size="md"
      >
        {resetAccount ? (
          <div className="stack account-reset-modal-content">
            <div className="result-card account-reset-summary">
              <strong>{resetAccount.username || resetAccount.name || '-'}</strong>
              <div className="result-meta">
                <span>{ROLE_LABELS[resetAccount.role] || resetAccount.role}</span>
                <span>{resetAccount.email || 'Email belum tersedia'}</span>
              </div>
            </div>
            <p>Sistem akan mengirim tautan reset password ke email akun yang dipilih setelah Anda menekan tombol Kirim. Tautan berlaku selama 15 menit dan hanya dapat digunakan satu kali.</p>
            {!resetAccount.email ? <div className="form-validation-hint" role="alert">Akun ini belum memiliki email. Perbarui data akun terlebih dahulu.</div> : null}
            <div className="preview-actions account-reset-modal-actions">
              <Button type="button" disabled={isSendingReset || !resetAccount.email} onClick={async () => {
                setIsSendingReset(true);
                try {
                  const result = await onRequestPasswordReset?.(resetAccount);
                  if (result?.ok) setResetAccount(null);
                } finally { setIsSendingReset(false); }
              }}>{isSendingReset ? 'Mengirim...' : 'Kirim'}</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(registrationDecision)}
        title={<div className="section-head medication-modal-head"><div><h3>{registrationDecision?.action === 'approve' ? 'Setujui Pendaftaran' : 'Tolak Pendaftaran'}</h3><p>Verifikasi permohonan pembuatan akun.</p></div></div>}
        onClose={() => { if (!isSubmittingDecision) { setRegistrationDecision(null); setRegistrationDecisionReason(''); } }}
        size="md"
      >
        {registrationDecision ? <div className="stack account-registration-decision">
          <div className="result-card account-reset-summary">
            <strong>{registrationDecision.request.name}</strong>
            <div className="result-meta"><span>{ROLE_LABELS[registrationDecision.request.role] || registrationDecision.request.role}</span><span>{registrationDecision.request.email}</span></div>
          </div>
          <p>{registrationDecision.action === 'approve' ? 'Jika disetujui, akun akan dibuat aktif dan dapat digunakan untuk login. Sistem akan mengirimkan email pemberitahuan kepada pendaftar.' : 'Jika ditolak, akun tidak akan dibuat dan sistem akan mengirimkan email pemberitahuan kepada pendaftar.'}</p>
          {registrationDecision.action === 'reject' ? (
            <Field
              label="Alasan"
              required
              hint="Maksimal 500 karakter. Alasan ini akan dicantumkan pada email pemberitahuan."
            >
              <textarea
                className="control control-textarea account-registration-reason-input"
                rows={4}
                maxLength={500}
                value={registrationDecisionReason}
                onChange={(event) => setRegistrationDecisionReason(event.target.value)}
                placeholder="Tuliskan alasan penolakan pendaftaran..."
                required
              />
            </Field>
          ) : null}
          <div className="preview-actions account-reset-modal-actions">
            <Button
              type="button"
              variant={registrationDecision.action === 'approve' ? 'primary' : 'danger'}
              onClick={submitRegistrationDecision}
              disabled={isSubmittingDecision || (registrationDecision.action === 'reject' && !registrationDecisionReason.trim())}
            >
              {isSubmittingDecision ? 'Memproses...' : registrationDecision.action === 'approve' ? 'Setujui' : 'Tolak'}
            </Button>
          </div>
        </div> : null}
      </Modal>

    </div>
  );
}


/* =====================================================
   ADMIN STOCK
===================================================== */
