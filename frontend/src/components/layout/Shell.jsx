/**
 * Menyusun kerangka halaman setelah login, navigasi, notifikasi, dan area konten utama.
 */
import { formatDateTime } from '../../lib/date';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu,
  LogOut,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  CircleUserRound,
  FolderHeart,
  History,
  Package2,
  Pill,
  Inbox,
  LayoutDashboard,
  UsersRound,
} from 'lucide-react';
import { ROLE_LABELS, ROLE_MENUS } from '../../data/constants';
import { Button } from '../ui/Button';

/**
 * Membaca dan mengurai notifikasi tanggal ke bentuk yang dapat diproses oleh modul.
 */
function parseNotificationDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Memformat notifikasi tanggal untuk tampilan pengguna atau keluaran laporan tanpa mengubah nilai sumber.
 */
function formatNotificationDate(value) {
  const date = parseNotificationDate(value);
  if (!date) return '';
  return formatDateTime(date);
}

// Keep internal date keys numeric and locale-independent. The displayed label
// can use a localized month name, but a month name must never enter this key.
/**
 * Mengubah waktu notifikasi menjadi kunci tanggal lokal untuk mengelompokkan notifikasi berdasarkan hari.
 */
function notificationDateKey(value) {
  const date = parseNotificationDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!/^\d{4}$/.test(values.year || '')
    || !/^\d{2}$/.test(values.month || '')
    || !/^\d{2}$/.test(values.day || '')) return '';
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Membaca dan mengurai tanggal key ke bentuk yang dapat diproses oleh modul.
 */
function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (!Number.isFinite(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day) return null;
  return { year, month, day, date };
}

/**
 * Menggeser kunci tanggal kalender sejumlah hari tanpa mengandalkan perubahan zona waktu browser.
 */
function shiftDateKey(dateKey, amount) {
  const parsed = parseDateKey(dateKey);
  if (!parsed || !Number.isFinite(Number(amount))) return '';
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + Number(amount), 12));
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Memformat notifikasi group label untuk tampilan pengguna atau keluaran laporan tanpa mengubah nilai sumber.
 */
function formatNotificationGroupLabel(dateKey, todayKey, yesterdayKey) {
  if (dateKey === todayKey) return 'Hari Ini';
  if (dateKey === yesterdayKey) return 'Kemarin';
  const parsed = parseDateKey(dateKey);
  if (!parsed) return 'Tanggal Tidak Diketahui';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar', day: 'numeric', month: 'long', year: 'numeric',
  }).format(parsed.date);
}

const ICONS = {
  Menu,
  LogOut,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  CircleUserRound,
  FolderHeart,
  History,
  Package2,
  Pill,
  Inbox,
  LayoutDashboard,
  UsersRound,
};

/**
 * Merender komponen shell dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function Shell({
  role,
  user,
  activeMenu,
  title,
  onNavigate,
  onLogout,
  onProfile,
  notifications = [],
  unreadNotificationCount = 0,
  onNotificationsRead,
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [visibleNotificationCount, setVisibleNotificationCount] = useState(5);
  const notificationWrapRef = useRef(null);

  const menuItems = useMemo(() => ROLE_MENUS[role] || [], [role]);

  const sortedNotifications = useMemo(() => (
    [...(notifications || [])].sort((a, b) => {
      const timeA = parseNotificationDate(a?.createdAt)?.getTime() || 0;
      const timeB = parseNotificationDate(b?.createdAt)?.getTime() || 0;
      return timeB - timeA;
    })
  ), [notifications]);

  const visibleNotifications = sortedNotifications.slice(0, visibleNotificationCount);
  const todayKey = notificationDateKey(new Date());
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const notificationGroups = useMemo(() => {
    const groups = [];
    const byKey = new Map();
    visibleNotifications.forEach((item) => {
      const dateKey = notificationDateKey(item?.createdAt) || 'unknown';
      if (!byKey.has(dateKey)) {
        const group = { key: dateKey, label: dateKey === 'unknown' ? 'Tanggal Tidak Diketahui' : formatNotificationGroupLabel(dateKey, todayKey, yesterdayKey), items: [] };
        byKey.set(dateKey, group);
        groups.push(group);
      }
      byKey.get(dateKey).items.push(item);
    });
    return groups;
  }, [visibleNotifications, todayKey, yesterdayKey]);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    /**
     * Menangani aksi pointer down dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
     */
    const handlePointerDown = (event) => {
      if (!notificationWrapRef.current?.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [notificationsOpen]);

    /**
   * Mengubah menu aktif dan menutup navigasi mobile setelah pengguna berpindah halaman.
   */
  const navigate = (key) => {
    onNavigate?.(key);
    setMobileOpen(false);
  };

  return (
    <div className={`shell ${mobileOpen ? 'shell-mobile-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <img src="/logo-no bg.png" alt="REMS logo" />
          </div>
          <div>
            <div className="brand-title">REMS</div>
            <div className="brand-subtitle">Apotek Re'ra Farma</div>
          </div>
        </div>

        <div className="sidebar-user">
          <CircleUserRound size={18} />
          <div>
            <strong>{user}</strong>
            <span>{ROLE_LABELS[role]}</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Menu utama">
          {menuItems.map((item) => {
            const Icon = ICONS[item.icon] || Menu;
            const active = activeMenu === item.key;
            return (
              <button
                type="button"
                key={item.key}
                className={`nav-item ${active ? 'is-active' : ''}`}
                onClick={() => navigate(item.key)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            <Button variant="ghost" size="icon" className="mobile-menu-btn" onClick={() => setMobileOpen((value) => !value)}>
              {mobileOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </Button>
          </div>

          <div className="topbar-actions">
            <div className="notification-wrap" ref={notificationWrapRef}>
              <Button
                variant="ghost"
                size="icon"
                className="topbar-icon-btn"
                aria-label="Notifikasi"
                title="Notifikasi"
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((value) => {
                    const next = !value;
                    if (next) setVisibleNotificationCount(5);
                    return next;
                  });
                  if (!notificationsOpen) {
                    // Reading is handled per notification so the dropdown can
                    // visibly distinguish unread and already-read items.
                  }
                }}
              >
                <Bell size={18} />
                {unreadNotificationCount > 0 ? (
                  <span className="notification-count" aria-label={`${unreadNotificationCount} notifikasi belum dibaca`}>
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                ) : null}
              </Button>

              {notificationsOpen ? (
                <div className="notification-panel" role="dialog" aria-label="Daftar notifikasi">
                  <div className="notification-panel-head">
                    <div>
                      <strong>Notifikasi</strong>
                      <span>{unreadNotificationCount} belum dibaca</span>
                    </div>
                    <button
                      type="button"
                      className="notification-read-all"
                      onClick={() => onNotificationsRead?.()}
                      disabled={unreadNotificationCount === 0}
                    >
                      Tandai semua dibaca
                    </button>
                  </div>

                  {visibleNotifications.length ? (
                    <div className="notification-list">
                      {notificationGroups.map((group) => (
                        <section className="notification-group" key={group.key} aria-label={group.label}>
                          <h4 className="notification-group-heading">{group.label}</h4>
                          <div className="notification-group-items">
                            {group.items.map((item) => (
                              <button
                                type="button"
                                className={`notification-item notification-${item.tone || 'info'} ${item.unread ? 'is-unread' : 'is-read'}`}
                                key={item.id}
                                onClick={() => onNotificationsRead?.(item.id)}
                                aria-label={`${item.title}. ${item.unread ? 'Belum dibaca' : 'Sudah dibaca'}`}
                              >
                                <div className="notification-item-icon"><Bell size={16} /></div>
                                <div className="notification-item-content">
                                  <div className="notification-item-title">
                                    <strong>{item.title}</strong>
                                    {item.unread ? <span className="notification-unread-dot" aria-hidden="true" /> : null}
                                  </div>
                                  <span>{item.message}</span>
                                  {formatNotificationDate(item.createdAt) ? (
                                    <time dateTime={item.createdAt}>{formatNotificationDate(item.createdAt)}</time>
                                  ) : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="notification-empty">Tidak ada notifikasi.</div>
                  )}

                  {visibleNotificationCount < sortedNotifications.length ? (
                    <button
                      type="button"
                      className="notification-show-more"
                      onClick={() => setVisibleNotificationCount((count) => Math.min(count + 10, sortedNotifications.length))}
                    >
                      Tampilkan lebih banyak
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="topbar-icon-btn"
              onClick={onProfile}
              aria-label="Profil"
              title="Profil"
            >
              <CircleUserRound size={18} />
            </Button>

            <Button variant="danger" size="sm" onClick={onLogout}>
              <LogOut size={16} />
              <span>Logout</span>
            </Button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>

      {mobileOpen ? <button type="button" className="shell-backdrop" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} /> : null}
    </div>
  );
}
