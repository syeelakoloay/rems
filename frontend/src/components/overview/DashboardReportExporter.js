/**
 * Menyusun data dashboard ke dalam dokumen laporan yang dapat diunduh.
 */
import { formatDateTime as formatDateTimeWita } from '../../lib/date';
/**
 * PDF report export workflow for the Dashboard workspace.
 * All data and callbacks are passed from the owning page to preserve its current behavior.
 */

export const createDashboardReportExporter = (context) => {
  const {
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
  } = context;

  return async (
      selectedSections = []
    ) => {
      try {
        if (
          !selectedSections.length
        ) {
          notify?.(
            'Pilih minimal satu bagian laporan.',
            'warning'
          );
          return;
        }

        const selected =
          new Set(
            selectedSections
          );

        const pdf =
          new jsPDF({
            orientation:
              'portrait',
            unit:
              'mm',
            format:
              'a4',
          });

        const pageWidth =
          pdf.internal.pageSize.getWidth();

        const pageHeight =
          pdf.internal.pageSize.getHeight();

        const margin =
          15;

        const contentWidth =
          pageWidth -
          margin * 2;

        let y = 18;


        const COLORS = {
          blue: [23, 111, 131],

          text: [
            15,
            23,
            42,
          ],

          muted: [
            100,
            116,
            139,
          ],

          border: [
            226,
            232,
            240,
          ],

          surface: [
            248,
            250,
            252,
          ],

          white: [
            255,
            255,
            255,
          ],
        };


                /**
         * Memeriksa ruang halaman PDF dan membuat halaman baru ketika elemen laporan berikutnya tidak muat.
         */
        const ensureSpace =
          (
            requiredHeight
          ) => {
            if (
              y +
                requiredHeight >
              pageHeight -
                16
            ) {
              pdf.addPage();
              y = 18;
            }
          };


                /**
         * Menempatkan judul bagian laporan beserta jarak visual yang konsisten.
         */
        const addSectionHeading =
          (
            title
          ) => {
            y += 5;

            ensureSpace(
              16
            );

            pdf.setFont(
              'helvetica',
              'bold'
            );

            pdf.setFontSize(
              13
            );

            pdf.setTextColor(
              ...COLORS.text
            );

            pdf.text(
              title,
              margin,
              y
            );

            y += 5;
          };


        /**
         * Menggambar bagian tabel pada dokumen atau visualisasi yang sedang disusun.
         */
        const drawTable =
          ({
            columns,
            rows,
            fontSize = 7.5,
          }) => {
            const tableWidth =
              contentWidth;

            const totalWeight =
              columns.reduce(
                (
                  sum,
                  column
                ) =>
                  sum +
                  column.width,
                0
              );

            /**
             * Menghitung lebar kolom dari bobot tiap kolom terhadap total bobot dan lebar tabel yang tersedia di halaman PDF.
             */
            const getColumnWidth =
              (
                column
              ) =>
                tableWidth *
                (
                  column.width /
                  totalWeight
                );

            const headerHeight =
              9;

            const horizontalPadding =
              2.5;

            const lineHeight =
              3.5;


            /**
             * Menggambar bagian header pada dokumen atau visualisasi yang sedang disusun.
             */
            const drawHeader =
              () => {
                ensureSpace(
                  headerHeight +
                    2
                );

                let x =
                  margin;

                pdf.setFillColor(
                  ...COLORS.blue
                );

                pdf.setDrawColor(
                  ...COLORS.blue
                );

                pdf.roundedRect(
                  margin,
                  y,
                  tableWidth,
                  headerHeight,
                  2,
                  2,
                  'F'
                );

                pdf.setFont(
                  'helvetica',
                  'bold'
                );

                pdf.setFontSize(
                  fontSize
                );

                pdf.setTextColor(
                  ...COLORS.white
                );

                columns.forEach(
                  (
                    column
                  ) => {
                    const width =
                      getColumnWidth(
                        column
                      );

                    pdf.text(
                      String(
                        column.label
                      ),
                      x +
                        horizontalPadding,
                      y +
                        5.8
                    );

                    x +=
                      width;
                  }
                );

                y +=
                  headerHeight;
              };


            drawHeader();


            rows.forEach(
              (
                row,
                rowIndex
              ) => {
                const prepared =
                  columns.map(
                    (
                      column
                    ) => {
                      const value =
                        row[
                          column.key
                        ] ??
                        '';

                      return pdf.splitTextToSize(
                        String(
                          value
                        ),
                        getColumnWidth(
                          column
                        ) -
                          horizontalPadding *
                            2
                      );
                    }
                  );


                const maxLines =
                  Math.max(
                    ...prepared.map(
                      (
                        lines
                      ) =>
                        lines.length
                    ),
                    1
                  );


                const rowHeight =
                  Math.max(
                    8,
                    maxLines *
                      lineHeight +
                      4
                  );


                if (
                  y +
                    rowHeight >
                  pageHeight -
                    16
                ) {
                  pdf.addPage();
                  y = 18;
                  drawHeader();
                }


                const fill =
                  rowIndex %
                    2 ===
                  0
                    ? COLORS.white
                    : COLORS.surface;


                pdf.setFillColor(
                  ...fill
                );

                pdf.setDrawColor(
                  ...COLORS.border
                );

                pdf.rect(
                  margin,
                  y,
                  tableWidth,
                  rowHeight,
                  'FD'
                );


                let x =
                  margin;


                columns.forEach(
                  (
                    column,
                    index
                  ) => {
                    const width =
                      getColumnWidth(
                        column
                      );

                    pdf.setDrawColor(
                      ...COLORS.border
                    );

                    pdf.line(
                      x,
                      y,
                      x,
                      y +
                        rowHeight
                    );

                    pdf.setFont(
                      'helvetica',
                      'normal'
                    );

                    pdf.setFontSize(
                      fontSize
                    );

                    pdf.setTextColor(
                      ...COLORS.text
                    );

                    pdf.text(
                      prepared[
                        index
                      ],
                      x +
                        horizontalPadding,
                      y +
                        4
                    );

                    x +=
                      width;
                  }
                );


                pdf.line(
                  x,
                  y,
                  x,
                  y +
                    rowHeight
                );

                y +=
                  rowHeight;
              }
            );


            y += 8;
          };


        



        



                /**
         * Menempatkan gambar grafik dan keterangan pada halaman laporan PDF.
         */
        const addChart =
          (
            title,
            image
          ) => {
            addSectionHeading(
              title
            );

            if (image) {
              ensureSpace(
                78
              );

              pdf.addImage(
                image,
                'PNG',
                margin,
                y,
                160,
                65,
                undefined,
                'FAST'
              );

              y += 75;
            }
          };


        const today =
          new Date();


        const todayPrescriptions =
          prescriptions.filter(
            (prescription) =>
              isSameDay(
                prescription?.createdAt,
                today
              )
          );


        const waitingToday =
          todayPrescriptions.filter(
            (prescription) =>
              getEffectivePrescriptionStatus(prescription) === 'pending'
          );


        const pickedToday =
          todayPrescriptions.filter(
            (prescription) =>
              getEffectivePrescriptionStatus(prescription) === 'picked'
          );


        /**
         * Memetakan resep rows ke struktur data yang dipakai oleh API atau komponen pemanggil.
         */
        const mapPrescriptionRows =
          (
            source
          ) =>
            source
              .slice()
              .sort(
                (a, b) =>
                  new Date(
                    b?.createdAt ||
                      0
                  ) -
                  new Date(
                    a?.createdAt ||
                      0
                  )
              )
              .map(
                (prescription) => ({
                  time:
                    prescription?.createdAt
                      ? formatDateTimeWita(prescription.createdAt)
                      : '-',

                  patient:
                    getPatientName(
                      getPatientForPrescription(
                        data,
                        prescription
                      )
                    ) || '-',

                  phone:
                    getPatientPhone(
                      getPatientForPrescription(
                        data,
                        prescription
                      )
                    ) || '-',

                  diagnosis:
                    prescription?.diagnosis ||
                    '-',

                  meds:
                    (
                      prescription?.meds ||
                      []
                    )
                      .map(
                        (med) =>
                          med?.med ||
                          '-'
                      )
                      .join(
                        ', '
                      ),

                  qty:
                    (
                      prescription?.meds ||
                      []
                    )
                      .map(
                        (med) =>
                          med?.q ??
                          med?.qty ??
                          '-'
                      )
                      .join(
                        ', '
                      ),

                  unit:
                    (
                      prescription?.meds ||
                      []
                    )
                      .map(
                        (med) =>
                          capitalizeFirstLetter(
                            med?.u ||
                            med?.unit
                          )
                      )
                      .join(
                        ', '
                      ),

                  status:
                    getEffectivePrescriptionStatus(prescription) === 'picked'
                      ? 'Ditebus'
                      : 'Menunggu',
                })
              );


        /**
         * Menggambar bagian resep tabel pada dokumen atau visualisasi yang sedang disusun.
         */
        const drawPrescriptionTable =
          (
            title,
            source
          ) => {
            addSectionHeading(
              title
            );

            drawTable({
              fontSize:
                6.5,

              columns: [
                {
                  key: 'time',
                  label:
                    'Waktu/Tanggal',
                  width: 40,
                },

                {
                  key: 'patient',
                  label:
                    'Nama Pasien',
                  width: 32,
                },

                {
                  key: 'phone',
                  label:
                    'No. Telp',
                  width: 27,
                },

                {
                  key: 'diagnosis',
                  label:
                    'Diagnosis',
                  width: 32,
                },

                {
                  key: 'meds',
                  label:
                    'Obat',
                  width: 40,
                },

                {
                  key: 'qty',
                  label:
                    'Jumlah',
                  width: 22,
                },

                {
                  key: 'unit',
                  label:
                    'Satuan',
                  width: 25,
                },

                {
                  key: 'status',
                  label:
                    'Status',
                  width: 24,
                },
              ],

              rows:
                source.length
                  ? mapPrescriptionRows(
                      source
                    )
                  : [
                      {
                        time: '-',
                        patient: '-',
                        phone: '-',
                        diagnosis: '-',
                        meds:
                          'Belum ada resep',
                        qty: '-',
                        unit: '-',
                        status: '-',
                      },
                    ],
            });
          };


        /* =================================================
           HEADER
        ================================================= */

        pdf.setFont(
          'helvetica',
          'bold'
        );

        pdf.setFontSize(
          18
        );

        pdf.setTextColor(
          ...COLORS.text
        );

        pdf.text(
          role === 'doctor'
            ? 'Dokter FKTP - Laporan Resep'
            : 'Apoteker - Laporan Apotek',
          margin,
          y
        );

        y += 7;

        pdf.setFont(
          'helvetica',
          'normal'
        );

        pdf.setFontSize(
          9
        );

        pdf.setTextColor(
          ...COLORS.muted
        );

        const reportPrintDate = formatDateTimeWita(new Date());
        pdf.text(`Dibuat oleh: ${currentUser || '-'}`, margin, y);
        y += 5;
        pdf.text(`Jabatan: ${role === 'doctor' ? 'Dokter FKTP' : 'Apoteker'}`, margin, y);
        y += 5;
        pdf.text(`Tanggal cetak: ${reportPrintDate}`, margin, y);

        y += 7;


        /* =================================================
           DOKTER FKTP
        ================================================= */

        if (
          role === 'doctor'
        ) {
          if (
            selected.has(
              'doctorKpi'
            )
          ) {
            addSectionHeading(
              'Ringkasan KPI'
            );

            drawTable({
              columns: [
                {
                  key:
                    'label',
                  label:
                    'Indikator',
                  width: 75,
                },

                {
                  key:
                    'value',
                  label:
                    'Jumlah',
                  width: 25,
                },
              ],

              rows: [
                {
                  label:
                    'Resep Hari Ini',
                  value:
                    doctorToday,
                },

                {
                  label:
                    'Resep Minggu Ini',
                  value:
                    doctorThisWeek,
                },

                {
                  label:
                    'Resep Bulan Ini',
                  value:
                    doctorThisMonth,
                },

                {
                  label:
                    'Resep Tahun Ini',
                  value:
                    doctorThisYear,
                },
              ],
            });
          }


          if (
            selected.has(
              'doctorWeek'
            )
          ) {
            addChart(
              'Line Chart (Resep Dibuat per Minggu)',
              createDashboardLineChartImage(
                totalPrescriptionSeries(
                  doctorPrescriptions,
                  'week'
                )
              )
            );
          }


          if (
            selected.has(
              'doctorMonth'
            )
          ) {
            addChart(
              'Line Chart (Resep Dibuat per Bulan)',
              createDashboardLineChartImage(
                totalPrescriptionSeries(
                  doctorPrescriptions,
                  'month'
                )
              )
            );
          }


          if (
            selected.has(
              'doctorYear'
            )
          ) {
            addChart(
              'Line Chart (Resep Dibuat per Tahun)',
              createDashboardLineChartImage(
                totalPrescriptionSeries(
                  doctorPrescriptions,
                  'year'
                )
              )
            );
          }


          if (
            selected.has(
              'doctorMedicine'
            )
          ) {
            addChart(
              'Bar Chart (Tren Obat)',
              createDashboardBarChartImage(
                medicineSeries
              )
            );
          }


          if (
            selected.has(
              'doctorToday'
            )
          ) {
            drawPrescriptionTable(
              'Resep Dibuat (Hari Ini)',
              doctorPrescriptions.filter(
                (prescription) =>
                  isSameDay(
                    prescription?.createdAt,
                    today
                  )
              )
            );
          }


          if (
            selected.has(
              'doctorChronicBooks'
            )
          ) {
            addSectionHeading(
              'Buku Kronis'
            );

            const chronicBookRows =
              Object.values(
                data?.chronicBooks ||
                  {}
              )
                .slice()
                .sort(
                  (a, b) =>
                    new Date(
                      b?.uploadedAt ||
                        0
                    ) -
                    new Date(
                      a?.uploadedAt ||
                        0
                    )
                )
                .map(
                  (book) => ({
                    bpjs:
                      book?.bpjsNumber ||
                      book?.bpjs ||
                      book?.nomorBpjs ||
                      book?.nomorBPJS ||
                      book?.noBpjs ||
                      book?.noBPJS ||
                      book?.cardNumber ||
                      book?.insuranceNumber ||
                      '-',

                    patient:
                      book?.patientName ||
                      '-',

                    file:
                      book?.fileName ||
                      '-',
                  })
                );

            drawTable({
              fontSize:
                7.5,

              columns: [
                {
                  key:
                    'bpjs',
                  label:
                    'Nomor BPJS',
                  width: 45,
                },

                {
                  key:
                    'patient',
                  label:
                    'Nama Pasien',
                  width: 55,
                },

                {
                  key:
                    'file',
                  label:
                    'Nama File',
                  width: 80,
                },
              ],

              rows:
                chronicBookRows.length
                  ? chronicBookRows
                  : [
                      {
                        bpjs:
                          '-',
                        patient:
                          '-',
                        file:
                          'Belum ada buku kronis',
                      },
                    ],
            });
          }
        }


        /* =================================================
           APOTEKER
        ================================================= */

        if (
          role === 'pharmacy'
        ) {
          const waitingCount =
            prescriptions.filter(
              (p) =>
                getEffectivePrescriptionStatus(p) === 'pending'
            ).length;


          const pickedCount =
            prescriptions.filter(
              (p) =>
                getEffectivePrescriptionStatus(p) === 'picked'
            ).length;


          if (
            selected.has(
              'kpi'
            )
          ) {
            addSectionHeading(
              'Ringkasan KPI'
            );

            drawTable({
              columns: [
                {
                  key:
                    'label',
                  label:
                    'Indikator',
                  width: 75,
                },

                {
                  key:
                    'value',
                  label:
                    'Jumlah',
                  width: 25,
                },
              ],

              rows: [
                {
                  label:
                    'Resep Masuk',
                  value:
                    prescriptions.length,
                },

                {
                  label:
                    'Resep Menunggu',
                  value:
                    waitingCount,
                },

                {
                  label:
                    'Resep Ditebus',
                  value:
                    pickedCount,
                },

                {
                  label:
                    'Stok Hampir Habis',
                  value:
                    low.length,
                },

                {
                  label:
                    'Stok Hampir Kedaluwarsa',
                  value:
                    expiry.length,
                },
              ],
            });
          }


          if (
            selected.has(
              'redeemedWeek'
            )
          ) {
            addChart(
              'Line Chart (Resep Ditebus per Minggu)',
              createDashboardLineChartImage(
                redeemedPrescriptionSeries(
                  prescriptions,
                  'week'
                )
              )
            );
          }


          if (
            selected.has(
              'redeemedMonth'
            )
          ) {
            addChart(
              'Line Chart (Resep Ditebus per Bulan)',
              createDashboardLineChartImage(
                redeemedPrescriptionSeries(
                  prescriptions,
                  'month'
                )
              )
            );
          }


          if (
            selected.has(
              'redeemedYear'
            )
          ) {
            addChart(
              'Line Chart (Resep Ditebus per Tahun)',
              createDashboardLineChartImage(
                redeemedPrescriptionSeries(
                  prescriptions,
                  'year'
                )
              )
            );
          }


          const lowStockItems =
            low
              .slice()
              .sort(
                (a, b) =>
                  Number(
                    a?.qty
                  ) -
                  Number(
                    b?.qty
                  )
              )
              .slice(
                0,
                5
              )
              .map(
                (item) => ({
                  label:
                    item?.name ||
                    '-',

                  value:
                    Number(
                      item?.qty
                    ) || 0,
                })
              );


          const expiryStockItems =
            expiry
              .slice()
              .map(
                (item) => {
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

                  const daysLeft =
                    Math.ceil(
                      (
                        expiryDate.getTime() -
                        today.getTime()
                      ) /
                        DAY_MS
                    );

                  return {
                    label:
                      item?.name ||
                      '-',

                    value:
                      Math.max(
                        0,
                        daysLeft
                      ),
                  };
                }
              )
              .filter(Boolean)
              .sort(
                (a, b) =>
                  a.value -
                  b.value
              )
              .slice(
                0,
                5
              );


          if (
            selected.has(
              'lowStock'
            )
          ) {
            const image =
              createDashboardBarChartImage(
                lowStockItems
              );

            if (image) {
              addChart(
                'Bar Chart (Stok Obat Hampir Habis)',
                image
              );
            } else {
              addSectionHeading(
                'Bar Chart (Stok Obat Hampir Habis)'
              );

              drawTable({
                columns: [
                  {
                    key:
                      'message',
                    label:
                      'Informasi',
                    width:
                      100,
                  },
                ],

                rows: [
                  {
                    message:
                      'Tidak ada stok obat yang hampir habis.',
                  },
                ],
              });
            }
          }


          if (
            selected.has(
              'expiryStock'
            )
          ) {
            const image =
              createDashboardBarChartImage(
                expiryStockItems
              );

            if (image) {
              addChart(
                'Bar Chart (Stok Obat Hampir Kedaluwarsa)',
                image
              );
            } else {
              addSectionHeading(
                'Bar Chart (Stok Obat Hampir Kedaluwarsa)'
              );

              drawTable({
                columns: [
                  {
                    key:
                      'message',
                    label:
                      'Informasi',
                    width:
                      100,
                  },
                ],

                rows: [
                  {
                    message:
                      'Tidak ada stok obat yang hampir kedaluwarsa.',
                  },
                ],
              });
            }
          }


          if (
            selected.has(
              'waitingToday'
            )
          ) {
            drawPrescriptionTable(
              'Resep Masuk (Menunggu Hari Ini)',
              waitingToday
            );
          }


          if (
            selected.has(
              'pickedToday'
            )
          ) {
            drawPrescriptionTable(
              'Resep Masuk (Ditebus Hari Ini)',
              pickedToday
            );
          }


          if (
            selected.has(
              'allToday'
            )
          ) {
            drawPrescriptionTable(
              'Resep Masuk (Semua Hari Ini)',
              todayPrescriptions
            );
          }


          if (
            selected.has(
              'stock'
            )
          ) {
            addSectionHeading(
              'Stok Obat'
            );

            const stockRows =
              stock.length
                ? stock.map(
                    (item) => ({
                      name:
                        item?.name ||
                        '-',

                      manufacturer:
                        item?.distributor ||
                        item?.manufacturer ||
                        item?.pabrik ||
                        '-',

                      qty:
                        `${item?.qty ?? 0} ${
                          item?.unit ||
                          ''
                        }`.trim(),

                      expiry:
                        item?.expiryDate ||
                        '-',
                    })
                  )
                : [
                    {
                      name:
                        '-',
                      manufacturer:
                        '-',
                      qty:
                        '-',
                      expiry:
                        'Belum ada stok',
                    },
                  ];

            drawTable({
              fontSize:
                7,

              columns: [
                {
                  key:
                    'name',
                  label:
                    'Nama Obat',
                  width:
                    55,
                },

                {
                  key:
                    'manufacturer',
                  label:
                    'Pabrik',
                  width:
                    50,
                },

                {
                  key:
                    'qty',
                  label:
                    'Stok',
                  width:
                    35,
                },

                {
                  key:
                    'expiry',
                  label:
                    'Kedaluwarsa',
                  width:
                    55,
                },
              ],

              rows:
                stockRows,
            });
          }


          if (
            selected.has(
              'chronicBooks'
            )
          ) {
            addSectionHeading(
              'Buku Kronis'
            );

            const chronicBookRows =
              Object.values(
                data?.chronicBooks ||
                  {}
              )
                .slice()
                .sort(
                  (a, b) =>
                    new Date(
                      b?.uploadedAt ||
                        0
                    ) -
                    new Date(
                      a?.uploadedAt ||
                        0
                    )
                )
                .map(
                  (book) => ({
                    bpjs:
                      book?.bpjsNumber ||
                      book?.bpjs ||
                      book?.nomorBpjs ||
                      book?.nomorBPJS ||
                      book?.noBpjs ||
                      book?.noBPJS ||
                      book?.cardNumber ||
                      book?.insuranceNumber ||
                      '-',

                    patient:
                      book?.patientName ||
                      '-',

                    file:
                      book?.fileName ||
                      '-',
                  })
                );

            drawTable({
              fontSize:
                7.5,

              columns: [
                {
                  key:
                    'bpjs',
                  label:
                    'Nomor BPJS',
                  width:
                    45,
                },

                {
                  key:
                    'patient',
                  label:
                    'Nama Pasien',
                  width:
                    55,
                },

                {
                  key:
                    'file',
                  label:
                    'Nama File',
                  width:
                    80,
                },
              ],

              rows:
                chronicBookRows.length
                  ? chronicBookRows
                  : [
                      {
                        bpjs:
                          '-',
                        patient:
                          '-',
                        file:
                          'Belum ada buku kronis',
                      },
                    ],
            });
          }
        }


        /* =================================================
           FOOTER
        ================================================= */

        const totalPages =
          pdf.getNumberOfPages();

        for (
          let page = 1;
          page <=
          totalPages;
          page += 1
        ) {
          pdf.setPage(
            page
          );

          pdf.setFont(
            'helvetica',
            'normal'
          );

          pdf.setFontSize(
            8
          );

          pdf.setTextColor(
            ...COLORS.muted
          );

          pdf.text(
            role === 'doctor'
              ? 'REMS - Laporan Dokter FKTP'
              : 'REMS - Laporan Apotek',
            margin,
            pageHeight - 7
          );

          pdf.text(
            `Halaman ${page} dari ${totalPages}`,
            pageWidth -
              margin,
            pageHeight - 7,
            {
              align:
                'right',
            }
          );
        }


        pdf.save(
          role === 'doctor'
            ? `laporan-dokter-fktp-${Date.now()}.pdf`
            : `laporan-apoteker-${Date.now()}.pdf`
        );


        onExport?.();

        setExportModalOpen(
          false
        );
      } catch (error) {
        console.error(
          'Error ekspor laporan:',
          error
        );

        notify?.(
          'Gagal membuat laporan PDF.',
          'warning'
        );
      }
    };
};
