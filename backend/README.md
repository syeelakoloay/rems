# REMS Backend

Backend REST API untuk project E-Resep menggunakan Node.js, Express.js, MongoDB/Mongoose, JWT HTTP-only cookie, Zod validation, GridFS, dan role-based authorization.

## Requirements
- Node.js 20+
- MongoDB 7/8 atau MongoDB Atlas
- Frontend Vite berjalan di `http://localhost:5173`

## Setup Windows + VS Code

```powershell
cd backend
copy .env.example .env
npm install
npm run seed
npm run dev
```

Isi `.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/e_resep
CLIENT_URL=http://localhost:5173
JWT_SECRET=ganti_dengan_secret_panjang_acak
PORT=5000
```

Untuk MongoDB Atlas, ganti `MONGODB_URI` dengan connection string Atlas.

> `npm run seed` bersifat non-destruktif. Seed tidak menghapus akun, obat, stok, resep, pasien, Buku Kronis, atau transaksi yang sudah ada. Pada database baru, seed hanya membuat akun Admin dan opsi sistem default.

## API health check
`GET http://localhost:5000/api/health`

Response:
```json
{"success":true,"data":{"status":"ok"}}
```

## Konfirmasi perpindahan FKTP sebelum akses data klinis

Tombol **Ambil Data Sebelumnya** memanggil `GET /api/patients/prescription-prefill` berdasarkan No. BPJS/JKN/KIS atau NIK. Jika `assignedDoctorId` pasien masih menunjuk kepada Dokter FKTP lain, endpoint hanya mengembalikan `confirmationRequired: true`; respons tidak memuat identitas rinci, snapshot resep, alergi, antropometri, SOAP, diagnosis, maupun rincian obat. Frontend kemudian menampilkan modal konfirmasi Mobile JKN.

Tombol tutup (X) menutup modal dan membatalkan proses tanpa perubahan penugasan, tanpa pencatatan konfirmasi, serta tanpa akses atau pengiriman data klinis. Tombol **Ya** menyatakan bahwa Dokter FKTP telah memeriksa Mobile JKN pasien; tindakan tersebut memanggil `POST /api/patients/prescription-prefill/confirm` dengan `confirmed: true`. Backend memperbarui `assignedDoctorId` dengan compare-and-set, menyimpan peristiwa `PenugasanDiperbarui` pada `patienthistories`, serta mencatat aktivitas dokter pada `activities`. Hanya setelah seluruh pencatatan berhasil, frontend memuat ulang data aplikasi dan mengulang permintaan GET prefill. Backend kemudian memberikan akses kepada dokter baru ke seluruh riwayat resep, riwayat pelayanan, dan Buku Kronis pasien yang kini ditugaskan kepadanya, termasuk preview Buku Kronis pada formulir resep. Data resep terakhir juga dikembalikan untuk pengisian formulir, termasuk resep yang dibuat dokter lain atau belum ditebus. No. Kunjungan tidak disalin dan harus diisi untuk kunjungan baru.

Backend menolak `POST /api/prescriptions` jika pasien masih ditugaskan kepada Dokter FKTP lain. Akses baca riwayat resep, riwayat pelayanan, dan Buku Kronis Dokter FKTP mengikuti `assignedDoctorId` pasien. Resep lama tetap tercatat atas nama pembuat aslinya dan hanya dapat diubah atau dihapus oleh dokter pembuat sesuai ketentuan sistem. Konfirmasi adalah pernyataan manual dokter berdasarkan pemeriksaan Mobile JKN, bukan verifikasi otomatis ke BPJS Kesehatan.

## Development accounts
Seed menyediakan akun prototype berikut. Password di database disimpan sebagai bcrypt hash:
- `Admin` / `Admin123.`

Ganti password setelah login menggunakan menu Profil. Kredensial seed tersebut berlaku ketika akun Admin belum ada. Seed bersifat non-destruktif dan tidak mengubah password akun Admin yang sudah tersimpan.

## Security
- Password tidak pernah dikirim kembali ke frontend.
- Session JWT disimpan di HTTP-only cookie.
- Backend memeriksa role untuk setiap endpoint sensitif.
- Dokter tidak memiliki endpoint untuk melihat quantity/batch/expiry stok.
- Audit login/logout ditulis oleh backend.
- Nama akun boleh sama, sedangkan NIK diperiksa sebagai identitas unik. Login mendukung username atau email terdaftar.
- Penghapusan akun bersifat lunak agar riwayat tetap tersedia, tetapi sesi/login akun yang dihapus ditolak.
- Notification read/unread disimpan persisten di MongoDB.
- PDF STR/SIP/Buku Kronis disimpan di GridFS, bukan localStorage/IndexedDB.
- Upload PDF dibatasi 5 MB.


## Konfigurasi email reset password

Fitur **Lupa Password** dan **Kirim Reset Password** memerlukan layanan SMTP yang aktif. Salin variabel dari `.env.example` ke `.env`, lalu isi `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, dan `EMAIL_FROM` sesuai penyedia email; jangan commit kredensial SMTP ke repositori. Untuk port 587 umumnya gunakan `SMTP_SECURE=false` (STARTTLS), sedangkan port 465 umumnya menggunakan `SMTP_SECURE=true`. Jika konfigurasi belum diisi atau pengiriman gagal, backend tidak mengembalikan tautan reset ke frontend dan akan memberikan status gagal pada permintaan Admin.

Tautan reset menggunakan token acak 256-bit, yang disimpan hanya sebagai hash SHA-256 di database, berlaku 15 menit, dan dihapus setelah berhasil digunakan. Permintaan reset dari halaman Login dibatasi berdasarkan alamat IP dan menggunakan respons generik agar tidak mengungkap keberadaan email.


## Pendaftaran akun mandiri

Apoteker dan Dokter FKTP dapat mengajukan akun melalui `POST /api/auth/register` dengan `multipart/form-data`: `name`, `role`, `email`, `nik`, `password`, `str` (PDF), dan `sip` (PDF). Permohonan dicatat sebagai `pending` dan ditampilkan pada bagian **Verifikasi Pembuatan Akun** serta notifikasi Admin. Admin memutuskan permohonan melalui endpoint terproteksi `GET /api/account-registrations`, `POST /api/account-registrations/:id/approve`, dan `POST /api/account-registrations/:id/reject`; akun baru baru dibuat aktif setelah persetujuan. Email penerimaan permohonan dan hasil keputusan memerlukan konfigurasi SMTP yang benar. Jika SMTP gagal, status permohonan tetap tercatat dan aplikasi menampilkan pesan kegagalan pengiriman secara eksplisit.


## Pemeriksaan FKTP manual dan penugasan internal

- `GET /api/patients/identity-status`: menerima `bpjsNumber` dan/atau `nik`, lalu hanya mengembalikan `registered: true/false` berdasarkan kecocokan tepat dengan satu data master pasien. Endpoint ini tidak mengirimkan identitas rinci atau data klinis dan digunakan untuk menentukan apakah tombol **Ambil Data Sebelumnya** dapat diaktifkan.
- `GET /api/patients/prescription-prefill`: menerima `bpjsNumber` dan/atau `nik`. Jika pasien ditugaskan kepada dokter lain, hanya mengembalikan `confirmationRequired: true`; data klinis tidak disertakan. Jika tidak diperlukan konfirmasi, endpoint mengembalikan data identitas dan seluruh data klinis dari resep terakhir.
- `POST /api/patients/prescription-prefill/confirm`: menerima `{ "bpjsNumber": "...", "nik": "...", "confirmed": true }`. Endpoint ini hanya tersedia bagi Dokter FKTP yang terautentikasi. Setelah dokter memilih **Ya** pada modal, backend memperbarui `assignedDoctorId`, mencatat `PenugasanDiperbarui` pada riwayat pasien, dan merekam tindakan pada riwayat aktivitas.
- Jika dokter menutup modal menggunakan tombol (X), frontend tidak memanggil endpoint konfirmasi. Proses dibatalkan dan data klinis tetap tidak dikirim.
- `GET /api/prescriptions/check-visit-number?visitNumber=...` memeriksa duplikasi No. Kunjungan secara global sebelum tombol **Buat Resep** membuka Ringkasan Resep.
- `POST /api/prescriptions` tetap memeriksa duplikasi No. Kunjungan sebagai perlindungan terakhir saat resep disimpan, serta menolak pembuatan resep apabila `assignedDoctorId` masih menunjuk kepada dokter lain. Perpindahan harus diselesaikan sebelum dokter dapat mengakses data klinis dan membuat resep baru.

Pemeriksaan Mobile JKN merupakan tanggung jawab Dokter FKTP yang sedang melayani pasien. REMS tidak terintegrasi dengan aplikasi BPJS Kesehatan dan tidak dapat memastikan apakah perpindahan FKTP telah disahkan BPJS. Setelah penugasan internal diperbarui, dokter baru dapat membaca riwayat resep dan Buku Kronis pasien, sementara setiap resep tetap tercatat atas nama pembuat aslinya dan tidak dipindahkan atau diubah.

## Konfigurasi email (SMTP)

Pengiriman email pendaftaran dan reset password membutuhkan layanan SMTP yang benar-benar dapat diakses. Untuk Gmail, gunakan `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, dan `SMTP_SECURE=false`; isi `SMTP_USER` dengan alamat Gmail pengirim, `SMTP_PASS` dengan Google App Password (bukan password akun biasa), dan `EMAIL_FROM` dengan nama pengirim serta alamat yang diizinkan, misalnya `REMS <alamat@gmail.com>`. Aktifkan Verifikasi 2 Langkah sebelum membuat App Password, lalu restart backend setelah mengubah `backend/.env`.

Alamat email penerima yang benar dan aktif tidak membuktikan bahwa SMTP pengirim telah dikonfigurasi. Jika email tidak terkirim, periksa host, port, kredensial SMTP, izin App Password, alamat pengirim, koneksi internet/server, dan log backend. Jangan memasukkan kredensial SMTP ke frontend atau mengunggahnya ke repositori publik.


## Backup database MongoDB lokal

Backup dibuat menggunakan `mongodump` dari MongoDB Database Tools. Tambahkan pengaturan berikut ke `backend/.env` dan sesuaikan lokasi `mongodump.exe` dengan folder hasil ekstraksi di komputer Anda:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/e_resep
MONGODUMP_PATH=C:/Users/User/Downloads/mongodb-database-tools-windows-x86_64-100.20.1/mongodb-database-tools-windows-x86_64-100.20.1/bin/mongodump.exe
BACKUP_DIR=C:/REMS-Backup
```

Jalankan dari folder `backend`:

```powershell
npm run backup
```

Script membuat folder tujuan jika belum tersedia, menyimpan database ke file `rems-backup-<timestamp>.archive.gz`, memeriksa ukuran file, lalu menghapus file backup dari script yang sama jika umurnya lebih dari 30 hari. Lokasi yang benar adalah nilai `BACKUP_DIR` pada `.env`; baris `Folder backup` pada output menunjukkan lokasi aktual file. Koleksi GridFS (`resepFiles.files` dan `resepFiles.chunks`) ikut tersimpan karena berada di database MongoDB.

Backup **tidak berjalan otomatis** dan tidak dipicu oleh `npm run dev`. Backup hanya dibuat ketika `npm run backup` dijalankan. Untuk menjalankannya otomatis setiap hari, buat tugas di Windows Task Scheduler yang menjalankan `npm.cmd` dengan argumen `run backup` dan folder kerja berupa direktori `backend` proyek. Tugas tersebut tidak memerlukan backend `npm run dev` tetap berjalan, tetapi layanan/server MongoDB lokal harus aktif saat backup dijalankan. Retensi 30 hari diperiksa setiap kali backup berhasil dibuat.

Untuk memulihkan backup, uji terlebih dahulu ke database terpisah, bukan langsung ke `e_resep`. Contoh perintah pemulihan ke database uji:

```powershell
& "C:\Users\User\Downloads\mongodb-database-tools-windows-x86_64-100.20.1\mongodb-database-tools-windows-x86_64-100.20.1\bin\mongorestore.exe" --uri="mongodb://127.0.0.1:27017/e_resep_backup_test" --archive="C:\REMS-Backup\rems-backup-<timestamp>.archive.gz" --gzip --nsFrom="e_resep.*" --nsTo="e_resep_backup_test.*"
```

Jangan menambahkan `--drop` saat menguji restore. Untuk perlindungan dari kerusakan atau kehilangan komputer, salin backup yang berhasil ke media penyimpanan terpisah; folder pada drive yang sama bukan satu-satunya salinan yang aman.
