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
     * { id, launch(win, args), languages: ['en'], iconUrl, width, height, minWidth, minHeight,
     *   singleInstance, resizable, hidden, fileTypes: ['txt', '*'] }
     * The display name, description and search keywords come from the app's language
     * files (apps/<id>/lang/<code>.js: keys `name`, `description`, `keywords`).
     */
    register(def) {
      if (!def.languages) def.languages = [OS.i18n.FALLBACK];
      // Every app folder ships its own icon (apps/<id>/icon.svg) unless it says otherwise.
      if (def.iconUrl === undefined) def.iconUrl = `apps/${def.id}/icon.svg`;
      const t = () => OS.i18n.forApp(def.id);
      ['name', 'description'].forEach((key) => {
        if (!(key in def)) Object.defineProperty(def, key, { get: () => t()(key), enumerable: true });
      });
      if (!('keywords' in def)) {
        Object.defineProperty(def, 'keywords', {
          get: () => {
            const k = t().has('keywords') ? t()('keywords') : [];
            return Array.isArray(k) ? k : String(k).split(/\s*,\s*/);
          },
          enumerable: true,
        });
      }
      registry.set(def.id, def);
    },
    get: (id) => registry.get(id),
    list: () => [...registry.values()].filter((a) => !a.hidden).sort((a, b) => a.name.localeCompare(b.name, OS.i18n.locale)),
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
        OS.ui.alert(OS.t('apps.notFound', { path }), { title: OS.t('apps.cannotOpen'), icon: 'warning' });
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
