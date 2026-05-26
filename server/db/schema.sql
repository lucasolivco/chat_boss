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
