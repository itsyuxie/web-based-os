/* AwanOS — virtual filesystem persisted to localStorage */
(function () {
  'use strict';
  const OS = window.OS;
  const { emitter, debounce, contentSize } = OS.utils;

  const HOME = '/home/user';
  const events = emitter();

  const now = () => Date.now();
  const dir = (children = {}) => ({ type: 'dir', mtime: now(), children });
  const file = (content = '') => ({ type: 'file', mtime: now(), content });
  const shortcut = (app) => file(JSON.stringify({ app }));

  const WELCOME = `Selamat datang di AwanOS!
=========================

AwanOS adalah sistem operasi desktop yang berjalan sepenuhnya di browser.
Semua berkas yang kamu buat disimpan di penyimpanan lokal browser ini.

Beberapa hal yang bisa dicoba:
  • Klik dua kali ikon di desktop untuk membuka aplikasi.
  • Seret jendela ke tepi kiri/kanan layar untuk membaginya, atau ke atas untuk memaksimalkan.
  • Klik kanan desktop untuk membuat folder atau dokumen baru.
  • Seret berkas dari komputermu ke Penjelajah Berkas untuk mengimpornya.
  • Buka Terminal dan ketik "help" untuk melihat daftar perintah.
  • Ganti wallpaper, tema, dan warna aksen di Pengaturan.

Selamat bersenang-senang!
`;

  const SAMPLE_HTML = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Halo dari AwanOS</title>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0;
           background: linear-gradient(135deg, #38bdf8, #6366f1); color: white; }
    .card { background: rgba(255,255,255,.15); padding: 2rem 3rem; border-radius: 16px; text-align: center; }
    button { font: inherit; padding: .5rem 1.2rem; border: 0; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Halo, dunia!</h1>
    <p>Halaman ini disimpan di sistem berkas AwanOS.</p>
    <p>Klik kanan berkasnya lalu pilih "Buka dengan Notepad" untuk mengeditnya.</p>
    <button onclick="this.textContent = 'Diklik ' + (++window.n || (window.n = 1)) + ' kali'">Klik aku</button>
  </div>
</body>
</html>
`;

  function defaultTree() {
    return dir({
      home: dir({
        user: dir({
          Desktop: dir({
            'Penjelajah Berkas.app': shortcut('explorer'),
            'Browser.app': shortcut('browser'),
            'Terminal.app': shortcut('terminal'),
            'Notepad.app': shortcut('notepad'),
            'Paint.app': shortcut('paint'),
            'Kalkulator.app': shortcut('calculator'),
            'Minesweeper.app': shortcut('minesweeper'),
            'Pengaturan.app': shortcut('settings'),
            'Baca saya.txt': file(WELCOME),
          }),
          Dokumen: dir({
            'catatan.txt': file('Daftar belanja:\n- Kopi\n- Roti\n- Telur\n'),
            'halo.html': file(SAMPLE_HTML),
            'ide.md': file('# Ide proyek\n\n1. Belajar JavaScript\n2. Membuat OS di browser ✔\n3. ...\n'),
          }),
          Gambar: dir({}),
          Musik: dir({}),
          Unduhan: dir({}),
        }),
      }),
      etc: dir({
        hostname: file('awanos\n'),
        motd: file('Selamat datang di AwanOS. Ketik "help" untuk bantuan.\n'),
      }),
      tmp: dir({}),
    });
  }

  let root = OS.storage.read('fs', null);
  const firstBoot = !root || root.type !== 'dir';
  if (firstBoot) root = defaultTree();

  let saveFailed = false;
  const persist = debounce(() => {
    const ok = OS.storage.write('fs', root);
    if (!ok && !saveFailed && OS.notify) {
      OS.notify({ title: 'Penyimpanan penuh', body: 'Perubahan berkas tidak dapat disimpan. Hapus beberapa berkas besar.', icon: 'hardDrive' });
    }
    saveFailed = !ok;
  }, 150);

  class FsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  /** Normalise a path (supports ~, ., ..) relative to cwd into an absolute path. */
  function resolve(path, cwd = HOME) {
    if (path == null || path === '') return cwd;
    path = String(path);
    if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1);
    const base = path.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') base.pop();
      else base.push(part);
    }
    return '/' + base.join('/');
  }

  const basename = (path) => path.split('/').filter(Boolean).pop() || '/';
  const dirname = (path) => {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  };
  const join = (a, b) => resolve(b, a);

  function nodeAt(path) {
    let node = root;
    for (const part of path.split('/').filter(Boolean)) {
      if (!node || node.type !== 'dir') return null;
      node = Object.prototype.hasOwnProperty.call(node.children, part) ? node.children[part] : null;
    }
    return node;
  }

  function parentOf(path) {
    if (path === '/') throw new FsError('EPERM', 'Tidak dapat mengubah direktori root');
    const parent = nodeAt(dirname(path));
    if (!parent) throw new FsError('ENOENT', `Direktori tidak ditemukan: ${dirname(path)}`);
    if (parent.type !== 'dir') throw new FsError('ENOTDIR', `Bukan direktori: ${dirname(path)}`);
    return parent;
  }

  function validName(name) {
    if (!name || name === '.' || name === '..' || name.includes('/')) {
      throw new FsError('EINVAL', `Nama tidak valid: "${name}"`);
    }
  }

  function changed(...paths) {
    persist();
    events.emit('change', paths);
  }

  function nodeSize(node) {
    if (node.type === 'file') return contentSize(node.content);
    let total = 0;
    for (const child of Object.values(node.children)) total += nodeSize(child);
    return total;
  }

  const vfs = {
    HOME,
    FsError,
    resolve,
    basename,
    dirname,
    join,
    on: events.on,
    off: events.off,

    exists: (path) => !!nodeAt(resolve(path)),
    isDir: (path) => (nodeAt(resolve(path)) || {}).type === 'dir',
    isFile: (path) => (nodeAt(resolve(path)) || {}).type === 'file',

    stat(path) {
      path = resolve(path);
      const node = nodeAt(path);
      if (!node) return null;
      return {
        path,
        name: basename(path),
        type: node.type,
        mtime: node.mtime,
        size: nodeSize(node),
        count: node.type === 'dir' ? Object.keys(node.children).length : undefined,
      };
    },

    readdir(path) {
      path = resolve(path);
      const node = nodeAt(path);
      if (!node) throw new FsError('ENOENT', `Tidak ditemukan: ${path}`);
      if (node.type !== 'dir') throw new FsError('ENOTDIR', `Bukan direktori: ${path}`);
      return Object.entries(node.children)
        .map(([name, child]) => ({
          name,
          path: join(path, name),
          type: child.type,
          mtime: child.mtime,
          size: child.type === 'file' ? contentSize(child.content) : undefined,
        }))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }) : a.type === 'dir' ? -1 : 1));
    },

    readFile(path) {
      path = resolve(path);
      const node = nodeAt(path);
      if (!node) throw new FsError('ENOENT', `Berkas tidak ditemukan: ${path}`);
      if (node.type !== 'file') throw new FsError('EISDIR', `Ini adalah direktori: ${path}`);
      return node.content;
    },

    writeFile(path, content = '') {
      path = resolve(path);
      const parent = parentOf(path);
      const name = basename(path);
      validName(name);
      const existing = parent.children[name];
      if (existing && existing.type === 'dir') throw new FsError('EISDIR', `Ini adalah direktori: ${path}`);
      parent.children[name] = { type: 'file', mtime: now(), content: String(content) };
      parent.mtime = now();
      changed(path);
      return path;
    },

    appendFile(path, content) {
      path = resolve(path);
      const prev = vfs.isFile(path) ? vfs.readFile(path) : '';
      return vfs.writeFile(path, prev + content);
    },

    mkdir(path, { recursive = false } = {}) {
      path = resolve(path);
      if (recursive) {
        let cur = '/';
        for (const part of path.split('/').filter(Boolean)) {
          cur = join(cur, part);
          const node = nodeAt(cur);
          if (!node) vfs.mkdir(cur);
          else if (node.type !== 'dir') throw new FsError('ENOTDIR', `Bukan direktori: ${cur}`);
        }
        return path;
      }
      const parent = parentOf(path);
      const name = basename(path);
      validName(name);
      if (parent.children[name]) throw new FsError('EEXIST', `Sudah ada: ${path}`);
      parent.children[name] = dir({});
      parent.mtime = now();
      changed(path);
      return path;
    },

    remove(path, { recursive = true } = {}) {
      path = resolve(path);
      const parent = parentOf(path);
      const name = basename(path);
      const node = parent.children[name];
      if (!node) throw new FsError('ENOENT', `Tidak ditemukan: ${path}`);
      if (node.type === 'dir' && !recursive && Object.keys(node.children).length) {
        throw new FsError('ENOTEMPTY', `Direktori tidak kosong: ${path}`);
      }
      delete parent.children[name];
      parent.mtime = now();
      changed(path);
    },

    rename(from, to) {
      from = resolve(from);
      to = resolve(to);
      if (from === to) return to;
      if (to === from || to.startsWith(from + '/')) throw new FsError('EINVAL', 'Tidak dapat memindahkan folder ke dalam dirinya sendiri');
      const srcParent = parentOf(from);
      const srcName = basename(from);
      const node = srcParent.children[srcName];
      if (!node) throw new FsError('ENOENT', `Tidak ditemukan: ${from}`);
      const dstParent = parentOf(to);
      const dstName = basename(to);
      validName(dstName);
      if (dstParent.children[dstName]) throw new FsError('EEXIST', `Sudah ada: ${to}`);
      delete srcParent.children[srcName];
      dstParent.children[dstName] = node;
      node.mtime = now();
      srcParent.mtime = dstParent.mtime = now();
      changed(from, to);
      return to;
    },

    copy(from, to) {
      from = resolve(from);
      to = resolve(to);
      if (to.startsWith(from + '/')) throw new FsError('EINVAL', 'Tidak dapat menyalin folder ke dalam dirinya sendiri');
      const node = nodeAt(from);
      if (!node) throw new FsError('ENOENT', `Tidak ditemukan: ${from}`);
      const dstParent = parentOf(to);
      const dstName = basename(to);
      validName(dstName);
      if (dstParent.children[dstName]) throw new FsError('EEXIST', `Sudah ada: ${to}`);
      const clone = JSON.parse(JSON.stringify(node));
      clone.mtime = now();
      dstParent.children[dstName] = clone;
      dstParent.mtime = now();
      changed(to);
      return to;
    },

    /** Returns "name", or "name (2)", "name (3)"… so it does not clash inside dirPath. */
    uniqueName(dirPath, name) {
      const parent = nodeAt(resolve(dirPath));
      if (!parent || parent.type !== 'dir' || !parent.children[name]) return name;
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      for (let i = 2; ; i++) {
        const candidate = `${stem} (${i})${ext}`;
        if (!parent.children[candidate]) return candidate;
      }
    },

    /** Depth-first walk yielding { path, name, type } for every entry below path. */
    *walk(path = '/') {
      path = resolve(path);
      const node = nodeAt(path);
      if (!node || node.type !== 'dir') return;
      for (const [name, child] of Object.entries(node.children)) {
        const p = join(path, name);
        yield { path: p, name, type: child.type };
        if (child.type === 'dir') yield* vfs.walk(p);
      }
    },

    usage: () => nodeSize(root),

    exportData: () => JSON.parse(JSON.stringify(root)),

    importData(tree) {
      if (!tree || tree.type !== 'dir' || typeof tree.children !== 'object') throw new FsError('EINVAL', 'Data sistem berkas tidak valid');
      root = tree;
      changed('/');
    },

    reset() {
      root = defaultTree();
      changed('/');
    },

    /** Flush pending writes immediately (used before reload). */
    flush() {
      OS.storage.write('fs', root);
    },
  };

  OS.vfs = vfs;
  if (firstBoot) vfs.flush();
})();
