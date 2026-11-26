/**
 * Mengelola layar autentikasi, pendaftaran, aktivasi akun, lupa password, dan pengaturan ulang password.
 */
import { useEffect, useMemo, useState } from 'react';
import { KeyRound, LogIn, Eye, EyeOff, ArrowLeft, UserPlus } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, SearchableSelect, TextInput } from '../ui/Field';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { getPdfPreviewUrl } from '../../lib/pdfPreview';

/**
 * Merender komponen autentikasi screen dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function AuthScreen({ onLogin, onResetPassword, onActivateAccount, onForgotPassword, onRegister, notify }) {
  const resetToken = useMemo(
    () => new URLSearchParams(window.location.search).get('reset') || '',
    [],
  );
  const activationToken = useMemo(
    () => new URLSearchParams(window.location.search).get('activate') || '',
    [],
  );
  const [isResetMode, setIsResetMode] = useState(Boolean(resetToken));
  const [isActivationMode, setIsActivationMode] = useState(Boolean(activationToken));
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isSubmittingRegister, setIsSubmittingRegister] = useState(false);
  const [showRegistrationPreview, setShowRegistrationPreview] = useState(false);
  const [registrationPreviewUrls, setRegistrationPreviewUrls] = useState({ str: '', sip: '' });
  const [registration, setRegistration] = useState({ name: '', role: '', email: '', nik: '', password: '', str: null, sip: null });
  const [email, setEmail] = useState('');
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

    /**
   * Memeriksa ekstensi atau MIME PDF dan ukuran maksimum 5 MB pada browser sebelum upload. Backend tetap memvalidasi signature file.
   */
  const isValidPdf = (file) => Boolean(file && (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) && file.size <= 5 * 1024 * 1024);
    /**
   * Memastikan email tidak kosong, tidak mengandung spasi, panjang maksimal 254 karakter, dan mengikuti pola alamat email.
   */
  const isValidEmail = (value) => {
    const emailValue = String(value || '').trim();
    return emailValue.length <= 254 && !/\s/.test(emailValue) && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(emailValue);
  };
    /**
   * Memastikan password pendaftaran minimal delapan karakter dengan setidaknya satu huruf besar, satu huruf kecil, satu angka, dan satu simbol.
   */
  const isValidRegistrationPassword = (value) => value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[!@#$%^&*(),.?":{}|<>_\-\[\]/;'`~+=]/.test(value);
  const isRegistrationValid = Boolean(
    registration.name.trim()
      && ['pharmacy', 'doctor'].includes(registration.role)
      && isValidEmail(registration.email)
      && /^\d{16}$/.test(registration.nik)
      && isValidRegistrationPassword(registration.password)
      && isValidPdf(registration.str)
      && isValidPdf(registration.sip),
  );

    /**
   * Memvalidasi field pendaftaran secara berurutan dan mengembalikan pesan untuk kesalahan pertama yang ditemukan.
   */
  const validateRegistration = () => {
    if (!registration.name.trim()) return 'Nama lengkap wajib diisi.';
    if (!['pharmacy', 'doctor'].includes(registration.role)) return 'Hak akses tidak valid.';
    if (!isValidEmail(registration.email)) return 'Masukkan alamat email yang valid.';
    if (!/^\d{16}$/.test(registration.nik)) return 'NIK harus terdiri dari 16 digit angka.';
    if (!isValidRegistrationPassword(registration.password)) return 'Password perlu 8 karakter, huruf besar/kecil, angka, dan simbol.';
    if (!isValidPdf(registration.str)) return 'STR wajib berupa PDF maksimal 5 MB.';
    if (!isValidPdf(registration.sip)) return 'SIP wajib berupa PDF maksimal 5 MB.';
    return '';
  };

  useEffect(() => {
    let strUrl = '';
    let sipUrl = '';
    if (registration.str && typeof URL !== 'undefined' && URL.createObjectURL) strUrl = URL.createObjectURL(registration.str);
    if (registration.sip && typeof URL !== 'undefined' && URL.createObjectURL) sipUrl = URL.createObjectURL(registration.sip);
    setRegistrationPreviewUrls({ str: strUrl, sip: sipUrl });
    return () => {
      if (strUrl.startsWith('blob:')) URL.revokeObjectURL(strUrl);
      if (sipUrl.startsWith('blob:')) URL.revokeObjectURL(sipUrl);
    };
  }, [registration.str, registration.sip]);

  /**
   * Menangani aksi register dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleRegister = (event) => {
    event.preventDefault();
    setResetMessage('');
    const validationMessage = validateRegistration();
    if (validationMessage) {
      setResetMessage(validationMessage);
      return;
    }
    setShowRegistrationPreview(true);
  };

  /**
   * Menjalankan tindakan pendaftaran akun setelah keputusan atau konfirmasi yang diperlukan diterima.
   */
  const confirmRegistration = async () => {
    if (isSubmittingRegister) return;
    const validationMessage = validateRegistration();
    if (validationMessage) {
      setResetMessage(validationMessage);
      setShowRegistrationPreview(false);
      return;
    }
    setIsSubmittingRegister(true);
    setResetMessage('');
    try {
      const emailValue = registration.email.trim().toLowerCase();
      const result = await onRegister?.({ account: { ...registration, email: emailValue }, str: registration.str, sip: registration.sip });
      if (result?.ok) {
        setUsername(emailValue);
        setPassword('');
        setRegistration({ name: '', role: '', email: '', nik: '', password: '', str: null, sip: null });
        setShowRegistrationPreview(false);
        setIsRegisterMode(false);
        setIsForgotMode(false);
        setResetMessage('');
      } else {
        const message = result?.message || 'Permohonan pendaftaran belum dapat dikirim. Periksa kembali data dan koneksi.';
        if (/email sudah terdaftar|sedang menunggu verifikasi|email.*(terdaftar|digunakan)/i.test(message)) {
          setResetMessage('');
          notify?.(message, 'warning');
        } else {
          setResetMessage(message);
        }
      }
    } catch (error) {
      const message = error?.message || 'Permohonan pendaftaran gagal dikirim. Silakan coba kembali.';
      if (/email sudah terdaftar|sedang menunggu verifikasi|email.*(terdaftar|digunakan)/i.test(message)) {
        setResetMessage('');
        notify?.(message, 'warning');
      } else {
        setResetMessage(message);
      }
    } finally {
      setIsSubmittingRegister(false);
    }
  };

    /**
   * Menghapus parameter reset dan activate dari URL setelah tautan autentikasi diproses agar token tidak tertinggal pada address bar.
   */
  const clearResetQuery = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    url.searchParams.delete('activate');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  /**
   * Menangani aksi forgot password dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setResetMessage('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { notify?.('Masukkan alamat email dengan format yang valid.', 'warning'); return; }
    setIsSubmittingForgot(true);
    try {
      await onForgotPassword?.(email.trim());
      setResetMessage('');
      notify?.('Jika email terdaftar, tautan reset password sudah dikirim. Periksa kotak masuk dan folder spam.', 'success');
    } catch (error) {
      notify?.(error?.message || 'Email tidak dapat dikirim. Periksa koneksi lalu coba kembali.', 'warning');
    } finally { setIsSubmittingForgot(false); }
  };

  /**
   * Menangani aksi autentikasi dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleAuth = (event) => {
    event.preventDefault();
    onLogin?.({ username, password });
  };

  /**
   * Menangani aksi reset password dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleResetPassword = async (event) => {
    event.preventDefault();
    setResetMessage('');

    if (!resetToken) {
      notify?.('Tautan reset password tidak tersedia. Silakan minta tautan reset yang baru.', 'warning');
      clearResetQuery();
      setIsResetMode(false);
      return;
    }

    if (password.length < 8) {
      notify?.('Password minimal 8 karakter.', 'warning');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      notify?.('Password harus memiliki minimal 1 huruf besar.', 'warning');
      return;
    }
    if (!/[a-z]/.test(password)) {
      notify?.('Password harus memiliki minimal 1 huruf kecil.', 'warning');
      return;
    }
    if (!/\d/.test(password)) {
      notify?.('Password harus memiliki minimal 1 angka.', 'warning');
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>_\-\\[\]/;'`~+=]/.test(password)) {
      notify?.('Password harus memiliki minimal 1 karakter khusus.', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      notify?.('Konfirmasi password tidak sama dengan password baru.', 'warning');
      return;
    }

    setIsSubmittingReset(true);
    try {
      await onResetPassword?.({ token: resetToken, password });
      clearResetQuery();
      setPassword('');
      setConfirmPassword('');
      setResetMessage('');
      notify?.('Password berhasil diubah. Silakan login dengan password baru.', 'success');
      setIsResetMode(false);
    } catch (error) {
      const invalidToken = error?.code === 'RESET_TOKEN_INVALID'
        || /link reset password|token reset.*(tidak valid|kedaluwarsa)|reset password.*(tidak valid|kedaluwarsa)/i.test(error?.message || '');
      if (invalidToken) {
        notify?.('Tautan reset password sudah tidak berlaku atau tidak valid. Silakan minta tautan reset yang baru.', 'warning');
        clearResetQuery();
        setPassword('');
        setConfirmPassword('');
        setIsResetMode(false);
      } else if (error?.code === 'RESET_PASSWORD_INVALID' || error?.code === 'VALIDATION_ERROR') {
        notify?.('Password belum memenuhi kriteria: minimal 8 karakter, huruf besar, huruf kecil, angka, dan simbol.', 'warning');
      } else {
        notify?.(error?.message || 'Password belum berhasil diubah. Periksa koneksi dan coba kembali.', 'warning');
      }
    } finally {
      setIsSubmittingReset(false);
    }
  };

    /**
   * Memeriksa persyaratan password secara berurutan dan baru mengirim permintaan aktivasi setelah semua kriteria terpenuhi.
   */
  const handleActivateAccount = async (event) => {
    event.preventDefault();
    if (!activationToken) {
      notify?.('Tautan aktivasi tidak tersedia. Minta Admin mengirimkan tautan aktivasi baru.', 'warning');
      clearResetQuery();
      setIsActivationMode(false);
      return;
    }
    if (password.length < 8) {
      notify?.('Password perlu minimal 8 karakter.', 'warning');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      notify?.('Password perlu minimal 1 huruf besar.', 'warning');
      return;
    }
    if (!/[a-z]/.test(password)) {
      notify?.('Password perlu minimal 1 huruf kecil.', 'warning');
      return;
    }
    if (!/\d/.test(password)) {
      notify?.('Password perlu minimal 1 angka.', 'warning');
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>_\-\[\]\/;'`~+=]/.test(password)) {
      notify?.('Password perlu minimal 1 karakter khusus.', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      notify?.('Konfirmasi password tidak sama dengan password baru.', 'warning');
      return;
    }
    setIsSubmittingReset(true);
    try {
      await onActivateAccount?.({ token: activationToken, password });
      clearResetQuery();
      setPassword('');
      setConfirmPassword('');
      setUsername('');
      notify?.('Akun berhasil diaktifkan. Silakan login menggunakan username dan password baru.', 'success');
      setIsActivationMode(false);
    } catch (error) {
      if (error?.code === 'ACTIVATION_TOKEN_INVALID' || error?.code === 'ACTIVATION_INVALID') {
        notify?.('Tautan aktivasi tidak valid, sudah digunakan, atau kedaluwarsa. Hubungi Admin untuk meminta tautan baru.', 'warning');
        clearResetQuery();
        setPassword('');
        setConfirmPassword('');
        setIsActivationMode(false);
      } else {
        notify?.(error?.message || 'Akun belum berhasil diaktifkan. Coba kembali.', 'warning');
      }
    } finally {
      setIsSubmittingReset(false);
    }
  };

    /**
   * Mengembalikan layar autentikasi ke mode login dan membersihkan nilai form serta pesan sementara dari mode lainnya.
   */
  const openLoginMode = () => {
    clearResetQuery();
    setResetMessage('');
    setPassword('');
    setConfirmPassword('');
    setIsResetMode(false);
    setIsActivationMode(false);
    setIsForgotMode(false);
    setIsRegisterMode(false);
    setEmail('');
  };

  return (
    <div className={`auth-page ${isRegisterMode ? 'auth-page-register' : ''}`}>
      <div className="auth-hero">
        <div className="auth-brand">
          <div className="auth-logo">
            <img src="/logo-no bg.png" alt="REMS Logo" />
          </div>

          <div>
            <h1>REMS</h1>
            <p>Kelola resep elektronik dan stok obat dalam satu platform.</p>
          </div>
        </div>

        <div className="auth-badges">
          <Badge tone="blue">Resep terintegrasi</Badge>
          <Badge tone="green">Stok terkontrol</Badge>
          <Badge tone="purple">Pasien terpantau</Badge>
        </div>
      </div>

      <Card className="auth-card">
        <div className="auth-card-head">
          <h2>{isActivationMode ? 'Aktivasi Akun' : isResetMode ? 'Reset Password' : isForgotMode ? 'Lupa Password?' : isRegisterMode ? 'Daftar Akun' : 'Login'}</h2>
          <p>
            {isActivationMode
              ? 'Buat password sendiri untuk mengaktifkan akun REMS.'
              : isResetMode
              ? 'Buat password baru untuk menyelesaikan proses reset akun.'
              : isForgotMode ? 'Masukkan email yang terdaftar untuk meminta tautan reset password.' : isRegisterMode ? 'Daftar sebagai Apoteker atau Dokter FKTP. Akun baru dapat digunakan setelah disetujui Admin.' : 'Masuk untuk melanjutkan ke REMS.'}
          </p>
        </div>

        <div className="auth-form-wrap">
          {isResetMode || isActivationMode ? (
            <form className="stack auth" onSubmit={isActivationMode ? handleActivateAccount : handleResetPassword}>
              <Field label="Password baru" required>
                <div className="password-input-wrapper">
                  <TextInput
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Masukkan password baru"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              <Field label="Konfirmasi Password" required>
                <div className="password-input-wrapper">
                  <TextInput
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Ulangi password baru"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              {resetMessage ? (
                <div className="form-validation-hint" role="alert">
                  {resetMessage}
                </div>
              ) : null}

              <div className={`row-actions ${isActivationMode ? 'auth-activation-actions' : ''}`}>
                {isActivationMode ? (
                  <>
                    <Button type="button" variant="ghost" onClick={openLoginMode} disabled={isSubmittingReset}>
                      <ArrowLeft size={16} />
                      <span>Kembali</span>
                    </Button>
                    <Button type="submit" disabled={isSubmittingReset}>
                      <KeyRound size={16} />
                      <span>{isSubmittingReset ? 'Memproses...' : 'Aktifkan Akun'}</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="submit" disabled={isSubmittingReset}>
                      <KeyRound size={16} />
                      <span>{isSubmittingReset ? 'Memproses...' : 'Simpan Password'}</span>
                    </Button>
                    <Button type="button" variant="danger" onClick={openLoginMode} disabled={isSubmittingReset}>
                      <ArrowLeft size={16} />
                      <span>Kembali</span>
                    </Button>
                  </>
                )}
              </div>
            </form>
          ) : isForgotMode ? (
            <form className="stack auth" onSubmit={handleForgotPassword}>
              <Field label="Email Terdaftar" required>
                <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="Masukkan email terdaftar" required />
              </Field>
              <div className="row-actions auth-forgot-actions">
                <Button type="button" variant="ghost" onClick={() => { setIsForgotMode(false); setIsRegisterMode(false); setResetMessage(''); setEmail(''); }}><ArrowLeft size={16} /><span>Ke Login</span></Button>
                <Button type="submit" disabled={isSubmittingForgot}><span>{isSubmittingForgot ? 'Mengirim...' : 'Kirim Reset'}</span></Button>
              </div>
            </form>
          ) : isRegisterMode ? (
            <form className="stack auth auth-register-form" onSubmit={handleRegister}>
              <div className="form-grid two-cols auth-register-grid">
                <Field label="Nama Lengkap" required>
                  <TextInput value={registration.name} onChange={(e) => setRegistration({ ...registration, name: e.target.value })} placeholder="Masukkan nama lengkap" autoComplete="name" required />
                </Field>
                <Field label="Hak Akses" required>
                  <SearchableSelect className="control control-compact" value={registration.role} onChange={(e) => setRegistration({ ...registration, role: e.target.value })} placeholder="Pilih hak akses">
                    <option value="pharmacy">Apoteker</option>
                    <option value="doctor">Dokter FKTP</option>
                  </SearchableSelect>
                </Field>
                <Field label="Email" required>
                  <TextInput type="email" value={registration.email} onChange={(e) => setRegistration({ ...registration, email: e.target.value })} placeholder="nama@domain.com" autoComplete="email" required />
                </Field>
                <Field label="Nomor Induk Kependudukan (NIK)" required>
                  <TextInput value={registration.nik} inputMode="numeric" maxLength={16} onChange={(e) => setRegistration({ ...registration, nik: e.target.value.replace(/\D/g, '') })} placeholder="Masukkan 16 digit NIK" required />
                </Field>
                <Field label="Surat Tanda Registrasi (STR)" required>
                  <label className="file-control">
                    <span className={registration.str ? 'file-name active' : 'file-name'}>{registration.str?.name || 'Pilih file STR'}</span>
                    <span className="file-button">Pilih</span>
                    <input type="file" accept="application/pdf,.pdf" onChange={(e) => { const file = e.target.files?.[0] || null; if (file && !isValidPdf(file)) { setResetMessage('STR wajib berupa PDF maksimal 5 MB.'); e.target.value = ''; return; } setRegistration({ ...registration, str: file }); }} required />
                  </label>
                </Field>
                <Field label="Surat Izin Praktik (SIP)" required>
                  <label className="file-control">
                    <span className={registration.sip ? 'file-name active' : 'file-name'}>{registration.sip?.name || 'Pilih file SIP'}</span>
                    <span className="file-button">Pilih</span>
                    <input type="file" accept="application/pdf,.pdf" onChange={(e) => { const file = e.target.files?.[0] || null; if (file && !isValidPdf(file)) { setResetMessage('SIP wajib berupa PDF maksimal 5 MB.'); e.target.value = ''; return; } setRegistration({ ...registration, sip: file }); }} required />
                  </label>
                </Field>
                <Field label="Password" required>
                  <div className="password-input-wrapper">
                    <TextInput type={showPassword ? 'text' : 'password'} value={registration.password} onChange={(e) => setRegistration({ ...registration, password: e.target.value })} autoComplete="new-password" placeholder="Buat password yang kuat" required />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword((prev) => !prev)} aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </Field>
              </div>
              {resetMessage ? <div className="form-validation-hint" role="status">{resetMessage}</div> : null}
              <p className="auth-registration-note">Data pendaftaran akan diperiksa oleh Admin. Periksa email secara berkala untuk mengetahui hasil verifikasi. Akun belum dapat digunakan untuk login sebelum diverifikasi Admin.</p>
              <div className="row-actions auth-register-actions">
                <Button type="button" variant="ghost" onClick={() => { setIsRegisterMode(false); setShowRegistrationPreview(false); setResetMessage(''); setRegistration({ name: '', role: '', email: '', nik: '', password: '', str: null, sip: null }); }} disabled={isSubmittingRegister}><ArrowLeft size={16} /><span>Ke Login</span></Button>
                <Button type="submit" disabled={isSubmittingRegister}><Eye size={16} /><span>Preview</span></Button>
              </div>
            </form>
          ) : (
            <form className="stack auth" onSubmit={handleAuth}>
              <Field label="Username atau Email" required>
                <TextInput
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="Masukkan username atau email"
                />
              </Field>

              <Field label="Password" required>
                <div className="password-input-wrapper">
                  <TextInput
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              {resetMessage ? (
                <div className="form-validation-hint" role="status">
                  {resetMessage}
                </div>
              ) : null}

              <div className="auth-links-row"><button type="button" className="auth-forgot-link" onClick={() => { setIsForgotMode(true); setResetMessage(''); }}>Lupa Password?</button><button type="button" className="auth-forgot-link" onClick={() => { setIsRegisterMode(true); setResetMessage(''); }}>Daftar</button></div>
              <div className="row-actions">
                <Button type="submit">
                  <LogIn size={16} />
                  <span>Masuk</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      <Modal
        open={showRegistrationPreview}
        size="xl"
        scrollable={false}
        onClose={() => { if (!isSubmittingRegister) setShowRegistrationPreview(false); }}
        title={(
          <div className="section-head medication-modal-head">
            <div>
              <h3>Preview Pendaftaran</h3>
              <p>Periksa data dan dokumen sebelum mengirim permohonan akun.</p>
            </div>
          </div>
        )}
      >
        <div className="account-review-scroll auth-registration-preview-scroll">
          <div className="document-split-layout account-review-layout">
            <div className="document-info-pane account-review-info-pane">
              <div className="preview-grid account-review-info-grid">
                <div className="preview-item"><span>Nama Lengkap</span>{registration.name || '-'}</div>
                <div className="preview-item"><span>Hak Akses</span>{registration.role === 'pharmacy' ? 'Apoteker' : registration.role === 'doctor' ? 'Dokter FKTP' : '-'}</div>
                <div className="preview-item"><span>Email</span>{registration.email || '-'}</div>
                <div className="preview-item"><span>NIK</span>{registration.nik || '-'}</div>
              </div>
            </div>
            <div className="document-viewer-pane account-review-document-pane">
              <div className="preview-section">
                <div className="preview-document-head">
                  <div style={{ minWidth: 0, flex: 1 }}><span>File STR</span><strong className="account-edit-document-name">{registration.str?.name || 'Dokumen STR'}</strong></div>
                  {registrationPreviewUrls.str ? <a href={registrationPreviewUrls.str} target="_blank" rel="noopener noreferrer" className="preview-pdf-button">Buka PDF</a> : null}
                </div>
                {registrationPreviewUrls.str ? <div className="document-preview account-review-pdf-preview"><iframe src={getPdfPreviewUrl(registrationPreviewUrls.str)} title="Preview STR" /></div> : <div className="document-empty account-review-pdf-empty">Preview STR tidak tersedia.</div>}
              </div>
              <div className="preview-section">
                <div className="preview-document-head">
                  <div style={{ minWidth: 0, flex: 1 }}><span>File SIP</span><strong className="account-edit-document-name">{registration.sip?.name || 'Dokumen SIP'}</strong></div>
                  {registrationPreviewUrls.sip ? <a href={registrationPreviewUrls.sip} target="_blank" rel="noopener noreferrer" className="preview-pdf-button">Buka PDF</a> : null}
                </div>
                {registrationPreviewUrls.sip ? <div className="document-preview account-review-pdf-preview"><iframe src={getPdfPreviewUrl(registrationPreviewUrls.sip)} title="Preview SIP" /></div> : <div className="document-empty account-review-pdf-empty">Preview SIP tidak tersedia.</div>}
              </div>
            </div>
          </div>
        </div>
        {resetMessage ? <div className="form-validation-hint auth-registration-modal-message" role="status">{resetMessage}</div> : null}
        <div className="preview-actions account-review-actions auth-registration-preview-actions">
          <Button type="button" onClick={confirmRegistration} disabled={!isRegistrationValid || isSubmittingRegister}><UserPlus size={16} />{isSubmittingRegister ? 'Mengirim...' : 'Daftar'}</Button>
        </div>
      </Modal>
    </div>
  );
}
