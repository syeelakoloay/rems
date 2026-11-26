/**
 * Menyediakan tombol bersama dengan gaya, ikon, dan perilaku aksesibilitas yang konsisten.
 */
import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  FileCheck,
  FileText,
  FileUp,
  FolderOpen,
  KeyRound,
  ListFilter,
  LogIn,
  LogOut,
  PencilLine,
  Pill,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';

const iconRules = [
  [/\b(upload|unggah)\b/i, FileUp],
  [/\b(tambah|buat baru|buat akun|create|add)\b/i, Plus],
  [/\b(simpan|save|perbarui|update)\b/i, Save],
  [/\b(hapus|delete)\b/i, Trash2],
  [/\b(ubah|edit|ganti)\b/i, PencilLine],
  [/\b(buka\s*pdf|pdf)\b/i, FileText],
  [/\b(verifikasi|verify)\b/i, ShieldCheck],
  [/\b(cetak|print)\b/i, Printer],
  [/\b(konfirmasi|setuju|tebus|aktifkan)\b/i, CheckCircle2],
  [/\b(kirim|send|notifikasi)\b/i, Send],
  [/\b(ekspor|export|unduh|download)\b/i, Download],
  [/\b(cari|search)\b/i, Search],
  [/\b(filter)\b/i, ListFilter],
  [/\b(lihat|detail|selengkapnya|preview)\b/i, Eye],
  [/\b(masuk|login)\b/i, LogIn],
  [/\b(keluar|logout)\b/i, LogOut],
  [/\b(password|kata sandi|reset)\b/i, KeyRound],
  [/\b(pilih|browse)\b/i, FolderOpen],
  [/\b(kembali|back)\b/i, ArrowLeft],
  [/\b(batal|tutup|cancel)\b/i, X],
  [/\b(obat|stok)\b/i, Pill],
  [/\b(resep)\b/i, FileCheck],
  [/\b(akun|user|pengguna)\b/i, UserPlus],
  [/\b(refresh|muat ulang|perbarui data)\b/i, RefreshCw],
];

/**
 * Mengumpulkan teks yang terlihat dari isi tombol, termasuk elemen anak, untuk menentukan label teks yang dapat dibaca.
 */
function getTextContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join(' ');
  if (React.isValidElement(node)) return getTextContent(node.props?.children);
  return '';
}

/**
 * Mengenali elemen yang digunakan sebagai ikon agar tidak diperlakukan sebagai teks label tombol.
 */
function isIconElement(node) {
  if (!React.isValidElement(node) || typeof node.type === 'string' || node.type === React.Fragment) return false;
  const props = node.props || {};
  const type = node.type;
  const typeName = String(type?.displayName || type?.name || type?.render?.displayName || '');
  return Boolean(
    props.size !== undefined ||
    props.strokeWidth !== undefined ||
    type?.$$typeof === Symbol.for('react.forward_ref') ||
    /^(Icon|[A-Z].*Icon)$/.test(typeName)
  );
}

/**
 * Memeriksa apakah isi tombol diawali elemen ikon sehingga jarak ikon dan teks dapat disesuaikan.
 */
function hasLeadingIcon(node) {
  const children = Array.isArray(node) ? node : [node];
  for (const child of children) {
    if (child === null || child === undefined || typeof child === 'boolean') continue;
    if (typeof child === 'string' || typeof child === 'number') {
      if (String(child).trim()) return false;
      continue;
    }
    if (!React.isValidElement(child)) continue;
    if (isIconElement(child)) return true;
    if (hasLeadingIcon(child.props?.children)) return true;
    // A visible text/container node before any icon means an icon should be prepended.
    if (typeof child.type === 'string' && getTextContent(child).trim()) return false;
  }
  return false;
}

/**
 * Memilih ikon yang mewakili jenis tindakan tombol berdasarkan properti aksi yang diberikan.
 */
function getActionIcon(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (/^buka\s*pdf$/i.test(normalized)) return null;
  return iconRules.find(([pattern]) => pattern.test(normalized))?.[1] || ArrowRight;
}

/**
 * Merender komponen button dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  disabled = false,
  onClick,
  ...rest
}) {
  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    className,
    disabled ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const shouldDecorate = ['primary', 'blue', 'danger', 'warning'].includes(variant);
  const hasLabel = Boolean(getTextContent(children).trim());
  const hasLeadingIconAlready = hasLeadingIcon(children);
  const ActionIcon = getActionIcon(getTextContent(children));
  const content = shouldDecorate && hasLabel && !hasLeadingIconAlready && ActionIcon
    ? <><ActionIcon size={16} strokeWidth={2} aria-hidden="true" />{children}</>
    : children;

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {content}
    </button>
  );
}
