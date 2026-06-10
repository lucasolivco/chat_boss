# ChatBoss — Jogo de Combate Argumentativo

> **Trabalho de Conclusão de Curso** — Ferramenta pedagógica para desenvolvimento de pensamento crítico via gamificação de combate argumentativo.

ChatBoss é um jogo de duelo lógico contra **MECHA-LOGIC**, uma IA antagonista que avalia argumentos pelo Modelo de Toulmin, detecta falácias e responde com contra-ataques sarcásticos. O jogador deve construir argumentos estruturados para vencer — a IA nunca entrega respostas prontas.

> **Avaliação pré/pós-teste** é realizada externamente via formulário (Google Forms ou equivalente). A aplicação coleta métricas de comportamento em jogo; a correlação com o teste externo é feita na análise estatística do TCC.

---

## Por que este projeto existe

A IA atual acostuma estudantes a consumir respostas passivamente, eliminando o esforço cognitivo. ChatBoss inverte essa lógica: a IA é o **adversário**, não o assistente. Vencer exige raciocínio ativo, estruturação de argumentos e identificação de falácias.

---

## Pilares Teóricos

| Teoria | Aplicação no jogo |
|---|---|
| **Vygotsky — ZPD / Scaffolding** | As cartas do Baralho Lógico fornecem andaimes estruturais (templates de lacunas) sem dar a resposta. A dificuldade escala por fase. |
| **Taxonomia de Bloom** | Fase 1: **Análise** (identificar falácias). Fase 2: **Avaliação** (construir argumento). Fase 3: **Síntese** (texto filosófico livre). |
| **Modelo de Toulmin (1958)** | Toda argumentação é avaliada em 3 dimensões pontuadas: Claim (0–3), Data (0–3), Warrant (0–3). |
| **Festinger — Dissonância Cognitiva** | O Boss usa afirmações provocativas e falácias deliberadas para forçar o jogador a buscar ativamente contra-evidências. |
| **Csikszentmihalyi — Teoria do Fluxo** | Dificuldade dinâmica por fase equilibra desafio e habilidade. A baixa latência do Groq mantém a sensação de combate fluido. |

---

## Sistema de Fases (Loop Invertido)

O Boss **ataca primeiro** em cada fase via `GET /api/battle/boss-attack?phase=N`. O jogador reage.

### Fase 1 — Tutorial / O Boss Ataca
- Boss usa falácias óbvias e deliberadas (temáticas — variam por tema escolhido)
- Jogador identifica a falácia via **grid de múltipla escolha** (sem texto livre)
- Avaliação **determinística no servidor** (`selected_logic` vs `correct_fallacy`): ~20ms, 100% preciso — sem chamada ao Groq
- Após cada turno, o Boss lança um **novo ataque** com nova falácia (rodadas repetidas até mudança de fase)
- Foco em Bloom: Análise

### Fase 2 — Modal Flash (Julgamento Discriminativo)
- Boss faz uma afirmação falaciosa curta
- Jogador joga uma das 3 cartas (Apontar Falácia / Exigir Dados / Contraponto) → abre um **Modal Flash** (animado, glassmorphism)
- O modal mostra **3 réplicas curtas** (1 correta + 2 distratores plausíveis). Clique único na superior
- **Determinístico no servidor** (~20ms, sem Groq). O gabarito nunca é exposto ao cliente
- Foco em Toulmin: distinguir a jogada lógica válida das falaciosas

### Fase 3 — Sobrecarga Socrática (Síntese guiada, 2 rounds)
- Antes do combate: **Holo-Guia de Toulmin** (Exemplo Trabalhado obrigatório) com Claim/Data/Warrant coloridos
- **Round 1 — Contra-ataque guiado:** o jogador escolhe **uma Postura de Ataque** (andaime fixo e coeso) e digita só o fechamento (≤140 chars) num terminal hacker
- **Round 2 — Golpe final autoral:** sem frases prontas — o jogador elabora o **argumento completo** (≤300 chars) sozinho
- Botão flutuante `[👁 Ver Holo-Guia]` reabre o esquema a qualquer momento (gaveta lateral)
- Os dois textos vão ao Groq: validação anti-gibberish + pontuação Toulmin (coleta do TCC preservada)

### Transições por Turnos Fixos
```
Turnos:  1 2 3 │ 4 5 6 │ 7 8 → BattleReport
Fase:      1   │   2   │  3
                         (round 1 · round 2)
```
- **8 turnos fixos** (Fase 1: 3 · Fase 2: 3 · Fase 3: 2), gerenciados pelo contador `turnCount` em `useBattle.js`
- Ao cruzar a fronteira (turnos 3→4 e 6→7), exibe `PhaseIntro`; a Fase 3 traz o Holo-Guia
- **O HP é puramente cosmético** (barras, glitch, screen-shake) — o jogo NUNCA termina por HP=0.
  O dano é calibrado para o boss zerar **só num run perfeito** (Fase 1: 12×3 + Fase 2: 12×3 + Fase 3: 14×2 = 100)

---

## Fluxo do Jogo

```
[IntroScreen]
    │
    ▼
[AuthModal] — apelido apenas, sem senha
    │
    ▼
[ThemeSelection] — tema de TEXTO LIVRE (ex: Pokémon, Futebol, Cinema)
    │  └── "GERAR ARENA DE DUELO" → POST /api/battle/generate-arena
    │        (1 chamada Groq/Gemini gera a arena; tela de geração imersiva)
    ▼
[Game Arena — 8 turnos fixos servidos da arena pré-gerada]
    │
    ├── Turnos 1-3 · Fase 1: grid de falácias (determinístico)
    ├── Turnos 4-6 · Fase 2: Modal Flash (3 réplicas, determinístico)
    ├── Turnos 7-8 · Fase 3: round 1 (postura) + round 2 (texto livre) (Groq + Toulmin)
    │
    └── turnCount === 8 → [BattleReport] (PONTUAÇÃO ≥ 500 = vitória)
```

> **Sem manual (HowToPlay).** Aprendizado orgânico via feedbacks curtos das cartas.
> **Sem quiz no fluxo.** O pré/pós-teste é externo. Dados exportados via `/api/admin/export-research-csv`.

---

## Integridade Acadêmica — HP Cosmético, Fim por Turnos

**O frontend nunca envia `won_battle`.** O fim do jogo é decidido pelo contador de 8 turnos no front;
o HP é apenas visual. O backend grava `won_battle` como **placar** e nunca dispara fim prematuro.

### Como funciona

1. O frontend envia o argumento/jogada ao `POST /api/battle` (com o turno atual em `game_phase`)
2. O backend mantém o HP por `user_id` em `user_stats` (`current_boss_hp`, `current_player_hp`) — uso cosmético
3. Após o dano do turno, atualiza os HPs (clamp em 0) e devolve `boss_hp`/`player_hp` para os efeitos visuais
4. `won_battle` registra o **placar do turno** (`boss_hp < player_hp`); a linha do 8º turno = saldo final
5. O backend **não envia `won`/`lost`** — o front encerra ao atingir o turno 8 e mostra o `BattleReport`

```
Frontend                       Backend
────────                       ───────
turnCount++ (1..8)             calcula dano (determinístico ou Groq+Zod)
envia jogada ────────────────► atualiza boss_hp/player_hp (cosmético, clamp 0)
                               won_battle = placar do turno (boss_hp < player_hp)
◄─── { dano, boss_hp, player_hp } retorna (SEM won/lost)
reage visualmente
turnCount === 8 → BattleReport (decisão 100% no front)
```

---

## Proteção Contra Spam / Gibberish (Fase 3)

Na Fase 3, o input de texto livre está sujeito a tentativas de burlar o debate.

### Validação em duas camadas

**Camada 1 — Prompt do LLM:**
O system prompt da Fase 3 instrui o modelo a retornar `play_valid: false` quando detectar:
- Caracteres aleatórios ou sequências sem sentido (`asdasd`, `kkkkk`, `123abc`)
- Texto completamente fora do contexto do debate
- Tentativas de injeção de prompt ou manipulação do sistema
- Respostas de uma única palavra sem argumento

**Camada 2 — Schema Zod:**
```javascript
z.object({
  play_valid: z.boolean().nullable(),
  // quando play_valid === false, o backend ignora boss_damage e aplica penalidade
})
```

**Penalidade aplicada pelo backend (não pelo LLM):**
```javascript
if (play_valid === false) {
  boss_damage = 0;
  player_damage = 25; // punição severa por incoerência
}
```

A punição é aplicada pelo backend após receber o JSON — o LLM não define o valor da penalidade.

---

## Mecânica: Combos Lógicos (combate por clique)

Sessões breves (≤ 5 min), sem caixa de texto livre em branco. Carga cognitiva mitigada + alta fidelidade visual.

### Fase 2 — Baralho + Modal Flash

| Carta | Propósito pedagógico |
|---|---|
| **Apontar Falácia** | Identificação de erros lógicos (Bloom: Análise) |
| **Exigir Dados** | Ceticismo epistêmico e exigência de fontes (Toulmin: Data) |
| **Contraponto Lógico** | Construção de argumento completo (Toulmin) |

Jogar uma carta abre o Modal Flash com 3 réplicas curtas pré-escritas. O jogador clica na superior;
o servidor compara o `option_id` com o gabarito gravado (`current_expected_option`) — `is_correct`
nunca trafega para o cliente.

### Fase 3 — Postura Lógica + fechamento autoral

1. **Holo-Guia de Toulmin** (Exemplo Trabalhado): Claim (ciano) → Data (magenta) → Warrant (amarelo).
   Traz um **badge vermelho piscante** avisando que é só exemplo didático — não usar contra o debate atual.
2. **1 de 3 Posturas de Ataque Lógico** (seleção única), cada uma com um andaime fixo e gramaticalmente perfeito:
   - **Contra-Evidência** → _"Contradigo sua afirmação pois existem dados empíricos sólidos que provam o oposto, especificamente que …"_
   - **Quebra de Nexo** → _"Sua conclusão é logicamente inválida porque a justificativa apresentada não se conecta com o fato, dado que …"_
   - **Falso Efeito** → _"A linha de impacto do seu argumento assume um cenário causal irreal, visto que …"_
3. **Autoria do aluno** (≤140 chars, terminal hacker) completa o desfecho. O texto concatenado vai ao Groq para pontuação Toulmin.

### Ficha de Falácia — reforço pedagógico divertido

A cada turno com falácia nomeada (Fase 1 e 2), um **modal central animado** explica a falácia de
forma leve: nome + frase divertida ("como ela ataca") + arte temática (ícone neon com micro-animação
própria por tipo — Bola de Neve rola, Espantalho balança, Ataque Pessoal "soca"...). O modal **pausa
o jogo até o jogador clicar "Entendi"**. Catálogo das 9 falácias em `lib/fallacies.js`.

> As telas de transição (`PhaseIntro`) **não têm mais contagem regressiva** — esperam o clique do jogador.

---

## Identificação de Jogador

Sem login ou senha — o jogador insere apenas um **apelido**. O servidor cria um usuário anônimo com hash aleatório. Nomes duplicados recebem sufixo automático (ex: `lucas482`).

---

## Sistema de Personalidade Argumentativa

Acumulado ao longo do jogo, exibido apenas ao final como **card de resultado** — sem revelar que é pedagógico.

| Arquétipo | Emoji | O que revela |
|---|---|---|
| O Lógico | 🧠 | Garantias sólidas (warrant alto) |
| O Caçador de Dados | 🔬 | Uso consistente de evidências |
| O Articulador | 🎯 | Teses claras e diretas |
| O Predador | ⚔️ | Críticos e identificação de pontos fracos |
| O Caótico | ⚡ | Alta frequência de falácias cometidas |

---

## Falácias Detectadas (pt-br)

```
Ataque Pessoal | Espantalho | Apelo à Autoridade Indevida | Bola de Neve |
Falsa Dicotomia | Raciocínio Circular | Generalização Apressada | Apelo à Emoção | Causa Falsa
```

---

## Tabela de Dano

### Fase 2 (padrão)

| Situação | Dano ao Boss | Dano ao Jogador |
|---|---|---|
| Argumento sólido + crítico (Toulmin ≥ 2 em todos) | 20–30 HP | 0 |
| Argumento razoável (Toulmin ≥ 1 em todos) | 10–15 HP | 0 |
| Falácia detectada | 0 | 15–20 HP |
| Opinião rasa | 0 | 10 HP |

### Fase 3 (exigente)

| Situação | Dano ao Boss | Dano ao Jogador |
|---|---|---|
| Argumento filosófico sólido (claim=3, data≥2, warrant≥2) | 20–30 HP | 0 |
| Argumento razoável | 8–14 HP | 0 |
| Falácia ou incoerência | 0 | 15–25 HP |
| **Gibberish / incoerência (`play_valid: false`)** | **0** | **25 HP** |

---

## Progressão e Títulos

| Título | Batalhas mín. | Win rate mín. |
|---|---|---|
| Iniciante Lógico | 0 | — |
| Aprendiz Dialético | 3 | — |
| Refutador Funcional | 5 | 30% |
| Arquiteto de Argumentos | 10 | 50% |
| Mestre da Refutação | 20 | 70% |
| Juggernaut Lógico | 30 | 85% |

---

## Dados coletados para o TCC

| Dado | Tabela | Teoria | Indicador de aprendizado |
|---|---|---|---|
| `response_time_ms` | `battles` | Teoria do Fluxo | Cai ao longo das sessões → maior fluência |
| `card_type` | `battles` | Scaffolding | Migração de `data` para texto livre → menor dependência |
| `play_valid` | `battles` | Bloom: Análise | Taxa crescente → melhor identificação de falácias |
| `toulmin_data` | `battles` | Toulmin | Aumenta → aluno passa a citar fontes |
| `toulmin_warrant` | `battles` | Toulmin | Aumenta → aluno conecta dado à tese com lógica |
| `fallacy_detected` | `battles` | Dissonância Cognitiva | Frequência diminui → aluno evita erros conhecidos |
| `game_phase` | `battles` | Bloom / scaffolding | Distribuição de turnos por fase |

**Exportação:** `GET /api/admin/export-research-csv` — dump anônimo e agregado em CSV para análise no Excel/R.

---

## Stack Tecnológica

| Camada | Tecnologia | Motivo da escolha |
|---|---|---|
| Frontend | React 19 + Vite 7 | JS puro, sem overhead de TS |
| Animação | Framer Motion | Modal Flash e gaveta com física de mola (`spring`); glitch/glass/shake em CSS puro |
| Backend | Express 5 (ES Modules) | Simples e eficiente |
| Banco de dados | PostgreSQL 16 (Docker, porta 5433) | Controle total local; sem custo de nuvem |
| IA | Groq — LLaMA 3.3-70b-versatile | Latência < 1s (Teoria do Fluxo) + `json_object` nativo |
| Validação | Zod | Garante schema da resposta da IA antes de virar dano |
| Ícones | Lucide React | Já instalado |
| Fontes | Orbitron, JetBrains Mono | Estética cyberpunk consistente |

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) v18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Chave Groq: [console.groq.com](https://console.groq.com)
- [ngrok](https://ngrok.com/download) (opcional — acesso externo)

---

## Instalação

```bash
# 1. Clone
git clone <url-do-repo>
cd CB

# 2. Variáveis de ambiente — crie server/.env:
# PORT=3000
# GROQ_API_KEY=<sua chave do console.groq.com>
# GEMINI_API_KEY=<sua chave do aistudio.google.com>   # fallback automático
# DATABASE_URL=postgresql://chatboss:chatboss123@localhost:5433/chatboss
# ADMIN_SECRET=<string secreta para /api/admin/*>
# LLM_PRIMARY=groq   # opcional: provedor inicial (groq|gemini)

# 3. Dependências
cd server && npm install
cd ../client && npm install

# 4. Schema do banco (primeira vez)
docker-compose up -d
docker exec -i cb-postgres-1 psql -U chatboss -d chatboss < server/db/schema.sql
```

---

## Como rodar

### Opção A — Script automático (Windows)

```powershell
.\start.ps1
```

### Opção B — Manual (3 terminais)

```powershell
# Terminal 1
docker-compose up -d

# Terminal 2
cd server && node server.js

# Terminal 3
cd client && npm run dev
```

Acesse: **http://localhost:5173**

> **Atenção (Windows):** PostgreSQL nativo ocupa a porta 5432. O projeto usa **5433**. Não alterar.

### Fallback de IA (Groq ⇄ Gemini)

A geração usa **dois provedores com fallback automático**. Se o provedor primário bater
rate-limit/cota (429), o backend **alterna sozinho** para o outro — dobrando o orçamento diário
e evitando que o jogo trave por cota esgotada.

- **Groq** `llama-3.3-70b-versatile` (primário por padrão).
- **Gemini** `gemini-2.5-flash` (fallback; defina `GEMINI_API_KEY`).
- `LLM_PRIMARY=gemini` inverte a ordem (começa pelo Gemini). Erros que não são de cota não alternam.

### Modo MOCK — desenvolver sem gastar tokens do Groq

Para mexer em UI/animações/fluxo sem consumir a cota da API:

```powershell
cd server; $env:MOCK_ARENA=1; node server.js   # ou MOCK_ARENA=1 node server.js (bash)
```

Com `MOCK_ARENA=1` (ou enviando `{ mock: true }` no body de `/api/battle/generate-arena`), o backend
serve a arena estática **`server/mockArena.json`** (sem chamar o Groq, ~15ms) e a Fase 3 é avaliada por
heurística simples. Um duelo completo roda com **zero tokens**. Para atualizar o mock, gere uma arena
real, copie `user_stats.arena_data` do banco e cole em `server/mockArena.json`.

---

## Estrutura de Arquivos

```
CB/
├── docker-compose.yml
├── start.ps1
│
├── client/
│   ├── vite.config.js                  # Proxy /api → :3000
│   └── src/
│       ├── App.jsx                     # Renderização e roteamento de telas
│       ├── App.css                     # CSS completo (tema neon)
│       ├── hooks/
│       │   └── useBattle.js            # Estado de HP, logs, fases — separado do App
│       ├── components/
│       │   ├── IntroScreen.jsx         # Tela inicial (typewriter)
│       │   ├── AuthModal.jsx           # Entrada por apelido (sem senha)
│       │   ├── ThemeSelection.jsx      # Tema de texto livre + geração imersiva da arena
│       │   ├── LogicCards.jsx          # F1 grid · F2 Modal Flash · F3 Construtor de Sentenças
│       │   ├── PhaseIntro.jsx          # Transição (sem timer) + Holo-Guia de Toulmin (Fase 3)
│       │   ├── FallacyCard.jsx         # Ficha de Falácia: modal animado pós-turno
│       │   └── BattleReport.jsx        # Relatório final + card de arquétipo
│       └── lib/
│           ├── personality.js          # 5 arquétipos: acumula pontos, gera relatório
│           ├── phase3Data.js           # Exemplos Toulmin + tokens (Fase 3) por tema
│           └── fallacies.js            # Catálogo das 9 falácias (ícone/cor/frase/animação)
│
└── server/
    ├── server.js                       # Endpoints + prompts por fase + Zod
    └── db/
        ├── index.js                    # Pool PostgreSQL
        ├── schema.sql                  # DDL idempotente (IF NOT EXISTS)
        └── titles.js                   # calcTitle(stats)
```

### `client/src/hooks/useBattle.js` — responsabilidades

```javascript
// Estados gerenciados pelo hook (fora do App.jsx):
// - bossHp                  (COSMÉTICO — barra do inimigo; 0 só em run perfeito)
// - score, lastGain         (PONTUAÇÃO do jogador — sobe a cada acerto; substitui a integridade)
// - turnCount (0..8)        (MÁQUINA DE ESTADOS — define fase e fim)
// - logs (histórico de turnos do chat)
// - gamePhase (1 | 2 | 3)   (derivado por phaseForTurn)
// - bossAttack, bossAttacking, screenShake
// - showPhaseIntro, pendingPhase, phaseTransitioning
// - loading, isGameOver, isVictory (= score >= 500 no fim)
//
// Pontuação: acerto rende pontos por fase (F1 100, F2 100, F3 150); máx 900, vitória ≥ 500.
//
// Funções exportadas:
// - handleAttack(cardPlay)  // consome 1 turno; no 8º → BattleReport
// - handlePhaseIntroContinue()
// - handleRestart()
// - handleThemeSelect(theme)
// - fetchBossAttack(phase, theme)
//
// App.jsx consome o hook e só renderiza:
// const { bossHp, turnCount, handleAttack, ... } = useBattle(user, screen);
```

---

## API

### Sessão

| Método | Rota | Body | Retorno |
|---|---|---|---|
| POST | `/api/session` | `{ username }` | `{ user_id, username }` |

### Jogo

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/battle/generate-arena` | **Pre-Generation Hack** — recebe `{ theme_text, user_id }`, gera a arena (Fases 1-3) via Groq/Gemini e grava em `user_stats.arena_data` |
| GET | `/api/battle/boss-attack?phase=N&turn=T&theme=TEMA` | Serve o ataque pré-gerado por índice (`turn % 3`), <20ms |
| POST | `/api/battle` | Turno de batalha — avalia argumento, atualiza HP no banco, retorna resultado |
| POST | `/api/session/reset` | Zera `current_boss_hp`/`current_player_hp` ao iniciar novo duelo |
| GET | `/api/user/:id/stats` | Stats e título do usuário |

### Administração / TCC

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/export-research-csv` | `x-admin-secret` header | Exporta dados de batalhas em CSV |

> **Rotas removidas:** `/api/auth/register`, `/api/auth/login`, `/api/ranking`, `/api/quiz/questions`, `/api/quiz/submit`.

---

### POST /api/battle — fluxo completo

```
Body:
  userArgument    string  — texto do argumento (obrigatório)
  user_id         int | null
  game_phase      1 | 2 | 3
  cardType           "fallacy-choice" | "fallacy" | "data" | "counter" | null
  selected_logic     string | null  — falácia escolhida (Fase 1)
  correct_fallacy    string | null  — gabarito do ataque (Fase 1 — validação determinística)
  selected_option_id string | null  — opção clicada no Modal Flash (Fase 2 — determinística)
  theme_id           string | null  — texto livre do tema (ex: "Pokémon")
  theme_text         string | null  — texto livre do tema (label nos prompts da Fase 3)
  responseTimeMs     int | null

Fluxo no servidor:
  1. Moderação de conteúdo (BLOCKED_PATTERNS)
  2. [FASE 1] Se correct_fallacy fornecido → determinística (sem Groq):
     - selected_logic === correct_fallacy → boss_damage=20, player_damage=0
     - caso contrário                    → boss_damage=0,  player_damage=15  → retorna (~20ms)
  3. [FASE 2] Se selected_option_id fornecido → determinística (sem Groq):
     - lê user_stats.current_expected_option (gabarito gravado pelo boss-attack)
     - acerto → aplica boss_damage/feedback da opção; erro → player_damage=15  → retorna (~20ms)
  4. [FASE 3] buildPhasePrompts(themeLabel)[3] como system prompt (texto unificado: postura + autoria);
     injeta arena_data.phase3_context no prompt para julgar dentro do tema customizado
  5. Chama Groq (LLaMA 3.3-70b) → JSON validado por Zod
  6. Se play_valid === false → força boss_damage=0, player_damage=25
  7. Lê current_boss_hp e current_player_hp do banco (user_stats)
  8. Aplica o dano (clamp em 0): new_boss_hp = max(0, current - boss_damage), idem player
  9. Persiste os novos HPs em user_stats (HP é COSMÉTICO — não encerra o jogo)
 10. won_battle = PLACAR do turno (boss_hp < player_hp). NÃO há fim por HP=0
 11. INSERT em battles (16 campos)
 12. UPDATE user_stats + calcTitle
 13. Retorna gameData com boss_hp/player_hp (SEM won/lost — fim é decidido pelos 8 turnos no front)
```

> **`won_battle` nunca vem do frontend.** O campo só é escrito pelo backend.

### Payload de batalha

```json
{
  "userArgument": "Identifico a falácia de Bola de Neve nesse argumento.",
  "user_id": 1,
  "game_phase": 1,
  "cardType": "fallacy-choice",
  "selected_logic": "Bola de Neve",
  "correct_fallacy": "Bola de Neve",
  "theme_id": "automacao",
  "responseTimeMs": 4200
}
```

Fase 2 com carta de contraponto:

```json
{
  "userArgument": "Discordo: a automação cria mais empregos do que elimina. Baseado em estudos do MIT 2023.",
  "user_id": 1,
  "game_phase": 2,
  "cardType": "counter",
  "selected_target": null,
  "theme_id": "automacao",
  "responseTimeMs": 9100
}
```

### Resposta da IA — schema Zod

```javascript
z.object({
  boss_damage:      z.number().int().min(0).max(30),
  player_damage:    z.number().int().min(0).max(25),
  reply:            z.string().min(1),
  feedback:         z.string().min(1),
  critical_hit:     z.boolean(),
  toulmin_score:    z.object({
    claim:   z.number().int().min(0).max(3),
    data:    z.number().int().min(0).max(3),
    warrant: z.number().int().min(0).max(3),
  }),
  fallacy_detected: z.string().nullable(),
  play_valid:       z.boolean().nullable(),
})
```

### Resposta de batalha (retorno ao frontend)

```json
{
  "boss_damage": 15,
  "player_damage": 0,
  "boss_hp": 51,
  "player_hp": 100,
  "reply": "réplica sarcástica do Boss",
  "feedback": "análise do turno",
  "critical_hit": false,
  "toulmin_score": { "claim": 2, "data": 1, "warrant": 1 },
  "fallacy_detected": null,
  "play_valid": true,
  "won": false,
  "lost": false,
  "current_title": "Aprendiz Dialético"
}
```

---

### GET /api/admin/export-research-csv

**Autenticação:** header `x-admin-secret: <ADMIN_SECRET do .env>`

**Colunas exportadas:**

| Coluna CSV | Origem | Descrição |
|---|---|---|
| `id` | `battles.id` | ID do turno |
| `username` | `users.username` | Apelido do jogador |
| `created_at` | `battles.created_at` | Timestamp do turno |
| `argument_text` | `battles.argument_text` | Texto do argumento enviado |
| `card_type` | `battles.card_type` | Carta usada (ou null = texto livre) |
| `game_phase` | `battles.game_phase` | Fase em que o turno ocorreu |
| `boss_damage` | `battles.boss_damage` | Dano causado ao Boss |
| `player_damage` | `battles.player_damage` | Dano sofrido |
| `critical_hit` | `battles.critical_hit` | Acerto crítico |
| `fallacy_detected` | `battles.fallacy_detected` | Falácia cometida (ou null) |
| `play_valid` | `battles.play_valid` | IA aprovou a jogada |
| `response_time_ms` | `battles.response_time_ms` | Tempo de resposta |
| `toulmin_claim` | `battles.toulmin_claim` | Score 0–3 |
| `toulmin_data` | `battles.toulmin_data` | Score 0–3 |
| `toulmin_warrant` | `battles.toulmin_warrant` | Score 0–3 |
| `won_battle` | `battles.won_battle` | Resultado final (null = turno em jogo) |

---

## Banco de Dados

```sql
-- Usuários
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  username       VARCHAR(50) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,       -- hash aleatório (sem senha real)
  created_at     TIMESTAMP DEFAULT NOW()
);

-- Batalhas (cada turno)
CREATE TABLE battles (
  id               SERIAL PRIMARY KEY,
  user_id          INT REFERENCES users(id) ON DELETE SET NULL,
  argument_text    TEXT NOT NULL,
  boss_damage      INT DEFAULT 0,
  player_damage    INT DEFAULT 0,
  feedback         TEXT,
  critical_hit     BOOLEAN DEFAULT FALSE,
  fallacy_detected VARCHAR(100),
  toulmin_claim    INT DEFAULT 0,
  toulmin_data     INT DEFAULT 0,
  toulmin_warrant  INT DEFAULT 0,
  won_battle       BOOLEAN,                  -- escrito APENAS pelo backend
  created_at       TIMESTAMP DEFAULT NOW(),
  card_type        VARCHAR(20),
  play_valid       BOOLEAN,
  response_time_ms INT,
  game_phase       INT DEFAULT 1
);

-- Stats agregadas + HP de sessão atual
CREATE TABLE user_stats (
  user_id           INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_battles     INT DEFAULT 0,
  total_wins        INT DEFAULT 0,
  total_losses      INT DEFAULT 0,
  total_boss_damage INT DEFAULT 0,
  total_player_damage INT DEFAULT 0,
  total_criticals   INT DEFAULT 0,
  best_streak       INT DEFAULT 0,
  current_streak    INT DEFAULT 0,
  current_boss_hp   INT DEFAULT 100,         -- HP persistido no servidor
  current_player_hp INT DEFAULT 100,         -- HP persistido no servidor
  current_expected_option JSONB,             -- gabarito da opção correta da Fase 2 (Modal Flash)
  arena_data        JSONB,                   -- Pre-Generation Hack: arena (Fases 1-3) gerada pela IA (tema livre)
  arena_theme       TEXT,                    -- texto do tema digitado pelo jogador
  title             VARCHAR(100) DEFAULT 'Iniciante Lógico',
  updated_at        TIMESTAMP DEFAULT NOW()
);
```

> **Tabelas removidas:** `assessments` e `quiz_questions` (pré/pós-teste movido para formulário externo).

---

## Personagem do Boss

**MECHA-LOGIC v7.0** — IA antagonista com diretrizes fixas:
- Arrogante, nunca valida genuinamente o jogador
- Humor estilo Bender (Futurama) com vocabulário científico
- **"O Debate Nunca Morre":** mesmo derrotado num ponto, contra-ataca por novo ângulo
- Fase 3: modo socrático — faz perguntas filosóficas em vez de apenas rebater
- Fase 3: detecta gibberish e retorna `play_valid: false` com resposta zombeteira

---

## Observações Técnicas

- **Auth:** apelido apenas, sem senha. `POST /api/session` cria user com hash aleatório. Conflito de nome → sufixo de 3 dígitos automático.
- **Porta 5433:** PostgreSQL nativo do Windows ocupa 5432. Não reverter.
- **Timeout Groq:** `{ timeout: 15000 }` como segundo argumento de `.create()` — não dentro do objeto de parâmetros.
- **HP no backend:** `current_boss_hp` e `current_player_hp` ficam em `user_stats`. O frontend recebe os valores atualizados em cada resposta — nunca calcula HP localmente para fins de persistência.
- **`won_battle`:** escrito exclusivamente pelo servidor. O frontend não envia esse campo.
- **`play_valid: false`:** o backend aplica a penalidade fixa (boss_damage=0, player_damage=25) — o valor não vem do LLM.
- **`useBattle.js`:** toda lógica de estado de combate (HP, logs, fases) deve viver neste hook. O App.jsx só renderiza.
- **Admin secret:** `ADMIN_SECRET` no `server/.env`. O endpoint `/api/admin/export-research-csv` rejeita requests sem o header correto com 401.
- **Animações pausadas:** `visibilitychange` pausa animações CSS quando a aba está em background.
- **`BarChart3` removido do App.jsx:** painel Toulmin e chip de falácia foram removidos do chat. Os dados seguem sendo coletados no banco.
