/* AwanOS — Paint */
(function () {
  'use strict';
  const OS = window.OS;
  const { h } = OS.utils;
  const { glyph } = OS.icons;
  const t = OS.i18n.forApp('paint');
  const vfs = OS.vfs;

  const PALETTE = [
    '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
    '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
  ];
  const TOOLS = [
    { id: 'pencil', icon: 'pencil', key: 'p' },
    { id: 'brush', icon: 'brush', key: 'b' },
    { id: 'eraser', icon: 'eraser', key: 'e' },
    { id: 'line', icon: 'line', key: 'l' },
    { id: 'rect', icon: 'square', key: 'r' },
    { id: 'ellipse', icon: 'circle', key: 'o' },
    { id: 'fill', icon: 'bucket', key: 'f' },
  ];
  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function launch(win, args) {
    let tool = 'pencil';
    let color = '#000000';
    let size = 4;
    let fillShapes = false;
    let path = null;
    let dirty = false;
    const undo = [];
    const redo = [];

    const canvas = h('canvas', { class: 'paint-canvas', width: 960, height: 600 });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const posEl = h('span');
    const sizeEl = h('span');

    function resetCanvas(w, hgt) {
      canvas.width = w;
      canvas.height = hgt;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, hgt);
      sizeEl.textContent = t('status.size', { width: w, height: hgt });
    }
    resetCanvas(960, 600);

    /* Toolbar ------------------------------------------------------ */

    const toolBtns = TOOLS.map((def) => {
      const label = t(`tools.${def.id}`);
      const b = h('button', { class: 'icon-btn', title: label, 'aria-label': label, html: glyph(def.icon) });
      b.addEventListener('click', () => setTool(def.id));
      b.dataset.tool = def.id;
      return b;
    });
    const sizeLabel = () => t('toolbar.sizeValue', { size });
    const sizeInput = h('input', { type: 'range', min: 1, max: 60, value: size, title: t('toolbar.size'), 'aria-label': t('toolbar.brushSize') });
    const sizeOut = h('span', { class: 'paint-size', text: sizeLabel() });
    sizeInput.addEventListener('input', () => { size = Number(sizeInput.value); sizeOut.textContent = sizeLabel(); });
    const fillToggle = h('button', { class: 'icon-btn', title: t('toolbar.fillShapes'), html: '<svg class="glyph" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/></svg>' });
    fillToggle.addEventListener('click', () => { fillShapes = !fillShapes; fillToggle.classList.toggle('on', fillShapes); });

    const current = h('input', { type: 'color', class: 'paint-current', value: color, title: t('toolbar.customColor') });
    current.addEventListener('input', () => setColor(current.value));
    const swatches = h('div', { class: 'paint-palette' }, PALETTE.map((c) => {
      const s = h('button', { class: 'paint-swatch', title: c, style: { background: c } });
      s.addEventListener('click', () => setColor(c));
      return s;
    }));

    const undoBtn = h('button', { class: 'icon-btn', title: t('toolbar.undo'), html: glyph('undo'), onclick: doUndo });
    const redoBtn = h('button', { class: 'icon-btn', title: t('toolbar.redo'), html: `<span style="transform:scaleX(-1);display:grid">${glyph('undo')}</span>`, onclick: doRedo });

    const menuBtn = h('button', { class: 'menubar-item', text: t('menu.file') });
    menuBtn.addEventListener('click', () => {
      const r = menuBtn.getBoundingClientRect();
      OS.ui.contextMenu(r.left, r.bottom + 2, [
        { label: t('menu.new'), icon: 'filePlus', action: newImage },
        { label: t('menu.open'), icon: 'open', shortcut: 'Ctrl+O', action: openImage },
        { label: t('menu.save'), icon: 'save', shortcut: 'Ctrl+S', action: save },
        { label: t('menu.saveAs'), icon: 'save', action: saveAs },
        '-',
        { label: t('menu.download'), icon: 'download', action: () => OS.utils.download(path ? vfs.basename(path) : t('untitledFile'), canvas.toDataURL('image/png')) },
        { label: t('menu.wallpaper'), icon: 'image', action: setWallpaper },
        '-',
        { label: t('menu.clear'), icon: 'trash', danger: true, action: clear },
      ]);
    });

    win.body.classList.add('paint');
    win.body.append(
      h('div', { class: 'toolbar paint-toolbar' },
        menuBtn,
        h('div', { class: 'toolbar-sep' }),
        ...toolBtns,
        fillToggle,
        h('div', { class: 'toolbar-sep' }),
        sizeInput, sizeOut,
        h('div', { class: 'toolbar-sep' }),
        current, swatches,
        h('div', { class: 'toolbar-sep' }),
        undoBtn, redoBtn),
      h('div', { class: 'paint-area' }, canvas),
      h('div', { class: 'statusbar' }, posEl, h('span', { class: 'spacer' }), sizeEl)
    );

    function setTool(id) {
      tool = id;
      toolBtns.forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
      canvas.dataset.tool = id;
    }

    function setColor(c) {
      color = c;
      current.value = c;
      if (tool === 'eraser') setTool('pencil');
    }

    const name = () => (path ? vfs.basename(path) : t('untitled'));
    const updateTitle = () => win.setTitle(`${dirty ? '● ' : ''}${t('windowTitle', { file: name() })}`);

    function markDirty() {
      if (!dirty) { dirty = true; updateTitle(); }
    }

    function snapshot() {
      undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (undo.length > 25) undo.shift();
      redo.length = 0;
      syncHistory();
    }

    function syncHistory() {
      undoBtn.disabled = !undo.length;
      redoBtn.disabled = !redo.length;
    }

    function restore(from, to) {
      if (!from.length) return;
      to.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const img = from.pop();
      if (img.width !== canvas.width || img.height !== canvas.height) {
        canvas.width = img.width;
        canvas.height = img.height;
        sizeEl.textContent = t('status.size', { width: img.width, height: img.height });
      }
      ctx.putImageData(img, 0, 0);
      markDirty();
      syncHistory();
    }
    function doUndo() { restore(undo, redo); }
    function doRedo() { restore(redo, undo); }

    /* Drawing --------------------------------------------------------- */

    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
    };

    function stroke(from, to) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth = tool === 'brush' ? size * 2.2 : tool === 'eraser' ? size * 3 : size;
      if (tool === 'brush') {
        ctx.globalAlpha = 0.35;
        ctx.shadowColor = color;
        ctx.shadowBlur = size;
      }
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }

    function shape(a, b, e) {
      let w = b.x - a.x;
      let hh = b.y - a.y;
      if (e.shiftKey && tool !== 'line') {
        const m = Math.max(Math.abs(w), Math.abs(hh));
        w = Math.sign(w || 1) * m;
        hh = Math.sign(hh || 1) * m;
      }
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (tool === 'line') {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else if (tool === 'rect') {
        ctx.rect(a.x, a.y, w, hh);
        if (fillShapes) ctx.fill(); else ctx.stroke();
      } else {
        ctx.ellipse(a.x + w / 2, a.y + hh / 2, Math.abs(w / 2), Math.abs(hh / 2), 0, 0, Math.PI * 2);
        if (fillShapes) ctx.fill(); else ctx.stroke();
      }
      ctx.restore();
    }

    function floodFill(x, y) {
      x = Math.floor(x);
      y = Math.floor(y);
      const { width, height } = canvas;
      const img = ctx.getImageData(0, 0, width, height);
      const d = img.data;
      const idx = (y * width + x) * 4;
      const target = [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
      const [r, g, b] = hexToRgb(color);
      if (target[0] === r && target[1] === g && target[2] === b && target[3] === 255) return;
      const tol = 40;
      const match = (i) => Math.abs(d[i] - target[0]) <= tol && Math.abs(d[i + 1] - target[1]) <= tol && Math.abs(d[i + 2] - target[2]) <= tol && Math.abs(d[i + 3] - target[3]) <= tol;
      const stack = [[x, y]];
      const seen = new Uint8Array(width * height);
      while (stack.length) {
        const [sx, sy] = stack.pop();
        let cx = sx;
        while (cx >= 0 && !seen[sy * width + cx] && match((sy * width + cx) * 4)) cx--;
        cx++;
        let up = false;
        let down = false;
        while (cx < width && !seen[sy * width + cx] && match((sy * width + cx) * 4)) {
          const p = sy * width + cx;
          seen[p] = 1;
          d[p * 4] = r; d[p * 4 + 1] = g; d[p * 4 + 2] = b; d[p * 4 + 3] = 255;
          if (sy > 0) {
            const m = !seen[p - width] && match((p - width) * 4);
            if (m && !up) { stack.push([cx, sy - 1]); up = true; } else if (!m) up = false;
          }
          if (sy < height - 1) {
            const m = !seen[p + width] && match((p + width) * 4);
            if (m && !down) { stack.push([cx, sy + 1]); down = true; } else if (!m) down = false;
          }
          cx++;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const start = point(e);
      snapshot();
      markDirty();
      if (tool === 'fill') {
        floodFill(start.x, start.y);
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      const base = ['line', 'rect', 'ellipse'].includes(tool) ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      let last = start;
      if (!base) stroke(start, { x: start.x + 0.01, y: start.y });
      const move = (ev) => {
        const p = point(ev);
        if (base) {
          ctx.putImageData(base, 0, 0);
          shape(start, p, ev);
        } else {
          stroke(last, p);
          last = p;
        }
      };
      const up = () => {
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = point(e);
      posEl.textContent = t('status.position', { x: Math.round(p.x), y: Math.round(p.y) });
    });
    canvas.addEventListener('pointerleave', () => { posEl.textContent = ''; });

    /* Files ------------------------------------------------------------ */

    async function confirmDiscard() {
      if (!dirty) return true;
      const { button } = await OS.ui.dialog({
        title: t('name'),
        message: t('dialogs.unsaved', { file: name() }),
        icon: 'warning',
        buttons: [
          { label: t('dialogs.save'), value: 'save', primary: true },
          { label: t('dialogs.dontSave'), value: 'discard' },
          { label: t('dialogs.cancel'), value: null, cancel: true },
        ],
      });
      if (button === 'save') return save();
      return button === 'discard';
    }

    async function newImage() {
      if (!(await confirmDiscard())) return;
      const answer = await OS.ui.prompt(t('dialogs.newSize'), `${canvas.width}x${canvas.height}`, { title: t('dialogs.newTitle') });
      if (answer == null) return;
      const m = /(\d+)\s*[x×*,]\s*(\d+)/i.exec(answer);
      const w = m ? Math.min(3000, Math.max(16, +m[1])) : 960;
      const hh = m ? Math.min(3000, Math.max(16, +m[2])) : 600;
      undo.length = 0;
      redo.length = 0;
      syncHistory();
      resetCanvas(w, hh);
      path = null;
      win.filePath = null;
      dirty = false;
      updateTitle();
    }

    function loadFrom(p) {
      let data;
      try { data = vfs.readFile(p); } catch (err) { OS.ui.showError(err, t('errors.open')); return; }
      if (data.trim().startsWith('<')) data = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
      const img = new Image();
      img.onload = () => {
        undo.length = 0;
        redo.length = 0;
        syncHistory();
        resetCanvas(Math.min(3000, img.naturalWidth || 960), Math.min(3000, img.naturalHeight || 600));
        ctx.drawImage(img, 0, 0);
        path = vfs.resolve(p);
        win.filePath = path;
        dirty = false;
        updateTitle();
      };
      img.onerror = () => OS.ui.alert(t('dialogs.invalidImage'), { title: t('name'), icon: 'warning' });
      img.src = data;
    }

    async function openImage() {
      if (!(await confirmDiscard())) return;
      const chosen = await OS.ui.pickFile({ mode: 'open', startDir: `${vfs.HOME}/Pictures`, extensions: IMAGE_EXT });
      if (chosen) loadFrom(chosen);
    }

    function writeTo(target) {
      if (!/\.png$/i.test(target)) target += '.png';
      try {
        vfs.writeFile(target, canvas.toDataURL('image/png'));
      } catch (err) {
        OS.ui.showError(err, t('errors.save'));
        return false;
      }
      path = vfs.resolve(target);
      win.filePath = path;
      dirty = false;
      updateTitle();
      OS.notify({ title: t('notify.saved'), body: path.replace(vfs.HOME, '~'), app: 'paint', timeout: 3000 });
      return true;
    }

    async function save() {
      if (path && /\.png$/i.test(path)) return writeTo(path);
      return saveAs();
    }

    async function saveAs() {
      const target = await OS.ui.pickFile({
        mode: 'save',
        startDir: path ? vfs.dirname(path) : `${vfs.HOME}/Pictures`,
        defaultName: path ? vfs.basename(path).replace(/\.[^.]+$/, '.png') : t('untitledFile'),
        extensions: IMAGE_EXT,
      });
      if (!target) return false;
      return writeTo(target);
    }

    async function clear() {
      snapshot();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      markDirty();
    }

    function setWallpaper() {
      const ok = OS.settings.setCustomWallpaper(canvas.toDataURL('image/jpeg', 0.9));
      if (ok) OS.notify({ title: t('notify.wallpaper'), body: t('notify.wallpaperBody'), app: 'paint' });
      else OS.ui.alert(t('dialogs.storageFull'), { title: t('name'), icon: 'warning' });
    }

    win.el.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 'z') { e.preventDefault(); doUndo(); }
      else if (ctrl && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); doRedo(); }
      else if (ctrl && k === 's') { e.preventDefault(); save(); }
      else if (ctrl && k === 'o') { e.preventDefault(); openImage(); }
      else if (!ctrl && !e.altKey && e.target.tagName !== 'INPUT') {
        const hit = TOOLS.find((x) => x.key === k);
        if (hit) setTool(hit.id);
        if (e.key === '[') { size = Math.max(1, size - 1); sizeInput.value = size; sizeOut.textContent = sizeLabel(); }
        if (e.key === ']') { size = Math.min(60, size + 1); sizeInput.value = size; sizeOut.textContent = sizeLabel(); }
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    win.isDirty = () => dirty;
    win.beforeClose = confirmDiscard;
    win.on('focus', () => { if (!win.el.contains(document.activeElement)) win.el.focus({ preventScroll: true }); });
    setTool('pencil');
    syncHistory();
    updateTitle();
    if (args.path) loadFrom(args.path);
  }

  OS.apps.register({
    id: 'paint',
    languages: ['en'],
    icon: 'palette',
    colors: ['#f472b6', '#db2777'],
    width: 980,
    height: 640,
    minWidth: 520,
    minHeight: 360,
    fileTypes: IMAGE_EXT,
    launch,
  });
})();
