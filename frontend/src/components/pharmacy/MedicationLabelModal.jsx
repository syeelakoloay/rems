/**
 * Menyusun serta menampilkan label obat untuk dicetak atau diunduh.
 */
import { formatDate as formatCalendarDate } from '../../lib/date';
import { useMemo } from 'react';
import { Printer, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { capitalizeFirstLetter } from '../../lib/text';

const LABEL_WIDTH_MM = 60;
const LABEL_CARD_WIDTH_MM = 56;
const LABEL_CONTENT_X = 4.7;
const LABEL_CONTENT_WIDTH = 50.6;
const LABEL_RIGHT_X = LABEL_CONTENT_X + LABEL_CONTENT_WIDTH;
const LABEL_ADDRESS_LINES = [
  'CXJG+W4G, Jl. Arnold Mononutu, Sarongsong,',
  'Kab. Minahasa Utara, Sulawesi Utara',
];

/** Mengambil tanggal resep ditebus oleh Apoteker, bukan tanggal resep dibuat atau tanggal etiket dicetak. */
const getRedeemedDate = (prescription) =>
  prescription?.pickedAt || prescription?.redeemedAt || prescription?.dispensedAt || null;

/** Menyusun nilai Tanggal Resep beserta tanggal pencetakan etiket untuk satu baris metadata. */
const getLabelDateText = (prescription) => {
  const redeemedAt = getRedeemedDate(prescription);
  const redeemedDate = redeemedAt ? formatCalendarDate(redeemedAt) : '-';
  const printedDate = formatCalendarDate(new Date());
  return `${redeemedDate} (Dicetak: ${printedDate})`;
};

/** Menentukan orientasi halaman khusus agar jsPDF tidak menukar lebar dan tinggi ketika label lebih lebar daripada tinggi halaman. */
const getLabelPageOrientation = (pageHeight) =>
  LABEL_WIDTH_MM > Number(pageHeight) ? 'landscape' : 'portrait';

/**
 * Mengambil aturan pakai tersimpan dari item obat atau menyusun teks alternatif berdasarkan rincian dosis jika instruksi langsung kosong.
 */
const getInstruction = (med) => {
  if (!med) return '-';
  const direct = med.doseInstruction || med.aturanPakai || med.instruction || med.usage || med.signa || med.rule || med.directions;
  if (direct) return String(direct).trim() || '-';
  const parts = [];
  if (med.frequency) parts.push(`${med.frequency} kali sehari`);
  if (med.dose && med.doseUnit) parts.push(`${med.dose} ${med.doseUnit}`);
  else if (med.dose) parts.push(String(med.dose));
  if (med.timing) parts.push(String(med.timing));
  if (med.duration) parts.push(`selama ${med.duration}`);
  return parts.length ? parts.join(' ') : '-';
};

/**
 * Mengambil catatan tambahan obat dari nama field yang didukung dan mengembalikan string kosong bila catatan tidak tersedia.
 */
const getNotes = (med) =>
  String(med?.notes ?? med?.catatanTambahan ?? med?.note ?? '').trim() || '-';

/**
 * Menyusun data tiap label dari item obat, termasuk nama, aturan pakai, catatan, dan jumlah yang akan dicetak.
 */
const getLabelItems = (prescription) =>
  (Array.isArray(prescription?.meds) ? prescription.meds : [])
    .filter((med) => String(med?.med || med?.name || '').trim() && Number(med?.q ?? med?.qty ?? 0) > 0)
    .map((med, index) => ({
      id: `${prescription?.id || 'resep'}-${index}`,
      medication: String(med?.med || med?.name || '').trim(),
      quantity: String(med?.q ?? med?.qty ?? ''),
      unit: capitalizeFirstLetter(med?.u || med?.unit),
      instruction: getInstruction(med),
      notes: getNotes(med),
    }));

/**
 * Gaya preview dan cetak dibuat ringkas dengan lebar 60 mm serta tinggi yang mengikuti konten.
 * Tipografi menggunakan Helvetica dan ukuran yang sepadan dengan keluaran PDF.
 */
const labelStyles = `
  @page { size: 60mm 70mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Helvetica, Arial, sans-serif; font-weight: 400; }
  .etiket-preview-root {
    width: 60mm;
    margin: 0 auto;
    background: #fff;
    color: #0f172a;
    font-family: Helvetica, Arial, sans-serif;
    font-weight: 400;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .label-page {
    width: 60mm;
    height: auto;
    margin: 0 auto;
    padding: 2mm;
    page-break-after: always;
    break-after: page;
    background: #fff;
  }
  .label-page:last-child { page-break-after: auto; break-after: auto; }
  .label-card {
    width: 56mm;
    height: auto;
    min-height: 0;
    margin: 0 auto;
    border: .3mm solid #94a3b8;
    border-radius: 1.5mm;
    padding: 2.4mm;
    overflow: hidden;
    background: #fff;
    color: #0f172a;
  }
  .label-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.4mm;
    text-align: left;
  }
  .label-logo {
    display: block;
    width: 8.5mm;
    height: 8.5mm;
    flex: 0 0 8.5mm;
    object-fit: contain;
  }
  .label-header-copy { min-width: 0; }
  .pharmacy-name { font-size: 13.33px; font-weight: 700; line-height: 1.15; color: #0f172a; }
  .pharmacy-address { margin-top: .45mm; font-size: 6.6px; line-height: 1.2; color: #0f172a; }
  .pharmacy-address-line { display: block; white-space: nowrap; }
  .label-rule { margin: 1.3mm 0; border-top: .25mm solid #64748b; }
  .meta-grid { display: flex; flex-direction: column; row-gap: .6mm; margin-top: 0; }
  .meta-item { display: grid; grid-template-columns: 16mm minmax(0, 1fr); column-gap: 1mm; align-items: baseline; min-width: 0; }
  .meta-grid span { display: block; margin: 0; font-size: 6px; line-height: 1.16; color: #64748b; text-transform: none; letter-spacing: 0; }
  .meta-grid strong { display: block; min-width: 0; font-size: 7.33px; line-height: 1.16; color: #0f172a; overflow-wrap: anywhere; font-weight: 400; }
  .medicine-block { margin-top: 1.3mm; padding: 1.4mm 0 0; border-top: .25mm solid #cbd5e1; }
  .medicine-name { font-size: 9.33px; font-weight: 700; line-height: 1.2; color: #0f172a; overflow-wrap: anywhere; }
  .medicine-quantity { margin-top: .35mm; font-size: 9.33px; font-weight: 400; color: #0f172a; line-height: 1.22; }
  .instruction-inline { margin-top: .25mm; font-size: 9.33px; font-weight: 400; color: #0f172a; line-height: 1.22; overflow-wrap: anywhere; }
  .label-notes { margin-top: 1.2mm; padding-top: 1.2mm; border-top: .25mm solid #cbd5e1; }
  .label-notes span { display: block; margin-bottom: .35mm; font-size: 6px; line-height: 1.16; color: #64748b; text-transform: none; letter-spacing: 0; }
  .label-notes strong { display: block; font-size: 7.33px; line-height: 1.16; color: #0f172a; overflow-wrap: anywhere; font-weight: 400; }
  .label-footer { margin-top: 1.5mm; padding-top: 1mm; border-top: .25mm solid #cbd5e1; text-align: center; font-size: 7.33px; line-height: 1.16; font-weight: 400; color: #0f172a; }
  @media print {
    html, body { margin: 0; padding: 0; background: #fff; }
    .etiket-preview-root { width: 60mm; margin: 0; }
    .label-page { width: 60mm; margin: 0; }
  }
`;

/**
 * Mengamankan nilai html sebelum dimasukkan ke konten HTML atau dokumen.
 */
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/**
 * Menyusun markup HTML label obat dan mengamankan teks dinamis sebelum dimasukkan ke dokumen cetak.
 */
const buildLabelMarkup = (item, prescription, patient, pageIndex = 0) => {
  const prescriptionNumber = prescription?.prescriptionNumber || prescription?.recipeNumber || prescription?.id || '-';
  const logoSrc = `${window.location.origin}/logo-no%20bg.png`;
  return `
    <section class="label-page etiket-page-${pageIndex}">
      <div class="label-card">
        <header class="label-header">
          <img class="label-logo" src="${logoSrc}" alt="Logo REMS" />
          <div class="label-header-copy">
            <div class="pharmacy-name">Apotek Re'ra Farma</div>
            <div class="pharmacy-address">
              <span class="pharmacy-address-line">${escapeHtml(LABEL_ADDRESS_LINES[0])}</span>
              <span class="pharmacy-address-line">${escapeHtml(LABEL_ADDRESS_LINES[1])}</span>
            </div>
          </div>
        </header>
        <div class="label-rule"></div>
        <div class="meta-grid">
          <div class="meta-item"><span>No. Resep</span><strong>${escapeHtml(prescriptionNumber)}</strong></div>
          <div class="meta-item"><span>Tanggal Resep</span><strong>${escapeHtml(getLabelDateText(prescription))}</strong></div>
          <div class="meta-item"><span>No. BPJS</span><strong>${escapeHtml(String(patient?.bpjsNumber || patient?.bpjs || '').replace(/\D/g, '') || '-')}</strong></div>
          <div class="meta-item"><span>Nama Pasien</span><strong>${escapeHtml(patient?.name || patient?.patientName || '-')}</strong></div>
        </div>
        <div class="medicine-block">
          <div class="medicine-name">${escapeHtml(item.medication)}</div>
          <div class="medicine-quantity">${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</div>
          <div class="instruction-inline">${escapeHtml(item.instruction)}</div>
        </div>
        ${item.notes !== '-' ? `<div class="label-notes"><span>Catatan</span><strong>${escapeHtml(item.notes)}</strong></div>` : ''}
        <div class="label-footer">Semoga cepat sembuh</div>
      </div>
    </section>
  `;
};

/**
 * Membentuk baris metadata yang sama untuk perhitungan ukuran dan penggambaran PDF.
 */
const getPdfMetadata = (prescription, patient) => ([
  ['No. Resep', prescription?.prescriptionNumber || prescription?.recipeNumber || prescription?.id || '-'],
  ['Tanggal Resep', getLabelDateText(prescription)],
  ['No. BPJS', String(patient?.bpjsNumber || patient?.bpjs || prescription?.bpjsNumber || '').replace(/\D/g, '') || '-'],
  ['Nama Pasien', patient?.name || patient?.patientName || prescription?.patientName || '-'],
]);

/**
 * Mengukur tinggi label PDF berdasarkan jumlah baris aktual agar setiap halaman mengikuti kontennya.
 */
const measurePdfLabel = (measureDoc, item, prescription, patient) => {
  const valueWidth = LABEL_CONTENT_WIDTH - 17;
  let y = 15.5;
  const metadata = getPdfMetadata(prescription, patient).map(([label, value]) => {
    measureDoc.setFont('helvetica', 'normal');
    measureDoc.setFontSize(5.5);
    return { label, value: String(value || '-'), lines: measureDoc.splitTextToSize(String(value || '-'), valueWidth) };
  });

  y += 2.8;
  metadata.forEach(({ lines }) => {
    y += Math.max(2.5, lines.length * 2.5);
  });

  y += 1.6 + 2.8;
  measureDoc.setFont('helvetica', 'bold');
  measureDoc.setFontSize(7);
  const medicationLines = measureDoc.splitTextToSize(String(item.medication || '-'), LABEL_CONTENT_WIDTH);
  y += medicationLines.length * 2.9 + 0.8;

  measureDoc.setFont('helvetica', 'normal');
  measureDoc.setFontSize(7);
  y += 2.8;
  const instructionLines = measureDoc.splitTextToSize(String(item.instruction || '-'), LABEL_CONTENT_WIDTH);
  y += instructionLines.length * 2.8 + 1.2;

  let noteLines = [];
  if (item.notes && item.notes !== '-') {
    measureDoc.setFont('helvetica', 'normal');
    measureDoc.setFontSize(5.5);
    noteLines = measureDoc.splitTextToSize(String(item.notes), LABEL_CONTENT_WIDTH);
    y += 2.5 + 2.2 + noteLines.length * 2.5;
  }

  y += 1.5 + 2.8 + 3.2;
  return {
    height: Math.max(44, Math.ceil(y)),
    metadata,
    medicationLines,
    instructionLines,
    noteLines,
  };
};

/**
 * Menggambar satu halaman PDF dengan tipografi, informasi, dan ukuran kertas yang sama dengan preview.
 */
const drawPdfLabel = (doc, item, layout, logoDataUrl, pageHeight) => {
  const x = LABEL_CONTENT_X;
  const rightX = LABEL_RIGHT_X;
  let y = 4.2;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.roundedRect(2, 2, LABEL_CARD_WIDTH_MM, pageHeight - 4, 1.5, 1.5, 'S');

  doc.addImage(logoDataUrl, 'PNG', x, y, 8.5, 8.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Apotek Re'ra Farma", x + 9.9, y + 3.1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(15, 23, 42);
  doc.text(LABEL_ADDRESS_LINES[0], x + 9.9, y + 5.8);
  doc.text(LABEL_ADDRESS_LINES[1], x + 9.9, y + 8.1);

  y = 15.5;
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.25);
  doc.line(x, y, rightX, y);
  y += 2.8;

  layout.metadata.forEach(({ label, lines }) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(15, 23, 42);
    doc.text(lines, x + 17, y);
    y += Math.max(2.5, lines.length * 2.5);
  });

  y += 1.6;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.line(x, y, rightX, y);
  y += 2.8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text(layout.medicationLines, x, y);
  y += layout.medicationLines.length * 2.9 + 0.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text(`${item.quantity || '-'} ${item.unit || ''}`.trim(), x, y);
  y += 2.8;
  doc.text(layout.instructionLines, x, y);
  y += layout.instructionLines.length * 2.8 + 1.2;

  if (layout.noteLines.length) {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(x, y, rightX, y);
    y += 2.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Catatan', x, y);
    y += 2.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(15, 23, 42);
    doc.text(layout.noteLines, x, y);
    y += layout.noteLines.length * 2.5;
  }

  y += 1.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Semoga cepat sembuh', LABEL_WIDTH_MM / 2, y, { align: 'center' });
};

/**
 * Menunggu logo siap dimuat sebelum tinggi halaman dihitung dan dialog cetak dibuka.
 */
const waitForPrintImages = (printWindow) => {
  const images = Array.from(printWindow.document.images);
  return Promise.all(images.map((image) => (
    image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
          image.onload = resolve;
          image.onerror = resolve;
        })
  )));
};

/**
 * Merender komponen obat label modal dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function MedicationLabelModal({ prescription, patient, open, onClose, notify }) {
  const items = useMemo(() => getLabelItems(prescription), [prescription]);

  /**
   * Membuat berkas label obat yang dapat diunduh dari data resep atau penyiapan obat.
   */
  const downloadMedicationLabels = async () => {
    if (!prescription || !items.length) {
      notify?.('Tidak ada etiket yang dapat diunduh.', 'warning');
      return;
    }

    try {
      const logoResponse = await fetch(`${window.location.origin}/logo-no%20bg.png`);
      if (!logoResponse.ok) throw new Error('Logo REMS tidak dapat dimuat.');
      const logoBlob = await logoResponse.blob();
      const logoDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Logo REMS gagal dibaca.'));
        reader.readAsDataURL(logoBlob);
      });

      const measureDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [LABEL_WIDTH_MM, 70] });
      const layouts = items.map((item) => measurePdfLabel(measureDoc, item, prescription, patient));
      const doc = new jsPDF({
        orientation: getLabelPageOrientation(layouts[0].height),
        unit: 'mm',
        format: [LABEL_WIDTH_MM, layouts[0].height],
      });

      items.forEach((item, index) => {
        const layout = layouts[index];
        if (index > 0) doc.addPage([LABEL_WIDTH_MM, layout.height], getLabelPageOrientation(layout.height));
        drawPdfLabel(doc, item, layout, logoDataUrl, layout.height);
      });

      const fileId = String(prescription.id || prescription.legacyId || 'resep').replace(/[^a-zA-Z0-9_-]/g, '-');
      doc.save(`etiket-${fileId}.pdf`);
      notify?.('PDF etiket berhasil dibuat.', 'success');
    } catch (error) {
      console.error('Error mengunduh PDF etiket:', error);
      notify?.('PDF etiket gagal dibuat. Silakan coba lagi.', 'warning');
    }
  };

  /**
   * Membuka dialog cetak browser dengan lebar tetap 60 mm dan tinggi mengikuti konten terpanjang.
   */
  const printMedicationLabels = async () => {
    if (!prescription) {
      notify?.('Data resep tidak tersedia.', 'warning');
      return;
    }

    if (!items.length) {
      notify?.('Tidak ada obat yang dapat dicetak pada resep ini.', 'warning');
      return;
    }

    try {
      const labelHtml = items
        .map((item, index) => buildLabelMarkup(item, prescription, patient, index))
        .join('');
      const printWindow = window.open('', '_blank', 'width=700,height=800');

      if (!printWindow) {
        notify?.('Popup cetak diblokir browser. Izinkan popup untuk mencetak label.', 'warning');
        return;
      }

      printWindow.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>Etiket Obat - ${escapeHtml(patient?.name || patient?.patientName || 'Pasien')}<\/title><style>${labelStyles}</style><style id="etiket-dynamic-page-size"></style></head><body><div class="etiket-preview-root">${labelHtml}</div></body></html>`
      );
      printWindow.document.close();
      await waitForPrintImages(printWindow);

      const labelPages = Array.from(printWindow.document.querySelectorAll('.label-page'));
      const maxPageHeightMm = labelPages.reduce((maxHeight, page) => {
        const pageHeightMm = (page.getBoundingClientRect().height * 25.4) / 96;
        return Math.max(maxHeight, pageHeightMm);
      }, 0);
      const pageHeight = Math.max(44, Math.ceil(maxPageHeightMm + 0.5));
      const pageSizeStyle = printWindow.document.getElementById('etiket-dynamic-page-size');
      if (pageSizeStyle) pageSizeStyle.textContent = `@page { size: ${LABEL_WIDTH_MM}mm ${pageHeight}mm; margin: 0; }`;

      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error('Error mencetak etiket:', error);
      notify?.('Proses pencetakan gagal.', 'warning');
    }
  };

  return (
    <Modal
      open={Boolean(open && prescription)}
      scrollable={false}
      title={<div className="section-head medication-modal-head"><div><h3>Cetak Etiket</h3><p>Preview etiket yang akan di-print.</p></div></div>}
      onClose={onClose}
      size="md"
    >
      {prescription ? (
        <div className="account-preview-scroll">
          <div className="account-preview">
            <style>{labelStyles}</style>
            <div className="etiket-preview-root">
              {items.map((item, index) => (
                <div key={item.id} dangerouslySetInnerHTML={{ __html: buildLabelMarkup(item, prescription, patient, index) }} />
              ))}
            </div>
            <div className="preview-actions">
              <Button type="button" variant="ghost" onClick={downloadMedicationLabels} disabled={!items.length}>
                <Download size={16} />
                Unduh Etiket
              </Button>
              <Button type="button" onClick={printMedicationLabels} disabled={!items.length}>
                <Printer size={16} />
                Cetak Etiket
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
