/* AwanOS — taskbar, Start menu, Quick settings and the notification center */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, escapeHtml } = OS.utils;
  const { glyph } = OS.icons;

  let bar; // #taskbar
  let startBtn;
  let searchBtn;
  let appsBar;
  let quickBtn;
  let clockBtn;
  const buttons = new Map(); // appId -> button

  const t = OS.t;
  const LOCALE = OS.i18n.locale;
  const timeFmt = (withSeconds) => new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', second: withSeconds ? '2-digit' : undefined });
  const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'numeric', year: 'numeric' });
  const longDateFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const ncDateFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
  const dayFmt = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' });
  const relFmt = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

  /** First day of the week for the UI locale: 0 = Sunday … 6 = Saturday. */
  function firstDayOfWeek() {
    try {
      const loc = new Intl.Locale(LOCALE);
      const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
      if (info && info.firstDay) return info.firstDay % 7; // weekInfo: 1 = Monday … 7 = Sunday
    } catch (_) { /* not supported */ }
    return 0;
  }
  const FIRST_DAY = firstDayOfWeek();
  // Weekday headings in display order (1 Jan 2023 was a Sunday): "Mo" in English, "一" in Chinese.
  const WEEKDAYS = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2023, 0, 1 + ((FIRST_DAY + i) % 7));
    const short = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(d);
    return /^[a-z]/i.test(short) ? short.slice(0, 2) : new Intl.DateTimeFormat(LOCALE, { weekday: 'narrow' }).format(d);
  });

  function relativeTime(ts) {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return t('start.justNow');
    if (min < 60) return relFmt.format(-min, 'minute');
    const hours = Math.round(min / 60);
    if (hours < 24) return relFmt.format(-hours, 'hour');
    const days = Math.round(hours / 24);
    if (days < 7) return relFmt.format(-days, 'day');
    return dayFmt.format(ts);
  }

  const tildePath = (path) => (path === OS.vfs.HOME || path.startsWith(`${OS.vfs.HOME}/`) ? `~${path.slice(OS.vfs.HOME.length)}` : path);

  /* ------------------------------------------------------------------ */
  /* Running / pinned applications                                      */
  /* ------------------------------------------------------------------ */

  function render() {
    const pinned = (OS.settings.get('pinned') || []).filter((id) => OS.apps.get(id));
    const wins = OS.wm.list();
    const running = [...new Set(wins.map((w) => w.appId))];
    const order = [...pinned, ...running.filter((id) => !pinned.includes(id))];
    const active = OS.wm.active();

    for (const [id, btn] of buttons) {
      if (!order.includes(id)) {
        btn.remove();
        buttons.delete(id);
      }
    }
    order.forEach((id) => {
      const app = OS.apps.get(id);
      let btn = buttons.get(id);
      if (!btn) {
        btn = h('button', { class: 'tb-btn tb-app', html: OS.icons.appIcon(app) });
        btn.dataset.app = id;
        btn.addEventListener('click', () => onAppClick(id, btn));
        btn.addEventListener('auxclick', (e) => { if (e.button === 1) OS.wm.open(id); });
        btn.addEventListener('contextmenu', (e) => { e.preventDefault(); appMenu(id, btn); });
        buttons.set(id, btn);
      }
      const appWins = wins.filter((w) => w.appId === id);
      btn.classList.toggle('running', appWins.length > 0);
      btn.classList.toggle('focused', !!active && active.appId === id && !active.minimized);
      btn.title = appWins.length === 1 ? `${app.name} - ${appWins[0].title}` : app.name;
      btn.setAttribute('aria-label', btn.title);
      let badge = btn.querySelector('.badge');
      if (appWins.length > 1) {
        if (!badge) badge = btn.appendChild(h('span', { class: 'badge' }));
        badge.textContent = appWins.length;
      } else if (badge) badge.remove();
      appsBar.appendChild(btn);
    });
  }

  function onAppClick(id, btn) {
    const wins = OS.wm.byApp(id);
    if (!wins.length) {
      btn.classList.remove('launch-bounce');
      void btn.offsetWidth;
      btn.classList.add('launch-bounce');
      OS.wm.open(id);
      return;
    }
    if (wins.length === 1) {
      const w = wins[0];
      if (OS.wm.active() === w && !w.minimized) w.minimize();
      else w.focus();
      return;
    }
    const r = btn.getBoundingClientRect();
    OS.ui.contextMenu(r.left, r.top - 8, [
      { header: OS.apps.get(id).name },
      ...wins.map((w) => ({ label: w.title, iconHtml: OS.icons.appIcon(w.app, 'xs'), checked: OS.wm.active() === w, action: () => w.focus() })),
    ], { above: true });
  }

  /** Jump list: the app itself, pin/unpin, close. */
  function appMenu(id, btn) {
    const app = OS.apps.get(id);
    const wins = OS.wm.byApp(id);
    const isPinned = (OS.settings.get('pinned') || []).includes(id);
    const r = btn.getBoundingClientRect();
    OS.ui.contextMenu(r.left, r.top - 8, [
      { label: app.name, iconHtml: OS.icons.appIcon(app, 'xs'), disabled: app.singleInstance && wins.length > 0, action: () => OS.wm.open(id) },
      { label: t(isPinned ? 'taskbar.unpin' : 'taskbar.pin'), icon: isPinned ? 'unpin' : 'pin', action: () => togglePin(id) },
      wins.length ? { label: t(wins.length > 1 ? 'taskbar.closeAll' : 'taskbar.closeWindow'), icon: 'close', action: () => wins.forEach((w) => w.close()) } : null,
    ], { above: true });
  }

  function togglePin(id) {
    const pinned = (OS.settings.get('pinned') || []).slice();
    const i = pinned.indexOf(id);
    if (i >= 0) pinned.splice(i, 1);
    else pinned.push(id);
    OS.settings.set('pinned', pinned);
  }

  function buttonRect(appId) {
    const btn = buttons.get(appId);
    return btn ? btn.getBoundingClientRect() : null;
  }

  function applyAlign() {
    bar.classList.toggle('align-left', OS.settings.get('taskbarAlign') === 'left');
  }

  /* ------------------------------------------------------------------ */
  /* Start menu                                                         */
  /* ------------------------------------------------------------------ */

  const startPinned = () => (OS.settings.get('startPinned') || []).filter((id) => OS.apps.get(id));

  function toggleStartPin(id) {
    const list = startPinned();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    OS.settings.set('startPinned', list);
  }

  function moveToFront(id) {
    OS.settings.set('startPinned', [id, ...startPinned().filter((x) => x !== id)]);
  }

  function addToDesktop(app) {
    // Named by app id so the label follows the system language (see fileOps.displayName).
    const dir = OS.desktop.DESKTOP;
    OS.vfs.writeFile(`${dir}/${OS.vfs.uniqueName(dir, `${app.id}.app`)}`, JSON.stringify({ app: app.id }));
  }

  function launch(id, opts) {
    OS.ui.closePopup();
    OS.wm.open(id, opts);
  }

  function recentFiles(limit) {
    const files = [];
    for (const entry of OS.vfs.walk(OS.vfs.HOME)) {
      if (entry.type !== 'file' || entry.name.endsWith('.app')) continue;
      files.push({ ...entry, mtime: OS.vfs.stat(entry.path).mtime });
    }
    return files.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  }

  function entryIcon(entry) {
    const content = entry.type === 'file' && OS.icons.fileKind(entry.name) === 'image' ? OS.vfs.readFile(entry.path) : null;
    return OS.icons.forEntry(entry, content);
  }

  function resultButton({ iconHtml, name, sub, onClick, onContext }) {
    const btn = h('button', {
      class: 'start-result',
      html: `<span class="result-icon">${iconHtml}</span><span class="result-text"><div class="result-name">${escapeHtml(name)}</div>${sub ? `<div class="result-sub">${escapeHtml(sub)}</div>` : ''}</span>`,
    });
    btn.addEventListener('click', onClick);
    if (onContext) btn.addEventListener('contextmenu', (e) => { e.preventDefault(); onContext(e); });
    return btn;
  }

  function openFile(path) {
    OS.ui.closePopup();
    OS.apps.openPath(path);
  }

  function openLocation(path) {
    OS.ui.closePopup();
    OS.wm.open('explorer', { path: OS.vfs.dirname(path), select: OS.vfs.basename(path) });
  }

  function fileMenu(e, entry) {
    OS.ui.contextMenu(e.clientX, e.clientY, [
      { label: t('common.open'), icon: 'open', action: () => openFile(entry.path) },
      { label: t('start.openLocation'), icon: 'folder', action: () => openLocation(entry.path) },
    ]);
  }

  /**
   * mode: 'home' (Pinned + Recommended), 'all' (All apps) or 'search'.
   * Typing anywhere in the menu switches to search, like Windows.
   */
  function openStart(mode = 'home', owner = startBtn) {
    const el = h('div', { class: `popup start-menu${OS.settings.get('taskbarAlign') === 'left' ? ' align-left' : ''}`, role: 'dialog', 'aria-label': t('start.label') });
    const input = h('input', { class: 'input', type: 'search', placeholder: t('start.searchPlaceholder'), 'aria-label': t('start.search'), spellcheck: false, autocomplete: 'off' });
    const body = h('div', { class: 'start-body' });
    let view = mode;

    const appMenu = (e, app) => {
      const pinnedHere = startPinned();
      const inStart = pinnedHere.includes(app.id);
      const onTaskbar = (OS.settings.get('pinned') || []).includes(app.id);
      OS.ui.contextMenu(e.clientX, e.clientY, [
        { label: t('common.open'), icon: 'open', action: () => launch(app.id) },
        '-',
        inStart && pinnedHere[0] !== app.id ? { label: t('start.moveToFront'), icon: 'up', action: () => { moveToFront(app.id); show(); } } : null,
        { label: t(inStart ? 'start.unpinFromStart' : 'start.pinToStart'), icon: inStart ? 'unpin' : 'pin', action: () => { toggleStartPin(app.id); show(); } },
        { label: t(onTaskbar ? 'taskbar.unpin' : 'taskbar.pin'), icon: onTaskbar ? 'unpin' : 'pin', action: () => togglePin(app.id) },
        { label: t('start.addToDesktop'), icon: 'monitor', action: () => addToDesktop(app) },
      ]);
    };

    const appTile = (app) => {
      const b = h('button', { class: 'start-app', title: app.description || app.name, html: `${OS.icons.appIcon(app)}<span>${escapeHtml(app.name)}</span>` });
      b.addEventListener('click', () => launch(app.id));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); appMenu(e, app); });
      return b;
    };

    const sectionHead = (title, btnLabel, btnGlyph, onClick, glyphFirst = false) => {
      const head = h('div', { class: 'start-section-head' }, h('h2', { text: title }));
      if (btnLabel) {
        const icon = glyph(btnGlyph);
        const label = `<span>${escapeHtml(btnLabel)}</span>`;
        head.appendChild(h('button', { class: 'start-head-btn', html: glyphFirst ? icon + label : label + icon, onclick: onClick }));
      }
      return head;
    };

    function showHome() {
      body.appendChild(sectionHead(t('start.pinned'), t('start.allApps'), 'chevronRight', () => { view = 'all'; show(); }));
      const pinned = startPinned();
      body.appendChild(pinned.length
        ? h('div', { class: 'start-grid' }, pinned.map((id) => appTile(OS.apps.get(id))))
        : h('div', { class: 'start-empty', text: t('start.noPinned') }));

      body.appendChild(sectionHead(t('start.recommended')));
      const recent = recentFiles(6);
      body.appendChild(recent.length
        ? h('div', { class: 'start-recommended' }, recent.map((entry) => resultButton({
          iconHtml: entryIcon(entry),
          name: OS.fileOps.displayName(entry.name),
          sub: relativeTime(entry.mtime),
          onClick: () => openFile(entry.path),
          onContext: (e) => fileMenu(e, entry),
        })))
        : h('div', { class: 'start-empty', text: t('start.noRecommended') }));
    }

    function showAll() {
      body.appendChild(sectionHead(t('start.allApps'), t('start.back'), 'back', () => { view = 'home'; show(); }, true));
      const list = h('div', { class: 'start-list' });
      let letter = null;
      OS.apps.list().forEach((app) => {
        const first = app.name.charAt(0).toLocaleUpperCase(LOCALE);
        const head = /\p{L}/u.test(first) ? first : '#';
        if (head !== letter) {
          letter = head;
          list.appendChild(h('div', { class: 'start-alpha', text: head }));
        }
        list.appendChild(resultButton({
          iconHtml: OS.icons.appIcon(app),
          name: app.name,
          onClick: () => launch(app.id),
          onContext: (e) => appMenu(e, app),
        }));
      });
      body.appendChild(list);
    }

    /* Search ------------------------------------------------------- */

    let results = []; // { el, preview }
    let highlight = 0;
    let preview = null;

    /** Apps ranked like Windows search: name prefix, then word prefix, then anywhere, then description. */
    function searchItems(q) {
      const needle = q.toLocaleLowerCase(LOCALE);
      const lower = (text) => text.toLocaleLowerCase(LOCALE);
      const score = (a) => {
        const name = lower(a.name);
        if (name.startsWith(needle)) return 4;
        if (name.split(/\s+/).some((w) => w.startsWith(needle))) return 3;
        if (name.includes(needle) || lower(a.id).includes(needle)) return 2;
        return lower([a.description || '', ...(a.keywords || [])].join(' ')).includes(needle) ? 1 : 0;
      };
      const apps = OS.apps.list().map((a) => ({ a, s: score(a) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).map((x) => x.a);
      const files = [];
      for (const entry of OS.vfs.walk('/')) {
        if (entry.name.endsWith('.app')) continue;
        if (lower(entry.name).includes(needle) || lower(OS.fileOps.displayName(entry.name)).includes(needle)) files.push(entry);
        if (files.length >= 8) break;
      }
      return { apps, files };
    }

    function appResult(app) {
      return {
        iconHtml: OS.icons.appIcon(app),
        name: app.name,
        sub: t('start.app'),
        open: () => launch(app.id),
        context: (e) => appMenu(e, app),
        actions: [
          { label: t('common.open'), icon: 'open', action: () => launch(app.id) },
          { label: t((OS.settings.get('startPinned') || []).includes(app.id) ? 'start.unpinFromStart' : 'start.pinToStart'), icon: 'pin', action: () => { toggleStartPin(app.id); refreshPreview(); } },
          { label: t((OS.settings.get('pinned') || []).includes(app.id) ? 'taskbar.unpin' : 'taskbar.pin'), icon: 'pin', action: () => { togglePin(app.id); refreshPreview(); } },
        ],
      };
    }

    function fileResult(entry) {
      const isDir = entry.type === 'dir';
      return {
        iconHtml: entryIcon(entry),
        name: OS.fileOps.displayName(entry.name),
        sub: `${isDir ? t('fileops.types.folder') : OS.fileOps.typeLabel(entry.name)} · ${tildePath(OS.vfs.dirname(entry.path))}`,
        open: () => openFile(entry.path),
        context: (e) => fileMenu(e, entry),
        actions: [
          { label: t('common.open'), icon: 'open', action: () => openFile(entry.path) },
          { label: t('start.openLocation'), icon: 'folder', action: () => openLocation(entry.path) },
        ],
      };
    }

    function webResult(q) {
      const browser = OS.apps.get('browser');
      return {
        iconHtml: OS.icons.appIcon(browser),
        name: q,
        sub: t('start.searchWebSub'),
        open: () => launch('browser', { url: q }),
        actions: [{ label: t('start.openIn', { app: browser.name }), icon: 'globe', action: () => launch('browser', { url: q }) }],
      };
    }

    function renderPreview() {
      const item = results[highlight] && results[highlight].item;
      if (!preview) return;
      preview.innerHTML = '';
      if (!item) return;
      preview.append(
        h('div', { class: 'preview-icon', html: item.iconHtml }),
        h('div', { class: 'preview-name', text: item.name }),
        h('div', { class: 'preview-sub', text: item.sub || '' }),
        h('div', { class: 'preview-actions' }, item.actions.map((a) => h('button', { html: `${glyph(a.icon)}<span>${escapeHtml(a.label)}</span>`, onclick: a.action })))
      );
    }

    function refreshPreview() {
      const keep = highlight;
      show();
      highlight = Math.max(0, Math.min(keep, results.length - 1));
      updateHighlight(false);
    }

    function showSearch(q) {
      results = [];
      highlight = 0;
      const left = h('div', { class: 'start-search-main' });
      const group = (title, items) => {
        if (!items.length) return;
        left.appendChild(h('div', { class: 'start-group-title', text: title }));
        const list = h('div', { class: 'start-results' });
        items.forEach((item) => {
          const index = results.length;
          const el = resultButton({ iconHtml: item.iconHtml, name: item.name, sub: item.sub, onClick: item.open, onContext: item.context });
          el.addEventListener('pointerenter', () => { highlight = index; updateHighlight(false); });
          results.push({ el, item });
          list.appendChild(el);
        });
        left.appendChild(list);
      };

      if (!q) {
        // Empty search: top apps and recent files.
        left.appendChild(h('div', { class: 'start-group-title', text: t('start.topApps') }));
        left.appendChild(h('div', { class: 'start-grid start-grid-compact' }, startPinned().slice(0, 6).map((id) => appTile(OS.apps.get(id)))));
        group(t('start.recent'), recentFiles(5).map(fileResult));
        body.appendChild(h('div', { class: 'start-search-view start-search-empty' }, left));
        preview = null;
        updateHighlight(false);
        return;
      }

      const { apps, files } = searchItems(q);
      const all = [...apps.map(appResult), ...files.map(fileResult)];
      if (all.length) group(t('start.bestMatch'), [all[0]]);
      // The best match is the first app, or the first file when no app matches.
      group(t('start.apps'), apps.slice(1).map(appResult));
      group(t('start.files'), files.slice(apps.length ? 0 : 1).map(fileResult));
      group(t('start.web'), [webResult(q)]);
      preview = h('div', { class: 'start-preview' });
      body.appendChild(h('div', { class: 'start-search-view' }, left, preview));
      updateHighlight();
    }

    function updateHighlight(scroll = true) {
      results.forEach((r, i) => r.el.classList.toggle('highlight', i === highlight));
      if (scroll && results[highlight]) results[highlight].el.scrollIntoView({ block: 'nearest' });
      renderPreview();
    }

    function show() {
      body.innerHTML = '';
      results = [];
      preview = null;
      el.classList.toggle('searching', view === 'search');
      if (view === 'search') showSearch(input.value.trim());
      else if (view === 'all') showAll();
      else showHome();
      body.scrollTop = 0;
    }

    input.addEventListener('input', () => {
      view = input.value.trim() || mode === 'search' ? 'search' : 'home';
      show();
    });
    input.addEventListener('keydown', (e) => {
      if (!results.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight = (highlight + 1) % results.length; updateHighlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight = (highlight - 1 + results.length) % results.length; updateHighlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); results[highlight].item.open(); }
    });
    // Typing while the menu has focus goes to the search box.
    el.addEventListener('keydown', (e) => {
      if (e.target === input || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      input.focus();
    });

    /* Footer: account and power ----------------------------------- */

    const userName = OS.settings.userName();
    const userBtn = h('button', {
      class: 'start-user',
      title: userName,
      html: `<span class="avatar">${escapeHtml(userName.charAt(0).toLocaleUpperCase(LOCALE))}</span><span>${escapeHtml(userName)}</span>`,
      onclick: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        OS.ui.contextMenu(r.left, r.top - 8, [
          { label: t('start.account'), icon: 'user', action: () => launch('settings', { section: 'system' }) },
          '-',
          { label: t('start.lock'), icon: 'lock', action: () => { OS.ui.closePopup(); OS.session.lock(); } },
          { label: t('start.signOut'), icon: 'logout', action: () => { OS.ui.closePopup(); OS.session.signOut(); } },
        ], { above: true });
      },
    });
    const powerBtn = h('button', {
      class: 'icon-btn',
      title: t('start.power'),
      'aria-label': t('start.power'),
      html: glyph('power'),
      onclick: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        OS.ui.contextMenu(r.right, r.top - 8, [
          { label: t('start.lock'), icon: 'lock', action: () => { OS.ui.closePopup(); OS.session.lock(); } },
          { label: t('start.shutdown'), icon: 'power', action: () => { OS.ui.closePopup(); OS.session.shutdown(); } },
          { label: t('start.restart'), icon: 'restart', action: () => { OS.ui.closePopup(); OS.session.restart(); } },
        ], { above: true, alignRight: true });
      },
    });

    el.append(
      h('div', { class: 'start-search', html: glyph('search') }, input),
      body,
      h('div', { class: 'start-footer' }, userBtn, powerBtn)
    );
    show();
    OS.ui.openPopup(el, { owner });
    setTimeout(() => input.focus(), 30);
  }

  function toggleStart() {
    if (OS.ui.isPopupOpen(startBtn)) OS.ui.closePopup();
    else openStart('home', startBtn);
  }

  function toggleSearch() {
    if (OS.ui.isPopupOpen(searchBtn)) OS.ui.closePopup();
    else openStart('search', searchBtn);
  }

  /* ------------------------------------------------------------------ */
  /* Tray: quick settings                                               */
  /* ------------------------------------------------------------------ */

  let battery = null;
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      battery = b;
      b.addEventListener('levelchange', renderTray);
      b.addEventListener('chargingchange', renderTray);
      renderTray();
    }).catch(() => {});
  }
  const batteryText = () => (battery ? `${Math.round(battery.level * 100)}%${battery.charging ? ` · ${t('quick.charging')}` : ''}` : '100%');

  function renderTray() {
    if (!quickBtn) return;
    const s = OS.settings;
    const net = s.get('airplane') ? 'plane' : 'wifi';
    quickBtn.innerHTML = glyph(net) + glyph('volume') + glyph('battery');
    quickBtn.classList.toggle('wifi-off', !s.get('wifi') && !s.get('airplane'));
    const network = t(s.get('airplane') ? 'quick.airplaneOn' : s.get('wifi') ? 'quick.connected' : 'quick.wifiOff');
    quickBtn.title = t('quick.status', { network, volume: s.get('volume'), battery: batteryText() });
  }

  function openQuickSettings() {
    const s = OS.settings;
    const el = h('div', { class: 'popup tray-popup', role: 'dialog', 'aria-label': t('quick.label') });

    const tiles = [
      { key: 'wifi', label: t('quick.wifi'), icon: 'wifi' },
      { key: 'bluetooth', label: t('quick.bluetooth'), icon: 'bluetooth' },
      { key: 'airplane', label: t('quick.airplane'), icon: 'plane' },
      { key: 'theme', label: t('quick.darkMode'), icon: 'moon', get: () => s.get('theme') === 'dark', set: (on) => s.set('theme', on ? 'dark' : 'light') },
      { key: 'nightLight', label: t('quick.nightLight'), icon: 'sun' },
      { key: 'animations', label: t('quick.animations'), icon: 'sparkles' },
    ];
    const grid = h('div', { class: 'qs-grid' });
    const syncs = tiles.map((tile) => {
      const get = tile.get || (() => !!s.get(tile.key));
      const set = tile.set || ((on) => s.set(tile.key, on));
      const btn = h('button', { html: glyph(tile.icon), 'aria-label': tile.label });
      const wrap = h('div', { class: 'qs-tile' }, btn, h('span', { text: tile.label }));
      const sync = () => {
        wrap.classList.toggle('on', get());
        btn.setAttribute('aria-pressed', get() ? 'true' : 'false');
      };
      btn.addEventListener('click', () => {
        const on = !get();
        set(on);
        if (tile.key === 'airplane' && on) { s.set('wifi', false); s.set('bluetooth', false); }
        if ((tile.key === 'wifi' || tile.key === 'bluetooth') && on) s.set('airplane', false);
        syncs.forEach((fn) => fn());
      });
      grid.appendChild(wrap);
      sync();
      return sync;
    });

    const slider = (icon, key, min, label) => {
      const input = h('input', { type: 'range', min, max: 100, value: s.get(key), 'aria-label': label });
      const out = h('output', { text: `${s.get(key)}` });
      input.addEventListener('input', () => {
        s.set(key, Number(input.value));
        out.textContent = input.value;
      });
      OS.ui.syncRange(input);
      return h('div', { class: 'qs-slider', title: label, html: glyph(icon) }, input, out);
    };

    el.append(
      h('div', { class: 'qs-body' },
        grid,
        slider('sun', 'brightness', 30, t('quick.brightness')),
        slider('volume', 'volume', 0, t('quick.volume'))),
      h('div', { class: 'qs-footer' },
        h('span', { html: `${glyph('battery')} ${escapeHtml(batteryText())}` }),
        h('button', { class: 'icon-btn', title: t('quick.allSettings'), 'aria-label': t('quick.allSettings'), html: glyph('settings'), onclick: () => launch('settings') }))
    );
    OS.ui.openPopup(el, { owner: quickBtn });
  }

  /* ------------------------------------------------------------------ */
  /* Tray: clock, notification center & calendar                        */
  /* ------------------------------------------------------------------ */

  let unread = false;

  function renderClockBadge() {
    const row = clockBtn.querySelector('.clock-row');
    const dot = row.querySelector('.notif-dot');
    if (unread && !dot) row.prepend(h('span', { class: 'notif-dot', title: t('calendar.newNotifications') }));
    else if (!unread && dot) dot.remove();
  }

  function openNotificationCenter() {
    unread = false;
    renderClockBadge();
    // Banners already on screen move into the center.
    document.querySelectorAll('#toasts .toast').forEach((el) => el.remove());
    const el = h('div', { class: 'popup notif-center', role: 'dialog', 'aria-label': t('calendar.label') });
    const today = new Date();
    let view = new Date(today.getFullYear(), today.getMonth(), 1);

    /* Notifications */
    const head = h('div', { class: 'nc-head' }, h('span', { text: t('calendar.notifications') }));
    const list = h('div');
    const renderNotifs = () => {
      const items = OS.ui.notifications.history;
      head.querySelector('.link-btn')?.remove();
      if (items.length) head.appendChild(h('button', { class: 'link-btn', text: t('calendar.clearAll'), onclick: () => OS.ui.notifications.clear() }));
      list.className = items.length ? 'nc-list' : 'nc-empty';
      list.innerHTML = items.length
        ? items.map((n) => {
          const app = n.app && OS.apps.get(n.app);
          return `<div class="nc-item"><div class="nc-item-head">${app ? OS.icons.appIcon(app, 'xs') : glyph(n.icon || 'bell')}<span>${escapeHtml(app ? app.name : 'AwanOS')}</span><time>${escapeHtml(relativeTime(n.time))}</time></div>` +
            `<strong>${escapeHtml(n.title)}</strong>${n.body ? `<span>${escapeHtml(n.body)}</span>` : ''}</div>`;
        }).join('')
        : escapeHtml(t('calendar.noNotifications'));
    };
    renderNotifs();
    const offNotify = OS.ui.notifications.on('change', () => {
      if (!el.isConnected) return;
      renderNotifs();
      unread = false;
      renderClockBadge();
    });

    /* Calendar */
    const title = h('strong');
    const gridEl = h('div', { class: 'cal-grid', role: 'grid' });
    const renderMonth = () => {
      title.textContent = monthFmt.format(view);
      let html = WEEKDAYS.map((d) => `<div class="dow">${escapeHtml(d)}</div>`).join('');
      const first = new Date(view.getFullYear(), view.getMonth(), 1);
      const start = new Date(first);
      start.setDate(1 - ((first.getDay() - FIRST_DAY + 7) % 7));
      for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const cls = ['day'];
        if (d.getMonth() !== view.getMonth()) cls.push('muted');
        if (d.toDateString() === today.toDateString()) cls.push('today');
        html += `<div class="${cls.join(' ')}" title="${escapeHtml(longDateFmt.format(d))}">${d.getDate()}</div>`;
      }
      gridEl.innerHTML = html;
    };
    const nav = (delta) => {
      view = new Date(view.getFullYear(), view.getMonth() + delta, 1);
      renderMonth();
    };
    renderMonth();
    gridEl.addEventListener('wheel', (e) => { e.preventDefault(); nav(e.deltaY > 0 ? 1 : -1); }, { passive: false });

    const calBody = h('div', { class: 'cal-body' },
      h('div', { class: 'cal-head' },
        title,
        h('div', {},
          h('button', { class: 'icon-btn', title: t('calendar.prevMonth'), 'aria-label': t('calendar.prevMonth'), html: glyph('chevronUp'), onclick: () => nav(-1) }),
          h('button', { class: 'icon-btn', title: t('calendar.nextMonth'), 'aria-label': t('calendar.nextMonth'), html: glyph('down'), onclick: () => nav(1) }))),
      gridEl);
    const collapseBtn = h('button', { class: 'icon-btn', title: t('calendar.collapse'), 'aria-label': t('calendar.collapse'), 'aria-expanded': 'true', html: glyph('down') });
    collapseBtn.addEventListener('click', () => {
      calBody.hidden = !calBody.hidden;
      collapseBtn.setAttribute('aria-expanded', calBody.hidden ? 'false' : 'true');
      collapseBtn.innerHTML = glyph(calBody.hidden ? 'chevronUp' : 'down');
    });
    const dateHead = h('div', { class: 'cal-date-head' },
      h('button', { class: 'link-btn cal-today', text: ncDateFmt.format(today), title: t('calendar.today'), onclick: () => { view = new Date(today.getFullYear(), today.getMonth(), 1); renderMonth(); } }),
      collapseBtn);

    el.append(
      h('div', { class: 'nc-panel' }, head, list),
      h('div', { class: 'nc-panel' }, dateHead, calBody)
    );
    OS.ui.openPopup(el, { owner: clockBtn, onClose: offNotify });
  }

  function tick() {
    const d = new Date();
    clockBtn.querySelector('.clock-time').textContent = timeFmt(OS.settings.get('clockSeconds')).format(d);
    clockBtn.querySelector('.clock-date').textContent = shortDateFmt.format(d);
    clockBtn.title = longDateFmt.format(d);
  }

  /* ------------------------------------------------------------------ */

  function init() {
    bar = document.getElementById('taskbar');
    startBtn = document.getElementById('start-button');
    searchBtn = document.getElementById('search-button');
    appsBar = document.getElementById('taskbar-apps');
    quickBtn = document.getElementById('tray-quick');
    clockBtn = document.getElementById('tray-clock');

    startBtn.innerHTML = OS.icons.logo();
    searchBtn.insertAdjacentHTML('afterbegin', glyph('search'));
    startBtn.addEventListener('click', toggleStart);
    searchBtn.addEventListener('click', toggleSearch);
    quickBtn.addEventListener('click', () => (OS.ui.isPopupOpen(quickBtn) ? OS.ui.closePopup() : openQuickSettings()));
    clockBtn.addEventListener('click', () => (OS.ui.isPopupOpen(clockBtn) ? OS.ui.closePopup() : openNotificationCenter()));
    document.getElementById('show-desktop').addEventListener('click', () => OS.wm.toggleDesktop());
    bar.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tb-app')) return;
      e.preventDefault();
      const tm = OS.apps.get('taskmanager');
      OS.ui.contextMenu(e.clientX, e.clientY - 8, [
        { label: tm.name, iconHtml: OS.icons.appIcon(tm, 'xs'), action: () => OS.wm.open('taskmanager') },
        { label: t('taskbar.settings'), icon: 'settings', action: () => OS.wm.open('settings', { section: 'personalization' }) },
      ], { above: true });
    });

    OS.ui.notifications.on('change', () => {
      unread = OS.ui.notifications.history.length > 0 && !OS.ui.isPopupOpen(clockBtn);
      renderClockBadge();
    });
    OS.wm.on('change', render);
    OS.settings.on('change', (key) => {
      if (key === 'pinned') render();
      if (key === 'taskbarAlign') applyAlign();
      if (['wifi', 'volume', 'airplane'].includes(key)) renderTray();
      if (key === 'clockSeconds') tick();
    });
    applyAlign();
    render();
    renderTray();
    tick();
    setInterval(tick, 1000);
  }

  OS.taskbar = { init, render, buttonRect, toggleStart, toggleSearch };
})();
