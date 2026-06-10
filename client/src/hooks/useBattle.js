import { useState, useEffect, useRef, useCallback } from 'react';
import { initPersonality, updatePersonality, generateReport } from '../lib/personality';

const API = '';

// Sistema de turnos fixos: Fase 1 (3) + Fase 2 (3) + Fase 3 (2) = 8 turnos.
// HP é puramente cosmético — o fim é decidido pelo contador de turnos.
const TOTAL_TURNS = 8;
// Fase de cada turno (1-indexado): 1-3 → Fase 1, 4-6 → Fase 2, 7-8 → Fase 3.
const phaseForTurn = (turn) => (turn <= 3 ? 1 : turn <= 6 ? 2 : 3);
// Round dentro da Fase 3 (1 ou 2). turn 7 → round 1 (posturas), turn 8 → round 2 (texto livre).
const phase3RoundForTurn = (turn) => Math.max(1, turn - 6);

export function useBattle(user, screen) {
  const [bossHp, setBossHp]       = useState(100);
  const [playerHp, setPlayerHp]   = useState(100);
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [visualState, setVisualState] = useState('idle');
  // Impacto físico: tremor de tela em crítico ou dano severo no jogador.
  const [screenShake, setScreenShake] = useState(false);

  const [gamePhase, setGamePhase]           = useState(1);
  const [bossAttack, setBossAttack]         = useState(null);
  const [bossAttacking, setBossAttacking]   = useState(false);
  const [showPhaseIntro, setShowPhaseIntro] = useState(false);
  const [pendingPhase, setPendingPhase]     = useState(null);
  const [phaseTransitioning, setPhaseTransitioning] = useState(false);

  // Contador rígido de rodadas (1..9). Define fase e fim de jogo.
  const [turnCount, setTurnCount] = useState(0);

  // Ficha de Falácia (modal): aparece após o turno e BLOQUEIA o próximo ataque
  // até o jogador clicar "Entendi". { name, outcome }.
  const [pendingFallacy, setPendingFallacy] = useState(null);
  // Ação adiada até o jogador fechar a ficha (próximo ataque / transição de fase).
  const afterFallacyRef = useRef(null);

  // Tema do debate escolhido na ThemeSelection
  const [theme, setTheme] = useState(null);

  const [personality, setPersonality]   = useState(initPersonality);
  const [showReport, setShowReport]     = useState(false);
  const [reportData, setReportData]     = useState(null);

  const turnStartRef = useRef(Date.now());

  // Round atual da Fase 3 (1 ou 2) para o PRÓXIMO turno a ser jogado.
  const phase3Round = gamePhase === 3 ? phase3RoundForTurn(turnCount + 1) : 0;

  // Fim de jogo é DECIDIDO PELOS TURNOS, não pelo HP (que é cosmético).
  const gameEnded  = turnCount >= TOTAL_TURNS;
  // Vitória = saldo final de HP a favor do jogador (métrica de performance).
  const isVictory  = gameEnded && bossHp < playerHp;
  const isGameOver = gameEnded && !isVictory;

  // ── Boss ataca primeiro ao entrar em cada fase ──────────────────────────────
  // `turn` (0..8) define qual dos 3 ataques pré-gerados da fase será servido (idx = turn % 3).
  const fetchBossAttack = useCallback(async (phase, currentTheme, turn = 0) => {
    setBossAttacking(true);
    setBossAttack(null);
    try {
      const themeId = currentTheme?.id ?? '';
      const uid = user?.user_id ? `&user_id=${user.user_id}` : '';
      const r = await fetch(`${API}/api/battle/boss-attack?phase=${phase}&theme=${encodeURIComponent(themeId)}&turn=${turn}${uid}`);
      const data = await r.json();
      setBossAttack(data);
      setLogs(p => [...p, {
        sender: 'boss', text: data.text,
        boss_damage: 0, player_damage: 0,
        feedback: '', isCritical: false, isBossOpening: true,
      }]);
    } catch {
      setBossAttack({ text: 'ERRO DE COMUNICAÇÃO. Boss temporariamente offline.', phase });
    } finally {
      setBossAttacking(false);
      turnStartRef.current = Date.now();
    }
  }, [user]);

  // Dispara ataque do boss quando entra no jogo ou muda de fase.
  // turnCount no momento da entrada da fase já está no início dela (idx = turnCount % 3 = 0).
  useEffect(() => {
    if (screen === 'game' && theme && !phaseTransitioning) {
      fetchBossAttack(gamePhase, theme, turnCount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, gamePhase, theme]);

  // ── Gera relatório ao fim dos 9 turnos ──────────────────────────────────────
  useEffect(() => {
    if (gameEnded && !showReport && !reportData) {
      const report = generateReport(personality, isVictory);
      // Saldo final de HP entra como "Perfil de Combate" (métrica de performance).
      report.bossHp = bossHp;
      report.playerHp = playerHp;
      setReportData(report);
      setTimeout(() => setShowReport(true), 1200);
    }
  }, [gameEnded, showReport, reportData, personality, isVictory, bossHp, playerHp]);

  // ── Ataque do jogador ────────────────────────────────────────────────────────
  const handleAttack = useCallback(async (cardPlay = null, inputText = '') => {
    const argument = (cardPlay?.text ?? inputText).trim();
    const cardType = cardPlay?.cardType ?? null;
    if (!argument || gameEnded || loading || bossAttacking || phaseTransitioning || pendingFallacy) return false;

    const responseTimeMs = Math.max(0, Date.now() - turnStartRef.current);

    setLogs(p => [...p, { sender: 'player', text: argument, cardType }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/battle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userArgument:    argument,
          user_id:         user?.user_id ?? null,
          cardType,
          selected_logic:     cardPlay?.selected_logic     ?? null,
          selected_target:    cardPlay?.selected_target    ?? null,
          correct_fallacy:    cardPlay?.correct_fallacy    ?? null,
          selected_option_id: cardPlay?.selected_option_id ?? null,
          responseTimeMs,
          game_phase:      gamePhase,
          theme_id:        theme?.id ?? null,
          theme_text:      theme?.label ?? null,
        }),
      });
      const data = await res.json();

      // HP vem do servidor — fonte de verdade
      const newBossHp   = data.boss_hp   ?? Math.max(0, bossHp   - (data.boss_damage   ?? 0));
      const newPlayerHp = data.player_hp ?? Math.max(0, playerHp - (data.player_damage ?? 0));

      setBossHp(newBossHp);
      setPlayerHp(newPlayerHp);

      // Feedback visual do Boss
      if (data.boss_damage > 0) {
        setVisualState('hit');
        setTimeout(() => setVisualState(newBossHp > 0 ? 'attack' : 'dead'), 600);
        setTimeout(() => { if (newBossHp > 0) setVisualState('idle'); }, 1400);
      } else if (data.player_damage > 0) {
        setVisualState('attack');
        setTimeout(() => setVisualState('idle'), 800);
      }

      // Impacto físico (screen shake): crítico do jogador ou dano severo recebido.
      if (data.critical_hit || data.player_damage >= 15) {
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 450);
      }

      setPersonality(prev => updatePersonality(prev, {
        toulmin:    data.toulmin_score,
        isCritical: data.critical_hit,
        fallacy:    data.fallacy_detected,
        bossDamage: data.boss_damage,
      }));

      setLogs(p => [...p, {
        sender: 'boss', text: data.reply,
        boss_damage: data.boss_damage, player_damage: data.player_damage,
        feedback: data.feedback, isCritical: data.critical_hit,
        fallacy: data.fallacy_detected, toulmin: data.toulmin_score,
        new_title: data.new_title,
      }]);

      // ── Máquina de estados por TURNOS FIXOS (HP é cosmético) ───────────────
      // O turno acabou de ser consumido. Calcula o próximo turno (1..9).
      const newTurn   = turnCount + 1;
      setTurnCount(newTurn);

      const curPhase  = phaseForTurn(newTurn);          // fase do turno recém-consumido
      const nextPhase = phaseForTurn(newTurn + 1);      // fase do próximo turno
      const isLastTurn = newTurn >= TOTAL_TURNS;

      // Define a ação que acontece DEPOIS de o jogador fechar a Ficha de Falácia.
      const proceed = () => {
        if (isLastTurn) {
          // 9º turno → fim (BattleReport via useEffect de gameEnded). Nada a agendar.
        } else if (nextPhase > curPhase) {
          setPhaseTransitioning(true);
          setPendingPhase(nextPhase);
          setTimeout(() => setShowPhaseIntro(true), 600);
        } else if (curPhase === 1 || curPhase === 2) {
          // Fases 1 e 2 servem um novo ataque pré-gerado por turno (idx = newTurn % 3).
          setTimeout(() => fetchBossAttack(curPhase, theme, newTurn), 200);
        } else {
          turnStartRef.current = Date.now();
        }
      };

      // Ficha de Falácia: aparece quando há uma falácia nomeada no turno.
      // Fase 1: gabarito (correct_fallacy) + acerto/erro. Fase 2/3: fallacy_detected.
      const f1Fallacy = curPhase === 1 ? (cardPlay?.correct_fallacy ?? null) : null;
      const fallacyName = f1Fallacy || data.fallacy_detected || null;

      if (fallacyName) {
        const outcome = curPhase === 1
          ? (data.play_valid ? 'hit' : 'miss')   // F1: acertou a identificação?
          : 'info';                              // F2/3: ficha informativa
        afterFallacyRef.current = proceed;       // adia o avanço até fechar a ficha
        // Pequeno delay para a ficha entrar depois do feedback do Boss aparecer.
        setTimeout(() => setPendingFallacy({ name: fallacyName, outcome }), 650);
      } else {
        proceed();                               // sem falácia → segue direto
      }

      return { turn: newTurn, ended: isLastTurn };
    } catch {
      setLogs(p => [...p, {
        sender: 'boss', text: 'ERRO DE CONEXÃO. Verifique o servidor.',
        boss_damage: 0, player_damage: 0, feedback: '', isCritical: false,
      }]);
      return false;
    } finally {
      setLoading(false);
    }
  }, [gameEnded, loading, bossAttacking, phaseTransitioning, pendingFallacy, turnCount, gamePhase, bossHp, playerHp, user, theme, fetchBossAttack]);

  // ── Continuar após tela de transição de fase ────────────────────────────────
  const handlePhaseIntroContinue = useCallback(() => {
    setShowPhaseIntro(false);
    if (pendingPhase) {
      setGamePhase(pendingPhase);
      setPendingPhase(null);
      setBossAttack(null);
      setPhaseTransitioning(false);
    }
  }, [pendingPhase]);

  // ── Fechar a Ficha de Falácia e executar a ação adiada (próximo turno/fase) ──
  const dismissFallacy = useCallback(() => {
    setPendingFallacy(null);
    const next = afterFallacyRef.current;
    afterFallacyRef.current = null;
    if (next) next();
  }, []);

  // ── Selecionar tema (disparado pela ThemeSelection) ─────────────────────────
  const handleThemeSelect = useCallback((selectedTheme) => {
    setTheme(selectedTheme);
  }, []);

  // ── Reiniciar jogo ───────────────────────────────────────────────────────────
  const handleRestart = useCallback(async () => {
    if (user?.user_id) {
      try {
        await fetch(`${API}/api/session/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.user_id }),
        });
      } catch { /* fallback silencioso */ }
    }
    setBossHp(100);
    setPlayerHp(100);
    setLogs([]);
    setVisualState('idle');
    setPersonality(initPersonality());
    setShowReport(false);
    setReportData(null);
    setGamePhase(1);
    setBossAttack(null);
    setPhaseTransitioning(false);
    setPendingPhase(null);
    setTurnCount(0);
    setPendingFallacy(null);
    afterFallacyRef.current = null;
    setTheme(null); // Volta para seleção de tema
    turnStartRef.current = Date.now();
  }, [user]);

  return {
    // Estado
    bossHp, playerHp, logs, loading, visualState, screenShake,
    gamePhase, bossAttack, bossAttacking,
    showPhaseIntro, pendingPhase, phaseTransitioning,
    showReport, reportData,
    isGameOver, isVictory, gameEnded,
    turnCount, totalTurns: TOTAL_TURNS,
    phase3Round,
    pendingFallacy,
    theme,
    // Ações
    handleAttack, handlePhaseIntroContinue, handleRestart, handleThemeSelect,
    dismissFallacy,
    fetchBossAttack,
    setShowReport,
  };
}
