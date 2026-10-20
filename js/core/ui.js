/* AwanOS — shared UI: context menus, popups, dialogs, notifications */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, escapeHtml, emitter } = OS.utils;
  const { glyph } = OS.icons;

  const popupLayer = () => document.getElementById('popups');
  const dialogLayer = () => document.getElementById('dialogs');

  /* ------------------------------------------------------------------ */
  /* Context menu                                                       */
  /* ------------------------------------------------------------------ */

  // Open menus, root first; submenus are pushed on top.
  let menuStack = [];
  let submenuTimer = null;

  function closeMenu() {
    clearTimeout(submenuTimer);
    if (!menuStack.length) return;
    const root = menuStack[0];
    menuStack.forEach((m) => m.el.remove());
    menuStack = [];
    if (root.onClose) root.onClose();
  }

  function closeSubmenusAbove(level) {
    while (menuStack.length > level + 1) {
      const m = menuStack.pop();
      m.el.remove();
      if (m.owner) m.owner.classList.remove('open');
    }
  }

  const insideMenu = (target) => menuStack.some((m) => m.el.contains(target));

  function placeMenu(el, x, y, opts) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = opts.alignRight ? x - rect.width : x;
    let top = opts.above ? y - rect.height : y;
    if (left + rect.width > vw - 4) left = Math.max(4, vw - rect.width - 4);
    if (left < 4) left = 4;
    if (top + rect.height > vh - 4) top = Math.max(4, y - rect.height);
    if (top < 4) top = 4;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function openSubmenu(btn, items, level, focus) {
    closeSubmenusAbove(level);
    btn.classList.add('open');
    const { el, buttons } = renderMenu(items, level + 1);
    popupLayer().appendChild(el);
    const r = btn.getBoundingClientRect();
    const m = el.getBoundingClientRect();
    let left = r.right + 2;
    if (left + m.width > window.innerWidth - 4) left = Math.max(4, r.left - m.width - 2);
    let top = r.top - 5;
    if (top + m.height > window.innerHeight - 4) top = Math.max(4, window.innerHeight - m.height - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    menuStack.push({ el, owner: btn });
    if (focus) {
      const first = buttons.find((b) => !b.disabled);
      if (first) first.focus({ preventScroll: true });
    }
  }

  /**
   * Build one menu level. Items:
   *   { label, icon | iconHtml, shortcut, action, disabled, danger, checked, submenu: [...] }
   *   { row: [{ icon, label, action, disabled, danger }] }   compact icon buttons (Cut, Copy, …)
   *   { header: 'Title' } and '-' separators.
   */
  function renderMenu(items, level) {
    const el = h('div', { class: `menu${level ? ' submenu' : ''}`, role: 'menu' });
    const buttons = [];
    items.filter(Boolean).forEach((item) => {
      if (item === '-') {
        el.appendChild(h('div', { class: 'menu-sep', role: 'separator' }));
        return;
      }
      if (item.header) {
        el.appendChild(h('div', { class: 'menu-header', text: item.header }));
        return;
      }
      if (item.row) {
        const row = h('div', { class: 'menu-row' });
        item.row.filter(Boolean).forEach((b) => {
          const btn = h('button', {
            class: `menu-row-btn${b.danger ? ' danger' : ''}`,
            role: 'menuitem',
            title: b.label,
            'aria-label': b.label,
            disabled: !!b.disabled,
            html: glyph(b.icon),
            onclick: (e) => {
              e.stopPropagation();
              closeMenu();
              if (b.action) b.action();
            },
          });
          btn.addEventListener('pointerenter', () => closeSubmenusAbove(level));
          buttons.push(btn);
          row.appendChild(btn);
        });
        el.appendChild(row);
        return;
      }
      const btn = h('button', {
        class: `menu-item${item.danger ? ' danger' : ''}${item.checked ? ' checked' : ''}`,
        role: 'menuitem',
        disabled: !!item.disabled,
        'aria-haspopup': item.submenu ? 'menu' : null,
        html:
          `<span class="menu-icon">${item.iconHtml || (item.icon ? glyph(item.icon) : item.checked ? glyph('check') : '')}</span>` +
          `<span class="menu-label">${escapeHtml(item.label)}</span>` +
          (item.submenu ? glyph('chevronRight', 'menu-arrow') : item.shortcut ? `<span class="menu-shortcut">${escapeHtml(item.shortcut)}</span>` : ''),
      });
      if (item.submenu) {
        btn._submenu = item.submenu;
        btn.addEventListener('pointerenter', () => {
          clearTimeout(submenuTimer);
          submenuTimer = setTimeout(() => openSubmenu(btn, item.submenu, level, false), 220);
        });
        btn.addEventListener('pointerleave', () => clearTimeout(submenuTimer));
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearTimeout(submenuTimer);
          openSubmenu(btn, item.submenu, level, e.detail === 0);
        });
      } else {
        btn.addEventListener('pointerenter', () => {
          clearTimeout(submenuTimer);
          submenuTimer = setTimeout(() => closeSubmenusAbove(level), 220);
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMenu();
          if (item.action) item.action();
        });
      }
      buttons.push(btn);
      el.appendChild(btn);
    });

    el.addEventListener('keydown', (e) => {
      const enabled = buttons.filter((b) => !b.disabled);
      const idx = enabled.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); enabled[(idx + 1) % enabled.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); enabled[(idx - 1 + enabled.length) % enabled.length].focus(); }
      else if (e.key === 'ArrowRight' && document.activeElement && document.activeElement._submenu) {
        e.preventDefault();
        openSubmenu(document.activeElement, document.activeElement._submenu, level, true);
      } else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && level > 0) {
        e.preventDefault();
        e.stopPropagation();
        const owner = menuStack[level] && menuStack[level].owner;
        closeSubmenusAbove(level - 1);
        if (owner) owner.focus({ preventScroll: true });
      } else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return { el, buttons };
  }

  /**
   * Show a menu at (x, y). See renderMenu() for the item format.
   * Pass { above: true } to open upwards from the point (used by the taskbar).
   */
  function contextMenu(x, y, items, opts = {}) {
    closeMenu();
    const { el, buttons } = renderMenu(items, 0);
    popupLayer().appendChild(el);
    placeMenu(el, x, y, opts);
    menuStack = [{ el, onClose: opts.onClose }];
    const first = buttons.find((b) => !b.disabled);
    if (first && opts.focus !== false) first.focus({ preventScroll: true });
    return el;
  }

  /* ------------------------------------------------------------------ */
  /* Popups (start menu, calendar, quick settings)                      */
  /* ------------------------------------------------------------------ */

  let activePopup = null;

  function openPopup(el, { owner, onClose } = {}) {
    closePopup();
    popupLayer().appendChild(el);
    activePopup = { el, owner, onClose };
    if (owner) owner.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => el.classList.add('open'));
    return el;
  }

  function closePopup() {
    if (!activePopup) return;
    const { el, owner, onClose } = activePopup;
    activePopup = null;
    if (owner) owner.setAttribute('aria-expanded', 'false');
    el.classList.remove('open');
    el.classList.add('closing');
    setTimeout(() => el.remove(), 160);
    if (onClose) onClose();
  }

  const isPopupOpen = (owner) => !!activePopup && (!owner || activePopup.owner === owner);

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (menuStack.length && !insideMenu(e.target)) closeMenu();
      if (activePopup && !activePopup.el.contains(e.target) && !(activePopup.owner && activePopup.owner.contains(e.target)) && !e.target.closest('.menu')) {
        closePopup();
      }
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (menuStack.length) closeMenu();
    else if (activePopup) closePopup();
  });
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', () => { closeMenu(); closePopup(); });

  /* ------------------------------------------------------------------ */
  /* Dialogs                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Generic modal dialog. Resolves with { button, value } where button is the chosen
   * button's value (or null when cancelled) and value is the text input contents.
   */
  function dialog({ title = 'AwanOS', message = '', icon, input, content, buttons, width } = {}) {
    buttons = buttons || [{ label: OS.t('common.ok'), value: true, primary: true }];
    return new Promise((resolve) => {
      const previouslyFocused = document.activeElement;
      const overlay = h('div', { class: 'dialog-overlay' });
      const box = h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title });
      if (width) box.style.width = `${width}px`;
      let field = null;

      const close = (button) => {
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 140);
        document.removeEventListener('keydown', onKey, true);
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus({ preventScroll: true });
        resolve({ button, value: field ? field.value : undefined });
      };

      const cancelValue = (buttons.find((b) => b.cancel) || {}).value ?? null;
      const onKey = (e) => {
        if (!overlay.isConnected || overlay !== dialogLayer().lastElementChild) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(cancelValue); }
        else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
          const primary = buttons.find((b) => b.primary);
          if (primary) { e.preventDefault(); e.stopPropagation(); close(primary.value); }
        }
      };
      document.addEventListener('keydown', onKey, true);

      box.appendChild(h('div', { class: 'dialog-title', text: title }));
      const body = h('div', { class: 'dialog-body' });
      if (icon) body.appendChild(h('div', { class: `dialog-icon ${icon}`, html: glyph(icon === 'warning' ? 'info' : icon) }));
      const main = h('div', { class: 'dialog-main' });
      if (message) main.appendChild(h('p', { class: 'dialog-message', text: message }));
      if (input) {
        field = h('input', { class: 'input', type: 'text', value: input.value || '', placeholder: input.placeholder || '', spellcheck: false });
        main.appendChild(field);
      }
      if (content) main.appendChild(content);
      body.appendChild(main);
      box.appendChild(body);

      const footer = h('div', { class: 'dialog-buttons' });
      buttons.forEach((b) => {
        footer.appendChild(
          h('button', {
            class: `btn${b.primary ? ' btn-primary' : ''}${b.danger ? ' btn-danger' : ''}`,
            text: b.label,
            onclick: () => close(b.value),
          })
        );
      });
      box.appendChild(footer);
      overlay.appendChild(box);
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) {
          box.classList.remove('shake');
          void box.offsetWidth;
          box.classList.add('shake');
        }
      });
      dialogLayer().appendChild(overlay);

      requestAnimationFrame(() => {
        if (field) {
          field.focus();
          const dot = input.selectStem ? field.value.lastIndexOf('.') : -1;
          field.setSelectionRange(0, dot > 0 ? dot : field.value.length);
        } else {
          const primary = footer.querySelector('.btn-primary') || footer.querySelector('.btn');
          if (primary) primary.focus();
        }
      });
      box._close = close;
    });
  }

  const alert = (message, { title = 'AwanOS', icon = 'info' } = {}) => dialog({ title, message, icon }).then(() => undefined);

  const confirm = (message, { title = OS.t('dialog.confirm'), okLabel = OS.t('common.ok'), cancelLabel = OS.t('common.cancel'), danger = false, icon = 'warning' } = {}) =>
    dialog({
      title, message, icon,
      buttons: [
        { label: okLabel, value: true, primary: true, danger },
        { label: cancelLabel, value: false, cancel: true },
      ],
    }).then((r) => r.button === true);

  const prompt = (message, value = '', { title = 'AwanOS', okLabel = OS.t('common.ok'), selectStem = false, placeholder = '' } = {}) =>
    dialog({
      title, message,
      input: { value, selectStem, placeholder },
      buttons: [
        { label: okLabel, value: true, primary: true },
        { label: OS.t('common.cancel'), value: false, cancel: true },
      ],
    }).then((r) => (r.button === true ? r.value : null));

  const showError = (err, title = OS.t('dialog.error')) => alert(err && err.message ? err.message : String(err), { title, icon: 'warning' });

  /**
   * Minimal file chooser backed by the VFS.
   * mode: 'open' | 'save'. Resolves with an absolute path or null.
   */
  function pickFile({ mode = 'open', title, startDir = OS.vfs.HOME + '/Documents', defaultName = '', extensions = null } = {}) {
    const vfs = OS.vfs;
    let cwd = vfs.isDir(startDir) ? vfs.resolve(startDir) : vfs.HOME;
    let selected = null;

    const pathLabel = h('div', { class: 'picker-path' });
    const list = h('div', { class: 'picker-list', tabindex: '0' });
    const nameInput = h('input', { class: 'input', type: 'text', value: defaultName, placeholder: OS.t('picker.fileName'), spellcheck: false });
    const upBtn = h('button', { class: 'icon-btn', title: OS.t('picker.up'), html: glyph('up'), onclick: () => go(vfs.dirname(cwd)) });
    const homeBtn = h('button', { class: 'icon-btn', title: OS.t('places.home'), html: glyph('home'), onclick: () => go(vfs.HOME) });
    const shortcuts = h('div', { class: 'picker-shortcuts' },
      [['Desktop', 'desktop'], ['Documents', 'documents'], ['Pictures', 'pictures'], ['Downloads', 'downloads']]
        .map(([dir, key]) => h('button', { class: 'chip', text: OS.t(`places.${key}`), onclick: () => go(`${vfs.HOME}/${dir}`) })));

    const content = h('div', { class: 'picker' },
      h('div', { class: 'picker-bar' }, upBtn, homeBtn, pathLabel),
      shortcuts,
      list,
      mode === 'save' ? h('label', { class: 'picker-name' }, h('span', { text: OS.t('picker.fileNameLabel') }), nameInput) : null
    );

    let finish;

    function go(path) {
      if (!vfs.isDir(path)) return;
      cwd = vfs.resolve(path);
      selected = null;
      render();
    }

    // Shortcuts and images need their content to draw the right icon.
    const iconData = (entry) => {
      if (entry.type !== 'file') return null;
      const ext = OS.utils.extname(entry.name);
      return ext === 'app' || OS.icons.fileKind(entry.name) === 'image' ? vfs.readFile(entry.path) : null;
    };

    function render() {
      pathLabel.textContent = cwd.replace(vfs.HOME, '~');
      upBtn.disabled = cwd === '/';
      list.innerHTML = '';
      let entries = [];
      try { entries = vfs.readdir(cwd); } catch (_) { /* ignore */ }
      entries = entries.filter((e) => e.type === 'dir' || !extensions || extensions.includes(OS.utils.extname(e.name)));
      if (!entries.length) list.appendChild(h('div', { class: 'picker-empty', text: OS.t('picker.empty') }));
      entries.forEach((entry) => {
        const row = h('div', {
          class: 'picker-item',
          html: `<span class="picker-icon">${OS.icons.forEntry(entry, iconData(entry))}</span><span>${escapeHtml(OS.fileOps.displayName(entry.name))}</span>`,
          onclick: () => {
            list.querySelectorAll('.selected').forEach((n) => n.classList.remove('selected'));
            row.classList.add('selected');
            selected = entry;
            if (entry.type === 'file' && mode === 'save') nameInput.value = entry.name;
          },
          ondblclick: () => {
            if (entry.type === 'dir') go(entry.path);
            else finish(entry.path);
          },
        });
        list.appendChild(row);
      });
    }
    render();

    return new Promise((resolve) => {
      let closeDialog;
      finish = async (path) => {
        if (mode === 'save' && vfs.isFile(path)) {
          const ok = await confirm(OS.t('picker.overwrite', { name: vfs.basename(path) }), { title: OS.t('picker.overwriteTitle'), okLabel: OS.t('picker.replace') });
          if (!ok) return;
        }
        resolve(path);
        closeDialog(null);
      };

      const p = dialog({
        title: title || OS.t(mode === 'save' ? 'picker.saveTitle' : 'picker.openTitle'),
        content,
        width: 520,
        buttons: [
          { label: OS.t(mode === 'save' ? 'common.save' : 'common.open'), value: 'ok', primary: true },
          { label: OS.t('common.cancel'), value: null, cancel: true },
        ],
      });
      // Grab the dialog's close function so finish() can close it programmatically.
      requestAnimationFrame(() => {
        const box = content.closest('.dialog');
        closeDialog = box && box._close;
        if (mode === 'save') {
          nameInput.focus();
          const dot = nameInput.value.lastIndexOf('.');
          nameInput.setSelectionRange(0, dot > 0 ? dot : nameInput.value.length);
        }
      });

      p.then(async ({ button }) => {
        if (button !== 'ok') { resolve(null); return; }
        if (mode === 'open') {
          if (selected && selected.type === 'file') return resolve(selected.path);
          if (selected && selected.type === 'dir') {
            // Re-open the picker inside the chosen folder.
            return resolve(await pickFile({ mode, title, startDir: selected.path, defaultName, extensions }));
          }
          return resolve(null);
        }
        const name = nameInput.value.trim();
        if (!name) return resolve(null);
        const target = vfs.join(cwd, name);
        if (vfs.isDir(target)) return resolve(await pickFile({ mode, title, startDir: target, defaultName, extensions }));
        if (vfs.isFile(target)) {
          const ok = await confirm(OS.t('picker.overwrite', { name }), { title: OS.t('picker.overwriteTitle'), okLabel: OS.t('picker.replace') });
          if (!ok) return resolve(await pickFile({ mode, title, startDir: cwd, defaultName: name, extensions }));
        }
        resolve(target);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Notifications                                                      */
  /* ------------------------------------------------------------------ */

  const notifyEvents = emitter();
  const history = [];

  function notify({ title, body = '', icon = 'bell', app, timeout = 5000, onClick } = {}) {
    const entry = { id: OS.utils.uid('n'), title, body, icon, app, time: Date.now() };
    history.unshift(entry);
    if (history.length > 30) history.pop();
    notifyEvents.emit('change');

    const layer = document.getElementById('toasts');
    const appDef = app && OS.apps ? OS.apps.get(app) : null;
    const toast = h('div', {
      class: 'toast',
      role: 'status',
      html:
        `<div class="toast-head">${appDef ? OS.icons.appIcon(appDef, 'xs') : glyph(icon)}<span>${escapeHtml(appDef ? appDef.name : 'AwanOS')}</span></div>` +
        `<div class="toast-title">${escapeHtml(title)}</div>${body ? `<div class="toast-body">${escapeHtml(body)}</div>` : ''}`,
    });
    const closeBtn = h('button', { class: 'toast-close', title: OS.t('common.dismiss'), 'aria-label': OS.t('common.dismiss'), html: glyph('close') });
    toast.querySelector('.toast-head').appendChild(closeBtn);
    const dismiss = () => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 220);
    };
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
    toast.addEventListener('click', () => {
      if (onClick) onClick();
      dismiss();
    });
    layer.appendChild(toast);
    while (layer.children.length > 4) layer.firstElementChild.remove();
    if (timeout) setTimeout(dismiss, timeout);
    return entry;
  }

  /* ------------------------------------------------------------------ */
  /* Inline rename                                                      */
  /* ------------------------------------------------------------------ */

  /** Turn a label element into an editable field. Resolves with the new text, or null if cancelled. */
  function inlineEdit(labelEl, value, { selectStem = true } = {}) {
    return new Promise((resolve) => {
      const original = labelEl.innerHTML;
      const field = h('textarea', { class: 'inline-edit', rows: 1, spellcheck: false });
      field.value = value;
      labelEl.innerHTML = '';
      labelEl.appendChild(field);
      const fit = () => {
        field.style.height = 'auto';
        field.style.height = `${field.scrollHeight}px`;
      };
      fit();
      field.focus();
      const dot = selectStem ? value.lastIndexOf('.') : -1;
      field.setSelectionRange(0, dot > 0 ? dot : value.length);

      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        labelEl.innerHTML = original;
        resolve(result);
      };
      field.addEventListener('input', fit);
      field.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish(field.value.trim() && field.value.trim() !== value ? field.value.trim() : null); }
        if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      });
      field.addEventListener('blur', () => finish(field.value.trim() && field.value.trim() !== value ? field.value.trim() : null));
      ['pointerdown', 'dblclick', 'click'].forEach((t) => field.addEventListener(t, (e) => e.stopPropagation()));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Sliders: the filled part of the track follows the value (--fill)    */
  /* ------------------------------------------------------------------ */

  function syncRange(el) {
    const min = Number(el.min) || 0;
    const max = el.max === '' ? 100 : Number(el.max);
    const pct = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0;
    el.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
  }
  const isRange = (el) => el.tagName === 'INPUT' && el.type === 'range';
  document.addEventListener('input', (e) => { if (isRange(e.target)) syncRange(e.target); }, true);
  new window.MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (isRange(n)) syncRange(n);
        else n.querySelectorAll('input[type="range"]').forEach(syncRange);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  OS.ui = {
    contextMenu, closeMenu, syncRange,
    openPopup, closePopup, isPopupOpen,
    dialog, alert, confirm, prompt, showError, pickFile,
    inlineEdit,
    notifications: { history, on: notifyEvents.on, clear() { history.length = 0; notifyEvents.emit('change'); } },
  };
  OS.notify = notify;
})();
