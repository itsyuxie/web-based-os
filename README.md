# AwanOS — OS Desktop Berbasis Web Statis

AwanOS adalah sistem operasi desktop yang berjalan sepenuhnya di browser. Seluruhnya dibuat dengan
HTML, CSS, dan JavaScript murni: **tanpa server, tanpa proses build, tanpa dependensi**. Cukup buka
`index.html`, atau unggah foldernya ke hosting statis mana pun.

![Tangkapan layar AwanOS](assets/screenshot.webp)

## Fitur

- **Sesi lengkap**: layar boot, layar kunci dengan jam, login, kunci, keluar, mulai ulang, dan matikan.
- **Window manager**: jendela bisa digeser, diubah ukurannya dari 8 sisi, diminimalkan (dengan animasi ke
  bilah tugas), dimaksimalkan, dan di-*snap* (seret ke tepi kiri/kanan untuk membagi layar, ke atas untuk
  memaksimalkan). Klik dua kali judul jendela untuk maksimalkan/pulihkan.
- **Desktop**: ikon yang bisa diseret ke petak grid (posisinya diingat), seleksi kotak, rename langsung
  di tempat, menu klik kanan, dan seret-lepas ke folder.
- **Bilah tugas**: menu Mulai dengan pencarian aplikasi, berkas, dan web; aplikasi yang disematkan;
  indikator jendela aktif; pengaturan cepat (Wi-Fi, Bluetooth, mode pesawat, mode gelap, lampu malam,
  kecerahan, volume); kalender dan riwayat notifikasi.
- **Sistem berkas virtual** yang tersimpan di `localStorage`: buat, ganti nama, salin, potong, tempel,
  hapus, impor berkas asli dari komputer (seret-lepas atau tombol unggah), dan unduh kembali.
- **Personalisasi**: 8 wallpaper bawaan plus gambar sendiri, tema terang/gelap, warna aksen,
  efek transparansi, dan animasi.
- **Cadangan**: ekspor dan impor semua berkas serta pengaturan sebagai satu berkas JSON.
- **Responsif**: di layar ponsel jendela otomatis dimaksimalkan dan ikon bisa dibuka dengan sekali ketuk.

## Aplikasi bawaan

| Aplikasi | Keterangan |
| --- | --- |
| Penjelajah Berkas | Tampilan ikon/daftar, riwayat navigasi, pencarian, salin/tempel, seret-lepas, impor/unduh |
| Notepad | Buka/simpan, cari & ganti, bungkus kata, zoom, sisipkan tanggal, peringatan perubahan belum disimpan |
| Terminal | Shell `awsh` dengan pipa (`\|`), pengalihan (`>`, `>>`), rantai (`&&`, `\|\|`, `;`), riwayat, dan Tab-completion |
| Browser | Penjelajahan web via iframe, beranda dengan tautan cepat, membuka berkas `.html` dari sistem berkas |
| Kalkulator | Kalkulator standar dengan riwayat, dukungan keyboard, dan format angka Indonesia |
| Paint | Pensil, kuas, penghapus, garis, persegi, elips, isi warna, urungkan/ulangi, simpan PNG, jadikan wallpaper |
| Penampil Gambar | Zoom, sesuaikan jendela, gambar sebelumnya/berikutnya, edit di Paint |
| Minesweeper | Tiga tingkat kesulitan, klik pertama selalu aman, *chording*, rekor terbaik, mode bendera untuk layar sentuh |
| Pengelola Tugas | Daftar jendela yang berjalan, akhiri tugas, grafik FPS, info memori dan penyimpanan |
| Pengaturan | Personalisasi, akun, penyimpanan, cadangan, atur ulang, pintasan keyboard, info sistem |

## Menjalankan

**Langsung dari berkas** — klik dua kali `index.html`. AwanOS memakai skrip biasa (bukan ES module),
jadi tetap berjalan lewat `file://`.

**Dengan server lokal** (disarankan, agar perilakunya sama dengan saat di-hosting):

```bash
python3 -m http.server 8080
# lalu buka http://localhost:8080
```

**Hosting statis** — unggah seluruh isi repositori ke GitHub Pages, Netlify, Vercel, Cloudflare Pages,
atau hosting statis lain. Untuk GitHub Pages: *Settings → Pages → Deploy from a branch*, pilih branch dan
folder `/ (root)`. Berkas `.nojekyll` sudah disertakan.

Tambahkan `?skipboot` di akhir URL untuk langsung masuk ke desktop tanpa layar boot dan kunci
(berguna saat pengembangan).

## Pintasan keyboard

| Pintasan | Aksi |
| --- | --- |
| `Ctrl+Alt+S` | Buka menu Mulai |
| `Ctrl+Alt+T` | Buka Terminal |
| `Ctrl+Alt+E` | Buka Penjelajah Berkas |
| `Ctrl+Alt+M` | Buka Pengelola Tugas |
| `Ctrl+Alt+D` | Tampilkan desktop |
| `Ctrl+Alt+W` | Tutup jendela aktif |
| `Ctrl+Alt+L` | Kunci layar |
| `F2` / `Delete` | Ganti nama / hapus berkas terpilih |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Salin / potong / tempel berkas |

## Perintah terminal

`help`, `ls`, `cd`, `pwd`, `cat`, `echo`, `mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, `tree`, `find`,
`grep`, `head`, `tail`, `wc`, `sort`, `clear`, `date`, `cal`, `whoami`, `hostname`, `uname`, `uptime`,
`history`, `calc`, `open`, `edit`, `apps`, `theme`, `wallpaper`, `notify`, `df`, `du`, `neofetch`,
`cowsay`, `peribahasa`, `lock`, `reboot`, `shutdown`, `exit`.

Contoh:

```bash
mkdir -p proyek/web && cd proyek
echo "halo dunia" > web/catatan.txt
ls -l web | grep txt
calc 2*(3+4)^2
open ~/Dokumen/halo.html
```

## Struktur proyek

```
index.html            Kerangka halaman dan urutan pemuatan skrip/gaya
apps/                 Aplikasi — satu aplikasi satu folder
  explorer/           Penjelajah Berkas
  notepad/            Notepad
  terminal/           Terminal
  browser/            Browser
  calculator/         Kalkulator
  paint/              Paint
  imageviewer/        Penampil Gambar
  minesweeper/        Minesweeper
  taskmanager/        Pengelola Tugas
  settings/           Pengaturan
  about/              Tentang AwanOS
    app.js            (setiap folder) logika aplikasi & pendaftarannya
    style.css         (setiap folder) gaya khusus aplikasi
css/system.css        Gaya shell: token tema, jendela, bilah tugas, menu, dialog, toolbar bersama
js/core/              Inti sistem
  utils.js            Pembuat DOM, event emitter, format angka/tanggal
  icons.js            Set ikon SVG inline
  settings.js         Penyimpanan, pengaturan, wallpaper, tema
  vfs.js              Sistem berkas virtual (localStorage)
  ui.js               Menu konteks, popup, dialog, pemilih berkas, notifikasi
  wm.js               Window manager
  apps.js             Registri aplikasi dan asosiasi berkas
  fileops.js          Operasi berkas bersama (salin, hapus, impor, unduh, …)
js/shell/             Desktop, bilah tugas, dan siklus sesi
js/main.js            Bootstrap dan pintasan global
assets/               Favicon, wallpaper SVG, tangkapan layar
```

## Membuat aplikasi sendiri

1. Buat folder baru `apps/<id>/` berisi `app.js` (dan `style.css` bila perlu).
2. Muat keduanya di `index.html`: `<link rel="stylesheet" href="apps/<id>/style.css">` di dalam `<head>`,
   dan `<script src="apps/<id>/app.js"></script>` di bagian *Applications*, sebelum skrip shell.
3. Daftarkan aplikasinya di `app.js`:

```js
(function () {
  const { h } = OS.utils;

  OS.apps.register({
    id: 'halo',
    name: 'Halo',
    description: 'Contoh aplikasi',
    icon: 'smile',                  // nama glyph dari js/core/icons.js
    colors: ['#f59e0b', '#ef4444'], // gradasi ikon
    width: 360,
    height: 240,
    launch(win, args) {
      win.body.classList.add('halo');
      win.body.append(h('div', { class: 'halo-pesan' }, 'Halo dari aplikasi baru!'));
      win.on('close', () => console.log('jendela ditutup'));
    },
  });
})();
```

Awali selektor di `style.css` dengan kelas aplikasimu (misalnya `.halo-pesan { padding: 24px; }`)
agar gayanya tidak bocor ke aplikasi lain.

API yang tersedia antara lain `OS.wm.open(id, args)`, `OS.vfs.readFile/writeFile/readdir/…`,
`OS.ui.alert/confirm/prompt/pickFile`, `OS.notify({ title, body })`, dan `OS.settings.get/set`.

## Catatan

- Data disimpan di `localStorage` browser yang sedang dipakai (umumnya sekitar 5 MB). Gambar besar yang
  diimpor otomatis diperkecil. Gunakan **Pengaturan → Sistem → Cadangkan data** untuk memindahkan data
  ke browser lain.
- Banyak situs (misalnya YouTube atau GitHub) melarang ditampilkan di dalam iframe, sehingga tidak bisa
  dibuka di aplikasi Browser. Gunakan tombol **Buka di tab baru** untuk situs seperti itu.
- Membutuhkan browser modern (Chrome/Edge 111+, Firefox 113+, Safari 16.4+).
