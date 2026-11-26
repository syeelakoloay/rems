/**
 * Mengelola komunikasi frontend dengan API backend, termasuk normalisasi data respons dan pengiriman formulir atau berkas.
 */
const DEFAULT_API_BASE = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5000/api` : 'http://localhost:5000/api';
const API_BASE = (import.meta.env.VITE_API_URL || DEFAULT_API_BASE).replace(/\/$/, '');

/**
 * Mengirim permintaan HTTP dengan cookie sesi, mengubah body objek menjadi JSON bila diperlukan, lalu membaca data API. Kesalahan jaringan, respons non-JSON, dan status HTTP gagal diteruskan sebagai Error.
 */
async function request(path, options = {}) {
  const config = { credentials: 'include', ...options, headers: { ...(options.headers || {}) } };
  if (config.body && !(config.body instanceof FormData) && typeof config.body !== 'string') {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(config.body);
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, config);
  } catch (cause) {
    const error = new Error('Tidak dapat terhubung ke server REMS. Periksa koneksi dan pastikan backend sedang berjalan.');
    error.cause = cause;
    throw error;
  }
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.success === false) {
    const fallbackMessage = response.status === 404
      ? 'Fitur yang diminta belum tersedia. Muat ulang aplikasi; jika masalah berlanjut, hubungi Admin.'
      : response.status >= 500
        ? 'Terjadi kendala pada server. Coba kembali beberapa saat lagi atau hubungi Admin.'
        : `Permintaan belum berhasil (kode ${response.status}). Periksa data yang diisi lalu coba lagi.`;
    const error = new Error(payload?.error?.message || fallbackMessage);
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload?.data;
}

/**
 * Mengubah pasangan field teks dan objek File menjadi FormData agar endpoint unggah menerima multipart/form-data.
 */
const toFormData = (fields = {}, files = {}) => {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  Object.entries(files).forEach(([key, value]) => {
    if (value instanceof File) form.append(key, value, value.name);
  });
  return form;
};

/**
 * Menyeragamkan pengguna dokumen agar pencarian, perbandingan, dan validasi menggunakan format yang konsisten.
 */
function normalizeUserDocument(value) {
  if (!value) return null;
  if (value.url?.startsWith('http')) return value;
  if (value.fileId) return { ...value, url: `${API_BASE}/files/${value.fileId}` };
  return value;
}

/** Menyeragamkan data stok dari bootstrap agar URL gambar siap digunakan komponen frontend. */
function normalizeStockMap(stock = {}) {
  return Object.fromEntries(
    Object.entries(stock || {}).map(([name, item]) => [
      name,
      {
        ...item,
        image: item?.imageFileId
          ? `${API_BASE}/files/${item.imageFileId}`
          : item?.image || null,
      },
    ]),
  );
}

/**
 * Menyeragamkan bootstrap agar pencarian, perbandingan, dan validasi menggunakan format yang konsisten.
 */
function normalizeBootstrap(data) {
  const next = { ...data };
  next.stock = normalizeStockMap(data.stock || {});
  next.users = (data.users || []).map((u) => ({ ...u, str: normalizeUserDocument(u.str), sip: normalizeUserDocument(u.sip) }));
  next.chronicBooks = Object.fromEntries(Object.entries(data.chronicBooks || {}).map(([id, b]) => [id, { ...b, fileData: b.fileId ? `${API_BASE}/files/${b.fileId}` : b.fileData, fileUrl: b.fileId ? `${API_BASE}/files/${b.fileId}` : b.fileUrl }]));
  next.notifications = data.notifications || [];
  next.doseOptions = data.doseOptions || [];
  next.doseOptionUnits = data.doseOptionUnits || {};
  next.doseOptionRoutes = data.doseOptionRoutes || {};
  return next;
}

export const api = Object.freeze({
  baseUrl: API_BASE,
  me: () => request('/auth/me'),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  resetPassword: (payload) => request('/auth/reset-password', { method: 'POST', body: payload }),
  activateAccount: (payload) => request('/auth/activate-account', { method: 'POST', body: payload }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
  register: ({ account, str, sip }) => request('/auth/register', { method: 'POST', body: toFormData({ name: account.name, role: account.role, email: account.email, nik: account.nik, password: account.password }, { str, sip }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  bootstrap: async () => normalizeBootstrap(await request('/app')),
  changeOwnPassword: (password) => request('/profile/password', { method: 'PATCH', body: { password } }),

  accountRegistrations: {
    list: () => request('/account-registrations'),
    approve: (id) => request(`/account-registrations/${encodeURIComponent(id)}/approve`, { method: 'POST', body: {} }),
    reject: (id, reason = '') => request(`/account-registrations/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { reason } }),
  },

  users: {
    create: ({ account, str, sip }) => request('/users', { method: 'POST', body: toFormData({ name: account.name, role: account.role, email: account.email, nik: account.nik }, { str, sip }) }),
    update: ({ id, account, str, sip }) => request(`/users/${id}`, { method: 'PATCH', body: toFormData({ name: account.username || account.name, role: account.role, email: account.email, nik: account.nik }, { str, sip }) }),
    toggle: (id) => request(`/users/${id}/status`, { method: 'PATCH' }),
    remove: (id) => request(`/users/${id}`, { method: 'DELETE' }),
    requestPasswordReset: (id) => request(`/users/${id}/password-reset`, { method: 'POST' }),
  },

  prescriptions: {
    list: () => request('/prescriptions'),
    checkVisitNumber: (visitNumber) => request(`/prescriptions/check-visit-number?visitNumber=${encodeURIComponent(visitNumber)}`),
    create: (payload) => request('/prescriptions', { method: 'POST', body: payload }),
    update: (id, payload) => request(`/prescriptions/${id}`, { method: 'PATCH', body: payload }),
    remove: (id) => request(`/prescriptions/${id}`, { method: 'DELETE' }),
    dispense: (id) => request(`/prescriptions/${id}/dispense`, { method: 'POST' }),
    notifyPatient: (id) => request(`/prescriptions/${id}/notify-patient`, { method: 'POST' }),
  },

  stock: {
    add: (payload = {}) =>
      request('/stock', {
        method: 'POST',
        body: toFormData(
          {
            medicationId: payload.existingMedicationId || payload.medicationId,
            name: payload.name,
            stockName: payload.stockName,
            distributor: payload.distributor,
            qty: payload.qty,
            unit: payload.unit,
            administrationRoute: payload.administrationRoute,
            minStock: payload.minStock,
            expiryDate: payload.expiryDate,
            batchNumber: payload.batchNumber,
            type: payload.type,
          },
          { image: payload.file },
        ),
      }),
    updateImage: (id, file) => request(`/stock/${id}/image`, { method: 'PATCH', body: toFormData({}, { image: file }) }),
    remove: (id) => request(`/stock/${id}`, { method: 'DELETE' }),
    removeBatch: (id, batchId) => request(`/stock/${id}/batches/${batchId}`, { method: 'DELETE' }),
    withdrawBatch: (id, batchId, payload) => request(`/stock/${id}/batches/${batchId}/withdraw`, { method: 'POST', body: payload }),
  },

  patients: {
    list: () => request('/patients'),
    checkRegistration: ({ bpjsNumber, nik }) => {
      const params = new URLSearchParams();
      if (bpjsNumber) params.set('bpjsNumber', bpjsNumber);
      if (nik) params.set('nik', nik);
      return request(`/patients/identity-status?${params.toString()}`);
    },
    getPrescriptionPrefill: ({ bpjsNumber, nik }) => {
      const params = new URLSearchParams();
      if (bpjsNumber) params.set('bpjsNumber', bpjsNumber);
      if (nik) params.set('nik', nik);
      return request(`/patients/prescription-prefill?${params.toString()}`);
    },
    confirmFktpTransfer: ({ bpjsNumber, nik }) => request('/patients/prescription-prefill/confirm', {
      method: 'POST',
      body: { bpjsNumber, nik, confirmed: true },
    }),
  },

  chronicBooks: {
    create: ({ patientId, patientName, bpjsNumber, file }) => request('/chronic-books', { method: 'POST', body: toFormData({ patientId, patientName, bpjsNumber }, { file }) }),
    update: ({ patientId, file }) => request(`/chronic-books/${patientId}`, { method: 'PATCH', body: toFormData({}, { file }) }),
    remove: (patientId) => request(`/chronic-books/${patientId}`, { method: 'DELETE' }),
  },
  files: {
    createObjectUrl: async (fileId) => {
      const response = await fetch(`${API_BASE}/files/${encodeURIComponent(fileId)}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        let message = `File tidak dapat dibuka (${response.status}).`;
        try {
          const payload = await response.json();
          message = payload?.error?.message || message;
        } catch {
          // The response may not be JSON for some server errors.
        }
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    },
  },

  notifications: {
    list: () => request('/notifications'),
    read: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    readAll: () => request('/notifications/read-all', { method: 'PATCH' }),
  },

  doseOptions: {
    add: (value, unit = '', route = '') => request('/options/dose', { method: 'POST', body: { value, ...(unit ? { unit } : {}), ...(route ? { route } : {}) } }),
    remove: (value) => request(`/options/dose?value=${encodeURIComponent(value)}`, { method: 'DELETE' }),
  },
});
