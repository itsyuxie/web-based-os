/* AwanOS — Browser */
(function () {
  'use strict';
  const OS = window.OS;
  const t = OS.i18n.forApp('browser');
  const { h, escapeHtml } = OS.utils;
  const { glyph } = OS.icons;
  const vfs = OS.vfs;

  const SEARCH = 'https://www.google.com/search?igu=1&q=';
  const HOME_URL = 'awan://home';
  // Home page quick links; local files are only listed when they exist (older installs may lack them).
  const quickLinks = () => [
    { id: 'google', url: 'https://www.google.com/webhp?igu=1', color: ['#4285f4', '#34a853'], letter: 'G' },
    { id: 'wikipedia', url: `https://${t.lang}.wikipedia.org/`, color: ['#6b7280', '#111827'], letter: 'W' },
    { id: 'map', url: 'https://www.openstreetmap.org/export/embed.html?bbox=106.70%2C-6.32%2C106.98%2C-6.10&layer=mapnik', color: ['#7ebc6f', '#3b7d33'], letter: 'M' },
    { id: 'example', url: 'https://example.com/', color: ['#a78bfa', '#6d28d9'], letter: 'E' },
    { id: 'hello', url: `${vfs.HOME}/Documents/hello.html`, local: true, color: ['#38bdf8', '#6366f1'], letter: 'H' },
  ].filter((l) => !l.local || vfs.isFile(l.url));
  const SANDBOX_WEB = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads';
  const SANDBOX_LOCAL = 'allow-scripts allow-forms allow-popups allow-modals';

  function classify(input) {
    const raw = input.trim();
    if (!raw || raw === HOME_URL) return { type: 'home' };
    if ((raw.startsWith('/') || raw.startsWith('~')) && vfs.isFile(raw)) return { type: 'file', path: vfs.resolve(raw) };
    if (/^https?:\/\//i.test(raw)) return { type: 'url', url: raw };
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(raw) && !/\s/.test(raw)) return { type: 'url', url: `https://${raw}` };
    return { type: 'url', url: SEARCH + encodeURIComponent(raw), query: raw };
  }

  function launch(win, args) {
    const stack = [];
    let index = -1;
    let hintDismissed = false;

    const backBtn = h('button', { class: 'icon-btn', title: t('toolbar.back'), html: glyph('back'), onclick: () => go(-1) });
    const fwdBtn = h('button', { class: 'icon-btn', title: t('toolbar.forward'), html: glyph('forward'), onclick: () => go(1) });
    const reloadBtn = h('button', { class: 'icon-btn', title: t('toolbar.reload'), html: glyph('refresh'), onclick: () => show(stack[index]) });
    const homeBtn = h('button', { class: 'icon-btn', title: t('toolbar.home'), html: glyph('home'), onclick: () => navigate('') });
    const address = h('input', { class: 'input br-address', spellcheck: false, placeholder: t('toolbar.addressPlaceholder'), 'aria-label': t('toolbar.address') });
    const extBtn = h('button', { class: 'icon-btn', title: t('toolbar.newTab'), html: glyph('external'), onclick: openExternal });
    const progress = h('div', { class: 'br-progress' });
    const hint = h('div', { class: 'br-hint', hidden: true });
    const frame = h('iframe', { class: 'br-frame', title: t('frameTitle'), referrerpolicy: 'no-referrer' });
    const home = buildHome();

    win.body.classList.add('browser');
    win.body.append(
      h('div', { class: 'toolbar' }, backBtn, fwdBtn, reloadBtn, homeBtn, address, extBtn),
      progress,
      hint,
      h('div', { class: 'br-view' }, home, frame)
    );

    function buildHome() {
      const search = h('input', { class: 'input br-home-search', placeholder: t('home.searchPlaceholder'), spellcheck: false });
      search.addEventListener('keydown', (e) => { if (e.key === 'Enter' && search.value.trim()) navigate(search.value); });
      const links = h('div', { class: 'br-links' }, quickLinks().map((l) => h('button', {
        class: 'br-link',
        html: `<span class="br-link-icon" style="background:linear-gradient(150deg,${l.color[0]},${l.color[1]})">${l.letter}</span><span>${escapeHtml(t(`home.links.${l.id}`))}</span>`,
        onclick: () => navigate(l.url),
      })));
      return h('div', { class: 'br-home' },
        h('div', { class: 'br-home-logo', html: `${OS.icons.logo('xl')}<span>Awan<b>Browser</b></span>` }),
        search,
        links,
        h('p', { class: 'br-note', text: t('home.note', { button: t('toolbar.newTab') }) })
      );
    }

    function navigate(input) {
      const entry = classify(input);
      stack.splice(index + 1);
      stack.push(entry);
      index = stack.length - 1;
      show(entry);
    }

    function go(delta) {
      const next = index + delta;
      if (next < 0 || next >= stack.length) return;
      index = next;
      show(stack[index]);
    }

    function startProgress() {
      // Snap back to zero without animating, then grow again.
      progress.style.transition = 'none';
      progress.classList.remove('done', 'loading');
      void progress.offsetWidth;
      progress.style.transition = '';
      progress.classList.add('loading');
    }

    function show(entry) {
      backBtn.disabled = index <= 0;
      fwdBtn.disabled = index >= stack.length - 1;
      hint.hidden = true;
      if (entry.type === 'home') {
        home.hidden = false;
        frame.hidden = true;
        frame.removeAttribute('srcdoc');
        frame.src = 'about:blank';
        address.value = '';
        extBtn.disabled = true;
        win.setTitle(t('title.home'));
        setTimeout(() => home.querySelector('input').focus(), 30);
        return;
      }
      home.hidden = true;
      frame.hidden = false;
      extBtn.disabled = false;
      startProgress();
      if (entry.type === 'file') {
        frame.setAttribute('sandbox', SANDBOX_LOCAL);
        frame.removeAttribute('src');
        let html = '';
        try { html = vfs.readFile(entry.path); } catch (err) { html = `<p>${escapeHtml(err.message)}</p>`; }
        frame.srcdoc = html;
        address.value = entry.path;
        win.setTitle(t('title.page', { page: vfs.basename(entry.path) }));
      } else {
        frame.setAttribute('sandbox', SANDBOX_WEB);
        frame.removeAttribute('srcdoc');
        frame.src = entry.url;
        address.value = entry.query || entry.url;
        let host = entry.url;
        try { host = new URL(entry.url).hostname.replace(/^www\./, ''); } catch (_) { /* keep raw */ }
        win.setTitle(entry.query ? t('title.search', { query: entry.query }) : t('title.page', { page: host }));
        if (!hintDismissed) {
          hint.hidden = false;
          hint.innerHTML = '';
          hint.append(
            h('span', { html: `${glyph('info')} ${escapeHtml(t('hint.text'))}` }),
            h('button', { class: 'link-btn', text: t('hint.newTab'), onclick: openExternal }),
            h('button', { class: 'icon-btn', title: t('hint.close'), html: glyph('close'), onclick: () => { hint.hidden = true; hintDismissed = true; } })
          );
        }
      }
    }

    function openExternal() {
      const entry = stack[index];
      if (!entry || entry.type === 'home') return;
      if (entry.type === 'url') {
        window.open(entry.url.replace('igu=1&', '').replace('?igu=1', ''), '_blank', 'noopener');
      } else {
        const blob = new Blob([vfs.readFile(entry.path)], { type: 'text/html' });
        window.open(URL.createObjectURL(blob), '_blank', 'noopener');
      }
    }

    frame.addEventListener('load', () => {
      progress.classList.remove('loading');
      progress.classList.add('done');
    });
    address.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        navigate(address.value);
        address.blur();
      }
    });
    address.addEventListener('focus', () => address.select());

    win.onArgs = (a) => {
      if (a.path) navigate(a.path);
      else if (a.url) navigate(a.url);
    };
    win.filePath = args.path ? vfs.resolve(args.path) : null;
    navigate(args.path || args.url || '');
  }

  OS.apps.register({
    id: 'browser',
    languages: ['en'],
    icon: 'globe',
    colors: ['#22d3ee', '#0e7490'],
    width: 960,
    height: 620,
    minWidth: 420,
    minHeight: 300,
    fileTypes: ['html', 'htm'],
    launch,
  });
})();
