/* AwanOS — taskbar, start menu and system tray */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, escapeHtml } = OS.utils;
  const { glyph } = OS.icons;

  let startBtn;
  let appsBar;
  let quickBtn;
  let clockBtn;
  const buttons = new Map(); // appId -> button

  const timeFmt = (withSeconds) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: withSeconds ? '2-digit' : undefined });
  const shortDateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const longDateFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });
  const relFmt = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });

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
      btn.classList.toggle('focused', !!active && active.appId === id);
      btn.title = appWins.length === 1 ? appWins[0].title : app.name;
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
    OS.ui.contextMenu(r.left, r.top - 6, [
      { header: OS.apps.get(id).name },
      ...wins.map((w) => ({ label: w.title, iconHtml: OS.icons.appIcon(w.app, 'xs'), checked: OS.wm.active() === w, action: () => w.focus() })),
    ], { above: true });
  }

  function appMenu(id, btn) {
    const app = OS.apps.get(id);
    const wins = OS.wm.byApp(id);
    const pinned = OS.settings.get('pinned') || [];
    const isPinned = pinned.includes(id);
    const r = btn.getBoundingClientRect();
    OS.ui.contextMenu(r.left, r.top - 6, [
      { header: app.name },
      { label: 'Jendela baru', icon: 'plus', disabled: app.singleInstance && wins.length > 0, action: () => OS.wm.open(id) },
      {
        label: isPinned ? 'Lepas sematan dari bilah tugas' : 'Sematkan ke bilah tugas',
        icon: isPinned ? 'close' : 'plus',
        action: () => togglePin(id),
      },
      wins.length ? '-' : null,
      wins.length ? { label: wins.length > 1 ? 'Tutup semua jendela' : 'Tutup jendela', icon: 'close', danger: true, action: () => wins.forEach((w) => w.close()) } : null,
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

  /* ------------------------------------------------------------------ */
  /* Start menu                                                         */
  /* ------------------------------------------------------------------ */

  function toggleStart() {
    if (OS.ui.isPopupOpen(startBtn)) OS.ui.closePopup();
    else openStart();
  }

  function recentFiles(limit = 6) {
    const files = [];
    for (const entry of OS.vfs.walk(OS.vfs.HOME)) {
      if (entry.type !== 'file' || entry.name.endsWith('.app')) continue;
      const st = OS.vfs.stat(entry.path);
      files.push({ ...entry, mtime: st.mtime });
    }
    return files.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  }

  function resultRow({ iconHtml, name, sub, action }) {
    const btn = h('button', {
      class: 'start-result',
      html: `<span class="result-icon">${iconHtml}</span><span class="result-text"><div class="result-name">${escapeHtml(name)}</div>${sub ? `<div class="result-sub">${escapeHtml(sub)}</div>` : ''}</span>`,
    });
    btn.addEventListener('click', () => {
      OS.ui.closePopup();
      action();
    });
    return btn;
  }

  function fileRow(entry) {
    let content = null;
    if (OS.icons.fileKind(entry.name) === 'image') content = OS.vfs.readFile(entry.path);
    return resultRow({
      iconHtml: `<span style="width:28px;height:28px;display:grid">${OS.icons.forEntry(entry, content)}</span>`,
      name: OS.fileOps.displayName(entry.name),
      sub: OS.vfs.dirname(entry.path).replace(OS.vfs.HOME, '~'),
      action: () => OS.apps.openPath(entry.path),
    });
  }

  function openStart() {
    const el = h('div', { class: 'popup start-menu', role: 'dialog', 'aria-label': 'Menu Mulai' });
    const input = h('input', { class: 'input', type: 'search', placeholder: 'Cari aplikasi, berkas, atau web', 'aria-label': 'Cari', spellcheck: false });
    const body = h('div', { class: 'start-body' });
    const user = OS.settings.get('username');

    const appButton = (app) => {
      const b = h('button', { class: 'start-app', title: app.description || app.name, html: `${OS.icons.appIcon(app)}<span>${escapeHtml(app.name)}</span>` });
      b.addEventListener('click', () => {
        OS.ui.closePopup();
        OS.wm.open(app.id);
      });
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const pinned = (OS.settings.get('pinned') || []).includes(app.id);
        OS.ui.contextMenu(e.clientX, e.clientY, [
          { label: 'Buka', icon: 'open', action: () => { OS.ui.closePopup(); OS.wm.open(app.id); } },
          { label: pinned ? 'Lepas sematan dari bilah tugas' : 'Sematkan ke bilah tugas', icon: pinned ? 'close' : 'plus', action: () => togglePin(app.id) },
          {
            label: 'Tambahkan ke desktop', icon: 'monitor',
            action: () => {
              const dir = OS.desktop.DESKTOP;
              OS.vfs.writeFile(`${dir}/${OS.vfs.uniqueName(dir, `${app.name}.app`)}`, JSON.stringify({ app: app.id }));
            },
          },
        ]);
      });
      return b;
    };

    function showHome() {
      body.innerHTML = '';
      body.appendChild(h('div', { class: 'start-section-title' }, h('span', { text: 'Semua aplikasi' })));
      body.appendChild(h('div', { class: 'start-grid' }, OS.apps.list().map(appButton)));
      const recent = recentFiles();
      if (recent.length) {
        body.appendChild(h('div', { class: 'start-section-title' }, h('span', { text: 'Berkas terbaru' })));
        body.appendChild(h('div', { class: 'start-results' }, recent.map(fileRow)));
      }
    }

    let results = [];
    let highlight = 0;

    function showSearch(q) {
      const needle = q.toLowerCase();
      body.innerHTML = '';
      const apps = OS.apps.list().filter((a) => [a.name, a.id, a.description || '', ...(a.keywords || [])].join(' ').toLowerCase().includes(needle));
      const files = [];
      for (const entry of OS.vfs.walk('/')) {
        if (entry.name.toLowerCase().includes(needle) && !entry.name.endsWith('.app')) files.push(entry);
        if (files.length >= 8) break;
      }
      results = [];
      if (apps.length) {
        body.appendChild(h('div', { class: 'start-section-title', text: 'Aplikasi' }));
        const list = h('div', { class: 'start-results' });
        apps.forEach((app) => {
          const row = resultRow({ iconHtml: OS.icons.appIcon(app), name: app.name, sub: app.description, action: () => OS.wm.open(app.id) });
          results.push(row);
          list.appendChild(row);
        });
        body.appendChild(list);
      }
      if (files.length) {
        body.appendChild(h('div', { class: 'start-section-title', text: 'Berkas & folder' }));
        const list = h('div', { class: 'start-results' });
        files.forEach((entry) => {
          const row = entry.type === 'dir'
            ? resultRow({ iconHtml: `<span style="width:28px;height:28px;display:grid">${OS.icons.folder}</span>`, name: entry.name, sub: OS.vfs.dirname(entry.path).replace(OS.vfs.HOME, '~'), action: () => OS.apps.openPath(entry.path) })
            : fileRow(entry);
          results.push(row);
          list.appendChild(row);
        });
        body.appendChild(list);
      }
      body.appendChild(h('div', { class: 'start-section-title', text: 'Web' }));
      const web = resultRow({ iconHtml: OS.icons.appIcon(OS.apps.get('browser')), name: `Cari "${q}" di web`, sub: 'Buka di Browser', action: () => OS.wm.open('browser', { url: q }) });
      results.push(web);
      body.appendChild(h('div', { class: 'start-results' }, web));
      highlight = 0;
      updateHighlight();
    }

    function updateHighlight() {
      results.forEach((r, i) => r.classList.toggle('highlight', i === highlight));
      if (results[highlight]) results[highlight].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (q) showSearch(q);
      else {
        results = [];
        showHome();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (!results.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight = (highlight + 1) % results.length; updateHighlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight = (highlight - 1 + results.length) % results.length; updateHighlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); results[highlight].click(); }
    });

    const userBtn = h('button', {
      class: 'start-user',
      title: 'Pengaturan akun',
      html: `<span class="avatar">${escapeHtml((user || '?').trim().charAt(0).toUpperCase())}</span><span>${escapeHtml(user)}</span>`,
      onclick: () => { OS.ui.closePopup(); OS.wm.open('settings', { section: 'system' }); },
    });
    const powerBtn = h('button', {
      class: 'icon-btn',
      title: 'Daya',
      'aria-label': 'Daya',
      html: glyph('power'),
      onclick: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        OS.ui.contextMenu(r.right, r.top - 6, [
          { label: 'Kunci', icon: 'lock', action: () => { OS.ui.closePopup(); OS.session.lock(); } },
          { label: 'Keluar', icon: 'logout', action: () => { OS.ui.closePopup(); OS.session.signOut(); } },
          '-',
          { label: 'Mulai ulang', icon: 'restart', action: () => { OS.ui.closePopup(); OS.session.restart(); } },
          { label: 'Matikan', icon: 'power', danger: true, action: () => { OS.ui.closePopup(); OS.session.shutdown(); } },
        ], { above: true, alignRight: true });
      },
    });

    el.append(
      h('div', { class: 'start-search', html: glyph('search') }, input),
      body,
      h('div', { class: 'start-footer' }, userBtn, powerBtn)
    );
    showHome();
    OS.ui.openPopup(el, { owner: startBtn });
    setTimeout(() => input.focus(), 30);
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
  const batteryText = () => (battery ? `${Math.round(battery.level * 100)}%${battery.charging ? ' · mengisi daya' : ''}` : '100%');

  function renderTray() {
    if (!quickBtn) return;
    const s = OS.settings;
    const net = s.get('airplane') ? 'plane' : 'wifi';
    quickBtn.innerHTML = glyph(net) + glyph('volume') + glyph('battery');
    quickBtn.title = `${s.get('airplane') ? 'Mode pesawat aktif' : s.get('wifi') ? 'Terhubung ke AwanNet' : 'Wi-Fi mati'} · Volume ${s.get('volume')}% · Baterai ${batteryText()}`;
  }

  function openQuickSettings() {
    const s = OS.settings;
    const el = h('div', { class: 'popup tray-popup', role: 'dialog', 'aria-label': 'Pengaturan cepat' });

    const tiles = [
      { key: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
      { key: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth' },
      { key: 'airplane', label: 'Mode pesawat', icon: 'plane' },
      { key: 'theme', label: 'Mode gelap', icon: 'moon', get: () => s.get('theme') === 'dark', set: (on) => s.set('theme', on ? 'dark' : 'light') },
      { key: 'nightLight', label: 'Lampu malam', icon: 'sun' },
      { key: 'animations', label: 'Animasi', icon: 'sparkles' },
    ];
    const grid = h('div', { class: 'qs-grid' });
    const tileEls = tiles.map((t) => {
      const get = t.get || (() => !!s.get(t.key));
      const set = t.set || ((on) => s.set(t.key, on));
      const btn = h('button', { html: glyph(t.icon), 'aria-label': t.label });
      const wrap = h('div', { class: 'qs-tile' }, btn, h('span', { text: t.label }));
      const sync = () => {
        wrap.classList.toggle('on', get());
        btn.setAttribute('aria-pressed', get() ? 'true' : 'false');
      };
      btn.addEventListener('click', () => {
        const on = !get();
        set(on);
        if (t.key === 'airplane' && on) { s.set('wifi', false); s.set('bluetooth', false); }
        if ((t.key === 'wifi' || t.key === 'bluetooth') && on) s.set('airplane', false);
        tileEls.forEach((fn) => fn());
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
      return h('div', { class: 'qs-slider', html: glyph(icon) }, input, out);
    };

    el.append(
      grid,
      slider('sun', 'brightness', 30, 'Kecerahan'),
      slider('volume', 'volume', 0, 'Volume'),
      h('div', { class: 'qs-footer' },
        h('span', { html: `${glyph('battery')} ${escapeHtml(batteryText())}` }),
        h('button', { class: 'icon-btn', title: 'Semua pengaturan', 'aria-label': 'Semua pengaturan', html: glyph('settings'), onclick: () => { OS.ui.closePopup(); OS.wm.open('settings'); } }))
    );
    OS.ui.openPopup(el, { owner: quickBtn });
  }

  /* ------------------------------------------------------------------ */
  /* Tray: clock, notifications & calendar                              */
  /* ------------------------------------------------------------------ */

  function openCalendar() {
    const el = h('div', { class: 'popup tray-popup', role: 'dialog', 'aria-label': 'Kalender' });
    const today = new Date();
    let view = new Date(today.getFullYear(), today.getMonth(), 1);

    const notifHead = h('h3', {}, h('span', { text: 'Notifikasi' }));
    const notifList = h('div');
    const renderNotifs = () => {
      const items = OS.ui.notifications.history;
      notifHead.querySelector('.link-btn')?.remove();
      if (items.length) notifHead.appendChild(h('button', { class: 'link-btn', text: 'Hapus semua', onclick: () => { OS.ui.notifications.clear(); renderNotifs(); } }));
      notifList.className = items.length ? 'notif-list' : 'notif-empty';
      notifList.innerHTML = items.length
        ? items.map((n) => {
          const mins = Math.round((n.time - Date.now()) / 60000);
          return `<div class="notif-item"><time>${escapeHtml(relFmt.format(mins, 'minute'))}</time><strong>${escapeHtml(n.title)}</strong>${n.body ? `<span>${escapeHtml(n.body)}</span>` : ''}</div>`;
        }).join('')
        : 'Tidak ada notifikasi baru';
    };
    renderNotifs();

    const now = h('div', { class: 'cal-now' }, h('div', { class: 'cal-time' }), h('div', { class: 'cal-date', text: longDateFmt.format(today) }));
    const updateNow = () => { now.firstChild.textContent = timeFmt(true).format(new Date()); };
    updateNow();
    const timer = setInterval(() => {
      if (!el.isConnected) return clearInterval(timer);
      updateNow();
    }, 1000);

    const title = h('strong');
    const gridEl = h('div', { class: 'cal-grid' });
    const renderMonth = () => {
      title.textContent = monthFmt.format(view);
      const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      let html = days.map((d, i) => `<div class="dow"${i === 0 ? ' style="color:var(--danger)"' : ''}>${d}</div>`).join('');
      const first = new Date(view.getFullYear(), view.getMonth(), 1);
      const start = new Date(first);
      start.setDate(1 - first.getDay());
      for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const cls = ['day'];
        if (d.getMonth() !== view.getMonth()) cls.push('muted');
        if (d.toDateString() === today.toDateString()) cls.push('today');
        const style = d.getDay() === 0 && !cls.includes('today') ? ' style="color:var(--danger)"' : '';
        html += `<div class="${cls.join(' ')}"${style}>${d.getDate()}</div>`;
      }
      gridEl.innerHTML = html;
    };
    const nav = (delta) => {
      view = new Date(view.getFullYear(), view.getMonth() + delta, 1);
      renderMonth();
    };
    renderMonth();

    el.append(
      notifHead,
      notifList,
      now,
      h('div', { class: 'cal-head' },
        title,
        h('div', {},
          h('button', { class: 'icon-btn', title: 'Bulan sebelumnya', html: glyph('back'), onclick: () => nav(-1) }),
          h('button', { class: 'icon-btn', title: 'Hari ini', html: glyph('home'), onclick: () => { view = new Date(today.getFullYear(), today.getMonth(), 1); renderMonth(); } }),
          h('button', { class: 'icon-btn', title: 'Bulan berikutnya', html: glyph('forward'), onclick: () => nav(1) }))),
      gridEl
    );
    OS.ui.openPopup(el, { owner: clockBtn });
  }

  function tick() {
    const d = new Date();
    clockBtn.querySelector('.clock-time').textContent = timeFmt(OS.settings.get('clockSeconds')).format(d);
    clockBtn.querySelector('.clock-date').textContent = shortDateFmt.format(d);
    clockBtn.title = longDateFmt.format(d);
  }

  /* ------------------------------------------------------------------ */

  function init() {
    startBtn = document.getElementById('start-button');
    appsBar = document.getElementById('taskbar-apps');
    quickBtn = document.getElementById('tray-quick');
    clockBtn = document.getElementById('tray-clock');

    startBtn.innerHTML = OS.icons.logo();
    startBtn.addEventListener('click', toggleStart);
    quickBtn.addEventListener('click', () => (OS.ui.isPopupOpen(quickBtn) ? OS.ui.closePopup() : openQuickSettings()));
    clockBtn.addEventListener('click', () => (OS.ui.isPopupOpen(clockBtn) ? OS.ui.closePopup() : openCalendar()));
    document.getElementById('show-desktop').addEventListener('click', () => OS.wm.toggleDesktop());
    document.getElementById('taskbar').addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tb-app')) return;
      e.preventDefault();
      OS.ui.contextMenu(e.clientX, e.clientY - 6, [
        { label: 'Pengelola Tugas', iconHtml: OS.icons.appIcon(OS.apps.get('taskmanager'), 'xs'), action: () => OS.wm.open('taskmanager') },
        { label: 'Tampilkan desktop', icon: 'monitor', action: () => OS.wm.toggleDesktop() },
        '-',
        { label: 'Pengaturan bilah tugas', icon: 'settings', action: () => OS.wm.open('settings', { section: 'personalization' }) },
      ], { above: true });
    });

    OS.wm.on('change', render);
    OS.settings.on('change', (key) => {
      if (key === 'pinned') render();
      if (['wifi', 'volume', 'airplane'].includes(key)) renderTray();
      if (key === 'clockSeconds') tick();
    });
    render();
    renderTray();
    tick();
    setInterval(tick, 1000);
  }

  OS.taskbar = { init, render, buttonRect, toggleStart };
})();
