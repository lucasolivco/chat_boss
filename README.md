# ChatBoss

Jogo de debate lógico onde o jogador argumenta contra uma IA "boss" chamada **MECHA-LOGIC**. A IA avalia argumentos usando o modelo de Toulmin, detecta falácias lógicas e responde com cálculos de dano, réplicas sarcásticas e feedback pedagógico. Jogadores ganham títulos e competem em um ranking global.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + Vite 7 |
| Backend | Express 5 (ES Modules) |
| Banco de dados | PostgreSQL 16 (Docker) |
| IA | Groq — LLaMA 3.3-70b-versatile |
| Ícones | Lucide React |
| Fontes | Orbitron, JetBrains Mono, Share Tech Mono |

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) v18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (para o PostgreSQL)
- [ngrok](https://ngrok.com/download) (opcional, para acesso externo)
- Chave de API Groq: [console.groq.com](https://console.groq.com)

---

## Instalação

### 1. Clone o repositório

```bash
git clone <url-do-repo>
cd CB
```

### 2. Configure as variáveis de ambiente

**Servidor:**
```bash
cp server/.env.example server/.env
# Edite server/.env e preencha GROQ_API_KEY
```

**Cliente** (não obrigatório — a URL da API é resolvida automaticamente):
```bash
cp client/.env.example client/.env
```

### 3. Instale as dependências

```bash
cd server && npm install
cd ../client && npm install
```

---

## Como rodar

### Opção A — Script automático (Windows, recomendado)

Sobe servidor, cliente e ngrok de uma vez:

```powershell
.\start.ps1
```

A URL pública do ngrok aparece na janela que abre. Compartilhe com quem precisar acessar remotamente.

> **Nota:** O `start.ps1` usa o caminho local do ngrok. Se reinstalar o ngrok em outra máquina, atualize o caminho `$ngrok` no script.

---

### Opção B — Manual (todas as plataformas)

**Terminal 1 — Banco de dados (Docker):**
```bash
docker-compose up -d
```

**Terminal 2 — Servidor:**
```bash
cd server
npm start          # produção
npm run dev        # dev com auto-reload (node --watch)
```

**Terminal 3 — Cliente:**
```bash
cd client
npm run dev        # localhost apenas (http://localhost:5173)
npm run dev:host   # exposto na rede local (mostra IP no terminal)
```

---

### Acesso externo via ngrok (opcional)

Se precisar que pessoas fora da rede local acessem (ex: VPN, remoto):

```bash
ngrok http 5173
```

Copie a URL `Forwarding https://...` e compartilhe.

> O Vite proxy (`/api → localhost:3000`) garante que só um túnel é necessário.

---

## Estrutura do projeto

```
CB/
├── docker-compose.yml          # PostgreSQL 16
├── start.ps1                   # Script Windows para subir tudo + ngrok
│
├── client/                     # React 19 + Vite
│   ├── vite.config.js          # Proxy /api → :3000, porta 5173 fixa
│   ├── src/
│   │   ├── App.jsx             # Orquestrador principal (rotas de tela, estado do jogo)
│   │   ├── App.css             # Todo o CSS (intro, modais, jogo, ranking)
│   │   ├── components/
│   │   │   ├── IntroScreen.jsx # Tela inicial animada (efeito typewriter)
│   │   │   ├── AuthModal.jsx   # Login / Registro / Modo guest
│   │   │   ├── HowToPlay.jsx   # Modal: Como Jogar / Toulmin / Falácias
│   │   │   ├── BattleReport.jsx# Resultado da batalha
│   │   │   └── Ranking.jsx     # Top 10 leaderboard
│   │   └── lib/
│   │       └── personality.js  # Arquétipos do boss e lógica de personalidade
│   └── .env.example
│
└── server/                     # Express 5 (ES Modules)
    ├── server.js               # Todos os endpoints da API
    ├── db/
    │   ├── index.js            # Pool PostgreSQL (pg)
    │   ├── schema.sql          # Tabelas: users, battles, user_stats
    │   └── titles.js           # calcTitle(stats) — progressão de títulos
    └── .env.example
```

---

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Criar usuário (`username` + `password`) |
| POST | `/api/auth/login` | Login → retorna `user_id`, `username`, `title`, `stats` |
| POST | `/api/battle` | Executar turno de batalha, salvar no DB se `user_id` fornecido |
| GET | `/api/ranking` | Top 10 por dano total ao boss |
| GET | `/api/user/:id/stats` | Stats e título atual do usuário |

### Payload de batalha (`POST /api/battle`)

```json
{
  "userArgument": "texto do argumento",
  "user_id": 1,
  "won_battle": null
}
```

`won_battle` deve ser `null` durante turnos normais; `true` ou `false` apenas ao finalizar a partida.

### Resposta da IA

```json
{
  "boss_damage": 0-30,
  "player_damage": 0-25,
  "reply": "réplica sarcástica (máx 3 frases)",
  "feedback": "feedback pedagógico sobre o argumento",
  "critical_hit": true,
  "toulmin_score": { "claim": 0-3, "data": 0-3, "warrant": 0-3 },
  "fallacy_detected": "nome da falácia | null"
}
```

---

## Banco de dados

### Tabelas

**users** — `id`, `username` (único), `password_hash`, `created_at`

**battles** — histórico de cada turno com avaliação Toulmin completa

**user_stats** — estatísticas agregadas por usuário (atualizada após cada batalha)

### Progressão de títulos

| Título | Batalhas mín. | Win rate mín. |
|--------|---------------|---------------|
| Iniciante Lógico | 0 | — |
| Aprendiz Dialético | 3 | — |
| Refutador Funcional | 5 | 30% |
| Arquiteto de Argumentos | 10 | 50% |
| Mestre da Refutação | 20 | 70% |
| Juggernaut Lógico | 30 | 85% |

---

## Fluxo de telas

```
IntroScreen → AuthModal → Game
                 ↓               ↑↓
            (guest mode)    HowToPlay (modal)
                                 ↑↓
                            Ranking (modal)
                                 ↑↓
                           BattleReport (modal)
```

---

## Observações

- Auth sem JWT: `user_id` é enviado direto no body. Pode evoluir para JWT futuramente.
- Modo guest: batalhas rodam normalmente mas não são salvas no banco.
- O título é recalculado após cada batalha e atualizado em `user_stats`.
- O cliente usa proxy Vite para `/api` — não precisa configurar `VITE_API_URL` em desenvolvimento.
