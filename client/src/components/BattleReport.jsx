import { Trophy, Skull, X, AlertTriangle, Target, TrendingUp, Brain, FlaskConical, Crosshair, Zap, BarChart3, Bot, Sparkles, Cpu, Heart } from 'lucide-react';
import { ARCHETYPES } from '../lib/personality';

const ARCHETYPE_ICONS = {
  logician:   Brain,
  empirical:  FlaskConical,
  rhetorical: Target,
  aggressive: Crosshair,
  chaotic:    Zap,
};

export default function BattleReport({ report, onClose, onRestart }) {
  const { archetype, norm, avgWarrant, avgData, avgClaim, turns, critical_hits, weaknesses, fallacies, won, bossHp = 0, playerHp = 0 } = report;
  const mechaQuote = won ? archetype.winQuote : archetype.lossQuote;

  return (
    <div className="modal-overlay report-overlay">
      <div className="modal-box report-box">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>

        {/* Resultado do experimento de 9 rodadas */}
        <div className={`report-hero ${won ? 'hero-win' : 'hero-loss'}`}>
          <div className="hero-bg" />
          <div className="hero-icon">
            {won ? <Trophy size={36} strokeWidth={1.5} /> : <Skull size={36} strokeWidth={1.5} />}
          </div>
          <h2 className="hero-title">{won ? 'SUPREMACIA LÓGICA' : 'RESISTÊNCIA DA MÁQUINA'}</h2>
          <p className="hero-sub">9 rodadas concluídas — {won ? 'você terminou com mais integridade que o MECHA-LOGIC.' : 'o MECHA-LOGIC resistiu com mais integridade que você.'}</p>
        </div>

        {/* Perfil de Combate — saldo final de HP (cosmético/performance) */}
        <div className="combat-profile">
          <span className="section-eyebrow"><Heart size={11} /> PERFIL DE COMBATE · SALDO FINAL</span>
          <div className="combat-bars">
            <div className="combat-bar-row">
              <span className="combat-bar-name"><Cpu size={12} /> MECHA-LOGIC</span>
              <div className="combat-bar-track"><div className="combat-bar-fill combat-fill-boss" style={{ width: `${Math.max(0, bossHp)}%` }} /></div>
              <span className="combat-bar-val">{Math.max(0, bossHp)}</span>
            </div>
            <div className="combat-bar-row">
              <span className="combat-bar-name"><Target size={12} /> VOCÊ</span>
              <div className="combat-bar-track"><div className="combat-bar-fill combat-fill-player" style={{ width: `${Math.max(0, playerHp)}%` }} /></div>
              <span className="combat-bar-val">{Math.max(0, playerHp)}</span>
            </div>
          </div>
        </div>

        {/* Card de personalidade — destaque principal */}
        <div className="archetype-card" style={{ '--arch-color': archetype.color }}>
          <div className="archetype-card-glow" />
          <div className="archetype-card-top">
            <span className="archetype-eyebrow"><Sparkles size={11} /> SEU ESTILO ARGUMENTATIVO</span>
            <div className="archetype-main">
              <span className="archetype-emoji">{archetype.emoji}</span>
              <div className="archetype-info">
                <h3 className="archetype-name">{archetype.name}</h3>
                <p className="archetype-trait">{archetype.trait}</p>
              </div>
            </div>
            <p className="archetype-desc">{archetype.description}</p>
          </div>

          {/* Frase do MECHA-LOGIC */}
          <div className="mecha-verdict">
            <div className="mecha-verdict-head">
              <Bot size={13} strokeWidth={2} />
              <span>MECHA-LOGIC diz:</span>
            </div>
            <p className="mecha-verdict-text">"{mechaQuote}"</p>
          </div>

          {/* Distribuição de traços — minigráfico */}
          <div className="archetype-traits-grid">
            {Object.values(ARCHETYPES).map(a => {
              const Icon = ARCHETYPE_ICONS[a.key];
              const v = norm[a.key];
              const isDominant = a.key === archetype.key;
              return (
                <div key={a.key} className={`trait-bar ${isDominant ? 'trait-dominant' : ''}`} style={{ '--bar-color': a.color }}>
                  <div className="trait-bar-head">
                    <Icon size={11} strokeWidth={2} />
                    <span className="trait-bar-name">{a.name.replace('O ', '').replace('A ', '')}</span>
                    <span className="trait-bar-val">{v}%</span>
                  </div>
                  <div className="trait-bar-track">
                    <div className="trait-bar-fill" style={{ width: `${v}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Métricas da batalha */}
        <div className="report-section">
          <span className="section-eyebrow"><BarChart3 size={11} /> MÉTRICAS DA BATALHA</span>
          <div className="metrics-grid">
            <div className="metric-cell"><span className="metric-val">{turns}</span><span className="metric-label">Turnos</span></div>
            <div className="metric-cell"><span className="metric-val">{critical_hits}</span><span className="metric-label">Críticos</span></div>
            <div className="metric-cell"><span className="metric-val">{avgClaim}<span className="metric-max">/3</span></span><span className="metric-label">Tese</span></div>
            <div className="metric-cell"><span className="metric-val">{avgData}<span className="metric-max">/3</span></span><span className="metric-label">Dados</span></div>
            <div className="metric-cell"><span className="metric-val">{avgWarrant}<span className="metric-max">/3</span></span><span className="metric-label">Garantia</span></div>
            <div className="metric-cell"><span className="metric-val">{fallacies.reduce((s, [, n]) => s + n, 0)}</span><span className="metric-label">Falácias</span></div>
          </div>
        </div>

        {/* Áreas a melhorar */}
        {weaknesses.length > 0 && (
          <div className="report-section">
            <span className="section-eyebrow"><AlertTriangle size={11} /> ÁREAS A DESENVOLVER</span>
            <ul className="insight-list">
              {weaknesses.map((t, i) => <li key={i} className="insight-item insight-warn"><AlertTriangle size={13} />{t}</li>)}
            </ul>
          </div>
        )}

        {/* Falácias cometidas */}
        {fallacies.length > 0 && (
          <div className="report-section">
            <span className="section-eyebrow">FALÁCIAS QUE VOCÊ COMETEU</span>
            <div className="fallacy-list">
              {fallacies.map(([name, count]) => (
                <div key={name} className="fallacy-tag">
                  <span>{name}</span>
                  <span className="fallacy-count">×{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pontos fortes (Toulmin) */}
        {(avgWarrant >= 2 || avgData >= 2 || avgClaim >= 2) && (
          <div className="report-section">
            <span className="section-eyebrow"><TrendingUp size={11} /> PONTOS FORTES</span>
            <ul className="insight-list">
              {avgWarrant >= 2 && <li className="insight-item insight-good"><TrendingUp size={13} />Suas garantias lógicas foram sólidas — você conectou dado à tese com coerência.</li>}
              {avgData >= 2 && <li className="insight-item insight-good"><TrendingUp size={13} />Você trouxe evidências reais. Isso separa argumento de opinião.</li>}
              {avgClaim >= 2 && <li className="insight-item insight-good"><TrendingUp size={13} />Suas teses foram claras e delimitadas desde o início.</li>}
            </ul>
          </div>
        )}

        <div className="report-actions">
          <button className="btn-primary" onClick={onRestart}>Novo Duelo</button>
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
