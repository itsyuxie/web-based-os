/* AwanOS — window manager */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, emitter, clamp, isMobile } = OS.utils;
  const { glyph } = OS.icons;

  const events = emitter();
  const windows = []; // stacking order: last element is top-most
  let active = null;
  let seq = 0;
  let cascade = 0;

  const layer = () => document.getElementById('windows');
  const area = () => ({ w: layer().clientWidth, h: layer().clientHeight });
  const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  /* Snap preview ------------------------------------------------------- */

  function showSnapPreview(kind) {
    const el = document.getElementById('snap-preview');
    if (!kind) {
      el.hidden = true;
      el.className = '';
      return;
    }
    el.hidden = false;
    el.className = `snap-${kind}`;
  }

  /* Window ------------------------------------------------------------- */

  class AppWindow {
    constructor(app, args) {
      this.id = `win-${++seq}`;
      this.app = app;
      this.appId = app.id;
      this.args = args;
      this.title = app.name;
      this.state = 'normal'; // normal | maximized | left | right
      this.minimized = false;
      this.closed = false;
      this.filePath = null;
      this.beforeClose = null; // optional async () => boolean
      this.isDirty = null; // optional () => boolean
      this.events = emitter();
      this.resizable = app.resizable !== false;
      this.build();
    }

    on(event, fn) {
      return this.events.on(event, fn);
    }

    build() {
      const app = this.app;
      const el = h('div', { class: 'window opening', id: this.id, role: 'dialog', 'aria-label': app.name, tabindex: '-1' });
      el.dataset.app = app.id;
      el.innerHTML =
        '<div class="win-titlebar">' +
        `<span class="win-icon">${OS.icons.appIcon(app, 'xs')}</span>` +
        '<span class="win-title"></span>' +
        '<div class="win-controls">' +
        `<button class="win-btn win-min" title="Minimalkan" aria-label="Minimalkan">${glyph('minimize')}</button>` +
        (this.resizable ? `<button class="win-btn win-max" title="Maksimalkan" aria-label="Maksimalkan">${glyph('maximize')}</button>` : '') +
        `<button class="win-btn win-close" title="Tutup" aria-label="Tutup">${glyph('close')}</button>` +
        '</div></div>' +
        '<div class="win-body"></div>' +
        (this.resizable ? RESIZE_DIRS.map((d) => `<div class="rz rz-${d}" data-dir="${d}"></div>`).join('') : '');

      this.el = el;
      this.titlebar = el.querySelector('.win-titlebar');
      this.titleEl = el.querySelector('.win-title');
      this.body = el.querySelector('.win-body');
      this.maxBtn = el.querySelector('.win-max');
      this.titleEl.textContent = this.title;
      if (app.bodyClass) this.body.classList.add(app.bodyClass);

      el.addEventListener('pointerdown', () => this.focus(), true);
      el.querySelector('.win-min').addEventListener('click', (e) => { e.stopPropagation(); this.minimize(); });
      el.querySelector('.win-close').addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
      if (this.maxBtn) this.maxBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMaximize(); });

      this.titlebar.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.win-btn')) return;
        this.startDrag(e);
      });
      this.titlebar.addEventListener('dblclick', (e) => {
        if (e.target.closest('.win-btn') || !this.resizable) return;
        this.toggleMaximize();
      });
      this.titlebar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showMenu(e.clientX, e.clientY);
      });
      el.querySelector('.win-icon').addEventListener('click', (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        this.showMenu(r.left, r.bottom + 4);
      });
      el.querySelectorAll('.rz').forEach((handle) => {
        handle.addEventListener('pointerdown', (e) => this.startResize(e, handle.dataset.dir));
      });

      // Initial geometry
      const a = area();
      const w = Math.min(this.args.width || app.width || 760, a.w - 16);
      const hgt = Math.min(this.args.height || app.height || 500, a.h - 16);
      const offset = (cascade++ % 8) * 28;
      const x = clamp(Math.round((a.w - w) / 2 - 90 + offset), 0, Math.max(0, a.w - w));
      const y = clamp(Math.round((a.h - hgt) / 2 - 70 + offset), 0, Math.max(0, a.h - hgt));
      this.rect = { x, y, w, h: hgt };
      this.applyRect();
      if (isMobile() || this.args.maximized) this.setState('maximized', false);
    }

    applyRect() {
      const s = this.el.style;
      s.left = `${Math.round(this.rect.x)}px`;
      s.top = `${Math.round(this.rect.y)}px`;
      s.width = `${Math.round(this.rect.w)}px`;
      s.height = `${Math.round(this.rect.h)}px`;
    }

    setTitle(title) {
      this.title = title;
      this.titleEl.textContent = title;
      this.el.setAttribute('aria-label', title);
      events.emit('change');
    }

    setSize(w, hgt) {
      const a = area();
      this.rect.w = Math.min(w, a.w);
      this.rect.h = Math.min(hgt, a.h);
      this.rect.x = clamp(this.rect.x, 0, Math.max(0, a.w - this.rect.w));
      this.rect.y = clamp(this.rect.y, 0, Math.max(0, a.h - this.rect.h));
      this.applyRect();
    }

    center() {
      const a = area();
      this.rect.x = Math.max(0, (a.w - this.rect.w) / 2);
      this.rect.y = Math.max(0, (a.h - this.rect.h) / 2);
      this.applyRect();
    }

    focus() {
      if (this.closed) return;
      if (this.minimized) this.restore();
      const idx = windows.indexOf(this);
      const changed = active !== this || idx !== windows.length - 1;
      if (idx !== windows.length - 1) {
        windows.splice(idx, 1);
        windows.push(this);
        restack();
      }
      if (!changed) return;
      windows.forEach((w) => w.el.classList.toggle('active', w === this));
      active = this;
      this.events.emit('focus');
      events.emit('change');
    }

    blur() {
      if (active !== this) return;
      active = null;
      this.el.classList.remove('active');
      events.emit('change');
    }

    minimize() {
      if (this.minimized) return;
      const target = OS.taskbar && OS.taskbar.buttonRect(this.appId);
      if (target) {
        const r = this.el.getBoundingClientRect();
        this.el.style.setProperty('--min-x', `${target.left + target.width / 2 - (r.left + r.width / 2)}px`);
        this.el.style.setProperty('--min-y', `${target.top - (r.top + r.height / 2)}px`);
      }
      this.minimized = true;
      this.el.classList.add('minimized');
      if (active === this) {
        active = null;
        this.el.classList.remove('active');
        focusTop();
      }
      events.emit('change');
    }

    restore() {
      if (!this.minimized) return;
      this.minimized = false;
      this.el.classList.remove('minimized');
      events.emit('change');
    }

    setState(state, animate = true) {
      if (!this.resizable && state !== 'normal') return;
      if (isMobile() && state !== 'maximized') state = 'maximized';
      if (state === this.state) return;
      if (animate) {
        this.el.classList.add('animating');
        clearTimeout(this._animTimer);
        this._animTimer = setTimeout(() => this.el.classList.remove('animating'), 240);
      }
      this.el.classList.remove('maximized', 'snap-left', 'snap-right');
      if (state === 'maximized') this.el.classList.add('maximized');
      else if (state === 'left') this.el.classList.add('snap-left');
      else if (state === 'right') this.el.classList.add('snap-right');
      this.state = state;
      if (this.maxBtn) {
        const max = state === 'maximized';
        this.maxBtn.innerHTML = glyph(max ? 'restore' : 'maximize');
        this.maxBtn.title = max ? 'Pulihkan' : 'Maksimalkan';
        this.maxBtn.setAttribute('aria-label', this.maxBtn.title);
      }
      events.emit('change');
    }

    toggleMaximize() {
      this.setState(this.state === 'maximized' ? 'normal' : 'maximized');
    }

    async close(force = false) {
      if (this.closed) return true;
      if (!force && this.beforeClose) {
        this.focus();
        const ok = await this.beforeClose();
        if (!ok) return false;
      }
      if (this.closed) return true;
      this.closed = true;
      this.events.emit('close');
      const idx = windows.indexOf(this);
      if (idx >= 0) windows.splice(idx, 1);
      if (active === this) active = null;
      this.el.classList.add('closing');
      setTimeout(() => this.el.remove(), 200);
      focusTop();
      events.emit('change');
      return true;
    }

    showMenu(x, y) {
      OS.ui.contextMenu(x, y, [
        { label: 'Pulihkan', icon: 'restore', disabled: this.state === 'normal', action: () => this.setState('normal') },
        { label: 'Minimalkan', icon: 'minimize', action: () => this.minimize() },
        { label: 'Maksimalkan', icon: 'maximize', disabled: !this.resizable || this.state === 'maximized', action: () => this.setState('maximized') },
        { label: 'Bagi ke kiri', icon: 'back', disabled: !this.resizable, action: () => this.setState('left') },
        { label: 'Bagi ke kanan', icon: 'forward', disabled: !this.resizable, action: () => this.setState('right') },
        '-',
        { label: 'Tutup', icon: 'close', danger: true, action: () => this.close() },
      ]);
    }

    /** Convert a snapped/maximised window back to a floating rect matching what is on screen. */
    detach() {
      const r = this.el.getBoundingClientRect();
      const l = layer().getBoundingClientRect();
      this.rect = { x: r.left - l.left, y: r.top - l.top, w: r.width, h: r.height };
      this.applyRect();
      this.setState('normal', false);
    }

    startDrag(e) {
      if (isMobile()) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const r0 = { ...this.rect };
      const bar = this.titlebar;
      const a = area();
      let moved = false;
      let snap = null;
      bar.setPointerCapture(e.pointerId);

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved) {
          if (Math.abs(dx) + Math.abs(dy) < 4) return;
          moved = true;
          document.body.classList.add('wm-busy');
          if (this.state !== 'normal') {
            const r = this.el.getBoundingClientRect();
            const ratio = (startX - r.left) / r.width;
            this.setState('normal', false);
            r0.x = startX - r0.w * ratio;
            r0.y = Math.max(0, startY - 18);
          }
        }
        this.rect.x = clamp(r0.x + dx, 80 - this.rect.w, a.w - 80);
        this.rect.y = clamp(r0.y + dy, 0, a.h - 36);
        this.applyRect();
        snap = null;
        if (this.resizable) {
          if (ev.clientY <= 2) snap = 'maximized';
          else if (ev.clientX <= 2) snap = 'left';
          else if (ev.clientX >= window.innerWidth - 3) snap = 'right';
        }
        showSnapPreview(snap);
      };
      const onUp = (ev) => {
        bar.removeEventListener('pointermove', onMove);
        bar.removeEventListener('pointerup', onUp);
        bar.removeEventListener('pointercancel', onUp);
        if (bar.hasPointerCapture(ev.pointerId)) bar.releasePointerCapture(ev.pointerId);
        document.body.classList.remove('wm-busy');
        showSnapPreview(null);
        if (snap) this.setState(snap);
      };
      bar.addEventListener('pointermove', onMove);
      bar.addEventListener('pointerup', onUp);
      bar.addEventListener('pointercancel', onUp);
    }

    startResize(e, dir) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.state !== 'normal') this.detach();
      const handle = e.currentTarget;
      const startX = e.clientX;
      const startY = e.clientY;
      const r0 = { ...this.rect };
      const minW = this.app.minWidth || 320;
      const minH = this.app.minHeight || 200;
      const a = area();
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('wm-busy');

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let { x, y, w, h: hh } = r0;
        if (dir.includes('e')) w = Math.max(minW, Math.min(r0.w + dx, a.w - r0.x));
        if (dir.includes('s')) hh = Math.max(minH, Math.min(r0.h + dy, a.h - r0.y));
        if (dir.includes('w')) {
          w = Math.max(minW, r0.w - dx);
          x = r0.x + r0.w - w;
        }
        if (dir.includes('n')) {
          hh = Math.max(minH, r0.h - dy);
          y = r0.y + r0.h - hh;
          if (y < 0) {
            hh += y;
            y = 0;
          }
        }
        this.rect = { x, y, w, h: hh };
        this.applyRect();
      };
      const onUp = (ev) => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
        document.body.classList.remove('wm-busy');
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    }
  }

  /* Manager ------------------------------------------------------------ */

  function restack() {
    windows.forEach((w, i) => { w.el.style.zIndex = String(100 + i); });
  }

  function focusTop() {
    for (let i = windows.length - 1; i >= 0; i--) {
      if (!windows[i].minimized) {
        windows[i].focus();
        return;
      }
    }
    active = null;
    events.emit('change');
  }

  function open(appId, args = {}) {
    const app = OS.apps.get(appId);
    if (!app) {
      OS.notify({ title: 'Aplikasi tidak ditemukan', body: `Tidak ada aplikasi bernama "${appId}".`, icon: 'info' });
      return null;
    }
    // Reuse an existing window for single-instance apps or an already-open file.
    const existing = windows.find((w) => w.appId === appId && (app.singleInstance || (args.path && w.filePath === OS.vfs.resolve(args.path))));
    if (existing) {
      existing.focus();
      if (existing.onArgs) existing.onArgs(args);
      return existing;
    }

    const win = new AppWindow(app, args);
    layer().appendChild(win.el);
    windows.push(win);
    restack();
    try {
      app.launch(win, args);
    } catch (err) {
      console.error(err);
      win.close(true);
      OS.notify({ title: `${app.name} gagal dibuka`, body: err.message, icon: 'info' });
      return null;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => win.el.classList.remove('opening')));
    win.focus();
    return win;
  }

  // Clicking inside an iframe never reaches our pointer handlers; detect it via window blur.
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const el = document.activeElement;
      if (el && el.tagName === 'IFRAME') {
        const win = windows.find((w) => w.el.contains(el));
        if (win) win.focus();
      }
    }, 0);
  });

  window.addEventListener('resize', () => {
    const a = area();
    windows.forEach((w) => {
      if (isMobile()) {
        w.setState('maximized', false);
        return;
      }
      w.rect.w = Math.min(w.rect.w, a.w);
      w.rect.h = Math.min(w.rect.h, a.h);
      w.rect.x = clamp(w.rect.x, 80 - w.rect.w, a.w - 80);
      w.rect.y = clamp(w.rect.y, 0, Math.max(0, a.h - 36));
      w.applyRect();
    });
  });

  let hiddenByShowDesktop = [];

  OS.wm = {
    open,
    on: events.on,
    off: events.off,
    list: () => windows.slice(),
    active: () => active,
    byApp: (appId) => windows.filter((w) => w.appId === appId),
    get: (id) => windows.find((w) => w.id === id),
    focusTop,
    blurAll() {
      if (active) active.blur();
    },
    toggleDesktop() {
      const visible = windows.filter((w) => !w.minimized);
      if (visible.length) {
        hiddenByShowDesktop = visible;
        visible.forEach((w) => w.minimize());
      } else {
        hiddenByShowDesktop.filter((w) => !w.closed).forEach((w) => w.focus());
        hiddenByShowDesktop = [];
      }
    },
    hasUnsaved: () => windows.some((w) => w.isDirty && w.isDirty()),
    closeAll(force = true) {
      return Promise.all(windows.slice().map((w) => w.close(force)));
    },
  };
})();
