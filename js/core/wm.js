/* AwanOS — window manager */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, emitter, clamp, isMobile, escapeHtml } = OS.utils;
  const { caption } = OS.icons;

  const events = emitter();
  const windows = []; // stacking order: last element is top-most
  let active = null;
  let seq = 0;
  let cascade = 0;

  const layer = () => document.getElementById('windows');
  const area = () => ({ w: layer().clientWidth, h: layer().clientHeight });
  const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  /* Snapping ----------------------------------------------------------- */

  // Zones are fractions of the desktop area (above the taskbar).
  const Z = (x, y, w, h) => ({ x, y, w, h });
  const ZONES = {
    left: Z(0, 0, 0.5, 1), right: Z(0.5, 0, 0.5, 1),
    tl: Z(0, 0, 0.5, 0.5), tr: Z(0.5, 0, 0.5, 0.5), bl: Z(0, 0.5, 0.5, 0.5), br: Z(0.5, 0.5, 0.5, 0.5),
  };
  // The layouts offered when hovering the maximize button.
  const SNAP_LAYOUTS = [
    [ZONES.left, ZONES.right],
    [Z(0, 0, 2 / 3, 1), Z(2 / 3, 0, 1 / 3, 1)],
    [ZONES.left, ZONES.tr, ZONES.br],
    [ZONES.tl, ZONES.tr, ZONES.bl, ZONES.br],
  ];
  const sameZone = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.001);

  function showSnapPreview(target) {
    const el = document.getElementById('snap-preview');
    if (!target) {
      el.hidden = true;
      return;
    }
    const a = area();
    const zone = target === 'maximized' ? Z(0, 0, 1, 1) : target;
    const m = 8;
    Object.assign(el.style, {
      left: `${zone.x * a.w + m}px`,
      top: `${zone.y * a.h + m}px`,
      width: `${zone.w * a.w - m * 2}px`,
      height: `${zone.h * a.h - m * 2}px`,
    });
    el.hidden = false;
  }

  /* Snap layouts flyout ----------------------------------------------- */

  let flyout = null;
  let flyoutTimer = null;

  function hideSnapFlyout() {
    clearTimeout(flyoutTimer);
    if (flyout) {
      flyout.el.remove();
      flyout = null;
    }
  }

  function showSnapFlyout(win) {
    hideSnapFlyout();
    const el = h('div', { class: 'snap-flyout', role: 'menu', 'aria-label': OS.t('wm.snapLayouts') });
    SNAP_LAYOUTS.forEach((zones) => {
      const box = h('div', { class: 'snap-layout' });
      zones.forEach((z) => {
        const zoneBtn = h('button', { class: 'snap-zone', role: 'menuitem', 'aria-label': OS.t('wm.snapLayouts') });
        Object.assign(zoneBtn.style, {
          left: `calc(${z.x * 100}% + 2px)`,
          top: `calc(${z.y * 100}% + 2px)`,
          width: `calc(${z.w * 100}% - 4px)`,
          height: `calc(${z.h * 100}% - 4px)`,
        });
        zoneBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          hideSnapFlyout();
          win.focus();
          win.snapTo(z);
        });
        box.appendChild(zoneBtn);
      });
      el.appendChild(box);
    });
    document.getElementById('popups').appendChild(el);
    const r = win.maxBtn.getBoundingClientRect();
    const f = el.getBoundingClientRect();
    el.style.left = `${clamp(r.left + r.width / 2 - f.width / 2, 4, window.innerWidth - f.width - 4)}px`;
    el.style.top = `${r.bottom + 4}px`;
    el.addEventListener('pointerenter', () => clearTimeout(flyoutTimer));
    el.addEventListener('pointerleave', () => { flyoutTimer = setTimeout(hideSnapFlyout, 300); });
    flyout = { el, win };
  }

  /* Window ------------------------------------------------------------- */

  class AppWindow {
    constructor(app, args) {
      this.id = `win-${++seq}`;
      this.app = app;
      this.appId = app.id;
      this.args = args;
      this.title = app.name;
      this.state = 'normal'; // normal | maximized | snapped (see this.zone)
      this.zone = null;
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
      const label = (key) => escapeHtml(OS.t(`wm.${key}`));
      el.dataset.app = app.id;
      el.innerHTML =
        '<div class="win-titlebar">' +
        `<span class="win-icon">${OS.icons.appIcon(app, 'xs')}</span>` +
        '<span class="win-title"></span>' +
        '<div class="win-title-slot"></div>' +
        '<div class="win-controls">' +
        `<button class="win-btn win-min" title="${label('minimize')}" aria-label="${label('minimize')}">${caption('minimize')}</button>` +
        (this.resizable ? `<button class="win-btn win-max" title="${label('maximize')}" aria-label="${label('maximize')}">${caption('maximize')}</button>` : '') +
        `<button class="win-btn win-close" title="${label('close')}" aria-label="${label('close')}">${caption('close')}</button>` +
        '</div></div>' +
        '<div class="win-body"></div>' +
        (this.resizable ? RESIZE_DIRS.map((d) => `<div class="rz rz-${d}" data-dir="${d}"></div>`).join('') : '');

      this.el = el;
      this.titlebar = el.querySelector('.win-titlebar');
      this.titleEl = el.querySelector('.win-title');
      this.body = el.querySelector('.win-body');
      this.maxBtn = el.querySelector('.win-max');
      this.titleEl.textContent = this.title;
      // The window content is in the app's own language, which can differ from the system's.
      this.body.lang = OS.i18n.forApp(app.id).locale;
      if (app.bodyClass) this.body.classList.add(app.bodyClass);

      el.addEventListener('pointerdown', () => this.focus(), true);
      el.querySelector('.win-min').addEventListener('click', (e) => { e.stopPropagation(); this.minimize(); });
      el.querySelector('.win-close').addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
      if (this.maxBtn) {
        this.maxBtn.addEventListener('click', (e) => { e.stopPropagation(); hideSnapFlyout(); this.toggleMaximize(); });
        // Hovering the maximize button offers snap layouts, as in Windows 11.
        this.maxBtn.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'mouse' || isMobile()) return;
          clearTimeout(flyoutTimer);
          if (flyout && flyout.win === this) return;
          flyoutTimer = setTimeout(() => showSnapFlyout(this), 450);
        });
        this.maxBtn.addEventListener('pointerleave', () => {
          clearTimeout(flyoutTimer);
          if (flyout) flyoutTimer = setTimeout(hideSnapFlyout, 300);
        });
      }

      // Controls an app puts in the title bar (tabs, buttons) don't start a drag.
      const NO_DRAG = '.win-btn, .no-drag, button, input, select, textarea, a, [role="tab"]';
      this.titlebar.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest(NO_DRAG)) return;
        this.startDrag(e);
      });
      this.titlebar.addEventListener('dblclick', (e) => {
        if (e.target.closest(NO_DRAG) || !this.resizable) return;
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

    /**
     * Put app content (for example a tab strip) in the title bar, as Windows 11 apps do.
     * The window title stays as the accessible name and taskbar label. Pass null to remove it.
     */
    setTitlebarContent(node) {
      const slot = this.titlebar.querySelector('.win-title-slot');
      slot.replaceChildren(...(node ? [node] : []));
      this.titlebar.classList.toggle('has-content', !!node);
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

    /** state: 'normal' | 'maximized' | 'snapped' (with a zone) — 'left' / 'right' are shorthands. */
    setState(state, animate = true, zone = null) {
      if (state === 'left' || state === 'right') {
        zone = ZONES[state];
        state = 'snapped';
      }
      if (!this.resizable && state !== 'normal') return;
      if (isMobile() && state !== 'maximized') state = 'maximized';
      if (state === this.state && (state !== 'snapped' || sameZone(zone, this.zone))) return;
      if (animate) {
        this.el.classList.add('animating');
        clearTimeout(this._animTimer);
        this._animTimer = setTimeout(() => this.el.classList.remove('animating'), 240);
      }
      this.el.classList.remove('maximized', 'snapped');
      if (state === 'maximized') this.el.classList.add('maximized');
      else if (state === 'snapped') {
        this.el.classList.add('snapped');
        ['x', 'y', 'w', 'h'].forEach((k) => this.el.style.setProperty(`--s${k}`, String(zone[k])));
      }
      this.state = state;
      this.zone = state === 'snapped' ? zone : null;
      if (this.maxBtn) {
        const max = state === 'maximized';
        this.maxBtn.innerHTML = caption(max ? 'restore' : 'maximize');
        this.maxBtn.title = OS.t(max ? 'wm.restore' : 'wm.maximize');
        this.maxBtn.setAttribute('aria-label', this.maxBtn.title);
      }
      events.emit('change');
    }

    toggleMaximize() {
      this.setState(this.state === 'maximized' ? 'normal' : 'maximized');
    }

    snapTo(zone) {
      this.setState('snapped', true, zone);
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
      if (flyout && flyout.win === this) hideSnapFlyout();
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
        { label: OS.t('wm.restore'), icon: 'restore', disabled: this.state === 'normal', action: () => this.setState('normal') },
        { label: OS.t('wm.minimize'), icon: 'minimize', action: () => this.minimize() },
        { label: OS.t('wm.maximize'), icon: 'maximize', disabled: !this.resizable || this.state === 'maximized', action: () => this.setState('maximized') },
        { label: OS.t('wm.snapLeft'), icon: 'back', disabled: !this.resizable, action: () => this.setState('left') },
        { label: OS.t('wm.snapRight'), icon: 'forward', disabled: !this.resizable, action: () => this.setState('right') },
        '-',
        { label: OS.t('wm.close'), icon: 'close', danger: true, action: () => this.close() },
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
        snap = this.resizable ? snapTarget(ev.clientX, ev.clientY) : null;
        showSnapPreview(snap);
      };
      const onUp = (ev) => {
        bar.removeEventListener('pointermove', onMove);
        bar.removeEventListener('pointerup', onUp);
        bar.removeEventListener('pointercancel', onUp);
        if (bar.hasPointerCapture(ev.pointerId)) bar.releasePointerCapture(ev.pointerId);
        document.body.classList.remove('wm-busy');
        showSnapPreview(null);
        if (snap === 'maximized') this.setState('maximized');
        else if (snap) this.snapTo(snap);
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

  /** Where a window dragged to (x, y) would snap: screen edges, corners (quarters) or the top (maximize). */
  function snapTarget(x, y) {
    const corner = 48;
    const w = window.innerWidth;
    const hgt = area().h;
    if (y <= 2) return x <= corner ? ZONES.tl : x >= w - corner ? ZONES.tr : 'maximized';
    if (x <= 2) return y <= corner ? ZONES.tl : y >= hgt - corner ? ZONES.bl : ZONES.left;
    if (x >= w - 3) return y <= corner ? ZONES.tr : y >= hgt - corner ? ZONES.br : ZONES.right;
    return null;
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
      OS.notify({ title: OS.t('wm.appNotFound'), body: OS.t('wm.appNotFoundBody', { id: appId }), icon: 'info' });
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
      OS.notify({ title: OS.t('wm.launchFailed', { name: app.name }), body: err.message, icon: 'info' });
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
