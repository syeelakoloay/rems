/**
 * Menentukan URL pratinjau PDF dari referensi berkas yang tersedia.
 */
/**
 * Build a browser PDF viewer URL with its built-in side navigation hidden,
 * leaving the document itself to use the available preview area.
 */
export function getPdfPreviewUrl(source) {
  if (!source) return '';
  const value = String(source).trim();
  if (!value) return '';

  const base = value.split('#')[0];
  return `${base}#toolbar=0&navpanes=0&pagemode=none&scrollbar=1&view=FitH`;
}
