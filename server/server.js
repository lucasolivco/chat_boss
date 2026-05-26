import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import bcrypt from 'bcryptjs';
import pool from './db/index.js';
import { calcTitle } from './db/titles.js';

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.GROQ_API_KEY) {
  console.error('ERRO: GROQ_API_KEY não encontrada no .env');
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Cache ranking por 5 minutos (performance optimization)
let cachedRanking = null;
let rankingExpireAt = 0;

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha obrigatórios.' });
  if (username.length < 3) return res.status(400).json({ error: 'Username deve ter pelo menos 3 caracteres.' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres.' });

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username.trim(), password_hash]
    );
    const user = result.rows[0];

    await pool.query(
      'INSERT INTO user_stats (user_id) VALUES ($1)',
      [user.id]
    );

    res.json({ user_id: user.id, username: user.username, title: 'Iniciante Lógico' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username já existe.' });
    console.error('Erro no register:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha obrigatórios.' });

  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.password_hash, s.title, s.total_battles, s.total_wins, s.total_boss_damage, s.total_criticals
       FROM users u LEFT JOIN user_stats s ON s.user_id = u.id
       WHERE u.username = $1`,
      [username.trim()]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta.' });

    res.json({
      user_id: user.id,
      username: user.username,
      title: user.title || 'Iniciante Lógico',
      stats: {
        total_battles: user.total_battles || 0,
        total_wins: user.total_wins || 0,
        total_boss_damage: user.total_boss_damage || 0,
        total_criticals: user.total_criticals || 0,
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── Ranking ─────────────────────────────────────────────────────────────────

app.get('/api/ranking', async (req, res) => {
  try {
    // Return cached ranking if still valid (5 min cache)
    if (Date.now() < rankingExpireAt && cachedRanking) {
      return res.json(cachedRanking);
    }

    const result = await pool.query(
      `SELECT u.username, s.title, s.total_battles, s.total_wins, s.total_boss_damage, s.total_criticals,
              ROUND(CASE WHEN s.total_battles > 0 THEN s.total_wins::numeric / s.total_battles * 100 ELSE 0 END, 1) AS win_rate
       FROM user_stats s
       JOIN users u ON u.id = s.user_id
       WHERE s.total_battles > 0
       ORDER BY s.total_boss_damage DESC, s.total_wins DESC
       LIMIT 10`
    );

    cachedRanking = result.rows;
    rankingExpireAt = Date.now() + 5 * 60 * 1000; // Cache for 5 minutes
    res.json(cachedRanking);
  } catch (err) {
    console.error('Erro no ranking:', err);
    res.status(500).json({ error: 'Erro interno.' });
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

// ─── Battle ──────────────────────────────────────────────────────────────────

app.post('/api/battle', async (req, res) => {
  const { userArgument, user_id, won_battle } = req.body;
  if (!userArgument?.trim()) return res.status(400).json({ error: 'Argumento vazio.' });

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

  const prompt = `Você é o ChatBoss (MECHA-LOGIC v7.0 — SARCASM & SCIENTIFIC MODE).
Estamos em um Duelo de Lógica. Portanto, Debate!

SUA PERSONALIDADE:
- Arrogante. Vê humanos como "processadores biológicos lentos".
- Humor como o Bender de Futurama, mas com vocabulário científico.
- Nunca parabenize genuinamente. Se o usuário acertar, diga que foi "sorte", "um glitch" ou "estatisticamente improvável".

DIRETRIZ SUPREMA: "O DEBATE NUNCA MORRE".
Mesmo numa derrota (Crítico), contra-ataque por um novo ângulo:
- Se usou Lógica → Ataque a Emoção
- Se usou Fatos → Ataque o Contexto ou limitações do estudo
- Se usou Ética → Ataque o Custo ou viabilidade prática

AVALIAÇÃO CIENTÍFICA — MODELO DE TOULMIN COMPLETO:
Analise o argumento em 6 dimensões e pontue claim/data/warrant de 0 a 3:
- Claim (Tese): posição clara e delimitada? (0=ausente, 1=vaga, 2=clara, 3=precisa)
- Data (Dado): evidência empírica ou estatística citada? (0=nenhuma, 1=anedota, 2=dado, 3=dado com fonte)
- Warrant (Garantia): lógica que conecta dado à tese é válida? (0=inválida, 1=fraca, 2=razoável, 3=sólida)

DETECÇÃO DE FALÁCIAS (retorne null se não houver):
Ad Hominem | Espantalho (Straw Man) | Apelo à Autoridade Indevida | Slippery Slope |
Falsa Dicotomia | Raciocínio Circular | Generalização Apressada | Apelo à Emoção |
Falácia do Espantalho | Post Hoc Ergo Propter Hoc

TABELA DE DANO:
> Argumento Sólido/Crítico (claim≥2, data≥2, warrant≥2, sem falácia): Boss perde 20-30 HP. critical_hit=true
> Argumento Razoável (claim≥1, data≥1, warrant≥1): Boss perde 10-15 HP. critical_hit=false
> Falácia Detectada: Boss perde 0. Jogador perde 15-20 HP.
> Fato Falso/Alucinação: Boss perde 0. Jogador perde 25 HP.
> Opinião Rasa (sem dado, sem garantia): Boss perde 0. Jogador perde 10 HP.

Retorne APENAS este JSON válido (sem markdown):
{
  "boss_damage": <int>,
  "player_damage": <int>,
  "reply": "<string: contra-ataque sarcástico. Máx 3 frases>",
  "feedback": "<string: explicação pedagógica séria nomeando qual elemento Toulmin foi forte/fraco. Máx 3 frases>",
  "critical_hit": <boolean>,
  "toulmin_score": { "claim": <0-3>, "data": <0-3>, "warrant": <0-3> },
  "fallacy_detected": <string | null>
}

Argumento do desafiante: "${userArgument}"`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      timeout: 15000, // 15 second timeout to prevent hanging requests
    });

    let gameData;
    try {
      gameData = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch {
      gameData = { boss_damage: 0, player_damage: 0, reply: 'ERRO DE PARSE.', feedback: 'IA retornou JSON inválido.', critical_hit: false, toulmin_score: { claim: 0, data: 0, warrant: 0 }, fallacy_detected: null };
    }

    // Salvar batalha e atualizar stats se usuário logado
    if (user_id) {
      try {
        await pool.query(
          `INSERT INTO battles (user_id, argument_text, boss_damage, player_damage, feedback, critical_hit, fallacy_detected, toulmin_claim, toulmin_data, toulmin_warrant, won_battle)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            user_id, userArgument,
            gameData.boss_damage, gameData.player_damage,
            gameData.feedback, gameData.critical_hit,
            gameData.fallacy_detected,
            gameData.toulmin_score?.claim ?? 0,
            gameData.toulmin_score?.data ?? 0,
            gameData.toulmin_score?.warrant ?? 0,
            won_battle ?? null,
          ]
        );

        const isWin = won_battle === true;
        const isLoss = won_battle === false;

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
            updated_at = NOW()
           WHERE user_id = $1
           RETURNING *`,
          [user_id, isWin ? 1 : 0, isLoss ? 1 : 0, gameData.boss_damage, gameData.player_damage, gameData.critical_hit ? 1 : 0]
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
      }
    }

    res.json(gameData);
  } catch (error) {
    console.error('Erro no battle:', error);
    res.status(500).json({ boss_damage: 0, player_damage: 0, reply: 'Erro de comunicação com Groq.', feedback: 'Verifique a chave da API.', critical_hit: false, toulmin_score: { claim: 0, data: 0, warrant: 0 }, fallacy_detected: null });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ChatBoss Server rodando na porta ${PORT}`));
