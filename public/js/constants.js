const COLORS = ['#4ECDC4', '#FF6B6B', '#FFE66D', '#A78BFA'];
const GRID_W = 20;
const GRID_H = 20;
const TOTAL_POINTS = 12;
const MIN_PM = 2;
const MAX_PM = 6;

const SPELLS = [
  { id: 'place-bomb', name: 'Bombe', cost: 4, type: 'pa', cd: 0 },
  { id: 'repulseur', name: 'Répuls.', cost: 2, type: 'pa', cd: 1 },
  { id: 'entourloupe', name: 'Entour.', cost: 3, type: 'pa', cd: 5 },
  { id: 'stratageme', name: 'Strata.', cost: 1, type: 'pa', cd: 3 },
  { id: 'liberation', name: 'Libér.', cost: 3, type: 'pa', cd: 10 },
  { id: 'aimant', name: 'Aimant', cost: 2, type: 'pa', cd: 0 },
  { id: 'detonate', name: 'Détoner', cost: 2, type: 'pa', cd: 0 },
  { id: 'end-turn', name: 'Fin tour', cost: 0, type: 'none', cd: 0 },
];
