/* AwanOS — Settings */
(function () {
  'use strict';
  const OS = window.OS;
  const t = OS.i18n.forApp('settings');
  const { h, escapeHtml, formatBytes, readFile } = OS.utils;
  const { glyph } = OS.icons;
  const STORAGE_LIMIT = 5 * 1024 * 1024;

  const SECTIONS = [
    { id: 'personalization', icon: 'palette' },
    { id: 'language', icon: 'globe' },
    { id: 'system', icon: 'monitor' },
    { id: 'shortcuts', icon: 'grid' },
    { id: 'about', icon: 'info' },
  ];
  const sectionName = (id) => t(`sections.${id}`);

  function downscale(dataUrl, max = 1920) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error(t('personalization.pictureUnreadable')));
      img.src = dataUrl;
    });
  }

  /** The language saved in settings when it differs from the one running now (applied on restart). */
  function pendingLanguage() {
    const code = OS.settings.get('language');
    return code && code !== OS.i18n.lang && OS.i18n.isSupported(code) ? code : null;
  }

  function launch(win, args) {
    const s = OS.settings;
    let section = args.section || 'personalization';
    const nav = h('nav', { class: 'st-nav' });
    const content = h('div', { class: 'st-content' });
    const user = h('div', { class: 'st-user' });

    win.body.classList.add('settings');
    win.body.append(h('aside', { class: 'st-side' }, user, nav), content);

    SECTIONS.forEach((sec) => {
      const b = h('button', { class: 'st-nav-item', html: `${glyph(sec.icon)}<span>${escapeHtml(sectionName(sec.id))}</span>` });
      b.dataset.id = sec.id;
      b.addEventListener('click', () => show(sec.id));
      nav.appendChild(b);
    });

    function renderUser() {
      const name = s.get('username');
      user.innerHTML = `<span class="avatar">${escapeHtml(name.trim().charAt(0).toUpperCase() || '?')}</span><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(t('localAccount'))}</span></div>`;
    }

    const card = (title, desc, control) =>
      h('div', { class: 'st-card' },
        h('div', { class: 'st-card-text' }, h('div', { class: 'st-card-title', text: title }), desc ? h('div', { class: 'st-card-desc', text: desc }) : null),
        control);

    const switchFor = (key, label, onChange) => {
      const el = h('input', { type: 'checkbox', class: 'switch', checked: !!s.get(key), 'aria-label': label });
      el.addEventListener('change', () => { s.set(key, el.checked); if (onChange) onChange(el.checked); });
      return el;
    };

    function personalization() {
      const wpGrid = h('div', { class: 'st-wallpapers' });
      const renderWallpapers = () => {
        wpGrid.innerHTML = '';
        const custom = s.customWallpaper();
        const list = [...OS.wallpapers];
        if (custom) list.push({ id: 'custom', name: OS.t('wallpapers.custom'), css: s.wallpaperCss('custom') });
        list.forEach((wp) => {
          const tile = h('button', { class: `st-wp${s.get('wallpaper') === wp.id ? ' active' : ''}`, title: wp.name, 'aria-label': wp.name });
          tile.style.background = wp.css;
          tile.appendChild(h('span', { text: wp.name }));
          tile.addEventListener('click', () => { s.set('wallpaper', wp.id); renderWallpapers(); });
          wpGrid.appendChild(tile);
        });
        const upload = h('button', { class: 'st-wp st-wp-upload', html: `${glyph('upload')}<span>${escapeHtml(t('personalization.choosePicture'))}</span>` });
        upload.addEventListener('click', () => {
          const input = h('input', { type: 'file', accept: 'image/*' });
          input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;
            try {
              const data = await downscale(await readFile(file, 'dataurl'));
              if (!s.setCustomWallpaper(data)) throw new Error(t('personalization.storageFull'));
              renderWallpapers();
            } catch (err) {
              OS.ui.showError(err, t('personalization.wallpaperFailed'));
            }
          });
          input.click();
        });
        wpGrid.appendChild(upload);
      };
      renderWallpapers();

      const themeSeg = h('div', { class: 'segmented' });
      [['light', t('personalization.light'), 'sun'], ['dark', t('personalization.dark'), 'moon']].forEach(([id, label, icon]) => {
        const b = h('button', { class: s.get('theme') === id ? 'active' : '', html: `${glyph(icon)}<span>${escapeHtml(label)}</span>` });
        b.addEventListener('click', () => {
          s.set('theme', id);
          themeSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        });
        themeSeg.appendChild(b);
      });

      const accents = h('div', { class: 'st-accents' });
      const renderAccents = () => {
        accents.innerHTML = '';
        OS.accents.forEach((c) => {
          const b = h('button', { class: `st-accent${s.get('accent') === c ? ' active' : ''}`, title: c, 'aria-label': t('personalization.accentSwatch', { color: c }), style: { background: c } });
          b.addEventListener('click', () => { s.set('accent', c); renderAccents(); });
          accents.appendChild(b);
        });
        const custom = h('input', { type: 'color', class: 'st-accent-custom', value: s.get('accent'), title: t('personalization.customColor') });
        custom.addEventListener('input', () => s.set('accent', custom.value));
        custom.addEventListener('change', renderAccents);
        accents.appendChild(custom);
      };
      renderAccents();

      return [
        h('h2', { text: sectionName('personalization') }),
        h('div', { class: 'st-preview', style: { background: s.wallpaperCss() } },
          h('div', { class: 'st-preview-window' }, h('div', { class: 'st-preview-bar' }), h('div', { class: 'st-preview-body' })),
          h('div', { class: 'st-preview-taskbar' })),
        h('h3', { text: t('personalization.background') }),
        wpGrid,
        h('h3', { text: t('personalization.colors') }),
        card(t('personalization.mode'), t('personalization.modeDesc'), themeSeg),
        card(t('personalization.accent'), t('personalization.accentDesc'), accents),
        card(t('personalization.transparency'), t('personalization.transparencyDesc'), switchFor('transparency', t('personalization.transparency'))),
        card(t('personalization.animations'), t('personalization.animationsDesc'), switchFor('animations', t('personalization.animations'))),
        card(t('personalization.clockSeconds'), null, switchFor('clockSeconds', t('personalization.clockSeconds'))),
      ];
    }

    function language() {
      const note = h('div', { class: 'st-note', role: 'status' });
      const list = h('div', { class: 'st-langs', role: 'radiogroup', 'aria-label': t('language.displayLanguage') });

      const restart = () => OS.session.restart();
      const render = () => {
        const pending = pendingLanguage();
        note.hidden = !pending;
        note.innerHTML = '';
        if (pending) {
          note.append(
            h('span', { class: 'st-note-icon', html: glyph('restart') }),
            h('span', { class: 'st-note-text', text: t('language.pending', { language: OS.i18n.info(pending).name }) }),
            h('button', { class: 'btn btn-primary', text: t('language.restartNow'), onclick: restart }));
        }
        list.innerHTML = '';
        OS.i18n.LANGUAGES.forEach((lang) => {
          const active = lang.code === OS.i18n.lang;
          const badge = active ? t('language.current') : lang.code === pending ? t('language.afterRestart') : '';
          const row = h('button', {
            class: `st-lang${active ? ' active' : ''}${lang.code === pending ? ' pending' : ''}`,
            role: 'radio',
            'aria-checked': String(lang.code === (pending || OS.i18n.lang)),
          },
          h('span', { class: 'st-lang-name', lang: lang.locale, text: lang.name }),
          badge ? h('span', { class: 'st-lang-badge', text: badge }) : null,
          h('span', { class: 'st-lang-check', html: glyph('check') }));
          row.addEventListener('click', () => choose(lang.code));
          list.appendChild(row);
        });
      };

      async function choose(code) {
        s.set('language', code);
        render();
        if (code === OS.i18n.lang) return;
        const { button } = await OS.ui.dialog({
          title: t('language.restartTitle'),
          message: t('language.restartMessage', { language: OS.i18n.info(code).name }),
          icon: 'info',
          buttons: [
            { label: t('language.restartNow'), value: 'restart', primary: true },
            { label: t('language.later'), value: 'later', cancel: true },
          ],
        });
        if (button === 'restart') restart();
      }

      render();
      return [
        h('h2', { text: sectionName('language') }),
        note,
        h('h3', { text: t('language.displayLanguage') }),
        list,
        h('p', { class: 'st-hint', text: t('language.appsNote') }),
      ];
    }

    function system() {
      const nameInput = h('input', { class: 'input', value: s.get('username'), maxlength: 32, 'aria-label': t('system.userName'), style: { width: '220px' } });
      nameInput.addEventListener('change', () => {
        const v = nameInput.value.trim();
        if (v) { s.set('username', v); renderUser(); } else nameInput.value = s.get('username');
      });

      const used = OS.storage.usage();
      const pct = Math.min(100, (used / STORAGE_LIMIT) * 100);
      const bar = h('div', { class: 'st-storage' },
        h('div', { class: 'st-storage-bar' }, h('div', { style: { width: `${pct}%` } })),
        h('div', {
          class: 'st-storage-text',
          text: t('system.usage', { used: formatBytes(used, t.locale), total: formatBytes(STORAGE_LIMIT, t.locale), files: formatBytes(OS.vfs.usage(), t.locale) }),
        }));

      const exportBtn = h('button', { class: 'btn', html: `${glyph('download')} ${escapeHtml(t('backup.export'))}` });
      exportBtn.addEventListener('click', () => {
        OS.vfs.flush();
        const data = {
          app: 'AwanOS',
          version: OS.version,
          exportedAt: new Date().toISOString(),
          settings: s.all(),
          wallpaper: s.customWallpaper(),
          fs: OS.vfs.exportData(),
        };
        const date = new Date().toISOString().slice(0, 10);
        OS.utils.download(t('backup.fileName', { date }), JSON.stringify(data), 'application/json');
      });

      const importBtn = h('button', { class: 'btn', html: `${glyph('upload')} ${escapeHtml(t('backup.import'))}` });
      importBtn.addEventListener('click', () => {
        const input = h('input', { type: 'file', accept: '.json,application/json' });
        input.addEventListener('change', async () => {
          const file = input.files[0];
          if (!file) return;
          try {
            const data = JSON.parse(await readFile(file, 'text'));
            if (data.app !== 'AwanOS' || !data.fs) throw new Error(t('backup.invalid'));
            const ok = await OS.ui.confirm(t('backup.confirm'), { title: t('backup.confirmTitle'), okLabel: t('backup.confirmOk'), danger: true });
            if (!ok) return;
            OS.vfs.importData(data.fs);
            OS.vfs.flush();
            OS.storage.write('settings', data.settings || {});
            if (data.wallpaper) OS.storage.write('wallpaper', data.wallpaper);
            location.reload();
          } catch (err) {
            OS.ui.showError(err, t('backup.failed'));
          }
        });
        input.click();
      });

      const resetBtn = h('button', { class: 'btn btn-danger', text: t('reset.button') });
      resetBtn.addEventListener('click', async () => {
        const ok = await OS.ui.confirm(t('reset.confirm'), { title: t('reset.title'), okLabel: t('reset.button'), danger: true });
        if (!ok) return;
        OS.vfs.reset();
        OS.storage.clearAll();
        location.reload();
      });

      return [
        h('h2', { text: sectionName('system') }),
        h('h3', { text: t('system.account') }),
        card(t('system.userName'), t('system.userNameDesc'), nameInput),
        h('h3', { text: t('system.storage') }),
        card(t('system.browserStorage'), t('system.browserStorageDesc'), bar),
        card(t('backup.title'), t('backup.desc'), h('div', { class: 'st-row' }, exportBtn, importBtn)),
        card(t('reset.title'), t('reset.desc'), resetBtn),
      ];
    }

    function shortcuts() {
      const appName = (id) => (OS.apps.get(id) ? OS.apps.get(id).name : id);
      const saveApps = new Intl.ListFormat(t.locale, { type: 'conjunction' }).format(['notepad', 'paint'].map(appName));
      const rows = [
        ...OS.shortcuts,
        [t('shortcuts.dragTitleBar'), t('shortcuts.dragTitleBarDesc')],
        [t('shortcuts.doubleClickTitleBar'), t('shortcuts.doubleClickTitleBarDesc')],
        ['F2', t('shortcuts.rename')],
        ['Delete', t('shortcuts.delete')],
        ['Ctrl+C / Ctrl+X / Ctrl+V', t('shortcuts.clipboard')],
        ['Ctrl+S', t('shortcuts.save', { apps: saveApps })],
      ];
      return [
        h('h2', { text: sectionName('shortcuts') }),
        h('div', { class: 'st-shortcuts' }, rows.map(([k, v]) => h('div', { class: 'st-shortcut' }, h('kbd', { text: k }), h('span', { text: v })))),
      ];
    }

    function about() {
      const match = navigator.userAgent.match(/(Firefox|Edg|OPR|Chrome|Safari)\/[\d.]+/);
      const browser = match ? match[0].replace('Edg', 'Edge').replace('OPR', 'Opera') : t('about.unknown');
      const rows = [
        [t('about.version'), `AwanOS ${OS.version}`],
        [t('about.browser'), browser],
        [t('about.platform'), navigator.platform || '—'],
        [t('about.language'), OS.i18n.info(OS.i18n.lang).name],
        [t('about.browserLanguage'), navigator.language],
        [t('about.screen'), `${screen.width} × ${screen.height} (${window.devicePixelRatio}x)`],
        [t('about.window'), `${window.innerWidth} × ${window.innerHeight}`],
        [t('about.cpuCores'), String(navigator.hardwareConcurrency || '—')],
        [t('about.installedApps'), String(OS.apps.list().length)],
      ];
      return [
        h('h2', { text: sectionName('about') }),
        h('div', { class: 'st-about' },
          h('div', { html: OS.icons.logo('lg') }),
          h('div', {},
            h('div', { class: 'st-about-name', text: 'AwanOS' }),
            h('div', { class: 'st-card-desc', text: t('about.tagline') }))),
        h('div', { class: 'st-table' }, rows.map(([k, v]) => h('div', {}, h('span', { text: k }), h('strong', { text: v })))),
      ];
    }

    const RENDER = { personalization, language, system, shortcuts, about };

    function show(id) {
      section = RENDER[id] ? id : 'personalization';
      nav.querySelectorAll('.st-nav-item').forEach((b) => b.classList.toggle('active', b.dataset.id === section));
      content.innerHTML = '';
      content.append(...RENDER[section]());
      content.scrollTop = 0;
      win.setTitle(t('windowTitle', { section: sectionName(section) }));
    }

    const off = s.on('change', (key) => {
      if (key === 'wallpaper' && section === 'personalization') {
        const preview = content.querySelector('.st-preview');
        if (preview) preview.style.background = s.wallpaperCss();
      }
    });
    win.on('close', off);
    win.onArgs = (a) => { if (a && a.section) show(a.section); };
    renderUser();
    show(section);
  }

  OS.apps.register({
    id: 'settings',
    languages: ['en'],
    icon: 'settings',
    colors: ['#a1a1aa', '#52525b'],
    width: 860,
    height: 580,
    minWidth: 520,
    minHeight: 360,
    singleInstance: true,
    launch,
  });
})();
