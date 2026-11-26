/**
 * Menyusun data dan elemen visual menjadi laporan Admin yang dapat diekspor.
 */
import { formatDate as formatCalendarDate, formatDateTime as formatDateTimeWita } from '../../lib/date';
/**
 * PDF report export workflow for the Admin workspace.
 * All data and callbacks are passed from the owning page to preserve its current behavior.
 */

export const createAdminReportExporter = (context) => {
  const {
    EXPIRY_ALERT_DAYS,
    ROLE_LABELS,
    STOCK_ALERT_THRESHOLD,
    activities,
    createAdminBarChartImage,
    createAdminLineChartImage,
    currentUser,
    data,
    exp,
    jsPDF,
    low,
    notify,
    onExport,
    stockTransactionSeries,
    stockTransactions,
    setExportModalOpen,
    stock
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

      const margin = 15;

      const contentWidth =
        pageWidth -
        margin * 2;

      let y = 18;


      const COLORS = {
        blue: [23, 111, 131],

        text: [
          23,
          43,
          58,
        ],

        muted: [
          96,
          116,
          131,
        ],

        border: [
          220,
          230,
          233,
        ],

        surface: [
          246,
          250,
          251,
        ],

        white: [
          255,
          255,
          255,
        ],
      };


            /**
       * Memeriksa ruang kosong halaman PDF dan menambahkan halaman baru bila bagian laporan berikutnya tidak muat.
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
       * Menambahkan judul bagian laporan dengan jarak dan penempatan yang konsisten pada PDF.
       */
      const addSectionHeading =
        (title) => {
          y += 5;

          ensureSpace(16);

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
           * Menghitung lebar kolom berdasarkan lebar tabel PDF dan proporsi tiap kolom agar isi tabel tetap berada di area halaman.
           */
          const getColumnWidth =
            (column) =>
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
                headerHeight + 2
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

                  x += width;
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
                      String(value),
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
                rowIndex % 2 === 0
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
                    prepared[index],
                    x +
                      horizontalPadding,
                    y + 4
                  );

                  x += width;
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
        'Admin - Laporan Apotek',
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
      pdf.text('Jabatan: Admin', margin, y);
      y += 5;
      pdf.text(`Tanggal cetak: ${reportPrintDate}`, margin, y);

      y += 7;


      /* =================================================
         DATA DASAR
      ================================================= */

      const availableBatchCount = stock.reduce((total, item) => total + (item?.batches || []).filter((batch) => Number(batch?.qty) > 0 && (!batch?.expiryDate || new Date(batch.expiryDate) >= new Date())).length, 0);

      const today =
        new Date();


            /**
       * Membandingkan tanggal data dengan tanggal hari ini untuk menentukan penanda data pada laporan.
       */
      const isToday =
        (date) => {
          if (!date) {
            return false;
          }

          const value =
            new Date(date);

          if (
            Number.isNaN(
              value.getTime()
            )
          ) {
            return false;
          }

          return (
            value.getFullYear() ===
              today.getFullYear() &&
            value.getMonth() ===
              today.getMonth() &&
            value.getDate() ===
              today.getDate()
          );
        };


            /**
       * Mengelompokkan jumlah transaksi stok menurut tanggal untuk grafik laporan.
       */
      const buildTransactionSeries = (chartPeriod) => stockTransactionSeries(stockTransactions, chartPeriod);


      /* =================================================
         LOW STOCK
      ================================================= */

      const lowStockItems =
        stock
          .filter(
            (item) =>
              Number(
                item?.qty
              ) <=
              STOCK_ALERT_THRESHOLD
          )
          .sort(
            (a, b) =>
              Number(
                a?.qty
              ) -
              Number(
                b?.qty
              )
          )
          .slice(0, 5)
          .map(
            (item) => ({
              label:
                item?.name ||
                '-',

              value:
                Number(
                  item?.qty
                ) || 0,

              unit:
                item?.unit ||
                '',
            })
          );


      /* =================================================
         EXPIRY STOCK
      ================================================= */

      const expiryStockItems =
        stock
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
                    86400000
                );

              if (
                daysLeft < 0 ||
                daysLeft >
                  EXPIRY_ALERT_DAYS
              ) {
                return null;
              }

              return {
                label:
                  item?.name ||
                  '-',

                value:
                  daysLeft,

                unit:
                  'hari',
              };
            }
          )
          .filter(Boolean)
          .sort(
            (a, b) =>
              a.value -
              b.value
          )
          .slice(0, 5);


      /* =================================================
         1. KPI
      ================================================= */

      if (
        selected.has('kpi')
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
              width:
                75,
            },
            {
              key:
                'value',
              label:
                'Jumlah',
              width:
                25,
            },
          ],

          rows: [
            {
              label:
                'Jenis Obat Aktif',
              value:
                stock.length,
            },
            {
              label:
                'Batch Tersedia',
              value:
                availableBatchCount,
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
                exp.length,
            },
          ],
        });
      }


      /* =================================================
         2. LINE CHART MINGGU
      ================================================= */

      if (
        selected.has(
          'transactionsWeek'
        )
      ) {
        addSectionHeading(
          'Line Chart (Transaksi Stok per Minggu)'
        );

        const image =
          createAdminLineChartImage(
            buildTransactionSeries(
              'week'
            )
          );

        if (image) {
          ensureSpace(90);

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
      }


      /* =================================================
         3. LINE CHART BULAN
      ================================================= */

      if (
        selected.has(
          'transactionsMonth'
        )
      ) {
        addSectionHeading(
          'Line Chart (Transaksi Stok per Bulan)'
        );

        const image =
          createAdminLineChartImage(
            buildTransactionSeries(
              'month'
            )
          );

        if (image) {
          ensureSpace(90);

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
      }


      /* =================================================
         4. LINE CHART TAHUN
      ================================================= */

      if (
        selected.has(
          'transactionsYear'
        )
      ) {
        addSectionHeading(
          'Line Chart (Transaksi Stok per Tahun)'
        );

        const image =
          createAdminLineChartImage(
            buildTransactionSeries(
              'year'
            )
          );

        if (image) {
          ensureSpace(90);

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
      }


      /* =================================================
         5. BAR CHART LOW STOCK
      ================================================= */

      if (
        selected.has(
          'lowStock'
        )
      ) {
        addSectionHeading(
          'Bar Chart (Stok Obat Hampir Habis)'
        );

        const image =
          createAdminBarChartImage(
            lowStockItems
          );

        if (image) {
          ensureSpace(90);

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
        } else {
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


      /* =================================================
         6. BAR CHART EXPIRY
      ================================================= */

      if (
        selected.has(
          'expiryStock'
        )
      ) {
        addSectionHeading(
          'Bar Chart (Stok Obat Hampir Kedaluwarsa)'
        );

        const image =
          createAdminBarChartImage(
            expiryStockItems
          );

        if (image) {
          ensureSpace(90);

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
        } else {
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


      /* =================================================
         7-8. RIWAYAT AKSES
      ================================================= */

      /**
       * Menggambar bagian aktivitas pada dokumen atau visualisasi yang sedang disusun.
       */
      const drawActivities =
        (
          title,
          source
        ) => {
          addSectionHeading(
            title
          );

          const rows =
            source
              .slice()
              .sort(
                (a, b) =>
                  new Date(
                    b?.time || 0
                  ) -
                  new Date(
                    a?.time || 0
                  )
              )
              .map(
                (item) => ({
                  name:
                    item?.user ||
                    '-',

                  role:
                    item?.roleLabel ||
                    '-',

                  action:
                    item?.action ||
                    '-',

                  time:
                    item?.time
                      ? formatDateTimeWita(item.time)
                      : '-',
                })
              );


          drawTable({
            columns: [
              {
                key:
                  'name',

                label:
                  'Nama Lengkap',

                width:
                  35,
              },

              {
                key:
                  'role',

                label:
                  'Hak Akses',

                width:
                  35,
              },

              {
                key:
                  'action',

                label:
                  'Aktivitas',

                width:
                  25,
              },

              {
                key:
                  'time',

                label:
                  'Waktu',

                width:
                  45,
              },
            ],

            rows:
              rows.length
                ? rows
                : [
                    {
                      name:
                        '-',

                      role:
                        '-',

                      action:
                        '-',

                      time:
                        'Belum ada aktivitas',
                    },
                  ],
          });
        };


      if (
        selected.has(
          'activitiesAll'
        )
      ) {
        drawActivities(
          'Riwayat Akses (Semua)',
          activities
        );
      }


      if (
        selected.has(
          'activitiesToday'
        )
      ) {
        drawActivities(
          'Riwayat Akses (Hari Ini)',
          activities.filter(
            (
              activity
            ) =>
              isToday(
                activity?.time
              )
          )
        );
      }


      /* =================================================
         9. MANAJEMEN AKUN
      ================================================= */

      if (
        selected.has(
          'accounts'
        )
      ) {
        addSectionHeading(
          'Manajemen Akun'
        );

        const accountEntries =
          Array.isArray(
            data?.users
          )
            ? data.users
            : Object.values(
                data?.users ||
                  {}
              );


                /**
         * Mengubah kode role internal menjadi label hak akses yang dapat dibaca pada laporan Admin.
         */
        const getAccountRoleLabel =
          (
            accountRole
          ) => {
            switch (
              String(
                accountRole ||
                  ''
              ).toLowerCase()
            ) {
              case 'admin':
                return 'Admin';

              case 'pharmacy':
                return 'Apoteker';

              case 'doctor':
                return 'Dokter FKTP';

              default:
                return (
                  ROLE_LABELS?.[
                    accountRole
                  ] ||
                  accountRole ||
                  '-'
                );
            }
          };


        const accountRows =
          accountEntries
            .map(
              (account) => ({
                name:
                  String(
                    account?.username ||
                      ''
                  ).trim() ||
                  String(
                    account?.name ||
                      ''
                  ).trim() ||
                  '-',

                role:
                  getAccountRoleLabel(
                    account?.role
                  ),

                nik:
                  account?.nik ||
                  '-',

                createdAt:
                  account?.createdAt
                    ? formatCalendarDate(account.createdAt)
                    : '-',
              })
            )
            .sort(
              (
                a,
                b
              ) =>
                a.name.localeCompare(
                  b.name,
                  'id',
                  {
                    sensitivity:
                      'base',
                  }
                )
            );


        drawTable({
          fontSize:
            7.5,

          columns: [
            {
              key:
                'name',

              label:
                'Nama Lengkap',

              width:
                50,
            },

            {
              key:
                'role',

              label:
                'Hak Akses',

              width:
                45,
            },

            {
              key:
                'nik',

              label:
                'NIK',

              width:
                35,
            },

            {
              key:
                'createdAt',

              label:
                'Tanggal Dibuat',

              width:
                45,
            },
          ],

          rows:
            accountRows.length
              ? accountRows
              : [
                  {
                    name:
                      '-',

                    role:
                      '-',

                    nik:
                      '-',

                    createdAt:
                      'Belum ada data akun',
                  },
                ],
        });
      }


      /* =================================================
         10. STOK OBAT
      ================================================= */

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
                (
                  item
                ) => ({
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
          'REMS - Laporan Apotek',
          margin,
          pageHeight -
            7
        );

        pdf.text(
          `Halaman ${page} dari ${totalPages}`,
          pageWidth -
            margin,
          pageHeight -
            7,
          {
            align:
              'right',
          }
        );
      }


      /* =================================================
         DOWNLOAD
      ================================================= */

      pdf.save(
        `laporan-admin-${Date.now()}.pdf`
      );

      onExport?.();

      setExportModalOpen(
        false
      );

    } catch (
      error
    ) {
      console.error(
        'Error ekspor laporan admin:',
        error
      );

      notify?.(
        'Gagal membuat laporan PDF.',
        'warning'
      );
    }
  };
};
