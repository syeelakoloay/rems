/**
 * Mengonversi berkas lokal ke format data URL untuk kebutuhan pratinjau atau pengiriman.
 */
/**
 * Membaca berkas lokal dengan FileReader dan menghasilkan Data URL untuk pratinjau atau proses upload yang memerlukannya.
 */
export const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
