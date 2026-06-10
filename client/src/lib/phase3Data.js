// ─── Dados da Fase 3 (Boss Final) ────────────────────────────────────────────
// Reúne, por tema de debate, o "Exemplo Trabalhado" de Toulmin (Holo-Guia) e os
// tokens conceituais do Construtor de Sentenças (Mad Libs Cyberpunk).
//
// Teoria: Efeito do Exemplo Trabalhado (Sweller) + Scaffolding (Vygotsky/ZPD).
// O aluno consulta um argumento-modelo perfeito e constrói o seu preenchendo a
// autoria final (punchline) — preservando coleta de Toulmin no backend.

// Cores neon dos três blocos de Toulmin (usadas no Holo-Guia e nas tags).
export const TOULMIN_COLORS = {
  claim:   { hex: '#00f3ff', glow: 'rgba(0,243,255,0.5)',  label: 'ALEGAÇÃO',       tag: 'CLAIM · sua posição central' },
  data:    { hex: '#ff007f', glow: 'rgba(255,0,127,0.5)',  label: 'EVIDÊNCIA',      tag: 'DATA · o fato que sustenta' },
  warrant: { hex: '#ffea00', glow: 'rgba(255,234,0,0.5)',  label: 'CONEXÃO LÓGICA', tag: 'WARRANT · liga dado à tese' },
};

// Exemplo perfeito de argumento Toulmin por tema (Holo-Guia).
// Cada bloco é renderizado colorido e com tag pedagógica curta.
export const TOULMIN_EXAMPLES = {
  redes_sociais: {
    claim:   'O uso intensivo de redes sociais agrava a ansiedade em adolescentes,',
    data:    'pois estudos longitudinais (Twenge, 2019) associam mais de 3h diárias de uso a aumento de sintomas depressivos,',
    warrant: 'já que a comparação social constante mediada por algoritmos de engajamento corrói a autoestima em formação.',
  },
  clima: {
    claim:   'A transição para energias renováveis é economicamente viável em larga escala,',
    data:    'pois o custo da energia solar caiu 89% entre 2010 e 2020 (IRENA), tornando-a mais barata que o carvão,',
    warrant: 'já que quando uma tecnologia limpa supera a fóssil em preço, o próprio mercado acelera sua adoção.',
  },
  automacao: {
    claim:   'A automação por IA exige uma reforma estrutural da rede de proteção social,',
    data:    'pois o Fórum Econômico Mundial projeta 85 milhões de empregos deslocados até 2025,',
    warrant: 'já que sem requalificação financiada o deslocamento tecnológico se converte em desigualdade permanente.',
  },
};

// Fallback quando o tema não é reconhecido.
export const DEFAULT_TOULMIN_EXAMPLE = {
  claim:   'A tese que defendo se sustenta sob escrutínio lógico,',
  data:    'pois há evidência empírica documentada que a corrobora,',
  warrant: 'já que essa evidência conecta-se diretamente à conclusão por um raciocínio válido.',
};

// ─── Holo-Guia UNIVERSAL (estático) ───────────────────────────────────────────
// Como o tema agora é livre (digitado pelo jogador), o exemplo de Toulmin é FIXO
// e neutro: um MODELO ESTRUTURAL ABSTRATO que o aluno espelha — independentemente
// do tema escolhido. Usamos "Mudanças Climáticas" como exemplo universal.
export const UNIVERSAL_TOULMIN_EXAMPLE = TOULMIN_EXAMPLES.clima;
export const UNIVERSAL_EXAMPLE_LABEL = 'Mudanças Climáticas';

// Mantidas para compat; agora SEMPRE retornam o modelo universal (ignoram themeId).
export function getToulminExample() {
  return UNIVERSAL_TOULMIN_EXAMPLE;
}

export function getExampleThemeLabel() {
  return UNIVERSAL_EXAMPLE_LABEL;
}
