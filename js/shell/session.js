/* AwanOS — session lifecycle: boot, lock screen, sign out, restart, shutdown */
(function () {
  'use strict';
  const OS = window.OS;
  const { glyph } = OS.icons;

  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const t = OS.t;
  const timeFmt = new Intl.DateTimeFormat(OS.i18n.locale, { hour: '2-digit', minute: '2-digit' });
  const dateFmt = new Intl.DateTimeFormat(OS.i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' });

  let locked = false;
  let lockTimer = null;

  function show(el) {
    el.hidden = false;
    el.classList.remove('fade-out');
  }

  function hide(el) {
    el.classList.add('fade-out');
    setTimeout(() => {
      el.hidden = true;
      el.classList.remove('fade-out');
    }, 450);
  }

  /** The boot screen is visible from the first paint (index.html) while language files load. */
  async function boot() {
    const screen = $('boot-screen');
    show(screen);
    await wait(OS.settings.get('animations') ? 1500 : 300);
    lock();
    hide(screen);
  }

  function updateLockClock() {
    const d = new Date();
    $('lock-screen').querySelector('.lock-time').textContent = timeFmt.format(d);
    $('lock-screen').querySelector('.lock-date').textContent = dateFmt.format(d);
  }

  function lock() {
    const screen = $('lock-screen');
    const name = OS.settings.get('username') || OS.settings.DEFAULTS.username;
    OS.ui.closeMenu();
    OS.ui.closePopup();
    screen.classList.remove('login');
    screen.querySelector('.lock-user').textContent = name;
    screen.querySelector('.avatar').textContent = name.trim().charAt(0).toUpperCase() || '?';
    OS.applySettings('wallpaper');
    updateLockClock();
    clearInterval(lockTimer);
    lockTimer = setInterval(updateLockClock, 1000);
    locked = true;
    show(screen);
  }

  function toLogin() {
    const screen = $('lock-screen');
    if (screen.classList.contains('login')) return;
    screen.classList.add('login');
    setTimeout(() => screen.querySelector('.lock-submit').focus(), 50);
  }

  function unlock() {
    if (!locked) return;
    locked = false;
    clearInterval(lockTimer);
    hide($('lock-screen'));
    if (!OS.storage.read('welcomed', false)) {
      OS.storage.write('welcomed', true);
      setTimeout(() => {
        const readme = t('fs.readmeName');
        OS.notify({
          title: t('session.welcomeTitle', { name: OS.settings.get('username') }),
          body: t('session.welcomeBody', { file: readme }),
          icon: 'cloud',
          timeout: 8000,
          onClick: () => OS.apps.openPath(`${OS.vfs.HOME}/Desktop/${readme}`),
        });
      }, 600);
    }
  }

  /** action: 'signOut' | 'restart' | 'shutdown' */
  async function confirmUnsaved(action) {
    if (!OS.wm.hasUnsaved()) return true;
    return OS.ui.confirm(t('session.unsavedMessage'), {
      title: t('session.unsavedTitle'),
      okLabel: t(`session.unsaved.${action}`),
      danger: true,
    });
  }

  async function signOut() {
    if (!(await confirmUnsaved('signOut'))) return;
    await OS.wm.closeAll(true);
    lock();
  }

  /** A restart reloads the page, which also applies a newly chosen language. */
  async function restart() {
    if (!(await confirmUnsaved('restart'))) return false;
    await OS.wm.closeAll(true);
    OS.vfs.flush();
    show($('boot-screen'));
    setTimeout(() => location.reload(), 400);
    return true;
  }

  async function shutdown() {
    if (!(await confirmUnsaved('shutdown'))) return;
    await OS.wm.closeAll(true);
    OS.vfs.flush();
    const screen = $('off-screen');
    show(screen);
  }

  function init() {
    const lockScreen = $('lock-screen');
    $('off-screen').querySelector('.power-on').innerHTML = glyph('power');

    lockScreen.addEventListener('pointerdown', (e) => {
      if (!lockScreen.classList.contains('login')) {
        e.preventDefault();
        toLogin();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (!locked || lockScreen.hidden) return;
      if (!lockScreen.classList.contains('login')) {
        e.preventDefault();
        toLogin();
      } else if (e.key === 'Escape') {
        lockScreen.classList.remove('login');
      }
    });
    lockScreen.querySelector('.lock-login').addEventListener('submit', (e) => {
      e.preventDefault();
      unlock();
    });
    // Powering on starts a fresh page so any changed language takes effect.
    $('off-screen').querySelector('.power-on').addEventListener('click', () => {
      $('off-screen').hidden = true;
      show($('boot-screen'));
      location.reload();
    });

    OS.settings.on('change', (key) => {
      if (key === 'username') {
        lockScreen.querySelector('.lock-user').textContent = OS.settings.get('username');
      }
    });

    const params = new URLSearchParams(location.search);
    if (params.has('skipboot')) {
      locked = false;
      $('boot-screen').hidden = true;
      return;
    }
    boot();
  }

  OS.session = {
    init,
    lock,
    signOut,
    restart,
    shutdown,
    isLocked: () => locked,
  };
})();
