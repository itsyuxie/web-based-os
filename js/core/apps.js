/* AwanOS — application registry and file associations */
(function () {
  'use strict';
  const OS = window.OS;
  const { extname } = OS.utils;

  const registry = new Map();

  // Extensions whose default handler is not Notepad.
  const DEFAULT_HANDLERS = {
    png: 'imageviewer', jpg: 'imageviewer', jpeg: 'imageviewer', gif: 'imageviewer', webp: 'imageviewer', svg: 'imageviewer', bmp: 'imageviewer',
    html: 'browser', htm: 'browser',
  };

  const apps = {
    /**
     * Register an application.
     * { id, name, icon, colors, launch(win, args), width, height, minWidth, minHeight,
     *   singleInstance, resizable, hidden, fileTypes: ['txt', '*'], description }
     */
    register(def) {
      registry.set(def.id, def);
    },
    get: (id) => registry.get(id),
    list: () => [...registry.values()].filter((a) => !a.hidden).sort((a, b) => a.name.localeCompare(b.name, 'id')),
    all: () => [...registry.values()],

    launch(id, args) {
      return OS.wm.open(id, args);
    },

    defaultFor(path) {
      const ext = extname(path);
      return DEFAULT_HANDLERS[ext] || 'notepad';
    },

    /** Applications able to open the given path (default first). */
    handlersFor(path) {
      const ext = extname(path);
      const def = apps.defaultFor(path);
      return apps
        .all()
        .filter((a) => a.fileTypes && (a.fileTypes.includes(ext) || a.fileTypes.includes('*')))
        .sort((a, b) => (a.id === def ? -1 : b.id === def ? 1 : 0));
    },

    /** Resolve an *.app shortcut to { app, args } or null. */
    readShortcut(path) {
      try {
        const data = JSON.parse(OS.vfs.readFile(path));
        if (data && registry.has(data.app)) return data;
      } catch (_) { /* not a shortcut */ }
      return null;
    },

    /** Open any VFS path with its default (or given) application. */
    openPath(path, appId) {
      const vfs = OS.vfs;
      path = vfs.resolve(path);
      const stat = vfs.stat(path);
      if (!stat) {
        OS.ui.alert(`Lokasi "${path}" tidak ditemukan.`, { title: 'Tidak dapat membuka', icon: 'warning' });
        return null;
      }
      if (stat.type === 'dir' && !appId) return OS.wm.open('explorer', { path });
      if (!appId && extname(path) === 'app') {
        const target = apps.readShortcut(path);
        if (target) return OS.wm.open(target.app, target.args || {});
      }
      return OS.wm.open(appId || apps.defaultFor(path), { path });
    },
  };

  OS.apps = apps;
})();
