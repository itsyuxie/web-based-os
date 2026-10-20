/* AwanOS — Image Viewer */
(function () {
  'use strict';
  const OS = window.OS;
  const t = OS.i18n.forApp('imageviewer');
  const { h, formatBytes } = OS.utils;
  const { glyph } = OS.icons;
  const vfs = OS.vfs;

  const isImage = (name) => OS.icons.fileKind(name) === 'image';

  function toSrc(content) {
    if (!content) return '';
    if (content.trim().startsWith('<')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
    return content;
  }

  function launch(win, args) {
    let path = null;
    let zoom = 1;
    let fit = true;

    const img = h('img', { class: 'iv-img', alt: '', draggable: false });
    const stage = h('div', { class: 'iv-stage' }, img);
    const info = h('span');
    const zoomLabel = h('span', { class: 'iv-zoom' });
    const percent = new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 0 });
    const btn = (icon, title, fn) => h('button', { class: 'icon-btn', title, 'aria-label': title, html: glyph(icon), onclick: fn });
    const prevBtn = btn('back', t('toolbar.previous'), () => step(-1));
    const nextBtn = btn('forward', t('toolbar.next'), () => step(1));

    win.body.classList.add('imageviewer');
    win.body.append(
      stage,
      h('div', { class: 'iv-bar' },
        btn('open', t('toolbar.open'), openImage),
        prevBtn, nextBtn,
        h('div', { class: 'toolbar-sep' }),
        btn('zoomOut', t('toolbar.zoomOut'), () => setZoom(zoom / 1.25)),
        zoomLabel,
        btn('zoomIn', t('toolbar.zoomIn'), () => setZoom(zoom * 1.25)),
        btn('fit', t('toolbar.fit'), () => { fit = true; apply(); }),
        h('div', { class: 'toolbar-sep' }),
        btn('palette', t('toolbar.edit', { app: OS.apps.get('paint').name }), () => path && OS.wm.open('paint', { path })),
        btn('image', t('toolbar.wallpaper'), setWallpaper),
        btn('download', t('toolbar.download'), () => path && OS.fileOps.download(path)),
        h('span', { class: 'spacer' }),
        info)
    );

    async function openImage() {
      const chosen = await OS.ui.pickFile({ mode: 'open', startDir: path ? vfs.dirname(path) : `${vfs.HOME}/Pictures`, extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] });
      if (chosen) load(chosen);
    }

    function siblings() {
      if (!path) return [];
      try { return vfs.readdir(vfs.dirname(path)).filter((e) => e.type === 'file' && isImage(e.name)).map((e) => e.path); } catch (_) { return []; }
    }

    function load(p) {
      p = vfs.resolve(p);
      let content;
      try { content = vfs.readFile(p); } catch (err) { OS.ui.showError(err, t('errors.open')); return; }
      path = p;
      win.filePath = p;
      fit = true;
      img.onload = () => {
        apply();
        const st = vfs.stat(p);
        info.textContent = t('info', { width: img.naturalWidth, height: img.naturalHeight, size: formatBytes(st ? st.size : 0, t.locale) });
      };
      img.onerror = () => { info.textContent = t('errors.display'); };
      img.src = toSrc(content);
      win.setTitle(t('windowTitle', { file: vfs.basename(p) }));
      const list = siblings();
      prevBtn.disabled = nextBtn.disabled = list.length < 2;
    }

    function step(delta) {
      const list = siblings();
      if (list.length < 2) return;
      const i = list.indexOf(path);
      load(list[(i + delta + list.length) % list.length]);
    }

    function setZoom(z) {
      fit = false;
      zoom = Math.min(8, Math.max(0.05, z));
      apply();
    }

    function apply() {
      if (!img.naturalWidth) return;
      if (fit) {
        const sw = stage.clientWidth - 32;
        const sh = stage.clientHeight - 32;
        zoom = Math.min(1, sw / img.naturalWidth, sh / img.naturalHeight);
      }
      img.style.width = `${img.naturalWidth * zoom}px`;
      img.style.height = `${img.naturalHeight * zoom}px`;
      zoomLabel.textContent = percent.format(zoom);
    }

    function setWallpaper() {
      if (!path) return;
      const ok = OS.settings.setCustomWallpaper(toSrc(vfs.readFile(path)));
      if (ok) OS.notify({ title: t('notify.wallpaper'), body: vfs.basename(path), app: 'imageviewer' });
      else OS.ui.alert(t('errors.storageFull'), { title: t('name'), icon: 'warning' });
    }

    stage.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
    stage.addEventListener('dblclick', () => { if (fit) setZoom(1); else { fit = true; apply(); } });
    win.el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === '+' || e.key === '=') setZoom(zoom * 1.25);
      else if (e.key === '-') setZoom(zoom / 1.25);
      else if (e.key === '0') { fit = true; apply(); }
    });
    new ResizeObserver(() => { if (fit) apply(); }).observe(stage);
    win.on('focus', () => win.el.focus({ preventScroll: true }));
    win.onArgs = (a) => { if (a.path) load(a.path); };

    if (args.path) load(args.path);
    else {
      win.setTitle(t('name'));
      info.textContent = t('placeholder', { app: OS.apps.get('explorer').name });
      prevBtn.disabled = nextBtn.disabled = true;
    }
  }

  OS.apps.register({
    id: 'imageviewer',
    languages: ['en'],
    icon: 'image',
    colors: ['#34d399', '#0d9488'],
    width: 800,
    height: 560,
    minWidth: 360,
    minHeight: 260,
    fileTypes: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
    launch,
  });
})();
