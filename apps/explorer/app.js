/* AwanOS — File Explorer */
(function () {
  'use strict';
  const OS = window.OS;
  const t = OS.i18n.forApp('explorer');
  const { h, escapeHtml, formatBytes, formatDate, extname } = OS.utils;
  const { glyph } = OS.icons;
  const vfs = OS.vfs;
  const ops = OS.fileOps;
  const DRAG_TYPE = ops.DRAG_TYPE;

  // Labels come from the dictionary (places.<key>).
  const PLACES = [
    { key: 'home', path: vfs.HOME, icon: 'home' },
    { key: 'desktop', path: `${vfs.HOME}/Desktop`, icon: 'monitor' },
    { key: 'documents', path: `${vfs.HOME}/Documents`, icon: 'fileText' },
    { key: 'pictures', path: `${vfs.HOME}/Pictures`, icon: 'image' },
    { key: 'music', path: `${vfs.HOME}/Music`, icon: 'music' },
    { key: 'downloads', path: `${vfs.HOME}/Downloads`, icon: 'downloadFolder' },
    null,
    { key: 'root', path: '/', icon: 'hardDrive' },
  ];

  const placeName = (path) => {
    const p = PLACES.find((pl) => pl && pl.path === path);
    return p ? t(`places.${p.key}`) : vfs.basename(path);
  };

  function launch(win, args) {
    let cwd = vfs.HOME;
    let history = [];
    let hIndex = -1;
    let view = 'grid';
    let filter = '';
    const selection = new Set();
    let anchor = null; // for shift-click ranges
    let items = []; // [{ entry, el }]

    const btn = (icon, title, onclick) => h('button', { class: 'icon-btn', title, 'aria-label': title, html: glyph(icon), onclick });
    const backBtn = btn('back', t('toolbar.back'), () => goHistory(-1));
    const fwdBtn = btn('forward', t('toolbar.forward'), () => goHistory(1));
    const upBtn = btn('up', t('toolbar.up'), () => navigate(vfs.dirname(cwd)));
    const address = h('input', { class: 'input fx-address', spellcheck: false, 'aria-label': t('toolbar.address') });
    const search = h('input', { class: 'input fx-search', type: 'search', placeholder: t('toolbar.search'), spellcheck: false });
    const viewBtn = btn('list', t('toolbar.changeView'), () => { view = view === 'grid' ? 'list' : 'grid'; render(); });
    const content = h('div', { class: 'fx-content drop-zone', tabindex: '0' });
    const status = h('div', { class: 'statusbar' });
    const sidebar = h('nav', { class: 'fx-sidebar' });

    PLACES.forEach((place) => {
      if (!place) {
        sidebar.appendChild(h('div', { class: 'fx-sep' }));
        return;
      }
      const el = h('button', { class: 'fx-place', html: `${glyph(place.icon)}<span>${escapeHtml(t(`places.${place.key}`))}</span>`, onclick: () => navigate(place.path) });
      el.dataset.path = place.path;
      acceptInternalDrop(el, () => place.path);
      sidebar.appendChild(el);
    });

    win.body.classList.add('explorer');
    win.body.append(
      h('div', { class: 'toolbar' },
        backBtn, fwdBtn, upBtn, btn('refresh', t('toolbar.refresh'), () => render()),
        address,
        search,
        h('div', { class: 'toolbar-sep' }),
        btn('folderPlus', t('toolbar.newFolder'), () => createAndRename(ops.newFolder)),
        btn('filePlus', t('toolbar.newTextFile'), () => createAndRename(ops.newTextFile)),
        btn('upload', t('toolbar.import'), () => ops.pickAndImport(cwd)),
        viewBtn),
      h('div', { class: 'fx-main' }, sidebar, content),
      status
    );

    function navigate(path, push = true) {
      path = vfs.resolve(path);
      if (!vfs.isDir(path)) {
        if (vfs.isFile(path)) OS.apps.openPath(path);
        else OS.ui.alert(t('dialogs.folderNotFound', { path }), { title: t('name'), icon: 'warning' });
        address.value = cwd;
        return;
      }
      if (push && path !== cwd) {
        history = history.slice(0, hIndex + 1);
        history.push(path);
        hIndex = history.length - 1;
      }
      cwd = path;
      selection.clear();
      anchor = null;
      filter = '';
      search.value = '';
      render();
    }

    function goHistory(delta) {
      const next = hIndex + delta;
      if (next < 0 || next >= history.length) return;
      hIndex = next;
      navigate(history[hIndex], false);
    }

    function entryIcon(entry) {
      let data = null;
      if (entry.type === 'file' && (extname(entry.name) === 'app' || OS.icons.fileKind(entry.name) === 'image')) {
        try { data = vfs.readFile(entry.path); } catch (_) { /* ignore */ }
      }
      return OS.icons.forEntry(entry, data);
    }

    function render() {
      if (!vfs.isDir(cwd)) {
        let p = cwd;
        while (p !== '/' && !vfs.isDir(p)) p = vfs.dirname(p);
        cwd = p;
      }
      win.setTitle(placeName(cwd));
      address.value = cwd;
      backBtn.disabled = hIndex <= 0;
      fwdBtn.disabled = hIndex >= history.length - 1;
      upBtn.disabled = cwd === '/';
      viewBtn.innerHTML = glyph(view === 'grid' ? 'list' : 'grid');
      sidebar.querySelectorAll('.fx-place').forEach((el) => el.classList.toggle('active', el.dataset.path === cwd));

      let entries = vfs.readdir(cwd);
      if (filter) entries = entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));
      for (const p of [...selection]) if (!entries.some((e) => e.path === p)) selection.delete(p);

      content.className = `fx-content drop-zone view-${view}`;
      content.innerHTML = '';
      if (view === 'list') {
        content.appendChild(h('div', { class: 'fx-row fx-head' },
          h('span', { text: t('columns.name') }), h('span', { text: t('columns.modified') }), h('span', { text: t('columns.type') }), h('span', { text: t('columns.size') })));
      }
      items = entries.map((entry) => {
        const cut = ops.clipboard.mode === 'cut' && ops.clipboard.paths.includes(entry.path);
        const name = escapeHtml(ops.displayName(entry.name));
        const el = h('div', {
          class: `fx-item${view === 'list' ? ' fx-row' : ''}${selection.has(entry.path) ? ' selected' : ''}${cut ? ' cut' : ''}`,
          draggable: 'true',
          title: ops.displayName(entry.name),
          html: view === 'grid'
            ? `<div class="fx-icon">${entryIcon(entry)}</div><div class="fx-name">${name}</div>`
            : `<span class="fx-cell-name"><span class="fx-icon">${entryIcon(entry)}</span><span class="fx-name">${name}</span></span>` +
              `<span>${escapeHtml(formatDate(entry.mtime, t.locale))}</span><span>${escapeHtml(ops.typeLabel(entry.name, entry.type))}</span>` +
              `<span>${entry.type === 'file' ? escapeHtml(formatBytes(entry.size, t.locale)) : ''}</span>`,
        });
        el.dataset.path = entry.path;
        if (entry.type === 'dir') acceptInternalDrop(el, () => entry.path);
        return { entry, el };
      });
      items.forEach(({ el }) => content.appendChild(el));
      if (!items.length) {
        content.appendChild(h('div', { class: 'fx-empty', html: `${glyph(filter ? 'search' : 'folder')}<span>${escapeHtml(t(filter ? 'empty.search' : 'empty.folder'))}</span>` }));
      }
      updateStatus();
    }

    function updateStatus() {
      const sel = [...selection];
      let text = t('status.items', { count: items.length });
      if (sel.length) {
        const size = sel.reduce((sum, p) => sum + ((vfs.stat(p) || {}).size || 0), 0);
        text += `  •  ${t('status.selected', { count: sel.length, size: formatBytes(size, t.locale) })}`;
      }
      status.textContent = text;
    }

    function setSelection(paths) {
      selection.clear();
      paths.forEach((p) => selection.add(p));
      items.forEach(({ entry, el }) => el.classList.toggle('selected', selection.has(entry.path)));
      updateStatus();
    }

    async function renameItem(path) {
      const item = items.find((i) => i.entry.path === path);
      if (!item) return;
      const label = item.el.querySelector('.fx-name');
      const isApp = extname(path) === 'app';
      item.el.draggable = false;
      const next = await OS.ui.inlineEdit(label, ops.displayName(item.entry.name), { selectStem: !isApp });
      item.el.draggable = true;
      if (!next) return;
      const newPath = ops.rename(path, next);
      if (newPath) setSelection([newPath]);
    }

    function createAndRename(create) {
      filter = '';
      search.value = '';
      const path = create(cwd);
      render();
      setSelection([path]);
      renameItem(path);
    }

    function acceptInternalDrop(el, getDest) {
      el.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drop-target');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
      el.addEventListener('drop', (e) => {
        el.classList.remove('drop-target');
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (!raw) return;
        e.preventDefault();
        e.stopPropagation();
        const dest = getDest();
        ops.moveInto(JSON.parse(raw).filter((p) => p !== dest), dest);
      });
    }

    /* Events -------------------------------------------------------- */

    address.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate(address.value.trim() || cwd);
      if (e.key === 'Escape') { address.value = cwd; content.focus(); }
    });
    search.addEventListener('input', () => {
      filter = search.value.trim();
      render();
    });

    content.addEventListener('click', (e) => {
      const el = e.target.closest('.fx-item');
      if (!el) {
        if (!e.ctrlKey && !e.metaKey) setSelection([]);
        return;
      }
      const path = el.dataset.path;
      if (e.shiftKey && anchor) {
        const paths = items.map((i) => i.entry.path);
        const [a, b] = [paths.indexOf(anchor), paths.indexOf(path)].sort((x, y) => x - y);
        setSelection(paths.slice(a, b + 1));
      } else if (e.ctrlKey || e.metaKey) {
        if (selection.has(path)) selection.delete(path);
        else selection.add(path);
        setSelection([...selection]);
        anchor = path;
      } else {
        setSelection([path]);
        anchor = path;
      }
    });
    content.addEventListener('dblclick', (e) => {
      const el = e.target.closest('.fx-item');
      if (!el) return;
      const path = el.dataset.path;
      if (vfs.isDir(path)) navigate(path);
      else OS.apps.openPath(path);
    });
    content.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const el = e.target.closest('.fx-item');
      if (el) {
        if (!selection.has(el.dataset.path)) setSelection([el.dataset.path]);
        OS.ui.contextMenu(e.clientX, e.clientY, ops.itemMenu([...selection], { onRename: renameItem }));
        return;
      }
      setSelection([]);
      OS.ui.contextMenu(e.clientX, e.clientY, [
        { label: t('menu.newFolder'), icon: 'folderPlus', action: () => createAndRename(ops.newFolder) },
        { label: t('menu.newTextFile'), icon: 'filePlus', action: () => createAndRename(ops.newTextFile) },
        { label: t('menu.paste'), icon: 'paste', shortcut: 'Ctrl+V', disabled: !ops.clipboard.paths.length, action: () => ops.paste(cwd) },
        { label: t('menu.import'), icon: 'upload', action: () => ops.pickAndImport(cwd) },
        '-',
        { label: t(view === 'grid' ? 'menu.listView' : 'menu.iconView'), icon: view === 'grid' ? 'list' : 'grid', action: () => { view = view === 'grid' ? 'list' : 'grid'; render(); } },
        { label: t('menu.refresh'), icon: 'refresh', action: render },
        { label: t('menu.openTerminal', { app: OS.apps.get('terminal').name }), icon: 'terminal', action: () => OS.wm.open('terminal', { cwd }) },
        '-',
        { label: t('menu.properties'), icon: 'info', action: () => ops.properties(cwd) },
      ]);
    });
    content.addEventListener('dragstart', (e) => {
      const el = e.target.closest('.fx-item');
      if (!el) return;
      if (!selection.has(el.dataset.path)) setSelection([el.dataset.path]);
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify([...selection]));
      e.dataTransfer.effectAllowed = 'move';
    });
    acceptInternalDrop(content, () => cwd);
    ops.acceptDrops(content, () => cwd);

    win.body.addEventListener('keydown', (e) => {
      if (e.target === address || e.target === search || e.target.closest('.inline-edit')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const sel = [...selection];
      const k = e.key.toLowerCase();
      if (e.key === 'Enter' && sel.length) {
        e.preventDefault();
        if (sel.length === 1 && vfs.isDir(sel[0])) navigate(sel[0]);
        else sel.forEach((p) => OS.apps.openPath(p));
      } else if (e.key === 'Delete' && sel.length) {
        e.preventDefault();
        ops.remove(sel);
      } else if (e.key === 'F2' && sel.length === 1) {
        e.preventDefault();
        renameItem(sel[0]);
      } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
        e.preventDefault();
        navigate(vfs.dirname(cwd));
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goHistory(-1);
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goHistory(1);
      } else if (ctrl && k === 'a') {
        e.preventDefault();
        setSelection(items.map((i) => i.entry.path));
      } else if (ctrl && k === 'c' && sel.length) {
        ops.setClipboard('copy', sel);
      } else if (ctrl && k === 'x' && sel.length) {
        ops.setClipboard('cut', sel);
      } else if (ctrl && k === 'v') {
        ops.paste(cwd);
      } else if (ctrl && k === 'f') {
        e.preventDefault();
        search.focus();
      }
    });

    const offFs = vfs.on('change', (paths) => {
      if (paths.some((p) => p === '/' || vfs.dirname(p) === cwd || p === cwd || cwd.startsWith(p + '/'))) render();
    });
    const offClip = ops.on('clipboard', render);
    win.on('close', () => { offFs(); offClip(); });
    win.on('focus', () => { if (!win.body.contains(document.activeElement)) content.focus({ preventScroll: true }); });

    win.dropPath = () => cwd;
    win.onArgs = (a) => { if (a && a.path) navigate(a.path); };
    navigate(args.path || vfs.HOME);
  }

  OS.apps.register({
    id: 'explorer',
    languages: ['en'],
    icon: 'folder',
    colors: ['#fbbf24', '#f59e0b'],
    width: 860,
    height: 540,
    minWidth: 420,
    minHeight: 280,
    launch,
  });
})();
