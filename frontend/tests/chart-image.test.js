import test from 'node:test';
import assert from 'node:assert/strict';

import { createAdminBarChartImage } from '../src/lib/adminBarChartImage.js';
import { createDashboardBarChartImage } from '../src/lib/dashboardBarChartImage.js';
import { createAdminLineChartImage } from '../src/lib/adminLineChartImage.js';
import { createDashboardLineChartImage } from '../src/lib/dashboardLineChartImage.js';

function createCanvasMock({ supportsRoundRect = true } = {}) {
  const calls = [];
  const context = {
    roundRect: supportsRoundRect ? (...args) => calls.push(['roundRect', ...args]) : undefined,
  };

  for (const method of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fillText', 'arc', 'fill', 'rect']) {
    context[method] = (...args) => calls.push([method, ...args]);
  }

  return {
    calls,
    canvas: {
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: (type, quality) => `data:${type};quality=${quality}`,
    },
  };
}

test('alias grafik Admin dan Dashboard menggunakan helper bersama', () => {
  assert.equal(createAdminBarChartImage, createDashboardBarChartImage);
  assert.equal(createAdminLineChartImage, createDashboardLineChartImage);
});

test('helper grafik mengembalikan null ketika data kosong', () => {
  assert.equal(createAdminBarChartImage([]), null);
  assert.equal(createDashboardBarChartImage(null), null);
  assert.equal(createAdminLineChartImage([]), null);
  assert.equal(createDashboardLineChartImage(undefined), null);
});

test('helper grafik batang menghasilkan PNG dan mendukung fallback rectangle', () => {
  const originalDocument = globalThis.document;
  const mock = createCanvasMock({ supportsRoundRect: false });
  globalThis.document = { createElement: () => mock.canvas };

  try {
    assert.equal(createAdminBarChartImage([{ label: 'Senin', value: 4 }]), 'data:image/png;quality=1');
    assert.equal(mock.canvas.width, 1400);
    assert.equal(mock.canvas.height, 650);
    assert.ok(mock.calls.some(([method]) => method === 'rect'));
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('helper grafik garis menghasilkan PNG dan memetakan satu titik di tengah', () => {
  const originalDocument = globalThis.document;
  const mock = createCanvasMock();
  globalThis.document = { createElement: () => mock.canvas };

  try {
    assert.equal(createDashboardLineChartImage([{ label: 'Hari ini', value: 3 }]), 'data:image/png;quality=1');
    const moveToCalls = mock.calls.filter(([method]) => method === 'moveTo');
    assert.deepEqual(moveToCalls.at(-1), ['moveTo', 710, 70]);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
