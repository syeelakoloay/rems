import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPdfFile, hasPdfSignature } from '../src/utils/fileValidation.js';
import { createLegacyPrescriptionId, createTransactionId } from '../src/utils/ids.js';
import { allowRoles } from '../src/middleware/role.middleware.js';
import { createHashedRandomToken, hashToken } from '../src/utils/security-tokens.js';
import { normalizeBpjs, normalizeNik, matchesRegisteredPatientIdentifiers } from '../src/utils/patient-identifiers.js';

test('PDF signature accepts a header in the first 1 KB', () => {
  const buffer = Buffer.alloc(1024, 0x20);
  Buffer.from('%PDF-').copy(buffer, 1000);
  assert.equal(hasPdfSignature(buffer), true);
});

test('PDF signature rejects non-PDF content and a header outside the allowed prefix', () => {
  assert.equal(hasPdfSignature(Buffer.from('<html>not a PDF</html>')), false);
  const buffer = Buffer.alloc(1030, 0x20);
  Buffer.from('%PDF-').copy(buffer, 1024);
  assert.equal(hasPdfSignature(buffer), false);
});

test('PDF validation returns a valid file unchanged', () => {
  const file = {
    buffer: Buffer.from('%PDF-1.7\nbody'),
    size: 13,
    originalname: 'document.pdf',
  };
  assert.equal(assertPdfFile(file), file);
});

test('PDF validation rejects invalid signatures with a client error', () => {
  assert.throws(
    () => assertPdfFile({ buffer: Buffer.from('not-pdf'), size: 7 }),
    (error) => error.name === 'AppError' && error.statusCode === 422 && error.code === 'INVALID_FILE_TYPE',
  );
});

test('PDF validation enforces the 5 MB file limit', () => {
  const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
  Buffer.from('%PDF-').copy(buffer);
  assert.throws(
    () => assertPdfFile({ buffer, size: buffer.length }),
    (error) => error.name === 'AppError' && error.statusCode === 422 && error.code === 'FILE_TOO_LARGE',
  );
});

test('public prescription IDs retain the RX plus eight numeric digits format', () => {
  assert.match(createLegacyPrescriptionId(), /^RX\d{8}$/);
});

test('stock transaction IDs retain their 16-digit numeric format', () => {
  assert.match(createTransactionId(), /^\d{16}$/);
});


test('Admin retains read-only access when an endpoint permits admin and pharmacy', () => {
  let forwardedError;
  allowRoles('admin', 'pharmacy')(
    { authUser: { role: 'admin' } },
    {},
    (error) => { forwardedError = error; },
  );
  assert.equal(forwardedError, undefined);
});

test('Admin is forbidden from stock mutations reserved for pharmacy', () => {
  let forwardedError;
  allowRoles('pharmacy')(
    { authUser: { role: 'admin' } },
    {},
    (error) => { forwardedError = error; },
  );
  assert.equal(forwardedError?.statusCode, 403);
  assert.equal(forwardedError?.code, 'FORBIDDEN');
});

test('Pharmacy is allowed to perform stock mutations', () => {
  let forwardedError;
  allowRoles('pharmacy')(
    { authUser: { role: 'pharmacy' } },
    {},
    (error) => { forwardedError = error; },
  );
  assert.equal(forwardedError, undefined);
});


test('BPJS normalization removes formatting characters and preserves digits', () => {
  assert.equal(normalizeBpjs('12.345-678 901 23'), '1234567890123');
  assert.equal(normalizeBpjs(null), '');
  assert.equal(normalizeBpjs(0), '0');
});

test('registered BPJS and NIK values cannot be replaced during prescription creation', () => {
  const patient = { bpjsNumber: '1234567890123', nik: '1234567890123456' };
  assert.equal(matchesRegisteredPatientIdentifiers(patient, '1234567890123', '1234567890123456'), true);
  assert.equal(matchesRegisteredPatientIdentifiers(patient, '9999999999999', '1234567890123456'), false);
  assert.equal(matchesRegisteredPatientIdentifiers(patient, '1234567890123', '9999999999999999'), false);
  assert.equal(normalizeNik('12.345-678 901 234 56'), '1234567890123456');
});

test('missing legacy identifiers may be supplied without replacing an existing identifier', () => {
  assert.equal(matchesRegisteredPatientIdentifiers({ bpjsNumber: '1234567890123', nik: '' }, '1234567890123', '1234567890123456'), true);
  assert.equal(matchesRegisteredPatientIdentifiers({ bpjsNumber: '', nik: '1234567890123456' }, '1234567890123', '1234567890123456'), true);
});

test('hashed random token helper returns unique raw tokens and matching SHA-256 hashes', () => {
  const first = createHashedRandomToken();
  const second = createHashedRandomToken();

  for (const result of [first, second]) {
    assert.match(result.token, /^[a-f0-9]{64}$/);
    assert.match(result.tokenHash, /^[a-f0-9]{64}$/);
    assert.notEqual(result.token, result.tokenHash);
    assert.equal(hashToken(result.token), result.tokenHash);
  }

  assert.notEqual(first.token, second.token);
});
