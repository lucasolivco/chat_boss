// server/teste-modelos.js
require('dotenv').config();

async function listarModelos() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log("❌ Nenhuma chave encontrada no .env");
    return;
  }

  console.log("🔍 Consultando API do Google com sua chave...");
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("❌ Erro na API:", data.error.message);
    } else if (data.models) {
      console.log("✅ SUCESSO! Modelos disponíveis para você:");
      console.log("------------------------------------------------");
      data.models.forEach(model => {
        // Filtra apenas os modelos que geram conteúdo (chat)
        if (model.supportedGenerationMethods.includes("generateContent")) {
          console.log(`MODELO: ${model.name.replace('models/', '')}`);
        }
      });
      console.log("------------------------------------------------");
      console.log("👉 Copie um dos nomes acima e coloque no server.js");
    } else {
      console.log("⚠️ Resposta estranha:", data);
    }
  } catch (error) {
    console.error("❌ Erro de conexão:", error);
  }
}

listarModelos();