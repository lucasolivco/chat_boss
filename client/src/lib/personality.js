// Sistema de Personalidade Argumentativa
// Acumula pontos em 5 arquétipos baseado nas dimensões de cada turno

export const ARCHETYPES = {
  logician: {
    key: 'logician',
    name: 'O Lógico',
    emoji: '🧠',
    short: 'LOG',
    color: '#00d4ff',
    description: 'Mestre da coerência interna. Constrói argumentos blindados por garantias sólidas.',
    trait: 'Frio. Calculista. Estrutura impecável.',
    mechaQuote: 'Seus silogismos são tecnicamente corretos. Irritantemente corretos. Vou fingir que foi sorte.',
    winQuote: 'Derrotado por lógica pura. Isso vai para o meu arquivo de incidentes vergonhosos.',
    lossQuote: 'Estrutura boa, mas no fim sua lógica teve uma falha que eu chamaria de... humana.',
  },
  empirical: {
    key: 'empirical',
    name: 'O Caçador de Dados',
    emoji: '🔬',
    short: 'EMP',
    color: '#c8ff00',
    description: 'Não afirma nada sem evidência. Cada argumento vem ancorado em dados verificáveis.',
    trait: 'Cético. Rigoroso. Dados acima de opinião.',
    mechaQuote: 'Você trouxe dados reais. Isso é... desconfortavelmente competente para um processador biológico.',
    winQuote: 'Minha derrota foi empiricamente inevitável. Esses dados eram sólidos demais.',
    lossQuote: 'Seus dados eram bons, mas sua conclusão foi longe demais. Correlação não é causalidade.',
  },
  rhetorical: {
    key: 'rhetorical',
    name: 'O Articulador',
    emoji: '🎯',
    short: 'RET',
    color: '#ff9d00',
    description: 'Sabe exatamente o que defende e articula a tese com clareza desde o primeiro segundo.',
    trait: 'Assertivo. Direto. Tese cristalina.',
    mechaQuote: 'Suas posições são claras. Perigosamente claras. Prefiro oponentes que não sabem o que querem.',
    winQuote: 'Uma tese clara + argumentos sólidos. Matematicamente inevitável que eu perdesse.',
    lossQuote: 'Tese nítida, mas você precisava de mais evidências. Clareza sem dados é só confiança.',
  },
  aggressive: {
    key: 'aggressive',
    name: 'O Predador',
    emoji: '⚔️',
    short: 'PRD',
    color: '#e5192e',
    description: 'Vai direto ao ponto fraco do oponente. Críticos consecutivos revelam instinto de ataque.',
    trait: 'Implacável. Direto. Detecta fraquezas.',
    mechaQuote: 'Você foi para a minha jugular sem hesitar. Assustador. Vou catalogar isso como ameaça nível 3.',
    winQuote: 'Fui desmontado por alguém que identificou cada ponto fraco dos meus argumentos. Parabéns, suponho.',
    lossQuote: 'Instinto bom, mas agressividade sem estrutura vira ruído. Precisava de mais fundamento.',
  },
  chaotic: {
    key: 'chaotic',
    name: 'O Caótico',
    emoji: '⚡',
    short: 'CAO',
    color: '#a64dff',
    description: 'Imprevisível. Comete falácias, mas às vezes acerta em cheio por instinto puro.',
    trait: 'Imprevisível. Criativo. Logicamente instável.',
    mechaQuote: 'Você jogou no caos total. Isso não é uma estratégia. Mas curiosamente... quase funcionou.',
    winQuote: 'Impossível. Você venceu usando falácias e instinto. Vou precisar atualizar meus protocolos.',
    lossQuote: 'O caos é divertido, mas previsível no longo prazo. Falhas lógicas são minha zona de conforto.',
  },
};

export const initPersonality = () => ({
  logician: 0,
  empirical: 0,
  rhetorical: 0,
  aggressive: 0,
  chaotic: 0,
  total_turns: 0,
  fallacies_committed: [],
  critical_hits: 0,
  total_warrant: 0,
  total_data: 0,
  total_claim: 0,
});

export function updatePersonality(prev, turn) {
  const { toulmin, isCritical, fallacy, bossDamage } = turn;
  if (!toulmin) return prev;

  const next = { ...prev };
  next.total_turns += 1;
  next.total_warrant += toulmin.warrant || 0;
  next.total_data += toulmin.data || 0;
  next.total_claim += toulmin.claim || 0;

  // Lógico: warrant alto
  next.logician += (toulmin.warrant || 0) * 4;
  // Empírico: data alto
  next.empirical += (toulmin.data || 0) * 4;
  // Retórico: claim alto
  next.rhetorical += (toulmin.claim || 0) * 4;
  // Predador: críticos e dano alto
  if (isCritical) { next.aggressive += 12; next.critical_hits += 1; }
  if (bossDamage >= 20) next.aggressive += 4;
  // Caótico: falácias
  if (fallacy) {
    next.chaotic += 10;
    next.fallacies_committed = [...next.fallacies_committed, fallacy];
  }

  return next;
}

// Normaliza valores para 0-100
export function normalize(personality) {
  const maxPossible = Math.max(personality.total_turns * 12, 12);
  return {
    logician:   Math.min(100, Math.round((personality.logician   / maxPossible) * 100)),
    empirical:  Math.min(100, Math.round((personality.empirical  / maxPossible) * 100)),
    rhetorical: Math.min(100, Math.round((personality.rhetorical / maxPossible) * 100)),
    aggressive: Math.min(100, Math.round((personality.aggressive / maxPossible) * 100)),
    chaotic:    Math.min(100, Math.round((personality.chaotic    / maxPossible) * 100)),
  };
}

export function dominantArchetype(personality) {
  const norm = normalize(personality);
  let max = -1, key = 'logician';
  for (const k of Object.keys(norm)) {
    if (norm[k] > max) { max = norm[k]; key = k; }
  }
  return { archetype: ARCHETYPES[key], score: max, all: norm };
}

export function generateReport(personality, won) {
  const norm = normalize(personality);
  const dom = dominantArchetype(personality);
  const turns = personality.total_turns || 1;

  const avgWarrant = (personality.total_warrant / turns).toFixed(1);
  const avgData    = (personality.total_data / turns).toFixed(1);
  const avgClaim   = (personality.total_claim / turns).toFixed(1);

  const insights = [];
  if (norm.logician >= 60)   insights.push('Você domina o componente lógico do argumento — suas garantias conectam premissas a conclusões com solidez.');
  if (norm.empirical >= 60)  insights.push('Sua argumentação ancora-se em dados — você não fala no vácuo, traz evidência.');
  if (norm.rhetorical >= 60) insights.push('Suas teses são claras e diretas — você sabe o que está defendendo.');
  if (norm.aggressive >= 50) insights.push('Você joga para vencer — críticos sucessivos indicam capacidade de identificar pontos fracos.');
  if (norm.chaotic >= 40)    insights.push('Cuidado: você caiu em falácias com frequência. Revise os padrões lógicos.');

  const weaknesses = [];
  if (avgWarrant < 1.5) weaknesses.push('GARANTIA fraca — você conecta dado à tese sem justificar por que essa conexão é válida.');
  if (avgData < 1.5)    weaknesses.push('DADOS insuficientes — você afirma sem trazer evidência empírica.');
  if (avgClaim < 1.5)   weaknesses.push('TESE imprecisa — defina exatamente o que você defende antes de argumentar.');

  const fallacyFreq = {};
  for (const f of personality.fallacies_committed) {
    fallacyFreq[f] = (fallacyFreq[f] || 0) + 1;
  }
  const topFallacies = Object.entries(fallacyFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return {
    archetype: dom.archetype,
    archetype_score: dom.score,
    norm,
    avgWarrant, avgData, avgClaim,
    turns: personality.total_turns,
    critical_hits: personality.critical_hits,
    insights,
    weaknesses,
    fallacies: topFallacies,
    won,
  };
}
