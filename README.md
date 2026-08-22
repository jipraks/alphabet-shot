# Tembak Huruf

Permainan web untuk anak **4–6 tahun**: mencocokkan **huruf besar dengan huruf kecil**,
dikemas sebagai permainan tembak balon di kios pasar malam.

- Statis, tanpa build step, jalan di GitHub Pages
- **Nol request eksternal** setelah load pertama — tidak ada analytics, iklan, atau font CDN
- Semua data (progres, statistik, rekaman suara) tersimpan **di perangkat anak saja**
- Bisa dipasang ke layar utama tablet dan **jalan penuh offline**

## Cara main

1. Ketuk **Mulai** (sekaligus membuka jalur audio browser).
2. Pilih mode. Huruf besar muncul di tengah atas, misalnya **D**.
3. Ketuk balon berisi huruf kecil yang cocok — laras membidik, menembak, peluru terbang.
4. Tiga peluru per perintah. Kalau habis, laras menyelesaikan sendiri: anak tidak pernah gagal.
5. Setelah 5 perintah muncul layar bintang. Huruf yang terkumpul masuk ke **rak hadiah**.

Papan tombol **A–Z** juga bisa dipakai untuk menembak (berguna untuk anak yang lebih besar
dan untuk pengujian).

### Mode

| Mode | Isi | Terbuka |
|---|---|---|
| **Latihan** | Santai, 5 balon, 5 perintah, semua bantuan aktif | dari awal |
| **Duel** | Rebutan menembak dengan beruang yang ramah (anak menang ~70%) | dari awal |
| **2 Pemain** | Dua laras, multi-touch, kakak-adik satu layar | dari awal |
| **Serbuan** | 30 detik, satu huruf, balon respawn terus | selesai Paket 2 |
| **Bos Plin-plan** | Balon besar yang hurufnya berganti `b → d → p → q` tiap 1,5 detik | Paket 4 |
| **Charge shot** | Tahan 1 detik, semua balon yang benar meledak sekaligus | Paket 3 |

### Tidak ada hukuman

Salah tembak **tidak** mengurangi nyawa, tidak ada bunyi buzzer, tidak ada layar "kamu kalah",
tidak ada tanda silang merah. Peluru memantul, balon bergoyang lucu, dan bantuan datang
bertingkat: denyut di 6 detik, lingkar cahaya di 10 detik, dan di 14 detik laras membidik
sendiri dengan narasi positif. Tap yang meleset karena jari **tidak pernah** dihitung sebagai
jawaban salah (aim assist 40px dari tepi balon).

## Kurikulum

| Tier | Huruf | Sifat |
|---|---|---|
| 1 | C O S V W X Z K U P | kecilnya hanya versi mini dari besarnya |
| 2 | I J T Y F | mirip, ada pembeda kecil |
| 3 | A B D E G H M N Q R L | bentuk berbeda total — inti kurikulum |
| 4 | b d p q m n u i l a g | pasangan jebakan (pengecoh sengaja dipilih) |

Paket 1 = Tier 1 · Paket 2 = Tier 1+2 · Paket 3 = Tier 2+3 · Paket 4 = Tier 3+4.
Naik paket kalau 2 ronde berturut-turut dapat 3 bintang; turun kalau 2 ronde berturut-turut
cuma 1 bintang — **turun diam-diam**, tidak diumumkan ke anak. Huruf yang sedang sering salah
muncul 2x lebih sering sebagai target.

## Panel orang tua

Tahan tulisan **TEMBAK HURUF** di layar judul selama **3 detik**, lalu jawab `7 × 8`.

Isinya: statistik per huruf (percobaan, akurasi, rata-rata waktu respons), 5 huruf yang paling
sering salah, grafik akurasi 7 sesi terakhir, total waktu main hari ini dan minggu ini,
pengaturan (nama huruf ↔ bunyi huruf, tier aktif, musik, getar, kurangi gerak, pengingat
istirahat, reset), **rekam suara sendiri** untuk 26 huruf, dan ekspor statistik ke JSON.

### Suara huruf

1. **Rekaman orang tua** (terbaik) — direkam lewat panel, disimpan sebagai blob di IndexedDB.
2. **`speechSynthesis` id-ID** — dikirim sebagai ejaan nama huruf (`de`, `ki`, `zet`), bukan
   huruf tunggal, supaya tidak dibaca cara Inggris. Kalau perangkat tidak punya suara `id-ID`,
   TTS **dimatikan** dan game mengandalkan visual — tidak pernah jatuh ke suara Inggris.
3. **Mode bunyi huruf (fonik)** — andalkan rekaman orang tua.

Semua efek suara lain (tembakan, pop bertingkat do–re–mi–fa–sol, boing, selongsong, reload,
charge, bintang, musik latar) **disintesis WebAudio**: nol berkas aset audio.

## Privasi

Nol request keluar setelah load pertama. Tidak ada akun, login, analytics, iklan, pembelian
dalam aplikasi, leaderboard, atau backend. Progres dan statistik ada di `localStorage`,
rekaman suara di IndexedDB — keduanya di perangkat itu saja dan bisa dihapus dari panel orang
tua. Ekspor JSON hanya berjalan kalau orang tua sendiri yang menekan tombolnya.

## Menjalankan secara lokal

ES modules butuh server HTTP — membuka `index.html` lewat `file://` akan kena CORS error.

```bash
python3 -m http.server 8000
# atau: npx serve
```

Lalu buka `http://localhost:8000/`.

## Situs live

**https://jipraks.github.io/alphabet-shot/**

GitHub Pages sudah aktif. Sumbernya saat ini branch **`gh-pages`**, yang isinya
cermin dari `main` (repo ini adalah situsnya sendiri — statis, tanpa build step).

> **Selama sumbernya masih `gh-pages`:** setiap perubahan harus di-push ke
> `main` **dan** `gh-pages`, kalau tidak situs live tidak ikut berubah.
>
> ```bash
> git push origin main
> git push --force origin main:gh-pages
> ```
>
> **Cara menyederhanakan (satu klik, disarankan):** Settings → Pages → Source:
> *Deploy from a branch* → branch **`main`**, folder **`/ (root)`**. Setelah itu
> branch `gh-pages` bisa dihapus dan cukup push ke `main` saja.

Catatan: mengaktifkan Pages dan mengganti sumbernya hanya bisa dilakukan dari
Settings repo — endpoint API `/pages` tidak bisa diakses dari sesi agen.

## Deploy dari nol (repo lain)

1. Repo publik, branch `main`
2. Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`
3. Tunggu ~1 menit; situs terbit di `https://<username>.github.io/<repo>/`

Yang dijaga di repo ini supaya tidak gagal:

- **Semua path relatif** (`./scripts/main.js`, `../fonts/…` di CSS) — path absolut adalah
  penyebab nomor satu halaman blank di GitHub Pages, karena situs disajikan di sub-folder.
- **`.nojekyll`** ada di root.
- Service worker didaftarkan dengan `register('./sw.js', { scope: './' })`.
- `manifest.webmanifest` memakai `start_url: "./"` dan `scope: "./"`.

## Struktur

```
index.html               satu halaman, semua layar
manifest.webmanifest     PWA (fullscreen, add to home screen)
sw.js                    service worker, cache-first, path relatif
styles/  tokens.css      warna, font, timing, ukuran — satu-satunya tempat nilai dasar
         layout.css      kios: terpal, lampu, rak, arena, meja
         weapon.css      recoil, muzzle flash, semua keyframes senjata
         screens.css     layar judul/mode/hasil/rak/istirahat/panel ortu
scripts/ main.js         bootstrap + state machine
         letters.js      data kurikulum (tier, pengecoh, ejaan TTS)
         weapon.js       laras, bidik, recoil, letusan, peluru, pool efek
         balloons.js     spawn, tata letak, gerak, hit detection
         round.js        mesin satu perintah, dipakai semua mode
         audio.js        synth WebAudio + suara huruf (rekaman/TTS)
         progress.js     localStorage berversi + migrasi, rak, skin, paket
         stats.js        pencatatan & agregasi statistik
         ui.js           transisi layar, rak hadiah, layar bintang, toast
         parent.js       panel orang tua
         modes/          latihan, duel, serbuan, bos, duo
assets/                  laras 6 skin (SVG), beruang, ikon PWA
fonts/                   Andika, Bungee, Lexend (subset latin, self-host, OFL)
```

### Font

| Peran | Font | Alasan |
|---|---|---|
| Huruf yang diajarkan | **Andika** | dirancang untuk literasi awal: `a` dan `g` satu lantai, `l` punya pembeda dari `I` |
| Papan nama & judul | **Bungee** | font papan reklame, pas untuk kios pasar malam |
| Teks UI & panel ortu | **Lexend** | dirancang untuk kemudahan baca |

Ketiganya SIL Open Font License 1.1 (lihat `fonts/OFL.txt`), disubset ke latin saja —
total **92 KB**, seluruh repo di bawah 400 KB.

Jangan menambahkan Arial/Helvetica ke stack `--font-huruf`: bentuk `a` dan `g`-nya berbeda
dari yang diajarkan di TK Indonesia.

## Aksesibilitas

- `prefers-reduced-motion: reduce` (atau toggle di panel ortu): getar mati, kilat diganti
  pendar lembut, recoil tetap ada dengan amplitudo setengah, game tetap penuh bisa dimainkan
- Target sentuh ≥ 80px di area game, ≥ 44px di menu
- Kontras huruf yang diajarkan ≥ **7:1**, teks UI ≥ 4.5:1
- Kilatan dijaga di bawah 4Hz oleh cooldown 250ms — juga saat dua pemain menembak bersamaan
- Fokus keyboard terlihat jelas; tidak ada jalur UI yang mewajibkan membaca
- Benar/salah dibedakan bentuk (pecah vs pantul), bukan cuma warna

## Catatan penyimpangan dari spek

Semua angka spek dipakai apa adanya kecuali yang di bawah ini. Setiap perubahan dilakukan di
satu tempat, dengan alasannya.

1. **Warna balon 3, 4, 5 dicerahkan** (`styles/tokens.css`). Nilai spek `#8B7FD4`, `#4FA3E3`,
   `#E8739F` memberi kontras 5,00:1 / 6,31:1 / 6,06:1 terhadap `--malam` — di bawah syarat
   spek sendiri (7:1 untuk huruf yang diajarkan). Diganti `#A79EDE`, `#62ADE6`, `#EB87AC`
   (7,05 / 7,09 / 7,06:1), hue tetap sama.
2. **Ukuran laras & meja** (`styles/weapon.css`, `styles/layout.css`). Kotak laras kini
   `clamp(120px, 26vmin, 260px)` tinggi dengan lebar 1,25x tinggi, dan meja 12vh (dari 15vh).
   Dua alasan: (a) kotak laras **harus** beraspek sama dengan viewBox sprite (200x160), kalau
   tidak titik moncong tidak jatuh di ujung laras dan letusan lepas dari senjata di portrait;
   (b) laras 18vh di belakang meja 15vh nyaris tidak terlihat — rasa first-person adalah inti
   retensi menurut spek sendiri.
3. **`manifest.webmanifest` memakai `"orientation": "any"`** (spek: `landscape`). Spek juga
   menyebut platform "landscape & portrait" dan checklist QA menguji HP portrait; mengunci
   landscape membuat layout portrait tidak pernah dipakai saat game dipasang ke layar utama.
4. **`scripts/round.js` ditambahkan** (tidak ada di daftar berkas spek). Tanpa satu mesin
   perintah bersama, lima mode akan menyalin logika perintah/bantuan/auto-solve lima kali.
5. **`scripts/modes/duo.js` ditambahkan** untuk mode "dua pemain satu layar" (spek bagian 7
   menyebut modenya tapi daftar berkas hanya memuat empat mode).
6. **Kios (terpal, lampu, meja, rak) dibuat dengan CSS gradient**, bukan berkas di
   `assets/kios/`. Lebih ringan, bisa diwarnai langsung lewat design token, dan menghapus
   beberapa request. `assets/` tetap berisi SVG laras dan beruang.
7. **Jumlah balon dijepit ke kapasitas layar** (minimum 4). Di HP landscape (mis. 740x360),
   8 balon tidak mungkin muat tanpa melanggar syarat "balon ≥ 80px" dan "jarak ≥ 24px".
   Lebih baik 4–5 balon lega daripada 8 balon tumpang tindih: kegagalan harus karena huruf,
   bukan karena jari.
8. **Bentuk data `huruf` diberi tiga field tambahan**: `dikumpulkan` (huruf masuk rak lewat
   auto-solve tanpa dihitung benar), `waktu_ms` dan `waktu_n` (rata-rata waktu respons untuk
   panel orang tua). Progres juga menyimpan `bintang_terakhir` untuk aturan naik/turun paket
   "2 ronde berturut-turut". Semua lewat migrasi berversi, data lama tetap terbaca.
9. **Akurasi sesi dihitung per tembakan**, bukan per perintah, supaya angka di grafik panel
   orang tua konsisten dengan kolom akurasi per huruf.
10. **Mode bunyi huruf tanpa rekaman** memakai TTS nama huruf, bukan diam. Spek benar bahwa
    TTS tidak bisa menghasilkan fonem tunggal dengan baik; nama huruf yang akurat lebih
    berguna daripada tidak ada suara sama sekali.
11. **Charge shot menembak saat tombol dilepas** (kalau sudah terbuka di Paket 3). Selama
    masih terkunci, tembakan terjadi saat sentuh — paling responsif untuk jari anak kecil.

## Yang sudah diuji

Diuji di Chromium (Playwright) pada 1280x800, 1024x768, 800x1280, 740x360, dan 390x844:

- setiap perintah selalu bisa diselesaikan, termasuk kalau anak diam total 20 detik
- bantuan bertingkat muncul tepat di 6 / 10 / 14 detik
- peluru habis → auto-solve → lanjut, huruf tetap masuk rak, tidak pernah stuck
- tidak pernah ada dua balon berhuruf sama; balon benar selalu ada dan selalu di dalam layar
- tap 30px di luar tepi balon tetap kena; tap ruang kosong tidak dihitung salah
- 25 klik beruntun hanya menghasilkan 1 kilatan (cooldown 250ms tidak bisa ditembus)
- aturan pengecoh: tier 1–2 tidak pernah mirip target, tier 3 ≥1 jebakan, tier 4 ≥2 jebakan
  (4000 ronde acak), bobot 2x untuk huruf sulit
- naik/turun paket sesuai aturan 2 ronde berturut-turut
- progres bertahan setelah refresh; reset benar-benar bersih
- offline penuh setelah kunjungan pertama (35 aset ter-cache, termasuk font dan semua modul)
- `prefers-reduced-motion` dihormati dan game tetap bisa dimainkan
- semua mode selesai dengan layar bintang tanpa error konsol

Belum diuji di perangkat asli: **iOS Safari** (terutama `speechSynthesis` id-ID dan
`MediaRecorder`) dan Android Chrome di tablet kelas bawah. Keduanya ada di checklist QA spek
dan perlu dijalankan di perangkat sungguhan.

## Lisensi

Kode: bebas dipakai. Font: SIL Open Font License 1.1 (`fonts/OFL.txt`).
