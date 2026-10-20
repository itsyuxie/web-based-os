/* AwanOS — Task Manager: English */
OS.i18n.register('en', {
  name: 'Task Manager',
  description: 'View and close running apps',
  keywords: ['task', 'process', 'performance', 'end task'],

  performance: 'Performance',

  stats: {
    fps: 'FPS',
    memory: 'JS memory',
    storage: 'Storage',
    cpuCores: 'CPU cores',
    uptime: 'Uptime',
    notAvailable: 'Not available',
    storageValue: '{used} / {total}',
    uptimeValue: '{h}h {m}m {s}s',
  },

  columns: {
    app: 'App',
    window: 'Window',
    status: 'Status',
  },

  status: {
    active: 'Active',
    minimized: 'Minimized',
    running: 'Running',
  },

  footer: {
    apps_one: '{count} app',
    apps_other: '{count} apps',
    windows_one: '{count} window',
    windows_other: '{count} windows',
    summary: '{apps} · {windows}',
    switchTo: 'Switch to',
    endTask: 'End task',
  },
}, 'taskmanager');
