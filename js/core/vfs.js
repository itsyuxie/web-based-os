/* AwanOS — virtual filesystem persisted to localStorage */
(function () {
  'use strict';
  const OS = window.OS;
  const { emitter, debounce, contentSize } = OS.utils;

  const HOME = '/home/user';
  const events = emitter();

  const now = () => Date.now();
  const dir = (children = {}) => ({ type: 'dir', mtime: now(), children });
  // Names sort in the order of the UI language (numeric: "file 2" before "file 10").
  let sorter = null;
  const collator = () => {
    const locale = OS.i18n ? OS.i18n.locale : undefined;
    if (!sorter || sorter.locale !== locale) sorter = { locale, cmp: new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }) };
    return sorter.cmp;
  };
  const file = (content = '') => ({ type: 'file', mtime: now(), content });
  const shortcut = (app) => file(JSON.stringify({ app }));

  const SAMPLE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Hello from AwanOS</title>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0;
           background: linear-gradient(135deg, #38bdf8, #6366f1); color: white; }
    .card { background: rgba(255,255,255,.15); padding: 2rem 3rem; border-radius: 16px; text-align: center; }
    button { font: inherit; padding: .5rem 1.2rem; border: 0; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hello, world!</h1>
    <p>This page is stored in the AwanOS file system.</p>
    <p>Right-click the file and choose "Open with Notepad" to edit it.</p>
    <button onclick="window.n = (window.n || 0) + 1; this.textContent = 'Clicked ' + window.n + (window.n === 1 ? ' time' : ' times')">Click me</button>
  </div>
</body>
</html>
`;

  /** The tree created on first boot. The read-me file uses the system language. */
  function defaultTree() {
    return dir({
      home: dir({
        user: dir({
          Desktop: dir({
            'explorer.app': shortcut('explorer'),
            'browser.app': shortcut('browser'),
            'terminal.app': shortcut('terminal'),
            'notepad.app': shortcut('notepad'),
            'paint.app': shortcut('paint'),
            'calculator.app': shortcut('calculator'),
            'minesweeper.app': shortcut('minesweeper'),
            'settings.app': shortcut('settings'),
            [OS.t('fs.readmeName')]: file(OS.t('fs.welcome')),
          }),
          Documents: dir({
            'notes.txt': file('Shopping list:\n- Coffee\n- Bread\n- Eggs\n'),
            'hello.html': file(SAMPLE_HTML),
            'ideas.md': file('# Project ideas\n\n1. Learn JavaScript\n2. Build an OS in the browser ✔\n3. ...\n'),
          }),
          Pictures: dir({}),
          Music: dir({}),
          Downloads: dir({}),
        }),
      }),
      etc: dir({
        hostname: file('awanos\n'),
        motd: file('Welcome to AwanOS. Type "help" to see the available commands.\n'),
      }),
      tmp: dir({}),
    });
  }

  let root = null; // set by vfs.init() once the language files are loaded

  let saveFailed = false;
  const persist = debounce(() => {
    if (!root) return;
    const ok = OS.storage.write('fs', root);
    if (!ok && !saveFailed && OS.notify) {
      OS.notify({ title: OS.t('fs.storageFull'), body: OS.t('fs.storageFullBody'), icon: 'hardDrive' });
    }
    saveFailed = !ok;
  }, 150);

  /** Filesystem error with a POSIX-like code and a translated message (fs.errors.<key>). */
  class FsError extends Error {
    constructor(code, key, params) {
      super(OS.t(`fs.errors.${key}`, params));
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
    if (path === '/') throw new FsError('EPERM', 'rootReadOnly');
    const parent = nodeAt(dirname(path));
    if (!parent) throw new FsError('ENOENT', 'dirNotFound', { path: dirname(path) });
    if (parent.type !== 'dir') throw new FsError('ENOTDIR', 'notDir', { path: dirname(path) });
    return parent;
  }

  function validName(name) {
    if (!name || name === '.' || name === '..' || name.includes('/')) {
      throw new FsError('EINVAL', 'invalidName', { name });
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
      if (!node) throw new FsError('ENOENT', 'notFound', { path });
      if (node.type !== 'dir') throw new FsError('ENOTDIR', 'notDir', { path });
      return Object.entries(node.children)
        .map(([name, child]) => ({
          name,
          path: join(path, name),
          type: child.type,
          mtime: child.mtime,
          size: child.type === 'file' ? contentSize(child.content) : undefined,
        }))
        .sort((a, b) => (a.type === b.type ? collator().compare(a.name, b.name) : a.type === 'dir' ? -1 : 1));
    },

    readFile(path) {
      path = resolve(path);
      const node = nodeAt(path);
      if (!node) throw new FsError('ENOENT', 'fileNotFound', { path });
      if (node.type !== 'file') throw new FsError('EISDIR', 'isDir', { path });
      return node.content;
    },

    writeFile(path, content = '') {
      path = resolve(path);
      const parent = parentOf(path);
      const name = basename(path);
      validName(name);
      const existing = parent.children[name];
      if (existing && existing.type === 'dir') throw new FsError('EISDIR', 'isDir', { path });
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
          else if (node.type !== 'dir') throw new FsError('ENOTDIR', 'notDir', { path: cur });
        }
        return path;
      }
      const parent = parentOf(path);
      const name = basename(path);
      validName(name);
      if (parent.children[name]) throw new FsError('EEXIST', 'exists', { path });
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
      if (!node) throw new FsError('ENOENT', 'notFound', { path });
      if (node.type === 'dir' && !recursive && Object.keys(node.children).length) {
        throw new FsError('ENOTEMPTY', 'notEmpty', { path });
      }
      delete parent.children[name];
      parent.mtime = now();
      changed(path);
    },

    rename(from, to) {
      from = resolve(from);
      to = resolve(to);
      if (from === to) return to;
      if (to === from || to.startsWith(from + '/')) throw new FsError('EINVAL', 'moveIntoSelf');
      const srcParent = parentOf(from);
      const srcName = basename(from);
      const node = srcParent.children[srcName];
      if (!node) throw new FsError('ENOENT', 'notFound', { path: from });
      const dstParent = parentOf(to);
      const dstName = basename(to);
      validName(dstName);
      if (dstParent.children[dstName]) throw new FsError('EEXIST', 'exists', { path: to });
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
      if (to.startsWith(from + '/')) throw new FsError('EINVAL', 'copyIntoSelf');
      const node = nodeAt(from);
      if (!node) throw new FsError('ENOENT', 'notFound', { path: from });
      const dstParent = parentOf(to);
      const dstName = basename(to);
      validName(dstName);
      if (dstParent.children[dstName]) throw new FsError('EEXIST', 'exists', { path: to });
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
      if (!tree || tree.type !== 'dir' || typeof tree.children !== 'object') throw new FsError('EINVAL', 'invalidData');
      root = tree;
      changed('/');
    },

    reset() {
      root = defaultTree();
      changed('/');
    },

    /** Forget the tree without saving it, so the next start is a fresh install (used by Settings ▸ Reset). */
    discard() {
      root = null;
    },

    /**
     * Load the stored tree, or create the default one on first boot.
     * Returns true when a fresh tree was created.
     */
    init() {
      root = OS.storage.read('fs', null);
      if (root && root.type === 'dir') return false;
      root = defaultTree();
      vfs.flush();
      return true;
    },

    /** Flush pending writes immediately (used before reload). Does nothing before init(). */
    flush() {
      if (root) OS.storage.write('fs', root);
    },
  };

  OS.vfs = vfs;
})();
