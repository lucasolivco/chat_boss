CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS battles (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  argument_text TEXT NOT NULL,
  boss_damage INT NOT NULL DEFAULT 0,
  player_damage INT NOT NULL DEFAULT 0,
  feedback TEXT,
  critical_hit BOOLEAN DEFAULT FALSE,
  fallacy_detected VARCHAR(100),
  toulmin_claim INT DEFAULT 0,
  toulmin_data INT DEFAULT 0,
  toulmin_warrant INT DEFAULT 0,
  won_battle BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_battles INT DEFAULT 0,
  total_wins INT DEFAULT 0,
  total_losses INT DEFAULT 0,
  total_boss_damage INT DEFAULT 0,
  total_player_damage INT DEFAULT 0,
  total_criticals INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  title VARCHAR(100) DEFAULT 'Iniciante Lógico',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── Baralho Lógico / coleta de dados para o TCC ──────────────────────────────
ALTER TABLE battles ADD COLUMN IF NOT EXISTS card_type VARCHAR(20);
ALTER TABLE battles ADD COLUMN IF NOT EXISTS play_valid BOOLEAN;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS response_time_ms INT;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS game_phase INT DEFAULT 1;

-- ─── HP persistente (servidor é fonte de verdade) ─────────────────────────────
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS current_boss_hp INT DEFAULT 100;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS current_player_hp INT DEFAULT 100;

-- ─── Fase 2 (Modal Flash): gabarito da opção correta guardado no servidor ──────
-- Integridade acadêmica: o cliente nunca recebe is_correct. O servidor grava aqui
-- o snapshot da opção correta do ataque atual e valida o selected_option_id contra ele.
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS current_expected_option JSONB;

-- ─── Assessments (dados de pesquisa TCC) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessments (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  phase VARCHAR(10) NOT NULL,
  score INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
