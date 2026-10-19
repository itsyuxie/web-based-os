/* AwanOS — Task Manager */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, escapeHtml, formatBytes } = OS.utils;
  const BOOT = Date.now();

  function launch(win) {
    let selectedId = null;
    const fpsHistory = [];
    let frames = 0;
    let rafId = 0;
    let lastSample = performance.now();

    const tbody = h('tbody');
    const endBtn = h('button', { class: 'btn', text: 'Akhiri tugas', disabled: true });
    const switchBtn = h('button', { class: 'btn', text: 'Beralih ke', disabled: true });
    const summary = h('span');
    const chart = h('canvas', { class: 'tm-chart', width: 600, height: 90 });
    const stats = h('div', { class: 'tm-stats' });

    win.body.classList.add('taskmanager');
    win.body.append(
      h('div', { class: 'tm-perf' },
        h('div', { class: 'tm-perf-head' }, h('strong', { text: 'Kinerja' }), h('span', { class: 'tm-fps' })),
        chart,
        stats),
      h('div', { class: 'tm-table-wrap' },
        h('table', { class: 'tm-table' },
          h('thead', {}, h('tr', {}, h('th', { text: 'Aplikasi' }), h('th', { text: 'Jendela' }), h('th', { text: 'Status' }))),
          tbody)),
      h('div', { class: 'tm-footer' }, summary, h('span', { class: 'spacer' }), switchBtn, endBtn)
    );

    function renderTable() {
      const wins = OS.wm.list();
      if (!wins.some((w) => w.id === selectedId)) selectedId = null;
      tbody.innerHTML = '';
      wins.forEach((w) => {
        const status = w === OS.wm.active() ? 'Aktif' : w.minimized ? 'Diminimalkan' : 'Berjalan';
        const tr = h('tr', {
          class: w.id === selectedId ? 'selected' : '',
          html: `<td><span class="tm-app">${OS.icons.appIcon(w.app, 'xs')}${escapeHtml(w.app.name)}</span></td><td>${escapeHtml(w.title)}</td><td>${status}</td>`,
        });
        tr.addEventListener('click', () => { selectedId = w.id; renderTable(); });
        tr.addEventListener('dblclick', () => w.focus());
        tbody.appendChild(tr);
      });
      const apps = new Set(wins.map((w) => w.appId)).size;
      summary.textContent = `${apps} aplikasi · ${wins.length} jendela`;
      endBtn.disabled = switchBtn.disabled = !selectedId;
    }

    function drawChart() {
      const c = chart.getContext('2d');
      const w = chart.width;
      const hh = chart.height;
      const styles = getComputedStyle(win.body);
      const accent = styles.getPropertyValue('--accent').trim() || '#3b82f6';
      c.clearRect(0, 0, w, hh);
      c.strokeStyle = styles.getPropertyValue('--border').trim();
      c.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo(0, (hh / 4) * i);
        c.lineTo(w, (hh / 4) * i);
        c.stroke();
      }
      if (fpsHistory.length < 2) return;
      const step = w / 59;
      const max = 70;
      c.beginPath();
      fpsHistory.forEach((v, i) => {
        const x = w - (fpsHistory.length - 1 - i) * step;
        const y = hh - (Math.min(v, max) / max) * hh;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
      c.strokeStyle = accent;
      c.lineWidth = 2;
      c.stroke();
      c.lineTo(w, hh);
      c.lineTo(w - (fpsHistory.length - 1) * step, hh);
      c.closePath();
      c.globalAlpha = 0.18;
      c.fillStyle = accent;
      c.fill();
      c.globalAlpha = 1;
    }

    function renderStats() {
      const mem = performance.memory;
      const up = Math.floor((Date.now() - BOOT) / 1000);
      const items = [
        ['FPS', fpsHistory.length ? String(fpsHistory[fpsHistory.length - 1]) : '—'],
        ['Memori JS', mem ? `${formatBytes(mem.usedJSHeapSize)}` : 'Tidak tersedia'],
        ['Penyimpanan', `${formatBytes(OS.storage.usage())} / 5 MB`],
        ['Inti CPU', String(navigator.hardwareConcurrency || '?')],
        ['Waktu aktif', `${Math.floor(up / 3600)}j ${Math.floor((up % 3600) / 60)}m ${up % 60}d`],
      ];
      stats.innerHTML = items.map(([k, v]) => `<div><span>${k}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
    }

    function loop(now) {
      frames++;
      if (now - lastSample >= 1000) {
        fpsHistory.push(Math.round((frames * 1000) / (now - lastSample)));
        if (fpsHistory.length > 60) fpsHistory.shift();
        frames = 0;
        lastSample = now;
        drawChart();
        renderStats();
      }
      rafId = requestAnimationFrame(loop);
    }

    endBtn.addEventListener('click', () => {
      const w = OS.wm.get(selectedId);
      if (w) w.close(true);
    });
    switchBtn.addEventListener('click', () => {
      const w = OS.wm.get(selectedId);
      if (w) w.focus();
    });

    const off = OS.wm.on('change', renderTable);
    win.on('close', () => { off(); cancelAnimationFrame(rafId); });
    renderTable();
    renderStats();
    rafId = requestAnimationFrame(loop);
  }

  OS.apps.register({
    id: 'taskmanager',
    name: 'Pengelola Tugas',
    description: 'Lihat dan tutup aplikasi yang berjalan',
    keywords: ['task', 'process', 'proses', 'kinerja'],
    icon: 'activity',
    colors: ['#60a5fa', '#7c3aed'],
    width: 620,
    height: 520,
    minWidth: 420,
    minHeight: 360,
    singleInstance: true,
    launch,
  });
})();
