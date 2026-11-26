/**
 * Mengelola formulir pembuatan resep, validasi isian, pilihan obat dan dosis, serta pengiriman resep.
 */
import { useEffect, useMemo, useState } from 'react';

import { Plus, Send, Pencil, Trash2, History } from 'lucide-react';

import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { TablePagination } from '../ui/TablePagination';
import { usePaginatedItems } from '../ui/usePaginatedItems';

import { Field, SearchableSelect, TextInput } from '../ui/Field';

import { Modal } from '../ui/Modal';
import { PrescriptionClinicalDetails } from './PrescriptionClinicalDetails';
import { api } from '../../lib/api';
import { calculateAgeFromDateOfBirth, formatDate } from '../../lib/date';
import { getPdfPreviewUrl } from '../../lib/pdfPreview';
import { isDoseOptionCompatible } from './doseOptionCompatibility';
import { capitalizeFirstLetter } from '../../lib/text';
import { getLatestPrescriptionForPatient } from '../../lib/prescriptions';
import { normalizeBpjs, normalizeNik } from '../../lib/patients';


const parseStoredDiagnosis = (value) => {
  const text = String(value || '').trim();
  if (!text) return [];
  // New ICD-10 selections are separated with semicolons because ICD display
  // names may themselves contain commas. Fall back to the legacy delimiter.
  const separator = text.includes(';') ? /\s*;\s*/ : /\s*,\s*/;
  return text.split(separator).map((item) => item.trim()).filter(Boolean);
};


const DEFAULT_DOSE_OPTIONS = [
  '1 kali sehari 1 tablet',
  '1 kali sehari 2 tablet',
  '2 kali sehari 1 tablet',
  '2 kali sehari 2 tablet',
  '3 kali sehari 1 tablet',
  '3 kali sehari 2 tablet',
  '4 kali sehari 1 tablet',
  '1 kali sehari 5 mL',
  '2 kali sehari 5 mL',
  '3 kali sehari 5 mL',
  '2 kali sehari 1 kapsul',
  '3 kali sehari 1 kapsul',
  '1 kali sehari 1 tetes',
  '2 kali sehari 1 tetes',
  '3 kali sehari 1 tetes',
];


const PRESCRIPTION_UNIT_OPTIONS = [
  'Botol',
  'Tube',
  'Tablet',
  'Kapsul',
  'Pen',
];


const SHAKE_LOCKED_UNITS = new Set([
  'Tube',
  'Tablet',
  'Kapsul',
]);


/**
 * Mengunci pilihan kocok untuk satuan Tube, Tablet, dan Kapsul sesuai aturan pada formulir resep.
 */
const isShakeLocked = (unit) =>
  SHAKE_LOCKED_UNITS.has(
    String(unit || '').trim()
  );


/*
 * =====================================================
 * KESESUAIAN SATUAN DENGAN ATURAN PAKAI
 * =====================================================
 *
 * Satuan resep adalah satuan sediaan/pengambilan.
 * Karena itu pilihan aturan pakai harus menggunakan
 * satuan dosis yang masuk akal untuk sediaan tersebut.
 */
/**
 * Menyeragamkan dosis unit agar pencarian, perbandingan, dan validasi menggunakan format yang konsisten.
 */
const normalizeDoseUnit = (unit) => String(unit || '').trim().toLowerCase().replace(/\s+/g, ' ');

/*
 * Perkiraan kebutuhan dihitung untuk satu siklus penebusan kronis (30 hari),
 * sama dengan interval jadwal penebusan yang digunakan sistem.
 */
const CHRONIC_PICKUP_INTERVAL_DAYS = 30;

/** Menghitung kebutuhan obat selama 30 hari hanya jika satuan dosis cocok dengan satuan jumlah. */
const getDoseBasedQuantityEstimate = (row) => {
  const instruction = String(row?.doseInstruction || row?.aturanPakai || '').trim();
  const match = instruction.match(/^([0-9]+(?:[.,][0-9]+)?)\s*kali\s+sehari\s+([0-9]+(?:[.,][0-9]+)?)\s*(.+)$/i);
  if (!match) return null;

  const frequency = Number(match[1].replace(',', '.'));
  const dose = Number(match[2].replace(',', '.'));
  const doseUnit = normalizeDoseUnit(match[3]).replace(/s$/, '');
  const quantityUnit = normalizeDoseUnit(row?.unit).replace(/s$/, '');
  const quantityInput = String(row?.qty ?? '').trim();
  const actualQuantity = Number(quantityInput);

  // Hindari membandingkan volume dosis (misalnya mL) dengan jumlah kemasan (misalnya botol).
  if (!doseUnit || !quantityUnit || doseUnit !== quantityUnit) return null;
  if (!quantityInput || !Number.isFinite(frequency) || !Number.isFinite(dose) || !Number.isFinite(actualQuantity)) return null;
  if (frequency <= 0 || dose <= 0 || actualQuantity < 0) return null;

  const expectedQuantity = frequency * dose * CHRONIC_PICKUP_INTERVAL_DAYS;
  if (Math.abs(expectedQuantity - actualQuantity) < 0.0001) return null;

  return {
    expectedQuantity,
    actualQuantity,
    unit: String(row?.unit || match[3]).trim(),
    medicine: String(row?.med || '').trim(),
  };
};

// Opsi khusus memakai metadata Satuan/Rute; preset bawaan dipetakan dari bentuk dosisnya.

/**
 * Menyeragamkan drug pilihan agar pencarian, perbandingan, dan validasi menggunakan format yang konsisten.
 */
const normalizeDrugOption = (
  item,
  fallbackName = ''
) => {
  if (typeof item === 'string') {
    return {
      name: item,
      value: item,
      medicationId: '',
      unit: '',
    };
  }

  const name = String(
    item?.name ||
      item?.med ||
      item?.medicineName ||
      item?.label ||
      fallbackName ||
      ''
  ).trim();

  return {
    ...item,
    name,
    value: String(item?.id || item?._id || item?.medicationId || fallbackName || ''),
    unit: String(
      item?.unit ||
        item?.satuan ||
        ''
    ).trim(),
    administrationRoute: String(item?.administrationRoute || item?.route || '').trim(),
  };
};


/**
 * Membuat struktur awal satu baris obat kosong dengan field yang dibutuhkan formulir resep.
 */
const blankRow = () => ({
  medicationId: '',
  med: '',
  qty: '',

  /*
   * Tetap dipertahankan secara internal
   * agar payload lama tidak rusak.
   * Tidak ditampilkan sebagai field terpisah
   * di Daftar Obat.
   */
  unit: '',

  duration: '1',
  durationUnit: 'Hari',

  doseInstruction: '',
  route: '',

  frequency: '',
  dose: '',
  doseUnit: '',

  shake: 'Tidak',
  notes: '',
});


/**
 * Merender komponen resep formulir dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function PrescriptionForm({
  data,
  stockMap,
  currentUser,
  requestDialog,
  onAddDoseOption,
  onRemoveDoseOption,
  onSubmitPrescription,
  onCheckInteractions,
  onReloadData,
  notify,
}) {
  const [patientName, setPatientName] =
    useState('');

  const [patientBpjs, setPatientBpjs] =
    useState('');

  const [patientPhone, setPatientPhone] = useState('');
  const [patientNik, setPatientNik] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientRegistrationCheck, setPatientRegistrationCheck] = useState({ key: '', status: 'idle' });
  const [selectedPatientMasterOverride, setSelectedPatientMasterOverride] = useState(null);
  const [isLoadingLastPrescription, setIsLoadingLastPrescription] = useState(false);
  const [fktpConfirmationOpen, setFktpConfirmationOpen] = useState(false);
  const [pendingFktpTransfer, setPendingFktpTransfer] = useState(null);
  const [isConfirmingFktpTransfer, setIsConfirmingFktpTransfer] = useState(false);
  const [latestSavedPrescription, setLatestSavedPrescription] = useState(null);
  const [identityChangeConfirmation, setIdentityChangeConfirmation] = useState(null);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [allergyStatus, setAllergyStatus] = useState('');
  const [allergyDetails, setAllergyDetails] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [waistCircumference, setWaistCircumference] = useState('');
  const [soap, setSoap] = useState({ subjective: '', objective: '', assessment: '', plan: '' });
  const [visitNumber, setVisitNumber] = useState('');

  const [patientType, setPatientType] =
    useState('Kronis');

  const [diagnosis, setDiagnosis] =
    useState([]);

  const [icd10Options, setIcd10Options] = useState([]);
  const [isLoadingIcd10Options, setIsLoadingIcd10Options] = useState(true);
  const [icd10LoadError, setIcd10LoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    import('../../data/icd10.json')
      .then((module) => {
        if (!isMounted) return;
        const list = Array.isArray(module.default) ? module.default : [];
        setIcd10Options(list);
      })
      .catch(() => {
        if (isMounted) setIcd10LoadError(true);
      })
      .finally(() => {
        if (isMounted) setIsLoadingIcd10Options(false);
      });
    return () => { isMounted = false; };
  }, []);

  const icd10SelectOptions = useMemo(
    () => icd10Options.map((item) => {
      const label = `${item.code} - ${item.display}`;
      return { value: label, label };
    }),
    [icd10Options],
  );

  const [rows, setRows] =
    useState([
      blankRow(),
    ]);

  const FORM_ROW_PAGE_SIZE = 10;
  const [medicationRowsPage, setMedicationRowsPage] = useState(1);
  const medicationRowsTotalPages = Math.max(1, Math.ceil(rows.length / FORM_ROW_PAGE_SIZE));
  const paginatedMedicationRowEntries = useMemo(
    () => rows.map((row, index) => ({ row, index })).slice((medicationRowsPage - 1) * FORM_ROW_PAGE_SIZE, medicationRowsPage * FORM_ROW_PAGE_SIZE),
    [rows, medicationRowsPage]
  );
  useEffect(() => {
    setMedicationRowsPage((page) => Math.min(page, medicationRowsTotalPages));
  }, [rows.length, medicationRowsTotalPages]);

  const previewMedicationRows = useMemo(
    () => rows.filter((row) => row.med && Number(row.qty) > 0),
    [rows]
  );
  const medicationQuantityWarnings = useMemo(
    () => rows
      .map((row) => getDoseBasedQuantityEstimate(row))
      .filter(Boolean),
    [rows]
  );
  const duplicateMedicationWarnings = useMemo(() => {
    const counts = new Map();

    rows.forEach((row) => {
      const medicineName = String(row?.med || '').trim().replace(/\s+/g, ' ');
      if (!medicineName) return;

      const key = String(row?.medicationId || medicineName.toLowerCase());
      const current = counts.get(key) || { name: medicineName, count: 0 };
      current.count += 1;
      counts.set(key, current);
    });

    return Array.from(counts.values()).filter((item) => item.count > 1);
  }, [rows]);
  const { currentPage: previewTablePage, setCurrentPage: setPreviewTablePage, totalPages: previewTableTotalPages, paginatedItems: paginatedPreviewRows } = usePaginatedItems(previewMedicationRows);

  const [preview, setPreview] =
    useState(false);
  const [summaryBookUrl, setSummaryBookUrl] = useState('');
  const [isLoadingSummaryBook, setIsLoadingSummaryBook] = useState(false);
  const [summaryBookError, setSummaryBookError] = useState('');

  const [
    manageDoseOptionsOpen,
    setManageDoseOptionsOpen,
  ] = useState(false);

  const [
    doseOptionFilter,
    setDoseOptionFilter,
  ] = useState('Semua');
  const [doseOptionRouteFilter, setDoseOptionRouteFilter] = useState('');

  const [doseOptions, setDoseOptions] = useState(() => (Array.isArray(data?.doseOptions) ? data.doseOptions : DEFAULT_DOSE_OPTIONS));

  const [
    newDoseOption,
    setNewDoseOption,
  ] = useState('');

  const [
    savingDoseOptions,
    setSavingDoseOptions,
  ] = useState(false);


  /*
   * =====================================================
   * OPSI ATURAN PAKAI SESUAI SATUAN
   * =====================================================
   */
    /**
   * Mengambil pilihan aturan pakai yang sesuai dengan satuan obat yang sedang dipilih.
   */
  const getCompatibleDoseOptions = (unit, route) => {
    return doseOptions.filter((option) =>
      isDoseOptionCompatible(unit, route, option, data?.doseOptionUnits, data?.doseOptionRoutes)
    );
  };


    /**
   * Menampilkan semua pilihan pada filter Semua atau menyaringnya berdasarkan kecocokan satuan.
   */
  const getDoseOptionsForFilter = (filter, route) => {
    return doseOptions.filter((option) =>
      isDoseOptionCompatible(filter === 'Semua' ? '' : filter, route, option, data?.doseOptionUnits, data?.doseOptionRoutes)
    );
  };

  const filteredDoseOptionRows = useMemo(
    () => getDoseOptionsForFilter(doseOptionFilter, doseOptionRouteFilter),
    [doseOptions, doseOptionFilter, doseOptionRouteFilter, data?.doseOptionUnits, data?.doseOptionRoutes]
  );
  const { currentPage: doseOptionPage, setCurrentPage: setDoseOptionPage, totalPages: doseOptionTotalPages, paginatedItems: paginatedDoseOptionRows } = usePaginatedItems(filteredDoseOptionRows);

    /**
   * Membuka pengelola opsi aturan pakai dengan filter awal yang disesuaikan dengan satuan obat pada baris resep.
   */
  const openDoseOptionsManager = (index) => {
    const unit = String(rows[index]?.unit || '').trim();
    const route = String(rows[index]?.route || '').trim();
    if (!unit || !route) {
      notify?.('Pilih obat terlebih dahulu agar aturan pakai dapat disesuaikan dengan satuan dan rute pemberiannya.', 'warning');
      return;
    }

    const matchedUnit = PRESCRIPTION_UNIT_OPTIONS.find(
      (candidate) => candidate.toLowerCase() === unit.toLowerCase()
    );
    setDoseOptionFilter(matchedUnit || unit);
    setDoseOptionRouteFilter(route);
    setManageDoseOptionsOpen(true);
  };


  /*
   * =====================================================
   * DAFTAR OBAT DARI STOK APOTEK
   * =====================================================
   *
   * Tidak menggunakan diagnosis untuk
   * membatasi pilihan obat.
   *
   * Dokter dapat memilih semua obat yang
   * tersedia pada stockMap.
   */
  const medicationOptions =
    useMemo(() => {
      const availableOptions = Object.entries(stockMap || {})
        .map(([key, item]) => normalizeDrugOption(item, key))
        .filter((item) => Boolean(String(item?.name || '').trim()));
      const optionIds = new Set(availableOptions.map((item) => String(item.value)));
      const previousPrescriptionOptions = [];
      rows.forEach((row) => {
        const medicationId = String(row?.medicationId || '');
        if (!medicationId || !row?.med || optionIds.has(medicationId)) return;
        optionIds.add(medicationId);
        previousPrescriptionOptions.push({
          name: `${String(row.med).trim()} (tidak tersedia pada stok aktif)`,
          value: medicationId,
          unit: String(row.unit || ''),
          unavailable: true,
        });
      });
      return [...availableOptions, ...previousPrescriptionOptions];
    }, [stockMap, rows]);


  const patientEntries = useMemo(() => Object.entries(data?.patients || {}), [data?.patients]);
  const selectedPatientChronicBook = useMemo(() => {
    const books = Object.entries(data?.chronicBooks || {});
    const selectedBpjs = normalizeBpjs(patientBpjs);
    const matches = books.filter(([id, book]) => {
      const bookPatientId = String(book?.patientId || id || '');
      const bookBpjs = normalizeBpjs(book?.bpjsNumber || book?.bpjs || '');
      return (selectedPatientId && bookPatientId === String(selectedPatientId))
        || (selectedBpjs && bookBpjs && selectedBpjs === bookBpjs);
    });
    matches.sort((a, b) => new Date(b[1]?.uploadedAt || 0).getTime() - new Date(a[1]?.uploadedAt || 0).getTime());
    return matches[0]?.[1] || null;
  }, [data?.chronicBooks, selectedPatientId, patientBpjs]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    const loadSummaryBook = async () => {
      setSummaryBookUrl('');
      setSummaryBookError('');
      if (!preview) {
        setIsLoadingSummaryBook(false);
        return;
      }
      if (!selectedPatientChronicBook) {
        setIsLoadingSummaryBook(false);
        setSummaryBookError('Buku Kronis pasien belum tersedia.');
        return;
      }
      if (selectedPatientChronicBook.fileId) {
        setIsLoadingSummaryBook(true);
        try {
          objectUrl = await api.files.createObjectUrl(selectedPatientChronicBook.fileId);
          if (!cancelled) setSummaryBookUrl(objectUrl);
          else URL.revokeObjectURL(objectUrl);
        } catch (error) {
          if (!cancelled) setSummaryBookError(error?.message || 'Dokumen Buku Kronis tidak dapat dibuka.');
        } finally {
          if (!cancelled) setIsLoadingSummaryBook(false);
        }
        return;
      }
      const directUrl = selectedPatientChronicBook.fileUrl || selectedPatientChronicBook.fileData || selectedPatientChronicBook.url || '';
      if (!cancelled) {
        setSummaryBookUrl(directUrl);
        if (!directUrl) setSummaryBookError('File PDF Buku Kronis tidak tersedia.');
        setIsLoadingSummaryBook(false);
      }
    };
    loadSummaryBook();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [preview, selectedPatientChronicBook]);

  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatientMasterOverride(null);
      return;
    }
    const master = data?.patients?.[selectedPatientId];
    if (master) setSelectedPatientMasterOverride(master);
  }, [data?.patients, selectedPatientId]);

  // Mencari pemilik identitas pasien pada data master, lalu pada snapshot resep
  // tersimpan jika identitas tersebut belum tercatat pada profil master.
  const getPatientIdentityMatch = (type, value, patients = data?.patients, prescriptions = data?.prescriptions) => {
    const normalized = type === 'bpjs' ? normalizeBpjs(value) : normalizeNik(value);
    if (!normalized) return null;

    const identityOf = (patient) => type === 'bpjs'
      ? normalizeBpjs(patient?.bpjsNumber || patient?.bpjs || '')
      : normalizeNik(patient?.nik || '');

    const directEntry = Object.entries(patients || {}).find(([, patient]) => identityOf(patient) === normalized);
    if (directEntry) {
      return { id: String(directEntry[0]), patient: directEntry[1] || {} };
    }

    const historicalMatch = (Array.isArray(prescriptions) ? prescriptions : [])
      .filter((item) => {
        const snapshot = item?.patientSnapshot || {};
        const savedValue = type === 'bpjs'
          ? normalizeBpjs(snapshot.bpjsNumber || item?.bpjsNumber || '')
          : normalizeNik(snapshot.nik || item?.nik || '');
        return savedValue === normalized && item?.patientId;
      })
      .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())[0];

    if (!historicalMatch?.patientId) return null;
    const patientId = String(historicalMatch.patientId);
    const master = patients?.[patientId] || {};
    const snapshot = historicalMatch.patientSnapshot || {};
    return {
      id: patientId,
      patient: {
        ...master,
        bpjsNumber: snapshot.bpjsNumber || historicalMatch.bpjsNumber || master.bpjsNumber || master.bpjs || '',
        nik: snapshot.nik || historicalMatch.nik || master.nik || '',
        name: snapshot.name || historicalMatch.patientName || master.name || '',
        phone: snapshot.phone || historicalMatch.patientPhone || master.phone || '',
        dateOfBirth: snapshot.dateOfBirth || master.dateOfBirth || null,
        gender: snapshot.gender || master.gender || '',
        address: snapshot.address || master.address || '',
        allergyStatus: historicalMatch.allergy?.status || master.allergyStatus || '',
        allergyDetails: historicalMatch.allergy?.details || master.allergyDetails || '',
      },
    };
  };

  const normalizeAllergyStatus = (value) => {
    const status = String(value || '').trim();
    if (status === 'Tidak ada alergi yang diketahui') return 'Tidak ada alergi';
    if (status === 'Belum diketahui/belum dikaji') return 'Belum diketahui';
    return status;
  };

  const currentAge = calculateAgeFromDateOfBirth(dateOfBirth);
  const normalizedPatientBpjs = normalizeBpjs(patientBpjs);
  const normalizedPatientNik = normalizeNik(patientNik);
  const currentPatientIdentityKey = `${normalizedPatientBpjs}|${normalizedPatientNik}`;
  const hasValidPatientIdentifier = /^\d{13}$/.test(normalizedPatientBpjs)
    || /^\d{16}$/.test(normalizedPatientNik);
  const hasInvalidEnteredPatientIdentifier = (Boolean(normalizedPatientBpjs) && !/^\d{13}$/.test(normalizedPatientBpjs))
    || (Boolean(normalizedPatientNik) && !/^\d{16}$/.test(normalizedPatientNik));
  const canCheckPatientRegistration = Boolean(hasValidPatientIdentifier && !hasInvalidEnteredPatientIdentifier);
  const isPatientRegistered = patientRegistrationCheck.key === currentPatientIdentityKey
    && patientRegistrationCheck.status === 'registered';
  const canLoadLastPrescription = Boolean(
    canCheckPatientRegistration
    && isPatientRegistered
    && !isLoadingLastPrescription
  );

  useEffect(() => {
    const identityKey = currentPatientIdentityKey;
    if (!canCheckPatientRegistration) {
      setPatientRegistrationCheck({ key: identityKey, status: 'idle' });
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setPatientRegistrationCheck({ key: identityKey, status: 'checking' });
      api.patients.checkRegistration({
        bpjsNumber: /^\d{13}$/.test(normalizedPatientBpjs) ? normalizedPatientBpjs : '',
        nik: /^\d{16}$/.test(normalizedPatientNik) ? normalizedPatientNik : '',
      })
        .then((result) => {
          if (!cancelled) {
            setPatientRegistrationCheck({ key: identityKey, status: result?.registered ? 'registered' : 'not_registered' });
          }
        })
        .catch(() => {
          if (!cancelled) setPatientRegistrationCheck({ key: identityKey, status: 'unavailable' });
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentPatientIdentityKey, canCheckPatientRegistration, normalizedPatientBpjs, normalizedPatientNik]);

  const clearPatientPrefillFields = () => {
    setPatientRegistrationCheck({ key: '', status: 'idle' });
    setPatientName('');
    setPatientPhone('');
    setDateOfBirth('');
    setGender('');
    setAddress('');
    setAllergyStatus('');
    setAllergyDetails('');
    setWeight('');
    setHeight('');
    setWaistCircumference('');
    setSoap({ subjective: '', objective: '', assessment: '', plan: '' });
    setDiagnosis([]);
    setRows([blankRow()]);
    setMedicationRowsPage(1);
  };

  const lookupPatientByIdentity = (type, value) => {
    const normalized = type === 'bpjs' ? normalizeBpjs(value) : normalizeNik(value);
    const isValid = type === 'bpjs' ? /^\d{13}$/.test(normalized) : /^\d{16}$/.test(normalized);
    if (!isValid) return;

    const identityMatch = getPatientIdentityMatch(type, normalized);
    const found = identityMatch
      ? patientEntries.find(([id]) => String(id) === String(identityMatch.id))
      : null;

    if (found) {
      const [id, patient] = found;
      const otherType = type === 'bpjs' ? 'nik' : 'bpjs';
      const otherValue = type === 'bpjs' ? normalizeNik(patientNik) : normalizeBpjs(patientBpjs);
      const otherMaster = type === 'bpjs' ? normalizeNik(patient?.nik) : normalizeBpjs(patient?.bpjsNumber || patient?.bpjs);
      const otherIdentityMatch = otherValue ? getPatientIdentityMatch(otherType, otherValue) : null;
      // Konflik tetap ditahan saat mengetik, tetapi notifikasinya baru ditampilkan
      // setelah dokter menekan tombol Buat Resep pada tahap validasi formulir.
      if ((otherValue && otherMaster && otherValue !== otherMaster)
        || (otherIdentityMatch && String(otherIdentityMatch.id) !== String(id))) {
        return;
      }
      // Pencarian identitas hanya menentukan pasien yang terdaftar dan ditugaskan kepada dokter ini.
      // Seluruh kotak input tetap kosong sampai dokter menekan tombol "Ambil Data Sebelumnya".
      setSelectedPatientId(String(id));
      setSelectedPatientMasterOverride(patient);
      setLatestSavedPrescription(null);
    } else {
      setSelectedPatientId('');
      setSelectedPatientMasterOverride(null);
      setLatestSavedPrescription(null);
    }
  };

  const applyLatestPrescriptionPrefill = (prefill) => {
    const patient = prefill?.patient || {};
    const last = prefill?.latestPrescription || null;
    const prescription = prefill?.prescription || null;

    if (!patient.id) {
      throw new Error('Data pasien tidak ditemukan.');
    }

    setSelectedPatientId(String(patient.id));
    setSelectedPatientMasterOverride(patient);
    setLatestSavedPrescription(last);
    setPatientBpjs(String(patient.bpjsNumber || ''));
    setPatientNik(String(patient.nik || ''));
    setPatientName(String(patient.name || '').trim());
    setPatientPhone(String(patient.phone || '').trim());
    setDateOfBirth(patient.dateOfBirth ? String(patient.dateOfBirth).slice(0, 10) : '');
    setGender(String(patient.gender || ''));
    setAddress(String(patient.address || ''));

    // Data klinis hanya diterapkan setelah backend mengizinkan akses berdasarkan penugasan FKTP.
    setAllergyStatus('');
    setAllergyDetails('');
    setWeight('');
    setHeight('');
    setWaistCircumference('');
    setSoap({ subjective: '', objective: '', assessment: '', plan: '' });
    setDiagnosis([]);
    setRows([blankRow()]);
    setMedicationRowsPage(1);

    if (prescription) {
      setAllergyStatus(normalizeAllergyStatus(prescription.allergy?.status || ''));
      setAllergyDetails(String(prescription.allergy?.details || ''));
      setWeight(prescription.anthropometry?.weight ?? '');
      setHeight(prescription.anthropometry?.height ?? '');
      setWaistCircumference(prescription.anthropometry?.waistCircumference ?? '');
      setSoap({
        subjective: String(prescription.soap?.subjective || ''),
        objective: String(prescription.soap?.objective || ''),
        assessment: String(prescription.soap?.assessment || ''),
        plan: String(prescription.soap?.plan || ''),
      });
      setDiagnosis(parseStoredDiagnosis(prescription.diagnosis));
      const restoredMedicationRows = (prescription.meds || []).map((med) => ({
        ...blankRow(),
        medicationId: String(med.medicationId || med._id || ''),
        med: String(med.med || med.medicationName || ''),
        qty: String(med.q ?? med.quantity ?? ''),
        unit: String(med.u || med.unit || ''),
        duration: String(med.dn || med.duration || 1),
        durationUnit: String(med.du || med.durationUnit || 'Hari'),
        doseInstruction: String(med.doseInstruction || med.aturanPakai || ''),
        frequency: String(med.frequency || ''),
        dose: String(med.dose || ''),
        doseUnit: String(med.doseUnit || ''),
        route: String(med.route || ''),
        shake: String(med.shake || 'Tidak'),
        notes: String(med.notes || med.catatanTambahan || ''),
      }));
      setRows(restoredMedicationRows.length ? restoredMedicationRows : [blankRow()]);
      notify?.('Data pasien dan seluruh rincian resep sebelumnya berhasil diambil. Periksa kembali data klinis dan obat, lalu masukkan No. Kunjungan untuk kunjungan saat ini.', 'success');
    } else {
      notify?.('Data pasien berhasil diambil. Pasien belum memiliki resep sebelumnya.', 'info');
    }

    // Nomor kunjungan tidak disalin karena setiap kunjungan harus menggunakan nomor baru.
    setVisitNumber('');
  };

  const getPrefillIdentity = () => ({
    bpjsNumber: /^\d{13}$/.test(normalizedPatientBpjs) ? normalizedPatientBpjs : '',
    nik: /^\d{16}$/.test(normalizedPatientNik) ? normalizedPatientNik : '',
  });

  const fillFromLatestPrescription = async () => {
    if (!canLoadLastPrescription || isLoadingLastPrescription) return;
    setIsLoadingLastPrescription(true);
    try {
      const identity = getPrefillIdentity();
      const prefill = await api.patients.getPrescriptionPrefill(identity);
      if (prefill?.confirmationRequired) {
        setPendingFktpTransfer(identity);
        setFktpConfirmationOpen(true);
        return;
      }
      applyLatestPrescriptionPrefill(prefill);
    } catch (error) {
      notify?.(error?.message || 'Data sebelumnya gagal diambil.', 'warning');
    } finally {
      setIsLoadingLastPrescription(false);
    }
  };

  const cancelFktpTransferConfirmation = () => {
    if (isConfirmingFktpTransfer) return;
    setFktpConfirmationOpen(false);
    setPendingFktpTransfer(null);
    notify?.('Pengambilan data sebelumnya dibatalkan. Data klinis tidak diakses.', 'info');
  };

  const confirmFktpTransfer = async () => {
    if (!pendingFktpTransfer || isConfirmingFktpTransfer) return;
    setIsConfirmingFktpTransfer(true);
    try {
      await api.patients.confirmFktpTransfer(pendingFktpTransfer);
      await onReloadData?.();
      const prefill = await api.patients.getPrescriptionPrefill(pendingFktpTransfer);
      if (prefill?.confirmationRequired) {
        throw new Error('Penugasan pasien belum dapat diperbarui. Periksa kembali informasi FKTP melalui Mobile JKN.');
      }
      applyLatestPrescriptionPrefill(prefill);
      setFktpConfirmationOpen(false);
      setPendingFktpTransfer(null);
      notify?.('Konfirmasi perpindahan FKTP berhasil dicatat. Penugasan pasien diperbarui dan data sebelumnya dapat digunakan.', 'success');
    } catch (error) {
      notify?.(error?.message || 'Konfirmasi perpindahan FKTP gagal diproses.', 'warning');
    } finally {
      setIsConfirmingFktpTransfer(false);
    }
  };



  useEffect(() => {
    if (Array.isArray(data?.doseOptions)) setDoseOptions(data.doseOptions);
  }, [data?.doseOptions]);

  /*
   * =====================================================
   * RESET FORM
   * =====================================================
   */
    /**
   * Mengembalikan seluruh state form resep ke nilai awal setelah form berhasil dikirim atau direset pengguna.
   */
  const reset = () => {
    setPatientName('');
    setPatientBpjs('');
    setPatientNik('');
    setPatientRegistrationCheck({ key: '', status: 'idle' });
    setSelectedPatientId('');
    setSelectedPatientMasterOverride(null);
    setPatientPhone('');
    setDateOfBirth('');
    setGender('');
    setAddress('');
    setAllergyStatus('');
    setAllergyDetails('');
    setWeight(''); setHeight(''); setWaistCircumference('');
    setSoap({ subjective: '', objective: '', assessment: '', plan: '' });
    setVisitNumber('');
    setPatientType('Kronis');
    setDiagnosis([]);
    setRows([
      blankRow(),
    ]);
    setPreview(false);
    setIdentityChangeConfirmation(null);
    setLatestSavedPrescription(null);
    setManageDoseOptionsOpen(
      false
    );
  };


  /*
   * =====================================================
   * UPDATE BARIS OBAT
   * =====================================================
   */
  /**
   * Menyimpan atau memperbarui row dengan mengikuti validasi dan aturan bisnis pada modul.
   */
  const updateRow = (
    index,
    patch
  ) => {
    setRows(
      (current) =>
        current.map(
          (
            row,
            rowIndex
          ) =>
            rowIndex === index
              ? {
                  ...row,
                  ...patch,
                }
              : row
        )
    );
  };


  /*
   * =====================================================
   * PASTIKAN ATURAN PAKAI SELALU SESUAI SATUAN
   * =====================================================
   */
  useEffect(() => {
    setRows((current) =>
      current.map((row) => {
        if (!row?.doseInstruction) {
          return row;
        }

        if (
          isDoseOptionCompatible(
            row.unit,
            row.route,
            row.doseInstruction,
            data?.doseOptionUnits,
            data?.doseOptionRoutes
          )
        ) {
          return row;
        }

        return {
          ...row,
          doseInstruction: '',
          frequency: '',
          dose: '',
          doseUnit: '',
        };
      })
    );
  }, [rows.map((row) => `${row.unit}|${row.route}|${row.doseInstruction}`).join('\u0001'), data?.doseOptionUnits, data?.doseOptionRoutes]);


  /**
   * Menghapus obat row dari data atau tampilan sesuai aturan akses dan validasi yang berlaku.
   */
  const removeMedicationRow = async (index) => {
    if (rows.length <= 1) return;
    const medicationName = rows[index]?.med || 'obat ini';
    const confirmed = await requestDialog?.({
      type: 'confirm',
      title: 'Hapus Obat dari Resep',
      message: `Yakin ingin menghapus obat ${medicationName} dari resep ini?`,
      confirmText: 'Hapus',
      cancelText: 'Batal',
      confirmVariant: 'danger',
      cancelVariant: 'ghost',
    });
    if (!confirmed) return;
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    notify?.('Obat berhasil dihapus dari resep.', 'success');
  };

  /*
   * =====================================================
   * PILIH / CARI OBAT
   * =====================================================
   */
  /**
   * Menangani aksi obat change dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleMedicationChange = (
    index,
    value
  ) => {
    const normalizedValue =
      String(
        value || ''
      );

    const selected =
      medicationOptions.find(
        (item) =>
          String(
            item?.value || ''
          ) ===
          normalizedValue
      );

    const rawUnit = String(selected?.unit || '').trim();
    const matchedUnit = PRESCRIPTION_UNIT_OPTIONS.find(
      (unit) => unit.toLowerCase() === rawUnit.toLowerCase(),
    );
    const nextUnit = matchedUnit || rawUnit || (normalizedValue ? 'Tablet' : '');
    const nextRoute = String(selected?.administrationRoute || '').trim();

    updateRow(
      index,
      {
        medicationId: selected?.value || '',
        med: selected?.name || '',
        unit: nextUnit,
        route: nextRoute,
        doseInstruction: '',
        frequency: '',
        dose: '',
        doseUnit: '',
        ...(isShakeLocked(nextUnit)
          ? { shake: 'Tidak' }
          : {}),
      }
    );
  };

  /*
   * =====================================================
   * PARSE OPSI DOSIS
   * =====================================================
   */
  /**
   * Membaca dan mengurai dosis instruction ke bentuk yang dapat diproses oleh modul.
   */
  const parseDoseInstruction = (
    instruction
  ) => {
    const text =
      String(
        instruction || ''
      ).trim();

    if (!text) {
      return {
        frequency: '',
        dose: '',
        doseUnit: '',
      };
    }

    const match =
      text.match(
        /^(\d+(?:[.,]\d+)?)\s*kali\s+sehari\s+(\d+(?:[.,]\d+)?)\s*(.+)$/i
      );

    if (!match) {
      return {
        frequency: '',
        dose: '',
        doseUnit: '',
      };
    }

    return {
      frequency:
        match[1],

      dose:
        match[2],

      doseUnit:
        match[3].trim(),
    };
  };


  /*
   * =====================================================
   * TERAPKAN DOSIS KE BARIS OBAT
   * =====================================================
   */
    /**
   * Menerapkan pilihan dosis ke baris obat yang sedang diedit dengan tetap menyelaraskan satuan dan instruksi dosis.
   */
  const applyDoseOption = (
    index,
    instruction
  ) => {
    const currentRow =
      rows[index] || {};

    if (
      instruction &&
      !isDoseOptionCompatible(
        currentRow.unit,
        currentRow.route,
        instruction,
        data?.doseOptionUnits,
        data?.doseOptionRoutes
      )
    ) {
      notify?.(
        `Aturan pakai tidak sesuai dengan satuan ${currentRow.unit} dan rute ${currentRow.route || 'obat'}.`,
        'warning'
      );

      return;
    }

    const parsed =
      parseDoseInstruction(
        instruction
      );

    updateRow(
      index,
      {
        doseInstruction:
          instruction,

        frequency:
          parsed.frequency,

        dose:
          parsed.dose,

        doseUnit:
          parsed.doseUnit,
      }
    );
  };


  /*
   * =====================================================
   * PAYLOAD RESEP
   * =====================================================
   */
    /**
   * Mengubah state form menjadi struktur request API yang berisi data pasien, diagnosis, dan daftar obat.
   */
  const payload = () => ({
    patientId: selectedPatientId || undefined,
    patientName:
      patientName.trim(),

    bpjsNumber:
      normalizeBpjs(
        patientBpjs
      ) || null,
    nik: normalizeNik(patientNik) || null,
    dateOfBirth: dateOfBirth || null,
    gender,
    address: address.trim(),
    allergy: { status: allergyStatus, details: allergyDetails.trim() },
    anthropometry: { weight: weight === '' ? null : Number(weight), height: height === '' ? null : Number(height), waistCircumference: waistCircumference === '' ? null : Number(waistCircumference) },
    soap,
    visitNumber: visitNumber.trim(),

    patientPhone:
      patientPhone.trim(),

    patientType,

    diagnosis: diagnosis.join('; '),

    meds:
      rows.map((row) => ({
        ...row,
        medicationId: String(row?.medicationId || ''),
        med:
          String(row?.med || '').trim(),
        qty:
          row?.qty ?? '',
        unit:
          row?.unit || 'Tablet',
        doseInstruction:
          String(
            row?.doseInstruction ||
            row?.aturanPakai ||
            ''
          ).trim(),
        aturanPakai:
          String(
            row?.doseInstruction ||
            row?.aturanPakai ||
            ''
          ).trim(),
        notes:
          String(
            row?.notes ||
            row?.catatanTambahan ||
            ''
          ).trim(),
        catatanTambahan:
          String(
            row?.notes ||
            row?.catatanTambahan ||
            ''
          ).trim(),
      })),

    createdBy:
      currentUser,
  });


  /*
   * =====================================================
   * VALIDASI
   * =====================================================
   */
const isPrescriptionValid =
  useMemo(() => {
    const validPatient =
      Boolean(
        patientName?.trim() &&
          patientPhone?.trim()
      );
    const validBpjs = /^\d{13}$/.test(normalizeBpjs(patientBpjs));
    const validNik = /^\d{16}$/.test(normalizeNik(patientNik));

    const validPatientType =
      patientType ===
      'Kronis';

    const validDiagnosis =
      diagnosis.length > 0;
    const validClinicalInfo = Boolean(
      String(dateOfBirth || '').trim()
      && currentAge !== ''
      && String(gender || '').trim()
      && String(address || '').trim()
      && Number.isFinite(Number(weight)) && Number(weight) > 0
      && Number.isFinite(Number(height)) && Number(height) > 0
      && Number.isFinite(Number(waistCircumference)) && Number(waistCircumference) > 0
      && String(soap?.subjective || '').trim()
      && String(soap?.objective || '').trim()
      && String(soap?.assessment || '').trim()
      && String(soap?.plan || '').trim()
    );

    const validMedication =
      rows.length > 0 &&
      rows.every(
        (row) => {
          const validMedicine =
            Boolean(
              String(
                row?.med || ''
              ).trim()
            );

          const validQuantity =
            Number(
              row?.qty
            ) > 0;

          const validUnit =
            Boolean(
              String(
                row?.unit || ''
              ).trim()
            );

          const validDoseInstruction =
            Boolean(
              String(
                row?.doseInstruction || ''
              ).trim()
            );

          return (
            validMedicine &&
            validQuantity &&
            validUnit &&
            validDoseInstruction
          );
        }
      );

    return Boolean(
      validPatient &&
        Boolean(String(visitNumber || '').trim()) &&
        Boolean(String(allergyStatus || '').trim()) &&
        validBpjs &&
        validNik &&
        validPatientType &&
        validClinicalInfo &&
        validDiagnosis &&
        validMedication
    );
  }, [
    patientName,
    patientPhone,
    allergyStatus,
    visitNumber,
    patientBpjs,
    patientNik,
    patientType,
    dateOfBirth,
    gender,
    address,
    weight,
    height,
    waistCircumference,
    soap,
    diagnosis,
    rows,
  ]);


/*
 * =====================================================
 * VALIDASI BERURUTAN
 * =====================================================
 */
/**
 * Memeriksa field wajib sesuai urutan tampil pada formulir, dari No. Kunjungan hingga Aturan Pakai.
 * Hanya kesalahan pertama yang dikembalikan agar notifikasi tidak melompati field yang lebih atas.
 */
const getFirstPrescriptionValidationError = (stage = 'all') => {
  // Tahap pertama mengikuti field paling atas pada formulir.
  if (stage !== 'identity' && stage !== 'patient' && !String(visitNumber || '').trim()) {
    return 'No. Kunjungan wajib diisi.';
  }
  if (stage === 'visit') return '';

  // Validasi identitas dilakukan setelah No. Kunjungan.
  if (stage !== 'patient') {
    if (!/^\d{13}$/.test(normalizeBpjs(patientBpjs))) {
      return 'No. BPJS/JKN/KIS harus terdiri dari 13 digit angka.';
    }
    if (!/^\d{16}$/.test(normalizeNik(patientNik))) {
      return 'NIK harus terdiri dari 16 digit angka.';
    }
    if (stage === 'identity') return '';
  }

  // Pemeriksaan berikutnya berjalan dari atas ke bawah sesuai urutan field formulir.
  if (!String(patientName || '').trim()) {
    return 'Nama pasien wajib diisi.';
  }

  const normalizedBirthDate = String(dateOfBirth || '').slice(0, 10);
  if (!normalizedBirthDate) {
    return 'Tanggal lahir wajib diisi.';
  }
  const dateParts = normalizedBirthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateParts) {
    return 'Tanggal lahir tidak valid. Periksa kembali tanggal yang dimasukkan.';
  }
  const [, yearText, monthText, dayText] = dateParts;
  const birthYear = Number(yearText);
  const birthMonth = Number(monthText);
  const birthDay = Number(dayText);
  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  if (birthDate.getFullYear() !== birthYear || birthDate.getMonth() !== birthMonth - 1 || birthDate.getDate() !== birthDay) {
    return 'Tanggal lahir tidak valid. Periksa kembali tanggal yang dimasukkan.';
  }
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (normalizedBirthDate > todayValue) {
    return 'Tanggal lahir tidak boleh melebihi tanggal hari ini.';
  }

  if (currentAge === '' || !Number.isFinite(Number(currentAge))) {
    return 'Usia wajib tersedia dan terisi otomatis dari tanggal lahir.';
  }
  if (!String(gender || '').trim()) {
    return 'Jenis kelamin wajib dipilih.';
  }
  if (!String(patientPhone || '').trim()) {
    return 'No. Telp wajib diisi.';
  }
  if (!String(address || '').trim()) {
    return 'Alamat wajib diisi.';
  }
  if (!String(allergyStatus || '').trim()) {
    return 'Status riwayat alergi wajib dipilih.';
  }

  if (!String(weight ?? '').trim() || !Number.isFinite(Number(weight)) || Number(weight) <= 0) {
    return 'Berat badan wajib diisi dengan angka lebih dari 0 kg.';
  }
  if (!String(height ?? '').trim() || !Number.isFinite(Number(height)) || Number(height) <= 0) {
    return 'Tinggi badan wajib diisi dengan angka lebih dari 0 cm.';
  }
  if (!String(waistCircumference ?? '').trim() || !Number.isFinite(Number(waistCircumference)) || Number(waistCircumference) <= 0) {
    return 'Lingkar perut wajib diisi dengan angka lebih dari 0 cm.';
  }

  if (!String(soap?.subjective || '').trim()) {
    return 'Subjective wajib diisi.';
  }
  if (!String(soap?.objective || '').trim()) {
    return 'Objective wajib diisi.';
  }
  if (!String(soap?.assessment || '').trim()) {
    return 'Assessment wajib diisi.';
  }
  if (!String(soap?.plan || '').trim()) {
    return 'Plan wajib diisi.';
  }

  if (!Array.isArray(diagnosis) || diagnosis.length === 0) {
    return 'Diagnosis wajib dipilih.';
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return 'Nama obat wajib dipilih.';
  }

  for (const row of rows) {
    if (!String(row?.med || '').trim()) {
      return 'Nama obat wajib dipilih untuk setiap obat.';
    }

    if (!String(row?.unit || '').trim()) {
      return 'Satuan obat wajib terisi untuk setiap obat.';
    }

    if (!String(row?.route || '').trim()) {
      return 'Rute pemberian obat belum terisi otomatis. Periksa data master obat pada halaman Stok Obat oleh Apoteker.';
    }

    if (!(Number(row?.qty) > 0)) {
      return 'Jumlah obat wajib diisi dengan angka lebih dari 0.';
    }

    if (!String(row?.doseInstruction || row?.aturanPakai || '').trim()) {
      return 'Aturan pakai wajib dipilih untuk setiap obat.';
    }
  }

  return '';
};


/*
 * =====================================================
 * BUKA RINGKASAN
 * =====================================================
 */
/**
 * Memeriksa kelengkapan field wajib sesuai urutan formulir sebelum membuka pratinjau resep.
 */
const openPreview = async (
  event
) => {
  event.preventDefault();

  const visitValidationError = getFirstPrescriptionValidationError('visit');
  if (visitValidationError) {
    notify?.(visitValidationError, 'warning');
    return;
  }

  const visitNumberValue = String(visitNumber || '').trim();
  try {
    const visitCheck = await api.prescriptions.checkVisitNumber(visitNumberValue);
    if (visitCheck?.exists) {
      notify?.('Resep tidak dapat dikirim karena No. Kunjungan yang sama sudah ada.', 'warning');
      return;
    }
  } catch (error) {
    notify?.(error?.message || 'No. Kunjungan belum dapat diperiksa. Periksa koneksi dan coba kembali.', 'warning');
    return;
  }

  let latest = latestSavedPrescription;
  let savedPrescriptions = Array.isArray(data?.prescriptions) ? data.prescriptions : [];
  let savedPatients = data?.patients || {};
  const [prescriptionResult, patientResult] = await Promise.allSettled([
    api.prescriptions.list(),
    api.patients.list(),
  ]);
  if (prescriptionResult.status === 'fulfilled' && Array.isArray(prescriptionResult.value)) {
    savedPrescriptions = prescriptionResult.value;
  }
  if (patientResult.status === 'fulfilled' && patientResult.value && typeof patientResult.value === 'object') {
    savedPatients = patientResult.value;
  }
  // Daftar yang tersedia dapat dipakai untuk mengisi data formulir, sedangkan
  // duplikasi No. Kunjungan sudah diperiksa secara menyeluruh melalui backend di atas.
  const identityValidationError = getFirstPrescriptionValidationError('identity');
  if (identityValidationError) {
    notify?.(identityValidationError, 'warning');
    return;
  }

  const bpjsMatch = getPatientIdentityMatch('bpjs', patientBpjs, savedPatients, savedPrescriptions);
  const nikMatch = getPatientIdentityMatch('nik', patientNik, savedPatients, savedPrescriptions);
  const bpjsValue = normalizeBpjs(patientBpjs);
  const nikValue = normalizeNik(patientNik);
  const identityMismatch = (bpjsMatch && normalizeNik(bpjsMatch.patient?.nik) && normalizeNik(bpjsMatch.patient?.nik) !== nikValue)
    || (nikMatch && normalizeBpjs(nikMatch.patient?.bpjsNumber || nikMatch.patient?.bpjs) && normalizeBpjs(nikMatch.patient?.bpjsNumber || nikMatch.patient?.bpjs) !== bpjsValue)
    || (bpjsMatch && nikMatch && String(bpjsMatch.id) !== String(nikMatch.id));

  if (identityMismatch) {
    notify?.('Nomor BPJS/JKN/KIS dan NIK yang dimasukkan tercatat pada data pasien yang berbeda. Periksa kembali kedua nomor tersebut agar sesuai dengan satu pasien yang sama.', 'warning');
    return;
  }

  const patientValidationError = getFirstPrescriptionValidationError('patient');
  if (patientValidationError) {
    notify?.(patientValidationError, 'warning');
    return;
  }

  if (!isPrescriptionValid) {
    notify?.('Lengkapi data resep', 'warning');
    return;
  }

  if (selectedPatientId) {
    latest = latest || getLatestPrescriptionForPatient(savedPrescriptions, selectedPatientId);
    setLatestSavedPrescription(latest);
  }

  if (latest && selectedPatientId) {
    const previous = latest.patientSnapshot || {};
    const currentValues = {
      bpjsNumber: normalizeBpjs(patientBpjs),
      nik: normalizeNik(patientNik),
      name: String(patientName || '').trim(),
      dateOfBirth: String(dateOfBirth || '').slice(0, 10),
      gender: String(gender || '').trim(),
      phone: String(patientPhone || '').trim(),
      address: String(address || '').trim(),
    };
    const previousValues = {
      bpjsNumber: normalizeBpjs(previous.bpjsNumber || latest.bpjsNumber || ''),
      nik: normalizeNik(previous.nik || latest.nik || ''),
      name: String(previous.name || latest.patientName || '').trim(),
      dateOfBirth: String(previous.dateOfBirth || '').slice(0, 10),
      gender: String(previous.gender || '').trim(),
      phone: String(previous.phone || latest.patientPhone || '').trim(),
      address: String(previous.address || '').trim(),
    };
    const identityFields = [
      ['bpjsNumber', 'No. BPJS/JKN/KIS'],
      ['nik', 'NIK'],
      ['name', 'Nama Pasien'],
      ['dateOfBirth', 'Tanggal Lahir'],
      ['gender', 'Jenis Kelamin'],
      ['phone', 'No. Telp'],
      ['address', 'Alamat'],
    ];
    const changedFields = identityFields
      .filter(([key]) => previousValues[key] !== currentValues[key])
      .map(([key, label]) => ({ key, label, before: previousValues[key], after: currentValues[key] }));

    if (changedFields.length) {
      setIdentityChangeConfirmation({
        prescription: latest,
        changes: changedFields,
      });
      return;
    }
  }

  setPreview(true);
};

  /*
   * =====================================================
   * SUBMIT RESEP
   * =====================================================
   */
    /**
   * Memeriksa kelengkapan identitas pasien, diagnosis, dan daftar obat sebelum meneruskan resep ke proses simpan.
   */
  const submit = async () => {
    const validationError = getFirstPrescriptionValidationError();
    if (validationError) {
      notify?.(validationError, 'warning');
      return;
    }

    if (!isPrescriptionValid) {
      notify?.(
        'Lengkapi data resep',
        'warning'
      );

      return;
    }

    const result =
      await onSubmitPrescription?.(
        payload()
      );

    if (result?.ok) {
      notify?.(
        'Resep berhasil dibuat dan masuk ke apotek.',
        'success'
      );

      reset();
    } else {
      notify?.(
        result?.message ||
          'Gagal membuat resep.',
        'warning'
      );
    }
  };


  /*
   * =====================================================
   * DOSIS - TAMBAH
   * =====================================================
   */
    /**
   * Menambahkan pilihan dosis baru beserta satuannya setelah validasi input.
   */
  const addDoseOption =
    async () => {
      const value =
        String(
          newDoseOption || ''
        ).trim();

      if (!value) {
        notify?.(
          'Aturan pakai belum diisi.',
          'warning'
        );
        return;
      }

      if (!doseOptionFilter || doseOptionFilter === 'Semua' || !doseOptionRouteFilter) {
        notify?.('Pilih obat terlebih dahulu agar aturan pakai tersimpan sesuai satuan dan rute pemberian obat.', 'warning');
        return;
      }

      const existingUnit = data?.doseOptionUnits?.[value.toLowerCase()];
      const existingRoute = data?.doseOptionRoutes?.[value.toLowerCase()];
      const exists = doseOptions.some(
        (item) => String(item).trim().toLowerCase() === value.toLowerCase()
      ) && String(existingUnit || '').trim().toLowerCase() === doseOptionFilter.toLowerCase()
        && String(existingRoute || '').trim().toLowerCase() === doseOptionRouteFilter.toLowerCase();

      if (exists) {
        notify?.(
          'Opsi dosis tersebut sudah ada.',
          'warning'
        );
        return;
      }

      setSavingDoseOptions(
        true
      );

      try {
        await onAddDoseOption?.(value, doseOptionFilter, doseOptionRouteFilter);
        setDoseOptions((current) => current.some((item) => String(item).trim().toLowerCase() === value.toLowerCase()) ? current : [...current, value]);
        setDoseOptionPage(1);
      } catch (error) {
        notify?.(error?.message || 'Gagal menambahkan opsi dosis.', 'warning');
        setSavingDoseOptions(false);
        return;
      }

      setNewDoseOption('');

      setSavingDoseOptions(
        false
      );

      notify?.(
        'Opsi dosis berhasil ditambahkan.',
        'success'
      );
    };


  /*
   * =====================================================
   * DOSIS - HAPUS
   * =====================================================
   */
  /**
   * Menghapus dosis pilihan dari data atau tampilan sesuai aturan akses dan validasi yang berlaku.
   */
  const removeDoseOption =
    async (
      value
    ) => {
      const confirmed = await requestDialog?.({
        type: 'confirm',
        title: 'Hapus Aturan Pakai',
        message: `Yakin ingin menghapus aturan pakai "${value}" dari daftar opsi?`,
        confirmText: 'Hapus',
        cancelText: 'Batal',
        confirmVariant: 'danger',
        cancelVariant: 'ghost',
      });
      if (!confirmed) return;
      try { await onRemoveDoseOption?.(value); } catch (error) { notify?.(error?.message || 'Gagal menghapus aturan pakai.', 'warning'); return; }
      setDoseOptions((current) => current.filter((item) => item !== value));
      const removedKey = String(value || '').trim().toLowerCase();
      setRows((current) => current.map((row) => (
        String(row?.doseInstruction || '').trim().toLowerCase() === removedKey
          ? { ...row, doseInstruction: '', frequency: '', dose: '', doseUnit: '' }
          : row
      )));
      notify?.('Aturan pakai berhasil dihapus.', 'success');
    };


  /*
   * =====================================================
   * DATA MODAL DOSIS
   * =====================================================
   */

  return (
    <div className="workspace-stack">

      <Card>

        {/* =================================================
            HEADER
        ================================================= */}
        <div className="section-head prescription-create-header">
          <div>
            <h3>
              Buat Resep
            </h3>

            <p>
              Buat resep untuk pasien.
            </p>
          </div>
          <Button type="button" variant="primary" className="prescription-last-data-button" onClick={fillFromLatestPrescription} disabled={!canLoadLastPrescription} title={
            !hasValidPatientIdentifier || hasInvalidEnteredPatientIdentifier
              ? 'Masukkan No. BPJS/JKN/KIS 13 digit atau NIK 16 digit'
              : patientRegistrationCheck.key !== currentPatientIdentityKey || patientRegistrationCheck.status === 'checking'
                ? 'Memeriksa pendaftaran pasien...'
                : patientRegistrationCheck.status === 'not_registered'
                  ? 'Pasien belum terdaftar.'
                  : patientRegistrationCheck.status === 'unavailable'
                    ? 'Status pendaftaran pasien belum dapat diperiksa.'
                    : 'Ambil data pasien dan resep sebelumnya'
          }>
            <History size={16} strokeWidth={2} aria-hidden="true" />
            {isLoadingLastPrescription ? 'Mengambil...' : 'Ambil Data Sebelumnya'}
          </Button>
        </div>


        <form
          className="prescription-create-form"
          onSubmit={
            openPreview
          }
        >

          <div className="form-section prescription-visit-section">
            <div className="result-card detail prescription-form-input-card">
              <div className="form-grid three-cols">
                <Field label="No. Kunjungan" required><TextInput value={visitNumber} onChange={(event) => setVisitNumber(event.target.value)} placeholder="Masukkan nomor kunjungan" /></Field>
              </div>
            </div>
          </div>

          {/* DATA PASIEN */}
          <div className="form-section">
            <div className="result-card detail prescription-form-input-card">
              <div className="form-grid three-cols">
              <Field className="patient-identity-fields" label="No. BPJS/JKN/KIS" required hint={
                isPatientRegistered
                  ? 'Pasien terdaftar.'
                  : patientRegistrationCheck.key === currentPatientIdentityKey && patientRegistrationCheck.status === 'not_registered'
                    ? 'Pasien belum terdaftar.'
                    : undefined
              }>
                <TextInput value={patientBpjs} onChange={(event) => { const value = event.target.value.replace(/\D/g, '').slice(0, 13); clearPatientPrefillFields(); setPatientBpjs(value); setSelectedPatientId(''); setSelectedPatientMasterOverride(null); setLatestSavedPrescription(null); if (value.length === 13) lookupPatientByIdentity('bpjs', value); }} inputMode="numeric" placeholder="Masukkan 13 digit nomor BPJS/JKN/KIS" maxLength={13} />
              </Field>
              <Field className="patient-identity-fields" label="NIK" required hint={
                isPatientRegistered ? 'Pasien terdaftar.' : undefined
              }>
                <TextInput value={patientNik} onChange={(event) => { const value = event.target.value.replace(/\D/g, '').slice(0, 16); clearPatientPrefillFields(); setPatientNik(value); setSelectedPatientId(''); setSelectedPatientMasterOverride(null); setLatestSavedPrescription(null); if (value.length === 16) lookupPatientByIdentity('nik', value); }} inputMode="numeric" placeholder="Masukkan 16 digit NIK" maxLength={16} />
              </Field>
              <Field className="patient-name-field" label="Nama Pasien" required>
                <TextInput value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="Masukkan nama pasien" />
              </Field>
              <Field label="Tanggal Lahir" required>
                <TextInput type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} placeholder="Pilih tanggal lahir" />
              </Field>
              <Field label="Usia" required>
                <TextInput value={currentAge === '' ? '' : `${currentAge} tahun`} readOnly disabled className="control auto-filled-control" placeholder="Usia akan terisi otomatis" />
              </Field>
              <Field label="Jenis Kelamin" required>
                <SearchableSelect value={gender} onChange={(event) => setGender(event.target.value)} placeholder="Pilih jenis kelamin" className="control control-compact">
                  <option value="">Pilih jenis kelamin</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option>
                </SearchableSelect>
              </Field>
              <Field label="No. Telp" required>
                <TextInput type="tel" inputMode="tel" value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} placeholder="Masukkan nomor telepon" />
              </Field>
              <Field label="Alamat" required>
                <TextInput value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Masukkan alamat lengkap pasien" />
              </Field>
              </div>
          </div>
          </div>

          <div className="form-section">
            <div className="result-card detail prescription-form-input-card">
              <div className="form-grid three-cols">
                <Field label="Riwayat Alergi" required>
                  <SearchableSelect value={allergyStatus} onChange={(event) => setAllergyStatus(event.target.value)} placeholder="Pilih status alergi" className="control control-compact">
                    <option value="">Pilih status alergi</option><option value="Ada alergi">Ada alergi</option><option value="Tidak ada alergi">Tidak ada alergi</option><option value="Belum diketahui">Belum diketahui</option>
                  </SearchableSelect>
                </Field>
                {allergyStatus === 'Ada alergi' ? <Field label="Detail Alergi"><TextInput value={allergyDetails} onChange={(event) => setAllergyDetails(event.target.value)} placeholder="Masukkan detail alergi" /></Field> : null}
                <Field label="Berat Badan (kg)" required><TextInput type="number" min="0" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="Masukkan berat badan" /></Field>
                <Field label="Tinggi Badan (cm)" required><TextInput type="number" min="0" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="Masukkan tinggi badan" /></Field>
                <Field label="Lingkar Perut (cm)" required><TextInput type="number" min="0" step="0.1" value={waistCircumference} onChange={(event) => setWaistCircumference(event.target.value)} placeholder="Masukkan lingkar perut" /></Field>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="result-card detail prescription-form-input-card">
              <div className="form-grid two-cols">
                <Field label="Subjective" required><textarea className="control" rows="3" value={soap.subjective} onChange={(event) => setSoap((current) => ({ ...current, subjective: event.target.value }))} placeholder="Masukkan keluhan pasien" /></Field>
                <Field label="Objective" required><textarea className="control" rows="3" value={soap.objective} onChange={(event) => setSoap((current) => ({ ...current, objective: event.target.value }))} placeholder="Masukkan hasil pemeriksaan" /></Field>
                <Field label="Assessment" required><textarea className="control" rows="3" value={soap.assessment} onChange={(event) => setSoap((current) => ({ ...current, assessment: event.target.value }))} placeholder="Masukkan assessment klinis" /></Field>
                <Field label="Plan" required><textarea className="control" rows="3" value={soap.plan} onChange={(event) => setSoap((current) => ({ ...current, plan: event.target.value }))} placeholder="Masukkan tindak lanjut" /></Field>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="result-card detail prescription-form-input-card">
              <Field label="Diagnosis" required>
                <div className="diagnosis-field-row">
                  <SearchableSelect
                    searchable
                    allowSpaceInput
                    multiple
                    maxOptions={100}
                    minSearchLength={2}
                    minSearchHint="Ketik minimal 2 karakter untuk mencari diagnosis ICD-10."
                    searchDebounceMs={400}
                    placeholder={isLoadingIcd10Options ? 'Memuat diagnosis ICD-10...' : 'Cari kode atau nama diagnosis ICD-10'}
                    className="control control-compact diagnosis-select"
                    value={diagnosis}
                    optionsData={icd10SelectOptions}
                    disabled={isLoadingIcd10Options || icd10Options.length === 0}
                    onChange={(event) => setDiagnosis(Array.isArray(event.target.value) ? event.target.value : [])}
                    style={{ width: '100%', minWidth: 0 }}
                  />
                </div>
                {icd10LoadError ? (
                  <span className="field-hint">Daftar ICD-10 gagal dimuat. Muat ulang halaman untuk mencoba kembali.</span>
                ) : null}
              </Field>
            </div>
          </div>

          <div className="form-section">

          {/* =================================================
              TAMBAH OBAT
          ================================================= */}
          <div
            className="add-account-btn"
          >
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setRows((current) => [...current, blankRow()]);
                setMedicationRowsPage(Math.ceil((rows.length + 1) / FORM_ROW_PAGE_SIZE));
              }}
            >
              <Plus
                size={
                  16
                }
              />
              Tambah Obat
            </Button>
          </div>


          {/* =================================================
              DAFTAR OBAT
          ================================================= */}
          <div className="stack prescription">

            {paginatedMedicationRowEntries.map(
              (
                { row, index }
              ) => (
                <div
                  className="result-card detail prescription-form-input-card"
                  key={index}
                >

                  {/* =================================================
                      BARIS 1: NAMA OBAT + SATUAN + RUTE
                  ================================================= */}
                  <div
                    className="form-grid three-cols"
                  >

                    {/* NAMA OBAT */}
                    <Field
                      label="Nama Obat"
                      required
                    >
                      <SearchableSelect
                        searchable
                        placeholder="Cari atau pilih nama obat"
                        className="control control-compact"
                        value={
                          row.medicationId || ''
                        }
                        onChange={(event) =>
                          handleMedicationChange(
                            index,
                            event.target.value
                          )
                        }
                      >
                        <option value="">
                          Pilih obat
                        </option>

                        {medicationOptions.map(
                          (item) => (
                            <option
                              key={
                                item.value
                              }
                              value={
                                item.value
                              }
                            >
                              {`${item.name} - ${item.unit || '-'} - ${item.distributor || '-'}`}
                            </option>
                          )
                        )}
                      </SearchableSelect>
                    </Field>


                    {/* SATUAN */}
                    <Field
                      label="Satuan"
                      required
                    >
                      <TextInput
                        className="control control-compact auto-filled-control"
                        value={row.unit || ''}
                        placeholder="Satuan akan terisi otomatis"
                        readOnly
                        disabled
                        aria-readonly="true"
                      />
                    </Field>


                    {/* RUTE PEMBERIAN */}
                    <Field label="Rute Pemberian" required>
                      <TextInput
                        className="control control-compact auto-filled-control"
                        value={row.route || ''}
                        placeholder="Rute pemberian akan terisi otomatis"
                        readOnly
                        disabled
                        aria-readonly="true"
                      />
                    </Field>


                  </div>


                  {/* =================================================
                      BARIS 2: JUMLAH + ATURAN PAKAI + CATATAN
                  ================================================= */}
                  <div
                    className="form-grid three-cols"
                    style={{
                      marginTop:
                        '12px',
                    }}
                  >

                    {/* JUMLAH */}
                    <Field
                      label="Jumlah"
                      required
                    >
                      <TextInput
                        type="number"
                        min="1"
                        step="1"
                        value={row.qty}
                        onChange={(event) =>
                          updateRow(index, { qty: event.target.value })
                        }
                        placeholder="Masukkan jumlah"
                      />
                    </Field>

                    {/* ATURAN PAKAI */}
                    <Field
                      label="Aturan Pakai"
                      required
                    >
                      <div
                        className="dose-field-row"
                        style={{
                          display:
                            'flex',
                          gap:
                            '8px',
                          alignItems:
                            'stretch',
                        }}
                      >
                        <SearchableSelect
                          searchable
                          allowSpaceInput
                          placeholder="Cari atau pilih aturan pakai"
                          className="control control-compact dose-select"
                          value={
                            row.doseInstruction ||
                            ''
                          }
                          onChange={(event) =>
                            applyDoseOption(
                              index,
                              event
                                .target
                                .value
                            )
                          }
                          style={{
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <option value="">
                            Pilih aturan dosis
                          </option>

                          {getCompatibleDoseOptions(
                            row.unit,
                            row.route
                          ).map(
                            (item) => (
                              <option
                                key={item}
                                value={item}
                              >
                                {item}
                              </option>
                            )
                          )}
                        </SearchableSelect>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            openDoseOptionsManager(
                              index
                            )
                          }
                          title="Ubah opsi aturan pakai"
                          className="dose-edit-btn"
                        >
                          <Pencil size={15} aria-hidden="true" />
                          <span>
                            Ubah
                          </span>
                        </Button>
                      </div>
                    </Field>

                    {/* CATATAN */}
                    <Field
                      label="Catatan"
                    >
                      <TextInput
                        value={
                          row.notes
                        }
                        onChange={(event) =>
                          updateRow(
                            index,
                            {
                              notes:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                        placeholder="Masukkan catatan (opsional)"
                      />
                    </Field>

                  </div>


                  {/* =================================================
                      HAPUS BARIS
                  ================================================= */}
                  {rows.length >
                  1 ? (
                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'flex-end',
                        marginTop:
                          '12px',
                      }}
                    >
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => removeMedicationRow(index)}
                      >
                        <Trash2
                          size={15}
                        />
                        Hapus
                      </Button>
                    </div>
                  ) : null}

                </div>
              )
            )}

          </div>

          {duplicateMedicationWarnings.length ? (
            <div className="warning-box prescription-duplicate-medication-warning" role="status">
              <strong>Periksa kembali nama obat.</strong>
              {duplicateMedicationWarnings.map((warning) => (
                <p key={warning.name}>
                  {warning.name}: Periksa kembali apakah obat ini memang perlu diresepkan lebih dari satu kali.
                </p>
              ))}
            </div>
          ) : null}

          {medicationQuantityWarnings.length ? (
            <div className="warning-box prescription-quantity-warning" role="status">
              <strong>Periksa kembali jumlah obat.</strong>
              {medicationQuantityWarnings.map((warning, index) => (
                <p key={`${warning.medicine}-${index}`}>
                  {warning.medicine ? `${warning.medicine}: ` : ''}
                  Perkiraan kebutuhan 30 hari adalah {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(warning.expectedQuantity)} {warning.unit}, sedangkan jumlah yang dimasukkan {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(warning.actualQuantity)} {warning.unit}.
                </p>
              ))}
            </div>
          ) : null}

          <TablePagination currentPage={medicationRowsPage} totalPages={medicationRowsTotalPages} onPageChange={setMedicationRowsPage} />
          </div>

          {/* =================================================
              SUBMIT
          ================================================= */}
          <div
            className="prescription-submit-area"
          >
            <div
              className="add-account-btn"
            >
              <Button
                type="submit"
              >
                <Plus
                  size={
                    16
                  }
                />
                Buat Resep
              </Button>
            </div>
          </div>

        </form>

      </Card>


      <Modal
        open={fktpConfirmationOpen}
        className="prescription-fktp-confirmation-modal"
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>Konfirmasi Perpindahan FKTP</h3>
              <p>Periksa informasi FKTP pasien sebelum mengambil data sebelumnya.</p>
            </div>
          </div>
        }
        onClose={cancelFktpTransferConfirmation}
        size="md"
      >
        <div className="stack prescription-fktp-confirmation">
          <p className="prescription-fktp-confirmation-message">Pasien masih tercatat ditugaskan kepada Dokter FKTP lain di REMS. Apakah Anda sudah memastikan melalui aplikasi Mobile JKN pasien bahwa pasien telah berpindah ke FKTP tempat Anda memberikan pelayanan?</p>
          <div className="prescription-fktp-confirmation-actions">
            <Button type="button" variant="primary" onClick={confirmFktpTransfer} disabled={isConfirmingFktpTransfer}>
              {isConfirmingFktpTransfer ? 'Memproses...' : 'Ya'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* =================================================
          MODAL UBAH ATURAN PAKAI
      ================================================= */}
      <Modal
        open={
          manageDoseOptionsOpen
        }
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>
                Ubah Aturan Pakai
              </h3>

              <p>
                Tambah atau hapus aturan pakai yang tersedia.
              </p>
            </div>
          </div>
        }
        onClose={() =>
          setManageDoseOptionsOpen(false)
        }
        size="md"
      >
        <div className="stack">

          <div className="dose-option-scope-note" role="note">
            Aturan pakai untuk {doseOptionFilter} {doseOptionRouteFilter}.
          </div>


          {/* TAMBAH ATURAN PAKAI */}
          <Field
            label="Aturan Pakai"
            className="option-add-field dose-option-add-field"
          >
            <div className="option-add-row dose-option-add-row"
            >
              <TextInput
                value={
                  newDoseOption
                }
                onChange={(event) =>
                  setNewDoseOption(
                    event.target.value
                  )
                }
                placeholder="Aturan Pakai"
              />

              <Button
                type="button"
                onClick={
                  addDoseOption
                }
                disabled={
                  savingDoseOptions
                }
              >
                <Plus size={15} />
                Tambah
              </Button>
            </div>
          </Field>

          {/* LIST ATURAN PAKAI */}
          <div className="stack">
            {paginatedDoseOptionRows.map(
              (item) => (
                <div
                  className="result-card"
                  key={item}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <span
                    style={{
                      minWidth: 0,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {item}
                  </span>

                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      removeDoseOption(item)
                    }
                    className="dose-option-delete-btn"
                  >
                    <Trash2 size={15} />
                    Hapus
                  </Button>
                </div>
              )
            )}

            {!filteredDoseOptionRows.length ? (
              <div
                className="empty-inline"
              >
                Belum ada aturan pakai untuk kombinasi satuan dan rute pemberian obat tersebut.
              </div>
            ) : null}
          </div>
          <TablePagination currentPage={doseOptionPage} totalPages={doseOptionTotalPages} onPageChange={setDoseOptionPage} />

        </div>
      </Modal>


      {/* =================================================
          MODAL KONFIRMASI KOREKSI IDENTITAS
      ================================================= */}
      <Modal
        open={Boolean(identityChangeConfirmation)}
        title={<div className="section-head medication-modal-head"><div><h3>Konfirmasi Koreksi Identitas</h3><p>Periksa perubahan data pasien sebelum melanjutkan pembuatan resep.</p></div></div>}
        onClose={() => setIdentityChangeConfirmation(null)}
        size="lg"
      >
        {identityChangeConfirmation ? (
          <div className="stack prescription-identity-change-confirmation">
            <div className="result-card detail">
              <div className="section-head tight">
                <div>
                  <h3>Resep Terakhir</h3>
                  <p>{formatDate(identityChangeConfirmation.prescription?.createdAt)}</p>
                </div>
              </div>
              <div className="preview-grid">
                {identityChangeConfirmation.changes.map((item) => (
                  <div className="preview-item" key={`before-${item.key}`}>
                    <span>{item.label}</span>
                    <strong>{item.before || '-'}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="result-card detail">
              <div className="section-head tight"><div><h3>Resep yang akan Dibuat</h3></div></div>
              <div className="preview-grid">
                {identityChangeConfirmation.changes.map((item) => (
                  <div className="preview-item" key={`after-${item.key}`}>
                    <span>{item.label}</span>
                    <strong>{item.after || '-'}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="preview-actions">
              <Button type="button" variant="ghost" onClick={() => setIdentityChangeConfirmation(null)}>Batal</Button>
              <Button type="button" variant="primary" onClick={() => { setIdentityChangeConfirmation(null); setPreview(true); }}>Lanjutkan Buat Resep</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* =================================================
          MODAL RINGKASAN RESEP
      ================================================= */}
      <Modal
        open={
          preview
        }
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>
                Detail Resep
              </h3>

              <p>
                Pastikan semua data sudah benar
                sebelum dikirim ke apotek.
              </p>
            </div>
          </div>
        }
        onClose={() =>
          setPreview(
            false
          )
        }
        size="xl"
      >
        <div className="account-preview prescription-create-summary-content">
          <div className="document-split-layout prescription-summary-layout prescription-create-summary-layout">
            <div className="document-info-pane prescription-summary-info-pane">
              <div className="preview-grid prescription-create-summary-grid">
                <div className="preview-item prescription-status-preview-item"><span>Status Resep</span><strong className="prescription-status-value"><Badge tone="warning">Menunggu</Badge></strong></div>
                <div className="preview-item"><span>ID Resep</span><strong>-</strong></div>
                <div className="preview-item"><span>Waktu/Tanggal Dibuat</span><strong>Setelah resep dikirim</strong></div>
                <div className="preview-item"><span>ID Transaksi</span><strong>-</strong></div>
                <div className="preview-item"><span>Waktu/Tanggal Ditebus</span><strong>-</strong></div>
                <div className="preview-item"><span>Jadwal Penebusan Berikutnya</span><strong>-</strong></div>
              </div>


            </div>

            <div className="document-viewer-pane prescription-summary-document-pane">
              <div className="preview-document-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span>BUKU KRONIS PASIEN</span>
                  <strong>{selectedPatientChronicBook?.fileName || 'Dokumen Buku Kronis'}</strong>
                </div>
                {summaryBookUrl ? <a href={summaryBookUrl} target="_blank" rel="noopener noreferrer" className="preview-pdf-button">Buka PDF</a> : null}
              </div>
              <div className="document-preview document-preview-large">
                {isLoadingSummaryBook ? <div className="document-empty">Membuka dokumen Buku Kronis...</div> : summaryBookUrl ? <iframe src={getPdfPreviewUrl(summaryBookUrl)} title="Preview Buku Kronis Pasien" /> : <div className="document-empty">{summaryBookError || 'Buku Kronis pasien belum tersedia.'}</div>}
              </div>
            </div>
          </div>

                        <PrescriptionClinicalDetails
                prescription={{
                  bpjsNumber: patientBpjs,
                  nik: patientNik,
                  patientName,
                  patientPhone,
                  patientSnapshot: {
                    name: patientName,
                    bpjsNumber: patientBpjs,
                    nik: patientNik,
                    phone: patientPhone,
                    dateOfBirth: dateOfBirth || null,
                    age: currentAge === '' ? null : currentAge,
                    gender,
                    address,
                  },
                  visitNumber,
                  allergy: { status: allergyStatus, details: allergyDetails },
                  anthropometry: {
                    weight: weight === '' ? null : Number(weight),
                    height: height === '' ? null : Number(height),
                    waistCircumference: waistCircumference === '' ? null : Number(waistCircumference),
                  },
                  soap,
                  diagnosis: diagnosis.join('; '),
                }}
                administrationTitle="Informasi Administrasi"
                administrationFirst
              />

          {/* =================================================
              DAFTAR OBAT
          ================================================= */}
          <div className="preview-section">

            <div
              className="table-shell prescription-create-summary-table-shell"
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
                    780,
                  tableLayout:
                    'auto',
                }}
              >

                <thead>
                  <tr>

                    <th
                      style={{
                        width:
                          '26%',
                      }}
                    >
                      Obat
                    </th>

                    <th
                      style={{
                        width:
                          '13%',
                      }}
                    >
                      Satuan
                    </th>

                    <th
                      style={{
                        width:
                          '13%',
                      }}
                    >
                      Jumlah
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
                          '20%',
                      }}
                    >
                      Catatan
                    </th>

                  </tr>
                </thead>


                <tbody>

                  {paginatedPreviewRows.map(
                      (
                        row,
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
                            {
                              row.med
                            }
                          </td>


                          <td>
                            {
                              capitalizeFirstLetter(
                                row.unit
                              )
                            }
                          </td>


                          <td>
                            {
                              row.qty
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
                              row.doseInstruction ||
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
                            {
                              String(row.notes ?? row.catatanTambahan ?? row.catatan ?? '').trim() || '-'
                            }
                          </td>

                        </tr>
                      )
                    )}

                </tbody>

              </table>

            </div>
            <TablePagination currentPage={previewTablePage} totalPages={previewTableTotalPages} onPageChange={setPreviewTablePage} />

          </div>


          {/* =================================================
              ACTION
          ================================================= */}
          <div className="preview-actions">

            <Button
              type="button"
              onClick={
                submit
              }
            >
              <Send
                size={
                  16
                }
              />
              Kirim Resep
            </Button>

          </div>

        </div>
      </Modal>

    </div>
  );
}
