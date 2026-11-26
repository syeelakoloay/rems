/** Membentuk data awal formulir dari resep terakhir pasien setelah hak akses penugasan FKTP terpenuhi. */

function getReferenceId(value) {
  if (value && typeof value === 'object' && value._id) return String(value._id);
  return value == null ? '' : String(value);
}

/**
 * Mengembalikan identitas dan seluruh rincian resep terakhir pasien untuk pengisian formulir.
 * Pemanggil wajib memastikan pasien telah ditugaskan kepada dokter yang sedang login sebelum helper ini digunakan.
 */
export function buildPatientPrescriptionPrefill({ patient, latestPrescription, userId }) {
  const snapshot = latestPrescription?.patientSnapshot || {};
  const patientData = {
    id: String(patient._id),
    bpjsNumber: String(snapshot.bpjsNumber || latestPrescription?.bpjsNumber || patient.bpjsNumber || ''),
    nik: String(snapshot.nik || latestPrescription?.nik || patient.nik || ''),
    name: String(snapshot.name || latestPrescription?.patientName || patient.name || ''),
    dateOfBirth: snapshot.dateOfBirth || patient.dateOfBirth || null,
    gender: String(snapshot.gender || patient.gender || ''),
    phone: String(snapshot.phone || latestPrescription?.patientPhone || patient.phone || ''),
    address: String(snapshot.address || patient.address || ''),
  };

  const latestPrescriptionIdentity = latestPrescription
    ? {
        _id: String(latestPrescription._id),
        createdAt: latestPrescription.createdAt,
        patientName: patientData.name,
        patientPhone: patientData.phone,
        bpjsNumber: patientData.bpjsNumber,
        nik: patientData.nik,
        patientSnapshot: {
          name: patientData.name,
          bpjsNumber: patientData.bpjsNumber,
          nik: patientData.nik,
          phone: patientData.phone,
          dateOfBirth: patientData.dateOfBirth,
          gender: patientData.gender,
          address: patientData.address,
        },
      }
    : null;

  const prescription = latestPrescription
    ? {
        allergy: {
          status: String(latestPrescription.allergy?.status || ''),
          details: String(latestPrescription.allergy?.details || ''),
        },
        anthropometry: {
          weight: latestPrescription.anthropometry?.weight ?? null,
          height: latestPrescription.anthropometry?.height ?? null,
          waistCircumference: latestPrescription.anthropometry?.waistCircumference ?? null,
        },
        soap: {
          subjective: String(latestPrescription.soap?.subjective || ''),
          objective: String(latestPrescription.soap?.objective || ''),
          assessment: String(latestPrescription.soap?.assessment || ''),
          plan: String(latestPrescription.soap?.plan || ''),
        },
        diagnosis: String(latestPrescription.diagnosis || ''),
        meds: (latestPrescription.medications || []).map((medicine) => ({
          medicationId: getReferenceId(medicine.medicationId),
          medicationName: String(medicine.medicationName || ''),
          med: String(medicine.medicationName || ''),
          quantity: medicine.quantity,
          q: medicine.quantity,
          unit: String(medicine.unit || ''),
          u: String(medicine.unit || ''),
          duration: medicine.duration,
          dn: medicine.duration,
          durationUnit: String(medicine.durationUnit || 'Hari'),
          du: String(medicine.durationUnit || 'Hari'),
          doseInstruction: String(medicine.doseInstruction || ''),
          aturanPakai: String(medicine.doseInstruction || ''),
          frequency: String(medicine.frequency || ''),
          dose: String(medicine.dose || ''),
          doseUnit: String(medicine.doseUnit || ''),
          route: String(medicine.route || ''),
          shake: String(medicine.shake || 'Tidak'),
          notes: String(medicine.notes || ''),
          catatanTambahan: String(medicine.notes || ''),
        })),
      }
    : null;

  return {
    patient: patientData,
    latestPrescription: latestPrescriptionIdentity,
    prescription,
  };
}
