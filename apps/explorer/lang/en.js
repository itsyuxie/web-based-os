/* AwanOS — File Explorer: English */
OS.i18n.register('en', {
  name: 'File Explorer',
  description: 'Manage your files and folders',
  keywords: ['file', 'folder', 'explorer', 'browse'],

  toolbar: {
    back: 'Back (Alt+←)',
    forward: 'Forward (Alt+→)',
    up: 'Up one level (Backspace)',
    refresh: 'Refresh',
    address: 'Address',
    search: 'Search this folder',
    newFolder: 'New folder',
    newTextFile: 'New text document',
    import: 'Import from computer',
    changeView: 'Change view',
  },

  places: {
    home: 'Home',
    desktop: 'Desktop',
    documents: 'Documents',
    pictures: 'Pictures',
    music: 'Music',
    downloads: 'Downloads',
    root: 'File system',
  },

  columns: {
    name: 'Name',
    modified: 'Date modified',
    type: 'Type',
    size: 'Size',
  },

  empty: {
    folder: 'This folder is empty',
    search: 'No items match your search',
  },

  status: {
    items_one: '{count} item',
    items_other: '{count} items',
    selected: '{count} selected ({size})',
  },

  menu: {
    newFolder: 'New folder',
    newTextFile: 'New text document',
    paste: 'Paste',
    import: 'Import from computer…',
    listView: 'List view',
    iconView: 'Icon view',
    refresh: 'Refresh',
    openTerminal: 'Open {app} here',
    properties: 'Properties',
  },

  dialogs: {
    folderNotFound: 'The folder "{path}" could not be found.',
  },
}, 'explorer');
