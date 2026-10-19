/* AwanOS — file operations shared by the desktop, explorer and terminal */
(function () {
  'use strict';
  const OS = window.OS;
  const vfs = OS.vfs;
  const { extname, stripExt, formatBytes, formatDate, readFile, emitter } = OS.utils;

  const TEXT_EXT = new Set(['txt', 'md', 'html', 'htm', 'css', 'js', 'json', 'csv', 'log', 'xml', 'svg', 'ts', 'py', 'sh', 'c', 'h', 'java', 'ini', 'yml', 'yaml', 'toml', 'rtf']);
  const MIME = {
    txt: 'text/plain', md: 'text/markdown', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
    json: 'application/json', csv: 'text/csv', svg: 'image/svg+xml', xml: 'application/xml',
  };
  const KIND_LABEL = { text: 'Dokumen teks', code: 'Kode sumber', html: 'Halaman HTML', image: 'Gambar', audio: 'Audio', data: 'Data' };

  const events = emitter();
  const clipboard = { mode: null, paths: [] };

  const displayName = (name) => (extname(name) === 'app' ? stripExt(name) : name);

  function typeLabel(name, type) {
    if (type === 'dir') return 'Folder';
    const ext = extname(name);
    if (ext === 'app') return 'Pintasan aplikasi';
    const kind = OS.icons.fileKind(name);
    if (KIND_LABEL[kind]) return `${KIND_LABEL[kind]} (.${ext})`;
    return ext ? `Berkas ${ext.toUpperCase()}` : 'Berkas';
  }

  function setClipboard(mode, paths) {
    clipboard.mode = mode;
    clipboard.paths = paths.slice();
    events.emit('clipboard');
  }

  function paste(dest) {
    if (!clipboard.paths.length) return [];
    const created = [];
    for (const src of clipboard.paths) {
      if (!vfs.exists(src)) continue;
      try {
        if (clipboard.mode === 'cut') {
          if (vfs.dirname(src) === dest) continue;
          created.push(vfs.rename(src, vfs.join(dest, vfs.uniqueName(dest, vfs.basename(src)))));
        } else {
          created.push(vfs.copy(src, vfs.join(dest, vfs.uniqueName(dest, vfs.basename(src)))));
        }
      } catch (err) {
        OS.ui.showError(err, 'Tidak dapat menempel');
        break;
      }
    }
    if (clipboard.mode === 'cut') setClipboard(null, []);
    return created;
  }

  /** Move paths into a folder (used for drag & drop). */
  function moveInto(paths, dest) {
    for (const src of paths) {
      if (src === dest || vfs.dirname(src) === dest) continue;
      try {
        vfs.rename(src, vfs.join(dest, vfs.uniqueName(dest, vfs.basename(src))));
      } catch (err) {
        OS.ui.showError(err, 'Tidak dapat memindahkan');
        return;
      }
    }
  }

  function rename(path, newName) {
    if (!newName) return null;
    if (extname(path) === 'app' && extname(newName) !== 'app') newName += '.app';
    try {
      return vfs.rename(path, vfs.join(vfs.dirname(path), newName));
    } catch (err) {
      OS.ui.showError(err, 'Tidak dapat mengganti nama');
      return null;
    }
  }

  async function remove(paths) {
    if (!paths.length) return false;
    const message = paths.length === 1
      ? `Hapus "${displayName(vfs.basename(paths[0]))}" secara permanen?`
      : `Hapus ${paths.length} item ini secara permanen?`;
    const ok = await OS.ui.confirm(message, { title: 'Hapus', okLabel: 'Hapus', danger: true });
    if (!ok) return false;
    for (const p of paths) {
      try {
        if (vfs.exists(p)) vfs.remove(p);
      } catch (err) {
        OS.ui.showError(err, 'Tidak dapat menghapus');
        return false;
      }
    }
    return true;
  }

  const newFolder = (dir) => vfs.mkdir(vfs.join(dir, vfs.uniqueName(dir, 'Folder baru')));
  const newTextFile = (dir) => vfs.writeFile(vfs.join(dir, vfs.uniqueName(dir, 'Dokumen baru.txt')), '');

  function properties(path) {
    const st = vfs.stat(path);
    if (!st) return;
    const lines = [
      `Jenis: ${typeLabel(st.name, st.type)}`,
      `Lokasi: ${vfs.dirname(st.path).replace(vfs.HOME, '~')}`,
      `Ukuran: ${formatBytes(st.size)}`,
      st.type === 'dir' ? `Isi: ${st.count} item` : null,
      `Diubah: ${formatDate(st.mtime)}`,
    ];
    OS.ui.alert(lines.filter(Boolean).join('\n'), { title: `Properti — ${displayName(st.name)}`, icon: 'info' });
  }

  function download(path) {
    const name = vfs.basename(path);
    OS.utils.download(name, vfs.readFile(path), MIME[extname(name)] || 'application/octet-stream');
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Gambar tidak dapat dibaca'));
      img.src = src;
    });
  }

  /** Large photos are downscaled and re-encoded so they fit in browser storage. */
  async function compressImage(file) {
    const dataUrl = await readFile(file, 'dataurl');
    if (file.size <= 300 * 1024 || file.type === 'image/gif') return { name: file.name, content: dataUrl };
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    let content = canvas.toDataURL('image/webp', 0.85);
    let ext = 'webp';
    if (!content.startsWith('data:image/webp')) {
      content = canvas.toDataURL('image/jpeg', 0.85);
      ext = 'jpg';
    }
    return { name: `${stripExt(file.name)}.${ext}`, content };
  }

  async function readForImport(file) {
    const ext = extname(file.name);
    if (file.type.startsWith('image/') && ext !== 'svg') return compressImage(file);
    if (TEXT_EXT.has(ext) || file.type.startsWith('text/')) {
      if (file.size > 1.5 * 1024 * 1024) throw new Error('Berkas teks terlalu besar (maks. 1,5 MB).');
      return { name: file.name, content: await readFile(file, 'text') };
    }
    if (file.size > 512 * 1024) throw new Error('Berkas terlalu besar untuk penyimpanan browser (maks. 512 KB).');
    return { name: file.name, content: await readFile(file, 'dataurl') };
  }

  /** Import real files (from drag & drop or an <input type=file>) into the VFS. */
  async function importFiles(files, dest) {
    let count = 0;
    for (const file of Array.from(files)) {
      try {
        const { name, content } = await readForImport(file);
        vfs.writeFile(vfs.join(dest, vfs.uniqueName(dest, name)), content);
        count++;
      } catch (err) {
        OS.notify({ title: `Gagal mengimpor ${file.name}`, body: err.message, icon: 'upload' });
      }
    }
    if (count) {
      OS.notify({ title: 'Impor selesai', body: `${count} berkas ditambahkan ke ${dest.replace(vfs.HOME, '~')}.`, icon: 'upload' });
    }
    return count;
  }

  function pickAndImport(dest) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.addEventListener('change', () => importFiles(input.files, dest));
    input.click();
  }

  /** Context-menu entries for a selection of paths. */
  function itemMenu(paths, { onRename } = {}) {
    const single = paths.length === 1 ? paths[0] : null;
    const stat = single ? vfs.stat(single) : null;
    const isApp = single && extname(single) === 'app';
    const items = [{ label: 'Buka', icon: 'open', action: () => paths.forEach((p) => OS.apps.openPath(p)) }];
    if (stat && stat.type === 'file' && !isApp) {
      OS.apps.handlersFor(single).slice(1).forEach((app) => {
        items.push({ label: `Buka dengan ${app.name}`, iconHtml: OS.icons.appIcon(app, 'xs'), action: () => OS.apps.openPath(single, app.id) });
      });
    }
    if (stat && stat.type === 'dir') {
      items.push({ label: 'Buka di Terminal', icon: 'terminal', action: () => OS.wm.open('terminal', { cwd: single }) });
    }
    items.push(
      '-',
      { label: 'Potong', icon: 'cut', shortcut: 'Ctrl+X', action: () => setClipboard('cut', paths) },
      { label: 'Salin', icon: 'copy', shortcut: 'Ctrl+C', action: () => setClipboard('copy', paths) },
      { label: 'Ganti nama', icon: 'edit', shortcut: 'F2', disabled: !single || !onRename, action: () => onRename(single) },
      { label: 'Hapus', icon: 'trash', shortcut: 'Del', danger: true, action: () => remove(paths) },
      '-'
    );
    if (stat && stat.type === 'file' && !isApp) items.push({ label: 'Unduh ke komputer', icon: 'download', action: () => download(single) });
    if (single) items.push({ label: 'Properti', icon: 'info', action: () => properties(single) });
    return items;
  }

  /** Wire HTML5 drag & drop of real files onto an element. */
  function acceptDrops(el, getDest) {
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    el.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      el.classList.add('drop-active');
    });
    el.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    el.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) el.classList.remove('drop-active');
    });
    el.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      el.classList.remove('drop-active');
      importFiles(e.dataTransfer.files, getDest());
    });
  }

  OS.fileOps = {
    DRAG_TYPE: 'application/x-awanos-paths',
    clipboard,
    on: events.on,
    displayName,
    typeLabel,
    setClipboard,
    paste,
    moveInto,
    rename,
    remove,
    newFolder,
    newTextFile,
    properties,
    download,
    importFiles,
    pickAndImport,
    itemMenu,
    acceptDrops,
  };
})();
