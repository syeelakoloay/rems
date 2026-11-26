/**
 * Menampilkan grafik ringkasan yang digunakan pada dashboard Admin.
 */

import { Card } from '../ui/Card';
import { SearchableSelect } from '../ui/Field';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ChartEmptyState } from '../ui/ChartEmptyState';

/**
 * Merender komponen Admin dashboard grafik dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function AdminDashboardCharts(props) {
  const { period, setPeriod, transactionSeries, transactionChartRef, hasChartData, stockFilter, setStockFilter, stockSeries, stockChartRef } = props;

  return (
<div className="dashboard-chart-grid">

        {/* LINE CHART */}

        <Card>

          <div className="section-head">

            <div>
              <h3>
                Transaksi Stok
              </h3>

              <p>
                Jumlah transaksi stok berdasarkan periode.
              </p>
            </div>


            <SearchableSelect
              className="control control-compact"
              wrapperClassName="chart-filter-dropdown"
              value={
                period
              }
              onChange={(e) =>
                setPeriod(
                  e.target.value
                )
              }
            >
              <option value="day">
                Hari
              </option>

              <option value="week">
                Minggu
              </option>

              <option value="month">
                Bulan
              </option>

              <option value="year">
                Tahun
              </option>
            </SearchableSelect>

          </div>


          <div
            className="chart-shell"
            ref={
              transactionChartRef
            }
          >

            {hasChartData(transactionSeries) ? (
              <ResponsiveContainer
                width="100%"
                height={280}
              >

              <LineChart
                data={
                  transactionSeries
                }
                margin={{
                  right: 60,
                  left: 0,
                }}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="label"
                />

                <YAxis
                  allowDecimals={false}
                />

                <Tooltip />

                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#176f83"
                    strokeWidth={3}
                  />

                </LineChart>

              </ResponsiveContainer>
            ) : (
              <ChartEmptyState message="Belum ada transaksi stok pada periode ini." />
            )}

          </div>

        </Card>


        {/* BAR CHART */}

        <Card>

          <div className="section-head">

            <div>
              <h3>
                Stok Obat
              </h3>

              <p>
                Stok yang perlu ditindaklanjuti.
              </p>
            </div>


            <SearchableSelect
              className="control control-compact"
              wrapperClassName="chart-filter-dropdown"
              value={
                stockFilter
              }
              onChange={(e) =>
                setStockFilter(
                  e.target.value
                )
              }
            >
              <option value="low">
                Hampir Habis
              </option>

              <option value="expiry">
                Hampir Kedaluwarsa
              </option>
            </SearchableSelect>

          </div>


          <div
            className="chart-shell admin-dashboard-stock-chart"
            ref={
              stockChartRef
            }
          >

            {stockSeries.length ===
            0 ? (
              <ChartEmptyState
                message={
                  stockFilter ===
                  'expiry'
                    ? 'Tidak ada stok obat yang hampir kedaluwarsa.'
                    : 'Tidak ada stok obat yang hampir habis.'
                }
              />
            ) : (
              <ResponsiveContainer
                width="100%"
                height={280}
              >
                <BarChart
                  data={
                    stockSeries
                  }
                  layout="vertical"
                  margin={{
                    top: 8,
                    right: 12,
                    bottom: 8,
                    left: 0,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                  />

                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickFormatter={(value) =>
                      stockFilter === 'expiry'
                        ? `${value} hari`
                        : value
                    }
                  />

                  <YAxis
                    type="category"
                    dataKey="label"
                    width={88}
                    tick={{ fontSize: 9 }}
                    tickMargin={6}
                    interval={0}
                  />

                  <Tooltip
                    content={({
                      active,
                      payload,
                    }) => {
                      if (
                        !active ||
                        !payload ||
                        !payload.length
                      ) {
                        return null;
                      }

                      const item =
                        payload[0]
                          ?.payload;

                      if (
                        !item
                      ) {
                        return null;
                      }

                      return (
                        <div
                          style={{
                            background:
                              'rgba(255, 255, 255, 0.96)',

                            border:
                              '1px solid rgba(148, 163, 184, 0.22)',

                            borderRadius:
                              '12px',

                            padding:
                              '10px 12px',

                            boxShadow:
                              '0 8px 24px rgba(15, 23, 42, 0.10)',
                          }}
                        >

                          <div
                            style={{
                              fontWeight:
                                700,

                              color:
                                'var(--text-primary, #0f172a)',

                              lineHeight:
                                1.3,
                            }}
                          >
                            {
                              item.label ||
                              '-'
                            }
                          </div>


                          <div
                            style={{
                              marginTop:
                                '3px',

                              fontSize:
                                '0.78rem',

                              color:
                                'var(--text-muted, #64748b)',

                              lineHeight:
                                1.3,
                            }}
                          >
                            {
                              item.manufacturer ||
                              '-'
                            }
                          </div>


                          <div
                            style={{
                              marginTop:
                                '8px',

                              fontSize:
                                '0.82rem',

                              color:
                                'var(--text-primary, #0f172a)',
                            }}
                          >
                            {
                              stockFilter ===
                              'expiry'
                                ? `${item.value} hari`
                                : `${item.value} ${
                                    item.unit ||
                                    ''
                                  }`
                            }
                          </div>

                        </div>
                      );
                    }}
                  />


                  <Bar
                    dataKey="value"
                    fill="#176f83"
                    radius={[
                      0,
                      8,
                      8,
                      0,
                    ]}
                  />

                </BarChart>
              </ResponsiveContainer>
            )}

          </div>

        </Card>

      </div>
  );
}
