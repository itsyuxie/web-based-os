/* AwanOS — Calculator: English */
OS.i18n.register('en', {
  name: 'Calculator',
  description: 'A standard calculator',
  keywords: ['calculator', 'calculate', 'math', 'arithmetic'],

  mode: 'Standard',

  history: {
    toggle: 'History',
    title: 'History',
  },

  expr: {
    reciprocal: '1/({value})',
    square: 'sqr({value})',
    squareRoot: '√({value})',
  },

  errors: {
    divideByZero: 'Cannot divide by zero',
    invalidInput: 'Invalid input',
    invalidResult: 'Invalid result',
    generic: 'Error',
  },
}, 'calculator');
