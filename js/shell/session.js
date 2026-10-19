/* AwanOS — session lifecycle: boot, lock screen, sign out, restart, shutdown */
(function () {
  'use strict';
  const OS = window.OS;
  const { glyph } = OS.icons;

  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
  const dateFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

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
    const name = OS.settings.get('username') || 'Pengguna';
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
        OS.notify({
          title: `Selamat datang, ${OS.settings.get('username')}!`,
          body: 'Buka "Baca saya.txt" di desktop untuk tips memulai.',
          icon: 'cloud',
          timeout: 8000,
          onClick: () => OS.apps.openPath(`${OS.vfs.HOME}/Desktop/Baca saya.txt`),
        });
      }, 600);
    }
  }

  async function confirmUnsaved(action) {
    if (!OS.wm.hasUnsaved()) return true;
    return OS.ui.confirm(`Ada dokumen yang belum disimpan. Tetap ${action}? Perubahan yang belum disimpan akan hilang.`, {
      title: 'Perubahan belum disimpan',
      okLabel: `Tetap ${action}`,
      danger: true,
    });
  }

  async function signOut() {
    if (!(await confirmUnsaved('keluar'))) return;
    await OS.wm.closeAll(true);
    lock();
  }

  async function restart() {
    if (!(await confirmUnsaved('mulai ulang'))) return;
    await OS.wm.closeAll(true);
    OS.vfs.flush();
    const screen = $('boot-screen');
    show(screen);
    await wait(1200);
    lock();
    hide(screen);
  }

  async function shutdown() {
    if (!(await confirmUnsaved('matikan'))) return;
    await OS.wm.closeAll(true);
    OS.vfs.flush();
    const screen = $('off-screen');
    show(screen);
  }

  function init() {
    const lockScreen = $('lock-screen');
    $('boot-screen').querySelector('.boot-logo').innerHTML = OS.icons.logo();
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
    $('off-screen').querySelector('.power-on').addEventListener('click', () => {
      $('off-screen').hidden = true;
      boot();
    });

    OS.settings.on('change', (key) => {
      if (key === 'username') {
        lockScreen.querySelector('.lock-user').textContent = OS.settings.get('username');
      }
    });

    const params = new URLSearchParams(location.search);
    if (params.has('skipboot')) {
      locked = false;
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
