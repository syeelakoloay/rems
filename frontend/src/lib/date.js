/**
 * Menyediakan fungsi tanggal dan waktu untuk tampilan, filter kalender, serta perhitungan batas waktu di frontend.
 */
/**
 * Menambahkan nol di depan angka satu digit agar bagian tanggal selalu memiliki dua digit.
 */
const pad2 = (value) => String(value).padStart(2, '0');

/**
 * Mengubah nilai tanggal menjadi string tahun-bulan-hari untuk filter dan input kalender.
 */
const toYmd = (input) => {
  const date = input instanceof Date ? input : new Date(input);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${pad2(
    date.getMonth() + 1
  )}-${pad2(date.getDate())}`;
};

/**
 * Membaca dan mengurai tanggal input ke bentuk yang dapat diproses oleh modul.
 */
const parseDateInput = (input) => {
  if (input instanceof Date) return new Date(input.getTime());
  const value = String(input ?? '').trim();
  if (!value) return new Date(Number.NaN);

  // Date-only ISO values represent a calendar date, not UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00+08:00`);
  }

  return new Date(value);
};

const MAKASSAR_TIME_ZONE = 'Asia/Makassar';
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;
const makassarDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MAKASSAR_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Mengubah waktu menjadi komponen tanggal dan nomor hari kalender WITA,
 * tanpa bergantung pada zona waktu perangkat pengguna.
 */
const getMakassarCalendarParts = (input) => {
  const date = parseDateInput(input);
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    makassarDateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );

  return {
    ...parts,
    dayNumber: Math.floor(
      Date.UTC(parts.year, parts.month - 1, parts.day) / CALENDAR_DAY_MS,
    ),
  };
};

const getMakassarCalendarDay = (input) =>
  getMakassarCalendarParts(input)?.dayNumber ?? null;

/**
 * Membandingkan tanggal berdasarkan hari kalender WITA.
 */
export const isSameDay = (dateValue, referenceDate = new Date()) => {
  if (!dateValue) return false;

  const dateDay = getMakassarCalendarDay(dateValue);
  const referenceDay = getMakassarCalendarDay(referenceDate);
  return dateDay !== null && referenceDay !== null && dateDay === referenceDay;
};

/**
 * Menghitung resep dalam tujuh hari kalender terakhir, termasuk hari acuan.
 * Rentang ini membuat KPI mingguan tetap mencakup tujuh hari berjalan meskipun
 * melewati batas Senin atau Minggu. Semua tanggal menggunakan zona WITA.
 */
export const isWithinLastSevenCalendarDays = (dateValue, referenceDate = new Date()) => {
  if (!dateValue) return false;

  const dateDay = getMakassarCalendarDay(dateValue);
  const referenceDay = getMakassarCalendarDay(referenceDate);
  if (dateDay === null || referenceDay === null) return false;

  return dateDay >= referenceDay - 6 && dateDay <= referenceDay;
};

/**
 * Membandingkan bulan kalender berdasarkan zona waktu Asia/Makassar.
 */
export const isSameMonth = (dateValue, referenceDate = new Date()) => {
  if (!dateValue) return false;

  const dateParts = getMakassarCalendarParts(dateValue);
  const referenceParts = getMakassarCalendarParts(referenceDate);
  return Boolean(
    dateParts && referenceParts
    && dateParts.year === referenceParts.year
    && dateParts.month === referenceParts.month,
  );
};

/**
 * Membandingkan tahun kalender berdasarkan zona waktu Asia/Makassar.
 */
export const isSameYear = (dateValue, referenceDate = new Date()) => {
  if (!dateValue) return false;

  const dateParts = getMakassarCalendarParts(dateValue);
  const referenceParts = getMakassarCalendarParts(referenceDate);
  return Boolean(dateParts && referenceParts && dateParts.year === referenceParts.year);
};

/**
 * Menghitung usia berdasarkan tanggal lahir menggunakan kalender lokal.
 * Mengembalikan string kosong untuk tanggal yang tidak valid atau berada di masa depan.
 */
export const calculateAgeFromDateOfBirth = (value, referenceDate = new Date()) => {
  if (!value) return '';

  const birthDate = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return '';

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed = referenceDate.getMonth() > birthDate.getMonth()
    || (referenceDate.getMonth() === birthDate.getMonth()
      && referenceDate.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassed) age -= 1;
  return age >= 0 ? age : '';
};

/**
 * Memformat tanggal untuk tampilan pengguna atau keluaran laporan tanpa mengubah nilai sumber.
 */
export const formatDate = (input) => {
  const date = parseDateInput(input);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    timeZone: MAKASSAR_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

/**
 * Memformat waktu untuk tampilan pengguna atau keluaran laporan tanpa mengubah nilai sumber.
 */
const formatTime = (input) => {
  const date = parseDateInput(input);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    timeZone: MAKASSAR_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
};

/**
 * Memformat tanggal waktu untuk tampilan pengguna atau keluaran laporan tanpa mengubah nilai sumber.
 */
export const formatDateTime = (input) => {
  const date = parseDateInput(input);
  if (Number.isNaN(date.getTime())) return '-';
  return `${formatDate(date)}, ${formatTime(date)} WITA`;
};

/*
 * Batas edit/hapus resep:
 * selalu dihitung dari createdAt.
 *
 * updatedAt TIDAK digunakan untuk
 * memperpanjang batas 24 jam.
 */
/**
 * Mengizinkan perubahan resep hanya jika createdAt valid, tidak berada di masa depan, dan usianya belum melewati 24 jam. updatedAt tidak memperpanjang batas ini.
 */
export const isEditableWithin24Hours = (createdAt) => {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const age = Date.now() - date.getTime();

  return (
    age >= 0 &&
    age <= 24 * 60 * 60 * 1000
  );
};

/**
 * Memeriksa apakah tanggal suatu data berada di dalam rentang filter tanggal yang dipilih pengguna.
 */
export const matchesDateFilter = (
  dateValue,
  filter,
  customDate
) => {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'today') {
    return isSameDay(
      dateValue,
      new Date()
    );
  }

  if (filter === 'yesterday') {
    const yesterday = new Date();

    yesterday.setDate(
      yesterday.getDate() - 1
    );

    return isSameDay(
      dateValue,
      yesterday
    );
  }

  if (filter === 'custom' && customDate) {
    const date = toYmd(dateValue);
    if (!date) return false;

    if (typeof customDate === 'object') {
      const start = String(customDate.start || '');
      const end = String(customDate.end || '');
      if (!start || !end || start > end) return true;
      return date >= start && date <= end;
    }

    // Preserve compatibility with the previous single-day custom filter.
    return date === customDate;
  }

  return true;
};
