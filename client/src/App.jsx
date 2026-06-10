import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Target, Swords, RotateCcw,
  Flame, AlertTriangle, HeartCrack, Cpu, Bot, User, ShieldCheck,
  Activity,
  Trophy as TrophyIcon, Brain,
} from 'lucide-react';
import IntroScreen from './components/IntroScreen';
import AuthModal from './components/AuthModal';
import BattleReport from './components/BattleReport';
import LogicCards from './components/LogicCards';
import PhaseIntro from './components/PhaseIntro';
import ThemeSelection from './components/ThemeSelection';
import FallacyCard from './components/FallacyCard';
import { useBattle } from './hooks/useBattle';
import './App.css';

const BOSS_IMG_SRC = '/assets/boss-mecha.png';

const CARD_LABELS = {
  fallacy: 'Apontar Falácia',
  data: 'Exigir Dados',
  counter: 'Contraponto',
  'fallacy-choice': 'Identificar Falácia',
};

const PHASE_LABELS = { 1: 'FASE 1', 2: 'FASE 2', 3: 'BOSS FINAL' };

const PHASE_MISSIONS = {
  1: 'Identifique a falácia no ataque do Boss clicando na opção correta.',
  2: 'Jogue uma carta e escolha, no Modal Flash, a réplica logicamente superior.',
  3: 'Round 1: contra-ataque com uma postura guiada. Round 2: elabore o argumento final sozinho.',
};

const Particles = () => (
  <div className="arena-bg-particles" aria-hidden>
    {Array.from({ length: 16 }).map((_, i) => <span key={i} className="particle" style={{ '--i': i }} />)}
  </div>
);

export default function App() {
  // ── Roteamento de telas ──────────────────────────────────────────────────────
  const [screen, setScreen]           = useState('intro');
  const [user, setUser]               = useState(null);

  // ── UI local ─────────────────────────────────────────────────────────────────
  const chatEndRef  = useRef(null);

  // ── Lógica de combate delegada ao hook ───────────────────────────────────────
  const {
    bossHp, logs, loading, visualState, screenShake,
    gamePhase, bossAttack, bossAttacking,
    showPhaseIntro, pendingPhase,
    showReport, reportData,
    isGameOver, isVictory, gameEnded,
    turnCount, totalTurns, phase3Round,
    score, lastGain, winScore, maxScore,
    pendingFallacy, dismissFallacy,
    theme, handleThemeSelect,
    handleAttack, handlePhaseIntroContinue, handleRestart: battleRestart,
    setShowReport,
  } = useBattle(user, screen);

  // ── Scroll automático ────────────────────────────────────────────────────────
  useEffect(() => {
    if (chatEndRef.current) {
      requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }));
    }
  }, [logs, loading, bossAttacking]);

  // ── Pausar animações quando aba perde foco ────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      document.documentElement.classList.toggle('animations-paused', document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ── Login: apelido → direto ao jogo ─────────────────────────────────────────
  const handleLogin = (d) => {
    setUser(d);
    setScreen('game');
  };

  // ── Reiniciar: limpa estado local + hook ─────────────────────────────────────
  const handleRestart = useCallback(() => {
    battleRestart();
  }, [battleRestart]);

  // ── Memos de UI ──────────────────────────────────────────────────────────────
  const bossStatusMap = {
    idle:   { label: 'OPERACIONAL',     icon: Activity },
    hit:    { label: 'DANO DETECTADO',  icon: AlertTriangle },
    attack: { label: 'CONTRA-ATAQUE',   icon: Swords },
    dead:   { label: 'SISTEMA OFFLINE', icon: ShieldCheck },
  };
  // Progresso da pontuação rumo à vitória (substitui a barra de integridade).
  const scorePct = useMemo(
    () => Math.min(100, Math.round((score / (maxScore || 900)) * 100)),
    [score, maxScore]
  );
  const scoreColor = score >= winScore ? 'var(--acid)' : score > 0 ? 'var(--ice)' : 'var(--t-3)';
  const bossStatus = bossStatusMap[visualState] || bossStatusMap.idle;
  const StatusIcon = bossStatus.icon;

  // ── Telas ────────────────────────────────────────────────────────────────────
  if (screen === 'intro') return (
    <IntroScreen onStart={() => setScreen('auth')} />
  );

  if (screen === 'auth') return (
    <AuthModal onLogin={handleLogin} />
  );

  // Seleção de tema (texto livre) + geração da arena — após login, antes da arena
  if (screen === 'game' && !theme) return (
    <ThemeSelection user={user} onSelect={handleThemeSelect} />
  );

  // ── Game Arena ───────────────────────────────────────────────────────────────
  return (
    <div className={`arena ${isGameOver ? 'arena-dead' : ''} ${screenShake ? 'arena-shake' : ''}`}>
      <div className="arena-bg-grid" />
      <Particles />

      {showReport && reportData && (
        <BattleReport
          report={reportData}
          onClose={() => setShowReport(false)}
          onRestart={() => { setShowReport(false); handleRestart(); }}
        />
      )}
      {showPhaseIntro && pendingPhase && (
        <PhaseIntro phase={pendingPhase} onContinue={handlePhaseIntroContinue} />
      )}
      {pendingFallacy && (
        <FallacyCard data={pendingFallacy} onClose={dismissFallacy} />
      )}

      {/* Header */}
      <header className="arena-header">
        <div className="arena-brand">
          <div className="brand-mark"><Cpu size={20} strokeWidth={1.8} /></div>
          <div className="brand-text">
            <span className="arena-logo">CHATBOSS</span>
            <span className="arena-ver">MECHA-LOGIC · {PHASE_LABELS[gamePhase]}{theme ? ` · ${theme.label}` : ''}</span>
          </div>
        </div>
        <div className="arena-user">
          <div className="user-chip">
            <div className="user-avatar"><User size={14} strokeWidth={2} /></div>
            <span className="hdr-name">{user?.username ?? 'Combatente'}</span>
          </div>
        </div>
        <div className="btn-hdr turn-counter" title="Rodada atual de 9">
          <Activity size={13} strokeWidth={2} /> <span>RODADA {Math.min(turnCount + 1, totalTurns)}/{totalTurns}</span>
        </div>
        {reportData && (
          <button className="btn-hdr btn-hdr-accent" onClick={() => setShowReport(true)}>
            <Brain size={13} strokeWidth={2} /> <span>Resultado</span>
          </button>
        )}
      </header>

      {/* Body */}
      <div className="arena-body">

        {/* ════ GAME COLUMN ════ */}
        <div className="arena-game">

          {/* Boss Stage */}
          <div className={`boss-stage ${visualState === 'dead' ? 'boss-stage-dead' : ''}`}>
            <div className="boss-ambient" />
            <div className="corner corner-tl" /><div className="corner corner-tr" />
            <div className="corner corner-bl" /><div className="corner corner-br" />
            <div className="boss-inner">
              <img src={BOSS_IMG_SRC} alt="MECHA-LOGIC" className={`boss-img ${visualState}`}
                   onError={e => { e.target.style.display = 'none'; }} />
              <div className="boss-info-col">
                <p className="boss-name-tag" data-text="MECHA-LOGIC">MECHA-LOGIC</p>
                <p className={`boss-status-tag status-${visualState}`}>
                  <StatusIcon size={11} strokeWidth={2.5} /> {bossStatus.label}
                </p>
                <div className="boss-hp-section">
                  <div className="hp-label-row">
                    <span>INTEGRIDADE DO SISTEMA</span>
                    <span className="hp-num">{bossHp}<span className="hp-max">/100</span></span>
                  </div>
                  <div className="hp-track">
                    <div className="hp-fill hp-fill-boss" style={{ width: `${bossHp}%` }} />
                    {[25, 50, 75].map(n => <div key={n} className="hp-seg" style={{ left: `${n}%` }} />)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* VS */}
          <div className="vs-bar">
            <div className="vs-line" /><span className="vs-text">VS</span><div className="vs-line" />
          </div>

          {/* Player HUD */}
          <div className="player-hud">
            <div className="player-hud-row">
              <div className="player-left">
                <span className="player-name">{user?.username ?? 'VISITANTE'}</span>
              </div>
              <div className="player-right">
                <span className="player-score-label">PONTOS</span>
                <span className="player-score-val" style={{ color: scoreColor }}>
                  {score}
                  {lastGain > 0 && <span key={score} className="score-gain">+{lastGain}</span>}
                </span>
              </div>
            </div>
            <div className="score-track" title={`Vitória a partir de ${winScore} pts`}>
              <div className="score-fill" style={{ width: `${scorePct}%`, background: scoreColor }} />
              <div className="score-winmark" style={{ left: `${Math.round((winScore / (maxScore || 900)) * 100)}%` }} />
            </div>
          </div>

          {/* Chat */}
          <div className="chat-log">
            {logs.length === 0 && bossAttacking && (
              <div className="chat-empty">
                <div className="chat-empty-icon"><Swords size={48} strokeWidth={1.2} /></div>
                <p className="chat-empty-text">MECHA-LOGIC está preparando o ataque...</p>
              </div>
            )}

            {logs.map((msg, i) => (
              <div key={i} className={`msg msg-${msg.sender}`}>
                <div className="msg-sender-tag">
                  {msg.sender === 'player'
                    ? <><User size={11} strokeWidth={2.5} /> {user?.username ?? 'VOCÊ'}{msg.cardType && <span className="msg-card-tag">{CARD_LABELS[msg.cardType]}</span>}</>
                    : <><Bot size={11} strokeWidth={2.5} /> MECHA-LOGIC</>}
                </div>
                <p className="msg-text">{msg.text}</p>
                {msg.sender === 'boss' && (
                  <div className="msg-meta">
                    <div className="dmg-row">
                      {msg.boss_damage > 0 && (
                        <span className={`dmg-chip dmg-boss ${msg.isCritical ? 'dmg-critical' : ''}`}>
                          {msg.isCritical ? <Flame size={11} /> : <Swords size={11} />}
                          {msg.isCritical ? 'CRÍTICO ' : ''}-{msg.boss_damage} HP
                        </span>
                      )}
                      {msg.player_damage > 0 && (
                        <span className="dmg-chip dmg-player">
                          <HeartCrack size={11} /> -{msg.player_damage} HP
                        </span>
                      )}
                    </div>
                    {msg.feedback && <p className="msg-feedback">{msg.feedback}</p>}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="msg msg-boss loading-msg">
                <div className="msg-sender-tag"><Bot size={11} strokeWidth={2.5} /> MECHA-LOGIC</div>
                <div className="loading-dots"><span /><span /><span /></div>
              </div>
            )}

            {isVictory  && <div className="end-banner victory-banner"><TrophyIcon size={18} strokeWidth={1.8} /> VITÓRIA LÓGICA — {score} pontos</div>}
            {isGameOver && <div className="end-banner defeat-banner"><HeartCrack size={18} strokeWidth={1.8} /> FIM — {score} pontos (mín. {winScore} p/ vencer)</div>}
            <div ref={chatEndRef} />
          </div>

          {/* Input — combate 100% por clique (Fase 1/2) e construtor guiado (Fase 3) */}
          <div className="input-zone">
            {!gameEnded && (
              <LogicCards
                key={gamePhase === 3 ? `p3-r${phase3Round}` : `p${gamePhase}`}
                onPlay={(play) => handleAttack(play)}
                disabled={loading || bossAttacking || !!pendingFallacy}
                phase={gamePhase}
                fallacyOptions={bossAttack?.options}
                correctFallacy={bossAttack?.fallacy}
                options={bossAttack?.options}
                phase3Round={phase3Round}
              />
            )}

            {/* Encerramento — novo duelo */}
            {gameEnded && (
              <div className="input-wrap-row">
                <div className="input-btns">
                  <button className="btn-restart" onClick={handleRestart}>
                    <RotateCcw size={12} /> Novo Duelo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ════ SIDEBAR ════ */}
        <aside className="arena-sidebar">
          <div className="sidebar-panel topics-panel">
            <div className="panel-header">
              <span className="panel-icon"><Target size={16} strokeWidth={2} /></span>
              <span className="panel-title">BRIEFING</span>
            </div>
            <div className="briefing-theme">
              <span className="briefing-label">TEMA DO DUELO</span>
              <p className="briefing-value">{theme?.label ?? '—'}</p>
            </div>
            <div className="briefing-phase">
              <span className="briefing-label">MISSÃO · {PHASE_LABELS[gamePhase]}</span>
              <p className="briefing-mission">{PHASE_MISSIONS[gamePhase]}</p>
            </div>
            <div className="briefing-progress">
              <span className="briefing-label">PROGRESSO · {Math.min(turnCount, totalTurns)}/{totalTurns} RODADAS</span>
              <div className="turn-dots">
                {Array.from({ length: totalTurns }, (_, i) => (
                  <span key={i} className={`turn-dot ${i < turnCount ? 'turn-dot-done' : ''} ${i === turnCount ? 'turn-dot-active' : ''}`} />
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
