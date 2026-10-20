/* AwanOS — one-time upgrades of data saved by older versions */
(function () {
  'use strict';
  const OS = window.OS;
  const VERSION = 3;

  // Version 1 (Indonesian-only) stored localised folder and shortcut names.
  const V1_FOLDERS = { Dokumen: 'Documents', Gambar: 'Pictures', Musik: 'Music', Unduhan: 'Downloads' };
  const V1_APP_NAMES = {
    'Penjelajah Berkas': 'explorer', Notepad: 'notepad', Terminal: 'terminal', Browser: 'browser', Kalkulator: 'calculator',
    Paint: 'paint', 'Penampil Gambar': 'imageviewer', Minesweeper: 'minesweeper', 'Pengelola Tugas': 'taskmanager',
    Pengaturan: 'settings', 'Tentang AwanOS': 'about',
  };

  const V1_MOTD = 'Selamat datang di AwanOS. Ketik "help" untuk bantuan.\n';
  const V2_MOTD = 'Welcome to AwanOS. Type "help" to see the available commands.\n';

  /** Rename the standard folders and the desktop shortcuts so code paths and language-aware labels work. */
  function toV2() {
    const vfs = OS.vfs;
    const home = vfs.HOME;
    for (const [from, to] of Object.entries(V1_FOLDERS)) {
      if (vfs.isDir(`${home}/${from}`) && !vfs.exists(`${home}/${to}`)) vfs.rename(`${home}/${from}`, `${home}/${to}`);
    }

    const desktop = `${home}/Desktop`;
    const positions = Object.assign({}, OS.settings.get('desktopPositions'));
    if (vfs.isDir(desktop)) {
      for (const entry of vfs.readdir(desktop)) {
        const m = /^(.*?)( \(\d+\))?\.app$/.exec(entry.name);
        const id = m && V1_APP_NAMES[m[1]];
        const target = id && entry.type === 'file' ? OS.apps.readShortcut(entry.path) : null;
        if (!target || target.app !== id) continue;
        const name = vfs.uniqueName(desktop, `${id}${m[2] || ''}.app`);
        vfs.rename(entry.path, `${desktop}/${name}`);
        if (positions[entry.name]) {
          positions[name] = positions[entry.name];
          delete positions[entry.name];
        }
      }
    }
    OS.settings.set('desktopPositions', positions);
    // Replace the old default message of the day, but only if it was never edited.
    if (vfs.isFile('/etc/motd') && vfs.readFile('/etc/motd') === V1_MOTD) vfs.writeFile('/etc/motd', V2_MOTD);
  }

  /**
   * Version 2 saved every setting, defaults included. Values that were the old defaults
   * follow the new Windows 11–style defaults; the default user name becomes localised.
   */
  function toV3() {
    const s = OS.settings;
    if (['User', 'Pengguna'].includes(s.get('username'))) s.set('username', null);
    if (s.get('accent') === '#3b82f6') s.set('accent', s.DEFAULTS.accent);
    if (s.get('wallpaper') === 'awan') s.set('wallpaper', s.DEFAULTS.wallpaper);
  }

  /** Bring stored data up to date. Fresh installs are already current. */
  function migrate(freshInstall) {
    const from = freshInstall ? VERSION : OS.storage.read('dataVersion', 1);
    if (from < 2) {
      try {
        toV2();
      } catch (err) {
        console.warn('AwanOS: could not upgrade saved data', err);
      }
    }
    if (from < 3) {
      try {
        toV3();
      } catch (err) {
        console.warn('AwanOS: could not upgrade saved settings', err);
      }
    }
    OS.storage.write('dataVersion', VERSION);
  }

  OS.migrate = migrate;
})();
