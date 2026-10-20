/* AwanOS — internationalisation: language registry, string lookup and loading */
(function () {
  'use strict';
  const OS = window.OS;

  /**
   * System languages. To add one, add an entry here and create lang/<code>.js.
   * Each app lists the languages it ships in its own `languages` field and keeps
   * one file per language in apps/<id>/lang/<code>.js.
   */
  const LANGUAGES = [
    { code: 'en', name: 'English', locale: 'en-US' },
    { code: 'zh', name: '简体中文', locale: 'zh-CN' },
  ];
  const FALLBACK = 'en';
  const SYSTEM = '';

  const dicts = new Map(); // `${namespace}|${lang}` -> nested object
  const warned = new Set();
  const pluralRules = new Map();

  const isSupported = (code) => LANGUAGES.some((l) => l.code === code);
  const info = (code) => LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];

  /** First supported language from the browser preferences, else English. */
  function detect() {
    const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
    for (const pref of prefs) {
      const code = String(pref).toLowerCase().split('-')[0];
      if (isSupported(code)) return code;
    }
    return FALLBACK;
  }

  const chosen = OS.settings.get('language');
  const current = isSupported(chosen) ? chosen : detect();

  const unique = (list) => [...new Set(list)];
  const systemChain = unique([current, FALLBACK]);

  /** Languages an app is shown in: the system language when the app ships it, then English. */
  function appChain(app) {
    const shipped = app && app.languages && app.languages.length ? app.languages : [FALLBACK];
    const primary = shipped.includes(current) ? current : shipped.includes(FALLBACK) ? FALLBACK : shipped[0];
    return unique([primary, FALLBACK].filter((l) => shipped.includes(l)));
  }

  function merge(target, source) {
    for (const [k, v] of Object.entries(source)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) target[k] = merge(target[k] && typeof target[k] === 'object' ? target[k] : {}, v);
      else target[k] = v;
    }
    return target;
  }

  /** Called by every language file: register(lang, strings) for the system, register(lang, strings, appId) for an app. */
  function register(lang, strings, namespace = SYSTEM) {
    const key = `${namespace}|${lang}`;
    dicts.set(key, merge(dicts.get(key) || {}, strings));
  }

  function lookup(namespace, lang, key) {
    let node = dicts.get(`${namespace}|${lang}`);
    for (const part of key.split('.')) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[part];
    }
    return node;
  }

  function plural(lang, count) {
    const locale = info(lang).locale;
    if (!pluralRules.has(locale)) pluralRules.set(locale, new Intl.PluralRules(locale));
    return pluralRules.get(locale).select(count);
  }

  const interpolate = (str, params) => (params ? str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m)) : str);

  /**
   * Resolve `key` (dot separated) through the language chain.
   * With a numeric `params.count`, `key_one` / `key_other` (CLDR plural categories) are tried first.
   */
  function translate(namespace, chain, key, params) {
    for (const lang of chain) {
      let value;
      if (params && typeof params.count === 'number') {
        value = lookup(namespace, lang, `${key}_${plural(lang, params.count)}`);
        if (value === undefined) value = lookup(namespace, lang, `${key}_other`);
      }
      if (value === undefined) value = lookup(namespace, lang, key);
      if (value !== undefined) return typeof value === 'string' ? interpolate(value, params) : value;
    }
    const id = `${namespace || 'system'}:${key}`;
    if (!warned.has(id)) {
      warned.add(id);
      console.warn(`AwanOS: missing translation "${id}"`);
    }
    return key;
  }

  /** Translate a system string. */
  const t = (key, params) => translate(SYSTEM, systemChain, key, params);

  const appTranslators = new Map();
  /**
   * Translator bound to an app's own strings (apps/<id>/lang/<code>.js). Safe to create before the
   * app registers; `.lang` and `.locale` describe the language the app is actually shown in.
   */
  function forApp(appId) {
    if (!appTranslators.has(appId)) {
      let chain = null;
      const resolveChain = () => {
        if (chain) return chain;
        const app = OS.apps && OS.apps.get(appId);
        const result = appChain(app);
        if (app) chain = result; // cache once the app's languages are known
        return result;
      };
      const fn = (key, params) => translate(appId, resolveChain(), key, params);
      Object.defineProperty(fn, 'lang', { get: () => resolveChain()[0] || FALLBACK });
      Object.defineProperty(fn, 'locale', { get: () => info(fn.lang).locale });
      fn.has = (key) => resolveChain().some((l) => lookup(appId, l, key) !== undefined);
      appTranslators.set(appId, fn);
    }
    return appTranslators.get(appId);
  }

  /** Fill elements marked with data-i18n, data-i18n-title, data-i18n-aria-label or data-i18n-placeholder. */
  function applyDom(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(true);
      script.onerror = () => {
        console.warn(`AwanOS: could not load ${src}`);
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  /** Load the language files needed for the current language (system + every registered app). */
  function load() {
    const files = systemChain.map((l) => `lang/${l}.js`);
    OS.apps.all().forEach((app) => appChain(app).forEach((l) => files.push(`apps/${app.id}/lang/${l}.js`)));
    return Promise.all(files.map(loadScript)).then(() => {
      document.documentElement.lang = info(current).locale;
      applyDom();
    });
  }

  OS.i18n = {
    LANGUAGES,
    FALLBACK,
    lang: current,
    locale: info(current).locale,
    info,
    isSupported,
    register,
    t,
    forApp,
    applyDom,
    load,
  };
  OS.t = t;
})();
