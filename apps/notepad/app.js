/* AwanOS — Notepad */
(function () {
  'use strict';
  const OS = window.OS;
  const { h } = OS.utils;
  const vfs = OS.vfs;

  const prefs = () => Object.assign({ wrap: true, size: 14, mono: true }, OS.storage.read('notepad', {}));
  const savePrefs = (p) => OS.storage.write('notepad', p);

  function launch(win, args) {
    let path = null;
    let saved = '';
    let lastSearch = '';
    const p = prefs();

    const text = h('textarea', { class: 'np-text', spellcheck: false, 'aria-label': 'Isi dokumen' });
    const posEl = h('span');
    const countEl = h('span');
    const infoEl = h('span');
    const flashEl = h('span', { class: 'np-flash' });

    const menuBtn = (label, items) => {
      const b = h('button', { class: 'menubar-item', text: label });
      b.addEventListener('click', () => {
        const r = b.getBoundingClientRect();
        OS.ui.contextMenu(r.left, r.bottom + 2, items());
      });
      return b;
    };

    const menubar = h('div', { class: 'menubar' },
      menuBtn('Berkas', () => [
        { label: 'Baru', icon: 'filePlus', action: newDoc },
        { label: 'Jendela baru', icon: 'plus', action: () => OS.wm.open('notepad') },
        { label: 'Buka…', icon: 'open', shortcut: 'Ctrl+O', action: openDoc },
        { label: 'Simpan', icon: 'save', shortcut: 'Ctrl+S', action: save },
        { label: 'Simpan sebagai…', icon: 'save', shortcut: 'Ctrl+Shift+S', action: saveAs },
        '-',
        { label: 'Unduh ke komputer', icon: 'download', action: () => OS.utils.download(path ? vfs.basename(path) : 'Tanpa judul.txt', text.value, 'text/plain') },
        '-',
        { label: 'Tutup', icon: 'close', action: () => win.close() },
      ]),
      menuBtn('Edit', () => [
        { label: 'Urungkan', icon: 'undo', shortcut: 'Ctrl+Z', action: () => { text.focus(); document.execCommand('undo'); } },
        '-',
        { label: 'Cari…', icon: 'search', shortcut: 'Ctrl+F', action: find },
        { label: 'Cari berikutnya', shortcut: 'F3', disabled: !lastSearch, action: () => findNext(lastSearch) },
        { label: 'Ganti…', icon: 'edit', shortcut: 'Ctrl+H', action: replace },
        '-',
        { label: 'Pilih semua', shortcut: 'Ctrl+A', action: () => { text.focus(); text.select(); } },
        { label: 'Sisipkan tanggal/waktu', shortcut: 'F5', action: insertDate },
      ]),
      menuBtn('Format', () => [
        { label: 'Bungkus kata', checked: p.wrap, action: () => { p.wrap = !p.wrap; applyPrefs(); } },
        { label: 'Font monospace', checked: p.mono, action: () => { p.mono = !p.mono; applyPrefs(); } },
        '-',
        { label: 'Perbesar', icon: 'zoomIn', shortcut: 'Ctrl++', action: () => zoom(1) },
        { label: 'Perkecil', icon: 'zoomOut', shortcut: 'Ctrl+-', action: () => zoom(-1) },
        { label: 'Ukuran bawaan', action: () => { p.size = 14; applyPrefs(); } },
      ])
    );

    win.body.classList.add('notepad');
    win.body.append(menubar, text, h('div', { class: 'statusbar' }, posEl, flashEl, h('span', { class: 'spacer' }), countEl, infoEl));

    function applyPrefs() {
      text.style.fontSize = `${p.size}px`;
      text.classList.toggle('mono', p.mono);
      text.wrap = p.wrap ? 'soft' : 'off';
      text.classList.toggle('nowrap', !p.wrap);
      savePrefs(p);
    }

    function zoom(delta) {
      p.size = Math.min(40, Math.max(9, p.size + delta * 2));
      applyPrefs();
    }

    const dirty = () => text.value !== saved;
    const name = () => (path ? vfs.basename(path) : 'Tanpa judul');

    function updateTitle() {
      win.setTitle(`${dirty() ? '● ' : ''}${name()} — Notepad`);
    }

    function updateStatus() {
      const before = text.value.slice(0, text.selectionStart);
      const line = before.split('\n').length;
      const col = before.length - before.lastIndexOf('\n');
      posEl.textContent = `Baris ${line}, Kolom ${col}`;
      countEl.textContent = `${text.value.length.toLocaleString('id-ID')} karakter`;
      infoEl.textContent = path ? path.replace(vfs.HOME, '~') : 'Belum disimpan';
    }

    function flash(msg) {
      flashEl.textContent = msg;
      flashEl.classList.add('show');
      clearTimeout(flash.t);
      flash.t = setTimeout(() => flashEl.classList.remove('show'), 1800);
    }

    function load(p2) {
      let content;
      try {
        content = vfs.readFile(p2);
      } catch (err) {
        OS.ui.showError(err, 'Tidak dapat membuka');
        return;
      }
      if (/^data:[^,]*;base64,/.test(content)) {
        OS.ui.alert('Berkas ini berisi data biner (misalnya gambar), bukan teks.', { title: 'Notepad', icon: 'warning' });
        return;
      }
      path = vfs.resolve(p2);
      win.filePath = path;
      text.value = content;
      saved = content;
      text.setSelectionRange(0, 0);
      text.scrollTop = 0;
      updateTitle();
      updateStatus();
    }

    async function confirmDiscard() {
      if (!dirty()) return true;
      const { button } = await OS.ui.dialog({
        title: 'Notepad',
        message: `Simpan perubahan pada "${name()}"?`,
        icon: 'warning',
        buttons: [
          { label: 'Simpan', value: 'save', primary: true },
          { label: 'Jangan simpan', value: 'discard' },
          { label: 'Batal', value: null, cancel: true },
        ],
      });
      if (button === 'save') return save();
      return button === 'discard';
    }

    async function newDoc() {
      if (!(await confirmDiscard())) return;
      path = null;
      win.filePath = null;
      text.value = '';
      saved = '';
      updateTitle();
      updateStatus();
      text.focus();
    }

    async function openDoc() {
      if (!(await confirmDiscard())) return;
      const chosen = await OS.ui.pickFile({ mode: 'open', startDir: path ? vfs.dirname(path) : `${vfs.HOME}/Dokumen` });
      if (chosen) load(chosen);
      text.focus();
    }

    function writeTo(target) {
      try {
        vfs.writeFile(target, text.value);
      } catch (err) {
        OS.ui.showError(err, 'Tidak dapat menyimpan');
        return false;
      }
      path = vfs.resolve(target);
      win.filePath = path;
      saved = text.value;
      updateTitle();
      updateStatus();
      flash('Tersimpan');
      return true;
    }

    async function save() {
      if (!path) return saveAs();
      return writeTo(path);
    }

    async function saveAs() {
      const target = await OS.ui.pickFile({
        mode: 'save',
        startDir: path ? vfs.dirname(path) : `${vfs.HOME}/Dokumen`,
        defaultName: path ? vfs.basename(path) : 'Tanpa judul.txt',
      });
      text.focus();
      if (!target) return false;
      return writeTo(target);
    }

    function findNext(needle, from = text.selectionEnd) {
      if (!needle) return false;
      const hay = text.value.toLowerCase();
      let idx = hay.indexOf(needle.toLowerCase(), from);
      if (idx < 0) idx = hay.indexOf(needle.toLowerCase(), 0);
      if (idx < 0) {
        flash(`"${needle}" tidak ditemukan`);
        return false;
      }
      text.focus();
      text.setSelectionRange(idx, idx + needle.length);
      // Scroll the match into view by measuring lines.
      const line = text.value.slice(0, idx).split('\n').length - 1;
      const lh = parseFloat(getComputedStyle(text).lineHeight) || p.size * 1.5;
      text.scrollTop = Math.max(0, line * lh - text.clientHeight / 2);
      updateStatus();
      return true;
    }

    async function find() {
      const sel = text.value.slice(text.selectionStart, text.selectionEnd);
      const q = await OS.ui.prompt('Cari teks:', sel || lastSearch, { title: 'Cari', okLabel: 'Cari' });
      if (!q) { text.focus(); return; }
      lastSearch = q;
      findNext(q);
    }

    async function replace() {
      const q = await OS.ui.prompt('Cari teks:', lastSearch, { title: 'Ganti', okLabel: 'Lanjut' });
      if (!q) { text.focus(); return; }
      const r = await OS.ui.prompt(`Ganti semua "${q}" dengan:`, '', { title: 'Ganti', okLabel: 'Ganti semua' });
      if (r == null) { text.focus(); return; }
      lastSearch = q;
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = text.value.match(new RegExp(escaped, 'gi'));
      if (!matches) {
        flash(`"${q}" tidak ditemukan`);
        text.focus();
        return;
      }
      text.focus();
      text.select();
      const replaced = text.value.replace(new RegExp(escaped, 'gi'), () => r);
      if (!document.execCommand('insertText', false, replaced)) text.value = replaced;
      flash(`${matches.length} penggantian`);
      updateTitle();
      updateStatus();
    }

    function insertText(str) {
      text.focus();
      if (!document.execCommand('insertText', false, str)) text.setRangeText(str, text.selectionStart, text.selectionEnd, 'end');
      updateTitle();
      updateStatus();
    }

    function insertDate() {
      insertText(new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()));
    }

    text.addEventListener('input', () => { updateTitle(); updateStatus(); });
    ['keyup', 'click', 'select'].forEach((ev) => text.addEventListener(ev, updateStatus));
    text.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === 'Tab' && !ctrl) {
        e.preventDefault();
        insertText('\t');
      } else if (ctrl && k === 's') {
        e.preventDefault();
        if (e.shiftKey) saveAs(); else save();
      } else if (ctrl && k === 'o') {
        e.preventDefault();
        openDoc();
      } else if (ctrl && k === 'f') {
        e.preventDefault();
        find();
      } else if (ctrl && k === 'h') {
        e.preventDefault();
        replace();
      } else if (e.key === 'F3') {
        e.preventDefault();
        if (lastSearch) findNext(lastSearch); else find();
      } else if (e.key === 'F5') {
        e.preventDefault();
        insertDate();
      } else if (ctrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoom(1);
      } else if (ctrl && e.key === '-') {
        e.preventDefault();
        zoom(-1);
      }
    });

    win.isDirty = dirty;
    win.beforeClose = confirmDiscard;
    win.on('focus', () => setTimeout(() => { if (!document.querySelector('.dialog-overlay')) text.focus({ preventScroll: true }); }, 0));

    applyPrefs();
    if (args.path) load(args.path);
    updateTitle();
    updateStatus();
    setTimeout(() => text.focus(), 50);
  }

  OS.apps.register({
    id: 'notepad',
    name: 'Notepad',
    description: 'Editor teks sederhana',
    keywords: ['text', 'editor', 'teks', 'catatan'],
    icon: 'notepad',
    colors: ['#38bdf8', '#2563eb'],
    width: 720,
    height: 500,
    fileTypes: ['*'],
    launch,
  });
})();
