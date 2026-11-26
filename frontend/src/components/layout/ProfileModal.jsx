/**
 * Menampilkan profil pengguna, pratinjau dokumen, dan pengubahan password.
 */
import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Save } from 'lucide-react';

import { Modal } from '../ui/Modal';
import { Field, TextInput } from '../ui/Field';
import { Button } from '../ui/Button';
import { ROLE_LABELS } from '../../data/constants';
import { api } from '../../lib/api';
import { getPdfPreviewUrl } from '../../lib/pdfPreview';

const PASSWORD_RULES = [
  { test: (value) => value.length >= 8, message: 'Password minimal 8 karakter.' },
  { test: (value) => /[A-Z]/.test(value), message: 'Tambahkan minimal 1 huruf besar.' },
  { test: (value) => /[a-z]/.test(value), message: 'Tambahkan minimal 1 huruf kecil.' },
  { test: (value) => /\d/.test(value), message: 'Tambahkan minimal 1 angka.' },
  { test: (value) => /[!@#$%^&*(),.?":{}|<>_\-\\[\]/;'`~+=]/.test(value), message: 'Tambahkan minimal 1 karakter khusus.' },
];

/**
 * Menentukan alamat yang dapat dibuka untuk dokumen profil, baik dari URL langsung maupun referensi file API.
 */
function documentHref(document) {
  if (!document) return '';
  const raw = typeof document === 'string'
    ? document
    : document.url || (document.fileId ? `/api/files/${document.fileId}` : '');
  if (!raw) return '';
  if (/^(blob:|data:|https?:\/\/)/i.test(raw)) return raw;
  try {
    return new URL(raw, `${api.baseUrl}/`).toString();
  } catch {
    return raw;
  }
}

/**
 * Memastikan metadata dokumen mempunyai fileId atau URL rute berkas backend sebelum komponen mencoba memuat pratinjau terlindungi.
 */
function hasStoredFileReference(document) {
  if (!document) return false;
  const raw = typeof document === 'string'
    ? document
    : document.url || document.downloadURL || document.downloadUrl || document.href || '';
  return Boolean((typeof document === 'object' && document.fileId) || String(raw || '').match(/\/(?:api\/)?files\/([^/?#]+)/));
}

/**
 * Mengambil nama berkas yang layak ditampilkan dari metadata dokumen profil.
 */
function documentName(document, fallback) {
  if (typeof document === 'string') return document.split('/').pop() || fallback;
  return document?.name || fallback;
}

/**
 * Merender komponen profile item dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
function ProfileItem({ label, children }) {
  return (
    <div className="profile-info-item">
      <span>{label}</span>
      <strong>{children || '-'}</strong>
    </div>
  );
}

/**
 * Merender komponen profile dokumen pratinjau dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
function ProfileDocumentPreview({ label, document, href }) {
  const fallbackName = label === 'STR' ? 'Dokumen STR' : 'Dokumen SIP';
  const title = label === 'STR' ? 'Surat Tanda Registrasi (STR)' : 'Surat Izin Praktik (SIP)';
  const name = documentName(document, fallbackName);

  return (
    <div className="preview-section profile-document-section">
      <div className="preview-document-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <span>{title}</span>
          <strong className="account-edit-document-name">{name}</strong>
        </div>
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="preview-pdf-button">Buka PDF</a> : null}
      </div>
      <div className="document-preview profile-document-preview">
        {href ? (
          <iframe src={getPdfPreviewUrl(href)} title={`Preview ${label}`} />
        ) : (
          <div className="document-empty profile-document-empty">Preview dokumen {label} belum tersedia.</div>
        )}
      </div>
    </div>
  );
}

/**
 * Merender komponen profile modal dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function ProfileModal({ open, user, profile, onClose, onSavePassword, notify }) {
  const [strPreviewUrl, setStrPreviewUrl] = useState('');
  const [sipPreviewUrl, setSipPreviewUrl] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) return;
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setIsChangingPassword(false);
    setIsSaving(false);
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];

        /**
     * Mengambil berkas dari endpoint file berdasarkan fileId lalu membuat Blob URL untuk pratinjau, atau menggunakan URL dokumen yang tersedia jika tidak ada fileId.
     */
    const resolveDocumentPreview = async (document) => {
      if (!document) return '';
      const raw = typeof document === 'string'
        ? document
        : document.url || document.downloadURL || document.downloadUrl || document.href || '';
      const fileIdFromUrl = String(raw || '').match(/\/(?:api\/)?files\/([^/?#]+)/)?.[1];
      const fileId = (typeof document === 'object' && document.fileId) || fileIdFromUrl;

      if (fileId) {
        const objectUrl = await api.files.createObjectUrl(fileId);
        objectUrls.push(objectUrl);
        return objectUrl;
      }
      return documentHref(document);
    };

        /**
     * Memuat pratinjau STR dan SIP secara paralel. Kegagalan satu dokumen tidak menghalangi dokumen lainnya, dan object URL dibersihkan saat modal ditutup.
     */
    const loadPreviews = async () => {
      if (!open) {
        setStrPreviewUrl('');
        setSipPreviewUrl('');
        return;
      }
      const [strResult, sipResult] = await Promise.allSettled([
        resolveDocumentPreview(profile?.str),
        resolveDocumentPreview(profile?.sip),
      ]);
      if (cancelled) return;
      setStrPreviewUrl(strResult.status === 'fulfilled' ? strResult.value : '');
      setSipPreviewUrl(sipResult.status === 'fulfilled' ? sipResult.value : '');
    };

    loadPreviews().catch(() => {
      if (!cancelled) {
        setStrPreviewUrl('');
        setSipPreviewUrl('');
      }
    });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [open, profile?.str?.fileId, profile?.str?.url, profile?.sip?.fileId, profile?.sip?.url]);

    /**
   * Menampilkan peringatan pada modal profil dengan gaya notifikasi yang sama seperti form lainnya.
   */
  const showWarning = (message) => {
    if (typeof notify === 'function') notify(message, 'warning');
    else console.warn(message);
  };

    /**
   * Mengosongkan field password dan pesan validasi setelah formulir reset password ditutup atau berhasil diproses.
   */
  const resetPasswordForm = () => {
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  /**
   * Menangani aksi submit dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    if (isSaving) return;
    const newPassword = password.trim();
    const confirmedPassword = confirmPassword.trim();
    if (!newPassword) return showWarning('Password wajib diisi.');
    if (!confirmedPassword) return showWarning('Konfirmasi password wajib diisi.');
    if (newPassword !== confirmedPassword) return showWarning('Konfirmasi password tidak cocok.');
    for (const rule of PASSWORD_RULES) {
      if (!rule.test(newPassword)) return showWarning(rule.message);
    }
    if (typeof onSavePassword !== 'function') return showWarning('Fitur ganti password belum tersedia.');

    setIsSaving(true);
    try {
      const result = await onSavePassword(newPassword);
      if (result?.ok === false) {
        showWarning(result?.message || 'Password gagal diubah.');
        return;
      }
      resetPasswordForm();
      setIsChangingPassword(false);
      notify?.('Password berhasil diubah.', 'success');
    } catch (error) {
      showWarning(error?.message || 'Password gagal diubah.');
    } finally {
      setIsSaving(false);
    }
  };

  const strHref = open ? (strPreviewUrl || (hasStoredFileReference(profile?.str) ? '' : documentHref(profile?.str))) : '';
  const sipHref = open ? (sipPreviewUrl || (hasStoredFileReference(profile?.sip) ? '' : documentHref(profile?.sip))) : '';
  const hasProfessionalDocuments = ['admin', 'pharmacy', 'doctor'].includes(profile?.role);

  return (
    <>
      <Modal
        open={open}
        scrollable={false}
        title={(
          <div className="section-head preview-modal-head">
            <div>
              <h3>Profil</h3>
              <p>Informasi akun dan keamanan.</p>
            </div>
          </div>
        )}
        onClose={() => { if (!isSaving) onClose?.(); }}
        size="xl"
      >
        <div className="account-preview-scroll profile-modal-scroll">
          <div className="account-preview profile-modal-preview">
            <div className="document-split-layout profile-document-layout">
              <div className="document-info-pane profile-info-pane">
                <div className="profile-info-grid">
                  <ProfileItem label="Nama Lengkap">{profile?.username || profile?.name || user || '-'}</ProfileItem>
                  <ProfileItem label="Hak Akses">{ROLE_LABELS[profile?.role] || '-'}</ProfileItem>
                  <ProfileItem label="Email">{profile?.email || '-'}</ProfileItem>
                  <ProfileItem label="Nomor Induk Kependudukan (NIK)">{profile?.nik || '-'}</ProfileItem>
                </div>
              </div>

              <div className="document-viewer-pane profile-document-pane">
                {hasProfessionalDocuments ? (
                  <>
                    <ProfileDocumentPreview label="STR" document={profile?.str} href={strHref} />
                    <ProfileDocumentPreview label="SIP" document={profile?.sip} href={sipHref} />
                  </>
                ) : (
                  <div className="document-empty profile-document-unavailable">
                    Dokumen STR dan SIP tidak tersedia untuk akun ini.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="document-modal-footer-actions profile-modal-actions">
          <Button type="button" variant="primary" onClick={() => setIsChangingPassword(true)}>
            <KeyRound size={16} />Ganti Password
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(open && isChangingPassword)}
        title={(
          <div className="section-head preview-modal-head">
            <div>
              <h3>Ganti Password</h3>
              <p>Ubah password akun Anda.</p>
            </div>
          </div>
        )}
        onClose={() => { if (!isSaving) { setIsChangingPassword(false); resetPasswordForm(); } }}
        size="md"
      >
        <form className="stack profile-password-form" onSubmit={handleSubmit} noValidate>
          <Field label="Username">
            <TextInput value={user || ''} readOnly disabled className="control auto-filled-control" />
          </Field>
          <Field label="Password Baru" required>
            <div className="password-input-wrapper">
              <TextInput
                type={showPassword ? 'text' : 'password'}
                value={password}
                placeholder="Masukkan password baru"
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSaving}
                autoComplete="new-password"
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((prev) => !prev)} disabled={isSaving} aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <Field label="Konfirmasi Password" required>
            <div className="password-input-wrapper">
              <TextInput
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                placeholder="Ulangi password baru"
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isSaving}
                autoComplete="new-password"
              />
              <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword((prev) => !prev)} disabled={isSaving} aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'} title={showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}>
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <div className="preview-actions profile-password-actions">
            <Button type="submit" variant="primary" disabled={isSaving}><Save size={16} />{isSaving ? 'Menyimpan...' : 'Simpan Password'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
