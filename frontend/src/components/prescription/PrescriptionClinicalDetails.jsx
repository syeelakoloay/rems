/** Menampilkan snapshot identitas, administrasi kunjungan, dan data klinis yang tersimpan pada sebuah resep. */

import { Card } from '../ui/Card';
import { formatDate as formatCalendarDate } from '../../lib/date';

const display = (value) => value === null || value === undefined || String(value).trim() === '' ? '-' : value;

export function PrescriptionClinicalDetails({ prescription, administrationTitle = 'Informasi Administrasi', administrationFirst = true }) {
  if (!prescription) return null;
  const patient = prescription.patientSnapshot || {};
  const allergy = prescription.allergy || {};
  const body = prescription.anthropometry || {};
  const soap = prescription.soap || {};
  const dateOfBirth = patient.dateOfBirth ? formatCalendarDate(patient.dateOfBirth) : '-';
  const allergyStatus = allergy.status === 'Tidak ada alergi yang diketahui' ? 'Tidak ada alergi' : allergy.status === 'Belum diketahui/belum dikaji' ? 'Belum diketahui' : allergy.status;

  const administrationCard = (
    <Card key="administration">
      <div className="section-head tight"><div><h3>{administrationTitle}</h3></div></div>
      <div className="preview-grid">
        <div className="preview-item"><span>No. Kunjungan</span><strong>{display(prescription.visitNumber)}</strong></div>
      </div>
    </Card>
  );
  const patientCard = (
    <Card key="patient">
      <div className="section-head tight"><div><h3>Data Pasien</h3></div></div>
      <div className="preview-grid">
        <div className="preview-item"><span>No. BPJS/JKN/KIS</span><strong>{display(prescription.bpjsNumber || patient.bpjsNumber)}</strong></div>
        <div className="preview-item"><span>NIK</span><strong>{display(prescription.nik || patient.nik)}</strong></div>
        <div className="preview-item"><span>Nama Pasien</span><strong>{display(patient.name || prescription.patientName)}</strong></div>
        <div className="preview-item"><span>Tanggal Lahir</span><strong>{dateOfBirth}</strong></div>
        <div className="preview-item"><span>Usia Saat Resep Dibuat</span><strong>{patient.age == null ? '-' : `${patient.age} tahun`}</strong></div>
        <div className="preview-item"><span>Jenis Kelamin</span><strong>{display(patient.gender)}</strong></div>
        <div className="preview-item"><span>No. Telp</span><strong>{display(patient.phone || prescription.patientPhone)}</strong></div>
        <div className="preview-item"><span>Alamat</span><strong>{display(patient.address)}</strong></div>
      </div>
    </Card>
  );

  return (
    <div className="stack">
      {administrationFirst ? administrationCard : patientCard}
      {administrationFirst ? patientCard : administrationCard}
      <Card>
        <div className="section-head tight"><div><h3>Data Kesehatan</h3></div></div>
        <div className="preview-grid">
          <div className="preview-item"><span>Riwayat Alergi</span><strong>{display(allergyStatus)}</strong></div>
          <div className="preview-item"><span>Detail Alergi</span><strong>{display(allergy.details)}</strong></div>
          <div className="preview-item"><span>Berat Badan (kg)</span><strong>{body.weight == null ? '-' : `${body.weight} kg`}</strong></div>
          <div className="preview-item"><span>Tinggi Badan (cm)</span><strong>{body.height == null ? '-' : `${body.height} cm`}</strong></div>
          <div className="preview-item"><span>Lingkar Perut (cm)</span><strong>{body.waistCircumference == null ? '-' : `${body.waistCircumference} cm`}</strong></div>
        </div>
      </Card>
      <Card>
        <div className="section-head tight"><div><h3>Pemeriksaan Klinis</h3></div></div>
        <div className="preview-grid">
          <div className="preview-item"><span>Subjective</span><strong>{display(soap.subjective)}</strong></div>
          <div className="preview-item"><span>Objective</span><strong>{display(soap.objective)}</strong></div>
          <div className="preview-item"><span>Assessment</span><strong>{display(soap.assessment)}</strong></div>
          <div className="preview-item"><span>Plan</span><strong>{display(soap.plan)}</strong></div>
        </div>
      </Card>
      <Card>
        <div className="section-head tight"><div><h3>Diagnosis</h3></div></div>
        <div className="preview-grid">
          <div className="preview-item"><span>Diagnosis</span><strong>{display(prescription.diagnosis)}</strong></div>
        </div>
      </Card>
    </div>
  );
}
