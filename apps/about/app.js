/* AwanOS — About */
(function () {
  'use strict';
  const OS = window.OS;
  const { h } = OS.utils;

  function launch(win) {
    win.body.classList.add('about');
    win.body.append(
      h('div', { class: 'about-hero', html: OS.icons.logo('xl') }),
      h('div', { class: 'about-name', text: 'AwanOS' }),
      h('div', { class: 'about-version', text: `Versi ${OS.version}` }),
      h('p', { class: 'about-desc', text: 'Desktop lengkap di dalam browser: jendela, berkas, terminal, dan aplikasi — semuanya dari HTML, CSS, dan JavaScript statis.' }),
      h('div', { class: 'about-actions' },
        h('button', { class: 'btn', text: 'Info sistem', onclick: () => OS.wm.open('settings', { section: 'about' }) }),
        h('button', { class: 'btn btn-primary', text: 'Tutup', onclick: () => win.close() }))
    );
  }

  OS.apps.register({
    id: 'about',
    name: 'Tentang AwanOS',
    description: 'Versi dan informasi AwanOS',
    keywords: ['about', 'versi', 'winver'],
    icon: 'info',
    colors: ['#38bdf8', '#6366f1'],
    width: 380,
    height: 380,
    resizable: false,
    singleInstance: true,
    launch,
  });
})();
