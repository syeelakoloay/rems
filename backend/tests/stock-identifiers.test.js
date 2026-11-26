import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMedicationName,
  normalizeManufacturer,
  normalizeBatchNumber,
} from '../src/utils/stock-identifiers.js';

test('medication identity normalizes name and manufacturer separately', () => {
  const name = normalizeMedicationName('  Paracetamol  ');
  const manufacturerA = normalizeManufacturer(' PT Farma A ');
  const manufacturerB = normalizeManufacturer('PT Farma B');

  assert.equal(name, 'paracetamol');
  assert.equal(normalizeMedicationName('PARACETAMOL'), name);
  assert.equal(normalizeManufacturer('pt farma a'), manufacturerA);
  assert.notEqual(manufacturerA, manufacturerB);
});

test('missing manufacturer has one stable normalized value', () => {
  assert.equal(normalizeManufacturer(''), '-');
  assert.equal(normalizeManufacturer(null), '-');
  assert.equal(normalizeManufacturer(' - '), '-');
});

test('batch number comparison ignores outer whitespace and letter case', () => {
  assert.equal(normalizeBatchNumber('  Ab-123  '), 'AB-123');
  assert.equal(normalizeBatchNumber('ab-123'), 'AB-123');
  assert.notEqual(normalizeBatchNumber('AB-123'), normalizeBatchNumber('AB-124'));
});
