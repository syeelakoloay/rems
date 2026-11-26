/**
 * Mengelola perubahan resep, termasuk obat, dosis, diagnosis, dan pemeriksaan sebelum disimpan.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { Plus, Pencil, Save, Trash2 } from 'lucide-react';

import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TablePagination } from '../ui/TablePagination';
import { usePaginatedItems } from '../ui/usePaginatedItems';

import { Field, SearchableSelect, TextInput } from '../ui/Field';

import { isDoseOptionCompatible } from './doseOptionCompatibility';
import { capitalizeFirstLetter } from '../../lib/text';
import icd10Data from '../../data/icd10.json';


/*
 * =================================================
 * OPSI SATUAN RESEP
 * =================================================
 */
const PRESCRIPTION_UNIT_OPTIONS = [
  'botol',
  'tube',
  'tablet',
  'kapsul',
  'pen',
];


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


/*
 * =================================================
 * BARIS OBAT BARU
 * =================================================
 */
/**
 * Membentuk satu baris obat untuk state editor dengan field yang seragam.
 */
const makeRow = () => ({
  medicationId: '',
  med: '',
  qty: '',
  unit: 'tablet',
  route: '',
  doseInstruction: '',
  notes: '',
});


/*
 * =================================================
 * SNAPSHOT PERUBAHAN FORM
 * =================================================
 */
/**
 * Menyeragamkan obat for comparison agar pencarian, perbandingan, dan validasi menggunakan format yang konsisten.
 */
const normalizeMedicineForComparison = (
  med
) => ({
  medicationId: String(med?.medicationId || med?._id || ''),
  med: String(
    med?.med || ''
  ).trim(),

  qty:
    Number(
      med?.qty ??
        med?.q ??
        0
    ) || 0,

  unit: String(
    med?.unit ||
      med?.u ||
      'tablet'
  ).trim(),

  doseInstruction: String(
    med?.doseInstruction ||
      med?.aturanPakai ||
      ''
  ).trim(),

  notes: String(
    med?.notes ||
      med?.catatanTambahan ||
      ''
  ).trim(),
});


/**
 * Membuat snapshot data resep sebelum diedit agar perubahan dapat dibandingkan dan keputusan simpan dibuat dengan konsisten.
 */
const makeEditSnapshot = (
  diagnosis,
  meds
) =>
  JSON.stringify({
    diagnosis: String(
      diagnosis || ''
    ).trim(),

    meds: Array.isArray(
      meds
    )
      ? meds.map(
          normalizeMedicineForComparison
        )
      : [],
  });


/*
 * =================================================
 * KOMPONEN
 * =================================================
 */
/**
 * Merender komponen resep edit modal dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function PrescriptionEditModal({
  prescription,
  open,
  onClose,
  onSave,
  stockMap,
  doseOptions: doseOptionsFromParent,
  doseOptionUnits: doseOptionUnitsFromParent = {},
  doseOptionRoutes: doseOptionRoutesFromParent = {},
  onAddDoseOption,
  onRemoveDoseOption,
  notify,
}) {

  /*
   * ============================
   * DATA YANG BOLEH DIUBAH
   * ============================
   */
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

  const initialEditSnapshotRef =
    useRef('');


  /*
   * ============================
   * MODAL OPSI ATURAN PAKAI
   * ============================
   */
  const [
    manageDoseOptionsOpen,
    setManageDoseOptionsOpen,
  ] = useState(false);

  const [
    doseOptionFilter,
    setDoseOptionFilter,
  ] = useState('Semua');
  const [doseOptionRouteFilter, setDoseOptionRouteFilter] = useState('');



  /*
   * ============================
   * OPSI ATURAN PAKAI
   * ============================
   */
  const [doseOptions, setDoseOptions] = useState(() => (Array.isArray(doseOptionsFromParent) ? doseOptionsFromParent : DEFAULT_DOSE_OPTIONS));


  const [
    newDoseOption,
    setNewDoseOption,
  ] = useState('');

  const [
    savingDoseOptions,
    setSavingDoseOptions,
  ] = useState(false);


  /*
   * ============================
   * STATUS RESEP
   * ============================
   *
   * Jika sudah ditebus, resep tidak
   * boleh diubah lagi.
   */
  const isPrescriptionPicked =
    prescription?.status === 'picked';


  /*
   * ============================
   * OPSI DIAGNOSIS UNTUK SELECT
   * ============================
   */
  const diagnosisSelectOptions = useMemo(() => {
    const options = (Array.isArray(icd10Data) ? icd10Data : []).map((item) => `${item.code} - ${item.display}`);
    const current = String(prescription?.diagnosis || '').trim();
    return current && !options.some((item) => item.toLowerCase() === current.toLowerCase())
      ? [current, ...options]
      : options;
  }, [prescription?.diagnosis]);

  /*
   * ============================
   * DAFTAR OBAT
   * ============================
   */
  const medicineOptions =
    useMemo(
      () =>
        Object.values(
          stockMap || {}
        ).filter(
          (
            item
          ) =>
            item?.name
        ),
      [
        stockMap,
      ]
    );



  useEffect(() => {
    if (Array.isArray(doseOptionsFromParent)) setDoseOptions(doseOptionsFromParent);
  }, [doseOptionsFromParent]);

  /*
   * =================================================
   * LOAD DATA RESEP
   * =================================================
   */
  useEffect(() => {

    if (
      !open ||
      !prescription
    ) {
      if (!open) {
        setEditDiagnosis('');
        setEditMeds([]);
        setEditMedsPage(1);

        setManageDoseOptionsOpen(
          false
        );

        setNewDoseOption('');

        setDoseOptionFilter(
          'Semua'
        );
        setDoseOptionRouteFilter('');

        initialEditSnapshotRef.current =
          '';
      }

      return;
    }


    /*
     * ============================
     * DIAGNOSIS
     * ============================
     */
    const prescriptionDiagnosis =
      String(
        prescription.diagnosis ||
          ''
      ).trim();


    const matchedDiagnosis =
      diagnosisSelectOptions.find(
        (
          item
        ) =>
          String(
            item
          )
            .trim()
            .toLowerCase() ===
          prescriptionDiagnosis
            .toLowerCase()
      );


    const loadedDiagnosis =
      matchedDiagnosis ||
      prescriptionDiagnosis ||
      '';


    setEditDiagnosis(
      loadedDiagnosis
    );


    /*
     * ============================
     * OBAT
     * ============================
     *
     * Aturan pakai yang tidak sesuai
     * dengan Satuan langsung dikosongkan.
     *
     * Dengan demikian misalnya:
     *
     * Tablet + 1 kali sehari 1 tablet
     *       ↓ ganti Tube
     * Tube + Pilih aturan pakai
     */
    const sourceMeds =
      Array.isArray(
        prescription.meds
      )
        ? prescription.meds
        : [];


    const loadedMeds =
      sourceMeds.length
        ? sourceMeds.map(
            (
              med
            ) => {

              const rawUnit = String(med?.u || med?.unit || 'tablet').trim();
              const unit = PRESCRIPTION_UNIT_OPTIONS.find((option) => option.toLowerCase() === rawUnit.toLowerCase()) || rawUnit || 'tablet';


              const doseInstruction =
                String(
                  med?.doseInstruction ||
                    med?.aturanPakai ||
                    ''
                ).trim();


              const route = String(med?.route || '');
              const compatibleDose =
                isDoseOptionCompatible(
                  unit,
                  route,
                  doseInstruction,
                  doseOptionUnitsFromParent,
                  doseOptionRoutesFromParent
                );


              return {
                medicationId: String(med?.medicationId || med?._id || ''),
                med:
                  String(
                    med?.med ||
                      ''
                  ).trim(),

                qty:
                  med?.q ??
                  med?.qty ??
                  '',

                unit,
                route,

                doseInstruction:
                  compatibleDose
                    ? doseInstruction
                    : '',

                notes:
                  String(
                    med?.notes ||
                      med?.catatanTambahan ||
                      ''
                  ).trim(),
              };
            }
          )
        : [
            makeRow(),
          ];


    setEditMeds(
      loadedMeds
    );
    setEditMedsPage(1);


    initialEditSnapshotRef.current =
      makeEditSnapshot(
        loadedDiagnosis,
        loadedMeds
      );

  }, [
    open,
    prescription,
    diagnosisSelectOptions,
  ]);


  /*
   * =================================================
   * UPDATE OBAT
   * =================================================
   *
   * PENTING:
   * Jika changes.unit berubah, cek Aturan Pakai
   * terhadap Satuan BARU.
   *
   * Contoh:
   *
   * Tablet
   *   1 kali sehari 1 tablet
   *
   * diganti menjadi:
   *
   * Tube
   *
   * maka:
   *   doseInstruction = ''
   *
   * sehingga select menampilkan:
   *   Pilih aturan pakai
   */
  /**
   * Menyimpan atau memperbarui obat dengan mengikuti validasi dan aturan bisnis pada modul.
   */
  const updateMedicine = (
    index,
    changes
  ) => {

    if (
      isPrescriptionPicked
    ) {
      return;
    }


    setEditMeds(
      (current) =>
        current.map(
          (
            item,
            itemIndex
          ) => {

            if (
              itemIndex !==
              index
            ) {
              return item;
            }


            const nextItem = {
              ...item,
              ...changes,
            };


            /*
             * ==========================================
             * VALIDASI ULANG ATURAN PAKAI SAAT SATUAN
             * BERUBAH
             * ==========================================
             */
            if (
              Object.prototype.hasOwnProperty.call(
                changes,
                'unit'
              )
            ) {

              const nextUnit =
                String(
                  changes.unit ||
                    ''
                ).trim();


              const currentDose =
                String(
                  item.doseInstruction ||
                    item.aturanPakai ||
                    ''
                ).trim();


              /*
               * Jika tidak ada Aturan Pakai
               * atau Aturan Pakai tidak sesuai
               * dengan Satuan baru, kosongkan.
               */
              if (
                !currentDose ||
                !isDoseOptionCompatible(
                  nextUnit,
                  nextItem.route,
                  currentDose,
                  doseOptionUnitsFromParent,
                  doseOptionRoutesFromParent
                )
              ) {
                nextItem.doseInstruction =
                  '';
              }

            }


            return nextItem;
          }
        )
    );

  };


  /*
   * =================================================
   * TAMBAH OBAT
   * =================================================
   */
    /**
   * Menambahkan baris obat baru ke resep yang sedang diedit menggunakan struktur baris standar.
   */
  const addMedicine = () => {

    if (
      isPrescriptionPicked
    ) {
      return;
    }


    setEditMeds(
      (current) => [
        ...current,
        makeRow(),
      ]
    );
    setEditMedsPage(Math.ceil((editMeds.length + 1) / EDIT_MEDS_PAGE_SIZE));

  };


  /*
   * =================================================
   * HAPUS OBAT
   * =================================================
   */
  /**
   * Menghapus obat dari data atau tampilan sesuai aturan akses dan validasi yang berlaku.
   */
  const removeMedicine = (
    index
  ) => {

    if (
      isPrescriptionPicked
    ) {
      return;
    }


    setEditMeds(
      (current) =>
        current.filter(
          (
            _,
            itemIndex
          ) =>
            itemIndex !==
            index
        )
    );

  };


  /*
   * =================================================
   * BUKA MODAL ATURAN PAKAI
   * =================================================
   */
    /**
   * Membuka pengelola aturan pakai dengan filter awal mengikuti satuan obat yang sedang diedit.
   */
  const openDoseOptionsManager = (
    index
  ) => {
    const unit = String(editMeds[index]?.unit || '').trim();
    const route = String(editMeds[index]?.route || '').trim();
    if (!unit || !route) {
      notify?.('Rute pemberian obat belum tersedia untuk obat ini. Periksa kembali data master obat.', 'warning');
      return;
    }

    const matchedUnit = PRESCRIPTION_UNIT_OPTIONS.find(
      (item) => item.toLowerCase() === unit.toLowerCase()
    );
    setDoseOptionFilter(matchedUnit || unit);
    setDoseOptionRouteFilter(route);
    setManageDoseOptionsOpen(true);
  };


  /*
   * =================================================
   * FILTER OPSI ATURAN PAKAI
   * =================================================
   */
    /**
   * Menampilkan seluruh opsi pada filter Semua atau hanya opsi yang kompatibel dengan satuan filter aktif.
   */
  const getDoseOptionsForFilter = (filter, route) => {
    return doseOptions.filter((option) =>
      isDoseOptionCompatible(
        filter === 'Semua' ? '' : filter,
        route,
        option,
        doseOptionUnitsFromParent,
        doseOptionRoutesFromParent
      )
    );
  };


  const filteredManageDoseOptions = useMemo(
    () => getDoseOptionsForFilter(doseOptionFilter, doseOptionRouteFilter),
    [doseOptions, doseOptionFilter, doseOptionRouteFilter, doseOptionUnitsFromParent, doseOptionRoutesFromParent],
  );
  const {
    currentPage: manageDoseOptionsPage,
    setCurrentPage: setManageDoseOptionsPage,
    totalPages: manageDoseOptionsTotalPages,
    paginatedItems: paginatedManageDoseOptions,
  } = usePaginatedItems(filteredManageDoseOptions);

  useEffect(() => {
    setManageDoseOptionsPage((page) => Math.min(Math.max(1, page), Math.max(1, Math.ceil(filteredManageDoseOptions.length / 10))));
  }, [filteredManageDoseOptions.length, setManageDoseOptionsPage]);


  /*
   * =================================================
   * ATURAN PAKAI SESUAI SATUAN OBAT
   * =================================================
   *
   * Perubahan penting:
   *
   * Aturan pakai tersimpan hanya boleh
   * dimunculkan kembali apabila kompatibel
   * dengan Satuan.
   *
   * Jadi apabila:
   *
   * unit = tube
   * doseInstruction = 1 kali sehari 1 tablet
   *
   * maka aturan tersebut TIDAK dimasukkan
   * kembali sebagai option.
   *
   * Hasil:
   *
   * <SearchableSelect value="">
   *
   * dengan:
   *
   * Pilih aturan pakai
   */
    /**
   * Menyaring pilihan aturan pakai sesuai satuan dan rute pemberian obat, serta mempertahankan instruksi tersimpan hanya bila masih kompatibel.
   */
  const getDoseOptionsForMedicine = (
    med
  ) => {

    const compatible =
      doseOptions.filter(
        (
          option
        ) =>
          isDoseOptionCompatible(
            med?.unit,
            med?.route,
            option,
            doseOptionUnitsFromParent,
            doseOptionRoutesFromParent
          )
      );


    const currentInstruction =
      String(
        med?.doseInstruction ||
          med?.aturanPakai ||
          ''
      ).trim();


    /*
     * Pertahankan aturan pakai lama
     * hanya jika masih kompatibel.
     *
     * Ini berguna untuk data lama yang
     * memiliki aturan khusus dan sudah
     * tersimpan di resep tetapi belum
     * ada di daftar opsi tersimpan di sistem.
     */
    if (
      currentInstruction &&
      isDoseOptionCompatible(
        med?.unit,
        med?.route,
        currentInstruction,
        doseOptionUnitsFromParent,
        doseOptionRoutesFromParent
      ) &&
      !compatible.some(
        (
          option
        ) =>
          String(
            option
          )
            .toLowerCase() ===
          currentInstruction
            .toLowerCase()
      )
    ) {

      return [
        currentInstruction,
        ...compatible,
      ];

    }


    /*
     * Jika tidak ada opsi yang kompatibel,
     * array kosong dikembalikan.
     *
     * Select tetap menampilkan option:
     * "Pilih aturan pakai"
     */
    return compatible;
  };


  /*
   * =================================================
   * ATURAN PAKAI - TAMBAH
   * =================================================
   */
    /**
   * Menambahkan aturan dosis baru beserta satuannya ke daftar pilihan setelah validasi.
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
        notify?.('Rute pemberian obat belum tersedia. Pilih obat dengan data rute yang lengkap.', 'warning');
        return;
      }


      const existingUnit = doseOptionUnitsFromParent?.[value.toLowerCase()];
      const existingRoute = doseOptionRoutesFromParent?.[value.toLowerCase()];
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
        setManageDoseOptionsPage(1);
      } catch (error) {
        notify?.(error?.message || 'Gagal menambahkan opsi dosis.', 'warning');
        setSavingDoseOptions(false);
        return;
      }


      setNewDoseOption(
        ''
      );


      setSavingDoseOptions(
        false
      );


      notify?.(
        'Opsi dosis berhasil ditambahkan.',
        'success'
      );

    };


  /*
   * =================================================
   * ATURAN PAKAI - HAPUS
   * =================================================
   */
  /**
   * Menghapus dosis pilihan dari data atau tampilan sesuai aturan akses dan validasi yang berlaku.
   */
  const removeDoseOption =
    async (
      value
    ) => {

      try { await onRemoveDoseOption?.(value); } catch (error) { notify?.(error?.message || 'Gagal menghapus opsi dosis.', 'warning'); return; }
      setDoseOptions((current) => current.filter((item) => item !== value));
      const removedKey = String(value || '').trim().toLowerCase();
      setEditMeds((current) => current.map((med) => (
        String(med?.doseInstruction || med?.aturanPakai || '').trim().toLowerCase() === removedKey
          ? { ...med, doseInstruction: '', aturanPakai: '' }
          : med
      )));

    };


  /*
   * =================================================
   * VALIDASI OBAT
   * =================================================
   */
  const hasValidMedicines =
    useMemo(
      () => {

        if (
          !Array.isArray(
            editMeds
          ) ||
          editMeds.length ===
            0
        ) {
          return false;
        }


        return editMeds.every(
          (
            med
          ) => {

            const name =
              String(
                med?.med ||
                  ''
              ).trim();


            const qty =
              Number(
                med?.qty ??
                  med?.q ??
                  0
              );


            const unit =
              String(
                med?.unit ||
                  med?.u ||
                  ''
              ).trim();
            const doseInstruction = String(med?.doseInstruction || med?.aturanPakai || '').trim();

            return Boolean(
              name &&
                Number.isFinite(
                  qty
                ) &&
                qty > 0 &&
                unit &&
                doseInstruction
            );

          }
        );

      },
      [
        editMeds,
      ]
    );


  /*
   * =================================================
   * VALIDASI FORM
   * =================================================
   */
  const isValid =
    Boolean(
      String(
        editDiagnosis ||
          ''
      ).trim() &&
        hasValidMedicines
    );


  /*
   * =================================================
   * CEK PERUBAHAN
   * =================================================
   */
  const hasChanges =
    useMemo(
      () => {

        if (
          !initialEditSnapshotRef.current
        ) {
          return false;
        }


        return (
          makeEditSnapshot(
            editDiagnosis,
            editMeds
          ) !==
          initialEditSnapshotRef.current
        );

      },
      [
        editDiagnosis,
        editMeds,
      ]
    );


  /*
   * =================================================
   * SIMPAN PERUBAHAN
   * =================================================
   */
  /**
   * Menangani aksi save dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleSave =
    async () => {

      if (
        !hasChanges
      ) {
        return;
      }


      /*
       * Resep sudah ditebus
       * tidak dapat diubah.
       */
      if (
        isPrescriptionPicked
      ) {

        notify?.(
          'Resep yang sudah ditebus tidak dapat diubah.',
          'warning'
        );

        return;
      }


      const diagnosis =
        String(
          editDiagnosis ||
            ''
        ).trim();


      /*
       * Normalisasi obat.
       */
      const normalizedMeds =
        (
          editMeds ||
          []
        )
          .map(
            (
              med
            ) => {

              const doseInstruction =
                String(
                  med?.doseInstruction ||
                    med?.aturanPakai ||
                    ''
                ).trim();


              return {
                medicationId: String(med?.medicationId || med?._id || ''),
                med:
                  String(
                    med?.med ||
                      ''
                  ).trim(),

                q:
                  Number(
                    med?.qty ??
                      med?.q ??
                      0
                  ) || 0,

                u:
                  med?.unit ||
                  med?.u ||
                  'tablet',

                doseInstruction,

                aturanPakai:
                  doseInstruction,

                notes:
                  String(
                    med?.notes ||
                      med?.catatanTambahan ||
                      ''
                  ).trim(),

                catatanTambahan:
                  String(
                    med?.notes ||
                      med?.catatanTambahan ||
                      ''
                  ).trim(),
              };

            }
          )
          .filter(
            (
              med
            ) =>
              med.med &&
              med.q > 0
          );


      /*
       * VALIDASI DIAGNOSIS
       */
      if (
        !diagnosis
      ) {

        notify?.(
          'Diagnosis wajib dipilih.',
          'warning'
        );

        return;
      }


      /*
       * VALIDASI ATURAN PAKAI
       */
      if (normalizedMeds.some((med) => !String(med?.doseInstruction || '').trim())) {
        notify?.('Aturan pakai wajib dipilih untuk setiap obat.', 'warning');
        return;
      }

      /*
       * VALIDASI OBAT
       */
      if (
        !normalizedMeds.length
      ) {

        notify?.(
          'Data obat tidak valid.',
          'warning'
        );

        return;
      }


      /*
       * KIRIM KE PARENT
       */
      return await onSave?.(
        diagnosis,
        normalizedMeds
      );

    };


  return (
    <>

      {/* =================================================
          MODAL UBAH RESEP
      ================================================= */}
      <Modal
        open={
          open
        }
        title={
          <div className="section-head medication-modal-head">

            <div>

              <h3>
                Ubah Resep
              </h3>

              <p>
                {isPrescriptionPicked
                  ? 'Resep sudah ditebus dan tidak dapat diubah.'
                  : 'Periksa data pasien dan obat, lalu simpan perubahan resep dalam batas waktu 24 jam.'}
              </p>

            </div>

          </div>
        }
        onClose={
          onClose
        }
        size="md"
      >

        {prescription ? (

          <div className="stack prescription-edit-stack">

            {/* =========================
                DATA YANG BOLEH DIUBAH
            ========================= */}
            <div className="edit-account-form-card">

              <div className="form-grid two-cols prescription-edit-diagnosis-grid">

                {/* DIAGNOSIS */}
                <Field
                  label="Diagnosis"
                  required
                >

                  <div
                    className="diagnosis-field-row"
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
                      className="control control-compact diagnosis-select"
                      value={
                        editDiagnosis
                      }
                      onChange={(
                        event
                      ) =>
                        setEditDiagnosis(
                          event.target.value
                        )
                      }
                      disabled={
                        isPrescriptionPicked
                      }
                      style={{
                        flex:
                          1,
                        minWidth:
                          0,
                      }}
                    >

                      <option value="">
                        Pilih diagnosis
                      </option>

                      {diagnosisSelectOptions.map(
                        (
                          diagnosis
                        ) => (
                          <option
                            key={
                              diagnosis
                            }
                            value={
                              diagnosis
                            }
                          >
                            {
                              diagnosis
                            }
                          </option>
                        )
                      )}

                    </SearchableSelect>

                  </div>

                </Field>

              </div>

            </div>


            {/* =========================
                TAMBAH OBAT
            ========================= */}
            <div className="prescription-medication-head-edit">

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={
                  addMedicine
                }
                disabled={
                  isPrescriptionPicked
                }
              >

                <Plus
                  size={
                    16
                  }
                />

                Tambah Obat

              </Button>

            </div>


            {/* =========================
                DAFTAR OBAT
            ========================= */}
            <div className="stack prescription">

              {paginatedEditMedEntries.map(
                (
                  { med, index }
                ) => (

                  <div
                    className="result-card prescription-edit-medication-card"
                    key={
                      index
                    }
                  >

                    {/* =================================================
                        BARIS 1:
                        NAMA OBAT + SATUAN + JUMLAH
                    ================================================= */}
                    <div
                      className="form-grid three-cols prescription-edit-medication-row"
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
                            med.medicationId || ''
                          }
                          onChange={(event) => {
                            const selected = medicineOptions.find(
                              (item) => String(item?._id || item?.id || '') === String(event.target.value || '')
                            );
                            updateMedicine(index, {
                              medicationId: selected ? String(selected._id || selected.id) : '',
                              med: selected?.name || '',
                              unit: selected?.unit || 'tablet',
                              route: selected?.administrationRoute || '',
                              doseInstruction: '',
                              aturanPakai: '',
                            });
                          }}
                          disabled={
                            isPrescriptionPicked
                          }
                        >

                          <option value="">
                            Pilih obat
                          </option>

                          {med.med && med.medicationId && !medicineOptions.some((item) => String(item._id || item.id || '') === String(med.medicationId)) ? (
                            <option value={med.medicationId}>{med.med}</option>
                          ) : null}

                          {medicineOptions.map(
                            (
                              item
                            ) => (
                              <option
                                key={String(item._id || item.id)}
                                value={String(item._id || item.id)}
                              >
                                {`${item.name} - ${item.unit || '-'} - ${item.distributor || item.manufacturer || '-'}`}
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

                        <SearchableSelect
                          className="control control-compact"
                          value={
                            med.unit ||
                            'tablet'
                          }
                          onChange={(
                            event
                          ) =>
                            updateMedicine(
                              index,
                              {
                                unit:
                                  event.target.value,
                              }
                            )
                          }
                          disabled={
                            isPrescriptionPicked
                          }
                        >

                          {med.unit && !PRESCRIPTION_UNIT_OPTIONS.includes(med.unit) ? <option value={med.unit}>{capitalizeFirstLetter(med.unit)}</option> : null}
                          {PRESCRIPTION_UNIT_OPTIONS.map(
                            (
                              unit
                            ) => (
                              <option
                                key={
                                  unit
                                }
                                value={
                                  unit
                                }
                              >
                                {capitalizeFirstLetter(
                                  unit
                                )}
                              </option>
                            )
                          )}

                        </SearchableSelect>

                      </Field>

                      {/* JUMLAH */}
                      <Field
                        label="Jumlah"
                        required
                      >

                        <TextInput
                          type="number"
                          min="1"
                          step="1"
                          value={
                            med.qty ??
                            ''
                          }
                          onChange={(
                            event
                          ) =>
                            updateMedicine(
                              index,
                              {
                                qty:
                                  event.target.value,
                              }
                            )
                          }
                          placeholder="Jumlah obat"
                          disabled={
                            isPrescriptionPicked
                          }
                        />

                      </Field>
                    </div>


                    {/* =================================================
                        BARIS 2:
                        ATURAN PAKAI + CATATAN
                    ================================================= */}
                    <div
                      className="form-grid two-cols prescription-edit-medication-row"
                      style={{
                        marginTop:
                          '12px',
                      }}
                    >

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
                            className="control control-compact dose-select"
                            value={
                              med.doseInstruction ||
                              ''
                            }
                            onChange={(
                              event
                            ) =>
                              updateMedicine(
                                index,
                                {
                                  doseInstruction:
                                    event.target.value,
                                }
                              )
                            }
                            disabled={
                              isPrescriptionPicked
                            }
                            style={{
                              flex:
                                1,
                              minWidth:
                                0,
                            }}
                          >

                            <option value="">
                              Pilih aturan pakai
                            </option>

                            {getDoseOptionsForMedicine(
                              med
                            ).map(
                              (
                                item
                              ) => (
                                <option
                                  key={
                                    item
                                  }
                                  value={
                                    item
                                  }
                                >
                                  {
                                    item
                                  }
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
                            disabled={
                              isPrescriptionPicked
                            }
                          >

                            <Pencil
                              size={
                                15
                              }
                            />

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
                            med.notes ||
                            ''
                          }
                          onChange={(
                            event
                          ) =>
                            updateMedicine(
                              index,
                              {
                                notes:
                                  event.target.value,
                              }
                            )
                          }
                          placeholder="Masukkan catatan (opsional)"
                          disabled={
                            isPrescriptionPicked
                          }
                        />

                      </Field>

                    </div>


                    {/* =================================================
                        HAPUS OBAT
                    ================================================= */}
                    {editMeds.length >
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
                          onClick={() =>
                            removeMedicine(
                              index
                            )
                          }
                          disabled={
                            isPrescriptionPicked
                          }
                        >

                          <Trash2
                            size={
                              15
                            }
                          />

                          Hapus

                        </Button>

                      </div>

                    ) : null}

                  </div>

                )
              )}

            </div>
            <TablePagination currentPage={editMedsPage} totalPages={editMedsTotalPages} onPageChange={setEditMedsPage} ariaLabel="Navigasi obat pada resep yang diedit" />


            {/* =========================
                ACTION
            ========================= */}
            <div className="preview-actions">

              <Button
                type="button"
                onClick={
                  handleSave
                }
                disabled={
                  !isValid ||
                  !hasChanges ||
                  isPrescriptionPicked
                }
              >

                <Save
                  size={
                    16
                  }
                />

                Simpan Perubahan

              </Button>

            </div>

          </div>

        ) : null}

      </Modal>


      {/* =================================================
          MODAL KELOLA ATURAN PAKAI
      ================================================= */}
      <Modal
        open={manageDoseOptionsOpen}
        title={
          <div className="section-head medication-modal-head">
            <div>
              <h3>Ubah Aturan Pakai</h3>
              <p>Tambah atau hapus aturan pakai yang tersedia.</p>
            </div>
          </div>
        }
        onClose={() => setManageDoseOptionsOpen(false)}
        size="md"
      >
        <div className="stack">
          <div className="dose-option-scope-note" role="note">
            Aturan pakai untuk {doseOptionFilter} {doseOptionRouteFilter}.
          </div>

          <Field label="Aturan Pakai" className="option-add-field dose-option-add-field">
            <div className="option-add-row dose-option-add-row">
              <TextInput
                value={newDoseOption}
                onChange={(event) => setNewDoseOption(event.target.value)}
                placeholder="Aturan Pakai"
              />
              <Button type="button" onClick={addDoseOption} disabled={savingDoseOptions}>
                <Plus size={15} />
                Tambah
              </Button>
            </div>
          </Field>

          <div className="stack">
            {paginatedManageDoseOptions.map((item) => (
              <div className="result-card" key={item} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item}</span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => removeDoseOption(item)}
                  className="dose-option-delete-btn"
                >
                  <Trash2 size={15} />
                  Hapus
                </Button>
              </div>
            ))}
            {!filteredManageDoseOptions.length ? (
              <div className="empty-inline">Belum ada aturan pakai untuk kombinasi satuan dan rute pemberian obat tersebut.</div>
            ) : null}
          </div>
          <TablePagination currentPage={manageDoseOptionsPage} totalPages={manageDoseOptionsTotalPages} onPageChange={setManageDoseOptionsPage} ariaLabel="Navigasi opsi aturan pakai" />
        </div>
      </Modal>
    </>
  );
}
