/* AwanOS — About */
(function () {
  'use strict';
  const OS = window.OS;
  const { h } = OS.utils;
  const t = OS.i18n.forApp('about');

  function launch(win) {
    win.body.classList.add('about');
    win.body.append(
      h('div', { class: 'about-hero', html: OS.icons.logo('xl') }),
      h('div', { class: 'about-name', text: 'AwanOS' }),
      h('div', { class: 'about-version', text: t('version', { version: OS.version }) }),
      h('p', { class: 'about-desc', text: t('tagline') }),
      h('div', { class: 'about-actions' },
        h('button', { class: 'btn', text: t('systemInfo'), onclick: () => OS.wm.open('settings', { section: 'about' }) }),
        h('button', { class: 'btn btn-primary', text: t('close'), onclick: () => win.close() }))
    );
  }

  OS.apps.register({
    id: 'about',
    languages: ['en'],
    icon: 'info',
    colors: ['#38bdf8', '#6366f1'],
    width: 380,
    height: 380,
    resizable: false,
    singleInstance: true,
    launch,
  });
})();
