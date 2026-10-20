/* AwanOS — Notepad: English */
OS.i18n.register('en', {
  name: 'Notepad',
  description: 'A simple text editor',
  keywords: ['text', 'editor', 'notes', 'txt'],

  windowTitle: '{file} — Notepad',
  untitled: 'Untitled',
  untitledFile: 'Untitled.txt',
  textLabel: 'Document text',

  menu: {
    file: {
      title: 'File',
      new: 'New',
      newWindow: 'New window',
      open: 'Open…',
      save: 'Save',
      saveAs: 'Save as…',
      download: 'Download to computer',
      close: 'Close',
    },
    edit: {
      title: 'Edit',
      undo: 'Undo',
      find: 'Find…',
      findNext: 'Find next',
      replace: 'Replace…',
      selectAll: 'Select all',
      insertDate: 'Insert date/time',
    },
    format: {
      title: 'Format',
      wordWrap: 'Word wrap',
      monospace: 'Monospace font',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      resetZoom: 'Restore default zoom',
    },
  },

  status: {
    position: 'Ln {line}, Col {column}',
    characters_one: '{number} character',
    characters_other: '{number} characters',
    notSaved: 'Not saved yet',
  },

  find: {
    title: 'Find',
    prompt: 'Find what:',
    ok: 'Find',
  },

  replace: {
    title: 'Replace',
    prompt: 'Find what:',
    next: 'Next',
    with: 'Replace all "{query}" with:',
    all: 'Replace all',
  },

  flash: {
    saved: 'Saved',
    notFound: 'Can\'t find "{query}"',
    replaced_one: '{number} replacement',
    replaced_other: '{number} replacements',
  },

  dialogs: {
    unsaved: 'Do you want to save changes to "{file}"?',
    save: 'Save',
    dontSave: "Don't save",
    cancel: 'Cancel',
    binary: 'This file contains binary data (such as an image), not text.',
  },

  errors: {
    open: "Can't open the file",
    save: "Can't save the file",
  },
}, 'notepad');
