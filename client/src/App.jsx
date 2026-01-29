// client/src/App.jsx
import { useState, useEffect, useRef } from 'react';
import './App.css';

const BOSS_IMG_SRC = "/assets/boss-mecha.png";

function App() {
  const [bossHp, setBossHp] = useState(100);
  const [playerHp, setPlayerHp] = useState(100);
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visualState, setVisualState] = useState('idle');
  const chatEndRef = useRef(null);

  const isGameOver = playerHp <= 0;
  const isVictory = bossHp <= 0;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, loading]);

  useEffect(() => {
    if (isVictory) setVisualState('dead');
  }, [isVictory]);

  const handleAttack = async () => {
    if (!input.trim() || isGameOver || isVictory) return;

    setLogs(prev => [...prev, { sender: 'player', text: input }]);
    setLoading(true);
    const originalInput = input;
    setInput('');

    try {
      const response = await fetch('${apiUrl}/api/battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userArgument: originalInput })
      });

      const data = await response.json();

      if (data.boss_damage > 0) {
        setBossHp(prev => Math.max(0, prev - data.boss_damage));
        setVisualState('hit');
        setTimeout(() => { if (bossHp > 0) setVisualState('attack'); }, 600);
      } else {
        setVisualState('attack');
      }

      if (data.player_damage > 0) {
        setPlayerHp(prev => Math.max(0, prev - data.player_damage));
      }

      setLogs(prev => [...prev, { 
        sender: 'boss', 
        text: data.reply, 
        boss_damage: data.boss_damage,
        player_damage: data.player_damage,
        feedback: data.feedback,
        isCritical: data.critical_hit
      }]);

      setTimeout(() => {
        if (!isVictory && !isGameOver) setVisualState('idle');
      }, 2000);

    } catch (error) {
      console.error(error);
      setLogs(prev => [...prev, { sender: 'boss', text: "ERRO DE CONEXÃO..." }]);
      setVisualState('idle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`game-container ${isGameOver ? 'shake-screen' : ''}`}>
      
      {/* === ÁREA DO BOSS (Centralizada e Maior) === */}
      <div className="boss-stage">
        <img 
          src={BOSS_IMG_SRC} 
          alt="Mecha Boss" 
          className={`boss-img ${visualState}`}
          onError={(e) => { e.target.style.display='none'; }}
        />
        
        <div className="boss-stats">
          <h2 style={{fontSize: '0.9rem', marginBottom: '5px'}}>MECHA-LOGIC</h2>
          
          <div className="hp-bar-container">
            <div className="hp-bar-fill" style={{ width: `${bossHp}%` }}></div>
          </div>
          {/* TEXTO DE VIDA DO BOSS ADICIONADO AQUI */}
          <div className="hp-text">HP: {bossHp} / 100</div>
        </div>
      </div>

      {/* === HUD DO JOGADOR (Centralizado) === */}
      <div className="player-hud">
        {/* TEXTO DE VIDA DO JOGADOR ADICIONADO AQUI */}
        <span>SUA INTEGRIDADE LÓGICA: {playerHp}%</span>
        
        <div className="life-pip-container">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className={`life-pip ${playerHp > i * 10 ? 'full' : 'empty'}`}></div>
          ))}
        </div>
      </div>

      {/* === CHAT === */}
      <div className="chat-log">
        {logs.map((log, index) => (
          <div key={index} className={`message ${log.sender}`}>
            <p>{log.text}</p>
            {log.boss_damage > 0 && <span className="dmg-tag win">🔥 CRÍTICO! Boss perdeu -{log.boss_damage}</span>}
            {log.player_damage > 0 && <span className="dmg-tag lose">💔 ERRO! Você perdeu -{log.player_damage}</span>}
            {log.feedback && <div className="feedback-mini">ANÁLISE: {log.feedback}</div>}
          </div>
        ))}
        {loading && <p style={{color: '#888', textAlign: 'center'}}>⚡ Processando resposta...</p>}
        
        {isVictory && <div style={{color: 'gold', textAlign: 'center', marginTop: '20px', fontSize: '1.2rem'}}>🏆 VITÓRIA LÓGICA!</div>}
        {isGameOver && <div style={{color: 'red', textAlign: 'center', marginTop: '20px', fontSize: '1.2rem'}}>💀 GAME OVER</div>}
        
        <div ref={chatEndRef} />
      </div>

      {/* === INPUT === */}
      <div className="input-box">
        <textarea 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isGameOver ? "Reinicie a página..." : "Insira seu argumento..."}
          disabled={isGameOver || isVictory || loading}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAttack())}
        />
        <button onClick={handleAttack} disabled={loading || isGameOver || isVictory}>ENVIAR</button>
      </div>
    </div>
  );
}

export default App;