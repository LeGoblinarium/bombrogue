const COLORS = ['#4ECDC4', '#FF6B6B', '#FFE66D', '#A78BFA'];
const GRID_W = 20;
const GRID_H = 20;
const TOTAL_POINTS = 12;
const MIN_PM = 2;
const MAX_PM = 6;

const SPELLS = [
  {
    id: 'place-bomb', name: 'Bombe', cost: 4, type: 'pa', cd: 0,
    desc: 'Place une bombe à portée 1–3 cases. Maximum 3 bombes actives. Explose en losange (×multiplicateur d\'âge).',
  },
  {
    id: 'repulseur', name: 'Répuls.', cost: 2, type: 'pa', cd: 1,
    desc: 'Repousse bombes et joueurs autour de la case ciblée (rayon 3). À 1 case → 3 poussées, 2 → 2, 3 → 1. Utilisable 1×/tour.',
  },
  {
    id: 'aimant', name: 'Aimant', cost: 2, type: 'pa', cd: 0,
    desc: 'Attire les bombes de 3 cases et les joueurs de 1 case vers la case ciblée (axes cardinaux, jusqu\'à 8 cases de portée).',
  },
  {
    id: 'entourloupe', name: 'Entour.', cost: 3, type: 'pa', cd: 5,
    desc: 'Échange ta position avec une de tes propres bombes. Portée 1–8 cases. CD 5 tours.',
  },
  {
    id: 'stratageme', name: 'Strata.', cost: 1, type: 'pa', cd: 3,
    desc: 'Téléporte une bombe (alliée ou ennemie) à sa position précédente. La bombe doit avoir bougé au moins une fois. CD 3 tours.',
  },
  {
    id: 'liberation', name: 'Libér.', cost: 3, type: 'pa', cd: 10,
    desc: 'Repousse toutes les bombes et joueurs adjacents de 5 cases dans leur direction. Tape sur ton personnage pour confirmer. CD 10 tours.',
  },
  {
    id: 'detonate', name: 'Détoner', cost: 2, type: 'pa', cd: 0,
    desc: 'Cible une de tes bombes (portée 1–10). Fait exploser cette bombe et toutes celles qui lui sont connectées par un mur. Les bombes non connectées ne sont pas affectées.',
  },
  {
    id: 'end-turn', name: 'Fin tour', cost: 0, type: 'none', cd: 0,
    desc: 'Termine ton tour immédiatement sans utiliser tes PA ou PM restants.',
  },
];
