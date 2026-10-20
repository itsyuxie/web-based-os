/* AwanOS — Image Viewer: English */
OS.i18n.register('en', {
  name: 'Image Viewer',
  description: 'View photos and pictures',
  keywords: ['image', 'photo', 'picture', 'viewer'],

  windowTitle: '{file} — Image Viewer',

  toolbar: {
    open: 'Open…',
    previous: 'Previous (←)',
    next: 'Next (→)',
    zoomOut: 'Zoom out (-)',
    zoomIn: 'Zoom in (+)',
    fit: 'Fit to window (0)',
    edit: 'Edit in {app}',
    wallpaper: 'Set as wallpaper',
    download: 'Download',
  },

  info: '{width} × {height} px · {size}',
  placeholder: 'Open an image from {app}',

  errors: {
    open: "Can't open the image",
    display: "This image can't be displayed",
    storageFull: 'Browser storage is full, so the wallpaper could not be saved.',
  },

  notify: {
    wallpaper: 'Wallpaper updated',
  },
}, 'imageviewer');
