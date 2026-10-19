/* AwanOS — shared helpers */
(function () {
  'use strict';
  const OS = (window.OS = window.OS || {});

  /**
   * Tiny DOM builder.
   * h('div', { class: 'x', onclick: fn, style: { color: 'red' } }, 'text', otherNode)
   */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'html') el.innerHTML = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else if (key in el && typeof value !== 'string') el[key] = value;
        else el.setAttribute(key, value === true ? '' : value);
      }
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    for (const child of children) {
      if (child == null || child === false) continue;
      if (Array.isArray(child)) append(el, child);
      else el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }

  function emitter() {
    const map = new Map();
    return {
      on(event, fn) {
        if (!map.has(event)) map.set(event, new Set());
        map.get(event).add(fn);
        return () => map.get(event).delete(fn);
      },
      off(event, fn) {
        if (map.has(event)) map.get(event).delete(fn);
      },
      emit(event, ...args) {
        if (!map.has(event)) return;
        for (const fn of [...map.get(event)]) {
          try { fn(...args); } catch (err) { console.error(err); }
        }
      },
    };
  }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  let uidSeq = 0;
  const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${(uidSeq++).toString(36)}`;

  const numberFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${numberFmt.format(bytes / Math.pow(1024, i))} ${units[i]}`;
  }

  const dateFmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  const formatDate = (ts) => dateFmt.format(new Date(ts));

  const encoder = new TextEncoder();
  /** Size in bytes of a stored file body (data URLs are measured by their decoded payload). */
  function contentSize(content) {
    if (!content) return 0;
    const m = /^data:[^,]*;base64,/.exec(content);
    if (m) return Math.floor(((content.length - m[0].length) * 3) / 4);
    return encoder.encode(content).length;
  }

  function extname(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(i + 1).toLowerCase() : '';
  }

  function stripExt(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(0, i) : name;
  }

  const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

  function download(filename, data, mime = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : typeof data === 'string' && data.startsWith('data:') ? dataUrlToBlob(data) : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function dataUrlToBlob(dataUrl) {
    const [head, body] = dataUrl.split(',');
    const mime = (/data:([^;,]+)/.exec(head) || [])[1] || 'application/octet-stream';
    if (head.includes(';base64')) {
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(body)], { type: mime });
  }

  function readFile(file, as = 'text') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      if (as === 'dataurl') reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
  }

  /** Split a command line into arguments, honouring single and double quotes. */
  function splitArgs(line) {
    const out = [];
    let cur = '';
    let quote = null;
    let has = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = null;
        else if (c === '\\' && quote === '"' && i + 1 < line.length) cur += line[++i];
        else cur += c;
      } else if (c === '"' || c === "'") {
        quote = c;
        has = true;
      } else if (c === '\\' && i + 1 < line.length) {
        cur += line[++i];
        has = true;
      } else if (/\s/.test(c)) {
        if (cur || has) out.push(cur);
        cur = '';
        has = false;
      } else {
        cur += c;
      }
    }
    if (cur || has) out.push(cur);
    return out;
  }

  OS.utils = {
    h, emitter, escapeHtml, clamp, debounce, uid, formatBytes, formatDate, contentSize,
    extname, stripExt, isMobile, download, dataUrlToBlob, readFile, splitArgs,
  };
})();
