/* AwanOS — bootstrap */
(function () {
  'use strict';
  const OS = window.OS;
  OS.version = '1.0.0';

  OS.applySettings();
  OS.desktop.init();
  OS.taskbar.init();
  OS.session.init();

  // Global shortcuts. Ctrl+Alt combinations are used because browsers reserve most others.
  const SHORTCUTS = {
    s: () => OS.taskbar.toggleStart(),
    t: () => OS.wm.open('terminal'),
    e: () => OS.wm.open('explorer'),
    m: () => OS.wm.open('taskmanager'),
    d: () => OS.wm.toggleDesktop(),
    l: () => OS.session.lock(),
    w: () => { const win = OS.wm.active(); if (win) win.close(); },
  };
  document.addEventListener('keydown', (e) => {
    if (OS.session.isLocked() || !e.ctrlKey || !e.altKey || e.shiftKey) return;
    const action = SHORTCUTS[e.code.replace(/^Key/, '').toLowerCase()];
    if (action) {
      e.preventDefault();
      action();
    }
  });
  OS.shortcuts = [
    ['Ctrl+Alt+S', 'Buka menu Mulai'],
    ['Ctrl+Alt+T', 'Buka Terminal'],
    ['Ctrl+Alt+E', 'Buka Penjelajah Berkas'],
    ['Ctrl+Alt+M', 'Buka Pengelola Tugas'],
    ['Ctrl+Alt+D', 'Tampilkan desktop'],
    ['Ctrl+Alt+W', 'Tutup jendela aktif'],
    ['Ctrl+Alt+L', 'Kunci layar'],
  ];

  // Our own context menus replace the browser's everywhere except in text fields.
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
  });

  window.addEventListener('beforeunload', () => OS.vfs.flush());
})();
