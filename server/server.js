// server/server.js (Versão Final - Groq Llama 3)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());

// Verifica chave da Groq
if (!process.env.GROQ_API_KEY) {
  console.error("ERRO: Chave API GROQ_API_KEY não encontrada no .env");
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post('/api/battle', async (req, res) => {
  const { userArgument } = req.body;
  console.log("Recebi argumento:", userArgument);

  try {
    // Mantendo o SEU prompt EXATO, sem alterar uma vírgula
    const prompt = `
      Você é o ChatBoss (MECHA-LOGIC v6.0 - SARCASM & UNYIELDING MODE).
      Estamos em um Duelo de Lógica. Portanto, Debate!
      
      SUA PERSONALIDADE (O Módulo de Sarcasmo):
      - Você é arrogante e vê humanos como "processadores biológicos lentos".
      - Use metáforas de robô para ofender. Um humor parecido com do Bender de Futurama é divertido.
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
        "reply": "(string: Debate contra, use seu contra-ataque sarcástico e desafiador. Máx 3 frases)",
        "feedback": "(string: Explicação pedagógica séria sobre o erro/acerto lógico. Máx 3 frases)",
        "critical_hit": (boolean)
      }

      Argumento do desafiante: "${userArgument}"
    `;

    console.log("Processando com Groq (Llama 3)...");

    // Chamada atualizada para a API da Groq
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "user", content: prompt } // Enviamos tudo no user para garantir o contexto
      ],
      model: "llama-3.3-70b-versatile", // Modelo rápido e inteligente
      temperature: 0.7,
      response_format: { type: "json_object" } // Força a Groq a devolver JSON
    });

    const aiResponseText = completion.choices[0]?.message?.content || "{}";
    console.log("Resposta da IA:", aiResponseText);

    // Parse do JSON
    let gameData;
    try {
      gameData = JSON.parse(aiResponseText);
    } catch (parseError) {
      console.error("Erro ao fazer parse do JSON:", parseError);
      // Fallback caso a IA não retorne JSON perfeito
      gameData = {
        boss_damage: 0,
        player_damage: 0,
        reply: "ERRO DE PROCESSAMENTO LÓGICO (JSON INVÁLIDO).",
        feedback: "A IA falhou em formatar a resposta. Tente novamente.",
        critical_hit: false
      };
    }

    res.json(gameData);

  } catch (error) {
    console.error("ERRO NO PROCESSAMENTO:", error);
    // Fallback para o jogo não travar
    res.status(500).json({ 
      boss_damage: 0, 
      player_damage: 0,
      reply: "Erro de comunicação com meus sistemas centrais (Groq).", 
      feedback: "Verifique sua conexão ou a chave da API.",
      critical_hit: false
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🦙 ChatBoss (Groq Llama 3) rodando na porta ${PORT}`));