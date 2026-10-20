/* AwanOS — File Explorer: English */
OS.i18n.register('en', {
  name: 'File Explorer',
  description: 'Manage your files and folders',
  keywords: ['file', 'folder', 'explorer', 'browse'],

  tabs: {
    label: 'Tabs',
    add: 'Add a new tab (Ctrl+T)',
    close: 'Close tab (Ctrl+W)',
    newTab: 'New tab',
    duplicate: 'Duplicate tab',
    moveToWindow: 'Move tab to new window',
    closeTab: 'Close tab',
    closeOthers: 'Close other tabs',
    closeRight: 'Close tabs to the right',
  },

  nav: {
    label: 'Navigation pane',
    back: 'Back (Alt+Left arrow)',
    backTo: 'Back to "{name}" (Alt+Left arrow)',
    forward: 'Forward (Alt+Right arrow)',
    forwardTo: 'Forward to "{name}" (Alt+Right arrow)',
    up: 'Up (Alt+Up arrow)',
    upTo: 'Up to "{name}" (Alt+Up arrow)',
    refresh: 'Refresh "{name}" (F5)',
  },

  address: {
    label: 'Address',
    places: 'Locations',
    folders: 'Folders in {name}',
    earlier: 'Earlier locations',
  },

  search: {
    label: 'Search',
    placeholder: 'Search {name}',
    clear: 'Clear search',
    results: 'Search Results in {name}',
  },

  places: {
    home: 'Home',
    desktop: 'Desktop',
    documents: 'Documents',
    pictures: 'Pictures',
    music: 'Music',
    downloads: 'Downloads',
    thisPC: 'This PC',
  },

  cmd: {
    bar: 'Commands',
    tip: '{label} ({key})',
    new: 'New',
    newTip: 'Create a new item in the current location',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    rename: 'Rename',
    share: 'Share',
    delete: 'Delete',
    sort: 'Sort',
    sortTip: 'Sort items',
    view: 'View',
    viewTip: 'Change the layout of the items',
    more: 'See more',
    details: 'Details',
    detailsTip: 'Show the details pane (Alt+Shift+P)',
  },

  new: {
    folder: 'Folder',
    text: 'Text document',
    import: 'Import from computer…',
  },

  share: {
    copyPath: 'Copy as path',
    download: 'Download',
    copied_one: 'Path copied to the clipboard',
    copied_other: '{count} paths copied to the clipboard',
    copyFailed: 'Could not copy to the clipboard',
  },

  views: {
    large: 'Large icons',
    medium: 'Medium icons',
    small: 'Small icons',
    list: 'List',
    details: 'Details',
    tiles: 'Tiles',
    compact: 'Compact view',
    show: 'Show',
    navPane: 'Navigation pane',
    detailsPane: 'Details pane',
    hidden: 'Hidden items',
  },

  sort: {
    name: 'Name',
    modified: 'Date modified',
    type: 'Type',
    size: 'Size',
    asc: 'Ascending',
    desc: 'Descending',
  },

  columns: {
    name: 'Name',
    modified: 'Date modified',
    type: 'Type',
    size: 'Size',
    folder: 'Folder',
    location: 'File location',
  },

  size: {
    kb: '{n} KB',
  },

  item: {
    dateSize: '{date}  ·  {size}',
    tipFile: 'Type: {type}\nSize: {size}\nDate modified: {date}',
    tipFolder: 'Date modified: {date}',
    tipLocation: 'Folder: {folder}',
  },

  menu: {
    openNewTab: 'Open in new tab',
    openNewWindow: 'Open in new window',
    openLocation: 'Open file location',
    pin: 'Pin to Quick access',
    unpin: 'Unpin from Quick access',
    copyPath: 'Copy as path',
    view: 'View',
    sortBy: 'Sort by',
    refresh: 'Refresh',
    paste: 'Paste',
    new: 'New',
    properties: 'Properties',
    openTerminal: 'Open in {app}',
    selectAll: 'Select all',
    selectNone: 'Select none',
    invert: 'Invert selection',
  },

  home: {
    quickAccess: 'Quick access',
    recent: 'Recent',
    stored: 'Stored locally',
    noPins: 'Pin folders to Quick access to see them here.',
    noRecent: 'After you have opened some files, the most recent ones show up here.',
  },

  empty: {
    folder: 'This folder is empty.',
    search: 'No items match your search.',
  },

  status: {
    items_one: '{count} item',
    items_other: '{count} items',
    selected_one: '{count} item selected',
    selected_other: '{count} items selected',
    selectedSize_one: '{count} item selected  {size}',
    selectedSize_other: '{count} items selected  {size}',
    detailsView: 'Display information about each item in the window',
    largeView: 'Display items by using large thumbnails',
  },

  details: {
    label: 'Details pane',
    properties: 'Properties',
    type: 'Type',
    size: 'Size',
    location: 'Location',
    modified: 'Date modified',
    contains: 'Contains',
    items_one: '{count} item',
    items_other: '{count} items',
    hint: 'Select a single file or folder to see more information.',
  },

  dialogs: {
    folderNotFound: 'The folder "{path}" could not be found.',
  },
}, 'explorer');
