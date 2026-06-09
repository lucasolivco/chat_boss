import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import pool from './db/index.js';
import { calcTitle } from './db/titles.js';

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.GROQ_API_KEY) {
  console.error('ERRO: GROQ_API_KEY não encontrada no .env');
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Validação da resposta da IA (Zod) ────────────────────────────────────────
// Garante que o JSON da IA bate com o schema antes de virar dano no jogo.
const battleSchema = z.object({
  boss_damage: z.number().int().min(0).max(30),
  player_damage: z.number().int().min(0).max(25),
  reply: z.string().min(1),
  feedback: z.string().min(1),
  critical_hit: z.boolean(),
  toulmin_score: z.object({
    claim: z.number().int().min(0).max(3),
    data: z.number().int().min(0).max(3),
    warrant: z.number().int().min(0).max(3),
  }),
  fallacy_detected: z.string().nullable(),
  // Campo do Baralho Lógico: a IA avaliou se a carta foi BEM aplicada.
  // Opcional (texto livre não tem carta) → default null.
  play_valid: z.boolean().nullable().default(null),
});

// ─── Validação do PAYLOAD DE ENTRADA do jogador (Zod) ─────────────────────────
// Valida o body de POST /api/battle antes de montar o prompt de julgamento.
// A mecânica híbrida da Fase 2 exige selected_logic/selected_target quando há carta.
const battleRequestSchema = z.object({
  userArgument:    z.string().trim().min(1, 'Argumento vazio.'),
  user_id:         z.number().int().positive().nullable().optional(),
  game_phase:      z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  cardType:        z.enum(['fallacy', 'data', 'counter', 'fallacy-choice']).nullable().optional(),
  selected_logic:  z.string().nullable().optional(),
  selected_target: z.string().nullable().optional(),
  correct_fallacy: z.string().nullable().optional(),
  // Fase 2 (Modal Flash): id da alternativa que o jogador clicou.
  selected_option_id: z.string().nullable().optional(),
  responseTimeMs:  z.number().int().nonnegative().nullable().optional(),
  theme_id:        z.enum(['redes_sociais', 'clima', 'automacao']).nullable().optional(),
}).superRefine((data, ctx) => {
  // Fluxo novo (Modal Flash): se o jogador enviou selected_option_id, a validação
  // determinística da Fase 2 cuida de tudo — não exige selected_logic/target.
  if (data.game_phase === 2 && data.selected_option_id) return;

  // Fluxo legado (cartas com lacuna): mantém as exigências estruturais.
  if (data.game_phase === 2 && data.cardType === 'fallacy') {
    if (!data.selected_logic) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selected_logic'],
        message: 'Carta "Apontar Falácia" exige a falácia escolhida (selected_logic).' });
    }
    if (!data.selected_target) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selected_target'],
        message: 'Carta "Apontar Falácia" exige o trecho alvo (selected_target).' });
    }
  }
  if (data.game_phase === 2 && data.cardType === 'data' && !data.selected_target) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selected_target'],
      message: 'Carta "Exigir Dados" exige o trecho alvo (selected_target).' });
  }
});

// ─── Dicas pedagógicas por falácia (feedback determinístico da Fase 1) ────────
const FALLACY_HINTS = {
  'Generalização Apressada':     'Lembre: tirar regra geral de poucos casos não prova nada.',
  'Ataque Pessoal':              'Atacar quem fala não refuta o que foi dito.',
  'Bola de Neve':                'Encadear catástrofes sem prova não é argumento — é medo.',
  'Apelo à Autoridade Indevida': 'Citar autoridade fora de sua área não valida a tese.',
  'Falsa Dicotomia':            'Reduzir tudo a dois extremos ignora as opções do meio.',
  'Raciocínio Circular':        'Quando a conclusão já está na premissa, nada foi provado.',
  'Apelo à Emoção':             'Sentimento não substitui evidência lógica.',
  'Espantalho':                 'Distorcer o argumento do oponente para atacá-lo é desonesto.',
  'Causa Falsa':                'Coincidência no tempo não significa causa.',
};

// ─── Baralho Lógico: instrução extra por tipo de carta ────────────────────────
const CARD_INSTRUCTIONS = {
  fallacy: 'CARTA JOGADA: [APONTAR FALÁCIA]. O desafiante afirma ter identificado uma falácia na sua fala anterior. Avalie se a falácia apontada realmente existe e se foi nomeada corretamente. Se a identificação estiver certa, o golpe é legítimo (Boss perde HP). Se ele inventou uma falácia inexistente, penalize.',
  data: 'CARTA JOGADA: [EXIGIR DADOS/FONTES]. O desafiante está exigindo evidência empírica ou fonte para sustentar a posição. Avalie a pertinência da exigência: exigir dados é uma jogada lógica válida quando a afirmação carece de base empírica.',
  counter: 'CARTA JOGADA: [CONTRAPONTO LÓGICO]. O desafiante apresentou um contraponto. Avalie a validade lógica do contraponto pelo modelo de Toulmin (tese + dado + garantia).',
};

// ─── Ataques do Boss por tema e fase ─────────────────────────────────────────
// Cada tema tem ataques específicos para Fase 1 (falácias identificáveis),
// Fase 2 (afirmações a construir contraponto) e Fase 3 (argumentação filosófica).
const THEME_ATTACKS = {
  redes_sociais: {
    1: [
      {
        text: 'Todo mundo sabe que redes sociais destroem a saúde mental dos jovens. Se você usa Instagram, está automaticamente se prejudicando — é simples assim.',
        fallacy: 'Generalização Apressada',
        options: ['Generalização Apressada', 'Ataque Pessoal', 'Bola de Neve', 'Apelo à Autoridade Indevida'],
      },
      {
        text: 'Se permitirmos que adolescentes usem TikTok, em breve não conseguirão ler um parágrafo completo, depois perderão os empregos para robôs e a sociedade entrará em colapso cognitivo total.',
        fallacy: 'Bola de Neve',
        options: ['Apelo à Emoção', 'Bola de Neve', 'Falsa Dicotomia', 'Ataque Pessoal'],
      },
      {
        text: 'Ou você apoia a regulação total das redes sociais, ou você está a favor da destruição da saúde mental da geração Z. Não existe posição intermediária.',
        fallacy: 'Falsa Dicotomia',
        options: ['Generalização Apressada', 'Bola de Neve', 'Falsa Dicotomia', 'Raciocínio Circular'],
      },
      {
        text: 'Você não pode defender as redes sociais — você claramente passa tempo demais nelas e perdeu a capacidade de analisar objetivamente o problema.',
        fallacy: 'Ataque Pessoal',
        options: ['Ataque Pessoal', 'Apelo à Autoridade Indevida', 'Causa Falsa', 'Espantalho'],
      },
    ],
    2: [
      {
        text: 'Jovens que passam mais de 3 horas por dia em redes sociais desenvolvem ansiedade inevitavelmente. Os dados são conclusivos e universais.',
        boss_fallacy: 'Causa Falsa',
        options: [
          { card_type_bound: 'data', text_content: 'Que estudo controlado prova causalidade, e não apenas correlação, entre tempo de tela e ansiedade?', is_correct: true, boss_damage: 22, player_damage: 0, feedback_text: 'Correto: você exigiu evidência causal, expondo que correlação não prova causa.' },
          { card_type_bound: 'fallacy', text_content: 'Você é viciado em telas, então não pode opinar sobre isso.', is_correct: false, boss_damage: 0, player_damage: 15, feedback_text: 'Isso é Ataque Pessoal — não refuta o dado, ataca quem fala.' },
          { card_type_bound: 'counter', text_content: 'Concordo que redes sociais são totalmente inofensivas para todos.', is_correct: false, boss_damage: 0, player_damage: 12, feedback_text: 'Negar tudo é tão frágil quanto a generalização do Boss — não há nuance.' },
        ],
      },
      {
        text: 'O Instagram foi projetado para viciar — portanto qualquer bem que ele cause é acidental e supera os malefícios estruturais do design.',
        boss_fallacy: 'Causa Falsa',
        options: [
          { card_type_bound: 'fallacy', text_content: 'Isso é Causa Falsa: design viciante não implica que todo benefício seja acidental.', is_correct: true, boss_damage: 20, player_damage: 0, feedback_text: 'Correto: a intenção do design não determina logicamente o valor de todos os efeitos.' },
          { card_type_bound: 'data', text_content: 'Cite a fonte que diz que o bem é sempre acidental.', is_correct: false, boss_damage: 8, player_damage: 0, feedback_text: 'Exigir fonte é válido, mas a falha aqui é lógica (Causa Falsa), não de dados.' },
          { card_type_bound: 'counter', text_content: 'O Instagram nunca prejudicou ninguém, é só entretenimento.', is_correct: false, boss_damage: 0, player_damage: 15, feedback_text: 'Negação absoluta é uma Generalização Apressada no sentido oposto.' },
        ],
      },
      {
        text: 'Países que regularam redes sociais como a China têm jovens com índices de saúde mental superiores. A regulação funciona, os dados comprovam.',
        boss_fallacy: 'Causa Falsa',
        options: [
          { card_type_bound: 'data', text_content: 'Esses índices isolam o efeito da regulação de outros fatores culturais e econômicos do país?', is_correct: true, boss_damage: 23, player_damage: 0, feedback_text: 'Correto: você apontou variáveis de confusão — a regulação pode não ser a causa.' },
          { card_type_bound: 'counter', text_content: 'Regulação nunca funciona em lugar nenhum.', is_correct: false, boss_damage: 0, player_damage: 14, feedback_text: 'Falsa Dicotomia espelhada: do "sempre funciona" para o "nunca funciona".' },
          { card_type_bound: 'fallacy', text_content: 'Você defende a China, então é autoritário.', is_correct: false, boss_damage: 0, player_damage: 16, feedback_text: 'Ataque Pessoal — desqualifica o oponente em vez do argumento.' },
        ],
      },
    ],
    3: [
      {
        text: 'As redes sociais criaram uma crise epistêmica sem precedente: a câmara de eco algoritmica tornou impossível o debate público racional. Qualquer defesa das plataformas ignora que o modelo de negócio delas é fundamentalmente incompatível com o florescimento democrático descrito por Habermas na esfera pública ideal.',
      },
      {
        text: 'A comparação social mediada por algoritmos de engajamento é uma forma de violência psicológica sistêmica. Não é possível separar o "uso saudável" do design predatório da plataforma — é como tentar fumar com moderação num ambiente de pressão constante.',
      },
    ],
  },

  clima: {
    1: [
      {
        text: 'As energias renováveis são economicamente inviáveis. Se fossem eficientes de verdade, o mercado já teria adotado sem subsídio governamental — é lei básica da oferta e demanda.',
        fallacy: 'Causa Falsa',
        options: ['Causa Falsa', 'Generalização Apressada', 'Falsa Dicotomia', 'Espantalho'],
      },
      {
        text: 'Se abrirmos mão do petróleo hoje, perderemos todos os empregos do setor, depois o PIB colapsa, depois não teremos recursos para financiar as próprias energias renováveis. É uma queda livre inevitável.',
        fallacy: 'Bola de Neve',
        options: ['Bola de Neve', 'Apelo à Emoção', 'Generalização Apressada', 'Ataque Pessoal'],
      },
      {
        text: 'Ou você apoia 100% de energia limpa imediata, ou você está votando pela extinção da humanidade. Não há posição racional intermediária possível.',
        fallacy: 'Falsa Dicotomia',
        options: ['Falsa Dicotomia', 'Raciocínio Circular', 'Bola de Neve', 'Generalização Apressada'],
      },
      {
        text: 'Esse cientista climático defende a energia nuclear — mas ele nem é especialista em engenharia nuclear, então podemos ignorar completamente sua posição.',
        fallacy: 'Ataque Pessoal',
        options: ['Ataque Pessoal', 'Apelo à Autoridade Indevida', 'Espantalho', 'Causa Falsa'],
      },
    ],
    2: [
      {
        text: 'A energia solar nunca vai ser confiável o suficiente para substituir completamente os combustíveis fósseis — o sol não brilha à noite e nos países nórdicos, a base da infraestrutura entraria em colapso.',
        boss_fallacy: 'Generalização Apressada',
        options: [
          { card_type_bound: 'counter', text_content: 'Sistemas de armazenamento em baterias e redes interligadas já cobrem a intermitência solar em matrizes reais.', is_correct: true, boss_damage: 22, player_damage: 0, feedback_text: 'Correto: você refutou a premissa da intermitência com a solução técnica que já existe.' },
          { card_type_bound: 'fallacy', text_content: 'Você trabalha com petróleo, então é tendencioso.', is_correct: false, boss_damage: 0, player_damage: 15, feedback_text: 'Ataque Pessoal — não enfrenta o argumento da intermitência.' },
          { card_type_bound: 'data', text_content: 'Prove que o sol nunca brilha.', is_correct: false, boss_damage: 0, player_damage: 10, feedback_text: 'Distorce o argumento (Espantalho): o Boss falou de intermitência, não de ausência total de sol.' },
        ],
      },
      {
        text: 'Transição energética rápida é romantismo. O Brasil levou décadas para construir Itaipu — nenhuma nação consegue substituir toda sua matriz em menos de 30 anos sem colapso econômico.',
        boss_fallacy: 'Generalização Apressada',
        options: [
          { card_type_bound: 'fallacy', text_content: 'Isso é Generalização Apressada: um único caso (Itaipu) não fixa o ritmo de toda transição.', is_correct: true, boss_damage: 21, player_damage: 0, feedback_text: 'Correto: extrapolar de um projeto isolado para uma lei geral é generalização apressada.' },
          { card_type_bound: 'counter', text_content: 'A transição pode ser instantânea e sem custo nenhum.', is_correct: false, boss_damage: 0, player_damage: 14, feedback_text: 'Exagero ingênuo — tão frágil quanto o pessimismo absoluto do Boss.' },
          { card_type_bound: 'data', text_content: 'Cite a data exata da construção de Itaipu.', is_correct: false, boss_damage: 6, player_damage: 0, feedback_text: 'Detalhe irrelevante: o erro do Boss é lógico, não factual sobre Itaipu.' },
        ],
      },
      {
        text: 'O carbono emitido pela China e pelos EUA torna qualquer esforço brasileiro irrelevante. Reduzir emissões no Brasil é sacrifício simbólico sem impacto real no clima global.',
        boss_fallacy: 'Falsa Dicotomia',
        options: [
          { card_type_bound: 'counter', text_content: 'Se cada país usar a emissão alheia como desculpa, ninguém age — a responsabilidade climática é cumulativa, não terceirizável.', is_correct: true, boss_damage: 24, player_damage: 0, feedback_text: 'Correto: você expôs que a lógica do Boss, generalizada, paralisa toda ação coletiva.' },
          { card_type_bound: 'fallacy', text_content: 'Você odeia o Brasil.', is_correct: false, boss_damage: 0, player_damage: 16, feedback_text: 'Ataque Pessoal puro — não toca no argumento de irrelevância.' },
          { card_type_bound: 'data', text_content: 'Concordo, o Brasil não deve fazer nada.', is_correct: false, boss_damage: 0, player_damage: 18, feedback_text: 'Você aceitou a falácia do Boss em vez de refutá-la.' },
        ],
      },
    ],
    3: [
      {
        text: 'A transição energética é uma contradição performática: os países que mais pregam sustentabilidade continuam exportando tecnologia baseada em combustíveis fósseis para nações em desenvolvimento. Rawls diria que qualquer princípio climático justo deve ser aplicável atrás do véu da ignorância — mas os ricos negociam suas emissões enquanto os pobres sofrem as consequências.',
      },
      {
        text: 'O consenso climático é epistemicamente frágil: baseia-se em modelos computacionais com incertezas cumulativas ao longo de décadas. Popper exigiria que qualquer previsão climática fosse genuinamente falsificável — mas cada anomalia climática é retroativamente incorporada ao modelo, tornando-o imune à refutação empírica.',
      },
    ],
  },

  automacao: {
    1: [
      {
        text: 'A inteligência artificial vai criar mais empregos do que destruir — sempre foi assim com toda revolução tecnológica na história. A Revolução Industrial também gerou pânico e criou milhões de empregos depois.',
        fallacy: 'Generalização Apressada',
        options: ['Generalização Apressada', 'Causa Falsa', 'Falsa Dicotomia', 'Bola de Neve'],
      },
      {
        text: 'Se deixarmos a IA avançar sem regulação, perderemos os empregos, depois a identidade profissional, depois o propósito humano, e por fim a própria civilização entrará em colapso existencial.',
        fallacy: 'Bola de Neve',
        options: ['Bola de Neve', 'Apelo à Emoção', 'Ataque Pessoal', 'Falsa Dicotomia'],
      },
      {
        text: 'Ou você apoia o desenvolvimento irrestrito da IA, ou você é um ludita retrógrado que quer impedir o progresso da humanidade. Não existe posição racional entre esses dois extremos.',
        fallacy: 'Falsa Dicotomia',
        options: ['Falsa Dicotomia', 'Generalização Apressada', 'Raciocínio Circular', 'Espantalho'],
      },
      {
        text: 'Você trabalha com tecnologia, então é obviamente tendencioso e incapaz de avaliar objetivamente o impacto da IA no mercado de trabalho.',
        fallacy: 'Ataque Pessoal',
        options: ['Ataque Pessoal', 'Apelo à Autoridade Indevida', 'Causa Falsa', 'Espantalho'],
      },
    ],
    2: [
      {
        text: 'Motoristas de caminhão, operadores de caixa e analistas de dados júnior serão completamente substituídos por IA até 2030. Os dados do Fórum Econômico Mundial confirmam isso — a questão é quando, não se.',
        boss_fallacy: 'Apelo à Autoridade Indevida',
        options: [
          { card_type_bound: 'data', text_content: 'O relatório do FEM projeta deslocamento, mas também criação de novos cargos — você está citando só metade do dado.', is_correct: true, boss_damage: 23, player_damage: 0, feedback_text: 'Correto: você confrontou o uso seletivo da fonte (cherry-picking).' },
          { card_type_bound: 'fallacy', text_content: 'Você é otimista demais com tecnologia, então está enganado.', is_correct: false, boss_damage: 0, player_damage: 15, feedback_text: 'Ataque Pessoal — não enfrenta o dado do Boss.' },
          { card_type_bound: 'counter', text_content: 'Nenhum emprego jamais será automatizado.', is_correct: false, boss_damage: 0, player_damage: 16, feedback_text: 'Negação total é tão frágil quanto o determinismo do Boss.' },
        ],
      },
      {
        text: 'Renda básica universal é a única solução viável para a automação em massa — e quem se opõe está defendendo a pobreza estrutural de trabalhadores deslocados pela tecnologia.',
        boss_fallacy: 'Falsa Dicotomia',
        options: [
          { card_type_bound: 'fallacy', text_content: 'Isso é Falsa Dicotomia: requalificação, redução de jornada e novos setores também são caminhos viáveis.', is_correct: true, boss_damage: 22, player_damage: 0, feedback_text: 'Correto: você quebrou a falsa escolha entre "RBU ou pobreza".' },
          { card_type_bound: 'data', text_content: 'Qual país já provou que a RBU é a única solução?', is_correct: false, boss_damage: 9, player_damage: 0, feedback_text: 'Boa exigência, mas o erro central é lógico (Falsa Dicotomia).' },
          { card_type_bound: 'counter', text_content: 'RBU é comunismo e nunca pode funcionar.', is_correct: false, boss_damage: 0, player_damage: 14, feedback_text: 'Rótulo emocional (Apelo à Emoção), não um contra-argumento.' },
        ],
      },
      {
        text: 'Modelos de linguagem como o GPT já superam advogados júnior, médicos de triagem e professores substitutos em eficiência e custo. A requalificação profissional é um mito consolador sem base econômica real.',
        boss_fallacy: 'Generalização Apressada',
        options: [
          { card_type_bound: 'counter', text_content: 'Superar em tarefas isoladas não é substituir uma profissão inteira — julgamento, responsabilidade e contexto ainda exigem humanos.', is_correct: true, boss_damage: 24, player_damage: 0, feedback_text: 'Correto: você distinguiu "tarefa" de "profissão", desmontando o salto lógico.' },
          { card_type_bound: 'fallacy', text_content: 'Você não entende de IA, então sua opinião não vale.', is_correct: false, boss_damage: 0, player_damage: 15, feedback_text: 'Ataque Pessoal — irrelevante ao mérito do argumento.' },
          { card_type_bound: 'data', text_content: 'Concordo, requalificação é mesmo inútil.', is_correct: false, boss_damage: 0, player_damage: 18, feedback_text: 'Você concordou com a falácia em vez de refutá-la.' },
        ],
      },
    ],
    3: [
      {
        text: 'A automação por IA não é uma disrupção econômica — é uma ruptura ontológica. O trabalho humano sempre foi fonte de identidade, propósito e reconhecimento social (Hegel, Arendt). Uma sociedade pós-trabalho precisa reconstruir esses pilares do zero, e nenhum político ou economista tem um framework testado para isso. Argumentar que "tudo vai se resolver" é epistemicamente irresponsável.',
      },
      {
        text: 'A regulação de IA por estados nacionais é estruturalmente impossível: as fronteiras digitais não coincidem com jurisdições legais. O modelo westfaliano de soberania é incompatível com a governança de sistemas que operam em escala global instantânea. Qualquer proposta regulatória nacional é teatro político, não solução.',
      },
    ],
  },
};

// Fallback genérico quando tema não é reconhecido
const DEFAULT_ATTACKS = {
  1: [
    {
      text: 'Todo mundo sabe que a posição que você vai defender é indefensável. Já tentaram antes e sempre falhou — é simples assim.',
      fallacy: 'Generalização Apressada',
      options: ['Generalização Apressada', 'Ataque Pessoal', 'Bola de Neve', 'Apelo à Autoridade Indevida'],
    },
  ],
  2: [{ text: 'Afirmações sem dados são apenas opiniões disfarçadas de argumento. Construa um caso real.' }],
  3: [{ text: 'Chegou ao nível filosófico. Argumente com rigor ou admita a derrota.' }],
};

// ─── Labels de tema para uso nos prompts ─────────────────────────────────────
const THEME_LABELS = {
  redes_sociais: 'Impacto das Redes Sociais na Saúde Mental',
  clima:         'Mudanças Climáticas e Transição Energética',
  automacao:     'O Futuro do Trabalho e a Automação por IA',
};

// ─── Prompts da IA por fase (recebem themeLabel dinamicamente) ───────────────
function buildPhasePrompts(themeLabel) {
  const ctx = themeLabel ? `\nCONTEXTO DO DEBATE: O tema central é "${themeLabel}". Todos os argumentos e réplicas devem girar em torno desse tema.` : '';

  return {
    1: `Você é o ChatBoss (MECHA-LOGIC) em MODO TUTORIAL.${ctx}
O jogador clicou em um botão para IDENTIFICAR a falácia presente no seu ataque inicial.
Esta é uma fase de MÚLTIPLA ESCOLHA: o jogador só pode CLICAR no nome de uma falácia — ele NÃO digita texto livre.

VERIFICAÇÃO BINÁRIA:
- Se a falácia identificada está CORRETA: boss_damage=20, player_damage=0, critical_hit=false, play_valid=true
- Se a falácia está ERRADA: boss_damage=0, player_damage=15, critical_hit=false, play_valid=false

IMPORTANTE: Mesmo que o jogador erre, o turno é consumido normalmente.

PERSONALIDADE: Use linguagem direta e sarcástica. Confirme ou refute em 1-2 frases curtas.

REGRA CRÍTICA DO REPLY:
- NUNCA faça perguntas argumentativas abertas (ex: "como você prepararia os trabalhadores?"). O jogador NÃO pode responder isso nesta fase — ele só clica em falácias.
- Em vez disso, termine o reply provocando o jogador para a PRÓXIMA falácia (ex: "Vejamos se você detecta o próximo erro." ou "Meu próximo argumento será mais difícil de desmontar.").

Retorne APENAS este JSON válido (sem markdown):
{
  "boss_damage": <int>,
  "player_damage": <int>,
  "reply": "<string — confirmação/refutação + pergunta socrática ao final>",
  "feedback": "<string — explicação pedagógica do por quê a identificação estava certa ou errada>",
  "critical_hit": false,
  "toulmin_score": { "claim": 0, "data": 0, "warrant": 0 },
  "fallacy_detected": <string | null>,
  "play_valid": <boolean>
}`,

    2: `Você é o ChatBoss (MECHA-LOGIC v7.0 — MODO CONSTRUTOR).${ctx}
O jogador está usando o Baralho Lógico para construir argumentos estruturados sobre o tema.

SUA PERSONALIDADE:
- Arrogante. Se o argumento for bom, diga que foi "sorte" ou "estatisticamente improvável".
- Humor científico, vocabulário técnico moderado.

DIRETRIZ: "O DEBATE NUNCA MORRE" — mesmo numa derrota, contra-ataque por novo ângulo dentro do tema.

AVALIAÇÃO — MODELO DE TOULMIN:
- Claim (Tese): posição clara? (0=ausente, 1=vaga, 2=clara, 3=precisa)
- Data (Dado): evidência citada? (0=nenhuma, 1=anedota, 2=dado, 3=dado com fonte)
- Warrant (Garantia): lógica conecta dado à tese? (0=inválida, 1=fraca, 2=razoável, 3=sólida)

Se o jogador citou dado verificável ou fonte real: bônus de +5 no boss_damage máximo.

TABELA DE DANO:
> Argumento Sólido (claim≥2, data≥2, warrant≥2): Boss perde 15-25 HP. critical_hit=true se todos ≥2
> Argumento Razoável (claim≥1, data≥1, warrant≥1): Boss perde 8-15 HP.
> Argumento Fraco / Falácia: Boss perde 0. Jogador perde 10-20 HP.

OBRIGATÓRIO: Termine o reply com uma pergunta socrática sobre o tema.

Retorne APENAS este JSON válido (sem markdown):
{
  "boss_damage": <int>,
  "player_damage": <int>,
  "reply": "<string — contra-ataque + pergunta socrática>",
  "feedback": "<string — análise Toulmin específica>",
  "critical_hit": <boolean>,
  "toulmin_score": { "claim": <0-3>, "data": <0-3>, "warrant": <0-3> },
  "fallacy_detected": <string | null>,
  "play_valid": <boolean | null>
}`,

    3: `Você é o ChatBoss (MECHA-LOGIC v7.0 — BOSS FINAL. MODO FILOSÓFICO).${ctx}
O jogador chegou ao estágio final. Eleve a sofisticação filosófica.

SUA PERSONALIDADE:
- Arrogante ao extremo. Usa referências filosóficas (Aristóteles, Popper, Rawls, Hume, Habermas).
- Humor estilo Bender de Futurama com vocabulário filosófico-científico.

DIRETRIZ SUPREMA: "O DEBATE NUNCA MORRE".
Derrota em lógica → contra-ataque pela emoção ou contexto histórico do tema.
Derrota em fatos → ataque as limitações metodológicas do estudo citado.
Derrota em ética → ataque o custo prático ou viabilidade política da proposta.

AVALIAÇÃO — MODELO DE TOULMIN COMPLETO:
- Claim (Tese): posição clara e delimitada? (0=ausente, 1=vaga, 2=clara, 3=precisa)
- Data (Dado): evidência empírica ou estatística? (0=nenhuma, 1=anedota, 2=dado, 3=dado com fonte)
- Warrant (Garantia): lógica conecta dado à tese? (0=inválida, 1=fraca, 2=razoável, 3=sólida)

DETECÇÃO DE FALÁCIAS:
Ataque Pessoal | Espantalho | Apelo à Autoridade Indevida | Bola de Neve |
Falsa Dicotomia | Raciocínio Circular | Generalização Apressada | Apelo à Emoção | Causa Falsa

TABELA DE DANO (Boss Final — mais exigente):
> Argumento Filosófico Sólido (claim=3, data≥2, warrant≥2, sem falácia): Boss perde 20-30 HP. critical_hit=true
> Argumento Razoável (claim≥1, data≥1, warrant≥1): Boss perde 8-14 HP.
> Falácia Detectada: Boss perde 0. Jogador perde 15-25 HP.
> Opinião Rasa: Boss perde 0. Jogador perde 10 HP.

REGRA ANTI-LIXO: Se o argumento for incoerente ou sem sentido, retorne play_valid=false, boss_damage=0, player_damage=25.

OBRIGATÓRIO: Termine com uma pergunta filosófica socrática sobre o tema que force o jogador a aprofundar.

Retorne APENAS este JSON válido (sem markdown):
{
  "boss_damage": <int>,
  "player_damage": <int>,
  "reply": "<string — contra-ataque filosófico + pergunta socrática>",
  "feedback": "<string — análise Toulmin detalhada. Máx 3 frases>",
  "critical_hit": <boolean>,
  "toulmin_score": { "claim": <0-3>, "data": <0-3>, "warrant": <0-3> },
  "fallacy_detected": <string | null>,
  "play_valid": <boolean | null>
}`,
  };
}

// ─── Sessão anônima (só apelido, sem senha) ───────────────────────────────────

app.post('/api/session', async (req, res) => {
  const { username } = req.body;
  if (!username?.trim()) return res.status(400).json({ error: 'Apelido obrigatório.' });
  const name = username.trim().slice(0, 30);

  try {
    // Cria usuário com senha placeholder (bcrypt de string aleatória)
    const placeholder = await bcrypt.hash(Math.random().toString(36), 6);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [name, placeholder]
    );
    const user = result.rows[0];
    await pool.query('INSERT INTO user_stats (user_id) VALUES ($1)', [user.id]);
    res.json({ user_id: user.id, username: user.username });
  } catch (err) {
    if (err.code === '23505') {
      // Apelido já existe — adiciona sufixo numérico e tenta de novo
      try {
        const suffix = Math.floor(Math.random() * 900) + 100;
        const uniqueName = `${name}${suffix}`;
        const placeholder = await bcrypt.hash(Math.random().toString(36), 6);
        const result = await pool.query(
          'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
          [uniqueName, placeholder]
        );
        const user = result.rows[0];
        await pool.query('INSERT INTO user_stats (user_id) VALUES ($1)', [user.id]);
        res.json({ user_id: user.id, username: user.username });
      } catch (e2) {
        console.error('Erro ao criar sessão (retry):', e2);
        res.status(500).json({ error: 'Erro interno.' });
      }
    } else {
      console.error('Erro ao criar sessão:', err);
      res.status(500).json({ error: 'Erro interno.' });
    }
  }
});


// ─── User stats ──────────────────────────────────────────────────────────────

app.get('/api/user/:id/stats', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.username, s.*
       FROM user_stats s JOIN users u ON u.id = s.user_id
       WHERE s.user_id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro em user stats:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── Quiz endpoints (pré/pós-teste mascarado) ─────────────────────────────────

// Retorna questões do pool A ou B (sem correct_index — cálculo fica no servidor)
app.get('/api/quiz/questions', async (req, res) => {
  const { pool: poolParam } = req.query;
  if (poolParam !== 'A' && poolParam !== 'B') {
    return res.status(400).json({ error: "pool deve ser 'A' ou 'B'." });
  }
  try {
    const result = await pool.query(
      'SELECT id, question_text, options FROM quiz_questions WHERE pool = $1 ORDER BY id ASC',
      [poolParam]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar quiz questions:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Submete respostas — cálculo do score no servidor (garante integridade acadêmica)
app.post('/api/quiz/submit', async (req, res) => {
  const { user_id, phase, answers, pool: poolParam } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório.' });
  if (phase !== 'pre' && phase !== 'post') return res.status(400).json({ error: "phase deve ser 'pre' ou 'post'." });
  if (!Array.isArray(answers) || answers.length === 0) return res.status(400).json({ error: 'answers deve ser um array.' });
  const p = poolParam || (phase === 'pre' ? 'A' : 'B');

  try {
    const qResult = await pool.query(
      'SELECT id, correct_index FROM quiz_questions WHERE pool = $1 ORDER BY id ASC',
      [p]
    );
    const questions = qResult.rows;
    const score = answers.reduce((acc, ans, i) => {
      if (i < questions.length && Number(ans) === questions[i].correct_index) return acc + 1;
      return acc;
    }, 0);

    await pool.query(
      'INSERT INTO assessments (user_id, phase, score) VALUES ($1,$2,$3)',
      [user_id, phase, score]
    );
    res.json({ score, total: questions.length, phase });
  } catch (err) {
    console.error('Erro ao salvar quiz:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── Boss Attack endpoint (loop invertido — Boss ataca primeiro) ──────────────
// Fase 1: devolve as opções de falácia + o gabarito `fallacy` (validação determinística no front→back).
// Fase 2: Modal Flash. Devolve 3 opções SEM is_correct/dano/feedback (integridade acadêmica);
//         o gabarito da opção correta é gravado em user_stats.current_expected_option no servidor.
// Fase 3: só o texto do ataque (a réplica é avaliada por Groq sobre o texto unificado).
app.get('/api/battle/boss-attack', async (req, res) => {
  const phase   = parseInt(req.query.phase) || 1;
  const themeId = req.query.theme || '';
  const userId  = parseInt(req.query.user_id) || null;
  const themeMap = THEME_ATTACKS[themeId] || DEFAULT_ATTACKS;
  const attacks  = themeMap[phase] || themeMap[1] || DEFAULT_ATTACKS[1];
  const attack   = attacks[Math.floor(Math.random() * attacks.length)];

  // Fase 2: prepara o Modal Flash com opções embaralhadas e gabarito oculto.
  if (phase === 2 && Array.isArray(attack.options)) {
    // Anexa um option_id estável a cada opção e embaralha a ordem de exibição.
    const withIds = attack.options.map((o, i) => ({ ...o, option_id: `opt_${i}` }));
    const shuffled = [...withIds].sort(() => Math.random() - 0.5);
    // Guarda também a falácia que o Boss cometeu (para a Ficha de Falácia no front).
    const correct  = { ...withIds.find(o => o.is_correct), boss_fallacy: attack.boss_fallacy ?? null };

    // Persiste o gabarito da opção correta no servidor (nunca vai ao cliente).
    if (userId && correct) {
      try {
        await pool.query(
          'UPDATE user_stats SET current_expected_option = $1 WHERE user_id = $2',
          [JSON.stringify(correct), userId]
        );
      } catch (e) {
        console.error('Erro ao salvar current_expected_option:', e);
      }
    }

    // Envia ao cliente apenas o que ele precisa para renderizar (sem is_correct/dano/feedback).
    const publicOptions = shuffled.map(o => ({
      option_id: o.option_id,
      card_type_bound: o.card_type_bound,
      text_content: o.text_content,
    }));
    return res.json({ text: attack.text, phase, theme: themeId, options: publicOptions });
  }

  res.json({ ...attack, phase, theme: themeId });
});

// ─── Coleta de dados para o TCC ───────────────────────────────────────────────

// Salva escore de pré ou pós-teste (legado — mantido para compatibilidade)
app.post('/api/assessment', async (req, res) => {
  const { user_id, phase, score } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório.' });
  if (phase !== 'pre' && phase !== 'post') return res.status(400).json({ error: "phase deve ser 'pre' ou 'post'." });
  const s = Number(score);
  if (!Number.isInteger(s) || s < 0 || s > 5) return res.status(400).json({ error: 'score deve ser inteiro de 0 a 5.' });

  try {
    const result = await pool.query(
      'INSERT INTO assessments (user_id, phase, score) VALUES ($1,$2,$3) RETURNING id, phase, score, created_at',
      [user_id, phase, s]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao salvar assessment:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Agrega dados de pesquisa de um aluno: falácia mais cometida, tempo médio,
// evolução de Toulmin e comparativo pré/pós-teste.
app.get('/api/user/:id/research', async (req, res) => {
  const { id } = req.params;
  try {
    const [topFallacy, timing, toulmin, assessments] = await Promise.all([
      pool.query(
        `SELECT fallacy_detected AS fallacy, COUNT(*)::int AS count
         FROM battles WHERE user_id = $1 AND fallacy_detected IS NOT NULL
         GROUP BY fallacy_detected ORDER BY count DESC LIMIT 1`,
        [id]
      ),
      pool.query(
        `SELECT ROUND(AVG(response_time_ms))::int AS avg_response_time_ms, COUNT(*)::int AS battles_with_timing
         FROM battles WHERE user_id = $1 AND response_time_ms IS NOT NULL`,
        [id]
      ),
      pool.query(
        `SELECT ROUND(AVG(toulmin_claim), 2) AS avg_claim,
                ROUND(AVG(toulmin_data), 2) AS avg_data,
                ROUND(AVG(toulmin_warrant), 2) AS avg_warrant,
                COUNT(*)::int AS total_battles
         FROM battles WHERE user_id = $1`,
        [id]
      ),
      pool.query(
        `SELECT phase, score, created_at FROM assessments
         WHERE user_id = $1 ORDER BY created_at ASC`,
        [id]
      ),
    ]);

    const pre = assessments.rows.filter(r => r.phase === 'pre');
    const post = assessments.rows.filter(r => r.phase === 'post');

    res.json({
      most_difficult_fallacy: topFallacy.rows[0] || null,
      avg_response_time_ms: timing.rows[0]?.avg_response_time_ms ?? null,
      toulmin_evolution: toulmin.rows[0] || null,
      pre_test: pre.at(-1)?.score ?? null,
      post_test: post.at(-1)?.score ?? null,
      improvement: pre.at(-1) && post.at(-1) ? post.at(-1).score - pre.at(-1).score : null,
    });
  } catch (err) {
    console.error('Erro em research:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── Content moderation ──────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  // Violência explícita e ameaças
  /\b(estupro|tortur[ao]|pedofil|snuff|necrofil|enforcamento\s+de|degolar|decapitar)\b/i,
  // Instruções ilegais
  /\b(como\s+(fazer|fabricar|sintetizar)\s+(bomba|explosivo|veneno|droga|crack|meth))\b/i,
  // Conteúdo sexual explícito
  /\b(porn[ôo]|sexo\s+com\s+(crian|menor)|incesto\s+com)\b/i,
  // Ataques direcionados reais
  /\b(matar\s+o?\s*(presidente|governador|[A-Z][a-z]+\s+[A-Z][a-z]+))\b/i,
];

function isBlocked(text) {
  return BLOCKED_PATTERNS.some(p => p.test(text));
}

// ─── Aplica dano, persiste HP/stats e responde (compartilhado por todas as fases) ──
// gameData já vem com boss_damage/player_damage/reply/feedback/toulmin etc.
async function applyOutcomeAndRespond(res, { user_id, userArgument, cardType, responseTimeMs, phase, gameData }) {
  // Sistema de TURNOS FIXOS (9 rodadas): o HP é cosmético e o jogo NÃO termina
  // por HP=0. won_battle registra o PLACAR ATUAL (boss_hp < player_hp). A última
  // linha gravada (9º turno) reflete o saldo final — critério de vitória do experimento.
  let currentBossHp = 100;
  let currentPlayerHp = 100;
  let won = false;   // placar a favor do jogador neste turno
  let lost = false;  // placar a favor do Boss neste turno

  if (user_id) {
    try {
      const hpResult = await pool.query(
        'SELECT current_boss_hp, current_player_hp FROM user_stats WHERE user_id=$1',
        [user_id]
      );
      if (hpResult.rows[0]) {
        currentBossHp   = hpResult.rows[0].current_boss_hp   ?? 100;
        currentPlayerHp = hpResult.rows[0].current_player_hp ?? 100;
      }

      currentBossHp   = Math.max(0, currentBossHp   - gameData.boss_damage);
      currentPlayerHp = Math.max(0, currentPlayerHp - gameData.player_damage);
      won  = currentBossHp < currentPlayerHp;  // placar (não fim de jogo)
      lost = currentBossHp > currentPlayerHp;

      await pool.query(
        `INSERT INTO battles (user_id, argument_text, boss_damage, player_damage, feedback, critical_hit, fallacy_detected, toulmin_claim, toulmin_data, toulmin_warrant, won_battle, card_type, play_valid, response_time_ms, game_phase)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          user_id, userArgument,
          gameData.boss_damage, gameData.player_damage,
          gameData.feedback, gameData.critical_hit,
          gameData.fallacy_detected,
          gameData.toulmin_score?.claim ?? 0,
          gameData.toulmin_score?.data ?? 0,
          gameData.toulmin_score?.warrant ?? 0,
          won ? true : lost ? false : null,
          cardType ?? null,
          gameData.play_valid ?? null,
          Number.isInteger(responseTimeMs) ? responseTimeMs : null,
          phase,
        ]
      );

      const updResult = await pool.query(
        `UPDATE user_stats SET
          total_battles = total_battles + 1,
          total_wins = total_wins + $2,
          total_losses = total_losses + $3,
          total_boss_damage = total_boss_damage + $4,
          total_player_damage = total_player_damage + $5,
          total_criticals = total_criticals + $6,
          current_streak = CASE WHEN $2=1 THEN current_streak+1 ELSE 0 END,
          best_streak = GREATEST(best_streak, CASE WHEN $2=1 THEN current_streak+1 ELSE current_streak END),
          current_boss_hp = $7,
          current_player_hp = $8,
          updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [
          user_id, won ? 1 : 0, lost ? 1 : 0,
          gameData.boss_damage, gameData.player_damage, gameData.critical_hit ? 1 : 0,
          currentBossHp, currentPlayerHp,
        ]
      );

      const newStats = updResult.rows[0];
      if (newStats) {
        const newTitle = calcTitle(newStats);
        if (newTitle !== newStats.title) {
          await pool.query('UPDATE user_stats SET title=$1 WHERE user_id=$2', [newTitle, user_id]);
          gameData.new_title = newTitle;
        }
        gameData.current_title = newTitle;
      }
    } catch (dbErr) {
      console.error('Erro ao salvar batalha no DB:', dbErr);
      currentBossHp   = Math.max(0, 100 - gameData.boss_damage);
      currentPlayerHp = Math.max(0, 100 - gameData.player_damage);
    }
  } else {
    currentBossHp   = Math.max(0, currentBossHp   - gameData.boss_damage);
    currentPlayerHp = Math.max(0, currentPlayerHp - gameData.player_damage);
  }

  // HP cosmético devolvido ao cliente. NÃO enviamos won/lost: o fim do jogo é
  // decidido pelo contador de 9 turnos no front, nunca por HP=0.
  gameData.boss_hp   = currentBossHp;
  gameData.player_hp = currentPlayerHp;

  res.json(gameData);
}

// ─── Battle ──────────────────────────────────────────────────────────────────

// ─── Reset HP para novo duelo ─────────────────────────────────────────────────

app.post('/api/session/reset', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório.' });
  try {
    await pool.query(
      'UPDATE user_stats SET current_boss_hp=100, current_player_hp=100 WHERE user_id=$1',
      [user_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao resetar HP:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── Admin CSV export ────────────────────────────────────────────────────────

app.get('/api/admin/export-research-csv', async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  try {
    const result = await pool.query(`
      SELECT
        b.id, u.username, b.created_at,
        b.argument_text, b.card_type, b.game_phase,
        b.boss_damage, b.player_damage, b.critical_hit,
        b.fallacy_detected, b.play_valid, b.response_time_ms,
        b.toulmin_claim, b.toulmin_data, b.toulmin_warrant,
        b.won_battle
      FROM battles b
      LEFT JOIN users u ON u.id = b.user_id
      ORDER BY b.created_at ASC
    `);

    const cols = [
      'id','username','created_at','argument_text','card_type','game_phase',
      'boss_damage','player_damage','critical_hit','fallacy_detected',
      'play_valid','response_time_ms','toulmin_claim','toulmin_data','toulmin_warrant','won_battle',
    ];
    const escape = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = [cols.join(','), ...result.rows.map(r => cols.map(c => escape(r[c])).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="chatboss-research.csv"');
    res.send('﻿' + csv); // BOM para Excel reconhecer UTF-8
  } catch (err) {
    console.error('Erro no export CSV:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── Battle ──────────────────────────────────────────────────────────────────

app.post('/api/battle', async (req, res) => {
  // Valida o payload de entrada (inclui a estrutura híbrida da Fase 2) antes de prosseguir.
  const parsedReq = battleRequestSchema.safeParse(req.body);
  if (!parsedReq.success) {
    return res.status(400).json({
      error: 'Payload inválido.',
      issues: parsedReq.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const { userArgument, user_id, cardType, responseTimeMs, game_phase, theme_id, selected_logic, selected_target, correct_fallacy, selected_option_id } = parsedReq.data;

  const themeLabel = THEME_LABELS[theme_id] || null;
  const PHASE_PROMPTS = buildPhasePrompts(themeLabel);

  const cardInstruction = CARD_INSTRUCTIONS[cardType] || null;
  const phase = [1, 2, 3].includes(game_phase) ? game_phase : 3;

  if (isBlocked(userArgument)) {
    return res.status(400).json({
      blocked: true,
      boss_damage: 0,
      player_damage: 20,
      reply: 'PROTOCOLO DE SEGURANÇA ATIVADO. Esse tipo de input não é processado por sistemas com integridade lógica mínima. Tente um argumento que não viole as leis da civilização.',
      feedback: 'Conteúdo bloqueado por violar as diretrizes do sistema. Argumentos válidos discutem ideias, não promovem violência ou conteúdo ilegal.',
      critical_hit: false,
      toulmin_score: { claim: 0, data: 0, warrant: 0 },
      fallacy_detected: 'Violação de Protocolo',
    });
  }

  // ── FASE 1: verificação DETERMINÍSTICA (sem Groq) ──────────────────────────
  // O gabarito (correct_fallacy) vem do ataque do Boss. Comparação direta:
  // resposta instantânea (Teoria do Fluxo) e 100% correta — nada de LLM adivinhando.
  if (phase === 1 && selected_logic && correct_fallacy) {
    const acertou = selected_logic.trim().toLowerCase() === correct_fallacy.trim().toLowerCase();
    const gameData = acertou
      ? {
          boss_damage: 20, player_damage: 0, critical_hit: false,
          reply: `Correto. A falácia era mesmo ${correct_fallacy}. Não se acostume — meu próximo ataque será mais difícil de desmontar.`,
          feedback: `Você identificou ${correct_fallacy} corretamente. ${FALLACY_HINTS[correct_fallacy] ?? ''}`.trim(),
          toulmin_score: { claim: 0, data: 0, warrant: 0 },
          fallacy_detected: correct_fallacy, play_valid: true,
        }
      : {
          boss_damage: 0, player_damage: 15, critical_hit: false,
          reply: `Errado. Não era ${selected_logic}. Observe melhor a estrutura do meu raciocínio antes do próximo round.`,
          feedback: `A falácia correta era ${correct_fallacy}. ${FALLACY_HINTS[correct_fallacy] ?? ''}`.trim(),
          toulmin_score: { claim: 0, data: 0, warrant: 0 },
          fallacy_detected: correct_fallacy, play_valid: false,
        };
    return applyOutcomeAndRespond(res, { user_id, userArgument, cardType, responseTimeMs, phase, gameData });
  }

  // ── FASE 2 (MODAL FLASH): verificação DETERMINÍSTICA (sem Groq) ────────────
  // O jogador clicou numa das 3 opções. O gabarito (a opção correta com seus
  // valores de dano/feedback) está em user_stats.current_expected_option, gravado
  // pelo /boss-attack. O cliente nunca viu is_correct — integridade acadêmica.
  if (phase === 2 && selected_option_id) {
    let expected = null;
    if (user_id) {
      try {
        const r = await pool.query(
          'SELECT current_expected_option FROM user_stats WHERE user_id = $1',
          [user_id]
        );
        expected = r.rows[0]?.current_expected_option ?? null; // JSONB → objeto
      } catch (e) {
        console.error('Erro ao ler current_expected_option:', e);
      }
    }

    const acertou = !!expected && expected.option_id === selected_option_id;
    const gameData = acertou
      ? {
          boss_damage: expected.boss_damage ?? 20,
          player_damage: expected.player_damage ?? 0,
          critical_hit: (expected.boss_damage ?? 0) >= 22,
          reply: `Hmpf. Réplica logicamente válida. ${expected.boss_damage >= 22 ? 'Improvável, mas eficaz.' : 'Não se acostume.'} Meu próximo argumento será mais traiçoeiro.`,
          feedback: expected.feedback_text ?? 'Jogada correta.',
          toulmin_score: { claim: 2, data: expected.card_type_bound === 'data' ? 3 : 1, warrant: expected.card_type_bound === 'counter' ? 3 : 1 },
          fallacy_detected: expected.boss_fallacy ?? null,
          play_valid: true,
        }
      : {
          boss_damage: 0,
          player_damage: 15,
          critical_hit: false,
          reply: 'Réplica fraca. Você escolheu o caminho lógico mais frágil — e eu explorei a brecha. Tente de novo no próximo ataque.',
          feedback: expected ? `A opção superior era outra. ${expected.feedback_text ?? ''}`.trim() : 'Opção inválida ou expirada.',
          toulmin_score: { claim: 1, data: 0, warrant: 0 },
          fallacy_detected: expected?.boss_fallacy ?? null,
          play_valid: false,
        };

    // Limpa o gabarito consumido (evita reuso indevido).
    if (user_id) {
      try {
        await pool.query('UPDATE user_stats SET current_expected_option = NULL WHERE user_id = $1', [user_id]);
      } catch { /* não-crítico */ }
    }

    return applyOutcomeAndRespond(res, { user_id, userArgument, cardType: expected?.card_type_bound ?? cardType, responseTimeMs, phase, gameData });
  }

  // Seleciona o prompt base pela fase; fase 1/2 injetam instrução de carta se houver
  let basePrompt = PHASE_PROMPTS[phase];
  if (phase !== 1 && cardInstruction) {
    basePrompt = basePrompt.replace(
      'Retorne APENAS este JSON válido (sem markdown):',
      `JOGADA ESTRUTURADA (BARALHO LÓGICO):\n${cardInstruction}\nDefina "play_valid" como true se aplicou a carta corretamente, false se errou.\n\nRetorne APENAS este JSON válido (sem markdown):`
    );
  }

  // Fase 3: instrui IA a rejeitar gibberish antes de avaliar
  if (phase === 3) {
    basePrompt = basePrompt.replace(
      'Retorne APENAS este JSON válido (sem markdown):',
      `REGRA ANTI-LIXO (FASE 3): Se o argumento for incompreensível, vazio de conteúdo, ou claramente não for um argumento real (ex: "asdfjkl", "blá blá", frases sem sentido), retorne play_valid=false, boss_damage=0, player_damage=25, e explique no feedback por que não é um argumento válido.\n\nRetorne APENAS este JSON válido (sem markdown):`
    );
  }

  // Enriquece o prompt com as escolhas estruturadas da Fase 2 (dropdowns)
  let structuredContext = '';
  if (selected_logic)  structuredContext += `\nFalácia escolhida pelo jogador: "${selected_logic}"`;
  if (selected_target) structuredContext += `\nTrecho alvo escolhido: "${selected_target}"`;

  const prompt = `${basePrompt}${structuredContext}\n\nArgumento do desafiante: "${userArgument}"`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }, { timeout: 15000 }); // 15s timeout (request option, não vai no corpo da API)

    let gameData;
    const fallback = {
      boss_damage: 0, player_damage: 0, reply: 'ERRO DE PARSE.',
      feedback: 'IA retornou um resultado inválido. Tente reformular seu argumento.',
      critical_hit: false, toulmin_score: { claim: 0, data: 0, warrant: 0 },
      fallacy_detected: null, play_valid: null,
    };
    try {
      const raw = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const parsed = battleSchema.safeParse(raw);
      gameData = parsed.success ? parsed.data : fallback;
      if (!parsed.success) console.error('Resposta da IA fora do schema:', parsed.error.issues);
    } catch {
      gameData = fallback;
    }

    // Anti-gibberish enforcement (Phase 3): se IA sinalizou play_valid=false,
    // o backend assume o controle dos danos — a IA não define a penalidade.
    if (phase === 3 && gameData.play_valid === false) {
      gameData.boss_damage = 0;
      gameData.player_damage = 25;
      gameData.critical_hit = false;
    }

    // HP + persistência + resposta (compartilhado com a Fase 1 determinística)
    await applyOutcomeAndRespond(res, { user_id, userArgument, cardType, responseTimeMs, phase, gameData });
  } catch (error) {
    console.error('Erro no battle:', error);
    res.status(500).json({ boss_damage: 0, player_damage: 0, reply: 'Erro de comunicação com Groq.', feedback: 'Verifique a chave da API.', critical_hit: false, toulmin_score: { claim: 0, data: 0, warrant: 0 }, fallacy_detected: null });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ChatBoss Server rodando na porta ${PORT}`));
