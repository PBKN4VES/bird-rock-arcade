// Bird Rock Arcade: the one list of cabinets. To add a game, add an entry here.
// href is relative to the arcade page. bestKey is the game's own localStorage key for its best score.
// shot is a screenshot of the real game (in shots/) shown on the cabinet screen; shotPos picks which
// part stays visible when the screen crops it to 5:4 (CSS object-position). shotFit: 'contain' shows
// the whole picture with dark bars instead of cropping (for wide shots with text at the edges).
window.ARCADE_GAMES = [
  {
    id: 'fill', title: 'Fill Master 3000', sub: '',
    blurb: 'Bags ride the belt. Pour exactly 10 oz.',
    href: '../fill/', bestKey: 'fill3000.bestScore', color: '#4298B5',
    shot: 'shots/fill.png', shotPos: '50% 50%'
  },
  {
    id: 'pourover', title: 'Pour-Over Power Hour', sub: '',
    blurb: 'Keep every dripper brewing before the rush hits.',
    href: '../pourover/', bestKey: 'pourover.bestScore', color: '#5b8c5a',
    shot: 'shots/pourover.png', shotPos: '50% 50%', shotFit: 'contain'
  },
  {
    id: 'flappy', title: 'Flappy Grinder', sub: '',
    blurb: 'Crank the grinder through the seagulls and rocks.',
    href: '../flappy/', bestKey: 'flappy.bestScore', color: '#8a5fb0',
    shot: 'shots/flappy.png', shotPos: '50% 0%'
  },
  {
    id: 'roast2', title: 'Roast Master 5000', sub: '',
    blurb: 'Hold to heat the roaster. Let go at the perfect temp.',
    href: '../roast2/', bestKey: 'roast2.bestScore', color: '#c8553d',
    shot: 'shots/roast2.png', shotPos: '50% 0%'
  }
];
