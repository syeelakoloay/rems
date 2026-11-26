/** Validasi payload resep dan pembaruan resep. */
import { z } from 'zod';

const medicine = z.object({
  medicationId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Identitas master obat tidak valid.'),
  med: z.string().trim().min(1),
  q: z.coerce.number().int().min(1),
  u: z.string().trim().min(1),
  dn: z.coerce.number().int().min(1).default(1),
  du: z.string().trim().default('hari'),
  doseInstruction: z.string().trim().min(1),
  aturanPakai: z.string().trim().optional(),
  frequency: z.string().optional().default(''),
  dose: z.string().optional().default(''),
  doseUnit: z.string().optional().default(''),
  route: z.string().optional().default('Obat dalam/diminum'),
  shake: z.string().optional().default('Tidak'),
  notes: z.string().optional().default(''),
  catatanTambahan: z.string().optional(),
});

const identityFields = {
  patientId: z.string().optional().nullable(),
  patientName: z.string().trim().min(1),
  patientPhone: z.string().trim().min(1).regex(/^[0-9+-]+$/, 'Nomor telepon hanya boleh berisi angka, tanda +, atau tanda -.'),
  patientType: z.literal('Kronis'),
  bpjsNumber: z.string().trim().regex(/^\d{13}$/, 'Nomor BPJS harus terdiri dari 13 digit angka.'),
  nik: z.string().trim().regex(/^\d{16}$/, 'NIK harus terdiri dari 16 digit angka.'),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(['Laki-laki', 'Perempuan', '']).optional().default(''),
  address: z.string().optional().default(''),
  allergy: z.object({ status: z.enum(['Ada alergi', 'Tidak ada alergi', 'Belum diketahui', 'Tidak ada alergi yang diketahui', 'Belum diketahui/belum dikaji']), details: z.string().optional().default('') }),
  anthropometry: z.object({
    weight: z.union([z.number(), z.string(), z.null()]).optional(),
    height: z.union([z.number(), z.string(), z.null()]).optional(),
    waistCircumference: z.union([z.number(), z.string(), z.null()]).optional(),
  }).optional().default({}),
  soap: z.object({
    subjective: z.string().optional().default(''),
    objective: z.string().optional().default(''),
    assessment: z.string().optional().default(''),
    plan: z.string().optional().default(''),
  }).optional().default({}),
  visitNumber: z.string().trim().min(1, 'No. Kunjungan wajib diisi.'),
};

export const createPrescriptionSchema = z.object({
  ...identityFields,
  diagnosis: z.string().trim().min(1),
  meds: z.array(medicine).min(1),
});

export const updatePrescriptionSchema = z.object({
  diagnosis: z.string().trim().min(1),
  meds: z.array(medicine).min(1),
}).strict();
