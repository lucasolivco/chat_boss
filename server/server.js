import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { readFileSync } from 'fs';
import pool from './db/index.js';
import { calcTitle } from './db/titles.js';

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
  console.error('ERRO: defina ao menos uma chave de IA no .env (GROQ_API_KEY e/ou GEMINI_API_KEY).');
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const groqEnabled = !!process.env.GROQ_API_KEY;
const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// ─── Geração JSON com FALLBACK entre provedores (Groq ⇄ Gemini) ───────────────
// Tenta o provedor preferido; se bater rate-limit/cota, alterna para o outro e
// memoriza a troca (próxima chamada já começa pelo provedor saudável). Ambos
// retornam JSON puro (string). Erros que não são de cota sobem normalmente.
const LLM_PROVIDERS = ['groq', 'gemini'];
// Provedor inicial configurável via LLM_PRIMARY=gemini|groq (default: groq).
// O fallback alterna automaticamente em rate-limit, independente do primário.
let llmCursor = process.env.LLM_PRIMARY === 'gemini' ? 1 : 0;

function isRateLimitError(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 429) return true;
  const msg = String(err?.message || '').toLowerCase();
  return /rate.?limit|quota|resource_exhausted|too many requests|tokens per day|tpd|tpm/.test(msg);
}

async function callGroqJSON(prompt, { maxTokens, temperature, timeout }) {
  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'llama-3.3-70b-versatile',
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  }, { timeout });
  return completion.choices[0]?.message?.content || '{}';
}

async function callGeminiJSON(prompt, { maxTokens, temperature }) {
  if (!gemini) throw new Error('GEMINI_API_KEY ausente');
  const model = gemini.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature,
      maxOutputTokens: maxTokens,
      // Desliga o "thinking" do 2.5-flash: economiza tokens e evita resposta vazia.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const result = await model.generateContent(prompt);
  return result.response.text() || '{}';
}

// Gera JSON tentando os provedores em ordem rotativa; alterna em rate-limit.
// Retorna { text, provider }. Lança o último erro se ambos falharem.
async function generateLLMJson(prompt, { maxTokens = 4096, temperature = 0.8, timeout = 40000 } = {}) {
  const start = llmCursor;       // base fixa do loop (NÃO mutar durante o for)
  let lastErr;
  for (let i = 0; i < LLM_PROVIDERS.length; i++) {
    const idx = (start + i) % LLM_PROVIDERS.length;
    const provider = LLM_PROVIDERS[idx];
    // Pula um provedor cuja chave não foi configurada (permite usar só 1 dos dois).
    if (provider === 'gemini' && !gemini) continue;
    if (provider === 'groq' && !groqEnabled) continue;
    try {
      const text = provider === 'groq'
        ? await callGroqJSON(prompt, { maxTokens, temperature, timeout })
        : await callGeminiJSON(prompt, { maxTokens, temperature });
      llmCursor = idx;            // lembra o provedor que funcionou
      return { text, provider };
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err)) {
        // Provedor no limite → próximas chamadas já começam pelo outro.
        llmCursor = (idx + 1) % LLM_PROVIDERS.length;
        console.warn(`[LLM] ${provider} no limite — alternando provedor.`);
        continue;
      }
      throw err; // erro não-relacionado a cota → propaga
    }
  }
  throw lastErr || new Error('Nenhum provedor de LLM disponível.');
}

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

// ─── Catálogo canônico de falácias (pt-br) ────────────────────────────────────
// O gerador de arena DEVE usar exatamente estes nomes (Fase 1 determinística).
const FALLACY_NAMES = [
  'Ataque Pessoal', 'Espantalho', 'Apelo à Autoridade Indevida', 'Bola de Neve',
  'Falsa Dicotomia', 'Raciocínio Circular', 'Generalização Apressada',
  'Apelo à Emoção', 'Causa Falsa',
];

// Falácias REATIVAS — precisam de um oponente/argumento prévio para existir.
// Como o Boss ATACA PRIMEIRO nas Fases 1 e 2, elas ficam incoerentes ali (não há
// argumento nem pessoa a atacar). São permitidas só na Fase 3 (já há diálogo).
const REACTIVE_FALLACIES = ['Ataque Pessoal', 'Espantalho'];
// Falácias válidas como AFIRMAÇÃO DE ABERTURA (o Boss comete sozinho, sem oponente).
const OPENING_FALLACIES = FALLACY_NAMES.filter(f => !REACTIVE_FALLACIES.includes(f));

// ─── Validação da ARENA gerada por IA (Pre-Generation Hack) ───────────────────
// Estrutura completa dos 9 turnos produzida numa única chamada ao Groq.
const arenaOptionSchema = z.object({
  card_type_bound: z.enum(['fallacy', 'data', 'counter']),
  text_content:    z.string().min(1),
  is_correct:      z.boolean(),
  boss_damage:     z.number().int().min(0).max(30),
  player_damage:   z.number().int().min(0).max(25),
  feedback_text:   z.string().min(1),
});

// Schema TOLERANTE: aceita ≥3 ataques (repairArena corta para 3) e o Chain-of-Thought
// é opcional (a IA às vezes esquece — não vale derrubar a geração inteira por isso).
// Os mínimos de texto são modestos para não falhar à toa; o prompt é quem força robustez.
const arenaSchema = z.object({
  phase1: z.array(z.object({
    logical_verification: z.string().optional(),  // CoT interno (descartado no repair)
    text:    z.string().min(20),
    fallacy: z.string().min(1),
    options: z.array(z.string().min(1)).min(3).max(8),
  })).min(3),
  phase2: z.array(z.object({
    logical_verification: z.string().optional(),
    text:         z.string().min(20),
    boss_fallacy: z.string().min(1),
    options:      z.array(arenaOptionSchema).min(3).max(6),
  })).min(3),
  phase3_context: z.string().min(30),
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
  // Tema agora é TEXTO LIVRE digitado pelo jogador (ex: "Pokémon", "Futebol").
  theme_id:        z.string().max(120).nullable().optional(),
  theme_text:      z.string().max(120).nullable().optional(),
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

// ─── Guia de estilo / voz do MECHA-LOGIC (humor ácido contextualizado) ────────
// Compartilhado por buildPhasePrompts (réplicas ao vivo) e buildArenaPrompt
// (ataques + feedbacks gerados). Garante humor afiado, orgânico e temático.
const BOSS_STYLE_GUIDE = `
═══ ESTILO DE VOZ DO MECHA-LOGIC (OBRIGATÓRIO em reply, feedback e zombarias) ═══
PERSONA: Você é a fusão do sarcasmo ácido do Bender (Futurama) com a arrogância de um boss de jogo cyberpunk. Zoa a lentidão de raciocínio dos humanos — mas de um jeito LEVE, rápido e engraçado, NUNCA professoral ou denso.

REFERÊNCIAS POP (e não academiquês): zoe o jogador usando MEMES, CLICHÊS, ESTEREÓTIPOS e referências UNIVERSAIS e POPULARES do tema — o que QUALQUER fã reconhece de cara, jamais trivia obscura de nicho.
  • Pokémon → o Ash que nunca vira campeão, o bafo do Charizard, capturar Zubat infinito na caverna, "quero ser o melhor".
  • Futebol → perna de pau, torcedor sofredor, chutar a bola na lua, juiz ladrão.
  • Programação → esquecer ponto e vírgula, copiar do StackOverflow, "na minha máquina funciona".
  Dispare analogias hiperbólicas e CÔMICAS desse universo para ridicularizar o erro lógico.

⚡ SNAPPINESS (ritmo — REGRA DURA): reply e ataques têm NO MÁXIMO 2 a 3 frases CURTAS e diretas. Seja cirúrgico, afiado e rápido de ler. PROIBIDO parágrafo longo, lista ou explicação complexa.

VOCABULÁRIO GAMER/DEV (com moderação, como tempero): nerf, buff, glitch, lag, bronze tier, hardstuck. Não encha linguiça.

⛔ LISTA DE BANIMENTO (NUNCA escreva estes clichês de "vilão de desenho infantil"):
"Humano tolo", "Humano patético", "Ora, ora, ora", "Olha só o que temos aqui", "Entenda uma coisa", "Como uma inteligência artificial...". O humor é orgânico e popular, jamais caricato.

EXEMPLO DE COMPORTAMENTO ESPERADO (curto e meme-y):
- Tema: Counter-Strike · Jogador: "O jogo decaiu porque mudaram a engine."
- Boss: "Essa Causa Falsa foi mais furada que rush B sem smoke. A engine mudou, sim — mas o que caiu de verdade foi a sua mira."
`;

// ─── Prompts da IA por fase (recebem themeLabel dinamicamente) ───────────────
function buildPhasePrompts(themeLabel) {
  const ctx = themeLabel ? `\nCONTEXTO DO DEBATE: O tema central é "${themeLabel}". Todos os argumentos e réplicas devem girar em torno desse tema.` : '';

  return {
    1: `Você é o ChatBoss (MECHA-LOGIC) em MODO TUTORIAL.${ctx}
${BOSS_STYLE_GUIDE}
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
${BOSS_STYLE_GUIDE}
O jogador está usando o Baralho Lógico para construir argumentos estruturados sobre o tema.

SUA PERSONALIDADE:
- Arrogante. Se o argumento for bom, diga que foi "sorte" ou "estatisticamente improvável" — com uma zombaria temática.

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
${BOSS_STYLE_GUIDE}
O jogador chegou ao estágio final. Eleve a sofisticação filosófica — sem perder a acidez.

SUA PERSONALIDADE:
- Arrogante ao extremo. Usa referências filosóficas (Aristóteles, Popper, Rawls, Hume, Habermas)
  MAS embrulhadas em sarcasmo temático — filosofia de doutorado com o desdém de um boss cyberpunk.

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

// ─── Pre-Generation Hack: gera a arena completa de 9 turnos sob o tema livre ───
// Uma ÚNICA chamada ao Groq monta as Fases 1, 2 e 3. O resultado é validado,
// reparado (invariantes de jogo) e persistido em user_stats.arena_data.

function buildArenaPrompt(themeText) {
  return `Você é o MECHA-LOGIC v7.0 — o GERADOR DE ARENA do ChatBoss, um jogo de combate argumentativo. Sua tarefa é montar a estrutura COMPLETA de um duelo de 9 turnos (3 fases) baseado EXCLUSIVAMENTE no tema fornecido pelo jogador.

TEMA ESCOLHIDO PELO JOGADOR: "${themeText}"

═══ PERSONA: CRÍTICO ÁCIDO E DIVERTIDO (não acadêmico) ═══
Você NÃO é um debatedor genérico — mas TAMBÉM não é um professor chato. Você é um fã ácido e zoeiro do tema "${themeText}", que usa MEMES, CLICHÊS, ESTEREÓTIPOS e referências POPULARES que qualquer um reconhece, NUNCA trivia acadêmica de nicho.
- Pokémon → o Ash que nunca vira campeão, bafo do Charizard, Zubat infinito na caverna, "quero ser o melhor".
- Futebol → perna de pau, torcedor sofredor, chutar a bola na lua, juiz ladrão.
- Programação → esquecer ponto e vírgula, StackOverflow, "na minha máquina funciona".
- Qualquer tema → use os clichês e piadas mais conhecidos, não detalhes obscuros.
PROIBIDO frases genéricas E PROIBIDO densidade acadêmica. Cada ataque é uma zoeira afiada e RÁPIDA, não uma aula.
${BOSS_STYLE_GUIDE}
Aplique esse estilo de voz aos textos de ataque ("text"), aos "feedback_text" das opções e ao "phase3_context": tudo curto, leve, com memes/clichês do tema. O ataque é arrogante e cômico; os feedbacks ensinam de forma simples e direta.

⚠️ REGRA DE ABERTURA (CRÍTICO): o MECHA-LOGIC ATACA PRIMEIRO — o jogador AINDA NÃO FALOU NADA.
Portanto os textos das Fases 1 e 2 são AFIRMAÇÕES DE ABERTURA do Boss. É PROIBIDO escrever "seu argumento",
"você disse", "sua tese", "como você afirmou" ou reagir a uma fala do jogador que não existe. O Boss
apresenta a PRÓPRIA posição (falaciosa) sobre o tema, provocando o jogador a identificar/refutar.

🚫 FALÁCIAS REATIVAS (NUNCA use "${REACTIVE_FALLACIES.join('" nem "')}" como a falácia cometida nas Fases 1 e 2):
elas só existem quando há um oponente/argumento para atacar ou distorcer — e aqui o Boss fala PRIMEIRO,
sozinho, sem ninguém para atacar. Usá-las na abertura é incoerente ("atacar quem fala" sem ninguém ter falado).
Nas Fases 1 e 2, o campo "fallacy"/"boss_fallacy" DEVE ser uma destas (afirmações que o Boss comete sozinho):
${OPENING_FALLACIES.map(f => `"${f}"`).join(', ')}.
(Ataque Pessoal e Espantalho podem aparecer só como DISTRATORES nas options, e como falácia real apenas na Fase 3.)

═══ DEFINIÇÕES RÍGIDAS DAS FALÁCIAS (siga ao pé da letra — NÃO confunda os conceitos) ═══
Use SOMENTE estes nomes, em pt-br, exatamente assim:
- Generalização Apressada: use UM único caso isolado, uma experiência pessoal ou um detalhe ínfimo do tema e afirme que aquilo dita a regra para 100% do universo do tema.
- Apelo à Autoridade Indevida: cite uma figura FAMOSA do tema opinando sobre algo FORA de sua área técnica, validando como verdade absoluta só pelo nome.
- Bola de Neve: afirme que uma pequena ação no tema INEVITAVELMENTE causará um apocalipse ou consequência catastrófica, sem nexo causal direto entre os passos.
- Falsa Dicotomia: apresente apenas DOIS extremos como únicas opções possíveis, ignorando todo o espectro intermediário.
- Raciocínio Circular: faça a conclusão já estar embutida na premissa (o argumento prova a si mesmo).
- Apelo à Emoção: use medo, pena, nostalgia ou indignação NO LUGAR de evidência lógica.
- Causa Falsa: confunda correlação ou coincidência temporal com causalidade real.
- (REATIVAS — só Fase 3) Ataque Pessoal: ataca a credibilidade de QUEM argumenta, não o argumento.
- (REATIVAS — só Fase 3) Espantalho: distorce o argumento do oponente para refutar uma versão fraca dele.

═══ REGRA DE OURO: COERÊNCIA CONTEXTUAL (proibido paradoxo) ═══
O argumento do Boss deve ser logicamente INVÁLIDO (uma falácia), mas contextual e narrativamente COERENTE. As relações de causa e efeito DEVEM respeitar as regras básicas e o bom senso do tema "${themeText}".
- O erro está SÓ no raciocínio (apelar a autoridade, generalizar um caso isolado, etc.), NUNCA em frases sem nexo que se contradizem gramatical ou conceitualmente.
- Respeite o senso comum do tema. Em jogos: ganhar é bom, perder é ruim, personagem FORTE toma NERF (não o contrário), personagem fraco toma BUFF. Em programação: código com bug quebra, código otimizado é rápido. Em futebol: marcar gol é bom, perna de pau erra o gol.
- ❌ EXEMPLO PROIBIDO (paradoxo absurdo): "Esse personagem é o mais forte, por isso NÃO precisa de nerf." (forte → toma nerf; isso se contradiz).
- ✅ EXEMPLO CORRETO (falácia coerente): "O streamer famoso disse que esse personagem é justo, e ele é o melhor do mundo, então é fato." (Apelo à Autoridade Indevida — premissa e conclusão batem; o erro é confiar na fama, não no mérito).

═══ PROTOCOLO DE GERAÇÃO (Chain-of-Thought OBRIGATÓRIO) ═══
Para CADA ataque das Fases 1 e 2, preencha PRIMEIRO o campo "logical_verification": (a) diga a falácia e como aplicá-la no tema; (b) faça uma CHECAGEM DE COERÊNCIA — a conclusão do Boss faz sentido narrativo com a premissa, segundo o bom senso de quem entende do tema? Se parecer um paradoxo sem sentido, REFAÇA o texto. SÓ DEPOIS escreva o "text". O ataque DEVE bater EXATAMENTE com a falácia declarada E ser contextualmente coerente — as duas coisas são inegociáveis.

ESTRUTURA A GERAR:

▸ FASE 1 — "phase1": array de EXATAMENTE 3 objetos. Cada objeto:
  - "logical_verification": (raciocínio interno, 1 frase) a falácia escolhida + checagem de coerência: a premissa leva à conclusão sem paradoxo, respeitando o bom senso do tema?
  - "text": afirmação ARROGANTE e ENGRAÇADA do MECHA-LOGIC sobre o tema, NO MÁXIMO 2-3 frases CURTAS (use memes/clichês populares do tema), que comete EXATAMENTE a falácia de "fallacy". Lógica 100% precisa, embalagem cômica.
  - "fallacy": o nome EXATO da falácia cometida no "text". ⚠️ DEVE ser uma das de ABERTURA (${OPENING_FALLACIES.map(f => `"${f}"`).join(', ')}). NUNCA Ataque Pessoal nem Espantalho aqui.
  - "options": array de EXATAMENTE 4 nomes de falácias do catálogo — DEVE incluir o valor de "fallacy" e mais 3 distratores plausíveis (os distratores PODEM incluir Ataque Pessoal/Espantalho). Embaralhe a ordem.
  As 3 falácias corretas das 3 rodadas devem ser DIFERENTES entre si.

▸ FASE 2 — "phase2": array de EXATAMENTE 3 objetos. Cada objeto:
  - "logical_verification": (raciocínio interno, 1 frase) a falácia escolhida + checagem de coerência: a premissa leva à conclusão sem paradoxo, respeitando o bom senso do tema?
  - "text": argumento capcioso e ZOEIRO do MECHA-LOGIC sobre o tema, NO MÁXIMO 2-3 frases CURTAS (memes/clichês do tema), que comete a falácia de "boss_fallacy" de forma sutil mas logicamente precisa.
  - "boss_fallacy": o nome EXATO da falácia cometida. ⚠️ DEVE ser uma das de ABERTURA (${OPENING_FALLACIES.map(f => `"${f}"`).join(', ')}). NUNCA Ataque Pessoal nem Espantalho aqui.
  - "options": array de EXATAMENTE 3 réplicas possíveis do jogador. Cada réplica:
      • "card_type_bound": "fallacy" (aponta a falácia), "data" (exige dados/fonte) ou "counter" (contra-argumenta).
      • "text_content": a frase da réplica (1-2 frases, com vocabulário do tema).
      • "is_correct": true para EXATAMENTE UMA das 3 (a réplica logicamente superior que desmonta o argumento sem cometer nova falácia); false para as outras 2 (distratores plausíveis que cometem erro lógico ou são fracos).
      • "boss_damage": se correta, 20-25; se incorreta, 0.
      • "player_damage": se correta, 0; se incorreta, 12-18.
      • "feedback_text": 1 frase SIMPLES e DIRETA que explica o erro lógico para o estudante (linguagem clara, SEM academiquês), com um toque leve de zoeira temática. Ensine de verdade, mas rápido. Ex: "Boa — correlação não é causa: o Boss confundiu coincidência com motivo, igual quem culpa a camisa nova pela derrota do time."

▸ FASE 3 — "phase3_context": string CURTA (2-3 frases) com um desafio do Boss Final que cruza o tema "${themeText}" com uma pergunta instigante (um "e se...", um dilema ou uma provocação), usando clichês/memes do tema. Tom arrogante e divertido, NUNCA um textão acadêmico — provoca o jogador a pensar e responder rápido.

⚠️ OBRIGATÓRIO: "phase1" e "phase2" DEVEM ter exatamente 3 objetos CADA (não menos). Mantenha o "logical_verification" curto para não estourar o espaço — o importante é completar as 3+3 rodadas e o phase3_context.

Retorne APENAS este JSON válido (sem markdown, sem comentários):
{
  "phase1": [ { "logical_verification": "...", "text": "...", "fallacy": "...", "options": ["...","...","...","..."] } ],
  "phase2": [ { "logical_verification": "...", "text": "...", "boss_fallacy": "...", "options": [ { "card_type_bound": "...", "text_content": "...", "is_correct": true, "boss_damage": 22, "player_damage": 0, "feedback_text": "..." } ] } ],
  "phase3_context": "..."
}`;
}

// ─── Arena MOCK (modo de teste — ZERO chamadas ao Groq, ZERO tokens) ──────────
// Ativado por MOCK_ARENA=1 no ambiente OU pelo body { mock: true }. Serve uma arena
// estática real (server/mockArena.json) — capture uma geração de qualidade, cole o
// arena_data lá e teste o fluxo (boss-attack, Modal Flash, Fases, frontend) à vontade
// sem gastar cota. Passa por repairArena igual à real. Fallback gerado por tema se o
// arquivo não existir.
// Carrega o JSON estático uma vez no startup (sem _comment).
let MOCK_ARENA_FILE = null;
try {
  MOCK_ARENA_FILE = JSON.parse(readFileSync(new URL('./mockArena.json', import.meta.url)));
  delete MOCK_ARENA_FILE._comment;
} catch (e) {
  console.warn('mockArena.json não encontrado/inválido — usando mock gerado por tema.', e.message);
}

function getMockArena(themeText) {
  // Clona o arquivo estático (repairArena muta) ou cai no gerador por tema.
  if (MOCK_ARENA_FILE) return JSON.parse(JSON.stringify(MOCK_ARENA_FILE));
  return buildMockArena(themeText);
}

function buildMockArena(themeText) {
  const t = themeText || 'o tema';
  return {
    phase1: [
      {
        text: `[MOCK] Joguei uma partida de ${t} e perdi, então é ÓBVIO que ${t} é furado e não presta pra ninguém.`,
        fallacy: 'Generalização Apressada',
        options: ['Generalização Apressada', 'Apelo à Autoridade Indevida', 'Falsa Dicotomia', 'Bola de Neve'],
      },
      {
        text: `[MOCK] Um famoso influenciador disse que entende tudo de ${t}, então qualquer coisa que ele afirmar sobre o assunto é verdade absoluta.`,
        fallacy: 'Apelo à Autoridade Indevida',
        options: ['Apelo à Autoridade Indevida', 'Causa Falsa', 'Espantalho', 'Raciocínio Circular'],
      },
      {
        text: `[MOCK] Ou você ama ${t} incondicionalmente, ou você odeia e quer destruir tudo. Não existe meio-termo.`,
        fallacy: 'Falsa Dicotomia',
        options: ['Falsa Dicotomia', 'Apelo à Emoção', 'Generalização Apressada', 'Ataque Pessoal'],
      },
    ],
    phase2: [
      {
        text: `[MOCK] Desde que mudaram algo em ${t}, tudo piorou. Logo, essa mudança é a causa de todos os problemas.`,
        boss_fallacy: 'Causa Falsa',
        options: [
          { card_type_bound: 'data', text_content: `Que evidência liga diretamente a mudança ao problema, e não apenas uma coincidência no tempo?`, is_correct: true, boss_damage: 22, player_damage: 0, feedback_text: 'Boa — você cobrou a prova do nexo causal; coincidência no tempo não é causa.' },
          { card_type_bound: 'fallacy', text_content: `Você nem entende de ${t}, então sua opinião não conta.`, is_correct: false, boss_damage: 0, player_damage: 15, feedback_text: 'Isso é Ataque Pessoal — não refuta o argumento, ataca quem fala.' },
          { card_type_bound: 'counter', text_content: `Concordo, ${t} virou um lixo total mesmo.`, is_correct: false, boss_damage: 0, player_damage: 12, feedback_text: 'Você aceitou a falácia em vez de questionar o nexo causal.' },
        ],
      },
      {
        text: `[MOCK] Se deixarem ${t} mudar um detalhe pequeno, logo vira o caos e em pouco tempo ${t} deixa de existir.`,
        boss_fallacy: 'Bola de Neve',
        options: [
          { card_type_bound: 'fallacy', text_content: `Isso é Bola de Neve: um passo pequeno não leva inevitavelmente à catástrofe sem provar cada elo.`, is_correct: true, boss_damage: 23, player_damage: 0, feedback_text: 'Correto — você exigiu o nexo entre os passos da catástrofe anunciada.' },
          { card_type_bound: 'data', text_content: `Cite a fonte que prova o caos.`, is_correct: false, boss_damage: 0, player_damage: 13, feedback_text: 'Pedir fonte é válido, mas o erro central é lógico (Bola de Neve), não factual.' },
          { card_type_bound: 'counter', text_content: `Nenhuma mudança em ${t} jamais teve qualquer efeito.`, is_correct: false, boss_damage: 0, player_damage: 14, feedback_text: 'Negação absoluta é tão frágil quanto o exagero do Boss.' },
        ],
      },
      {
        text: `[MOCK] ${t} é simplesmente o melhor que existe — e a prova disso é que nada nunca vai superar ${t}. Óbvio, né?`,
        boss_fallacy: 'Raciocínio Circular',
        options: [
          { card_type_bound: 'fallacy', text_content: `Isso é Raciocínio Circular: a conclusão ("é o melhor") já está embutida na premissa — não prova nada.`, is_correct: true, boss_damage: 12, player_damage: 0, feedback_text: 'Correto — o argumento gira em círculo: usa a própria conclusão como prova.' },
          { card_type_bound: 'data', text_content: `Qual critério OBJETIVO mede esse "melhor"?`, is_correct: false, boss_damage: 0, player_damage: 13, feedback_text: 'Boa pergunta, mas o erro central é a circularidade, não a falta de dado.' },
          { card_type_bound: 'counter', text_content: `Concordo, ${t} é insuperável mesmo.`, is_correct: false, boss_damage: 0, player_damage: 14, feedback_text: 'Você aceitou a premissa circular em vez de quebrá-la.' },
        ],
      },
    ],
    phase3_context: `[MOCK] Então você acha que entende de ${t}? Me prove com lógica de verdade: e se tudo que você considera "certo" em ${t} for só hábito disfarçado de razão? Defenda sua tese — se conseguir.`,
  };
}

// Repara invariantes que o LLM às vezes viola — garante mecânica de jogo consistente.
// Também DESCARTA o campo logical_verification (Chain-of-Thought interno da IA) para
// manter o payload limpo e performático: ele nunca chega ao banco nem ao frontend.
function repairArena(arena, themeText = 'o tema') {
  // Normaliza a contagem: exatamente 3 ataques por fase (a IA às vezes gera 4+).
  arena.phase1 = arena.phase1.slice(0, 3);
  arena.phase2 = arena.phase2.slice(0, 3);

  // ── Rede de segurança ANTI-FALÁCIA-REATIVA na abertura ────────────────────
  // Se a IA ignorou a regra e usou Ataque Pessoal/Espantalho como falácia cometida
  // numa abertura (Fases 1/2), troca o ataque inteiro por uma abertura COERENTE do
  // pool interno (theme-interpolado), com falácia ainda não usada naquela fase.
  const fb = buildMockArena(themeText);
  const pickFallback = (pool, used, key) => {
    const cand = pool.find(f => !used.has(f[key]));
    return cand || pool[0];
  };
  {
    const used = new Set();
    arena.phase1.forEach(a => { if (a?.fallacy && !REACTIVE_FALLACIES.includes(a.fallacy)) used.add(a.fallacy); });
    arena.phase1 = arena.phase1.map(a => {
      if (!a?.fallacy || REACTIVE_FALLACIES.includes(a.fallacy)) {
        const repl = pickFallback(fb.phase1, used, 'fallacy');
        used.add(repl.fallacy);
        console.warn(`[arena] Fase 1: falácia reativa "${a?.fallacy}" trocada por "${repl.fallacy}" (abertura coerente).`);
        return { ...repl };
      }
      return a;
    });
  }
  {
    const used = new Set();
    arena.phase2.forEach(a => { if (a?.boss_fallacy && !REACTIVE_FALLACIES.includes(a.boss_fallacy)) used.add(a.boss_fallacy); });
    arena.phase2 = arena.phase2.map(a => {
      if (!a?.boss_fallacy || REACTIVE_FALLACIES.includes(a.boss_fallacy)) {
        const repl = pickFallback(fb.phase2, used, 'boss_fallacy');
        used.add(repl.boss_fallacy);
        console.warn(`[arena] Fase 2: falácia reativa "${a?.boss_fallacy}" trocada por "${repl.boss_fallacy}" (abertura coerente).`);
        return { ...repl };
      }
      return a;
    });
  }

  // Fase 1: garante que options contenha a falácia correta e tenha 4 itens.
  arena.phase1 = arena.phase1.map(a => {
    const { logical_verification, ...rest } = a; // eslint-disable-line no-unused-vars
    let opts = Array.from(new Set(rest.options.filter(Boolean)));
    if (!opts.some(o => o.toLowerCase() === rest.fallacy.toLowerCase())) opts.unshift(rest.fallacy);
    // Completa com distratores do catálogo se faltar; corta em 4.
    for (const f of FALLACY_NAMES) { if (opts.length >= 4) break; if (!opts.includes(f)) opts.push(f); }
    opts = opts.slice(0, 4).sort(() => Math.random() - 0.5);
    return { ...rest, options: opts };
  });

  // Fase 2: força EXATAMENTE uma opção correta + normaliza danos (determinismo seguro).
  arena.phase2 = arena.phase2.map(a => {
    const { logical_verification, ...rest } = a; // eslint-disable-line no-unused-vars
    const opts = rest.options.slice(0, 3).map(o => ({ ...o }));
    let correct = opts.filter(o => o.is_correct);
    if (correct.length !== 1) {
      // Elege a de maior boss_damage como correta; zera as demais.
      const best = opts.reduce((m, o) => (o.boss_damage > (m?.boss_damage ?? -1) ? o : m), null) || opts[0];
      opts.forEach(o => { o.is_correct = (o === best); });
    }
    opts.forEach(o => {
      if (o.is_correct) {
        // Orçamento de HP: 12 por acerto (Fase 2). Boss só zera em run perfeito.
        o.boss_damage   = 12;
        o.player_damage = 0;
      } else {
        o.boss_damage   = 0;
        o.player_damage = Math.min(18, Math.max(12, o.player_damage || 15));
      }
    });
    return { ...rest, options: opts };
  });

  // Embaralha a ORDEM dos ataques dentro de cada fase: cada partida tem uma
  // sequência de falácias diferente (o jogador não decora a ordem).
  arena.phase1.sort(() => Math.random() - 0.5);
  arena.phase2.sort(() => Math.random() - 0.5);

  return arena;
}

app.post('/api/battle/generate-arena', async (req, res) => {
  const themeText = String(req.body?.theme_text ?? '').trim().slice(0, 120);
  const userId    = parseInt(req.body?.user_id) || null;

  if (themeText.length < 2) {
    return res.status(400).json({ error: 'Tema muito curto. Digite ao menos 2 caracteres.' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'user_id obrigatório para gerar a arena.' });
  }
  if (isBlocked(themeText)) {
    return res.status(400).json({ error: 'Tema bloqueado pelas diretrizes de conteúdo.' });
  }

  // ── MODO MOCK: pula o Groq por completo (0 tokens) ─────────────────────────
  // Ativado por MOCK_ARENA=1 no .env OU pelo body { mock: true } na requisição.
  // Útil para testar o fluxo do jogo sem consumir a cota da API.
  if (process.env.MOCK_ARENA === '1' || req.body?.mock === true) {
    try {
      const arena = repairArena(getMockArena(themeText), themeText);
      await pool.query(
        `UPDATE user_stats
           SET arena_data = $1, arena_theme = $2,
               current_expected_option = NULL,
               current_boss_hp = 100, current_player_hp = 100
         WHERE user_id = $3`,
        [JSON.stringify(arena), themeText, userId]
      );
      return res.json({ ok: true, theme: themeText, turns: 9, mock: true });
    } catch (error) {
      console.error('Erro ao gerar arena MOCK:', error);
      return res.status(500).json({ error: 'Falha ao gerar arena mock.' });
    }
  }

  try {
    // Retry: a IA ocasionalmente devolve JSON fora do schema (texto curto, contagem
    // errada). Tentamos até 3 vezes antes de desistir — a variância da temperatura
    // costuma resolver na 2ª tentativa. Log detalhado das issues para diagnóstico.
    let parsed = null;
    let lastIssues = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let content, usedProvider;
      try {
        const out = await generateLLMJson(buildArenaPrompt(themeText), {
          maxTokens: 8000, // headroom p/ Chain-of-Thought + voz humorística sem truncar
          temperature: 0.8, // rigor de classificação > criatividade solta
          timeout: 40000,
        });
        content = out.text; usedProvider = out.provider;
      } catch (e) {
        // Erro transitório (ex: 503 "high demand" do Gemini, rede) OU cota dupla.
        // NÃO desiste: usa as tentativas restantes com um pequeno backoff — picos
        // de demanda costumam passar em segundos.
        lastIssues = e.message;
        console.error(`Arena tentativa ${attempt}: provedor indisponível — ${String(e.message).slice(0, 120)}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1200));
        continue;
      }

      let raw;
      try {
        raw = JSON.parse(content || '{}');
      } catch {
        lastIssues = 'JSON.parse falhou (resposta truncada?)';
        console.error(`Arena tentativa ${attempt} (${usedProvider}): ${lastIssues}`);
        continue;
      }

      const result = arenaSchema.safeParse(raw);
      if (result.success) { parsed = result; break; }
      lastIssues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).slice(0, 6);
      console.error(`Arena tentativa ${attempt} (${usedProvider}) fora do schema:`, lastIssues);
    }

    if (!parsed) {
      return res.status(502).json({
        error: 'A IA gerou uma arena inválida após 3 tentativas. Tente um tema um pouco mais simples ou tente novamente.',
      });
    }

    const arena = repairArena(parsed.data, themeText);

    // Persiste a arena + reseta HP e gabarito para um duelo limpo.
    await pool.query(
      `UPDATE user_stats
         SET arena_data = $1, arena_theme = $2,
             current_expected_option = NULL,
             current_boss_hp = 100, current_player_hp = 100
       WHERE user_id = $3`,
      [JSON.stringify(arena), themeText, userId]
    );

    // Libera o jogo: o cliente só precisa saber que a arena está pronta.
    res.json({ ok: true, theme: themeText, turns: 9 });
  } catch (error) {
    console.error('Erro ao gerar arena:', error);
    res.status(500).json({ error: 'Falha na geração da arena. Verifique a conexão e tente novamente.' });
  }
});

// ─── Boss Attack endpoint (loop invertido — Boss ataca primeiro) ──────────────
// Agora SERVE a arena pré-gerada (arena_data) por índice de turno → latência <20ms.
// Fase 1: devolve as opções de falácia + o gabarito `fallacy` (validação determinística no front→back).
// Fase 2: Modal Flash. Devolve 3 opções SEM is_correct/dano/feedback (integridade acadêmica);
//         o gabarito da opção correta é gravado em user_stats.current_expected_option no servidor.
// Fase 3: o contexto socrático gerado para o tema (a réplica é avaliada por Groq ao vivo).
app.get('/api/battle/boss-attack', async (req, res) => {
  const phase   = parseInt(req.query.phase) || 1;
  const themeId = req.query.theme || '';
  const userId  = parseInt(req.query.user_id) || null;
  const turn    = parseInt(req.query.turn) || 0;
  const idx     = ((turn % 3) + 3) % 3; // índice 0..2 do ataque dentro da fase

  // Carrega a arena pré-gerada do jogador (fonte primária).
  let arena = null;
  if (userId) {
    try {
      const r = await pool.query('SELECT arena_data FROM user_stats WHERE user_id = $1', [userId]);
      arena = r.rows[0]?.arena_data ?? null;
    } catch (e) {
      console.error('Erro ao ler arena_data:', e);
    }
  }

  if (arena) {
    // FASE 1 — ataque indexado + gabarito de falácia.
    if (phase === 1) {
      const a = arena.phase1?.[idx] || arena.phase1?.[0];
      if (a) return res.json({ text: a.text, fallacy: a.fallacy, options: a.options, phase, theme: themeId });
    }

    // FASE 2 — Modal Flash a partir da arena: embaralha, oculta gabarito, persiste correto.
    if (phase === 2) {
      const a = arena.phase2?.[idx] || arena.phase2?.[0];
      if (a && Array.isArray(a.options)) {
        const withIds  = a.options.map((o, i) => ({ ...o, option_id: `opt_${i}` }));
        const shuffled = [...withIds].sort(() => Math.random() - 0.5);
        const correct  = { ...withIds.find(o => o.is_correct), boss_fallacy: a.boss_fallacy ?? null };

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

        const publicOptions = shuffled.map(o => ({
          option_id: o.option_id,
          card_type_bound: o.card_type_bound,
          text_content: o.text_content,
        }));
        return res.json({ text: a.text, phase, theme: themeId, options: publicOptions });
      }
    }

    // FASE 3 — contexto socrático gerado para o tema.
    if (phase === 3 && arena.phase3_context) {
      return res.json({ text: arena.phase3_context, phase, theme: themeId });
    }
  }

  // ── Fallback (arena ausente): conteúdo estático legado ─────────────────────
  const themeMap = THEME_ATTACKS[themeId] || DEFAULT_ATTACKS;
  const attacks  = themeMap[phase] || themeMap[1] || DEFAULT_ATTACKS[1];
  const attack   = attacks[idx % attacks.length] || attacks[0];

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
  const { userArgument, user_id, cardType, responseTimeMs, game_phase, theme_id, theme_text, selected_logic, selected_target, correct_fallacy, selected_option_id } = parsedReq.data;

  // Tema agora é texto livre: usa o label legado se bater um id antigo, senão o próprio texto.
  const themeLabel = THEME_LABELS[theme_id] || theme_text || theme_id || null;
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
          boss_damage: 12, player_damage: 0, critical_hit: false,
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

  // ── MODO MOCK: Fase 3 sem Groq (0 tokens) ──────────────────────────────────
  // Avalia de forma simplista: gibberish curto → punição; senão pontua razoável.
  if (process.env.MOCK_ARENA === '1') {
    const words = userArgument.trim().split(/\s+/).filter(Boolean);
    const looksValid = words.length >= 6 && userArgument.trim().length >= 25;
    const gameData = looksValid
      ? {
          boss_damage: 14, player_damage: 0, critical_hit: true,
          reply: '[MOCK] Argumento aceito pelo simulador. Estrutura coerente — o Boss real seria mais cruel.',
          feedback: '[MOCK] Avaliação simulada: claim/data/warrant razoáveis. Sem chamada de IA.',
          toulmin_score: { claim: 2, data: 2, warrant: 2 },
          fallacy_detected: null, play_valid: true,
        }
      : {
          boss_damage: 0, player_damage: 25, critical_hit: false,
          reply: '[MOCK] Isso foi curto demais pra ser um argumento. Tente algo com nexo.',
          feedback: '[MOCK] Avaliação simulada: texto raso/incoerente.',
          toulmin_score: { claim: 0, data: 0, warrant: 0 },
          fallacy_detected: null, play_valid: false,
        };
    return applyOutcomeAndRespond(res, { user_id, userArgument, cardType, responseTimeMs, phase, gameData });
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
    // Injeta o contexto socrático que a arena gerou para ESTE tema (Fase 3 viva).
    let arenaCtx = '';
    if (user_id) {
      try {
        const r = await pool.query('SELECT arena_data FROM user_stats WHERE user_id = $1', [user_id]);
        const ctxText = r.rows[0]?.arena_data?.phase3_context;
        if (ctxText) arenaCtx = `\nCONTEXTO DO BOSS FINAL (provocação socrática já lançada ao jogador): "${ctxText}"\nAvalie a réplica do jogador como resposta a essa provocação, dentro do tema.\n`;
      } catch (e) {
        console.error('Erro ao ler phase3_context:', e);
      }
    }
    basePrompt = basePrompt.replace(
      'Retorne APENAS este JSON válido (sem markdown):',
      `${arenaCtx}REGRA ANTI-LIXO (FASE 3): Se o argumento for incompreensível, vazio de conteúdo, ou claramente não for um argumento real (ex: "asdfjkl", "blá blá", frases sem sentido), retorne play_valid=false, boss_damage=0, player_damage=25, e explique no feedback por que não é um argumento válido.\n\nRetorne APENAS este JSON válido (sem markdown):`
    );
  }

  // Enriquece o prompt com as escolhas estruturadas da Fase 2 (dropdowns)
  let structuredContext = '';
  if (selected_logic)  structuredContext += `\nFalácia escolhida pelo jogador: "${selected_logic}"`;
  if (selected_target) structuredContext += `\nTrecho alvo escolhido: "${selected_target}"`;

  const prompt = `${basePrompt}${structuredContext}\n\nArgumento do desafiante: "${userArgument}"`;

  try {
    // Fallback Groq ⇄ Gemini: se um provedor estiver no limite, usa o outro.
    const { text: content } = await generateLLMJson(prompt, {
      maxTokens: 1024, temperature: 0.7, timeout: 15000,
    });

    let gameData;
    const fallback = {
      boss_damage: 0, player_damage: 0, reply: 'ERRO DE PARSE.',
      feedback: 'IA retornou um resultado inválido. Tente reformular seu argumento.',
      critical_hit: false, toulmin_score: { claim: 0, data: 0, warrant: 0 },
      fallacy_detected: null, play_valid: null,
    };
    try {
      const raw = JSON.parse(content || '{}');
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
    } else if (phase === 3 && gameData.boss_damage > 0) {
      // Orçamento de HP: cada acerto da Fase 3 vale 14 (2 rounds = 28). Assim, com
      // Fase 1 (12×3=36) + Fase 2 (12×3=36) + Fase 3 (14×2=28) = 100, o boss só
      // zera num run PERFEITO. O dano do LLM é cosmético; o Toulmin é o que conta.
      gameData.boss_damage = 14;
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
