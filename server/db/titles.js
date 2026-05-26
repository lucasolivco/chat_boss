const TITLES = [
  { title: 'Iniciante Lógico',       minBattles: 0,  minWinRate: 0    },
  { title: 'Aprendiz Dialético',     minBattles: 3,  minWinRate: 0    },
  { title: 'Refutador Funcional',    minBattles: 5,  minWinRate: 0.30 },
  { title: 'Arquiteto de Argumentos',minBattles: 10, minWinRate: 0.50 },
  { title: 'Mestre da Refutação',    minBattles: 20, minWinRate: 0.70 },
  { title: 'Juggernaut Lógico',      minBattles: 30, minWinRate: 0.85 },
];

export function calcTitle(stats) {
  const { total_battles, total_wins } = stats;
  const winRate = total_battles > 0 ? total_wins / total_battles : 0;

  let earned = TITLES[0];
  for (const t of TITLES) {
    if (total_battles >= t.minBattles && winRate >= t.minWinRate) {
      earned = t;
    }
  }
  return earned.title;
}
