/* AwanOS — Terminal */
(function () {
  'use strict';
  const OS = window.OS;
  const t = OS.i18n.forApp('terminal');
  const { h, escapeHtml, splitArgs, formatBytes, formatDate, extname } = OS.utils;
  const vfs = OS.vfs;
  const BOOT_TIME = Date.now();

  /* Safe arithmetic evaluator for `calc` ------------------------------- */
  function evaluate(expr) {
    const tokens = expr.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|\*\*|[-+*/%^(),]/gi);
    if (!tokens || tokens.join('') !== expr.replace(/\s+/g, '')) throw new Error(t('calc.invalid'));
    let i = 0;
    const FUNCS = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, log: Math.log10, ln: Math.log, round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp };
    const CONSTS = { pi: Math.PI, e: Math.E };
    const peek = () => tokens[i];
    const next = () => tokens[i++];
    function primary() {
      const tok = next();
      if (tok === undefined) throw new Error(t('calc.incomplete'));
      if (tok === '(') {
        const v = additive();
        if (next() !== ')') throw new Error(t('calc.missingParen'));
        return v;
      }
      if (/^\d|^\./.test(tok)) return parseFloat(tok);
      const name = tok.toLowerCase();
      if (name in CONSTS) return CONSTS[name];
      if (name in FUNCS) {
        if (next() !== '(') throw new Error(t('calc.needsParen', { name }));
        const v = additive();
        if (next() !== ')') throw new Error(t('calc.missingParen'));
        return FUNCS[name](v);
      }
      throw new Error(t('calc.unknownSymbol', { symbol: tok }));
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
    if (i < tokens.length) throw new Error(t('calc.unexpectedToken', { token: tokens[i] }));
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
    const input = h('input', { class: 'term-input', spellcheck: false, autocomplete: 'off', autocapitalize: 'off', 'aria-label': t('inputLabel') });
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

    const toScreen = (text, cls) => writeLines(String(text).split('\n').map((ln) => ({ text: ln, cls })));

    /* Commands --------------------------------------------------------- */

    const resolve = (p) => vfs.resolve(p, cwd);

    const COMMANDS = {
      help: {
        desc: t('commands.help.desc'),
        run(a, io) {
          if (a[0] && COMMANDS[a[0]]) {
            io.print(`${a[0]} — ${COMMANDS[a[0]].desc}`);
            if (COMMANDS[a[0]].usage) io.print(t('help.usage', { usage: COMMANDS[a[0]].usage }));
            return;
          }
          io.print(t('help.available'), 't-bold');
          Object.keys(COMMANDS).sort().forEach((name) => {
            io.html(`  <span class="t-cyan">${name.padEnd(10).replace(/ /g, '&nbsp;')}</span>${escapeHtml(COMMANDS[name].desc)}`, `${name.padEnd(10)}${COMMANDS[name].desc}`);
          });
          io.print('');
          io.print(t('help.tips'));
          io.print(t('help.operators'));
        },
      },
      ls: {
        desc: t('commands.ls.desc'),
        usage: t('commands.ls.usage'),
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          const targets = rest.length ? rest : ['.'];
          targets.forEach((target, idx) => {
            const p = resolve(target);
            const st = vfs.stat(p);
            if (!st) return io.error(t('ls.cannotAccess', { path: target }));
            if (targets.length > 1) io.print(`${idx ? '\n' : ''}${target}:`);
            let entries = st.type === 'dir' ? vfs.readdir(p) : [{ name: vfs.basename(p), type: 'file', size: st.size, mtime: st.mtime }];
            if (!flags.has('a')) entries = entries.filter((e) => !e.name.startsWith('.'));
            if (flags.has('l')) {
              io.print(t('ls.total', { count: entries.length }));
              entries.forEach((e) => {
                const size = e.type === 'dir' ? '-' : formatBytes(e.size, t.locale);
                const name = e.type === 'dir' ? `<span class="t-blue">${escapeHtml(e.name)}/</span>` : colorFile(e.name);
                const plain = `${e.type === 'dir' ? 'd' : '-'}rw-r--r--  ${size.padStart(9)}  ${formatDate(e.mtime, t.locale)}  ${e.name}`;
                io.html(`${e.type === 'dir' ? 'd' : '-'}rw-r--r--  ${escapeHtml(size.padStart(9)).replace(/ /g, '&nbsp;')}  <span class="t-dim">${escapeHtml(formatDate(e.mtime, t.locale))}</span>  ${name}`, plain);
              });
            } else if (entries.length) {
              const html = entries.map((e) => (e.type === 'dir' ? `<span class="t-blue">${escapeHtml(e.name)}/</span>` : colorFile(e.name))).join('&nbsp;&nbsp;&nbsp;');
              io.html(html, entries.map((e) => e.name).join('\n'));
            }
          });
        },
      },
      cd: {
        desc: t('commands.cd.desc'),
        usage: t('commands.cd.usage'),
        run(a, io) {
          const target = a[0] === '-' ? prevCwd : resolve(a[0] || '~');
          if (!vfs.exists(target)) return io.error(t('cd.noSuchFile', { path: a[0] }));
          if (!vfs.isDir(target)) return io.error(t('cd.notDir', { path: a[0] }));
          prevCwd = cwd;
          cwd = target;
        },
      },
      pwd: { desc: t('commands.pwd.desc'), run: (a, io) => io.print(cwd) },
      cat: {
        desc: t('commands.cat.desc'),
        usage: t('commands.cat.usage'),
        run(a, io) {
          if (!a.length) {
            if (io.stdin != null) io.print(io.stdin.replace(/\n$/, ''));
            return;
          }
          a.forEach((f) => {
            try {
              const c = vfs.readFile(resolve(f));
              if (/^data:[^,]*;base64,/.test(c)) io.error(t('cat.binary', { file: f }));
              else io.print(c.replace(/\n$/, ''));
            } catch (err) {
              io.error(`cat: ${f}: ${err.message}`);
            }
          });
        },
      },
      echo: { desc: t('commands.echo.desc'), usage: t('commands.echo.usage'), run: (a, io) => io.print(a.join(' ')) },
      mkdir: {
        desc: t('commands.mkdir.desc'),
        usage: t('commands.mkdir.usage'),
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          if (!rest.length) return io.error(t('errors.missingOperand', { command: 'mkdir' }));
          rest.forEach((d) => {
            try { vfs.mkdir(resolve(d), { recursive: flags.has('p') }); } catch (err) { io.error(`mkdir: ${err.message}`); }
          });
        },
      },
      touch: {
        desc: t('commands.touch.desc'),
        usage: t('commands.touch.usage'),
        run(a, io) {
          if (!a.length) return io.error(t('touch.missingFile'));
          a.forEach((f) => {
            const p = resolve(f);
            try { vfs.writeFile(p, vfs.isFile(p) ? vfs.readFile(p) : ''); } catch (err) { io.error(`touch: ${err.message}`); }
          });
        },
      },
      rm: {
        desc: t('commands.rm.desc'),
        usage: t('commands.rm.usage'),
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          if (!rest.length) return io.error(t('errors.missingOperand', { command: 'rm' }));
          rest.forEach((f) => {
            const p = resolve(f);
            if (!vfs.exists(p)) { if (!flags.has('f')) io.error(t('rm.noSuchFile', { path: f })); return; }
            if (vfs.isDir(p) && !flags.has('r')) return io.error(t('rm.isDir', { path: f }));
            if (p === '/' || p === vfs.HOME) return io.error(t('rm.refuse', { path: p }));
            try { vfs.remove(p); } catch (err) { io.error(`rm: ${err.message}`); }
          });
        },
      },
      rmdir: {
        desc: t('commands.rmdir.desc'),
        usage: t('commands.rmdir.usage'),
        run(a, io) {
          a.forEach((d) => {
            const p = resolve(d);
            if (!vfs.isDir(p)) return io.error(t('rmdir.notDir', { path: d }));
            try { vfs.remove(p, { recursive: false }); } catch (err) { io.error(`rmdir: ${err.message}`); }
          });
        },
      },
      mv: {
        desc: t('commands.mv.desc'),
        usage: t('commands.mv.usage'),
        run(a, io) {
          if (a.length < 2) return io.error(t('errors.missingOperand', { command: 'mv' }));
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
        desc: t('commands.cp.desc'),
        usage: t('commands.cp.usage'),
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          if (rest.length < 2) return io.error(t('errors.missingOperand', { command: 'cp' }));
          const dest = resolve(rest[rest.length - 1]);
          rest.slice(0, -1).forEach((s) => {
            const src = resolve(s);
            if (vfs.isDir(src) && !flags.has('r')) return io.error(t('cp.omitDir', { path: s }));
            const target = vfs.isDir(dest) ? vfs.join(dest, vfs.basename(src)) : dest;
            try {
              if (vfs.isFile(target)) vfs.remove(target);
              vfs.copy(src, target);
            } catch (err) { io.error(`cp: ${err.message}`); }
          });
        },
      },
      tree: {
        desc: t('commands.tree.desc'),
        usage: t('commands.tree.usage'),
        run(a, io) {
          const root = resolve(a[0] || '.');
          if (!vfs.isDir(root)) return io.error(t('tree.notDir', { path: a[0] }));
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
          io.print(`\n${t('tree.summary', { dirs: t('tree.dirs', { count: dirs }), files: t('tree.files', { count: files }) })}`);
        },
      },
      find: {
        desc: t('commands.find.desc'),
        usage: t('commands.find.usage'),
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
        desc: t('commands.grep.desc'),
        usage: t('commands.grep.usage'),
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          const [pattern, ...files] = rest;
          if (!pattern) return io.error(t('grep.missingPattern'));
          let re;
          try { re = new RegExp(pattern, flags.has('i') ? 'i' : ''); } catch (_) { return io.error(t('grep.invalidPattern')); }
          const scan = (content, label) => {
            content.split('\n').forEach((ln, i) => {
              if (!re.test(ln)) return;
              const prefix = `${label ? label + ':' : ''}${flags.has('n') ? i + 1 + ':' : ''}`;
              const highlighted = escapeHtml(ln).replace(new RegExp(escapeHtml(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.has('i') ? 'gi' : 'g'), (m) => `<span class="t-red t-bold">${m}</span>`);
              io.html(`<span class="t-magenta">${escapeHtml(prefix)}</span>${highlighted}`, prefix + ln);
            });
          };
          if (!files.length) {
            if (io.stdin == null) return io.error(t('errors.noInput', { command: 'grep' }));
            scan(io.stdin, '');
            return;
          }
          files.forEach((f) => {
            try { scan(vfs.readFile(resolve(f)), files.length > 1 ? f : ''); } catch (err) { io.error(`grep: ${f}: ${err.message}`); }
          });
        },
      },
      head: {
        desc: t('commands.head.desc'),
        usage: t('commands.head.usage'),
        run(a, io) {
          const { rest, opts } = parseFlags(a, ['n']);
          const text = readInput(rest[0], io, 'head');
          if (text != null) io.print(text.split('\n').slice(0, opts.n || 10).join('\n'));
        },
      },
      tail: {
        desc: t('commands.tail.desc'),
        usage: t('commands.tail.usage'),
        run(a, io) {
          const { rest, opts } = parseFlags(a, ['n']);
          const text = readInput(rest[0], io, 'tail');
          if (text != null) io.print(text.replace(/\n$/, '').split('\n').slice(-(opts.n || 10)).join('\n'));
        },
      },
      wc: {
        desc: t('commands.wc.desc'),
        usage: t('commands.wc.usage'),
        run(a, io) {
          const text = readInput(a[0], io, 'wc');
          if (text == null) return;
          const lines = text ? text.replace(/\n$/, '').split('\n').length : 0;
          const words = (text.match(/\S+/g) || []).length;
          const summary = t('wc.summary', {
            lines: t('wc.lines', { count: lines }),
            words: t('wc.words', { count: words }),
            chars: t('wc.chars', { count: text.length }),
          });
          io.print(`${summary}${a[0] ? '  ' + a[0] : ''}`);
        },
      },
      sort: {
        desc: t('commands.sort.desc'),
        usage: t('commands.sort.usage'),
        run(a, io) {
          const { flags, rest } = parseFlags(a, []);
          const text = readInput(rest[0], io, 'sort');
          if (text == null) return;
          const lines = text.replace(/\n$/, '').split('\n').sort((x, y) => x.localeCompare(y, t.locale));
          if (flags.has('r')) lines.reverse();
          io.print(lines.join('\n'));
        },
      },
      clear: { desc: t('commands.clear.desc'), run: () => { out.innerHTML = ''; } },
      date: { desc: t('commands.date.desc'), run: (a, io) => io.print(new Intl.DateTimeFormat(t.locale, { dateStyle: 'full', timeStyle: 'long' }).format(new Date())) },
      cal: {
        desc: t('commands.cal.desc'),
        run(a, io) {
          const d = new Date();
          const first = new Date(d.getFullYear(), d.getMonth(), 1);
          const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          const title = new Intl.DateTimeFormat(t.locale, { month: 'long', year: 'numeric' }).format(d);
          io.print(title.padStart(10 + Math.ceil(title.length / 2)));
          // Two-letter weekday names, Sunday first (1 January 2023 was a Sunday).
          const weekday = new Intl.DateTimeFormat(t.locale, { weekday: 'short' });
          io.print(Array.from({ length: 7 }, (_, i) => weekday.format(new Date(2023, 0, 1 + i)).slice(0, 2).padEnd(2)).join(' '));
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
      whoami: { desc: t('commands.whoami.desc'), run: (a, io) => io.print(userName()) },
      hostname: { desc: t('commands.hostname.desc'), run: (a, io) => io.print('awanos') },
      uname: {
        desc: t('commands.uname.desc'),
        usage: t('commands.uname.usage'),
        run: (a, io) => io.print(a.includes('-a') ? `AwanOS awanos ${OS.version} ${navigator.platform || 'web'} JavaScript` : 'AwanOS'),
      },
      uptime: {
        desc: t('commands.uptime.desc'),
        run(a, io) {
          const s = Math.floor((Date.now() - BOOT_TIME) / 1000);
          io.print(t('uptime.summary', {
            hours: t('uptime.hours', { count: Math.floor(s / 3600) }),
            minutes: t('uptime.minutes', { count: Math.floor((s % 3600) / 60) }),
            seconds: t('uptime.seconds', { count: s % 60 }),
          }));
        },
      },
      history: {
        desc: t('commands.history.desc'),
        usage: t('commands.history.usage'),
        run(a, io) {
          if (a[0] === '-c') { history.length = 0; hIdx = 0; OS.storage.write('terminal.history', history); return; }
          history.forEach((c, i) => io.print(`${String(i + 1).padStart(4)}  ${c}`));
        },
      },
      calc: {
        desc: t('commands.calc.desc'),
        usage: t('commands.calc.usage'),
        run(a, io) {
          const expr = a.join(' ');
          if (!expr) return io.error(t('calc.missingExpression'));
          try {
            const r = evaluate(expr);
            io.print(Number.isFinite(r) ? String(parseFloat(r.toPrecision(12))) : String(r));
          } catch (err) {
            io.error(`calc: ${err.message}`);
          }
        },
      },
      open: {
        desc: t('commands.open.desc'),
        usage: t('commands.open.usage'),
        run(a, io) {
          if (!a.length) return io.error(t('errors.missingOperand', { command: 'open' }));
          a.forEach((target) => {
            const p = resolve(target);
            if (vfs.exists(p)) OS.apps.openPath(p);
            else if (OS.apps.get(target)) OS.wm.open(target);
            else io.error(t('open.notFound', { target }));
          });
        },
      },
      edit: {
        desc: t('commands.edit.desc'),
        usage: t('commands.edit.usage'),
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
        desc: t('commands.apps.desc'),
        run(a, io) {
          OS.apps.list().forEach((app) => io.html(`<span class="t-cyan">${app.id.padEnd(13).replace(/ /g, '&nbsp;')}</span>${escapeHtml(app.name)}`, `${app.id.padEnd(13)}${app.name}`));
        },
      },
      theme: {
        desc: t('commands.theme.desc'),
        usage: t('commands.theme.usage'),
        run(a, io) {
          if (!a[0]) return io.print(t('theme.current', { theme: OS.settings.get('theme') }));
          if (!['light', 'dark'].includes(a[0])) return io.error(t('theme.invalid'));
          OS.settings.set('theme', a[0]);
          io.print(t('theme.changed', { theme: a[0] }));
        },
      },
      wallpaper: {
        desc: t('commands.wallpaper.desc'),
        usage: t('commands.wallpaper.usage'),
        run(a, io) {
          if (!a[0]) {
            OS.wallpapers.forEach((w) => io.print(`${w.id === OS.settings.get('wallpaper') ? '*' : ' '} ${w.id.padEnd(8)} ${w.name}`));
            return;
          }
          if (!OS.wallpapers.some((w) => w.id === a[0])) return io.error(t('wallpaper.notFound', { id: a[0] }));
          OS.settings.set('wallpaper', a[0]);
        },
      },
      notify: {
        desc: t('commands.notify.desc'),
        usage: t('commands.notify.usage'),
        run: (a) => OS.notify({ title: t('name'), body: a.join(' ') || t('notify.defaultBody'), app: 'terminal' }),
      },
      df: {
        desc: t('commands.df.desc'),
        run(a, io) {
          const used = OS.storage.usage();
          const total = 5 * 1024 * 1024;
          io.print(`${t('df.filesystem').padEnd(18)} ${t('df.size').padEnd(8)} ${t('df.used').padEnd(9)} ${t('df.avail').padEnd(8)} ${t('df.usePercent')}`);
          io.print(`localStorage       ${formatBytes(total, t.locale).padEnd(8)} ${formatBytes(used, t.locale).padEnd(9)} ${formatBytes(Math.max(0, total - used), t.locale).padEnd(8)} ${Math.round((used / total) * 100)}%`);
        },
      },
      du: {
        desc: t('commands.du.desc'),
        usage: t('commands.du.usage'),
        run(a, io) {
          const st = vfs.stat(resolve(a[0] || '.'));
          if (!st) return io.error(t('du.notFound', { path: a[0] }));
          io.print(`${formatBytes(st.size, t.locale)}\t${a[0] || '.'}`);
        },
      },
      neofetch: { desc: t('commands.neofetch.desc'), run: (a, io) => neofetch(io) },
      cowsay: {
        desc: t('commands.cowsay.desc'),
        usage: t('commands.cowsay.usage'),
        run(a, io) {
          const msg = a.join(' ') || (io.stdin || '').trim() || t('cowsay.default');
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
      fortune: {
        desc: t('commands.fortune.desc'),
        run(a, io) {
          const fortunes = t('fortunes');
          io.print(fortunes[Math.floor(Math.random() * fortunes.length)], 't-yellow');
        },
      },
      sudo: { desc: t('commands.sudo.desc'), run: (a, io) => io.error(t('sudo.denied', { user: userName() })) },
      lock: { desc: t('commands.lock.desc'), run: () => OS.session.lock() },
      reboot: { desc: t('commands.reboot.desc'), run: () => OS.session.restart() },
      shutdown: { desc: t('commands.shutdown.desc'), run: () => OS.session.shutdown() },
      exit: { desc: t('commands.exit.desc'), run: () => win.close() },
    };
    COMMANDS.dir = { ...COMMANDS.ls, desc: t('help.alias', { command: 'ls' }) };
    COMMANDS.cls = { ...COMMANDS.clear, desc: t('help.alias', { command: 'clear' }) };
    COMMANDS.nano = { ...COMMANDS.edit, desc: t('help.alias', { command: 'edit' }) };

    function readInput(file, io, cmd) {
      if (file) {
        try { return vfs.readFile(resolve(file)); } catch (err) { io.error(`${cmd}: ${file}: ${err.message}`); return null; }
      }
      if (io.stdin == null) { io.error(t('errors.noInput', { command: cmd })); return null; }
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
      const label = (key, value) => `<span class="t-cyan">${escapeHtml(t(`neofetch.${key}`))}</span>: ${escapeHtml(String(value))}`;
      const info = [
        `<span class="t-cyan t-bold">${escapeHtml(userName())}</span>@<span class="t-cyan t-bold">awanos</span>`,
        '-----------------',
        label('os', `AwanOS ${OS.version}`),
        label('kernel', ua ? ua[0] : t('neofetch.browser')),
        label('uptime', t('neofetch.uptimeValue', { count: Math.floor(s / 60) })),
        label('shell', 'awsh 1.0'),
        label('resolution', `${window.innerWidth}x${window.innerHeight}`),
        label('theme', t('neofetch.themeValue', { mode: t(OS.settings.get('theme') === 'dark' ? 'neofetch.dark' : 'neofetch.light'), accent: OS.settings.get('accent') })),
        label('apps', OS.apps.list().length),
        label('storage', `${formatBytes(OS.storage.usage(), t.locale)} / 5 MB`),
        label('cpu', navigator.hardwareConcurrency ? t('neofetch.cores', { count: navigator.hardwareConcurrency }) : '?'),
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
          if (op && op !== ';') { toScreen(t('shell.syntaxError', { token: op }), 't-red'); return; }
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
        if (!tokens.length) { toScreen(t('shell.syntaxError', { token: '|' }), 't-red'); return false; }
        // Output redirection: "> file", ">> file", ">file"
        let redirect = null;
        const kept = [];
        for (let i = 0; i < tokens.length; i++) {
          const tok = tokens[i];
          const m = /^(>>?)(.*)$/.exec(tok);
          if (m) {
            const target = m[2] || tokens[++i];
            if (!target) { toScreen(t('shell.missingTarget'), 't-red'); return false; }
            redirect = { append: m[1] === '>>', target };
          } else kept.push(tok);
        }
        tokens = kept;
        const [name, ...cmdArgs] = tokens;
        const cmd = COMMANDS[name];
        if (!cmd) {
          toScreen(t('shell.notFound', { command: name }), 't-red');
          return false;
        }
        const buffer = [];
        const io = {
          stdin,
          print: (text, cls) => String(text).split('\n').forEach((ln) => buffer.push({ text: ln, cls })),
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
    languages: ['en'],
    icon: 'terminal',
    colors: ['#334155', '#0f172a'],
    width: 720,
    height: 440,
    minWidth: 360,
    minHeight: 220,
    launch,
  });
})();
