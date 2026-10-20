/* AwanOS — Notepad */
(function () {
  'use strict';
  const OS = window.OS;
  const { h } = OS.utils;
  const t = OS.i18n.forApp('notepad');
  const vfs = OS.vfs;

  const prefs = () => Object.assign({ wrap: true, size: 14, mono: true }, OS.storage.read('notepad', {}));
  const savePrefs = (p) => OS.storage.write('notepad', p);

  function launch(win, args) {
    let path = null;
    let saved = '';
    let lastSearch = '';
    const p = prefs();
    const num = new Intl.NumberFormat(t.locale);

    const text = h('textarea', { class: 'np-text', spellcheck: false, 'aria-label': t('textLabel') });
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
      menuBtn(t('menu.file.title'), () => [
        { label: t('menu.file.new'), icon: 'filePlus', action: newDoc },
        { label: t('menu.file.newWindow'), icon: 'plus', action: () => OS.wm.open('notepad') },
        { label: t('menu.file.open'), icon: 'open', shortcut: 'Ctrl+O', action: openDoc },
        { label: t('menu.file.save'), icon: 'save', shortcut: 'Ctrl+S', action: save },
        { label: t('menu.file.saveAs'), icon: 'save', shortcut: 'Ctrl+Shift+S', action: saveAs },
        '-',
        { label: t('menu.file.download'), icon: 'download', action: () => OS.utils.download(path ? vfs.basename(path) : t('untitledFile'), text.value, 'text/plain') },
        '-',
        { label: t('menu.file.close'), icon: 'close', action: () => win.close() },
      ]),
      menuBtn(t('menu.edit.title'), () => [
        { label: t('menu.edit.undo'), icon: 'undo', shortcut: 'Ctrl+Z', action: () => { text.focus(); document.execCommand('undo'); } },
        '-',
        { label: t('menu.edit.find'), icon: 'search', shortcut: 'Ctrl+F', action: find },
        { label: t('menu.edit.findNext'), shortcut: 'F3', disabled: !lastSearch, action: () => findNext(lastSearch) },
        { label: t('menu.edit.replace'), icon: 'edit', shortcut: 'Ctrl+H', action: replace },
        '-',
        { label: t('menu.edit.selectAll'), shortcut: 'Ctrl+A', action: () => { text.focus(); text.select(); } },
        { label: t('menu.edit.insertDate'), shortcut: 'F5', action: insertDate },
      ]),
      menuBtn(t('menu.format.title'), () => [
        { label: t('menu.format.wordWrap'), checked: p.wrap, action: () => { p.wrap = !p.wrap; applyPrefs(); } },
        { label: t('menu.format.monospace'), checked: p.mono, action: () => { p.mono = !p.mono; applyPrefs(); } },
        '-',
        { label: t('menu.format.zoomIn'), icon: 'zoomIn', shortcut: 'Ctrl++', action: () => zoom(1) },
        { label: t('menu.format.zoomOut'), icon: 'zoomOut', shortcut: 'Ctrl+-', action: () => zoom(-1) },
        { label: t('menu.format.resetZoom'), action: () => { p.size = 14; applyPrefs(); } },
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
    const name = () => (path ? vfs.basename(path) : t('untitled'));

    function updateTitle() {
      win.setTitle(`${dirty() ? '● ' : ''}${t('windowTitle', { file: name() })}`);
    }

    function updateStatus() {
      const before = text.value.slice(0, text.selectionStart);
      const line = before.split('\n').length;
      const col = before.length - before.lastIndexOf('\n');
      posEl.textContent = t('status.position', { line, column: col });
      countEl.textContent = t('status.characters', { count: text.value.length, number: num.format(text.value.length) });
      infoEl.textContent = path ? path.replace(vfs.HOME, '~') : t('status.notSaved');
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
        OS.ui.showError(err, t('errors.open'));
        return;
      }
      if (/^data:[^,]*;base64,/.test(content)) {
        OS.ui.alert(t('dialogs.binary'), { title: t('name'), icon: 'warning' });
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
        title: t('name'),
        message: t('dialogs.unsaved', { file: name() }),
        icon: 'warning',
        buttons: [
          { label: t('dialogs.save'), value: 'save', primary: true },
          { label: t('dialogs.dontSave'), value: 'discard' },
          { label: t('dialogs.cancel'), value: null, cancel: true },
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
      const chosen = await OS.ui.pickFile({ mode: 'open', startDir: path ? vfs.dirname(path) : `${vfs.HOME}/Documents` });
      if (chosen) load(chosen);
      text.focus();
    }

    function writeTo(target) {
      try {
        vfs.writeFile(target, text.value);
      } catch (err) {
        OS.ui.showError(err, t('errors.save'));
        return false;
      }
      path = vfs.resolve(target);
      win.filePath = path;
      saved = text.value;
      updateTitle();
      updateStatus();
      flash(t('flash.saved'));
      return true;
    }

    async function save() {
      if (!path) return saveAs();
      return writeTo(path);
    }

    async function saveAs() {
      const target = await OS.ui.pickFile({
        mode: 'save',
        startDir: path ? vfs.dirname(path) : `${vfs.HOME}/Documents`,
        defaultName: path ? vfs.basename(path) : t('untitledFile'),
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
        flash(t('flash.notFound', { query: needle }));
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
      const q = await OS.ui.prompt(t('find.prompt'), sel || lastSearch, { title: t('find.title'), okLabel: t('find.ok') });
      if (!q) { text.focus(); return; }
      lastSearch = q;
      findNext(q);
    }

    async function replace() {
      const q = await OS.ui.prompt(t('replace.prompt'), lastSearch, { title: t('replace.title'), okLabel: t('replace.next') });
      if (!q) { text.focus(); return; }
      const r = await OS.ui.prompt(t('replace.with', { query: q }), '', { title: t('replace.title'), okLabel: t('replace.all') });
      if (r == null) { text.focus(); return; }
      lastSearch = q;
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = text.value.match(new RegExp(escaped, 'gi'));
      if (!matches) {
        flash(t('flash.notFound', { query: q }));
        text.focus();
        return;
      }
      text.focus();
      text.select();
      const replaced = text.value.replace(new RegExp(escaped, 'gi'), () => r);
      if (!document.execCommand('insertText', false, replaced)) text.value = replaced;
      flash(t('flash.replaced', { count: matches.length, number: num.format(matches.length) }));
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
      insertText(new Intl.DateTimeFormat(t.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date()));
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
    languages: ['en'],
    icon: 'notepad',
    colors: ['#38bdf8', '#2563eb'],
    width: 720,
    height: 500,
    fileTypes: ['*'],
    launch,
  });
})();
