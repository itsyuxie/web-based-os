/* AwanOS — Minesweeper: English */
OS.i18n.register('en', {
  name: 'Minesweeper',
  description: 'The classic mine-hunting game',
  keywords: ['game', 'mines', 'minesweeper', 'puzzle'],

  windowTitle: 'Minesweeper — {level}',

  levels: {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    expert: 'Expert',
  },

  menu: {
    game: 'Game',
    newGame: 'New game',
    level_one: '{level} ({width}×{height}, {count} mine)',
    level_other: '{level} ({width}×{height}, {count} mines)',
    bestTimes: 'Best times',
  },

  toolbar: {
    newGame: 'New game',
    flagMode: 'Flag mode (for touch screens)',
  },

  cell: 'Cell {x}, {y}',

  bestTimes: {
    title: 'Best times',
    line: '{level}: {time}',
    none: '—',
    seconds_one: '{count} second',
    seconds_other: '{count} seconds',
  },

  win: {
    record: 'New record! 🎉',
    title: 'You win!',
    body_one: '{level} cleared in {count} second.',
    body_other: '{level} cleared in {count} seconds.',
  },
}, 'minesweeper');
