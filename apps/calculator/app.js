/* AwanOS — Calculator */
(function () {
  'use strict';
  const OS = window.OS;
  const t = OS.i18n.forApp('calculator');
  const { h, escapeHtml } = OS.utils;

  const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const ERROR = 'Error'; // internal marker for a result that is not a finite number
  const round = (n) => parseFloat(n.toPrecision(12));

  let separators = null;
  /** Grouping and decimal separators of the app's locale, e.g. "," and "." for en-US. */
  function getSeparators() {
    if (!separators) {
      const parts = new Intl.NumberFormat(t.locale).formatToParts(1234567.5);
      const part = (type, fallback) => (parts.find((p) => p.type === type) || { value: fallback }).value;
      separators = { group: part('group', ''), decimal: part('decimal', '.') };
    }
    return separators;
  }

  /** Format a numeric string ("-1234.5", "1.5e+21") with the locale's separators, e.g. 1,234.5 in en-US. */
  function format(str) {
    if (str === ERROR) return t('errors.generic');
    const m = /^(-?)(\d*)(?:\.(\d*))?(e[+-]\d+)?$/.exec(str);
    if (!m) return str;
    const { group, decimal } = getSeparators();
    const grouped = (m[2] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, group);
    return `${m[1]}${grouped}${m[3] !== undefined ? decimal + m[3] : ''}${m[4] || ''}`;
  }

  const toStr = (n) => {
    if (!Number.isFinite(n)) return ERROR;
    const r = round(n);
    const s = String(r);
    return /e/.test(s) ? r.toExponential(8).replace(/\.?0+e/, 'e') : s;
  };

  function launch(win) {
    let display = '0';
    let acc = null;
    let op = null;
    let fresh = true;
    let expr = '';
    let last = null; // { op, operand } for repeated "="
    let error = false;

    const exprEl = h('div', { class: 'calc-expr' });
    const valueEl = h('div', { class: 'calc-value', 'aria-live': 'polite' });
    const historyEl = h('div', { class: 'calc-history' });
    const keys = h('div', { class: 'calc-keys' });

    const cur = () => parseFloat(display);
    const apply = (a, o, b) => (o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : a / b);

    function fail(msg) {
      error = true;
      display = msg;
      acc = null;
      op = null;
      fresh = true;
      render();
    }

    function addHistory(line, result) {
      const item = h('button', { class: 'calc-history-item', html: `<span>${escapeHtml(line)}</span><strong>${escapeHtml(format(result))}</strong>` });
      item.addEventListener('click', () => { display = result; fresh = true; render(); });
      historyEl.prepend(item);
      while (historyEl.children.length > 30) historyEl.lastChild.remove();
    }

    function input(k) {
      if (error && !['C', 'CE'].includes(k)) {
        error = false;
        display = '0';
        expr = '';
      }
      if (/^\d$/.test(k)) {
        if (fresh) { display = k; fresh = false; }
        else if (display.replace(/[-.]/g, '').length < 16) display = display === '0' ? k : display + k;
      } else if (k === '.') {
        if (fresh) { display = '0.'; fresh = false; }
        else if (!display.includes('.')) display += '.';
      } else if (k in SYMBOL) {
        if (op && !fresh) {
          const b = cur();
          if (op === '/' && b === 0) return fail(t('errors.divideByZero'));
          acc = apply(acc, op, b);
          display = toStr(acc);
        } else if (acc === null || !op) {
          acc = cur();
        }
        op = k;
        fresh = true;
        expr = `${format(toStr(acc))} ${SYMBOL[k]}`;
      } else if (k === '=') {
        let a;
        let o;
        let b;
        if (op) {
          a = acc;
          o = op;
          b = cur();
        } else if (last) {
          a = cur();
          o = last.op;
          b = last.operand;
        } else {
          expr = `${format(display)} =`;
          fresh = true;
          return render();
        }
        if (o === '/' && b === 0) return fail(t('errors.divideByZero'));
        const result = apply(a, o, b);
        const line = `${format(toStr(a))} ${SYMBOL[o]} ${format(toStr(b))} =`;
        expr = line;
        display = toStr(result);
        if (display === ERROR) return fail(t('errors.invalidResult'));
        addHistory(line, display);
        last = { op: o, operand: b };
        acc = null;
        op = null;
        fresh = true;
      } else if (k === 'C') {
        display = '0'; acc = null; op = null; expr = ''; last = null; fresh = true;
      } else if (k === 'CE') {
        display = '0'; fresh = true;
      } else if (k === 'back') {
        if (!fresh) display = display.length > 1 && !(display.length === 2 && display.startsWith('-')) ? display.slice(0, -1) : '0';
        else expr = '';
      } else if (k === 'neg') {
        if (display !== '0') display = display.startsWith('-') ? display.slice(1) : '-' + display;
      } else if (k === '%') {
        const v = cur();
        display = toStr(acc !== null && (op === '+' || op === '-') ? (acc * v) / 100 : v / 100);
        fresh = true;
      } else if (k === 'inv') {
        if (cur() === 0) return fail(t('errors.divideByZero'));
        expr = t('expr.reciprocal', { value: format(display) });
        display = toStr(1 / cur());
        fresh = true;
      } else if (k === 'sq') {
        expr = t('expr.square', { value: format(display) });
        display = toStr(cur() * cur());
        fresh = true;
      } else if (k === 'sqrt') {
        if (cur() < 0) return fail(t('errors.invalidInput'));
        expr = t('expr.squareRoot', { value: format(display) });
        display = toStr(Math.sqrt(cur()));
        fresh = true;
      }
      render();
    }

    function render() {
      exprEl.textContent = expr || ' ';
      valueEl.textContent = error ? display : format(display);
      const len = valueEl.textContent.length;
      valueEl.style.fontSize = len > 16 ? '22px' : len > 12 ? '30px' : len > 9 ? '38px' : '46px';
    }

    const LAYOUT = [
      ['%', '%', 'fn'], ['CE', 'CE', 'fn'], ['C', 'C', 'fn'], ['⌫', 'back', 'fn'],
      ['¹⁄ₓ', 'inv', 'fn'], ['x²', 'sq', 'fn'], ['²√x', 'sqrt', 'fn'], ['÷', '/', 'op'],
      ['7', '7'], ['8', '8'], ['9', '9'], ['×', '*', 'op'],
      ['4', '4'], ['5', '5'], ['6', '6'], ['−', '-', 'op'],
      ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'],
      ['±', 'neg'], ['0', '0'], [getSeparators().decimal, '.'], ['=', '=', 'eq'],
    ];
    LAYOUT.forEach(([label, key, kind]) => {
      const b = h('button', { class: `calc-key${kind ? ' ' + kind : ''}`, text: label });
      b.dataset.key = key;
      b.addEventListener('click', () => input(key));
      keys.appendChild(b);
    });

    const historyToggle = h('button', { class: 'icon-btn', title: t('history.toggle'), html: OS.icons.glyph('list') });
    historyToggle.addEventListener('click', () => win.body.classList.toggle('show-history'));

    win.body.classList.add('calculator');
    win.body.append(
      h('div', { class: 'calc-main' },
        h('div', { class: 'calc-top' }, h('span', { text: t('mode') }), historyToggle),
        h('div', { class: 'calc-screen' }, exprEl, valueEl),
        keys),
      h('aside', { class: 'calc-side' }, h('div', { class: 'calc-side-title', text: t('history.title') }), historyEl)
    );

    const KEYMAP = { Enter: '=', '=': '=', Escape: 'C', Delete: 'CE', Backspace: 'back', ',': '.', '.': '.', '%': '%', '+': '+', '-': '-', '*': '*', '/': '/', x: '*', X: '*' };
    win.el.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = /^\d$/.test(e.key) ? e.key : KEYMAP[e.key];
      if (!k) return;
      e.preventDefault();
      input(k);
      const btn = keys.querySelector(`[data-key="${CSS.escape(k)}"]`);
      if (btn) {
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 100);
      }
    });
    win.on('focus', () => win.el.focus({ preventScroll: true }));
    render();
  }

  OS.apps.register({
    id: 'calculator',
    languages: ['en'],
    icon: 'calculator',
    colors: ['#a3e635', '#16a34a'],
    width: 340,
    height: 520,
    minWidth: 300,
    minHeight: 460,
    launch,
  });
})();
