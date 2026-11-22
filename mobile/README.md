# Prototipe Android CCM DPM

Aplikasi Capacitor ini memuat dashboard di `https://ccm-dashboard-nine.vercel.app`. Backend Next.js tetap berjalan di Vercel; koneksi internet diperlukan. Ini prototipe **APK debug**, bukan rilis siap produksi.

## Build dari HP

1. Push kode ke GitHub.
2. Di GitHub: **Actions → Android debug APK → Run workflow** (pilih `main`).
3. Setelah job selesai, buka run tersebut → **Artifacts → ccm-dpm-android-debug** → unduh ZIP → ekstrak `app-debug.apk`.
4. Pasang APK di Android dan uji login, kamera, GPS, foto, tanda tangan, PDF, serta navigasi.

Build debug memakai signing sementara dari GitHub runner. Untuk APK rilis/upgrade stabil perlu keystore rilis yang disimpan di GitHub Secrets; jangan commit keystore atau password ke repositori. Aplikasi berbasis URL online ini **tidak mendukung offline**. iOS belum dikonfigurasi.
