/** Mengapitalisasi huruf pertama teks dan mengembalikan tanda pengganti bila nilainya kosong. */
export const capitalizeFirstLetter = (value) => {
  const text = String(value || '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '-';
};
