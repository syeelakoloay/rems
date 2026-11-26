# REMS - Sistem E-Prescribing dan Manajemen Stok Obat

REMS (Resep Elektronik dan Manajemen Stok Obat) adalah aplikasi berbasis web untuk mendukung pelayanan resep pasien kronis dan pengelolaan persediaan obat di Apotek Re'ra Farma. Aplikasi terdiri atas frontend React + Vite, backend Node.js + Express.js, serta database MongoDB dengan Mongoose.

Sistem digunakan oleh tiga peran, yaitu Admin, Apoteker, dan Dokter Fasilitas Kesehatan Tingkat Pertama (FKTP).

## 1. Fitur berdasarkan peran

### Admin

- Melihat dashboard monitoring dan riwayat aktivitas pengguna.
- Meninjau, menyetujui, atau menolak permohonan pendaftaran Apoteker dan Dokter FKTP; Admin juga dapat membuat akun secara langsung melalui menu Manajemen Akun.
- Mengelola akun Apoteker dan Dokter FKTP, termasuk perubahan data, aktivasi atau penonaktifan, permintaan reset password, dan penghapusan akun secara lunak.
- Memantau ketersediaan stok obat, jumlah persediaan, batch, dan riwayat transaksi tanpa mengubah data persediaan.
- Melihat notifikasi internal.
- Mengekspor laporan PDF melalui frontend.

### Apoteker

- Melihat dashboard dan seluruh resep elektronik dalam lingkungan kerja sama Apotek Re'ra Farma, termasuk resep yang dibuat oleh Dokter FKTP.
- Membaca seluruh data pasien dan resep yang tersedia dalam lingkungan kerja sama.
- Meninjau dan menebus resep setelah memeriksa kelayakan serta ketersediaan stok. Pada Modal Ringkasan Resep, Apoteker juga dapat melihat penanda apakah Dokter FKTP telah mencatat konfirmasi pemeriksaan FKTP secara manual; penanda ini bukan verifikasi BPJS dan tidak otomatis memblokir peninjauan atau penebusan resep.
- Mengelola master obat, gambar obat, batch, persediaan, dan transaksi stok masuk maupun keluar.
- Mengelola dokumen Buku Kronis pasien dalam format PDF, termasuk mengunggah, mengganti, dan menghapus dokumen.
- Melihat riwayat pasien dan riwayat transaksi stok.
- Menyiapkan dan mencetak etiket obat melalui fitur cetak browser.
- Mengekspor laporan PDF melalui frontend dan menerima notifikasi internal.

### Dokter FKTP

- Melihat dashboard, identitas pasien yang sedang ditanganinya, serta seluruh riwayat resep dan Buku Kronis pasien yang saat ini ditugaskan kepadanya. Setelah mengonfirmasi perpindahan FKTP melalui modal **Ambil Data Sebelumnya**, Dokter FKTP yang baru dapat melihat riwayat resep dan Buku Kronis pasien tersebut, termasuk preview dokumen ketika membuat resep.
- Membuat dan mengirim resep elektronik untuk pasien kronis.
- Memilih diagnosis dari katalog ICD-10 yang tersedia pada formulir resep serta mengelola pilihan aturan pakai/dosis dengan menambah atau menghapus opsi.
- Melihat seluruh riwayat resep pasien yang sedang ditanganinya, termasuk resep yang dibuat oleh Dokter FKTP sebelumnya setelah perpindahan dikonfirmasi, serta mengakses dokumen Buku Kronis pasien tersebut.
- Mengekspor laporan PDF melalui frontend.
- Mengubah atau menghapus resep milik sendiri selama resep masih berstatus pending dan belum melewati 24 jam sejak dibuat.
- Tidak dapat melihat jumlah stok, informasi batch, maupun tanggal kedaluwarsa obat.

## 2. Aturan dan batasan sistem

- Apoteker dan Dokter FKTP dapat mengajukan pendaftaran secara mandiri dengan mengunggah dokumen STR dan SIP dalam format PDF. Permohonan disimpan dengan status menunggu verifikasi dan diproses oleh Admin.
- Admin juga dapat membuat akun Apoteker atau Dokter FKTP secara langsung. Akun yang dibuat melalui menu Admin menunggu aktivasi melalui tautan email sebelum dapat digunakan.
- Pengiriman email untuk aktivasi akun, reset password, dan pemberitahuan keputusan pendaftaran memerlukan konfigurasi SMTP yang valid. Kegagalan pengiriman email ditampilkan oleh aplikasi sesuai proses yang dijalankan.
- Hak akses akun tidak dapat diubah setelah akun dibuat.
- Akun non-Admin dihapus menggunakan mekanisme soft-delete agar catatan historis yang berkaitan tetap tersimpan. Akun Admin tidak dapat dihapus melalui menu Manajemen Akun.
- Perubahan atau penghapusan resep hanya diizinkan untuk resep yang dibuat oleh Dokter FKTP terkait, masih berstatus pending, dan belum melewati 24 jam sejak `createdAt`. Resep yang sudah ditebus tidak dapat diubah atau dihapus.
- Penebusan resep memeriksa kecukupan stok dan menggunakan urutan FEFO (First Expired, First Out), kemudian FIFO (First In, First Out) untuk menentukan batch yang digunakan.
- Akun Apoteker yang telah terdaftar dan aktif dapat membaca data pasien dan seluruh resep dalam lingkungan kerja sama Apotek Re'ra Farma. Daftar pasien Dokter FKTP dibatasi pada pasien yang saat ini ditugaskan kepadanya; daftar resep, riwayat pelayanan, dan Buku Kronis mengikuti cakupan pasien tersebut. Ketika Dokter FKTP menekan tombol **Ambil Data Sebelumnya**, REMS memeriksa penugasan internal pasien. Jika pasien masih ditugaskan kepada dokter lain, REMS terlebih dahulu menampilkan modal yang meminta dokter memastikan perpindahan FKTP melalui aplikasi Mobile JKN. Tombol tutup (X) membatalkan proses dan tidak mengembalikan data klinis. Tombol **Ya** memperbarui penugasan internal kepada dokter yang sedang login, mencatat konfirmasi pada riwayat aktivitas dan riwayat pasien, kemudian mengizinkan akses ke seluruh riwayat resep dan Buku Kronis pasien tersebut. Resep lama tetap tercatat atas nama pembuat aslinya, tetapi dapat dibaca oleh dokter yang kini ditugaskan kepada pasien.
- Jumlah stok, informasi batch, dan tanggal kedaluwarsa tidak dikirimkan kepada Dokter FKTP.
- Admin hanya dapat memantau stok dan transaksi. Pengelolaan master obat serta persediaan dilakukan oleh Apoteker.
- Pengelolaan dokumen Buku Kronis dilakukan oleh Apoteker. Dokter FKTP dan Apoteker dapat membaca dokumen sesuai hak akses.
- Tindakan `Notify Patient` merupakan prototipe. Backend hanya memeriksa ketersediaan nomor telepon pasien dan memperbarui penanda `notificationSent` pada resep. Sistem belum mengirimkan pesan kepada pasien melalui WhatsApp, SMS, atau layanan pesan lainnya.
- Ekspor laporan PDF dilakukan di frontend menggunakan jsPDF.
- Sistem tidak terintegrasi dengan aplikasi BPJS Kesehatan atau Rekam Medis Elektronik (RME), sehingga tidak dapat memverifikasi status kepesertaan JKN maupun perpindahan FKTP secara otomatis. Ketika pasien masih ditugaskan kepada Dokter FKTP lain, REMS meminta dokter yang sedang melayani memastikan perpindahan melalui aplikasi Mobile JKN sebelum mengakses data klinis resep sebelumnya. Jika dokter menutup modal melalui tombol (X), proses pengambilan data dibatalkan dan data klinis tidak dikirimkan. Jika dokter memilih **Ya**, REMS memperbarui penugasan internal pasien kepada dokter tersebut dan mencatat konfirmasi pada riwayat aktivitas serta riwayat pasien. Konfirmasi ini merupakan pernyataan manual Dokter FKTP, bukan verifikasi langsung BPJS Kesehatan dan tidak menentukan keabsahan administrasi kepesertaan JKN. Nomor kunjungan diisi secara manual oleh pengguna.
- Sistem dirancang untuk mendukung alur pelayanan pasien kronis dan tidak menyediakan alur pelayanan khusus untuk pasien akut.

## 3. Teknologi dan arsitektur

| Bagian | Teknologi |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Autentikasi | JWT melalui cookie HTTP-only |
| Validasi | Zod dan validasi pada service/controller |
| Penyimpanan dokumen | MongoDB GridFS dengan bucket `resepFiles` |
| Pembuatan laporan PDF | jsPDF pada frontend |

Alur komunikasi aplikasi:

```text
React + Vite (Frontend)
        |
        | HTTP REST API + cookie HTTP-only
        v
Node.js + Express.js (Backend)
        |
        +---- Middleware autentikasi dan hak akses
        |
        +---- Controller dan service
        |
        +---- MongoDB melalui Mongoose
        |
        +---- GridFS untuk penyimpanan berkas
```

Data operasional dan aturan bisnis utama diproses di backend. Frontend berkomunikasi dengan backend melalui endpoint REST API di bawah prefix `/api`.

## 4. Struktur proyek

```text
project-root/
├── README.md
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── scripts/
│   │   └── seed.js
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── validators/
│   └── tests/
└── frontend/
    ├── .env.example
    ├── package.json
    ├── index.html
    ├── public/
    ├── src/
    │   ├── components/
    │   ├── data/
    │   ├── lib/
    │   └── styles/
    └── tests/
```

## 5. Prasyarat

Pastikan perangkat pengembangan telah memiliki:

- Node.js versi 20 atau lebih baru.
- npm yang sesuai dengan instalasi Node.js.
- MongoDB lokal atau MongoDB Atlas.
- Visual Studio Code atau editor kode lainnya.
- Browser modern, seperti Google Chrome.

## 6. Konfigurasi dan menjalankan aplikasi

### 6.1. Menyiapkan backend

Buka terminal pertama dari direktori utama proyek, kemudian jalankan:

```powershell
cd backend
Copy-Item .env.example .env
npm install
```

Buka `backend/.env` dan sesuaikan konfigurasi berikut:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/e_resep
CLIENT_URL=http://localhost:5173
JWT_SECRET=ganti_dengan_secret_acak_yang_panjang
JWT_EXPIRES_IN=8h
SESSION_COOKIE_NAME=rems_session
GRIDFS_BUCKET=resepFiles
MAX_FILE_SIZE_MB=5

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=alamat-email-pengirim@gmail.com
SMTP_PASS=google-app-password
EMAIL_FROM=REMS <alamat-email-pengirim@gmail.com>
PASSWORD_RESET_REQUEST_LIMIT=5
```

Keterangan:

- `MONGODB_URI`, `JWT_SECRET`, dan `CLIENT_URL` wajib diisi.
- Untuk MongoDB Atlas, ganti `MONGODB_URI` dengan connection string dari cluster Atlas.
- Gunakan secret acak yang kuat untuk `JWT_SECRET`. Jangan menggunakan nilai contoh di lingkungan produksi.
- Konfigurasi SMTP diperlukan untuk layanan email, seperti aktivasi akun, reset password, dan pemberitahuan pendaftaran.
- Untuk Gmail, gunakan Google App Password, bukan password akun Google biasa. Pada port 587, gunakan `SMTP_SECURE=false`.
- `CLIENT_URLS` dapat ditambahkan sebagai daftar origin frontend tambahan yang dipisahkan koma apabila diperlukan. Pada mode development, backend juga mengizinkan `http://localhost:5173` dan `http://localhost:5174`.

Setelah konfigurasi selesai, jalankan seed dan backend:

```powershell
npm run seed
npm run dev
```

Secara default, backend berjalan pada:

```text
http://localhost:5000
```

### 6.2. Menyiapkan frontend

Buka terminal kedua dari direktori utama proyek, kemudian jalankan:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
```

Pastikan `frontend/.env` berisi:

```env
VITE_API_URL=http://localhost:5000/api
```

Jalankan frontend:

```powershell
npm run dev
```

Buka alamat yang ditampilkan Vite, biasanya:

```text
http://localhost:5173
```

Jika port 5173 sedang digunakan, Vite dapat memilih port berikutnya, misalnya 5174. Backend mengizinkan kedua origin tersebut pada mode development.

## 7. Akun development dan seed data

Seed menyediakan akun Admin berikut untuk database yang belum memiliki akun Admin:

```text
Username : Admin
Password : Admin123.
```

Jalankan seed dari folder `backend` dengan perintah `npm run seed`.

Seed bersifat non-destruktif dan idempoten. Seed membuat akun Admin jika belum tersedia serta menyiapkan pilihan dosis bawaan. Seed tidak membuat data pasien, master obat, batch stok, resep, maupun Buku Kronis. Seed juga tidak mengganti password akun Admin yang sudah ada.

Untuk data pasien lama, jalankan `npm run migrate:patient-assignments` setelah membuat cadangan database. Skrip ini hanya menampilkan daftar pasien yang belum memiliki penanggung jawab beserta kandidat Dokter dari riwayat resep; skrip tidak mengubah data karena riwayat resep tidak dapat memverifikasi FKTP pasien saat ini.

npm run assign:patient-doctor -- --patient-id=ObjectId --doctor=username

Ganti password development setelah login dan jangan menggunakan kredensial seed di lingkungan produksi.

## 8. Referensi endpoint REST API

Seluruh endpoint menggunakan prefix `/api`. Endpoint yang memerlukan autentikasi menggunakan cookie sesi HTTP-only. Hak akses yang disebutkan pada tabel merupakan pembatasan peran yang diterapkan pada backend.

| Modul | Metode dan endpoint | Hak akses | Fungsi |
|---|---|---|---|
| Sistem | `GET /api/health` | Publik | Memeriksa status layanan backend. |
| Autentikasi | `POST /api/auth/login` | Publik | Memvalidasi kredensial dan memulai sesi pengguna. |
| Autentikasi | `POST /api/auth/register` | Publik | Mengirim permohonan pendaftaran Dokter FKTP atau Apoteker beserta dokumen STR dan SIP. Menggunakan `multipart/form-data`. |
| Autentikasi | `POST /api/auth/forgot-password` | Publik | Mengajukan pengiriman tautan reset password melalui email. |
| Autentikasi | `GET /api/auth/me` | Publik; autentikasi opsional | Memeriksa informasi akun pada sesi yang sedang digunakan; mengembalikan pengguna kosong jika tidak ada sesi aktif. |
| Autentikasi | `POST /api/auth/logout` | Semua pengguna terautentikasi | Mengakhiri sesi pengguna. |
| Autentikasi | `POST /api/auth/reset-password` | Publik dengan token reset valid | Memvalidasi token reset dan menyimpan password baru. |
| Autentikasi | `POST /api/auth/activate-account` | Publik dengan token aktivasi valid | Mengaktifkan akun melalui token aktivasi dan menetapkan password. |
| Bootstrap | `GET /api/app` | Semua pengguna terautentikasi | Mengambil data awal aplikasi sesuai peran pengguna. Data akun dan aktivitas Admin serta data stok disertakan sesuai hak akses. |
| Manajemen akun | `POST /api/users` | Admin | Membuat akun Dokter FKTP atau Apoteker dan menerima dokumen STR/SIP. Akun menunggu aktivasi melalui email. |
| Manajemen akun | `PATCH /api/users/:id` | Admin | Memperbarui informasi akun serta mengganti dokumen STR/SIP apabila disertakan. Hak akses akun tidak dapat diubah. |
| Manajemen akun | `PATCH /api/users/:id/status` | Admin | Mengaktifkan atau menonaktifkan akun yang memenuhi ketentuan. |
| Manajemen akun | `POST /api/users/:id/password-reset` | Admin; akun non-Admin | Mengirim tautan reset password untuk akun yang dipilih. |
| Manajemen akun | `DELETE /api/users/:id` | Admin; akun non-Admin selain akun yang sedang digunakan | Menghapus akun secara lunak agar catatan historis tetap tersimpan. |
| Pendaftaran akun | `GET /api/account-registrations` | Admin | Menampilkan daftar permohonan pendaftaran akun. |
| Pendaftaran akun | `POST /api/account-registrations/:id/approve` | Admin | Menyetujui permohonan pendaftaran akun. |
| Pendaftaran akun | `POST /api/account-registrations/:id/reject` | Admin | Menolak permohonan pendaftaran akun dengan alasan keputusan. |
| Profil | `PATCH /api/profile/password` | Semua pengguna terautentikasi | Mengubah password akun yang sedang digunakan. |
| Resep elektronik | `GET /api/prescriptions` | Dokter FKTP dan Apoteker | Dokter FKTP menerima seluruh resep milik pasien yang saat ini ditugaskan kepadanya, termasuk resep dari dokter sebelumnya setelah konfirmasi perpindahan; Apoteker menerima seluruh resep untuk kebutuhan pelayanan. |
| Pasien / prefill | `GET /api/patients/prescription-prefill` | Dokter FKTP | Memeriksa penugasan pasien. Jika pasien masih ditugaskan kepada dokter lain, hanya mengembalikan `confirmationRequired: true` tanpa identitas rinci maupun data klinis; jika tidak, mengembalikan data resep terakhir untuk pengisian formulir. |
| Pasien / konfirmasi FKTP | `POST /api/patients/prescription-prefill/confirm` | Dokter FKTP | Menerima identitas pasien dan `confirmed: true`, lalu memperbarui penugasan internal serta merekam riwayat aktivitas dan riwayat pasien sebelum data klinis dapat diambil. |
| Resep elektronik | `POST /api/prescriptions` | Dokter FKTP | Membuat resep elektronik baru hanya jika pasien tidak ditugaskan kepada dokter lain. Penugasan lintas dokter harus diselesaikan melalui modal konfirmasi sebelum resep dibuat. |
| Resep elektronik | `PATCH /api/prescriptions/:id` | Dokter FKTP | Memperbarui resep milik Dokter FKTP sesuai ketentuan sistem. |
| Resep elektronik | `DELETE /api/prescriptions/:id` | Dokter FKTP | Menghapus resep yang memenuhi ketentuan sistem. |
| Resep elektronik | `POST /api/prescriptions/:id/dispense` | Apoteker | Memproses penebusan resep dan pembaruan persediaan. |
| Resep elektronik | `POST /api/prescriptions/:id/notify-patient` | Apoteker | Memeriksa ketersediaan nomor telepon pasien dan memperbarui penanda `notificationSent`. Endpoint ini tidak mengirim pesan secara langsung. |
| Stok obat | `POST /api/stock` | Apoteker | Menambahkan master obat baru atau batch pada obat yang sudah terdaftar. |
| Stok obat | `PATCH /api/stock/:id/image` | Apoteker | Memperbarui gambar master obat. |
| Stok obat | `POST /api/stock/:id/batches/:batchId/withdraw` | Apoteker | Mencatat pengeluaran jumlah stok dari batch tertentu. |
| Stok obat | `DELETE /api/stock/:id/batches/:batchId` | Apoteker | Menghapus batch sesuai ketentuan sistem. |
| Stok obat | `DELETE /api/stock/:id` | Apoteker | Menghapus master obat sesuai ketentuan sistem. |
| Data pasien | `GET /api/patients` | Dokter FKTP dan Apoteker | Dokter FKTP menerima pasien yang ditetapkan sebagai tanggung jawabnya, sedangkan Apoteker menerima seluruh pasien untuk kebutuhan pelayanan. |
| Buku Kronis | `POST /api/chronic-books` | Apoteker | Mengunggah dokumen Buku Kronis untuk pasien. |
| Buku Kronis | `PATCH /api/chronic-books/:patientId` | Apoteker | Mengganti dokumen Buku Kronis milik pasien. |
| Buku Kronis | `DELETE /api/chronic-books/:patientId` | Apoteker | Menghapus dokumen Buku Kronis sesuai mekanisme aplikasi. |
| Berkas | `GET /api/files/:id` | Autentikasi wajib; akses berdasarkan peran, jenis berkas, dan kepemilikan | Mengambil berkas dari GridFS setelah memeriksa hak akses. Admin dapat membaca berkas; akses STR/SIP, Buku Kronis, dan gambar obat dibatasi menurut peran serta kepemilikan. |
| Notifikasi | `GET /api/notifications` | Semua pengguna terautentikasi | Menampilkan notifikasi untuk akun yang sedang digunakan. |
| Notifikasi | `PATCH /api/notifications/read-all` | Semua pengguna terautentikasi | Menandai seluruh notifikasi milik pengguna sebagai telah dibaca. |
| Notifikasi | `PATCH /api/notifications/:id/read` | Semua pengguna terautentikasi | Menandai satu notifikasi milik pengguna sebagai telah dibaca. |
| Pilihan dosis | `POST /api/options/dose` | Dokter FKTP | Menambahkan pilihan aturan pakai/dosis berdasarkan satuan dan rute pemberian obat. |
| Pilihan dosis | `DELETE /api/options/dose` | Dokter FKTP | Menghapus pilihan aturan pakai/dosis berdasarkan parameter query `value`. |

Payload `POST /api/prescriptions` tidak lagi menggunakan field `confirmFktpCheck`. Pemeriksaan dan pembaruan penugasan dilakukan sebelum pengambilan data klinis melalui `POST /api/patients/prescription-prefill/confirm`. Jika pasien masih ditugaskan kepada dokter lain, pembuatan resep ditolak backend sampai dokter menyelesaikan konfirmasi. Konfirmasi dicatat pada koleksi `activities` dan sebagai peristiwa `PenugasanDiperbarui` pada `patienthistories`. Proses ini tidak terhubung ke layanan verifikasi BPJS Kesehatan.

**Catatan:** data akun, aktivitas, stok, riwayat transaksi stok, Buku Kronis, pilihan dosis, dan notifikasi tertentu dimuat sebagai bagian dari respons `GET /api/app`. Karena itu, backend tidak menyediakan endpoint GET terpisah seperti `GET /api/users`, `GET /api/stock`, `GET /api/stock/options`, `GET /api/stock/transactions`, `GET /api/chronic-books`, `GET /api/activities`. Diagnosis tidak disediakan melalui endpoint karena katalog ICD-10 dimuat dari `frontend/src/data/icd10.json`.

## 9. Pengujian dan build

Jalankan pengujian backend dari folder `backend`:

```powershell
npm test
```

Jalankan pengujian frontend dari folder `frontend`:

```powershell
npm test
```

Untuk membuat build produksi frontend:

```powershell
npm run build
```

Untuk menjalankan hasil build secara lokal:

```powershell
npm run preview
```

Pastikan backend terhubung ke MongoDB dan file `.env` telah dikonfigurasi sebelum melakukan pengujian integrasi melalui aplikasi.

## 10. Keamanan dan penyimpanan data

- Password akun disimpan sebagai hash bcrypt dan tidak dikirim kembali ke frontend.
- Sesi menggunakan JWT yang disimpan dalam cookie HTTP-only.
- Middleware backend memeriksa autentikasi serta hak akses peran pada endpoint yang dilindungi.
- Endpoint baca data pasien dan resep dibatasi berdasarkan peran serta penugasan pasien. Daftar pasien, seluruh resep, riwayat pelayanan, dan Buku Kronis Dokter FKTP hanya mencakup pasien yang saat ini ditugaskan kepadanya. Endpoint **Ambil Data Sebelumnya** mencari pasien berdasarkan BPJS/NIK; bila penugasan pasien berada pada dokter lain, data klinis tidak dikirim sampai konfirmasi manual Mobile JKN berhasil dicatat dan `assignedDoctorId` diperbarui. Setelah itu, dokter baru dapat membaca seluruh riwayat resep dan Buku Kronis pasien tersebut, serta menerima data resep terakhir untuk mengisi formulir baru. Apoteker dapat membaca seluruh data pasien dan resep untuk pelayanan. Resep lama tetap tercatat atas nama pembuatnya ketika penanggung jawab pasien berubah.
- Reset password dan aktivasi akun menggunakan token dengan masa berlaku terbatas. Hash token disimpan di database, bukan token mentah.
- Helmet, CORS, rate limiting, dan validasi input diterapkan di backend.
- Aktivitas login dan logout dicatat oleh backend.
- Dokumen STR, SIP, Buku Kronis, dan gambar obat disimpan menggunakan GridFS, bukan Base64 atau localStorage.
- Unggahan file dibatasi oleh konfigurasi `MAX_FILE_SIZE_MB` (default 5 MB) dan diperiksa berdasarkan jenis file yang diizinkan.
- Sesi frontend berakhir setelah 30 menit tanpa aktivitas. `sessionStorage` hanya digunakan untuk menyimpan waktu aktivitas terakhir, bukan sebagai penyimpanan data utama aplikasi.
- Jangan memasukkan file `.env`, password, JWT secret, Google App Password, atau kredensial database ke repositori.

## 11. Pemecahan masalah

### Backend tidak dapat terhubung ke MongoDB

- Pastikan layanan MongoDB berjalan jika menggunakan database lokal.
- Periksa nilai `MONGODB_URI` pada `backend/.env`.
- Untuk MongoDB lokal, gunakan URI default `mongodb://127.0.0.1:27017/e_resep`.
- Untuk MongoDB Atlas, pastikan connection string, kredensial, dan Network Access telah sesuai.

### Frontend tidak dapat mengakses backend

- Pastikan backend berjalan pada port 5000.
- Periksa `VITE_API_URL` pada `frontend/.env`.
- Pastikan origin frontend sesuai dengan `CLIENT_URL` atau `CLIENT_URLS` pada `backend/.env`.
- Pada mode development, frontend dapat menggunakan port 5173 atau 5174.

### Email aktivasi atau reset password tidak terkirim

- Periksa `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, dan `EMAIL_FROM`.
- Untuk Gmail, pastikan Verifikasi 2 Langkah aktif dan gunakan Google App Password.
- Jangan menggunakan password Gmail biasa sebagai `SMTP_PASS`.
- Periksa log backend untuk mengetahui kegagalan koneksi atau autentikasi SMTP.

### Dependensi atau pengujian bermasalah

- Jalankan `npm install` pada folder `backend` dan `frontend`.
- Pastikan versi Node.js memenuhi persyaratan proyek.
- Jalankan kembali `npm test` pada masing-masing folder.
- Jalankan `npm run build` pada folder `frontend` untuk memeriksa proses build.

---

REMS dikembangkan untuk mendukung proses pelayanan resep elektronik dan pengelolaan stok obat pasien kronis di Apotek Re'ra Farma. Fitur, hak akses, dan endpoint pada README ini mengikuti implementasi yang tersedia pada source code proyek.


### Kebijakan resep setelah perpindahan FKTP

Setelah penugasan pasien berpindah, resep yang dibuat pada versi penugasan sebelumnya tetap dapat dibaca sebagai riwayat, tetapi tidak dapat diubah atau dihapus oleh Dokter FKTP sebelumnya maupun Dokter FKTP penerima. Setiap resep menyimpan `patientAssignmentVersion`; setiap perpindahan menaikkan `Patient.assignmentVersion` dan mencatat `PatientHistory.previousAssignedDoctorId`. Operasi pembuatan, perubahan, penghapusan resep, dan konfirmasi perpindahan diserialkan per pasien di proses aplikasi.
