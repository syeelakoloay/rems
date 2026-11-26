/** Empty state bersama untuk grafik dashboard. */
export function ChartEmptyState({ message }) {
  return (
    <div className="chart-empty-state">
      <strong>Belum ada data</strong>
      <span>{message}</span>
    </div>
  );
}
