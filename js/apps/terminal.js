/* AwanOS — Terminal (awsh) */
(function () {
  'use strict';
  const OS = window.OS;
  const { h, escapeHtml, splitArgs, formatBytes, formatDate, extname } = OS.utils;
  const vfs = OS.vfs;
  const BOOT_TIME = Date.now();

  const PROVERBS = [
    'Sedikit demi sedikit, lama-lama menjadi bukit.',
    'Air beriak tanda tak dalam.',
    'Bersatu kita teguh, bercerai kita runtuh.',
    'Di mana bumi dipijak, di situ langit dijunjung.',
    'Berakit-rakit ke hulu, berenang-renang ke tepian.',
    'Malu bertanya sesat di jalan.',
    'Tak ada gading yang tak retak.',
    'Ada udang di balik batu.',
    'Hemat pangkal kaya, rajin pangkal pandai.',
    'Seperti padi, makin berisi makin merunduk.',
  ];

  /* Safe arithmetic evaluator for `calc` ------------------------------- */
  function evaluate(expr) {
    const tokens = expr.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|\*\*|[-+*/%^(),]/gi);
    if (!tokens || tokens.join('') !== expr.replace(/\s+/g, '')) throw new Error('Ekspresi tidak valid');
    let i = 0;
    const FUNCS = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, log: Math.log10, ln: Math.log, round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp };
    const CONSTS = { pi: Math.PI, e: Math.E };
    const peek = () => tokens[i];
    const next = () => tokens[i++];
    function primary() {
      const t = next();
      if (t === undefined) throw new Error('Ekspresi tidak lengkap');
      if (t === '(') {
        const v = additive();
        if (next() !== ')') throw new Error('Kurung tutup ")" hilang');
        return v;
      }
      if (/^\d|^\./.test(t)) return parseFloat(t);
      const name = t.toLowerCase();
      if (name in CONSTS) return CONSTS[name];
      if (name in FUNCS) {
        if (next() !== '(') throw new Error(`"${name}" harus diikuti "("`);
        const v = additive();
        if (next() !== ')') throw new Error('Kurung tutup ")" hilang');
        return FUNCS[name](v);
      }
      throw new Error(`Simbol tidak dikenal: ${t}`);
    }
    function power() {
      const base = primary();
      if (peek() === '^' || peek() === '**') {
        next();
        return Math.pow(base, unary());
      }
      return base;
    }
    function unary() {
      if (peek() === '-') { next(); return -unary(); }
      if (peek() === '+') { next(); return unary(); }
      return power();
    }
    function multiplicative() {
      let v = unary();
      while (['*', '/', '%'].includes(peek())) {
        const op = next();
        const r = unary();
        v = op === '*' ? v * r : op === '/' ? v / r : v % r;
      }
      return v;
    }
    function additive() {
      let v = multiplicative();
      while (peek() === '+' || peek() === '-') {
        const op = next();
        const r = multiplicative();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    const result = additive();
    if (i < tokens.length) throw new Error(`Token tak terduga: ${tokens[i]}`);
    return result;
  }

  function parseFlags(args, known) {
    const flags = new Set();
    const rest = [];
    const opts = {};
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-n' && known.includes('n')) {
        opts.n = parseInt(args[++i], 10);
      } else if (/^-[a-zA-Z]+$/.test(a)) {
        for (const c of a.slice(1)) flags.add(c);
      } else {
        rest.push(a);
      }
    }
    return { flags, rest, opts };
  }

  function launch(win, args) {
    let cwd = args.cwd && vfs.isDir(args.cwd) ? vfs.resolve(args.cwd) : vfs.HOME;
    let prevCwd = cwd;
    const history = OS.storage.read('terminal.history', []);
    let hIdx = history.length;
    let draft = '';

    const out = h('div', { class: 'term-output' });
    const promptEl = h('span', { class: 'term-prompt' });
    const input = h('input', { class: 'term-input', spellcheck: false, autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Perintah terminal' });
    const line = h('div', { class: 'term-line' }, promptEl, input);
    const screen = h('div', { class: 'term' }, out, line);
    win.body.classList.add('terminal');
    win.body.appendChild(screen);

    const userName = () => (OS.settings.get('username') || 'user').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'user';
    const shortPath = (p) => (p === vfs.HOME ? '~' : p.startsWith(vfs.HOME + '/') ? '~' + p.slice(vfs.HOME.length) : p);
    const promptHtml = () => `<span class="t-green">${escapeHtml(userName())}@awanos</span>:<span class="t-blue">${escapeHtml(shortPath(cwd))}</span>$&nbsp;`;

    function renderPrompt() {
      promptEl.innerHTML = promptHtml();
      win.setTitle(`${userName()}@awanos: ${shortPath(cwd)}`);
    }

    function writeLines(lines) {
      const frag = document.createDocumentFragment();
      lines.forEach(({ text, cls, html }) => {
        frag.appendChild(h('div', { class: `t-row${cls ? ' ' + cls : ''}`, html: html != null ? html : escapeHtml(text) || '&nbsp;' }));
      });
      out.appendChild(frag);
      // Keep the scrollback bounded.
      while (out.childElementCount > 2000) out.firstElementChild.remove();
      screen.scrollTop = screen.scrollHeight;
    }

    const toScreen = (text, cls) => writeLines(String(text).split('\n').map((t) => ({ text: t, cls })));

    /* Commands --------------------------------------------------------- */

    const resolve = (p) => vfs.resolve(p, cwd);

    const COMMANDS = {
      help: {
        desc: 'Tampilkan daftar perintah',
        run(a, io) {
          if (a[0] && COMMANDS[a[0]]) {
            io.print(`${a[0]} — ${COMMANDS[a[0]].desc}`);
            if (COMMANDS[a[0]].usage) io.print(`Penggunaan: ${COMMANDS[a[0]].usage}`);
            return;
          }
          io.print('Perintah yang tersedia:', 't-bold');
          Object.keys(COMMANDS).sort().forEach((name) => {
            io.html(`  <span class="t-cyan">${name.padEnd(10).replace(/ /g, '&nbsp;')}</span>${escapeHtml(COMMANDS[name].desc)}`, `${name.padEnd(10)}${COMMANDS[name].desc}`);
          });
          io.print('');
          io.print('Tips: Tab untuk melengkapi, ↑/↓ untuk riwayat, Ctrl+L untuk membersihkan layar.');
          io.print('Mendukung pipa (|), pengalihan (> dan >>), dan rantai (&&, ||, ;), contoh: ls | grep txt > daftar.txt');
        },
      },
      ls: {
        desc: 'Daftar isi direktori',
        usage: 'ls [-l] [-a] [direktori...]',
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          const targets = rest.length ? rest : ['.'];
          targets.forEach((t, idx) => {
            const p = resolve(t);
            const st = vfs.stat(p);
            if (!st) return io.error(`ls: tidak dapat mengakses '${t}': Tidak ada berkas atau direktori`);
            if (targets.length > 1) io.print(`${idx ? '\n' : ''}${t}:`);
            let entries = st.type === 'dir' ? vfs.readdir(p) : [{ name: vfs.basename(p), type: 'file', size: st.size, mtime: st.mtime }];
            if (!flags.has('a')) entries = entries.filter((e) => !e.name.startsWith('.'));
            if (flags.has('l')) {
              io.print(`total ${entries.length}`);
              entries.forEach((e) => {
                const size = e.type === 'dir' ? '-' : formatBytes(e.size);
                const name = e.type === 'dir' ? `<span class="t-blue">${escapeHtml(e.name)}/</span>` : colorFile(e.name);
                const plain = `${e.type === 'dir' ? 'd' : '-'}rw-r--r--  ${size.padStart(9)}  ${formatDate(e.mtime)}  ${e.name}`;
                io.html(`${e.type === 'dir' ? 'd' : '-'}rw-r--r--  ${escapeHtml(size.padStart(9)).replace(/ /g, '&nbsp;')}  <span class="t-dim">${escapeHtml(formatDate(e.mtime))}</span>  ${name}`, plain);
              });
            } else if (entries.length) {
              const html = entries.map((e) => (e.type === 'dir' ? `<span class="t-blue">${escapeHtml(e.name)}/</span>` : colorFile(e.name))).join('&nbsp;&nbsp;&nbsp;');
              io.html(html, entries.map((e) => e.name).join('\n'));
            }
          });
        },
      },
      cd: {
        desc: 'Pindah direktori',
        usage: 'cd [direktori | - | ~]',
        run(a, io) {
          const target = a[0] === '-' ? prevCwd : resolve(a[0] || '~');
          if (!vfs.exists(target)) return io.error(`cd: ${a[0]}: Tidak ada berkas atau direktori`);
          if (!vfs.isDir(target)) return io.error(`cd: ${a[0]}: Bukan direktori`);
          prevCwd = cwd;
          cwd = target;
        },
      },
      pwd: { desc: 'Tampilkan direktori saat ini', run: (a, io) => io.print(cwd) },
      cat: {
        desc: 'Tampilkan isi berkas',
        usage: 'cat berkas...',
        run(a, io) {
          if (!a.length) {
            if (io.stdin != null) io.print(io.stdin.replace(/\n$/, ''));
            return;
          }
          a.forEach((f) => {
            try {
              const c = vfs.readFile(resolve(f));
              if (/^data:[^,]*;base64,/.test(c)) io.error(`cat: ${f}: berkas biner`);
              else io.print(c.replace(/\n$/, ''));
            } catch (err) {
              io.error(`cat: ${f}: ${err.message}`);
            }
          });
        },
      },
      echo: { desc: 'Cetak teks', usage: 'echo teks...', run: (a, io) => io.print(a.join(' ')) },
      mkdir: {
        desc: 'Buat direktori',
        usage: 'mkdir [-p] direktori...',
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          if (!rest.length) return io.error('mkdir: operand hilang');
          rest.forEach((d) => {
            try { vfs.mkdir(resolve(d), { recursive: flags.has('p') }); } catch (err) { io.error(`mkdir: ${err.message}`); }
          });
        },
      },
      touch: {
        desc: 'Buat berkas kosong',
        usage: 'touch berkas...',
        run(a, io) {
          if (!a.length) return io.error('touch: operand berkas hilang');
          a.forEach((f) => {
            const p = resolve(f);
            try { vfs.writeFile(p, vfs.isFile(p) ? vfs.readFile(p) : ''); } catch (err) { io.error(`touch: ${err.message}`); }
          });
        },
      },
      rm: {
        desc: 'Hapus berkas atau direktori',
        usage: 'rm [-r] [-f] jalur...',
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          if (!rest.length) return io.error('rm: operand hilang');
          rest.forEach((f) => {
            const p = resolve(f);
            if (!vfs.exists(p)) { if (!flags.has('f')) io.error(`rm: tidak dapat menghapus '${f}': Tidak ada berkas atau direktori`); return; }
            if (vfs.isDir(p) && !flags.has('r')) return io.error(`rm: tidak dapat menghapus '${f}': Ini direktori (gunakan -r)`);
            if (p === '/' || p === vfs.HOME) return io.error(`rm: menolak menghapus '${p}'`);
            try { vfs.remove(p); } catch (err) { io.error(`rm: ${err.message}`); }
          });
        },
      },
      rmdir: {
        desc: 'Hapus direktori kosong',
        usage: 'rmdir direktori...',
        run(a, io) {
          a.forEach((d) => {
            const p = resolve(d);
            if (!vfs.isDir(p)) return io.error(`rmdir: '${d}': Bukan direktori`);
            try { vfs.remove(p, { recursive: false }); } catch (err) { io.error(`rmdir: ${err.message}`); }
          });
        },
      },
      mv: {
        desc: 'Pindahkan atau ganti nama',
        usage: 'mv sumber... tujuan',
        run(a, io) {
          if (a.length < 2) return io.error('mv: operand hilang');
          const dest = resolve(a[a.length - 1]);
          const srcs = a.slice(0, -1);
          srcs.forEach((s) => {
            const src = resolve(s);
            const target = vfs.isDir(dest) ? vfs.join(dest, vfs.basename(src)) : dest;
            try { vfs.rename(src, target); } catch (err) { io.error(`mv: ${err.message}`); }
          });
        },
      },
      cp: {
        desc: 'Salin berkas atau direktori',
        usage: 'cp [-r] sumber... tujuan',
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          if (rest.length < 2) return io.error('cp: operand hilang');
          const dest = resolve(rest[rest.length - 1]);
          rest.slice(0, -1).forEach((s) => {
            const src = resolve(s);
            if (vfs.isDir(src) && !flags.has('r')) return io.error(`cp: -r tidak disebutkan; melewati direktori '${s}'`);
            const target = vfs.isDir(dest) ? vfs.join(dest, vfs.basename(src)) : dest;
            try {
              if (vfs.isFile(target)) vfs.remove(target);
              vfs.copy(src, target);
            } catch (err) { io.error(`cp: ${err.message}`); }
          });
        },
      },
      tree: {
        desc: 'Tampilkan struktur direktori',
        usage: 'tree [direktori]',
        run(a, io) {
          const root = resolve(a[0] || '.');
          if (!vfs.isDir(root)) return io.error(`tree: ${a[0]}: bukan direktori`);
          let dirs = 0;
          let files = 0;
          io.html(`<span class="t-blue">${escapeHtml(a[0] || '.')}</span>`, a[0] || '.');
          const walk = (p, prefix) => {
            const entries = vfs.readdir(p);
            entries.forEach((e, i) => {
              const last = i === entries.length - 1;
              const branch = `${prefix}${last ? '└── ' : '├── '}`;
              if (e.type === 'dir') {
                dirs++;
                io.html(`${escapeHtml(branch)}<span class="t-blue">${escapeHtml(e.name)}</span>`, branch + e.name);
                walk(e.path, prefix + (last ? '    ' : '│   '));
              } else {
                files++;
                io.html(escapeHtml(branch) + colorFile(e.name), branch + e.name);
              }
            });
          };
          walk(root, '');
          io.print(`\n${dirs} direktori, ${files} berkas`);
        },
      },
      find: {
        desc: 'Cari berkas berdasarkan nama',
        usage: 'find [direktori] [pola]',
        run(a, io) {
          let base = '.';
          let pattern = '';
          if (a.length >= 2) [base, pattern] = a;
          else if (a.length === 1) { if (vfs.isDir(resolve(a[0]))) base = a[0]; else pattern = a[0]; }
          const root = resolve(base);
          const re = pattern ? new RegExp(pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : null;
          for (const e of vfs.walk(root)) {
            if (!re || re.test(e.name)) io.print(e.path);
          }
        },
      },
      grep: {
        desc: 'Cari teks dalam berkas',
        usage: 'grep [-i] [-n] pola [berkas...]',
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          const [pattern, ...files] = rest;
          if (!pattern) return io.error('grep: pola hilang');
          let re;
          try { re = new RegExp(pattern, flags.has('i') ? 'i' : ''); } catch (_) { return io.error('grep: pola tidak valid'); }
          const scan = (content, label) => {
            content.split('\n').forEach((ln, i) => {
              if (!re.test(ln)) return;
              const prefix = `${label ? label + ':' : ''}${flags.has('n') ? i + 1 + ':' : ''}`;
              const highlighted = escapeHtml(ln).replace(new RegExp(escapeHtml(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.has('i') ? 'gi' : 'g'), (m) => `<span class="t-red t-bold">${m}</span>`);
              io.html(`<span class="t-magenta">${escapeHtml(prefix)}</span>${highlighted}`, prefix + ln);
            });
          };
          if (!files.length) {
            if (io.stdin == null) return io.error('grep: tidak ada masukan');
            scan(io.stdin, '');
            return;
          }
          files.forEach((f) => {
            try { scan(vfs.readFile(resolve(f)), files.length > 1 ? f : ''); } catch (err) { io.error(`grep: ${f}: ${err.message}`); }
          });
        },
      },
      head: {
        desc: 'Tampilkan baris pertama',
        usage: 'head [-n N] [berkas]',
        run(a, io) {
          const { rest, opts } = parseFlags(a, ['n']);
          const text = readInput(rest[0], io, 'head');
          if (text != null) io.print(text.split('\n').slice(0, opts.n || 10).join('\n'));
        },
      },
      tail: {
        desc: 'Tampilkan baris terakhir',
        usage: 'tail [-n N] [berkas]',
        run(a, io) {
          const { rest, opts } = parseFlags(a, ['n']);
          const text = readInput(rest[0], io, 'tail');
          if (text != null) io.print(text.replace(/\n$/, '').split('\n').slice(-(opts.n || 10)).join('\n'));
        },
      },
      wc: {
        desc: 'Hitung baris, kata, dan karakter',
        usage: 'wc [berkas]',
        run(a, io) {
          const text = readInput(a[0], io, 'wc');
          if (text == null) return;
          const lines = text ? text.replace(/\n$/, '').split('\n').length : 0;
          const words = (text.match(/\S+/g) || []).length;
          io.print(`${lines} baris  ${words} kata  ${text.length} karakter${a[0] ? '  ' + a[0] : ''}`);
        },
      },
      sort: {
        desc: 'Urutkan baris',
        usage: 'sort [-r] [berkas]',
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          const text = readInput(rest[0], io, 'sort');
          if (text == null) return;
          const lines = text.replace(/\n$/, '').split('\n').sort((x, y) => x.localeCompare(y, 'id'));
          if (flags.has('r')) lines.reverse();
          io.print(lines.join('\n'));
        },
      },
      clear: { desc: 'Bersihkan layar', run: () => { out.innerHTML = ''; } },
      date: { desc: 'Tampilkan tanggal dan waktu', run: (a, io) => io.print(new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeStyle: 'long' }).format(new Date())) },
      cal: {
        desc: 'Tampilkan kalender bulan ini',
        run(a, io) {
          const d = new Date();
          const first = new Date(d.getFullYear(), d.getMonth(), 1);
          const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          const title = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(d);
          io.print(title.padStart(10 + Math.ceil(title.length / 2)));
          io.print('Mi Sn Sl Rb Km Jm Sb');
          let cells = Array(first.getDay()).fill('  ');
          const flush = () => {
            const html = cells.map((c) => {
              const cell = c.replace(/ /g, '&nbsp;');
              return c.trim() === String(d.getDate()) ? `<span class="t-invert">${cell}</span>` : cell;
            });
            io.html(html.join('&nbsp;'), cells.join(' '));
            cells = [];
          };
          for (let day = 1; day <= days; day++) {
            cells.push(String(day).padStart(2));
            if (cells.length === 7) flush();
          }
          if (cells.length) flush();
        },
      },
      whoami: { desc: 'Tampilkan nama pengguna', run: (a, io) => io.print(userName()) },
      hostname: { desc: 'Tampilkan nama host', run: (a, io) => io.print('awanos') },
      uname: {
        desc: 'Informasi sistem',
        usage: 'uname [-a]',
        run: (a, io) => io.print(a.includes('-a') ? `AwanOS awanos ${OS.version} ${navigator.platform || 'web'} JavaScript` : 'AwanOS'),
      },
      uptime: {
        desc: 'Lama sistem berjalan',
        run(a, io) {
          const s = Math.floor((Date.now() - BOOT_TIME) / 1000);
          io.print(`aktif ${Math.floor(s / 3600)} jam ${Math.floor((s % 3600) / 60)} menit ${s % 60} detik`);
        },
      },
      history: {
        desc: 'Riwayat perintah',
        usage: 'history [-c]',
        run(a, io) {
          if (a[0] === '-c') { history.length = 0; hIdx = 0; OS.storage.write('terminal.history', history); return; }
          history.forEach((c, i) => io.print(`${String(i + 1).padStart(4)}  ${c}`));
        },
      },
      calc: {
        desc: 'Kalkulator (mis. calc 2*(3+4)^2)',
        usage: 'calc ekspresi',
        run(a, io) {
          const expr = a.join(' ');
          if (!expr) return io.error('calc: ekspresi hilang');
          try {
            const r = evaluate(expr);
            io.print(Number.isFinite(r) ? String(parseFloat(r.toPrecision(12))) : String(r));
          } catch (err) {
            io.error(`calc: ${err.message}`);
          }
        },
      },
      open: {
        desc: 'Buka berkas, folder, atau aplikasi',
        usage: 'open jalur|aplikasi',
        run(a, io) {
          if (!a.length) return io.error('open: operand hilang');
          a.forEach((t) => {
            const p = resolve(t);
            if (vfs.exists(p)) OS.apps.openPath(p);
            else if (OS.apps.get(t)) OS.wm.open(t);
            else io.error(`open: '${t}' bukan berkas maupun aplikasi`);
          });
        },
      },
      edit: {
        desc: 'Edit berkas di Notepad',
        usage: 'edit berkas',
        run(a, io) {
          if (!a[0]) return OS.wm.open('notepad');
          const p = resolve(a[0]);
          try {
            if (!vfs.exists(p)) vfs.writeFile(p, '');
            OS.wm.open('notepad', { path: p });
          } catch (err) { io.error(`edit: ${err.message}`); }
        },
      },
      apps: {
        desc: 'Daftar aplikasi terpasang',
        run(a, io) {
          OS.apps.list().forEach((app) => io.html(`<span class="t-cyan">${app.id.padEnd(13).replace(/ /g, '&nbsp;')}</span>${escapeHtml(app.name)}`, `${app.id.padEnd(13)}${app.name}`));
        },
      },
      theme: {
        desc: 'Ganti tema (light/dark)',
        usage: 'theme [light|dark]',
        run(a, io) {
          if (!a[0]) return io.print(`Tema saat ini: ${OS.settings.get('theme')}`);
          if (!['light', 'dark'].includes(a[0])) return io.error('theme: gunakan "light" atau "dark"');
          OS.settings.set('theme', a[0]);
          io.print(`Tema diubah ke ${a[0]}.`);
        },
      },
      wallpaper: {
        desc: 'Daftar atau ganti wallpaper',
        usage: 'wallpaper [id]',
        run(a, io) {
          if (!a[0]) {
            OS.wallpapers.forEach((w) => io.print(`${w.id === OS.settings.get('wallpaper') ? '*' : ' '} ${w.id.padEnd(8)} ${w.name}`));
            return;
          }
          if (!OS.wallpapers.some((w) => w.id === a[0])) return io.error(`wallpaper: '${a[0]}' tidak ditemukan`);
          OS.settings.set('wallpaper', a[0]);
        },
      },
      notify: {
        desc: 'Kirim notifikasi',
        usage: 'notify pesan',
        run: (a) => OS.notify({ title: 'Terminal', body: a.join(' ') || 'Halo!', app: 'terminal' }),
      },
      df: {
        desc: 'Pemakaian penyimpanan',
        run(a, io) {
          const used = OS.storage.usage();
          const total = 5 * 1024 * 1024;
          io.print('Sistem berkas      Ukuran   Terpakai  Sisa     Guna%');
          io.print(`localStorage       ${formatBytes(total).padEnd(8)} ${formatBytes(used).padEnd(9)} ${formatBytes(Math.max(0, total - used)).padEnd(8)} ${Math.round((used / total) * 100)}%`);
        },
      },
      du: {
        desc: 'Ukuran berkas/direktori',
        usage: 'du [jalur]',
        run(a, io) {
          const st = vfs.stat(resolve(a[0] || '.'));
          if (!st) return io.error(`du: '${a[0]}': tidak ditemukan`);
          io.print(`${formatBytes(st.size)}\t${a[0] || '.'}`);
        },
      },
      neofetch: { desc: 'Info sistem dengan gaya', run: (a, io) => neofetch(io) },
      cowsay: {
        desc: 'Sapi yang bisa bicara',
        usage: 'cowsay pesan',
        run(a, io) {
          const msg = a.join(' ') || (io.stdin || '').trim() || 'Moo!';
          const width = Math.min(40, msg.length);
          const lines = [];
          for (let i = 0; i < msg.length; i += width) lines.push(msg.slice(i, i + width).padEnd(width));
          io.print(` ${'_'.repeat(width + 2)}`);
          lines.forEach((l, i) => {
            const [o, c] = lines.length === 1 ? ['<', '>'] : i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|'];
            io.print(`${o} ${l} ${c}`);
          });
          io.print(` ${'-'.repeat(width + 2)}`);
          io.print('        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||');
        },
      },
      peribahasa: { desc: 'Peribahasa acak', run: (a, io) => io.print(PROVERBS[Math.floor(Math.random() * PROVERBS.length)], 't-yellow') },
      sudo: { desc: 'Jalankan sebagai admin', run: (a, io) => io.error(`${userName()} tidak ada dalam berkas sudoers. Kejadian ini akan dilaporkan. 😉`) },
      lock: { desc: 'Kunci layar', run: () => OS.session.lock() },
      reboot: { desc: 'Mulai ulang sistem', run: () => OS.session.restart() },
      shutdown: { desc: 'Matikan sistem', run: () => OS.session.shutdown() },
      exit: { desc: 'Tutup terminal', run: () => win.close() },
    };
    COMMANDS.dir = { ...COMMANDS.ls, desc: 'Alias untuk ls' };
    COMMANDS.cls = { ...COMMANDS.clear, desc: 'Alias untuk clear' };
    COMMANDS.nano = { ...COMMANDS.edit, desc: 'Alias untuk edit' };

    function readInput(file, io, cmd) {
      if (file) {
        try { return vfs.readFile(resolve(file)); } catch (err) { io.error(`${cmd}: ${file}: ${err.message}`); return null; }
      }
      if (io.stdin == null) { io.error(`${cmd}: tidak ada masukan`); return null; }
      return io.stdin;
    }

    function colorFile(name) {
      const ext = extname(name);
      const cls = ext === 'app' ? 't-green' : OS.icons.fileKind(name) === 'image' ? 't-magenta' : ['html', 'js', 'css', 'json'].includes(ext) ? 't-yellow' : '';
      return cls ? `<span class="${cls}">${escapeHtml(name)}</span>` : escapeHtml(name);
    }

    function neofetch(io) {
      const art = [
        '        .-~~~-.        ',
        '  .- ~ ~-(       )_ _  ',
        ' /                  ~ -.',
        '|     AwanOS          \\',
        ' \\                   .\'',
        '   ~- . _________ . -~ ',
        '                       ',
      ];
      const s = Math.floor((Date.now() - BOOT_TIME) / 1000);
      const ua = navigator.userAgent.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/);
      const info = [
        `<span class="t-cyan t-bold">${escapeHtml(userName())}</span>@<span class="t-cyan t-bold">awanos</span>`,
        '-----------------',
        `<span class="t-cyan">OS</span>: AwanOS ${OS.version}`,
        `<span class="t-cyan">Kernel</span>: ${escapeHtml(ua ? ua[0] : 'Browser')}`,
        `<span class="t-cyan">Uptime</span>: ${Math.floor(s / 60)} menit`,
        `<span class="t-cyan">Shell</span>: awsh 1.0`,
        `<span class="t-cyan">Resolusi</span>: ${window.innerWidth}x${window.innerHeight}`,
        `<span class="t-cyan">Tema</span>: ${OS.settings.get('theme') === 'dark' ? 'Gelap' : 'Terang'} · aksen ${escapeHtml(OS.settings.get('accent'))}`,
        `<span class="t-cyan">Aplikasi</span>: ${OS.apps.list().length}`,
        `<span class="t-cyan">Penyimpanan</span>: ${formatBytes(OS.storage.usage())} / 5 MB`,
        `<span class="t-cyan">CPU</span>: ${navigator.hardwareConcurrency || '?'} inti`,
        '',
        ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'].map((c) => `<span style="background:${c}">&nbsp;&nbsp;&nbsp;</span>`).join(''),
      ];
      const rows = Math.max(art.length, info.length);
      for (let i = 0; i < rows; i++) {
        const left = escapeHtml((art[i] || '').padEnd(24)).replace(/ /g, '&nbsp;');
        io.html(`<span class="t-accent">${left}</span>&nbsp;&nbsp;${info[i] || ''}`, `${(art[i] || '').padEnd(24)}  ${(info[i] || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')}`);
      }
    }

    /* Execution --------------------------------------------------------- */

    /**
     * Split a command line on unquoted operators. Returns [{ text, op }] where op is the
     * operator that precedes the segment: null, "&&", "||", ";" (chains) or "|" (pipes).
     */
    function splitOn(lineText, ops) {
      const parts = [];
      let cur = '';
      let quote = null;
      let op = null;
      for (let i = 0; i < lineText.length; i++) {
        const c = lineText[i];
        const two = lineText.slice(i, i + 2);
        if (quote) {
          if (c === quote) quote = null;
          cur += c;
        } else if (c === '"' || c === "'") {
          quote = c;
          cur += c;
        } else if (ops.includes(two)) {
          parts.push({ text: cur.trim(), op });
          op = two;
          cur = '';
          i++;
        } else if (ops.includes(c) && !(c === '|' && lineText[i + 1] === '|')) {
          parts.push({ text: cur.trim(), op });
          op = c;
          cur = '';
        } else {
          cur += c;
        }
      }
      parts.push({ text: cur.trim(), op });
      return parts;
    }

    function execute(lineText) {
      let ok = true;
      for (const { text, op } of splitOn(lineText, ['&&', '||', ';'])) {
        if (!text) {
          if (op && op !== ';') { toScreen(`awsh: kesalahan sintaks di dekat "${op}"`, 't-red'); return; }
          continue;
        }
        if (op === '&&' && !ok) continue;
        if (op === '||' && ok) continue;
        ok = runPipeline(text);
        if (win.closed) return;
      }
    }

    /** Run one pipeline ("a | b > file"). Returns false when any stage reported an error. */
    function runPipeline(lineText) {
      const segments = splitOn(lineText, ['|']).map((p) => p.text);
      let stdin = null;
      let ok = true;
      for (let s = 0; s < segments.length; s++) {
        let tokens = splitArgs(segments[s]);
        if (!tokens.length) { toScreen('awsh: kesalahan sintaks di dekat "|"', 't-red'); return false; }
        // Output redirection: "> file", ">> file", ">file"
        let redirect = null;
        const kept = [];
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i];
          const m = /^(>>?)(.*)$/.exec(t);
          if (m) {
            const target = m[2] || tokens[++i];
            if (!target) { toScreen('awsh: kesalahan sintaks: target pengalihan hilang', 't-red'); return false; }
            redirect = { append: m[1] === '>>', target };
          } else kept.push(t);
        }
        tokens = kept;
        const [name, ...cmdArgs] = tokens;
        const cmd = COMMANDS[name];
        if (!cmd) {
          toScreen(`awsh: ${name}: perintah tidak ditemukan. Ketik "help" untuk bantuan.`, 't-red');
          return false;
        }
        const buffer = [];
        const io = {
          stdin,
          print: (text, cls) => String(text).split('\n').forEach((t) => buffer.push({ text: t, cls })),
          html: (html, plain) => buffer.push({ html, text: plain != null ? plain : html.replace(/<[^>]+>/g, '') }),
          error: (text) => {
            ok = false;
            writeLines([{ text, cls: 't-red' }]);
          },
        };
        try {
          cmd.run(cmdArgs, io);
        } catch (err) {
          io.error(`${name}: ${err.message}`);
        }
        const isLast = s === segments.length - 1;
        if (redirect) {
          const text = buffer.map((b) => b.text).join('\n') + (buffer.length ? '\n' : '');
          try {
            const p = resolve(redirect.target);
            if (redirect.append) vfs.appendFile(p, text);
            else vfs.writeFile(p, text);
          } catch (err) {
            toScreen(`awsh: ${redirect.target}: ${err.message}`, 't-red');
            ok = false;
          }
          stdin = '';
        } else if (!isLast) {
          stdin = buffer.map((b) => b.text).join('\n') + '\n';
        } else {
          writeLines(buffer);
        }
      }
      return ok;
    }

    function submit() {
      const cmdLine = input.value;
      writeLines([{ html: `${promptHtml()}${escapeHtml(cmdLine)}` }]);
      input.value = '';
      draft = '';
      if (cmdLine.trim()) {
        if (history[history.length - 1] !== cmdLine) history.push(cmdLine);
        while (history.length > 200) history.shift();
        OS.storage.write('terminal.history', history);
        execute(cmdLine.trim());
      }
      hIdx = history.length;
      if (!win.closed) {
        renderPrompt();
        screen.scrollTop = screen.scrollHeight;
      }
    }

    function complete() {
      const value = input.value.slice(0, input.selectionStart);
      const after = input.value.slice(input.selectionStart);
      const m = /(\S*)$/.exec(value);
      const word = m[1];
      const before = value.slice(0, value.length - word.length);
      const isCommand = !before.trim() || /(\|\||&&|[|;])\s*$/.test(before);
      let options;
      let base = '';
      if (isCommand) {
        options = Object.keys(COMMANDS).filter((c) => c.startsWith(word)).map((c) => ({ name: c, dir: false }));
      } else {
        const slash = word.lastIndexOf('/');
        base = slash >= 0 ? word.slice(0, slash + 1) : '';
        const partial = word.slice(slash + 1);
        const dir = resolve(base || '.');
        if (!vfs.isDir(dir)) return;
        options = vfs.readdir(dir).filter((e) => e.name.startsWith(partial)).map((e) => ({ name: e.name, dir: e.type === 'dir' }));
      }
      if (!options.length) return;
      const quoteIfNeeded = (s) => (/\s/.test(s) ? `"${s}"` : s);
      if (options.length === 1) {
        const o = options[0];
        const completed = isCommand ? `${o.name} ` : `${quoteIfNeeded(base + o.name)}${o.dir ? '/' : ' '}`.replace(/"\/$/, '/"');
        input.value = value.slice(0, value.length - word.length) + completed + after;
      } else {
        let prefix = options[0].name;
        for (const o of options) while (!o.name.startsWith(prefix)) prefix = prefix.slice(0, -1);
        const typed = isCommand ? word : word.slice(word.lastIndexOf('/') + 1);
        if (prefix.length > typed.length) {
          input.value = value.slice(0, value.length - word.length) + (isCommand ? prefix : base + prefix) + after;
        } else {
          writeLines([{ html: `${promptHtml()}${escapeHtml(input.value)}` }]);
          writeLines([{ html: options.map((o) => (o.dir ? `<span class="t-blue">${escapeHtml(o.name)}/</span>` : escapeHtml(o.name))).join('&nbsp;&nbsp;&nbsp;') }]);
        }
      }
      const pos = input.value.length - after.length;
      input.setSelectionRange(pos, pos);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (hIdx === history.length) draft = input.value;
        if (hIdx > 0) { hIdx--; input.value = history[hIdx]; }
        setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (hIdx < history.length) { hIdx++; input.value = hIdx === history.length ? draft : history[hIdx]; }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        complete();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        out.innerHTML = '';
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && input.selectionStart === input.selectionEnd) {
        e.preventDefault();
        writeLines([{ html: `${promptHtml()}${escapeHtml(input.value)}^C` }]);
        input.value = '';
        hIdx = history.length;
      }
    });

    screen.addEventListener('mouseup', () => {
      if (!window.getSelection().toString()) input.focus({ preventScroll: true });
    });
    win.on('focus', () => setTimeout(() => input.focus({ preventScroll: true }), 0));

    let motd = '';
    try { motd = vfs.readFile('/etc/motd').replace(/\n$/, ''); } catch (_) { /* no motd */ }
    writeLines([{ html: `<span class="t-bold">AwanOS ${OS.version}</span> <span class="t-dim">(awsh)</span>` }]);
    if (motd) toScreen(motd, 't-dim');
    writeLines([{ text: '' }]);
    renderPrompt();
    if (args.command) {
      input.value = args.command;
      submit();
    }
    setTimeout(() => input.focus(), 50);
  }

  OS.apps.register({
    id: 'terminal',
    name: 'Terminal',
    description: 'Baris perintah awsh',
    keywords: ['shell', 'console', 'cmd', 'bash', 'konsol'],
    icon: 'terminal',
    colors: ['#334155', '#0f172a'],
    width: 720,
    height: 440,
    minWidth: 360,
    minHeight: 220,
    launch,
  });
})();
