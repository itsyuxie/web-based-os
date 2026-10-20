/* AwanOS — Paint: English */
OS.i18n.register('en', {
  name: 'Paint',
  description: 'Draw and edit pictures',
  keywords: ['draw', 'picture', 'sketch', 'image'],

  windowTitle: '{file} — Paint',
  untitled: 'Untitled',
  untitledFile: 'Untitled.png',

  menu: {
    file: 'File',
    new: 'New…',
    open: 'Open…',
    save: 'Save',
    saveAs: 'Save as…',
    download: 'Download as PNG',
    wallpaper: 'Set as wallpaper',
    clear: 'Clear canvas',
  },

  tools: {
    pencil: 'Pencil (P)',
    brush: 'Brush (B)',
    eraser: 'Eraser (E)',
    line: 'Line (L)',
    rect: 'Rectangle (R)',
    ellipse: 'Ellipse (O)',
    fill: 'Fill with color (F)',
  },

  toolbar: {
    fillShapes: 'Fill shapes',
    size: 'Size',
    brushSize: 'Brush size',
    sizeValue: '{size}px',
    customColor: 'Custom color',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
  },

  status: {
    position: '{x}, {y} px',
    size: '{width} × {height} px',
  },

  dialogs: {
    unsaved: 'Do you want to save changes to "{file}"?',
    save: 'Save',
    dontSave: "Don't save",
    cancel: 'Cancel',
    newTitle: 'New image',
    newSize: 'Canvas size (width × height):',
    invalidImage: 'This file is not a valid image.',
    storageFull: 'Browser storage is full, so the wallpaper could not be saved.',
  },

  errors: {
    open: "Can't open the image",
    save: "Can't save the image",
  },

  notify: {
    saved: 'Image saved',
    wallpaper: 'Wallpaper updated',
    wallpaperBody: 'Your drawing is now the desktop background.',
  },
}, 'paint');
