/**
 * Konstanta dan helper untuk menghasilkan gambar grafik yang digunakan pada ekspor PDF.
 */
const CHART_WIDTH = 1400;
const CHART_HEIGHT = 650;
const GRID_COUNT = 5;
const GRID_COLOR = '#e2e8f0';
const GRID_LABEL_COLOR = '#64748b';
const SERIES_COLOR = '#176f83';
const VALUE_LABEL_COLOR = '#1e3a8a';
const AXIS_LABEL_COLOR = '#334155';

function createChartCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = CHART_WIDTH;
  canvas.height = CHART_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

  return { canvas, context };
}

function drawHorizontalGrid(context, padding, chartHeight, chartWidth, maxValue) {
  context.strokeStyle = GRID_COLOR;
  context.lineWidth = 1;

  for (let index = 0; index <= GRID_COUNT; index += 1) {
    const y = padding.top + chartHeight - (chartHeight * index) / GRID_COUNT;
    const value = Math.round((maxValue * index) / GRID_COUNT);

    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(padding.left + chartWidth, y);
    context.stroke();

    context.fillStyle = GRID_LABEL_COLOR;
    context.font = '24px Arial';
    context.fillText(String(value), 25, y + 8);
  }
}

/**
 * Menghasilkan gambar grafik batang dari data berlabel dan bernilai numerik.
 * Mengembalikan null ketika data kosong atau context canvas tidak tersedia.
 */
export function createBarChartImage(items) {
  if (!items?.length) return null;

  const chart = createChartCanvas();
  if (!chart) return null;

  const { canvas, context } = chart;
  const padding = { top: 70, right: 70, bottom: 100, left: 90 };
  const chartWidth = CHART_WIDTH - padding.left - padding.right;
  const chartHeight = CHART_HEIGHT - padding.top - padding.bottom;
  const values = items.map((item) => Number(item.value) || 0);
  const maxValue = Math.max(...values, 1);

  drawHorizontalGrid(context, padding, chartHeight, chartWidth, maxValue);

  const gap = 80;
  const barWidth = (chartWidth - gap * (items.length + 1)) / Math.max(items.length, 1);

  items.forEach((item, index) => {
    const value = Number(item.value) || 0;
    const barHeight = (value / maxValue) * chartHeight;
    const x = padding.left + gap + index * (barWidth + gap);
    const y = padding.top + chartHeight - barHeight;

    context.fillStyle = SERIES_COLOR;
    context.beginPath();

    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, barWidth, barHeight, 14);
    } else {
      context.rect(x, y, barWidth, barHeight);
    }

    context.fill();

    context.fillStyle = VALUE_LABEL_COLOR;
    context.font = 'bold 24px Arial';
    context.textAlign = 'center';
    context.fillText(String(value), x + barWidth / 2, y - 12);

    context.fillStyle = AXIS_LABEL_COLOR;
    context.font = '24px Arial';
    context.fillText(item.label, x + barWidth / 2, CHART_HEIGHT - 40);
  });

  context.textAlign = 'left';
  return canvas.toDataURL('image/png', 1);
}

/**
 * Menghasilkan gambar grafik garis dari data berlabel dan bernilai numerik.
 * Mengembalikan null ketika data kosong atau context canvas tidak tersedia.
 */
export function createLineChartImage(items) {
  if (!items?.length) return null;

  const chart = createChartCanvas();
  if (!chart) return null;

  const { canvas, context } = chart;
  const padding = { top: 70, right: 70, bottom: 90, left: 90 };
  const chartWidth = CHART_WIDTH - padding.left - padding.right;
  const chartHeight = CHART_HEIGHT - padding.top - padding.bottom;
  const values = items.map((item) => Number(item.value) || 0);
  const maxValue = Math.max(...values, 1);

  drawHorizontalGrid(context, padding, chartHeight, chartWidth, maxValue);

  const points = items.map((item, index) => {
    const x = items.length === 1
      ? padding.left + chartWidth / 2
      : padding.left + (chartWidth * index) / (items.length - 1);
    const value = Number(item.value) || 0;
    const y = padding.top + chartHeight - (value / maxValue) * chartHeight;

    return { x, y, label: item.label };
  });

  context.strokeStyle = SERIES_COLOR;
  context.lineWidth = 7;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.beginPath();

  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });

  context.stroke();

  points.forEach((point) => {
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(point.x, point.y, 9, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = SERIES_COLOR;
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = AXIS_LABEL_COLOR;
    context.font = '22px Arial';
    context.textAlign = 'center';
    context.fillText(point.label, point.x, CHART_HEIGHT - 30);
  });

  context.textAlign = 'left';
  return canvas.toDataURL('image/png', 1);
}
