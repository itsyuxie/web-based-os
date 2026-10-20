/* AwanOS — persistent settings and appearance */
(function () {
  'use strict';
  const OS = window.OS;
  const PREFIX = 'awanos.';

  /** localStorage wrapper that never throws (private mode, quota, disabled storage). */
  const storage = {
    read(key, fallback = null) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (err) {
        console.warn('AwanOS: could not save', key, err);
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch (_) { /* ignore */ }
    },
    usage() {
      let chars = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith(PREFIX)) chars += k.length + (localStorage.getItem(k) || '').length;
        }
      } catch (_) { /* ignore */ }
      return chars * 2; // UTF-16 code units
    },
    clearAll() {
      try {
        Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
      } catch (_) { /* ignore */ }
    },
  };

  const WALLPAPERS = [
    { id: 'awan', css: 'url("assets/wallpapers/awan.svg") center / cover no-repeat, #6d8cff' },
    { id: 'senja', css: 'url("assets/wallpapers/senja.svg") center / cover no-repeat, #3b1d60' },
    {
      id: 'aurora',
      css: 'radial-gradient(ellipse 60% 50% at 25% 25%, rgba(16, 233, 170, .55), transparent 70%), radial-gradient(ellipse 55% 60% at 75% 55%, rgba(124, 77, 255, .6), transparent 70%), radial-gradient(ellipse 50% 40% at 50% 100%, rgba(56, 189, 248, .45), transparent 70%), #070b1f',
    },
    {
      id: 'laut',
      css: 'radial-gradient(circle at 80% 10%, rgba(120, 220, 255, .35), transparent 45%), linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    },
    { id: 'fajar', css: 'radial-gradient(circle at 20% 80%, rgba(255, 255, 255, .45), transparent 40%), linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)' },
    { id: 'hutan', css: 'radial-gradient(circle at 70% 20%, rgba(255, 244, 179, .35), transparent 40%), linear-gradient(150deg, #0b3d3a 0%, #134e5e 40%, #71b280 100%)' },
    {
      id: 'malam',
      css: 'radial-gradient(1.5px 1.5px at 20px 30px, #fff, transparent), radial-gradient(1px 1px at 120px 80px, #fff, transparent), radial-gradient(1.5px 1.5px at 200px 160px, #cfe3ff, transparent), radial-gradient(1px 1px at 60px 190px, #fff, transparent), radial-gradient(1px 1px at 260px 40px, #fff, transparent) 0 0 / 300px 220px, radial-gradient(ellipse at 50% 120%, #3a1c71 0%, #141432 55%, #05050f 100%)',
    },
    { id: 'grafit', css: 'radial-gradient(circle at 30% 20%, #3a4256, transparent 60%), linear-gradient(180deg, #1c2130, #0e1118)' },
  ];

  // Display names live in the language files (wallpapers.<id>).
  WALLPAPERS.forEach((wp) => Object.defineProperty(wp, 'name', { get: () => OS.t(`wallpapers.${wp.id}`), enumerable: true }));

  const ACCENTS = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4'];

  const DEFAULTS = {
    theme: 'dark',
    accent: '#3b82f6',
    wallpaper: 'awan',
    username: 'User',
    language: null, // null = follow the browser language
    animations: true,
    transparency: true,
    brightness: 100,
    nightLight: false,
    volume: 70,
    wifi: true,
    bluetooth: false,
    airplane: false,
    clockSeconds: false,
    pinned: ['explorer', 'browser', 'terminal', 'notepad', 'settings'],
    desktopPositions: {
      'explorer.app': [0, 0],
      'browser.app': [0, 1],
      'terminal.app': [0, 2],
      'notepad.app': [0, 3],
      'paint.app': [0, 4],
      'calculator.app': [0, 5],
      'minesweeper.app': [1, 0],
      'settings.app': [1, 1],
    },
  };

  const events = OS.utils.emitter();
  let values = Object.assign({}, DEFAULTS, storage.read('settings', {}));

  const settings = {
    DEFAULTS,
    get(key) {
      return values[key];
    },
    all() {
      return Object.assign({}, values);
    },
    set(key, value) {
      values[key] = value;
      storage.write('settings', values);
      events.emit('change', key, value);
      apply(key);
    },
    on: events.on,
    off: events.off,
    customWallpaper() {
      return storage.read('wallpaper', null);
    },
    setCustomWallpaper(dataUrl) {
      if (!storage.write('wallpaper', dataUrl)) return false;
      settings.set('wallpaper', 'custom');
      return true;
    },
    wallpaperCss(id = values.wallpaper) {
      if (id === 'custom') {
        const data = settings.customWallpaper();
        if (data) return `url("${data}") center / cover no-repeat, #111`;
        id = DEFAULTS.wallpaper;
      }
      const wp = WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0];
      return wp.css;
    },
    reload() {
      values = Object.assign({}, DEFAULTS, storage.read('settings', {}));
      apply();
    },
  };

  function apply(key) {
    const root = document.documentElement;
    if (!key || key === 'theme') {
      root.dataset.theme = values.theme === 'light' ? 'light' : 'dark';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = values.theme === 'light' ? '#e8ecf4' : '#0f172a';
    }
    if (!key || key === 'accent') root.style.setProperty('--accent', values.accent);
    if (!key || key === 'animations') root.classList.toggle('no-anim', !values.animations);
    if (!key || key === 'transparency') root.classList.toggle('no-blur', !values.transparency);
    if (!key || key === 'brightness' || key === 'nightLight') {
      root.style.setProperty('--dim', String((100 - values.brightness) / 100 * 0.75));
      root.classList.toggle('night-light', !!values.nightLight);
    }
    if (!key || key === 'wallpaper') {
      // Set inline so relative url() values resolve against the document, not a stylesheet.
      const css = settings.wallpaperCss();
      document.querySelectorAll('#wallpaper, .lock-bg').forEach((el) => { el.style.background = css; });
    }
  }

  OS.storage = storage;
  OS.settings = settings;
  OS.wallpapers = WALLPAPERS;
  OS.accents = ACCENTS;
  OS.applySettings = apply;
})();
