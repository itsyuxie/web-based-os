/* AwanOS — Settings */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, escapeHtml, formatBytes, readFile } = OS.utils;
  const { glyph } = OS.icons;
  const STORAGE_LIMIT = 5 * 1024 * 1024;

  const SECTIONS = [
    { id: 'personalization', name: 'Personalisasi', icon: 'palette' },
    { id: 'system', name: 'Sistem', icon: 'monitor' },
    { id: 'shortcuts', name: 'Pintasan keyboard', icon: 'grid' },
    { id: 'about', name: 'Tentang', icon: 'info' },
  ];

  function downscale(dataUrl, max = 1920) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Gambar tidak dapat dibaca'));
      img.src = dataUrl;
    });
  }

  function launch(win, args) {
    const s = OS.settings;
    let section = args.section || 'personalization';
    const nav = h('nav', { class: 'st-nav' });
    const content = h('div', { class: 'st-content' });
    const user = h('div', { class: 'st-user' });

    win.body.classList.add('settings');
    win.body.append(h('aside', { class: 'st-side' }, user, nav), content);

    SECTIONS.forEach((sec) => {
      const b = h('button', { class: 'st-nav-item', html: `${glyph(sec.icon)}<span>${escapeHtml(sec.name)}</span>` });
      b.dataset.id = sec.id;
      b.addEventListener('click', () => show(sec.id));
      nav.appendChild(b);
    });

    function renderUser() {
      const name = s.get('username');
      user.innerHTML = `<span class="avatar">${escapeHtml(name.trim().charAt(0).toUpperCase() || '?')}</span><div><strong>${escapeHtml(name)}</strong><span>Akun lokal</span></div>`;
    }

    const card = (title, desc, control) =>
      h('div', { class: 'st-card' },
        h('div', { class: 'st-card-text' }, h('div', { class: 'st-card-title', text: title }), desc ? h('div', { class: 'st-card-desc', text: desc }) : null),
        control);

    const switchFor = (key, onChange) => {
      const el = h('input', { type: 'checkbox', class: 'switch', checked: !!s.get(key), 'aria-label': key });
      el.addEventListener('change', () => { s.set(key, el.checked); if (onChange) onChange(el.checked); });
      return el;
    };

    function personalization() {
      const wpGrid = h('div', { class: 'st-wallpapers' });
      const renderWallpapers = () => {
        wpGrid.innerHTML = '';
        const custom = s.customWallpaper();
        const list = [...OS.wallpapers];
        if (custom) list.push({ id: 'custom', name: 'Gambar sendiri', css: s.wallpaperCss('custom') });
        list.forEach((wp) => {
          const tile = h('button', { class: `st-wp${s.get('wallpaper') === wp.id ? ' active' : ''}`, title: wp.name, 'aria-label': wp.name });
          tile.style.background = wp.css;
          tile.appendChild(h('span', { text: wp.name }));
          tile.addEventListener('click', () => { s.set('wallpaper', wp.id); renderWallpapers(); });
          wpGrid.appendChild(tile);
        });
        const upload = h('button', { class: 'st-wp st-wp-upload', html: `${glyph('upload')}<span>Pilih gambar…</span>` });
        upload.addEventListener('click', () => {
          const input = h('input', { type: 'file', accept: 'image/*' });
          input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;
            try {
              const data = await downscale(await readFile(file, 'dataurl'));
              if (!s.setCustomWallpaper(data)) throw new Error('Penyimpanan browser penuh.');
              renderWallpapers();
            } catch (err) {
              OS.ui.showError(err, 'Tidak dapat mengatur wallpaper');
            }
          });
          input.click();
        });
        wpGrid.appendChild(upload);
      };
      renderWallpapers();

      const themeSeg = h('div', { class: 'segmented' });
      [['light', 'Terang', 'sun'], ['dark', 'Gelap', 'moon']].forEach(([id, label, icon]) => {
        const b = h('button', { class: s.get('theme') === id ? 'active' : '', html: `${glyph(icon)}<span>${label}</span>` });
        b.addEventListener('click', () => {
          s.set('theme', id);
          themeSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        });
        themeSeg.appendChild(b);
      });

      const accents = h('div', { class: 'st-accents' });
      const renderAccents = () => {
        accents.innerHTML = '';
        OS.accents.forEach((c) => {
          const b = h('button', { class: `st-accent${s.get('accent') === c ? ' active' : ''}`, title: c, 'aria-label': `Aksen ${c}`, style: { background: c } });
          b.addEventListener('click', () => { s.set('accent', c); renderAccents(); });
          accents.appendChild(b);
        });
        const custom = h('input', { type: 'color', class: 'st-accent-custom', value: s.get('accent'), title: 'Warna khusus' });
        custom.addEventListener('input', () => s.set('accent', custom.value));
        custom.addEventListener('change', renderAccents);
        accents.appendChild(custom);
      };
      renderAccents();

      return [
        h('h2', { text: 'Personalisasi' }),
        h('div', { class: 'st-preview', style: { background: s.wallpaperCss() } },
          h('div', { class: 'st-preview-window' }, h('div', { class: 'st-preview-bar' }), h('div', { class: 'st-preview-body' })),
          h('div', { class: 'st-preview-taskbar' })),
        h('h3', { text: 'Latar belakang' }),
        wpGrid,
        h('h3', { text: 'Warna' }),
        card('Mode', 'Pilih tampilan terang atau gelap', themeSeg),
        card('Warna aksen', 'Digunakan untuk tombol, sorotan, dan bilah tugas', accents),
        card('Efek transparansi', 'Jendela dan bilah tugas tampak seperti kaca buram', switchFor('transparency')),
        card('Animasi', 'Animasikan jendela, menu, dan transisi', switchFor('animations')),
        card('Tampilkan detik pada jam', null, switchFor('clockSeconds')),
      ];
    }

    function system() {
      const nameInput = h('input', { class: 'input', value: s.get('username'), maxlength: 32, style: { width: '220px' } });
      nameInput.addEventListener('change', () => {
        const v = nameInput.value.trim();
        if (v) { s.set('username', v); renderUser(); } else nameInput.value = s.get('username');
      });

      const used = OS.storage.usage();
      const pct = Math.min(100, (used / STORAGE_LIMIT) * 100);
      const bar = h('div', { class: 'st-storage' },
        h('div', { class: 'st-storage-bar' }, h('div', { style: { width: `${pct}%` } })),
        h('div', { class: 'st-storage-text', text: `${formatBytes(used)} dari ±5 MB terpakai · berkas: ${formatBytes(OS.vfs.usage())}` }));

      const exportBtn = h('button', { class: 'btn', html: `${glyph('download')} Ekspor` });
      exportBtn.addEventListener('click', () => {
        OS.vfs.flush();
        const data = {
          app: 'AwanOS',
          version: OS.version,
          exportedAt: new Date().toISOString(),
          settings: s.all(),
          wallpaper: s.customWallpaper(),
          fs: OS.vfs.exportData(),
        };
        const date = new Date().toISOString().slice(0, 10);
        OS.utils.download(`awanos-cadangan-${date}.json`, JSON.stringify(data), 'application/json');
      });

      const importBtn = h('button', { class: 'btn', html: `${glyph('upload')} Impor` });
      importBtn.addEventListener('click', () => {
        const input = h('input', { type: 'file', accept: '.json,application/json' });
        input.addEventListener('change', async () => {
          const file = input.files[0];
          if (!file) return;
          try {
            const data = JSON.parse(await readFile(file, 'text'));
            if (data.app !== 'AwanOS' || !data.fs) throw new Error('Berkas ini bukan cadangan AwanOS.');
            const ok = await OS.ui.confirm('Semua berkas dan pengaturan saat ini akan diganti dengan isi cadangan. Lanjutkan?', { title: 'Impor cadangan', okLabel: 'Impor', danger: true });
            if (!ok) return;
            OS.vfs.importData(data.fs);
            OS.vfs.flush();
            OS.storage.write('settings', data.settings || {});
            if (data.wallpaper) OS.storage.write('wallpaper', data.wallpaper);
            location.reload();
          } catch (err) {
            OS.ui.showError(err, 'Impor gagal');
          }
        });
        input.click();
      });

      const resetBtn = h('button', { class: 'btn btn-danger', text: 'Atur ulang' });
      resetBtn.addEventListener('click', async () => {
        const ok = await OS.ui.confirm('Semua berkas, pengaturan, dan riwayat akan dihapus dan AwanOS kembali seperti baru. Tindakan ini tidak dapat dibatalkan.', { title: 'Atur ulang AwanOS', okLabel: 'Atur ulang', danger: true });
        if (!ok) return;
        OS.vfs.reset();
        OS.storage.clearAll();
        location.reload();
      });

      return [
        h('h2', { text: 'Sistem' }),
        h('h3', { text: 'Akun' }),
        card('Nama pengguna', 'Ditampilkan di layar kunci dan menu Mulai', nameInput),
        h('h3', { text: 'Penyimpanan' }),
        card('Penyimpanan browser', 'Berkas disimpan di localStorage pada browser ini saja', bar),
        card('Cadangkan data', 'Unduh semua berkas dan pengaturan sebagai satu berkas JSON', h('div', { class: 'st-row' }, exportBtn, importBtn)),
        card('Atur ulang AwanOS', 'Hapus semua data dan kembali ke kondisi awal', resetBtn),
      ];
    }

    function shortcuts() {
      const rows = [
        ...OS.shortcuts,
        ['Seret judul jendela ke tepi', 'Bagi layar kiri/kanan atau maksimalkan'],
        ['Klik dua kali judul jendela', 'Maksimalkan / pulihkan'],
        ['F2', 'Ganti nama berkas terpilih'],
        ['Delete', 'Hapus berkas terpilih'],
        ['Ctrl+C / Ctrl+X / Ctrl+V', 'Salin / potong / tempel berkas'],
        ['Ctrl+S', 'Simpan (Notepad, Paint)'],
      ];
      return [
        h('h2', { text: 'Pintasan keyboard' }),
        h('div', { class: 'st-shortcuts' }, rows.map(([k, v]) => h('div', { class: 'st-shortcut' }, h('kbd', { text: k }), h('span', { text: v })))),
      ];
    }

    function about() {
      const ua = navigator.userAgent;
      const browser = (ua.match(/(Firefox|Edg|OPR|Chrome|Safari)\/[\d.]+/) || ['Tidak diketahui'])[0].replace('Edg', 'Edge').replace('OPR', 'Opera');
      const rows = [
        ['Versi', `AwanOS ${OS.version}`],
        ['Browser', browser],
        ['Platform', navigator.platform || '—'],
        ['Bahasa', navigator.language],
        ['Resolusi layar', `${screen.width} × ${screen.height} (${window.devicePixelRatio}x)`],
        ['Jendela browser', `${window.innerWidth} × ${window.innerHeight}`],
        ['Inti CPU', String(navigator.hardwareConcurrency || '—')],
        ['Aplikasi terpasang', String(OS.apps.list().length)],
      ];
      return [
        h('h2', { text: 'Tentang' }),
        h('div', { class: 'st-about' },
          h('div', { html: OS.icons.logo('lg') }),
          h('div', {},
            h('div', { class: 'st-about-name', text: 'AwanOS' }),
            h('div', { class: 'st-card-desc', text: 'Sistem operasi desktop yang berjalan sepenuhnya di browser sebagai situs statis — tanpa server, tanpa build.' }))),
        h('div', { class: 'st-table' }, rows.map(([k, v]) => h('div', {}, h('span', { text: k }), h('strong', { text: v })))),
      ];
    }

    const RENDER = { personalization, system, shortcuts, about };

    function show(id) {
      section = RENDER[id] ? id : 'personalization';
      nav.querySelectorAll('.st-nav-item').forEach((b) => b.classList.toggle('active', b.dataset.id === section));
      content.innerHTML = '';
      content.append(...RENDER[section]());
      content.scrollTop = 0;
      win.setTitle(`Pengaturan — ${SECTIONS.find((x) => x.id === section).name}`);
    }

    const off = s.on('change', (key) => {
      if (key === 'wallpaper' && section === 'personalization') {
        const preview = content.querySelector('.st-preview');
        if (preview) preview.style.background = s.wallpaperCss();
      }
    });
    win.on('close', off);
    win.onArgs = (a) => { if (a && a.section) show(a.section); };
    renderUser();
    show(section);
  }

  OS.apps.register({
    id: 'settings',
    name: 'Pengaturan',
    description: 'Tema, wallpaper, akun, dan penyimpanan',
    keywords: ['settings', 'tema', 'wallpaper', 'personalisasi', 'control panel'],
    icon: 'settings',
    colors: ['#a1a1aa', '#52525b'],
    width: 860,
    height: 580,
    minWidth: 520,
    minHeight: 360,
    singleInstance: true,
    launch,
  });
})();
