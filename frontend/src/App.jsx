/**
 * Menjadi pengendali utama aplikasi frontend: memuat data dan sesi, memilih tampilan berdasarkan peran, serta menghubungkan tindakan pengguna ke API.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { AuthScreen } from './components/auth/AuthScreen';
import { Shell } from './components/layout/Shell';
import { ProfileModal } from './components/layout/ProfileModal';

import { PrescriptionForm } from './components/prescription/PrescriptionForm';
import { DoctorHistoryPanel } from './components/prescription/DoctorHistoryPanel';

import { IncomingPrescriptions } from './components/pharmacy/IncomingPrescriptions';
import { StockManager } from './components/pharmacy/StockManager';
import { PatientHistoryPanel } from './components/pharmacy/PatientHistoryPanel';

import { ChronicBookPanel } from './components/chronic/ChronicBookPanel';
import { DashboardPanel } from './components/overview/DashboardPanel';
import { AdminPanel } from './components/admin/AdminPanel';

import { ToastStack } from './components/ui/ToastStack';
import { SystemDialog } from './components/ui/SystemDialog';

import { api } from './lib/api';
import { EMPTY_APP_DATA, ROLE_LABELS } from './data/constants';


/*
 * =====================================================
 * TOAST
 * =====================================================
 */

/**
 * Menyeragamkan username agar pencarian, perbandingan, dan validasi menggunakan format yang konsisten.
 */
const normalizeUsername = (value) => String(value || '').trim().toLowerCase();

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'rems:lastActivityAt';


/**
 * Membentuk objek pesan toast beserta ID dan judul sesuai tingkat keberhasilan, peringatan, atau informasi.
 */
function createToast(
  id,
  message,
  tone
) {
  return {
    id,
    message,
    tone,
    title:
      tone === 'success'
        ? 'Berhasil'
        : tone === 'warning'
          ? 'Perhatian'
          : 'Info',
  };
}


/**
 * Komponen akar yang mengelola sesi pengguna, pemuatan data, navigasi peran, dan penghubung tindakan ke API.
 */
export default function App() {
  const [
    data,
    setData,
  ] = useState(() => ({
    ...EMPTY_APP_DATA,
    users: [],
    prescriptions: [],
    chronicBooks: {},
    patientHistory: {},
    stock: {},
    stockHistory: {},
    patients: {},
    activities: [],
    doseOptions: [],
    doseOptionUnits: {},
    doseOptionRoutes: {},
    medicationOptions: [],
    notifications: [],
  }));

  const [session, setSessionState] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeMenu, setActiveMenu] = useState('dashboard');

  const [
    profileOpen,
    setProfileOpen,
  ] = useState(false);

  const [
    toasts,
    setToasts,
  ] = useState([]);

  const [dialog, setDialog] = useState(null);
  const dialogResolverRef = useRef(null);

  /**
   * Membuka dialog sistem dan mengembalikan keputusan pengguna melalui Promise agar alur pemanggil dapat menunggu konfirmasi.
   */
  const requestDialog = ({
    type = 'confirm',
    title = 'Konfirmasi',
    message,
    contentMessage,
    inputLabel,
    inputPlaceholder,
    defaultValue = '',
    confirmText = 'Ya',
    cancelText = 'Batal',
    confirmVariant = 'primary',
    cancelVariant = 'ghost',
  }) => new Promise((resolve) => {
    dialogResolverRef.current = resolve;
    setDialog({
      type,
      title,
      message,
      contentMessage,
      inputLabel,
      inputPlaceholder,
      defaultValue,
      confirmText,
      cancelText,
      confirmVariant,
      cancelVariant,
    });
  });

  /**
   * Menutup tampilan dialog dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
   */
  const closeDialog = (result = null) => {
    const resolver = dialogResolverRef.current;
    dialogResolverRef.current = null;
    setDialog(null);
    resolver?.(result);
  };



  /*
   * =====================================================
   * BACKEND BOOTSTRAP
   * =====================================================
   */

  /**
 * Mengambil ulang data bootstrap setelah tindakan mengubah data, lalu mengganti state aplikasi dengan respons terbaru dari backend.
 */
  const reloadData = async () => {
    const next = await api.bootstrap();
    setData(next);
    return next;
  };

  useEffect(() => {
    let cancelled = false;

        /**
     * Memulihkan status sesi, memeriksa batas waktu tidak aktif, dan memuat data awal aplikasi setelah halaman dibuka atau sesi dipulihkan.
     */
    const hydrate = async () => {
      try {
        const lastActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);
        if (lastActivity && Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
          try { await api.logout(); } catch { /* ignore expired-session cleanup errors */ }
          sessionStorage.removeItem(LAST_ACTIVITY_KEY);
          return;
        }

        const result = await api.me();
        if (!cancelled && result?.user) {
          setSessionState({
            id: result.user.id || result.user._id,
            role: result.user.role,
            user: result.user.username,
            profile: result.user,
          });
          setActiveMenu('dashboard');
        }
      } catch {
        if (!cancelled) setSessionState(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session) {
      setData((current) => ({
        ...current,
        users: [],
        prescriptions: [],
        chronicBooks: {},
        patientHistory: {},
        stock: {},
        stockHistory: {},
        patients: {},
        activities: [],
        notifications: [],
      }));
      return;
    }

    let cancelled = false;
        /**
     * Memulihkan status sesi, memeriksa batas waktu tidak aktif, dan memuat data awal aplikasi setelah halaman dibuka atau sesi dipulihkan.
     */
    const hydrate = async () => {
      try {
        const next = await api.bootstrap();
        if (!cancelled) setData(next);
      } catch (error) {
        if (!cancelled) notify(error?.message || 'Gagal memuat data sistem.', 'warning');
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, [session?.id, session?.role]);

  // Refresh notifications periodically so scheduled stock/expiry alerts appear
  // without requiring the user to reload the whole application.
  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    let inFlight = false;

    /**
 * Memuat ulang notifikasi akun aktif secara berkala. Jika permintaan gagal, daftar notifikasi terakhir tetap dipertahankan agar card tidak mendadak kosong.
 */
    const refreshNotifications = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const notifications = await api.notifications.list();
        if (!cancelled && Array.isArray(notifications)) {
          setData((current) => ({ ...current, notifications }));
        }
      } catch {
        // Keep the last loaded notifications if a periodic refresh fails.
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(refreshNotifications, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.id, session?.role]);



  /*
   * =====================================================
   * TOAST
   * =====================================================
   */

  /**
   * Membuat atau mengirim notifikasi  kepada penerima yang ditentukan aturan bisnis.
   */
  const notify = (
    message,
    tone = 'info'
  ) => {
    const id =
      Date.now() +
      Math.random();

    setToasts([
      createToast(
        id,
        message,
        tone
      ),
    ]);

    window.setTimeout(() => {
      setToasts((current) =>
        current.some((toast) => toast.id === id)
          ? []
          : current
      );
    }, 4500);
  };


  /**
   * Menutup tampilan toast dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
   */
  const dismissToast = (
    id
  ) => {
    setToasts(
      (current) =>
        current.filter(
          (toast) =>
            toast.id !== id
        )
    );
  };

  useEffect(() => {
    if (!session) return undefined;

    /**
     * Mencatat atau menandai aktivitas agar status dan riwayatnya dapat ditelusuri.
     */
    const markActivity = () => {
      sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    };

    const activityEvents = [
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'mousemove',
    ];

    let lastRecorded = 0;
        /**
     * Mencatat interaksi pengguna untuk memperbarui waktu aktivitas terakhir yang dipakai oleh mekanisme logout saat idle.
     */
    const onActivity = () => {
      const now = Date.now();
      if (now - lastRecorded < 30 * 1000) return;
      lastRecorded = now;
      markActivity();
    };

    markActivity();
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, onActivity, { passive: true })
    );

    const interval = window.setInterval(async () => {
      const lastActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);
      if (!lastActivity || Date.now() - lastActivity < IDLE_TIMEOUT_MS) return;

      window.clearInterval(interval);
      try {
        await api.logout();
      } catch {
        // The local session is still cleared even if the server is unreachable.
      }
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
      setSessionState(null);
      setProfileOpen(false);
      notify('Sesi berakhir karena tidak ada aktivitas selama 30 menit.', 'warning');
    }, 15 * 1000);

    return () => {
      window.clearInterval(interval);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, onActivity)
      );
    };
  }, [session?.id]);


  /*
   * =====================================================
   * SESSION
   * =====================================================
   */

  const role =
    session?.role || '';

  /*
   * currentUser pada aplikasi ini adalah username string.
   * Sesuai sistem Anda, username = name.
   */
  const currentUser =
    session?.user || '';


  const stockMap = useMemo(() => {
    if (role !== 'doctor') return data.stock || {};
    return Object.fromEntries((data.medicationOptions || []).map((item) => [item.id, { id: item.id, name: item.name, unit: item.unit, administrationRoute: item.administrationRoute || '', distributor: item.distributor || '-', _id: item.id }]));
  }, [data.stock, data.medicationOptions, role]);



  /*
   * =====================================================
   * AUTHENTICATION / ACCOUNT
   * =====================================================
   */

  /**
   * Menangani aksi login dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleLogin = async ({ username, password }) => {
    try {
      const result = await api.login({ username, password });
      const user = result?.user;
      if (!user) return { ok: false, message: 'Data sesi tidak valid.' };

      setSessionState({
        id: user.id || user._id,
        role: user.role,
        user: user.username,
        profile: user,
      });
      sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      setActiveMenu('dashboard');
      notify('Login berhasil', 'success');
      return { ok: true, user };
    } catch (error) {
      notify(error?.message || 'Username atau password tidak valid.', 'warning');
      return { ok: false, message: error?.message || 'Username atau password tidak valid.' };
    }
  };

  /**
   * Menangani aksi logout dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleLogout = async () => {
    if (!session) return;
    const confirmed = await requestDialog({
      type: 'confirm',
      title: 'Konfirmasi Logout',
      message: `Yakin ingin logout dari akun ${session?.user || 'ini'}?`,
      confirmText: 'Logout',
    });
    if (!confirmed) return;

    try {
      await api.logout();
    } catch (error) {
      notify(error?.message || 'Gagal menutup sesi.', 'warning');
      return;
    }

    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    setSessionState(null);
    setProfileOpen(false);
    notify('Sesi telah ditutup', 'info');
  };

    /**
   * Membersihkan sesi frontend dan state pengguna ketika logout atau ketika sesi tidak lagi dapat dipakai.
   */
  const clearLocalSession = () => {
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    setSessionState(null);
    setProfileOpen(false);
  };

    /**
   * Mengubah penyebab sesi hilang menjadi pesan yang dapat dipahami pengguna tanpa menampilkan detail teknis yang tidak perlu.
   */
  const authLossMessage = (error) => {
    if (error?.status === 401 || error?.code === 'UNAUTHORIZED') {
      return 'Sesi telah berakhir. Silakan login kembali.';
    }

    if (error?.status === 403 || error?.code === 'FORBIDDEN') {
      return 'Sesi atau hak akses tidak lagi valid. Silakan login kembali.';
    }

    return '';
  };

    /**
   * Mencocokkan identitas, peran, dan username dari server dengan sesi frontend agar state lama tidak dipakai setelah sesi berubah.
   */
  const ensureSessionIntegrity = async () => {
    if (!session) {
      notify('Sesi telah berakhir. Silakan login kembali.', 'warning');
      return false;
    }

    try {
      const current = await api.me();
      const currentId = current?.user?.id || current?.user?._id || '';
      const currentRole = current?.user?.role || '';
      const currentUsername = normalizeUsername(current?.user?.username);

      const sameSession =
        String(currentId) === String(session.id) &&
        String(currentRole) === String(session.role) &&
        currentUsername === normalizeUsername(session.user);

      if (!sameSession) {
        clearLocalSession();
        notify('Sesi pada tab ini sudah tidak aktif. Silakan login kembali.', 'warning');
        return false;
      }

      return true;
    } catch (error) {
      const message = authLossMessage(error);
      if (message) {
        clearLocalSession();
        notify(message, 'warning');
        return false;
      }

      notify(error?.message || 'Sesi tidak dapat diverifikasi. Silakan login kembali.', 'warning');
      return false;
    }
  };

  /**
   * Menangani aksi save password dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleSavePassword = async (newPassword) => {
    try {
      await api.changeOwnPassword(String(newPassword || '').trim());
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal mengubah password.' };
    }
  };

  /**
   * Menangani aksi register dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleRegister = async ({ account, str, sip }) => {
    try {
      const result = await api.register({ account, str, sip });
      const emailSent = result?.emailSent !== false;
      const message = emailSent
        ? 'Jika email terdaftar, pemberitahuan pendaftaran sudah dikirim. Periksa kotak masuk dan folder spam.'
        : 'Pendaftaran tersimpan, tetapi email pemberitahuan gagal dikirim.';
      notify(message, emailSent ? 'success' : 'warning');
      return { ok: true, message, emailSent };
    } catch (error) {
      const message = error?.message || 'Pendaftaran gagal. Periksa data dan coba lagi.';
      notify(message, 'warning');
      return { ok: false, message };
    }
  };

  /**
   * Menangani aksi add akun dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleAddAccount = async (account) => {
    try {
      await api.users.create({
        account,
        str: account?.str,
        sip: account?.sip,
      });
      await reloadData();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal menambahkan akun.' };
    }
  };

  /**
   * Menangani aksi change akun dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleChangeAccount = async (originalUsername, updatedAccount) => {
    const id = updatedAccount?._id || updatedAccount?.id || data.users?.find((user) => normalizeUsername(user.username) === normalizeUsername(originalUsername))?._id;
    if (!id) return { ok: false, message: 'Akun tidak ditemukan.' };

    try {
      const result = await api.users.update({
        id,
        account: updatedAccount,
        str: updatedAccount?.str,
        sip: updatedAccount?.sip,
      });
      await reloadData();

      if (String(session?.id || session?._id || '') === String(id)) {
        setSessionState((currentSession) => currentSession ? {
          ...currentSession,
          user: result?.username || updatedAccount.username,
          role: result?.role || updatedAccount.role,
          profile: result || currentSession.profile,
        } : currentSession);
      }

      return { ok: true, user: result };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal memperbarui akun.' };
    }
  };

  /**
   * Menangani aksi toggle akun status dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleToggleAccountStatus = async (user) => {
    if (!user || user.role === 'admin') {
      notify('Akun Admin tidak dapat dinonaktifkan dari menu ini.', 'warning');
      return { ok: false };
    }

    if (!(await ensureSessionIntegrity())) {
      return { ok: false, sessionExpired: true };
    }

    const confirmed = await requestDialog({
      type: 'confirm',
      title: user.active === false ? 'Aktifkan Akun' : 'Nonaktifkan Akun',
      message: `Yakin ingin ${user.active === false ? 'mengaktifkan' : 'menonaktifkan'} akun ${user.username}?`,
      contentMessage: user.active === false
        ? 'Akun akan diaktifkan kembali dan dapat digunakan untuk masuk ke sistem.'
        : 'Akun yang dinonaktifkan tidak dapat digunakan untuk masuk ke sistem sampai diaktifkan kembali.',
      confirmText: user.active === false ? 'Aktifkan' : 'Nonaktifkan',
    });
    if (!confirmed) return { ok: false, cancelled: true };

    try {
      await api.users.toggle(user._id || user.id);
      await reloadData();
      notify(user.active === false ? 'Akun berhasil diaktifkan.' : 'Akun berhasil dinonaktifkan.', 'success');
      return { ok: true };
    } catch (error) {
      const message = authLossMessage(error) || error?.message || 'Gagal memperbarui status akun.';
      if (authLossMessage(error)) {
        clearLocalSession();
      }
      notify(message, 'warning');
      return { ok: false, message, sessionExpired: Boolean(authLossMessage(error)) };
    }
  };

  /**
   * Menangani aksi delete akun dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleDeleteAccount = async (user) => {
    const username = String(user?.username || user?.name || '').trim();
    const id = user?._id || user?.id;
    if (!username || !id) {
      notify('Akun tidak ditemukan atau penghapusan tidak dapat diproses.', 'warning');
      return { ok: false, message: 'Akun tidak ditemukan atau penghapusan tidak dapat diproses.' };
    }

    if (!(await ensureSessionIntegrity())) {
      return { ok: false, sessionExpired: true };
    }

    const confirmed = await requestDialog({
      type: 'confirm',
      title: 'Hapus Akun',
      message: `Yakin ingin menghapus akun ${username}?`,
      contentMessage: 'Akun akan dihapus dari sistem. Pastikan akun yang dipilih sudah benar sebelum melanjutkan.',
      confirmText: 'Hapus',
      confirmVariant: 'danger',
      cancelVariant: 'ghost',
    });
    if (!confirmed) return { ok: false, cancelled: true };

    try {
      await api.users.remove(id);
      await reloadData();
      notify('Akun dihapus', 'success');
      return { ok: true };
    } catch (error) {
      const message = authLossMessage(error) || error?.message || 'Akun tidak ditemukan atau penghapusan tidak dapat diproses.';
      if (authLossMessage(error)) {
        clearLocalSession();
      }
      notify(message, 'warning');
      return { ok: false, message, sessionExpired: Boolean(authLossMessage(error)) };
    }
  };

  /**
   * Menangani aksi request password reset dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleRequestPasswordReset = async (user) => {
    const id = user?._id || user?.id;
    if (!id || user?.role === 'admin') {
      notify('Reset password Admin tidak tersedia dari menu ini.', 'warning');
      return { ok: false };
    }

    try {
      const result = await api.users.requestPasswordReset(id);
      notify('Jika email terdaftar, tautan reset password sudah dikirim. Periksa kotak masuk dan folder spam.', 'success');
      return { ok: true, ...result };
    } catch (error) {
      const message = error?.message || 'Gagal mengirim email reset password.';
      notify(message, 'warning');
      return { ok: false, message };
    }
  };

  /*
   * =====================================================
   * PRESCRIPTION
   * =====================================================
   */

    /**
   * Mengambil identifier resep dari variasi field ID yang masih didukung agar handler resep tetap kompatibel dengan data lama.
   */
  const prescriptionId = (prescription) => prescription?._id || prescription?.mongoId || '';

  /**
   * Menangani aksi submit resep dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleSubmitPrescription = async (payload) => {
    try {
      const meds = (payload?.meds || []).map((r) => ({
        ...r,
        medicationId: r?.medicationId || r?._id || '',
        med: String(r?.med || '').trim(),
        q: Number(r?.qty ?? r?.q ?? 0) || 0,
        u: r?.unit || r?.u || '',
        dn: Number(r?.duration ?? r?.dn ?? 1) || 1,
        du: r?.durationUnit || r?.du || 'hari',
        doseInstruction: String(r?.doseInstruction || r?.aturanPakai || '').trim(),
        aturanPakai: String(r?.doseInstruction || r?.aturanPakai || '').trim(),
        frequency: r?.frequency || '',
        dose: r?.dose || '',
        doseUnit: r?.doseUnit || '',
        route: r?.route || 'Obat dalam/diminum',
        shake: r?.shake || 'Tidak',
        notes: String(r?.notes || r?.catatanTambahan || '').trim(),
        catatanTambahan: String(r?.notes || r?.catatanTambahan || '').trim(),
      }));
      const result = await api.prescriptions.create({ ...payload, meds, bpjsNumber: payload?.bpjsNumber || payload?.bpjs || '' });
      await reloadData();
      return { ok: true, prescription: result };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal membuat resep.' };
    }
  };

  /**
   * Menangani aksi edit resep dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleEditPrescription = async (prescription, diagnosis, meds) => {
    const id = prescriptionId(prescription);
    if (!id) return { ok: false, message: 'Resep tidak ditemukan.' };
    try {
      const normalized = (Array.isArray(meds) ? meds : []).map((m) => ({
        ...m,
        medicationId: m?.medicationId || m?._id || '',
        med: String(m?.med || '').trim(),
        q: Number(m?.q ?? m?.qty ?? 0) || 0,
        u: m?.u || m?.unit || 'tablet',
        dn: Number(m?.dn ?? m?.duration ?? 1) || 1,
        du: m?.du || m?.durationUnit || 'hari',
        doseInstruction: String(m?.doseInstruction || m?.aturanPakai || '').trim(),
        aturanPakai: String(m?.doseInstruction || m?.aturanPakai || '').trim(),
        notes: String(m?.notes || m?.catatanTambahan || '').trim(),
        catatanTambahan: String(m?.notes || m?.catatanTambahan || '').trim(),
      }));
      const result = await api.prescriptions.update(id, { diagnosis: String(diagnosis || '').trim(), meds: normalized });
      await reloadData();
      return { ok: true, prescription: result };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal memperbarui resep.' };
    }
  };

  /**
   * Menangani aksi delete resep dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleDeletePrescription = async (prescription) => {
    if (!prescriptionId(prescription)) return { ok: false, message: 'Resep tidak ditemukan.' };
    const confirmed = await requestDialog({
      type: 'confirm',
      title: 'Hapus Resep',
      message: `Yakin ingin menghapus resep ${prescription.id}?`,
      contentMessage: 'Resep yang dihapus tidak lagi muncul dalam Riwayat Pasien dan tidak dapat dipulihkan.',
      confirmText: 'Hapus',
      confirmVariant: 'danger',
      cancelVariant: 'ghost',
    });
    if (!confirmed) return { ok: false, cancelled: true };
    try {
      await api.prescriptions.remove(prescriptionId(prescription));
      await reloadData();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal menghapus resep.' };
    }
  };

  /**
   * Menangani aksi pick resep dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handlePickPrescription = async (prescription) => {
    if (!prescriptionId(prescription)) return { ok: false, message: 'Resep tidak ditemukan.' };
    try {
      await api.prescriptions.dispense(prescriptionId(prescription));
      await reloadData();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal menebus resep.' };
    }
  };

  /**
   * Menangani aksi notify pasien dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleNotifyPatient = async (prescription) => {
    if (!prescriptionId(prescription)) return { ok: false, message: 'Resep tidak ditemukan.' };
    try {
      await api.prescriptions.notifyPatient(prescriptionId(prescription));
      await reloadData();
      return { ok: true, message: 'Notifikasi simulasi dikirim.' };
    } catch (error) {
      return { ok: false, message: error?.message || 'Nomor telepon tidak tersedia' };
    }
  };

  /*
   * =====================================================
   * STOCK
   * =====================================================
   */

  /**
   * Menangani aksi add stok dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleAddStock = async (payload) => {
    try {
      const result = await api.stock.add(payload);
      await reloadData();
      return { ok: true, transactionId: result?.transactionId };
    } catch (error) {
      return { ok: false, code: error?.code, message: error?.message || 'Gagal memperbarui stok.' };
    }
  };

  /**
   * Menangani aksi update stok gambar dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleUpdateStockImage = async (medicationId, file) => {
    if (!medicationId || !(file instanceof File)) {
      return { ok: false, message: 'Data gambar obat tidak valid.' };
    }
    try {
      await api.stock.updateImage(medicationId, file);
      await reloadData();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal memperbarui gambar obat.' };
    }
  };

  /**
   * Menangani aksi delete stok dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleDeleteStock = async (stockName) => {
    const item = data.stock?.[stockName];
    if (!item?._id) return { ok: false, message: 'Data obat tidak ditemukan.' };
    const remainingQuantity = Number(item.qty || 0);
    const confirmed = await requestDialog({
      type: 'confirm',
      title: 'Hapus Obat',
      message: `Yakin ingin menghapus obat "${item.name || stockName}"?`,
      contentMessage: remainingQuantity > 0
        ? `Sisa stok sebanyak ${remainingQuantity} ${item.unit || ''} beserta seluruh batch akan dikeluarkan dari daftar stok aktif. Data obat, batch, dan riwayat transaksi tetap disimpan sebagai arsip.`
        : 'Obat akan dihapus dari daftar stok aktif. Data master, batch, dan riwayat transaksi tetap disimpan sebagai arsip.',
      confirmText: 'Hapus',
      confirmVariant: 'danger',
      cancelVariant: 'ghost',
    });
    if (!confirmed) return { ok: false, cancelled: true };
    try {
      await api.stock.remove(item._id);
      await reloadData();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal menghapus obat.' };
    }
  };

  /**
   * Menangani aksi delete stok batch dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleDeleteStockBatch = async (stockName, selectedBatch) => {
    const item = data.stock?.[stockName];
    const batchId = selectedBatch?._id;
    if (!item?._id || !batchId) return { ok: false, message: 'Batch obat tidak ditemukan.' };
    if (Number(selectedBatch.qty ?? selectedBatch.quantity ?? 0) > 0) {
      return {
        ok: false,
        message: 'Batch masih memiliki stok. Gunakan fitur Keluarkan Stok untuk obat rusak atau kedaluwarsa.',
      };
    }
    const hasHistory = (data.stockHistory?.[item._id] || []).some((transaction) =>
      String(transaction.batchNumber || '').trim().toLocaleUpperCase('id-ID') ===
      String(selectedBatch.batchNumber || '').trim().toLocaleUpperCase('id-ID')
    );
    if (hasHistory) {
      return {
        ok: false,
        message: 'Batch sudah memiliki riwayat transaksi sehingga tidak dapat dihapus. Pertahankan batch sebagai arsip.',
      };
    }
    const confirmed = await requestDialog({
      type: 'confirm',
      title: 'Hapus Batch Obat',
      message: `Yakin ingin menghapus batch ${selectedBatch.batchNumber || '-'} dari obat "${item.name || stockName}"?`,
      contentMessage: 'Batch hanya dapat dihapus jika jumlah stoknya nol dan belum memiliki riwayat transaksi.',
      confirmText: 'Hapus',
      confirmVariant: 'danger',
      cancelVariant: 'ghost',
    });
    if (!confirmed) return { ok: false, cancelled: true };
    try {
      await api.stock.removeBatch(item._id, batchId);
      await reloadData();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal menghapus batch obat.' };
    }
  };


  /**
   * Menangani aksi withdraw stok batch dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleWithdrawStockBatch = async (stockName, selectedBatch, payload) => {
    const item = data.stock?.[stockName];
    if (!item?._id || !selectedBatch?._id) return { ok: false, message: 'Data batch obat tidak ditemukan.' };
    try {
      const result = await api.stock.withdrawBatch(item._id, selectedBatch._id, payload);
      await reloadData();
      return { ok: true, transactionId: result?.transactionId };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal mengeluarkan stok dari batch.' };
    }
  };


  /*
   * =====================================================
   * CHRONIC BOOK
   * =====================================================
   */

  /**
   * Menangani aksi upload buku dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleUploadBook = async ({ patientId, patientName, bpjsNumber, fileData, fileName }) => {
    try {
      const file = fileData instanceof File ? fileData : null;
      if (!file) return { ok: false, message: 'File PDF tidak valid.' };
      const result = await api.chronicBooks.create({ patientId, patientName, bpjsNumber, file });
      await reloadData();
      return { ok: true, book: result };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal mengunggah Buku Kronis.' };
    }
  };

  /**
   * Menangani aksi update buku berkas dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleUpdateBookFile = async ({ patientId, fileData }) => {
    try {
      const file = fileData instanceof File ? fileData : null;
      if (!file) return { ok: false, message: 'File PDF tidak valid.' };
      const result = await api.chronicBooks.update({ patientId, file });
      await reloadData();
      return { ok: true, book: result };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal mengubah file Buku Kronis.' };
    }
  };

  /**
   * Menangani aksi delete buku dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleDeleteBook = async (patientId) => {
    if (!patientId) return { ok: false, message: 'Data pasien tidak ditemukan.' };
    try {
      await api.chronicBooks.remove(patientId);
      await reloadData();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Gagal menghapus Buku Kronis.' };
    }
  };

  /**
   * Menangani aksi add dosis pilihan dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleAddDoseOption = async (value, unit, route) => {
    await api.doseOptions.add(value, unit, route);
    await reloadData();
  };

  /**
   * Menangani aksi remove dosis pilihan dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleRemoveDoseOption = async (value) => {
    await api.doseOptions.remove(value);
    await reloadData();
  };

  /*
   * =====================================================
   * NOTIFICATIONS
   * =====================================================
   */

  const notifications = data.notifications || [];
  const unreadNotificationCount = notifications.filter((item) => item.unread).length;

  /**
   * Mencatat atau menandai notifikasi read agar status dan riwayatnya dapat ditelusuri.
   */
  const markNotificationsRead = async (notificationId) => {
    try {
      if (notificationId) await api.notifications.read(notificationId);
      else await api.notifications.readAll();
      await reloadData();
    } catch (error) {
      notify(error?.message || 'Gagal memperbarui status notifikasi.', 'warning');
    }
  };


  /*
   * =====================================================
   * TITLE
   * =====================================================
   */

  const title =
    useMemo(
      () => ({
        admin: {
          dashboard:
            'Dashboard Monitoring',

          accounts:
            'Manajemen Akun',

          stock:
            'Stok Obat',
        },

        doctor: {
          dashboard:
            'Dashboard',

          prescription:
            'Resep Obat',

          history:
            'Riwayat Pasien',

          chronic:
            'Buku Kronis',
        },

        pharmacy: {
          dashboard:
            'Dashboard',

          incoming:
            'Resep Obat',

          stock:
            'Manajemen Obat',

          history:
            'Riwayat Pasien',

          chronic:
            'Buku Kronis',
        },
      }[
        role
      ]?.[
        activeMenu
      ] ||
        ROLE_LABELS[
          role
        ] ||
        'Dashboard E-Resep'),
      [
        role,
        activeMenu,
      ]
    );


  /*
   * =====================================================
   * CONTENT
   * =====================================================
   */

  const content =
    useMemo(() => {
      if (!session) {
        return null;
      }


      /*
       * ADMIN
       */
      if (
        role ===
        'admin'
      ) {
        return (
          <AdminPanel
            currentUser={currentUser}
            section={
              activeMenu
            }

            data={
              data
            }

            onReloadData={reloadData}

            onAddAccount={
              handleAddAccount
            }

            onDeleteAccount={
              handleDeleteAccount
            }

            onChangeAccount={
              handleChangeAccount
            }

            onRequestPasswordReset={
              handleRequestPasswordReset
            }

            onToggleAccountStatus={
              handleToggleAccountStatus
            }

            notify={
              notify
            }
          />
        );
      }


      /*
       * DOCTOR
       */
      if (
        role ===
        'doctor'
      ) {
        if (
          activeMenu ===
          'dashboard'
        ) {
          return (
            <DashboardPanel
              role="doctor"
              data={data}
              currentUser={currentUser}
              onEditPrescription={
                handleEditPrescription
              }
              notify={notify}
            />
          );
        }


        if (
          activeMenu ===
          'prescription'
        ) {
          return (
            <PrescriptionForm
              data={data}
              stockMap={
                stockMap
              }
              currentUser={
                currentUser
              }
              onSubmitPrescription={handleSubmitPrescription}
              onReloadData={reloadData}
              requestDialog={requestDialog}
              onAddDoseOption={handleAddDoseOption}
              onRemoveDoseOption={handleRemoveDoseOption}
              notify={
                notify
              }
            />
          );
        }


        if (
          activeMenu ===
          'history'
        ) {
          return (
            <DoctorHistoryPanel
              data={data}
              stockMap={
                stockMap
              }
              currentUser={
                currentUser
              }
              onEditPrescription={
                handleEditPrescription
              }
              onDeletePrescription={handleDeletePrescription}
              onAddDoseOption={handleAddDoseOption}
              onRemoveDoseOption={handleRemoveDoseOption}
              notify={
                notify
              }
            />
          );
        }


        if (
          activeMenu ===
          'chronic'
        ) {
          return (
            <ChronicBookPanel
              role="doctor"
              data={data}
              currentUser={currentUser}
              onUploadBook={handleUploadBook}
              notify={notify}
            />
          );
        }
      }


      /*
       * PHARMACY
       */
      if (
        role ===
        'pharmacy'
      ) {
        if (
          activeMenu ===
          'dashboard'
        ) {
          return (
            <DashboardPanel
              role="pharmacy"
              data={data}
              currentUser={currentUser}
              notify={notify}
            />
          );
        }


        if (
          activeMenu ===
          'incoming'
        ) {
          return (
            <IncomingPrescriptions
              data={data}
              stockMap={
                stockMap
              }
              onPickPrescription={
                handlePickPrescription
              }
              onNotifyPatient={
                handleNotifyPatient
              }
              notify={
                notify
              }
            />
          );
        }


        if (
          activeMenu ===
          'stock'
        ) {
          return (
            <StockManager
              data={data}
              currentUser={
                currentUser
              }
              onAddStock={
                handleAddStock
              }
              onDeleteStock={
                handleDeleteStock
              }
              onDeleteStockBatch={
                handleDeleteStockBatch
              }
              onWithdrawStockBatch={handleWithdrawStockBatch}
              onUpdateStockImage={handleUpdateStockImage}
              notify={
                notify
              }
            />
          );
        }


        if (
          activeMenu ===
          'history'
        ) {
          return (
            <PatientHistoryPanel
              data={data}
              stockMap={
                stockMap
              }
              notify={
                notify
              }
            />
          );
        }


        if (
          activeMenu ===
          'chronic'
        ) {
          return (
            <ChronicBookPanel
              role="pharmacy"
              data={data}
              currentUser={
                currentUser
              }
              onUploadBook={
                handleUploadBook
              }
              onUpdateBookFile={
                handleUpdateBookFile
              }
              onDeleteBook={
                handleDeleteBook
              }
              notify={
                notify
              }
            />
          );
        }
      }


      return null;
    }, [
      session,
      role,
      activeMenu,
      data,
      stockMap,
      currentUser,
      handleUpdateBookFile,
      handleDeleteBook,
    ]);

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">Memuat sistem REMS...</div>
      </div>
    );
  }


  /*
   * =====================================================
   * NOT LOGGED IN
   * =====================================================
   */

  if (!session) {
    return (
      <>
        <AuthScreen
          onLogin={
            handleLogin
          }
          onResetPassword={api.resetPassword}
          onActivateAccount={api.activateAccount}
          onForgotPassword={api.forgotPassword}
          onRegister={handleRegister}
          notify={notify}
        />

        <ToastStack
          toasts={
            toasts
          }
          onDismiss={
            dismissToast
          }
        />
      </>
    );
  }


  /*
   * =====================================================
   * APP
   * =====================================================
   */

  return (
    <>
      <Shell
        role={
          role
        }

        user={
          currentUser
        }

        activeMenu={
          activeMenu
        }

        title={
          title
        }

        onNavigate={
          (key) =>
            key ===
            'profile'
              ? setProfileOpen(
                  true
                )
              : setActiveMenu(
                  key
                )
        }

        onLogout={
          handleLogout
        }

        onProfile={() =>
          setProfileOpen(
            true
          )
        }

        notifications={
          notifications
        }

        unreadNotificationCount={
          unreadNotificationCount
        }

        onNotificationsRead={
          markNotificationsRead
        }
      >
        {
          content
        }
      </Shell>


      <SystemDialog
        open={Boolean(dialog)}
        type={dialog?.type || 'confirm'}
        title={dialog?.title}
        message={dialog?.message}
        contentMessage={dialog?.contentMessage}
        inputLabel={dialog?.inputLabel}
        inputPlaceholder={dialog?.inputPlaceholder}
        defaultValue={dialog?.defaultValue || ''}
        confirmText={dialog?.confirmText || 'Ya'}
        cancelText={dialog?.cancelText || 'Batal'}
        confirmVariant={dialog?.confirmVariant || 'primary'}
        cancelVariant={dialog?.cancelVariant || 'ghost'}
        onConfirm={closeDialog}
        onCancel={() => closeDialog(null)}
      />


      <ProfileModal
        open={
          profileOpen
        }

        user={
          currentUser
        }

        profile={session?.profile}

        onClose={() =>
          setProfileOpen(
            false
          )
        }

        onSavePassword={
          handleSavePassword
        }

        notify={
          notify
        }
      />


      <ToastStack
        toasts={
          toasts
        }

        onDismiss={
          dismissToast
        }
      />
    </>
  );
}
