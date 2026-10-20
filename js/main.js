/* AwanOS — bootstrap */
(function () {
  'use strict';
  const OS = window.OS;
  OS.version = '1.1.0';

  let ready = false;

  // Global shortcuts. Ctrl+Alt combinations are used because browsers reserve most others.
  // letter -> [description key (or app id to open), action]
  const SHORTCUTS = {
    s: ['start', () => OS.taskbar.toggleStart()],
    t: ['app:terminal', () => OS.wm.open('terminal')],
    e: ['app:explorer', () => OS.wm.open('explorer')],
    m: ['app:taskmanager', () => OS.wm.open('taskmanager')],
    d: ['desktop', () => OS.wm.toggleDesktop()],
    w: ['closeWindow', () => { const win = OS.wm.active(); if (win) win.close(); }],
    l: ['lock', () => OS.session.lock()],
  };
  document.addEventListener('keydown', (e) => {
    if (!ready || OS.session.isLocked() || !e.ctrlKey || !e.altKey || e.shiftKey) return;
    const shortcut = SHORTCUTS[e.code.replace(/^Key/, '').toLowerCase()];
    if (shortcut) {
      e.preventDefault();
      shortcut[1]();
    }
  });

  // Our own context menus replace the browser's everywhere except in text fields.
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
  });

  window.addEventListener('beforeunload', () => OS.vfs.flush());

  // Theme, wallpaper and logo first so the boot screen looks right while strings load.
  OS.applySettings();
  document.querySelector('#boot-screen .boot-logo').innerHTML = OS.icons.logo();
  OS.i18n.load().then(() => {
    // [keys, description] pairs, listed in Settings.
    OS.shortcuts = Object.entries(SHORTCUTS).map(([letter, [key]]) => [
      `Ctrl+Alt+${letter.toUpperCase()}`,
      key.startsWith('app:') ? OS.t('shortcuts.openApp', { app: OS.apps.get(key.slice(4)).name }) : OS.t(`shortcuts.${key}`),
    ]);
    OS.migrate(OS.vfs.init());
    OS.desktop.init();
    OS.taskbar.init();
    OS.session.init();
    ready = true;
  });
})();
