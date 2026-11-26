/**
 * Menyediakan label, pilihan, dan konstanta domain yang digunakan bersama oleh komponen frontend.
 */
export const ROLE_LABELS = {
  admin: 'Admin',
  doctor: 'Dokter FKTP',
  pharmacy: 'Apoteker',
};

export const ROLE_MENUS = {
  admin: [
    { key: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { key: 'accounts', label: 'Manajemen Akun', icon: 'UsersRound' },
    { key: 'stock', label: 'Stok Obat', icon: 'Package2' },
  ],
  doctor: [
    { key: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { key: 'prescription', label: 'Resep Obat', icon: 'Inbox' },
    { key: 'history', label: 'Riwayat Pasien', icon: 'History' },
    { key: 'chronic', label: 'Buku Kronis', icon: 'FolderHeart' },
  ],
  pharmacy: [
    { key: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { key: 'incoming', label: 'Resep Obat', icon: 'Inbox' },
    { key: 'stock', label: 'Stok Obat', icon: 'Package2' },
    { key: 'history', label: 'Riwayat Pasien', icon: 'History' },
    { key: 'chronic', label: 'Buku Kronis', icon: 'FolderHeart' },
  ],
};

export const MEDICATION_ADMINISTRATION_ROUTES = Object.freeze([
  'Oral (PO)',
  'Buccal (BUC)',
  'Sublingual (SL)',
  'Nasogastric / Enteral Tube (NG/GT)',
  'Rectal (PR)',
  'Vaginal (PV)',
  'Topical (TOP)',
  'Transdermal (TD)',
  'Nasal (NAS)',
  'Inhalation (INH)',
  'Ophthalmic (Eye)',
  'Otic (Ear)',
  'Intravenous (IV)',
  'Intramuscular (IM)',
  'Subcutaneous (SC)',
  'Intradermal (ID)',
  'Intra-arterial (IA)',
  'Intrathecal (IT)',
  'Epidural (EPI)',
  'Intra-articular',
  'Intraosseous (IO)',
  'Intraperitoneal',
  'Intravesical',
  'Endotracheal',
]);

export const STOCK_ALERT_THRESHOLD = 50;
export const EXPIRY_ALERT_DAYS = 30;

export const EMPTY_APP_DATA = {
  users: [], prescriptions: [], chronicBooks: {}, patientHistory: {},
  stock: {}, stockHistory: {}, patients: {}, activities: [],
};
