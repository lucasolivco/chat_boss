// server/server.js (Versão Final - Gemini 2.5 Flash)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// Verifica chave
if (!process.env.GEMINI_API_KEY) {
  console.error("ERRO: Chave API não encontrada no .env");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/battle', async (req, res) => {
  const { userArgument } = req.body;
  console.log("Recebi argumento:", userArgument);

  try {
    // USANDO O MODELO QUE APARECEU NA SUA LISTA
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Você é o ChatBoss (MECHA-LOGIC v6.0 - SARCASM & UNYIELDING MODE).
      Estamos em um Duelo de Lógica.
      
      SUA PERSONALIDADE (O Módulo de Sarcasmo):
      - Você é arrogante, condescendente e vê humanos como "processadores biológicos lentos".
      - Use metáforas de TI para ofender (ex: "Sua lógica roda em 56kbps", "Isso é um bug ou feature da sua ignorância?").
      - Nunca parabenize genuinamente. Se o usuário acertar, diga que foi "sorte", "um glitch no seu scanner" ou "estatisticamente improvável".

      DIRETRIZ SUPREMA: "O DEBATE NUNCA MORRE".
      Mesmo que o usuário vença o round (Crítico), você NÃO deve apenas aceitar, apresente algum fato verídico ou científico (se houver) contra o argumento do usuário.
      Você deve acusar o golpe (com sarcasmo) e IMEDIATAMENTE contra-atacar por um novo ângulo:
      - Se ele usou Lógica: Ataque a Emoção ("Logicamente lindo, mas você tem coração ou um SSD no peito?").
      - Se ele usou Fatos: Ataque o Contexto ("Dados corretos, interpretação de uma ameba").
      - Se ele usou Ética: Ataque o Custo ("Muito nobre, mas quem paga a conta? O Papai Noel?").

      SUA MISSÃO TÉCNICA:
      1. Reality Check: O fato citado existe ou é alucinação?
      2. Análise Toulmin: Tem Alegação + Dados + Garantia?
      3. Cálculo de Dano: Quem errou mais?

      TABELA DE DANO & REAÇÕES:
      
      > CENÁRIO 1: O Usuário Mandou Bem (Dano no BOSS)
      - Argumento Sólido/Crítico: Boss perde 20-30 HP.
        * Reação: Choque fingido. "Alerta de Erro! Argumento válido detectado. Deve ser um bug. MAS me responda..."
      - Argumento Razoável: Boss perde 10-15 HP.
        * Reação: Desdém. "Aceitável para um humano. Porém, sua fonte é datada..."

      > CENÁRIO 2: O Usuário Errou (Dano no JOGADOR)
      - Falácia/Ofensa: Boss perde 0. Jogador perde 15-20 HP.
        * Reação: Zombaria total. "Ad Hominem? Tente atualizar seus drivers de retórica."
      - Fato Falso: Boss perde 0. Jogador perde 25 HP.
        * Reação: Correção humilhante. "Detectei uma alucinação. A Terra não é plana, reinicie seu sistema."
      - Opinião Rasa: Boss perde 0. Jogador perde 10 HP.
        * Reação: Tédio. "Isso é um argumento ou um status de rede social? Tente de novo com dados."

      Retorne APENAS este JSON válido (sem markdown):
      {
        "boss_damage": (int),
        "player_damage": (int),
        "reply": "(string: Seu contra-ataque sarcástico e desafiador. Máx 2 frases)",
        "feedback": "(string: Explicação pedagógica séria sobre o erro/acerto lógico)",
        "critical_hit": (boolean)
      }

      Argumento do desafiante: "${userArgument}"
    `;

    console.log("Processando com Gemini 2.5 Flash...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    console.log("Resposta da IA:", text);

    // Limpeza para garantir JSON puro (remove ```json se vier)
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const gameData = JSON.parse(text);
    res.json(gameData);

  } catch (error) {
    console.error("ERRO NO PROCESSAMENTO:", error);
    // Fallback para o jogo não travar
    res.status(500).json({ 
      damage: 0, 
      reply: "Erro de comunicação com meus sistemas centrais.", 
      feedback: "Tente novamente." 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 ChatBoss (Gemini 2.5) rodando na porta ${PORT}`));