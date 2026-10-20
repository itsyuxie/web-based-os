/* AwanOS — Notepad: tabs in the title bar, menu bar, floating find bar and a settings page */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, escapeHtml } = OS.utils;
  const { glyph } = OS.icons;
  const t = OS.i18n.forApp('notepad');
  const vfs = OS.vfs;

  // Extra glyphs, drawn on the same 24×24 grid as OS.icons.
  const svg = (body) => `<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICON = {
    arrowUp: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    arrowDown: svg('<path d="M12 5v14M5 12l7 7 7-7"/>'),
    arrowLeft: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  };

  const DEFAULTS = { theme: 'system', mono: true, size: 14, wrap: true, statusBar: true, openIn: 'tab' };
  const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48];
  const ZOOM = { min: 10, max: 500, step: 10 };

  const prefs = Object.assign({}, DEFAULTS, OS.storage.read('notepad', {}));
  // Older versions zoomed by changing the stored size; snap it to a size the settings page offers.
  const nearestSize = (n) => FONT_SIZES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  prefs.size = nearestSize(Number(prefs.size) || DEFAULTS.size);

  // Open Notepad windows (win -> api), so a file can open as a tab of an existing window.
  const instances = new Map();

  function savePrefs() {
    OS.storage.write('notepad', prefs);
    instances.forEach((api) => api.applyPrefs());
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Show the file in a window that already has it open, or (by preference) as a tab of the newest window. */
  function handOver(win, path) {
    const resolved = vfs.resolve(path);
    const others = OS.wm.byApp('notepad').filter((w) => w !== win && instances.has(w));
    const owner = others.find((w) => instances.get(w).hasPath(resolved)) || (prefs.openIn === 'tab' ? others[others.length - 1] : null);
    if (!owner) return false;
    win.close(true);
    owner.focus();
    instances.get(owner).openPath(resolved);
    return true;
  }

  function launch(win, args) {
    if (args.path && handOver(win, args.path)) return;

    const num = new Intl.NumberFormat(t.locale);
    const tabs = [];
    let active = null;
    let seq = 0;
    let zoom = 100;
    let settings = null;
    let lastTitle = '';
    let flashTimer = null;
    let findRaf = 0;
    const find = { open: false, replace: false, query: '', matchCase: false, wrap: true, matches: [], index: -1 };

    /* Title bar: tabs ---------------------------------------------------- */

    const tabList = h('div', { class: 'np-tablist', role: 'tablist', 'aria-label': t('tabs.label') });
    const addBtn = h('button', { class: 'np-add', title: t('tabs.newTip'), 'aria-label': t('tabs.new'), html: glyph('plus'), onclick: () => newTab() });
    win.setTitlebarContent(h('div', { class: 'np-strip' }, tabList, addBtn));
    tabList.addEventListener('wheel', (e) => {
      if (!e.deltaY || tabList.scrollWidth <= tabList.clientWidth) return;
      e.preventDefault();
      tabList.scrollLeft += e.deltaY;
    }, { passive: false });
    tabList.addEventListener('keydown', onTabKey);

    /* Menu bar ----------------------------------------------------------- */

    let openMenuBtn = null;
    let menuClosed = { btn: null, at: 0 };
    let menuObserver = null;

    // Menus follow the app theme too; submenus are added to the popup layer while the menu is open.
    function themeMenu(el) {
      const theme = prefs.theme === 'system' ? null : prefs.theme;
      if (menuObserver) menuObserver.disconnect();
      menuObserver = null;
      if (!theme || !el || !el.parentNode) return;
      el.dataset.npTheme = theme;
      menuObserver = new window.MutationObserver((records) => {
        records.forEach((r) => r.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.classList.contains('menu')) n.dataset.npTheme = theme;
        }));
      });
      menuObserver.observe(el.parentNode, { childList: true });
    }

    // Menu commands act on the editor, so it gets the focus back first.
    const withFocus = (items) => items.map((item) => (item && typeof item === 'object' && (item.action || item.submenu)
      ? { ...item, action: item.action && (() => { restoreFocus(); item.action(); }), submenu: item.submenu && withFocus(item.submenu) }
      : item));

    function popupMenu(x, y, items, opts = {}) {
      const el = OS.ui.contextMenu(x, y, withFocus(items), {
        ...opts,
        onClose: () => {
          if (menuObserver) menuObserver.disconnect();
          menuObserver = null;
          if (opts.onClose) opts.onClose();
          // Closed with Escape: don't leave the focus on the page body.
          setTimeout(() => { if (document.activeElement === document.body && OS.wm.active() === win) restoreFocus(); }, 0);
        },
      });
      themeMenu(el);
      return el;
    }

    function openMenu(btn, items) {
      const r = btn.getBoundingClientRect();
      popupMenu(r.left, r.bottom + 4, items(), {
        onClose: () => {
          btn.setAttribute('aria-expanded', 'false');
          if (openMenuBtn === btn) openMenuBtn = null;
          menuClosed = { btn, at: Date.now() };
        },
      });
      openMenuBtn = btn;
      btn.setAttribute('aria-expanded', 'true');
    }

    const menuBtn = (label, items) => {
      const btn = h('button', { class: 'menubar-item', text: label, 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
      btn.addEventListener('click', () => {
        // The press that closed this menu should not open it again.
        if (menuClosed.btn === btn && Date.now() - menuClosed.at < 300) return;
        openMenu(btn, items);
      });
      btn.addEventListener('pointerenter', () => { if (openMenuBtn && openMenuBtn !== btn) openMenu(btn, items); });
      return btn;
    };

    const hasSelection = () => active.area.selectionEnd > active.area.selectionStart;

    const fileMenu = () => [
      { label: t('menu.file.newTab'), shortcut: 'Ctrl+N', action: () => newTab() },
      { label: t('menu.file.newWindow'), shortcut: 'Ctrl+Shift+N', action: () => OS.wm.open('notepad') },
      { label: t('menu.file.open'), shortcut: 'Ctrl+O', action: openDoc },
      '-',
      { label: t('menu.file.save'), shortcut: 'Ctrl+S', action: () => save(active) },
      { label: t('menu.file.saveAs'), shortcut: 'Ctrl+Shift+S', action: () => saveAs(active) },
      { label: t('menu.file.saveAll'), shortcut: 'Ctrl+Alt+S', action: saveAll },
      '-',
      { label: t('menu.file.download'), icon: 'download', action: downloadDoc },
      '-',
      { label: t('menu.file.closeTab'), shortcut: 'Ctrl+W', action: () => closeTab(active) },
      { label: t('menu.file.closeWindow'), shortcut: 'Ctrl+Shift+W', action: () => win.close() },
    ];

    const editMenu = () => [
      { label: t('menu.edit.undo'), shortcut: 'Ctrl+Z', action: () => command('undo') },
      { label: t('menu.edit.redo'), shortcut: 'Ctrl+Y', action: () => command('redo') },
      '-',
      { label: t('menu.edit.cut'), shortcut: 'Ctrl+X', disabled: !hasSelection(), action: () => copySelection(true) },
      { label: t('menu.edit.copy'), shortcut: 'Ctrl+C', disabled: !hasSelection(), action: () => copySelection(false) },
      { label: t('menu.edit.paste'), shortcut: 'Ctrl+V', action: paste },
      { label: t('menu.edit.delete'), shortcut: 'Del', disabled: !hasSelection(), action: () => command('delete') },
      '-',
      { label: t('menu.edit.find'), shortcut: 'Ctrl+F', action: () => openFind(false) },
      { label: t('menu.edit.findNext'), shortcut: 'F3', disabled: !find.query, action: () => findStep(1) },
      { label: t('menu.edit.findPrevious'), shortcut: 'Shift+F3', disabled: !find.query, action: () => findStep(-1) },
      { label: t('menu.edit.replace'), shortcut: 'Ctrl+H', action: () => openFind(true) },
      { label: t('menu.edit.goTo'), shortcut: 'Ctrl+G', action: goTo },
      '-',
      { label: t('menu.edit.selectAll'), shortcut: 'Ctrl+A', action: selectAll },
      { label: t('menu.edit.timeDate'), shortcut: 'F5', action: insertDate },
    ];

    const viewMenu = () => [
      {
        label: t('menu.view.zoom'),
        submenu: [
          { label: t('menu.view.zoomIn'), shortcut: 'Ctrl+Plus', disabled: zoom >= ZOOM.max, action: () => setZoom(zoom + ZOOM.step) },
          { label: t('menu.view.zoomOut'), shortcut: 'Ctrl+Minus', disabled: zoom <= ZOOM.min, action: () => setZoom(zoom - ZOOM.step) },
          { label: t('menu.view.resetZoom'), shortcut: 'Ctrl+0', action: () => setZoom(100) },
        ],
      },
      { label: t('menu.view.statusBar'), checked: prefs.statusBar, action: () => { prefs.statusBar = !prefs.statusBar; savePrefs(); } },
      { label: t('menu.view.wordWrap'), checked: prefs.wrap, action: () => { prefs.wrap = !prefs.wrap; savePrefs(); } },
    ];

    const gearBtn = h('button', { class: 'icon-btn np-gear', title: t('settings.title'), 'aria-label': t('settings.title'), html: glyph('settings'), onclick: () => openSettings() });
    const menubar = h('div', { class: 'np-menubar' },
      menuBtn(t('menu.file.title'), fileMenu),
      menuBtn(t('menu.edit.title'), editMenu),
      menuBtn(t('menu.view.title'), viewMenu),
      h('span', { class: 'spacer' }),
      gearBtn);

    /* Find bar ----------------------------------------------------------- */

    const iconBtn = (html, label, onclick) => h('button', { class: 'icon-btn', title: label, 'aria-label': label, html, onclick });
    const findInput = h('input', { class: 'input', type: 'text', spellcheck: false, autocomplete: 'off', placeholder: t('find.placeholder'), 'aria-label': t('find.placeholder') });
    const findCount = h('span', { class: 'np-find-count', 'aria-live': 'polite' });
    const replaceInput = h('input', { class: 'input', type: 'text', spellcheck: false, autocomplete: 'off', placeholder: t('find.replacePlaceholder'), 'aria-label': t('find.replacePlaceholder') });
    const toggleBtn = iconBtn(glyph('chevronRight'), t('find.toggleReplace'), () => {
      setReplaceRow(!find.replace);
      (find.replace ? replaceInput : findInput).focus();
    });
    toggleBtn.classList.add('np-find-toggle');
    toggleBtn.setAttribute('aria-expanded', 'false');
    const optionsBtn = iconBtn(glyph('sliders'), t('find.options'), () => {
      const r = optionsBtn.getBoundingClientRect();
      popupMenu(r.right, r.bottom + 4, [
        { label: t('find.matchCase'), checked: find.matchCase, action: () => { find.matchCase = !find.matchCase; refreshFind(); selectCurrent(); findInput.focus(); } },
        { label: t('find.wrapAround'), checked: find.wrap, action: () => { find.wrap = !find.wrap; findInput.focus(); } },
      ], { alignRight: true });
    });
    const findBar = h('div', { class: 'np-find', role: 'search', hidden: true },
      h('div', { class: 'np-find-row' },
        toggleBtn,
        h('div', { class: 'np-find-field' }, findInput, findCount),
        iconBtn(ICON.arrowUp, t('find.previous'), () => findStep(-1)),
        iconBtn(ICON.arrowDown, t('find.next'), () => findStep(1)),
        optionsBtn,
        iconBtn(glyph('close'), t('find.close'), () => closeFind())),
      h('div', { class: 'np-find-row np-replace-row' },
        replaceInput,
        h('button', { class: 'btn', text: t('find.replace'), onclick: replaceOne }),
        h('button', { class: 'btn', text: t('find.replaceAll'), onclick: replaceAll })));

    findInput.addEventListener('input', () => {
      find.query = findInput.value;
      refreshFind(active.area.selectionStart);
      selectCurrent();
    });
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        findStep(e.shiftKey ? -1 : 1);
      }
    });
    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) replaceAll(); else replaceOne();
      }
    });

    /* Editor and status bar -------------------------------------------- */

    const editor = h('div', { class: 'np-editor' }, findBar);
    const posEl = h('span', { class: 'np-stat' });
    const charsEl = h('span', { class: 'np-stat' });
    const flashEl = h('span', { class: 'np-flash', 'aria-live': 'polite' });
    const zoomEl = h('span', { class: 'np-stat' });
    const eolEl = h('span', { class: 'np-stat np-eol' });
    const status = h('div', { class: 'np-status' },
      posEl, charsEl, flashEl, h('span', { class: 'spacer' }),
      zoomEl, eolEl, h('span', { class: 'np-stat np-enc', text: t('status.encoding') }));
    const main = h('div', { class: 'np-main' }, menubar, editor, status);
    win.body.classList.add('notepad', 'mica');
    win.body.append(main);

    editor.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom(zoom + (e.deltaY < 0 ? ZOOM.step : -ZOOM.step));
    }, { passive: false });
    // Text files dropped from the computer open in new tabs.
    editor.addEventListener('dragover', (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    editor.addEventListener('drop', async (e) => {
      const files = e.dataTransfer ? [...e.dataTransfer.files] : [];
      if (!files.length) return;
      e.preventDefault();
      for (const file of files) {
        try {
          const text = await OS.utils.readFile(file);
          showDoc({ name: file.name, text, eol: /\r\n/.test(text) ? 'crlf' : 'lf', saved: '' });
        } catch (err) {
          OS.ui.showError(err, t('errors.open'));
        }
      }
    });

    /* Tabs --------------------------------------------------------------- */

    const tabName = (tab) => (tab.path ? vfs.basename(tab.path) : tab.name || t('untitled'));
    const isDirty = (tab) => tab.area.value !== tab.saved;
    const isPristine = (tab) => !tab.path && !tab.name && !tab.area.value;

    function createTab({ path = null, name = null, text = '', eol = 'lf', saved = null } = {}) {
      const id = `${win.id}-tab-${++seq}`;
      const area = h('textarea', { class: 'np-text np-type', spellcheck: false, autocomplete: 'off', 'aria-label': t('textLabel') });
      const hl = h('div', { class: 'np-hl np-type', 'aria-hidden': 'true' });
      const doc = h('div', { class: 'np-doc', id: `${id}-panel`, role: 'tabpanel', 'aria-labelledby': id, hidden: true }, hl, area);
      area.value = text;
      area.wrap = prefs.wrap ? 'soft' : 'off';
      const label = h('span', { class: 'np-tab-label' });
      const closeBtn = h('button', {
        class: 'np-tab-close',
        tabindex: '-1',
        title: t('tabs.close'),
        'aria-label': t('tabs.close'),
        html: `${glyph('close')}<span class="np-dot"></span>`,
      });
      const el = h('div', { class: 'np-tab', id, role: 'tab', tabindex: '-1', 'aria-selected': 'false', 'aria-controls': doc.id }, label, closeBtn);
      // The textarea normalises line breaks, so compare against its own copy of the text.
      const tab = { id, path, name, eol, area, hl, doc, el, label, saved: saved == null ? area.value : saved, scroll: [0, 0] };

      el.addEventListener('mousedown', (e) => e.preventDefault()); // keep the focus in the editor
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.np-tab-close')) return;
        activate(tab);
        dragTab(tab, e);
      });
      el.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(tab); });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tabMenu(tab, e.clientX, e.clientY);
      });
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab);
      });

      area.addEventListener('input', () => onEdit(tab));
      ['keyup', 'click', 'select', 'focus'].forEach((ev) => area.addEventListener(ev, updateStatus));
      area.addEventListener('scroll', () => syncScroll(tab));
      area.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          insertText('\t');
        }
      });

      tabList.appendChild(el);
      editor.insertBefore(doc, findBar);
      tabs.push(tab);
      renderTab(tab);
      return tab;
    }

    function renderTab(tab) {
      const name = tabName(tab);
      const dirty = isDirty(tab);
      tab.label.textContent = name;
      tab.el.title = tab.path ? tab.path.replace(vfs.HOME, '~') : name;
      tab.el.classList.toggle('dirty', dirty);
      tab.el.setAttribute('aria-label', dirty ? t('tabs.unsaved', { file: name }) : name);
    }

    function activate(tab, focus = true) {
      if (!tab) return;
      closeSettings(false);
      if (active && active !== tab) {
        active.scroll = [active.area.scrollTop, active.area.scrollLeft];
        active.hl.textContent = '';
        active.doc.hidden = true;
        active.el.classList.remove('active');
        active.el.setAttribute('aria-selected', 'false');
        active.el.tabIndex = -1;
      }
      const switched = active !== tab;
      active = tab;
      tab.doc.hidden = false;
      tab.el.classList.add('active');
      tab.el.setAttribute('aria-selected', 'true');
      tab.el.tabIndex = 0;
      if (switched) [tab.area.scrollTop, tab.area.scrollLeft] = tab.scroll;
      win.filePath = tab.path;
      revealTab(tab);
      updateTitle();
      updateStatus();
      if (find.open) refreshFind();
      if (focus) tab.area.focus({ preventScroll: true });
    }

    function revealTab(tab) {
      const left = tab.el.offsetLeft;
      const right = left + tab.el.offsetWidth;
      if (left < tabList.scrollLeft + 8) tabList.scrollLeft = left - 8;
      else if (right > tabList.scrollLeft + tabList.clientWidth - 8) tabList.scrollLeft = right - tabList.clientWidth + 8;
    }

    function newTab(data) {
      const tab = createTab(data);
      activate(tab);
      return tab;
    }

    /** Show document data in the current tab when it is empty and untouched, else in a new tab. */
    function showDoc(data) {
      if (!active || !isPristine(active)) return newTab(data);
      const tab = active;
      Object.assign(tab, { path: data.path || null, name: data.name || null, eol: data.eol || 'lf' });
      tab.area.value = data.text || '';
      tab.saved = data.saved == null ? tab.area.value : data.saved;
      tab.area.setSelectionRange(0, 0);
      tab.area.scrollTop = 0;
      renderTab(tab);
      activate(tab);
      return tab;
    }

    async function closeTab(tab) {
      if (!tab || !tabs.includes(tab)) return false;
      if (isDirty(tab)) {
        activate(tab, false);
        if (!(await confirmDiscard(tab))) return false;
        if (!tabs.includes(tab)) return true;
      }
      // Closing the last tab closes the window, as in Windows 11.
      if (tabs.length === 1) {
        tab.saved = tab.area.value;
        win.close(true);
        return true;
      }
      const idx = tabs.indexOf(tab);
      tabs.splice(idx, 1);
      tab.el.remove();
      tab.doc.remove();
      if (active === tab) {
        active = null;
        activate(tabs[Math.min(idx, tabs.length - 1)]);
      }
      return true;
    }

    async function closeMany(list) {
      for (const tab of list) {
        if (!(await closeTab(tab))) return;
      }
    }

    function tabMenu(tab, x, y) {
      const idx = tabs.indexOf(tab);
      popupMenu(x, y, [
        { label: t('tabs.close'), shortcut: 'Ctrl+W', action: () => closeTab(tab) },
        { label: t('tabs.closeOthers'), disabled: tabs.length < 2, action: () => closeMany(tabs.filter((x2) => x2 !== tab)) },
        { label: t('tabs.closeRight'), disabled: idx === tabs.length - 1, action: () => closeMany(tabs.slice(idx + 1)) },
      ]);
    }

    function cycleTabs(dir) {
      if (tabs.length < 2) return;
      activate(tabs[(tabs.indexOf(active) + dir + tabs.length) % tabs.length]);
    }

    function onTabKey(e) {
      const tab = tabs.find((x) => x.el === e.target);
      if (!tab) return;
      const idx = tabs.indexOf(tab);
      let next = null;
      if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      else if (e.key === 'Delete') closeTab(tab);
      else if (e.key === 'Enter' || e.key === ' ') activate(tab);
      else return;
      e.preventDefault();
      if (next) {
        activate(next, false);
        next.el.focus();
      }
    }

    // Drag a tab sideways to reorder it.
    function dragTab(tab, e) {
      const el = tab.el;
      const startX = e.clientX;
      let dragging = false;
      el.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (!dragging && Math.abs(ev.clientX - startX) < 6) return;
        dragging = true;
        el.classList.add('dragging');
        const before = tabs.find((x) => {
          if (x === tab) return false;
          const r = x.el.getBoundingClientRect();
          return ev.clientX < r.left + r.width / 2;
        });
        const ref = before ? before.el : null;
        if (el.nextSibling !== ref && ref !== el) {
          tabList.insertBefore(el, ref);
          const order = [...tabList.children];
          tabs.sort((a, b) => order.indexOf(a.el) - order.indexOf(b.el));
        }
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        el.classList.remove('dragging');
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }

    /* Status and title --------------------------------------------------- */

    function updateTitle() {
      if (!active) return;
      const name = isSettingsOpen() ? t('settings.title') : tabName(active);
      const title = `${!isSettingsOpen() && isDirty(active) ? '*' : ''}${t('windowTitle', { file: name })}`;
      if (title !== lastTitle) win.setTitle(title);
      lastTitle = title;
    }

    function updateStatus() {
      if (!active) return;
      const a = active.area;
      const v = a.value;
      const before = v.slice(0, a.selectionStart);
      let line = 1;
      for (let i = before.indexOf('\n'); i >= 0; i = before.indexOf('\n', i + 1)) line++;
      const column = before.length - before.lastIndexOf('\n');
      posEl.textContent = t('status.position', { line: num.format(line), column: num.format(column) });
      const selected = a.selectionEnd - a.selectionStart;
      charsEl.textContent = selected
        ? t('status.selection', { count: v.length, selected: num.format(selected), number: num.format(v.length) })
        : t('status.characters', { count: v.length, number: num.format(v.length) });
      zoomEl.textContent = t('status.zoom', { value: num.format(zoom) });
      eolEl.textContent = t(active.eol === 'crlf' ? 'status.crlf' : 'status.lf');
    }

    const onSelectionChange = () => {
      if (active && document.activeElement === active.area) updateStatus();
    };
    document.addEventListener('selectionchange', onSelectionChange);

    function flash(msg) {
      flashEl.textContent = msg;
      flashEl.classList.add('show');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => flashEl.classList.remove('show'), 2000);
    }

    function onEdit(tab) {
      renderTab(tab);
      if (tab !== active) return;
      updateTitle();
      updateStatus();
      if (find.open) {
        cancelAnimationFrame(findRaf);
        findRaf = requestAnimationFrame(() => { if (find.open) refreshFind(); });
      }
    }

    /* Preferences --------------------------------------------------------- */

    function applyPrefs() {
      editor.style.setProperty('--np-size', `${(prefs.size * zoom) / 100}px`);
      editor.classList.toggle('mono', !!prefs.mono);
      editor.classList.toggle('nowrap', !prefs.wrap);
      tabs.forEach((tab) => { tab.area.wrap = prefs.wrap ? 'soft' : 'off'; });
      status.hidden = !prefs.statusBar;
      if (prefs.theme === 'light' || prefs.theme === 'dark') win.el.dataset.npTheme = prefs.theme;
      else delete win.el.dataset.npTheme;
      if (settings) settings.sync();
      if (find.open) renderHighlights();
      updateStatus();
    }

    function setZoom(value) {
      zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(value / ZOOM.step) * ZOOM.step));
      applyPrefs();
    }

    /* Files --------------------------------------------------------------- */

    function readDoc(path) {
      let content;
      try {
        content = vfs.readFile(path);
      } catch (err) {
        OS.ui.showError(err, t('errors.open'));
        return null;
      }
      if (/^data:[^,]*;base64,/.test(content)) {
        message(t('dialogs.binary'));
        return null;
      }
      return { path: vfs.resolve(path), text: content, eol: /\r\n/.test(content) ? 'crlf' : 'lf' };
    }

    function openPath(path) {
      const resolved = vfs.resolve(path);
      const existing = tabs.find((tab) => tab.path === resolved);
      if (existing) {
        activate(existing);
        return;
      }
      const data = readDoc(resolved);
      if (data) showDoc(data);
    }

    const message = (text) => OS.ui.dialog({ title: t('name'), message: text, icon: 'warning', buttons: [{ label: t('dialogs.ok'), value: true, primary: true }] });

    async function confirmDiscard(tab) {
      const { button } = await OS.ui.dialog({
        title: t('name'),
        message: t('dialogs.unsaved', { file: tabName(tab) }),
        icon: 'warning',
        buttons: [
          { label: t('dialogs.save'), value: 'save', primary: true },
          { label: t('dialogs.dontSave'), value: 'discard' },
          { label: t('dialogs.cancel'), value: null, cancel: true },
        ],
      });
      if (button === 'save') return save(tab);
      return button === 'discard';
    }

    async function openDoc() {
      const chosen = await OS.ui.pickFile({ mode: 'open', startDir: active.path ? vfs.dirname(active.path) : `${vfs.HOME}/Documents` });
      if (chosen) openPath(chosen);
      focusEditor();
    }

    const fileBody = (tab) => (tab.eol === 'crlf' ? tab.area.value.replace(/\n/g, '\r\n') : tab.area.value);

    function writeTo(tab, target) {
      try {
        vfs.writeFile(target, fileBody(tab));
      } catch (err) {
        OS.ui.showError(err, t('errors.save'));
        return false;
      }
      tab.path = vfs.resolve(target);
      tab.name = null;
      tab.saved = tab.area.value;
      if (tab === active) win.filePath = tab.path;
      renderTab(tab);
      updateTitle();
      flash(t('flash.saved'));
      return true;
    }

    async function save(tab) {
      if (!tab) return false;
      if (!tab.path) return saveAs(tab);
      return writeTo(tab, tab.path);
    }

    async function saveAs(tab) {
      const target = await OS.ui.pickFile({
        mode: 'save',
        startDir: tab.path ? vfs.dirname(tab.path) : `${vfs.HOME}/Documents`,
        defaultName: tab.path ? vfs.basename(tab.path) : tab.name || t('untitledFile'),
      });
      if (tab === active) focusEditor();
      if (!target) return false;
      return writeTo(tab, target);
    }

    async function saveAll() {
      for (const tab of tabs.slice()) {
        if (!isDirty(tab)) continue;
        if (!tab.path) activate(tab, false);
        if (!(await save(tab))) return;
      }
    }

    function downloadDoc() {
      OS.utils.download(active.path ? vfs.basename(active.path) : active.name || t('untitledFile'), fileBody(active), 'text/plain');
    }

    /* Editing ------------------------------------------------------------- */

    function focusEditor() {
      if (active && !isSettingsOpen()) active.area.focus({ preventScroll: true });
    }

    function restoreFocus() {
      if (win.closed) return;
      if (isSettingsOpen()) settings.focus();
      else if (find.open && findBar.contains(document.activeElement)) return;
      else focusEditor();
    }

    function insertText(str) {
      const a = active.area;
      a.focus({ preventScroll: true });
      if (!str || !document.execCommand('insertText', false, str)) a.setRangeText(str, a.selectionStart, a.selectionEnd, 'end');
      onEdit(active);
    }

    function command(name) {
      active.area.focus({ preventScroll: true });
      document.execCommand(name);
      onEdit(active);
    }

    function copySelection(cut) {
      const a = active.area;
      const text = a.value.slice(a.selectionStart, a.selectionEnd);
      if (!text) return;
      a.focus({ preventScroll: true });
      let ok = false;
      try { ok = document.execCommand(cut ? 'cut' : 'copy'); } catch (_) { ok = false; }
      if (ok) {
        onEdit(active);
        return;
      }
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
      if (cut) insertText('');
    }

    async function paste() {
      active.area.focus({ preventScroll: true });
      try {
        const text = await navigator.clipboard.readText();
        if (text) insertText(text);
      } catch (_) {
        flash(t('flash.pasteBlocked'));
      }
    }

    function selectAll() {
      active.area.focus({ preventScroll: true });
      active.area.select();
      updateStatus();
    }

    function insertDate() {
      // Like Notepad: time first, then the date with a four-digit year.
      const d = new Date();
      const time = new Intl.DateTimeFormat(t.locale, { timeStyle: 'short' }).format(d);
      const date = new Intl.DateTimeFormat(t.locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(d);
      insertText(`${time} ${date}`);
    }

    async function goTo() {
      closeSettings(false);
      const tab = active;
      const lines = tab.area.value.split('\n');
      const current = tab.area.value.slice(0, tab.area.selectionStart).split('\n').length;
      const { button, value } = await OS.ui.dialog({
        title: t('goTo.title'),
        message: t('goTo.prompt'),
        input: { value: String(current) },
        buttons: [
          { label: t('goTo.ok'), value: true, primary: true },
          { label: t('dialogs.cancel'), value: false, cancel: true },
        ],
      });
      if (button !== true || !tabs.includes(tab)) return;
      const n = parseInt(value, 10);
      if (!(n >= 1 && n <= lines.length)) {
        await message(t('goTo.invalid'));
        focusEditor();
        return;
      }
      const pos = lines.slice(0, n - 1).reduce((sum, l) => sum + l.length + 1, 0);
      activate(tab, false);
      tab.area.focus({ preventScroll: true });
      tab.area.setSelectionRange(pos, pos);
      revealRange(tab, pos, pos);
      updateStatus();
    }

    /* Find and replace --------------------------------------------------- */

    function computeMatches() {
      find.matches = [];
      if (!find.query || !active) return;
      const re = new RegExp(escapeRe(find.query), find.matchCase ? 'g' : 'gi');
      const v = active.area.value;
      let m;
      while ((m = re.exec(v)) && find.matches.length < 100000) find.matches.push(m.index);
    }

    /** Recount the matches; the current one is the first at or after `from` (default: the caret). */
    function refreshFind(from) {
      computeMatches();
      const anchor = from != null ? from : active.area.selectionStart;
      let idx = find.matches.findIndex((m) => m >= anchor);
      if (idx < 0 && find.matches.length && find.wrap) idx = 0;
      find.index = idx;
      renderFind();
    }

    function renderFind() {
      const n = find.matches.length;
      findCount.textContent = !find.query ? '' : n ? t('find.count', { current: num.format(find.index + 1), total: num.format(n) }) : t('find.noResults');
      findBar.classList.toggle('no-results', !!find.query && !n);
      renderHighlights();
    }

    // Matches are painted on a mirror of the text behind the (transparent) textarea.
    function renderHighlights() {
      if (!active) return;
      const tab = active;
      if (!find.open || !find.query || !find.matches.length) {
        tab.hl.textContent = '';
        return;
      }
      const v = tab.area.value;
      const len = find.query.length;
      let html = '';
      let last = 0;
      find.matches.forEach((m, i) => {
        html += `${escapeHtml(v.slice(last, m))}<mark${i === find.index ? ' class="current"' : ''}>${escapeHtml(v.slice(m, m + len))}</mark>`;
        last = m + len;
      });
      tab.hl.innerHTML = `${html}${escapeHtml(v.slice(last))}\n`;
      syncScroll(tab);
    }

    function syncScroll(tab) {
      tab.hl.scrollTop = tab.area.scrollTop;
      tab.hl.scrollLeft = tab.area.scrollLeft;
    }

    /** Scroll the textarea so the range is visible, measured on the mirror (exact even with word wrap). */
    function revealRange(tab, start, end) {
      const a = tab.area;
      let probe = find.open ? tab.hl.querySelector('mark.current') : null;
      const temporary = !probe || find.matches[find.index] !== start;
      if (temporary) {
        const v = a.value;
        tab.hl.innerHTML = `${escapeHtml(v.slice(0, start))}<mark class="probe">${escapeHtml(v.slice(start, end)) || '​'}</mark>${escapeHtml(v.slice(end))}\n`;
        probe = tab.hl.querySelector('mark');
      }
      const top = probe.offsetTop;
      const bottom = top + probe.offsetHeight;
      if (top < a.scrollTop || bottom > a.scrollTop + a.clientHeight) a.scrollTop = Math.max(0, top - a.clientHeight / 3);
      if (!prefs.wrap) {
        const left = probe.offsetLeft;
        if (left < a.scrollLeft || left + probe.offsetWidth > a.scrollLeft + a.clientWidth) a.scrollLeft = Math.max(0, left - a.clientWidth / 2);
      }
      if (temporary) renderHighlights();
      syncScroll(tab);
    }

    function selectCurrent(focusEditorToo = false) {
      if (find.index < 0 || !find.matches.length) return;
      const a = active.area;
      const start = find.matches[find.index];
      const end = start + find.query.length;
      if (focusEditorToo) a.focus({ preventScroll: true });
      a.setSelectionRange(start, end);
      renderHighlights();
      revealRange(active, start, end);
      updateStatus();
    }

    function setReplaceRow(on) {
      find.replace = on;
      findBar.classList.toggle('with-replace', on);
      toggleBtn.setAttribute('aria-expanded', String(on));
    }

    function openFind(withReplace) {
      closeSettings(false);
      const a = active.area;
      const sel = a.value.slice(a.selectionStart, a.selectionEnd);
      if (sel && !sel.includes('\n') && sel.length <= 200) findInput.value = sel;
      find.query = findInput.value;
      find.open = true;
      findBar.hidden = false;
      setReplaceRow(!!withReplace);
      refreshFind(a.selectionStart);
      findInput.focus();
      findInput.select();
    }

    function closeFind(focus = true) {
      if (!find.open) return;
      find.open = false;
      findBar.hidden = true;
      renderHighlights();
      if (focus) focusEditor();
    }

    function findStep(dir) {
      if (!find.query) {
        openFind(false);
        return;
      }
      closeSettings(false);
      computeMatches();
      const n = find.matches.length;
      const a = active.area;
      let idx = -1;
      if (dir > 0) {
        idx = find.matches.findIndex((m) => m >= a.selectionEnd);
        if (idx < 0 && find.wrap) idx = 0;
      } else {
        for (let i = n - 1; i >= 0; i--) {
          if (find.matches[i] < a.selectionStart) { idx = i; break; }
        }
        if (idx < 0 && find.wrap) idx = n - 1;
      }
      if (!n || idx < 0) {
        renderFind();
        flash(t('flash.notFound', { query: find.query }));
        return;
      }
      find.index = idx;
      renderFind();
      selectCurrent(!findBar.contains(document.activeElement));
    }

    // Run an edit in the textarea (it needs the focus), then give the focus back.
    function editInPlace(fn) {
      const keep = document.activeElement;
      active.area.focus({ preventScroll: true });
      fn(active.area);
      onEdit(active);
      if (keep && keep !== active.area && findBar.contains(keep)) keep.focus();
    }

    function replaceOne() {
      if (!find.query) return;
      computeMatches();
      const a = active.area;
      const isMatch = find.matches.includes(a.selectionStart) && a.selectionEnd - a.selectionStart === find.query.length;
      if (!isMatch) {
        findStep(1);
        return;
      }
      editInPlace((area) => {
        if (!replaceInput.value || !document.execCommand('insertText', false, replaceInput.value)) {
          area.setRangeText(replaceInput.value, area.selectionStart, area.selectionEnd, 'end');
        }
      });
      refreshFind(a.selectionEnd);
      selectCurrent();
    }

    function replaceAll() {
      if (!find.query) return;
      computeMatches();
      const count = find.matches.length;
      if (!count) {
        flash(t('flash.notFound', { query: find.query }));
        return;
      }
      const re = new RegExp(escapeRe(find.query), find.matchCase ? 'g' : 'gi');
      editInPlace((area) => {
        const replaced = area.value.replace(re, () => replaceInput.value);
        const caret = area.selectionStart;
        const top = area.scrollTop;
        area.select();
        if (!replaced || !document.execCommand('insertText', false, replaced)) area.value = replaced;
        const pos = Math.min(caret, area.value.length);
        area.setSelectionRange(pos, pos);
        area.scrollTop = top;
      });
      refreshFind();
      flash(t('flash.replaced', { count, number: num.format(count) }));
    }

    /* Settings page ------------------------------------------------------ */

    const isSettingsOpen = () => !!settings && !settings.el.hidden;

    function buildSettings() {
      const select = (options, onChange) => {
        const s = h('select', { class: 'input np-select' }, options.map(([value, label]) => h('option', { value: String(value), text: label })));
        s.addEventListener('change', () => onChange(s.value));
        return s;
      };
      const toggle = (label, onChange) => {
        const input = h('input', { type: 'checkbox', class: 'switch', role: 'switch', 'aria-label': label });
        const state = h('span', { class: 'np-switch-state' });
        input.addEventListener('change', () => onChange(input.checked));
        const wrap = h('label', { class: 'np-switch' }, state, input);
        wrap.sync = (on) => {
          input.checked = on;
          state.textContent = t(on ? 'settings.on' : 'settings.off');
        };
        return wrap;
      };
      const text = (title, desc) => h('div', { class: 'np-set-text' }, h('div', { class: 'np-set-title', text: title }), desc ? h('div', { class: 'np-set-desc', text: desc }) : null);
      const row = (icon, title, desc, control) => h('div', { class: 'np-set-card' },
        h('div', { class: 'np-set-row' }, h('span', { class: 'np-set-icon', html: glyph(icon) }), text(title, desc), control));
      const expander = (icon, title, desc, body) => {
        const content = h('div', { class: 'np-exp-body', hidden: true }, body);
        const head = h('button', { class: 'np-set-row np-exp-head', 'aria-expanded': 'false' },
          h('span', { class: 'np-set-icon', html: glyph(icon) }), text(title, desc), h('span', { class: 'np-exp-chevron', html: glyph('chevronDown') }));
        head.addEventListener('click', () => {
          content.hidden = !content.hidden;
          head.setAttribute('aria-expanded', String(!content.hidden));
        });
        return h('div', { class: 'np-set-card np-expander' }, head, content);
      };
      const section = (title) => h('h2', { class: 'np-set-section', text: title });

      const radios = ['light', 'dark', 'system'].map((value) => {
        const input = h('input', { type: 'radio', name: `${win.id}-np-theme`, value });
        input.addEventListener('change', () => {
          prefs.theme = value;
          savePrefs();
        });
        return h('label', { class: 'np-radio' }, input, h('span', { text: t(`settings.theme.${value}`) }));
      });
      const family = select([['mono', t('settings.font.mono')], ['system', t('settings.font.system')]], (v) => {
        prefs.mono = v === 'mono';
        savePrefs();
      });
      const size = select(FONT_SIZES.map((n) => [n, num.format(n)]), (v) => {
        prefs.size = Number(v);
        savePrefs();
      });
      const preview = h('div', { class: 'np-preview', text: t('settings.font.preview') });
      const statusSw = toggle(t('settings.statusBar'), (on) => { prefs.statusBar = on; savePrefs(); });
      const wrapSw = toggle(t('settings.wordWrap'), (on) => { prefs.wrap = on; savePrefs(); });
      const openSel = select([['tab', t('settings.openTab')], ['window', t('settings.openWindow')]], (v) => {
        prefs.openIn = v;
        savePrefs();
      });
      const back = h('button', { class: 'icon-btn np-back', title: t('settings.back'), 'aria-label': t('settings.back'), html: ICON.arrowLeft, onclick: () => closeSettings() });
      const subRow = (label, control) => h('div', { class: 'np-sub-row' }, h('span', { text: label }), control);

      const el = h('div', { class: 'np-settings', hidden: true },
        h('div', { class: 'np-set-inner' },
          h('div', { class: 'np-set-head' }, back, h('h1', { text: t('settings.title') })),
          section(t('settings.appearance')),
          expander('palette', t('settings.theme.title'), t('settings.theme.desc'),
            h('div', { class: 'np-radios', role: 'radiogroup', 'aria-label': t('settings.theme.title') }, radios)),
          row('window', t('settings.statusBar'), t('settings.statusBarDesc'), statusSw),
          section(t('settings.textFormatting')),
          expander('type', t('settings.font.title'), t('settings.font.desc'),
            [subRow(t('settings.font.family'), family), subRow(t('settings.font.size'), size), preview]),
          row('wrap', t('settings.wordWrap'), t('settings.wordWrapDesc'), wrapSw),
          section(t('settings.opening')),
          row('open', t('settings.openFiles'), t('settings.openFilesDesc'), openSel),
          section(t('settings.about')),
          h('div', { class: 'np-set-card' },
            h('div', { class: 'np-set-row' },
              h('span', { class: 'np-set-icon np-about-icon', html: OS.icons.appIcon(OS.apps.get('notepad'), 'sm') }),
              text(t('name'), t('settings.version', { version: OS.version })),
              h('span', { class: 'np-set-desc np-about-text', text: t('settings.aboutText') })))));
      win.body.append(el);

      return {
        el,
        focus: () => back.focus(),
        sync() {
          radios.forEach((r) => { r.firstChild.checked = r.firstChild.value === prefs.theme; });
          family.value = prefs.mono ? 'mono' : 'system';
          size.value = String(prefs.size);
          openSel.value = prefs.openIn === 'window' ? 'window' : 'tab';
          statusSw.sync(!!prefs.statusBar);
          wrapSw.sync(!!prefs.wrap);
          preview.classList.toggle('mono', !!prefs.mono);
          preview.style.fontSize = `${prefs.size}px`;
        },
      };
    }

    function openSettings() {
      if (!settings) settings = buildSettings();
      settings.sync();
      closeFind(false);
      main.hidden = true;
      settings.el.hidden = false;
      updateTitle();
      settings.focus();
    }

    function closeSettings(focus = true) {
      if (!isSettingsOpen()) return;
      settings.el.hidden = true;
      main.hidden = false;
      updateTitle();
      if (focus) focusEditor();
    }

    /* Keyboard ------------------------------------------------------------ */

    win.el.addEventListener('keydown', (e) => {
      if (!active) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && !e.shiftKey && !e.altKey && (k === 'n' || k === 't')) newTab();
      else if (ctrl && e.shiftKey && k === 'n') OS.wm.open('notepad');
      else if (ctrl && k === 'o') openDoc();
      else if (ctrl && e.altKey && k === 's') saveAll();
      else if (ctrl && k === 's') { if (e.shiftKey) saveAs(active); else save(active); }
      else if (ctrl && k === 'w') { if (e.shiftKey) win.close(); else closeTab(active); }
      else if (ctrl && e.key === 'Tab') cycleTabs(e.shiftKey ? -1 : 1);
      else if (ctrl && k === 'f') openFind(false);
      else if (ctrl && k === 'h') openFind(true);
      else if (ctrl && k === 'g') goTo();
      else if (e.key === 'F3') findStep(e.shiftKey ? -1 : 1);
      else if (e.key === 'F5' && !ctrl) insertDate();
      else if (ctrl && (e.key === '=' || e.key === '+')) setZoom(zoom + ZOOM.step);
      else if (ctrl && e.key === '-') setZoom(zoom - ZOOM.step);
      else if (ctrl && e.key === '0') setZoom(100);
      else if (e.key === 'Escape' && isSettingsOpen()) closeSettings();
      else if (e.key === 'Escape' && find.open) closeFind();
      else return;
      e.preventDefault();
      e.stopPropagation();
    });

    /* Window -------------------------------------------------------------- */

    instances.set(win, { hasPath: (p) => tabs.some((tab) => tab.path === p), openPath, applyPrefs });
    win.on('close', () => {
      instances.delete(win);
      document.removeEventListener('selectionchange', onSelectionChange);
      if (menuObserver) menuObserver.disconnect();
    });
    win.onArgs = (a) => { if (a && a.path) openPath(a.path); };
    win.isDirty = () => tabs.some(isDirty);
    win.beforeClose = async () => {
      for (const tab of tabs.slice()) {
        if (!isDirty(tab)) continue;
        activate(tab, false);
        if (!(await confirmDiscard(tab))) return false;
      }
      return true;
    };
    win.on('focus', () => setTimeout(() => {
      const focused = document.activeElement;
      if (document.querySelector('.dialog-overlay') || isSettingsOpen() || (focused && win.el.contains(focused) && focused.matches('input, select, textarea, [role="tab"]'))) return;
      focusEditor();
    }, 0));

    applyPrefs();
    activate(createTab(args.path ? readDoc(args.path) || {} : {}));
  }

  OS.apps.register({
    id: 'notepad',
    languages: ['en'],
    width: 760,
    height: 520,
    minWidth: 340,
    fileTypes: ['*'],
    launch,
  });
})();
