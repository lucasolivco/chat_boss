import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Zap, BookOpen, Trophy, BarChart3, Target, Swords, RotateCcw, RefreshCw,
  Flame, AlertTriangle, HeartCrack, Award, Cpu, Bot, User, ShieldCheck,
  Activity, ChevronRight, Send, Loader2, Brain, FlaskConical, Crosshair,
  Sparkles, Trophy as TrophyIcon, Film, Gamepad2, Globe, Landmark,
  GraduationCap, Tv2,
} from 'lucide-react';
import IntroScreen from './components/IntroScreen';
import HowToPlay from './components/HowToPlay';
import AuthModal from './components/AuthModal';
import BattleReport from './components/BattleReport';
import { ARCHETYPES, initPersonality, updatePersonality, normalize, generateReport } from './lib/personality';
import './App.css';

const BOSS_IMG_SRC = '/assets/boss-mecha.png';
const API = '';

const ARCHETYPE_ICONS = {
  logician:   Brain,
  empirical:  FlaskConical,
  rhetorical: Target,
  aggressive: Crosshair,
  chaotic:    Zap,
};

const Particles = () => (
  <div className="arena-bg-particles" aria-hidden>
    {Array.from({ length: 16 }).map((_, i) => <span key={i} className="particle" style={{ '--i': i }} />)}
  </div>
);

const TOPICS = [
  {
    id: 'futebol', icon: TrophyIcon, label: 'Esportes',
    prompts: [
      'O VAR prejudica mais o futebol do que ajuda, pois quebra o ritmo do jogo e não elimina a subjetividade das decisões.',
      'Clubes europeus têm vantagem estrutural injusta sobre clubes de países em desenvolvimento, tornando o futebol global cada vez menos competitivo.',
      'A seleção brasileira perdeu identidade tática ao tentar copiar o estilo europeu de jogo ao longo das últimas décadas.',
    ],
  },
  {
    id: 'ciencia', icon: FlaskConical, label: 'Ciência',
    prompts: [
      'A exploração espacial privada é eticamente problemática, pois privatiza recursos que deveriam ser patrimônio da humanidade.',
      'O uso de inteligência artificial em diagnósticos médicos reduz erros clínicos de forma comprovada e deveria ser obrigatório em hospitais públicos.',
      'O financiamento público de ciência básica gera retorno econômico superior ao investimento em pesquisa aplicada, segundo dados históricos.',
    ],
  },
  {
    id: 'jogos', icon: Gamepad2, label: 'Jogos',
    prompts: [
      'Jogos violentos não causam violência no mundo real — estudos longitudinais mostram correlação negativa entre consumo de jogos e taxas de crime.',
      'O modelo de loot boxes é estruturalmente idêntico ao jogo de azar e deveria ser regulado da mesma forma pelos governos.',
      'E-sports deveriam ser reconhecidos como modalidades olímpicas, dado o nível de habilidade cognitiva e motora exigido.',
    ],
  },
  {
    id: 'filmes', icon: Film, label: 'Cinema',
    prompts: [
      'O modelo de streaming degradou a qualidade do cinema autoral ao priorizar volume de conteúdo sobre profundidade artística.',
      'Remakes e reboots são economicamente racionais para estúdios, mas culturalmente empobrecedores para a indústria cinematográfica.',
      'A premiação do Oscar é sistematicamente enviesada por fatores políticos, não apenas por mérito artístico objetivo.',
    ],
  },
  {
    id: 'animes', icon: Tv2, label: 'Animação',
    prompts: [
      'A globalização dos animes via Netflix homogeneizou o estilo visual e narrativo, diluindo características que tornavam a animação japonesa única.',
      'Light novels são uma forma literária tão válida quanto romances convencionais e deveriam ser levadas a sério pela crítica.',
      'O modelo de produção de animes no Japão explora trabalhadores criativamente e precisa de reforma estrutural urgente.',
    ],
  },
  {
    id: 'ia', icon: Cpu, label: 'IA & Tech',
    prompts: [
      'Modelos de linguagem substituirão parcela significativa dos empregos do setor de serviços até 2030, e governos deveriam agir agora.',
      'A regulamentação de IA por governos nacionais é ineficaz sem cooperação internacional — assim como armas nucleares exigiram tratados globais.',
      'Arte gerada por IA não pode ser considerada obra artística porque carece de intencionalidade e experiência subjetiva genuína.',
    ],
  },
  {
    id: 'filosofia', icon: Landmark, label: 'Filosofia',
    prompts: [
      'O livre-arbítrio é incompatível com um universo determinístico — se toda escolha tem causa anterior, nenhuma escolha é genuinamente livre.',
      'Utilitarismo falha como sistema moral porque justifica atrocidades contra minorias quando maximiza bem-estar da maioria.',
      'A ética de virtudes de Aristóteles é superior ao imperativo categórico kantiano para guiar decisões morais em contextos concretos.',
    ],
  },
  {
    id: 'geopolitica', icon: Globe, label: 'Geopolítica',
    prompts: [
      'Sanções econômicas raramente atingem seus objetivos políticos e causam dano desproporcional à população civil dos países-alvo.',
      'A multipolaridade geopolítica pode ser mais estável que a hegemonia unipolar, pois distribui poder e reduz pontos únicos de falha sistêmica.',
      'A ONU perdeu relevância prática por carecer de mecanismos de enforcement contra membros permanentes do Conselho de Segurança.',
    ],
  },
];

export default function App() {
  const [screen, setScreen] = useState('intro');
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [user, setUser] = useState(null);

  const [bossHp, setBossHp]     = useState(100);
  const [playerHp, setPlayerHp] = useState(100);
  const [input, setInput]       = useState('');
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [visualState, setVisualState] = useState('idle');

  const [rankingData, setRankingData]     = useState([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [activeTopic, setActiveTopic]     = useState(null);

  const [personality, setPersonality] = useState(initPersonality);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState(null);

  const chatEndRef  = useRef(null);
  const textareaRef = useRef(null);

  const isGameOver = playerHp <= 0;
  const isVictory  = bossHp <= 0;
  const gameEnded  = isGameOver || isVictory;

  const normalized = useMemo(() => normalize(personality), [personality]);

  const fetchRanking = useCallback(async () => {
    setRankingLoading(true);
    try {
      const r    = await fetch(`${API}/api/ranking`);
      const data = await r.json();
      setRankingData(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
    finally { setRankingLoading(false); }
  }, []);

  useEffect(() => { if (screen === 'game') fetchRanking(); }, [screen, fetchRanking]);
  useEffect(() => {
    if (chatEndRef.current) {
      requestAnimationFrame(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });
    }
  }, [logs, loading]);
  useEffect(() => { if (isVictory) setVisualState('dead'); }, [isVictory]);

  // Pause animations when tab loses focus (performance optimization)
  useEffect(() => {
    const handleVisibility = () => {
      document.documentElement.classList.toggle('animations-paused', document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Trigger end-of-battle report
  useEffect(() => {
    if (gameEnded && !showReport && !reportData) {
      const report = generateReport(personality, isVictory);
      setReportData(report);
      setTimeout(() => setShowReport(true), 1200);
    }
  }, [gameEnded, showReport, reportData, personality, isVictory]);

  const handleLogin  = (d) => { setUser(d); setScreen('game'); };
  const handleGuest  = ()  => { setUser(null); setScreen('game'); };

  const handleRestart = () => {
    setBossHp(100); setPlayerHp(100);
    setInput(''); setLogs([]); setVisualState('idle');
    setPersonality(initPersonality());
    setShowReport(false); setReportData(null);
    fetchRanking();
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const usePrompt = (text) => {
    setInput(text);
    setActiveTopic(null);
    textareaRef.current?.focus();
  };

  const handleAttack = async () => {
    if (!input.trim() || gameEnded || loading) return;
    const argument = input.trim();
    setLogs(p => [...p, { sender: 'player', text: argument }]);
    setLoading(true);
    setInput('');

    try {
      const res  = await fetch(`${API}/api/battle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userArgument: argument, user_id: user?.user_id ?? null, won_battle: null }),
      });
      const data = await res.json();

      let newBossHp   = bossHp;
      let newPlayerHp = playerHp;

      if (data.boss_damage > 0) {
        newBossHp = Math.max(0, bossHp - data.boss_damage);
        setBossHp(newBossHp);
        setVisualState('hit');
        setTimeout(() => setVisualState(newBossHp > 0 ? 'attack' : 'dead'), 600);
        setTimeout(() => { if (newBossHp > 0) setVisualState('idle'); }, 1400);
      }
      if (data.player_damage > 0) {
        newPlayerHp = Math.max(0, playerHp - data.player_damage);
        setPlayerHp(newPlayerHp);
        if (data.boss_damage === 0) {
          setVisualState('attack');
          setTimeout(() => setVisualState('idle'), 800);
        }
      }

      // Update personality
      setPersonality(prev => updatePersonality(prev, {
        toulmin: data.toulmin_score,
        isCritical: data.critical_hit,
        fallacy: data.fallacy_detected,
        bossDamage: data.boss_damage,
      }));

      setLogs(p => [...p, {
        sender: 'boss', text: data.reply,
        boss_damage: data.boss_damage, player_damage: data.player_damage,
        feedback: data.feedback, isCritical: data.critical_hit,
        fallacy: data.fallacy_detected, toulmin: data.toulmin_score,
        new_title: data.new_title,
      }]);

      if (data.new_title && user) { setUser(u => ({ ...u, title: data.new_title })); fetchRanking(); }

      if ((newBossHp <= 0 || newPlayerHp <= 0) && user?.user_id) {
        fetch(`${API}/api/battle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userArgument: '_result_', user_id: user.user_id, won_battle: newBossHp <= 0 }),
        }).then(() => fetchRanking()).catch(() => {});
      }
    } catch {
      setLogs(p => [...p, { sender: 'boss', text: 'ERRO DE CONEXÃO. Verifique o servidor.', boss_damage: 0, player_damage: 0, feedback: '', isCritical: false }]);
    } finally { setLoading(false); }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAttack(); } };

  const bossStatusMap = {
    idle:   { label: 'OPERACIONAL',     icon: Activity },
    hit:    { label: 'DANO DETECTADO',  icon: AlertTriangle },
    attack: { label: 'CONTRA-ATAQUE',   icon: Swords },
    dead:   { label: 'SISTEMA OFFLINE', icon: ShieldCheck },
  };
  const playerPips = useMemo(
    () => Array.from({ length: 10 }, (_, i) => i < Math.ceil(playerHp / 10)),
    [playerHp]
  );
  const pipColor = useMemo(
    () => playerHp > 50 ? 'var(--ice)' : playerHp > 25 ? '#ff9900' : 'var(--crimson)',
    [playerHp]
  );
  const bossStatus = bossStatusMap[visualState] || bossStatusMap.idle;
  const StatusIcon = bossStatus.icon;

  /* ── Intro ─────────────────────────────────────────────────── */
  if (screen === 'intro') return (
    <>
      <IntroScreen onStart={() => setScreen('auth')} onHowToPlay={() => setShowHowToPlay(true)} />
      {showHowToPlay && <HowToPlay onClose={() => setShowHowToPlay(false)} />}
    </>
  );

  if (screen === 'auth') return (
    <>
      <AuthModal onLogin={handleLogin} onGuest={handleGuest} onHowToPlay={() => setShowHowToPlay(true)} />
      {showHowToPlay && <HowToPlay onClose={() => setShowHowToPlay(false)} />}
    </>
  );

  /* ── Game ──────────────────────────────────────────────────── */
  return (
    <div className={`arena ${isGameOver ? 'arena-shake' : ''}`}>
      <div className="arena-bg-grid" />
      <Particles />

      {showHowToPlay && <HowToPlay onClose={() => setShowHowToPlay(false)} />}
      {showReport && reportData && (
        <BattleReport report={reportData} onClose={() => setShowReport(false)} onRestart={() => { setShowReport(false); handleRestart(); }} />
      )}

      {/* Header */}
      <header className="arena-header">
        <div className="arena-brand">
          <div className="brand-mark"><Cpu size={20} strokeWidth={1.8} /></div>
          <div className="brand-text">
            <span className="arena-logo">CHATBOSS</span>
            <span className="arena-ver">MECHA-LOGIC · v7.0</span>
          </div>
        </div>
        <div className="arena-user">
          {user ? (
            <div className="user-chip">
              <div className="user-avatar"><User size={14} strokeWidth={2} /></div>
              <div className="user-meta">
                <span className="hdr-name">{user.username}</span>
                <span className="hdr-title"><Award size={10} />{user.title}</span>
              </div>
            </div>
          ) : (
            <div className="user-chip user-chip-guest">
              <div className="user-avatar"><Bot size={14} strokeWidth={2} /></div>
              <span className="hdr-guest">Visitante</span>
            </div>
          )}
        </div>
        <button className="btn-hdr" onClick={() => setShowHowToPlay(true)}>
          <BookOpen size={13} strokeWidth={2} /> <span>Guia</span>
        </button>
        {reportData && (
          <button className="btn-hdr btn-hdr-accent" onClick={() => setShowReport(true)}>
            <Sparkles size={13} strokeWidth={2} /> <span>Relatório</span>
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
                {user?.title && <span className="player-title-badge"><Award size={10} />{user.title}</span>}
              </div>
              <div className="player-right">
                <span className="player-int-label">INTEGRIDADE</span>
                <span className="player-int-val" style={{ color: pipColor }}>{playerHp}%</span>
              </div>
            </div>
            <div className="pip-row">
              {playerPips.map((full, i) => (
                <div key={i} className={`pip ${full ? 'pip-full' : 'pip-empty'}`}
                     style={full ? { '--pip-color': pipColor } : {}} />
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="chat-log">
            {logs.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty-icon"><Swords size={48} strokeWidth={1.2} /></div>
                <p className="chat-empty-text">Apresente seu primeiro argumento para iniciar o duelo</p>
                <p className="chat-empty-hint">Escolha um tema na barra lateral ou escreva seu próprio argumento</p>
              </div>
            )}

            {logs.map((msg, i) => (
              <div key={i} className={`msg msg-${msg.sender}`}>
                <div className="msg-sender-tag">
                  {msg.sender === 'player'
                    ? <><User size={11} strokeWidth={2.5} /> {user?.username ?? 'VOCÊ'}</>
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
                    {msg.fallacy && (
                      <div className="fallacy-chip">
                        <AlertTriangle size={13} />
                        <span>Falácia: <strong>{msg.fallacy}</strong></span>
                      </div>
                    )}
                    {msg.toulmin && (
                      <div className="toulmin-panel">
                        <span className="toulmin-title"><BarChart3 size={10} /> ANÁLISE TOULMIN</span>
                        {['claim', 'data', 'warrant'].map(k => (
                          <div key={k} className="tbar-row">
                            <span className="tbar-label">{k}</span>
                            <div className="tbar-track">
                              <div className="tbar-fill" style={{
                                width: `${(msg.toulmin[k] / 3) * 100}%`,
                                background: msg.toulmin[k] >= 2 ? 'var(--acid)' : msg.toulmin[k] === 1 ? '#ff9900' : 'var(--crimson)',
                              }} />
                            </div>
                            <span className="tbar-val">{msg.toulmin[k]}/3</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.feedback  && <p className="msg-feedback">{msg.feedback}</p>}
                    {msg.new_title && (
                      <p className="title-up"><Award size={13} /> Novo título: <strong>{msg.new_title}</strong></p>
                    )}
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

            {isVictory  && <div className="end-banner victory-banner"><Trophy size={18} strokeWidth={1.8} /> VITÓRIA LÓGICA — MECHA-LOGIC foi derrotado</div>}
            {isGameOver && <div className="end-banner defeat-banner"><HeartCrack size={18} strokeWidth={1.8} /> GAME OVER — Sua lógica falhou</div>}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="input-zone">
            <div className="input-wrap">
              <span className="input-prompt"><ChevronRight size={14} strokeWidth={2.5} /></span>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={gameEnded ? 'Duelo encerrado.' : 'Apresente seu argumento... (Enter para enviar)'}
                disabled={gameEnded || loading}
                rows={2}
              />
            </div>
            <div className="input-btns">
              <button className="btn-fire" onClick={handleAttack} disabled={gameEnded || loading || !input.trim()}>
                {loading ? <Loader2 size={16} className="spin" /> : <><Zap size={14} strokeWidth={2.5} /> ATACAR</>}
              </button>
              {gameEnded && (
                <button className="btn-restart" onClick={handleRestart}>
                  <RotateCcw size={12} /> Novo Duelo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ════ SIDEBAR ════ */}
        <aside className="arena-sidebar">

          {/* Personality Panel — LIVE TRACKING */}
          <div className="sidebar-panel personality-panel">
            <div className="panel-header">
              <span className="panel-icon"><Sparkles size={16} strokeWidth={2} /></span>
              <span className="panel-title">PERSONALIDADE</span>
              <span className="panel-badge">{personality.total_turns} TURNOS</span>
            </div>
            <p className="personality-hint">
              Sua argumentação molda 5 arquétipos em tempo real
            </p>
            <div className="personality-bars-mini">
              {Object.values(ARCHETYPES).map(a => {
                const Icon = ARCHETYPE_ICONS[a.key];
                const value = normalized[a.key];
                return (
                  <div key={a.key} className="pmini-row" style={{ '--bar-color': a.color }}>
                    <div className="pmini-head">
                      <Icon size={12} strokeWidth={2} />
                      <span className="pmini-name">{a.name}</span>
                      <span className="pmini-val">{value}</span>
                    </div>
                    <div className="pmini-track">
                      <div className="pmini-fill" style={{ width: `${value}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ranking */}
          <div className="sidebar-panel">
            <div className="panel-header">
              <span className="panel-icon"><Trophy size={16} strokeWidth={2} /></span>
              <span className="panel-title">RANKING GLOBAL</span>
              <button className="panel-refresh" onClick={fetchRanking} title="Atualizar">
                <RefreshCw size={13} className={rankingLoading ? 'spin' : ''} />
              </button>
            </div>
            {rankingLoading && rankingData.length === 0 && <p className="sidebar-empty">Carregando…</p>}
            {!rankingLoading && rankingData.length === 0 && <p className="sidebar-empty">Sem dados ainda.<br />Seja o primeiro!</p>}
            <ul className="rank-list">
              {rankingData.map((row, i) => (
                <li key={row.username} className={`rank-item ${row.username === user?.username ? 'rank-me' : ''}`}>
                  <span className={`rank-medal rank-medal-${i + 1}`}>{i < 3 ? <Trophy size={12} /> : `#${i + 1}`}</span>
                  <div className="rank-info">
                    <span className="rank-name">{row.username}</span>
                    <span className="rank-badge">{row.title}</span>
                  </div>
                  <div className="rank-score">
                    <span className="rank-dmg">{row.total_boss_damage}</span>
                    <span className="rank-wr">{row.win_rate}%</span>
                  </div>
                </li>
              ))}
            </ul>
            {rankingData.length > 0 && <div className="rank-legend"><span>DMG</span><span>WIN%</span></div>}
          </div>

          {/* Stats */}
          {user && (
            <div className="sidebar-panel">
              <div className="panel-header">
                <span className="panel-icon"><BarChart3 size={16} strokeWidth={2} /></span>
                <span className="panel-title">SUAS STATS</span>
              </div>
              <div className="stats-grid">
                <div className="stat-cell"><span className="stat-val">{user.stats?.total_battles ?? 0}</span><span className="stat-label">Batalhas</span></div>
                <div className="stat-cell"><span className="stat-val">{user.stats?.total_wins ?? 0}</span><span className="stat-label">Vitórias</span></div>
                <div className="stat-cell"><span className="stat-val">{user.stats?.total_boss_damage ?? 0}</span><span className="stat-label">Dano Total</span></div>
                <div className="stat-cell"><span className="stat-val">{user.stats?.total_criticals ?? 0}</span><span className="stat-label">Críticos</span></div>
              </div>
              <div className="stat-title-display">
                <span className="stat-title-label"><Award size={11} /> TÍTULO ATUAL</span>
                <span className="stat-title-val">{user.title}</span>
              </div>
            </div>
          )}

          {/* Topics */}
          <div className="sidebar-panel topics-panel">
            <div className="panel-header">
              <span className="panel-icon"><Target size={16} strokeWidth={2} /></span>
              <span className="panel-title">TEMAS</span>
            </div>
            <p className="topics-hint">Escolha um tema para receber argumentos iniciais.</p>
            <div className="topics-grid">
              {TOPICS.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    className={`topic-btn ${activeTopic === t.id ? 'topic-active' : ''}`}
                    onClick={() => setActiveTopic(activeTopic === t.id ? null : t.id)}
                    disabled={gameEnded}
                  >
                    <Icon size={18} strokeWidth={1.8} className="topic-icon" />
                    <span className="topic-label">{t.label}</span>
                  </button>
                );
              })}
            </div>
            {activeTopic && (() => {
              const topic = TOPICS.find(t => t.id === activeTopic);
              if (!topic) return null;
              const Icon = topic.icon;
              return (
                <div className="topic-prompts">
                  <p className="prompts-header"><Icon size={13} /> {topic.label}</p>
                  {topic.prompts.map((p, i) => (
                    <button key={i} className="prompt-btn" onClick={() => usePrompt(p)}>
                      <span className="prompt-num">{i + 1}</span>
                      <span className="prompt-text">{p}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Hint */}
          <div className="sidebar-hint" onClick={() => setShowHowToPlay(true)}>
            <span className="hint-icon"><GraduationCap size={20} strokeWidth={1.6} /></span>
            <div>
              <p className="hint-title">Guia de Argumentação</p>
              <p className="hint-sub">Toulmin · Falácias · Estratégias</p>
            </div>
            <ChevronRight size={14} className="hint-chev" />
          </div>
        </aside>
      </div>
    </div>
  );
}
