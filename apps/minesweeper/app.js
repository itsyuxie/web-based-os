/* AwanOS — Minesweeper */
(function () {
  'use strict';
  const OS = window.OS;
  const { h } = OS.utils;
  const { glyph } = OS.icons;

  const LEVELS = {
    pemula: { label: 'Pemula', w: 9, h: 9, mines: 10 },
    menengah: { label: 'Menengah', w: 16, h: 16, mines: 40 },
    ahli: { label: 'Ahli', w: 30, h: 16, mines: 99 },
  };
  const CELL = 28;

  function launch(win) {
    let level = OS.storage.read('minesweeper.level', 'pemula');
    if (!LEVELS[level]) level = 'pemula';
    let cells = [];
    let started = false;
    let over = false;
    let flags = 0;
    let opened = 0;
    let seconds = 0;
    let timer = null;
    let flagMode = false;

    const counter = h('div', { class: 'ms-lcd' });
    const clock = h('div', { class: 'ms-lcd' });
    const face = h('button', { class: 'ms-face', title: 'Permainan baru', 'aria-label': 'Permainan baru' });
    const flagBtn = h('button', { class: 'icon-btn ms-flagmode', title: 'Mode bendera (untuk layar sentuh)', html: glyph('flag') });
    const board = h('div', { class: 'ms-board', role: 'grid' });

    const menuBtn = h('button', { class: 'menubar-item', text: 'Permainan' });
    menuBtn.addEventListener('click', () => {
      const r = menuBtn.getBoundingClientRect();
      const best = OS.storage.read('minesweeper.best', {});
      OS.ui.contextMenu(r.left, r.bottom + 2, [
        { label: 'Permainan baru', icon: 'refresh', shortcut: 'F2', action: reset },
        '-',
        ...Object.entries(LEVELS).map(([id, l]) => ({
          label: `${l.label} (${l.w}×${l.h}, ${l.mines} ranjau)`,
          checked: id === level,
          action: () => { level = id; OS.storage.write('minesweeper.level', id); reset(); },
        })),
        '-',
        {
          label: 'Rekor terbaik', icon: 'info',
          action: () => OS.ui.alert(Object.entries(LEVELS).map(([id, l]) => `${l.label}: ${best[id] ? best[id] + ' detik' : '—'}`).join('\n'), { title: 'Rekor terbaik', icon: 'info' }),
        },
      ]);
    });

    win.body.classList.add('minesweeper');
    win.body.append(
      h('div', { class: 'menubar' }, menuBtn),
      h('div', { class: 'ms-wrap' },
        h('div', { class: 'ms-head' }, counter, h('div', { class: 'ms-head-mid' }, face, flagBtn), clock),
        board)
    );

    const lcd = (n) => String(Math.max(-99, Math.min(999, n))).padStart(3, '0');
    const setFace = (kind) => { face.innerHTML = glyph(kind); face.dataset.kind = kind; };

    function reset() {
      const L = LEVELS[level];
      clearInterval(timer);
      timer = null;
      started = false;
      over = false;
      flags = 0;
      opened = 0;
      seconds = 0;
      cells = Array.from({ length: L.w * L.h }, (_, i) => ({ i, x: i % L.w, y: Math.floor(i / L.w), mine: false, open: false, flag: false, n: 0 }));
      board.innerHTML = '';
      board.style.gridTemplateColumns = `repeat(${L.w}, ${CELL}px)`;
      cells.forEach((c) => {
        c.el = h('button', { class: 'ms-cell', role: 'gridcell', 'aria-label': `Kotak ${c.x + 1},${c.y + 1}` });
        c.el.dataset.i = c.i;
        board.appendChild(c.el);
      });
      counter.textContent = lcd(L.mines);
      clock.textContent = lcd(0);
      setFace('smile');
      win.setTitle(`Minesweeper — ${L.label}`);
      fitWindow();
    }

    function fitWindow() {
      const L = LEVELS[level];
      if (win.state !== 'normal') return;
      win.setSize(L.w * CELL + 48, L.h * CELL + 38 + 34 + 70 + 34);
    }

    const neighbors = (c) => {
      const L = LEVELS[level];
      const out = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = c.x + dx;
          const y = c.y + dy;
          if (x >= 0 && y >= 0 && x < L.w && y < L.h) out.push(cells[y * L.w + x]);
        }
      }
      return out;
    };

    function placeMines(safe) {
      const L = LEVELS[level];
      const forbidden = new Set([safe.i, ...neighbors(safe).map((c) => c.i)]);
      let placed = 0;
      while (placed < L.mines) {
        const c = cells[Math.floor(Math.random() * cells.length)];
        if (c.mine || forbidden.has(c.i)) continue;
        c.mine = true;
        placed++;
      }
      cells.forEach((c) => { c.n = neighbors(c).filter((n) => n.mine).length; });
    }

    function start(c) {
      placeMines(c);
      started = true;
      timer = setInterval(() => {
        seconds++;
        clock.textContent = lcd(seconds);
      }, 1000);
    }

    function paint(c) {
      const el = c.el;
      el.className = 'ms-cell';
      el.textContent = '';
      el.innerHTML = '';
      if (c.open) {
        el.classList.add('open');
        if (c.mine) {
          el.classList.add('mine');
          el.innerHTML = glyph('bomb');
        } else if (c.n) {
          el.textContent = c.n;
          el.dataset.n = c.n;
        }
      } else if (c.flag) {
        el.classList.add('flag');
        el.innerHTML = glyph('flag');
      }
    }

    function reveal(c) {
      if (c.open || c.flag) return;
      const queue = [c];
      while (queue.length) {
        const cur = queue.shift();
        if (cur.open || cur.flag) continue;
        cur.open = true;
        opened++;
        paint(cur);
        if (!cur.mine && cur.n === 0) neighbors(cur).forEach((n) => { if (!n.open) queue.push(n); });
      }
    }

    function lose(hit) {
      over = true;
      clearInterval(timer);
      cells.forEach((c) => {
        if (c.mine && !c.flag) { c.open = true; paint(c); }
        if (!c.mine && c.flag) { c.el.classList.add('wrong'); }
      });
      hit.el.classList.add('boom');
      setFace('frown');
    }

    function checkWin() {
      const L = LEVELS[level];
      if (opened !== L.w * L.h - L.mines) return;
      over = true;
      clearInterval(timer);
      cells.forEach((c) => { if (c.mine && !c.flag) { c.flag = true; paint(c); } });
      counter.textContent = lcd(0);
      setFace('cool');
      const best = OS.storage.read('minesweeper.best', {});
      const record = !best[level] || seconds < best[level];
      if (record) {
        best[level] = seconds;
        OS.storage.write('minesweeper.best', best);
      }
      OS.notify({ title: record ? 'Rekor baru! 🎉' : 'Kamu menang!', body: `${L.label} selesai dalam ${seconds} detik.`, app: 'minesweeper' });
    }

    function open(c) {
      if (over || c.flag) return;
      if (!started) start(c);
      if (c.open) {
        // Chord: open neighbours when the right number of flags surround a number.
        const around = neighbors(c);
        if (c.n && around.filter((n) => n.flag).length === c.n) {
          for (const n of around) {
            if (!n.open && !n.flag) {
              if (n.mine) { n.open = true; paint(n); lose(n); return; }
              reveal(n);
            }
          }
          checkWin();
        }
        return;
      }
      if (c.mine) {
        c.open = true;
        paint(c);
        lose(c);
        return;
      }
      reveal(c);
      checkWin();
    }

    function toggleFlag(c) {
      if (over || c.open) return;
      c.flag = !c.flag;
      flags += c.flag ? 1 : -1;
      counter.textContent = lcd(LEVELS[level].mines - flags);
      paint(c);
    }

    const cellFrom = (e) => {
      const el = e.target.closest('.ms-cell');
      return el ? cells[+el.dataset.i] : null;
    };

    board.addEventListener('click', (e) => {
      const c = cellFrom(e);
      if (!c) return;
      if (flagMode && !c.open) toggleFlag(c);
      else open(c);
    });
    board.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const c = cellFrom(e);
      if (c) toggleFlag(c);
    });
    board.addEventListener('auxclick', (e) => {
      const c = cellFrom(e);
      if (c && e.button === 1 && c.open) open(c);
    });
    board.addEventListener('pointerdown', (e) => { if (!over && e.button === 0) setFace('smile'); });
    face.addEventListener('click', reset);
    flagBtn.addEventListener('click', () => {
      flagMode = !flagMode;
      flagBtn.classList.toggle('on', flagMode);
    });
    win.el.addEventListener('keydown', (e) => {
      if (e.key === 'F2') { e.preventDefault(); reset(); }
    });
    win.on('close', () => clearInterval(timer));
    reset();
  }

  OS.apps.register({
    id: 'minesweeper',
    name: 'Minesweeper',
    description: 'Permainan klasik mencari ranjau',
    keywords: ['game', 'permainan', 'ranjau', 'mines'],
    icon: 'bomb',
    colors: ['#94a3b8', '#475569'],
    width: 300,
    height: 440,
    resizable: false,
    launch,
  });
})();
