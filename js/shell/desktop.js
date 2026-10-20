/* AwanOS — desktop surface: icons, selection, drag & drop, context menu */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, escapeHtml, extname, debounce } = OS.utils;
  const vfs = OS.vfs;
  const ops = OS.fileOps;
  const t = OS.t;

  const DESKTOP = `${vfs.HOME}/Desktop`;
  const PAD = 8;
  // View ▸ Large / Medium / Small icons: icon size and grid cell size in pixels.
  const SIZES = {
    small: { icon: 32, cellW: 78, cellH: 74 },
    medium: { icon: 48, cellW: 92, cellH: 98 },
    large: { icon: 72, cellW: 116, cellH: 128 },
  };
  let CELL_W = SIZES.medium.cellW;
  let CELL_H = SIZES.medium.cellH;

  let root; // #desktop
  let container; // #desktop-icons
  let selBox;
  const elements = new Map(); // name -> element
  let layout = new Map(); // name -> [col, row]
  let entries = [];
  const selected = new Set();
  let grid = { cols: 1, rows: 1 };

  const pathOf = (name) => `${DESKTOP}/${name}`;

  function ensureDesktop() {
    if (!vfs.isDir(DESKTOP)) vfs.mkdir(DESKTOP, { recursive: true });
  }

  function applyView() {
    const size = SIZES[OS.settings.get('desktopIconSize')] ? OS.settings.get('desktopIconSize') : 'medium';
    CELL_W = SIZES[size].cellW;
    CELL_H = SIZES[size].cellH;
    container.classList.toggle('icons-small', size === 'small');
    container.classList.toggle('icons-large', size === 'large');
    container.style.setProperty('--cell-w', `${CELL_W}px`);
    container.style.setProperty('--icon', `${SIZES[size].icon}px`);
    container.classList.toggle('hidden-icons', OS.settings.get('showDesktopIcons') === false);
  }

  function computeLayout() {
    grid = {
      cols: Math.max(1, Math.floor((container.clientWidth - PAD) / CELL_W)),
      rows: Math.max(1, Math.floor((container.clientHeight - PAD) / CELL_H)),
    };
    const saved = OS.settings.get('desktopPositions') || {};
    const occupied = new Set();
    const result = new Map();
    for (const e of entries) {
      const p = saved[e.name];
      if (p && p[0] < grid.cols && p[1] < grid.rows && !occupied.has(`${p[0]},${p[1]}`)) {
        result.set(e.name, p);
        occupied.add(`${p[0]},${p[1]}`);
      }
    }
    let c = 0;
    let r = 0;
    for (const e of entries) {
      if (result.has(e.name)) continue;
      while (occupied.has(`${c},${r}`)) {
        r++;
        if (r >= grid.rows) { r = 0; c++; }
      }
      result.set(e.name, [c, r]);
      occupied.add(`${c},${r}`);
    }
    layout = result;
  }

  const cellToPx = ([c, r]) => ({ left: PAD + c * CELL_W, top: PAD + r * CELL_H });

  function render() {
    ensureDesktop();
    entries = vfs.readdir(DESKTOP);
    computeLayout();
    const names = new Set(entries.map((e) => e.name));
    for (const [name, el] of elements) {
      if (!names.has(name)) {
        el.remove();
        elements.delete(name);
        selected.delete(name);
      }
    }
    for (const entry of entries) {
      let el = elements.get(entry.name);
      if (!el) {
        el = h('div', { class: 'desk-icon', tabindex: '0', role: 'option' });
        el.dataset.name = entry.name;
        container.appendChild(el);
        elements.set(entry.name, el);
      }
      const ext = extname(entry.name);
      const content = entry.type === 'file' && (ext === 'app' || OS.icons.fileKind(entry.name) === 'image') ? vfs.readFile(entry.path) : null;
      const html = `<div class="icon">${OS.icons.forEntry(entry, content)}</div><div class="label">${escapeHtml(ops.displayName(entry.name))}</div>`;
      if (el._html !== html) {
        el.innerHTML = html;
        el._html = html;
      }
      el.dataset.type = entry.type;
      el.title = ops.displayName(entry.name);
      const pos = cellToPx(layout.get(entry.name));
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.classList.toggle('selected', selected.has(entry.name));
      el.setAttribute('aria-selected', selected.has(entry.name) ? 'true' : 'false');
      el.classList.toggle('cut', ops.clipboard.mode === 'cut' && ops.clipboard.paths.includes(entry.path));
    }
  }

  function setSelection(names) {
    selected.clear();
    names.forEach((n) => selected.add(n));
    for (const [name, el] of elements) {
      el.classList.toggle('selected', selected.has(name));
      el.setAttribute('aria-selected', selected.has(name) ? 'true' : 'false');
    }
  }

  const selectedPaths = () => [...selected].map(pathOf);

  function savePositions() {
    const positions = {};
    for (const [name, pos] of layout) positions[name] = pos;
    OS.settings.set('desktopPositions', positions);
  }

  /** Sort by ▸ — lay the icons out column by column in the chosen order. */
  function sortBy(key) {
    const collator = new Intl.Collator(OS.i18n.locale, { numeric: true, sensitivity: 'base' });
    const info = (e) => {
      const st = vfs.stat(e.path) || {};
      return { e, label: ops.displayName(e.name), size: st.size || 0, mtime: st.mtime || 0, type: e.type === 'dir' ? '' : ops.typeLabel(e.name) };
    };
    const items = vfs.readdir(DESKTOP).map(info);
    const byName = (a, b) => collator.compare(a.label, b.label);
    const compare = {
      name: byName,
      size: (a, b) => b.size - a.size || byName(a, b),
      type: (a, b) => collator.compare(a.type, b.type) || byName(a, b),
      date: (a, b) => b.mtime - a.mtime || byName(a, b),
    }[key];
    // Folders first, as in File Explorer.
    items.sort((a, b) => (a.e.type === 'dir' ? 0 : 1) - (b.e.type === 'dir' ? 0 : 1) || compare(a, b));
    const positions = {};
    items.forEach((item, i) => { positions[item.e.name] = [Math.floor(i / grid.rows), i % grid.rows]; });
    OS.settings.set('desktopPositions', positions);
    render();
  }

  async function renameItem(name) {
    const el = elements.get(name);
    if (!el) return;
    const isApp = extname(name) === 'app';
    const label = el.querySelector('.label');
    const current = ops.displayName(name);
    const next = await OS.ui.inlineEdit(label, current, { selectStem: !isApp });
    if (!next) return;
    // Read the cell first: renaming re-renders the desktop, which drops the old name from the layout.
    const pos = layout.get(name);
    const newPath = ops.rename(pathOf(name), next);
    if (newPath) {
      // Keep the icon in the same grid cell under its new name.
      const newName = vfs.basename(newPath);
      const positions = Object.assign({}, OS.settings.get('desktopPositions'));
      delete positions[name];
      if (pos) positions[newName] = pos;
      OS.settings.set('desktopPositions', positions);
      setSelection([newName]);
      render();
    }
  }

  function createAndRename(create) {
    const path = create(DESKTOP);
    const name = vfs.basename(path);
    render();
    setSelection([name]);
    renameItem(name);
  }

  /* Pointer interaction --------------------------------------------- */

  let lastTapOpen = 0;

  function onIconPointerDown(e, el) {
    const name = el.dataset.name;
    OS.wm.blurAll();
    if (e.button === 2) {
      if (!selected.has(name)) setSelection([name]);
      return;
    }
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey) {
      if (selected.has(name)) selected.delete(name);
      else selected.add(name);
      setSelection([...selected]);
      return;
    }
    if (!selected.has(name)) setSelection([name]);

    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { left: el.offsetLeft, top: el.offsetTop };
    let dragging = false;
    let dropTarget = null;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 6) return;
      if (!dragging) {
        dragging = true;
        setSelection([name]);
        el.classList.add('dragging');
      }
      el.style.left = `${origin.left + dx}px`;
      el.style.top = `${origin.top + dy}px`;
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const icon = under && under.closest('.desk-icon');
      const target = icon && icon !== el && icon.dataset.type === 'dir' ? icon : null;
      if (dropTarget !== target) {
        if (dropTarget) dropTarget.classList.remove('drop-target');
        dropTarget = target;
        if (dropTarget) dropTarget.classList.add('drop-target');
      }
    };

    const onUp = (ev) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.classList.remove('dragging');
      if (dropTarget) dropTarget.classList.remove('drop-target');
      if (!dragging) {
        if (ev.pointerType === 'touch' && ev.type === 'pointerup') {
          lastTapOpen = Date.now();
          OS.apps.openPath(pathOf(name));
        }
        return;
      }
      const src = pathOf(name);
      if (dropTarget) {
        ops.moveInto([src], pathOf(dropTarget.dataset.name));
        return;
      }
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const winEl = under && under.closest('.window');
      const win = winEl && OS.wm.get(winEl.id);
      if (win && win.dropPath) {
        ops.moveInto([src], win.dropPath());
        render();
        return;
      }
      // Drop onto a grid cell; swap with whatever is already there.
      const rect = container.getBoundingClientRect();
      const col = Math.max(0, Math.min(grid.cols - 1, Math.floor((ev.clientX - rect.left - PAD) / CELL_W)));
      const row = Math.max(0, Math.min(grid.rows - 1, Math.floor((ev.clientY - rect.top - PAD) / CELL_H)));
      const from = layout.get(name);
      for (const [other, pos] of layout) {
        if (other !== name && pos[0] === col && pos[1] === row) layout.set(other, from);
      }
      layout.set(name, [col, row]);
      savePositions();
      render();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  function onBackgroundPointerDown(e) {
    if (e.button !== 0) return;
    OS.wm.blurAll();
    container.focus({ preventScroll: true });
    const additive = e.ctrlKey || e.metaKey;
    const base = additive ? new Set(selected) : new Set();
    if (!additive) setSelection([]);
    const rect = container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    container.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const box = { left: Math.min(sx, x), top: Math.min(sy, y), right: Math.max(sx, x), bottom: Math.max(sy, y) };
      if (box.right - box.left < 3 && box.bottom - box.top < 3) return;
      selBox.hidden = false;
      Object.assign(selBox.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
      const hit = new Set(base);
      for (const [name, el] of elements) {
        const left = el.offsetLeft;
        const top = el.offsetTop;
        if (left < box.right && left + el.offsetWidth > box.left && top < box.bottom && top + el.offsetHeight > box.top) hit.add(name);
      }
      setSelection([...hit]);
    };
    const onUp = () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      selBox.hidden = true;
    };
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
  }

  /* Menus ------------------------------------------------------------ */

  function desktopMenu(x, y) {
    const size = OS.settings.get('desktopIconSize');
    const setSize = (v) => OS.settings.set('desktopIconSize', v);
    OS.ui.contextMenu(x, y, [
      {
        label: t('desktop.view'), icon: 'grid',
        submenu: [
          { label: t('desktop.largeIcons'), checked: size === 'large', action: () => setSize('large') },
          { label: t('desktop.mediumIcons'), checked: size === 'medium', action: () => setSize('medium') },
          { label: t('desktop.smallIcons'), checked: size === 'small', action: () => setSize('small') },
          '-',
          { label: t('desktop.showIcons'), checked: OS.settings.get('showDesktopIcons') !== false, action: () => OS.settings.set('showDesktopIcons', OS.settings.get('showDesktopIcons') === false) },
        ],
      },
      {
        label: t('desktop.sortBy'), icon: 'sort',
        submenu: ['name', 'size', 'type', 'date'].map((key) => ({ label: t(`desktop.sort.${key}`), action: () => sortBy(key) })),
      },
      { label: t('desktop.refresh'), icon: 'refresh', action: refresh },
      '-',
      { label: t('desktop.paste'), icon: 'paste', shortcut: 'Ctrl+V', disabled: !ops.clipboard.paths.length, action: () => ops.paste(DESKTOP) },
      {
        label: t('desktop.new'), icon: 'plus',
        submenu: [
          { label: t('desktop.newFolder'), icon: 'folder', action: () => createAndRename(ops.newFolder) },
          '-',
          { label: t('desktop.newTextFile'), icon: 'fileText', action: () => createAndRename(ops.newTextFile) },
        ],
      },
      { label: t('desktop.import'), icon: 'upload', action: () => ops.pickAndImport(DESKTOP) },
      '-',
      { label: t('desktop.display'), icon: 'monitor', action: () => OS.wm.open('settings', { section: 'system' }) },
      { label: t('desktop.personalize'), icon: 'palette', action: () => OS.wm.open('settings', { section: 'personalization' }) },
      '-',
      { label: t('desktop.openInApp', { app: OS.apps.get('explorer').name }), iconHtml: OS.icons.appIcon(OS.apps.get('explorer'), 'xs'), action: () => OS.wm.open('explorer', { path: DESKTOP }) },
      { label: t('desktop.openInApp', { app: OS.apps.get('terminal').name }), iconHtml: OS.icons.appIcon(OS.apps.get('terminal'), 'xs'), action: () => OS.wm.open('terminal', { cwd: DESKTOP }) },
    ]);
  }

  function refresh() {
    container.style.opacity = '0';
    setTimeout(() => {
      render();
      container.style.opacity = '';
    }, 120);
  }

  /* Keyboard -------------------------------------------------------- */

  function onKeyDown(e) {
    if (e.target.closest('.inline-edit')) return;
    const paths = selectedPaths();
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && paths.length) {
      e.preventDefault();
      paths.forEach((p) => OS.apps.openPath(p));
    } else if (e.key === 'Delete' && paths.length) {
      e.preventDefault();
      ops.remove(paths);
    } else if (e.key === 'F2' && paths.length === 1) {
      e.preventDefault();
      renameItem(vfs.basename(paths[0]));
    } else if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelection([...elements.keys()]);
    } else if (ctrl && e.key.toLowerCase() === 'c' && paths.length) {
      ops.setClipboard('copy', paths);
    } else if (ctrl && e.key.toLowerCase() === 'x' && paths.length) {
      ops.setClipboard('cut', paths);
    } else if (ctrl && e.key.toLowerCase() === 'v') {
      ops.paste(DESKTOP);
    }
  }

  /* Init ------------------------------------------------------------ */

  function init() {
    root = document.getElementById('desktop');
    container = document.getElementById('desktop-icons');
    selBox = document.getElementById('selection-box');
    container.tabIndex = -1;
    container.style.transition = 'opacity .12s';

    container.addEventListener('pointerdown', (e) => {
      const icon = e.target.closest('.desk-icon');
      if (icon) onIconPointerDown(e, icon);
      else onBackgroundPointerDown(e);
    });
    container.addEventListener('dblclick', (e) => {
      const icon = e.target.closest('.desk-icon');
      if (icon && Date.now() - lastTapOpen > 600) OS.apps.openPath(pathOf(icon.dataset.name));
    });
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const icon = e.target.closest('.desk-icon');
      if (icon) {
        const name = icon.dataset.name;
        if (!selected.has(name)) setSelection([name]);
        OS.ui.contextMenu(e.clientX, e.clientY, ops.itemMenu(selectedPaths(), { onRename: (p) => renameItem(vfs.basename(p)) }));
      } else {
        desktopMenu(e.clientX, e.clientY);
      }
    });
    container.addEventListener('keydown', onKeyDown);
    ops.acceptDrops(root, () => DESKTOP);
    // Items dragged out of a File Explorer window.
    root.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(ops.DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    root.addEventListener('drop', (e) => {
      const raw = e.dataTransfer.getData(ops.DRAG_TYPE);
      if (!raw) return;
      e.preventDefault();
      const icon = e.target.closest('.desk-icon');
      const dest = icon && icon.dataset.type === 'dir' ? pathOf(icon.dataset.name) : DESKTOP;
      ops.moveInto(JSON.parse(raw).filter((p) => p !== dest), dest);
    });

    vfs.on('change', (paths) => {
      if (paths.some((p) => p === '/' || p.startsWith(DESKTOP) || DESKTOP.startsWith(p + '/'))) render();
    });
    ops.on('clipboard', render);
    OS.settings.on('change', (key) => {
      if (key === 'desktopIconSize' || key === 'showDesktopIcons') {
        applyView();
        render();
      }
    });
    window.addEventListener('resize', debounce(render, 120));
    applyView();
    render();
  }

  OS.desktop = { init, render, DESKTOP };
})();
